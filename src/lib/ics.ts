/**
 * ics.ts — lecture d'un fichier iCalendar (.ics), en fonctions PURES.
 *
 * Objectif : transformer le texte d'un abonnement en une liste d'événements à
 * la convention de l'app — un jour est "YYYY-MM-DD", une heure "HH:MM", le
 * tout en heure LOCALE (voir `@/lib/dates`).
 *
 * Ce qui est géré :
 *  - le dépliage des lignes (une ligne longue est coupée et poursuivie par une
 *    ligne commençant par une espace),
 *  - `VEVENT` : `SUMMARY`, `DTSTART`, `DTEND`, `DURATION`, `UID`,
 *  - les journées entières (`VALUE=DATE`), dont le `DTEND` exclusif de la norme
 *    est ramené au dernier jour réellement occupé,
 *  - la répétition `RRULE` : `FREQ` (DAILY/WEEKLY/MONTHLY/YEARLY), `INTERVAL`,
 *    `COUNT`, `UNTIL`, `BYDAY` (pour les hebdomadaires), et les dates exclues
 *    par `EXDATE`.
 *
 * Ce qui ne l'est PAS, volontairement (un agenda perso n'en a pas besoin, et
 * chaque cas coûterait un vrai moteur de récurrence) :
 *  - les fuseaux : une heure `...Z` est convertie depuis UTC, tout le reste
 *    (y compris un `TZID=`) est pris pour de l'heure locale,
 *  - `BYDAY` positionnel ("2e jeudi du mois"), `BYMONTHDAY`, `BYSETPOS`,
 *  - les occurrences modifiées à l'unité (`RECURRENCE-ID`),
 *  - les fichiers `VTIMEZONE`, `VTODO`, les pièces jointes, les alarmes.
 *
 * Les occurrences ne sont dépliées que sur une FENÊTRE de temps (par défaut un
 * an en arrière, deux ans en avant) : une règle sans fin ne peut donc pas
 * remplir la base indéfiniment.
 */

import { addDays, fromDayKey, toDayKey, toTimeKey, todayKey } from '@/lib/dates';
import type { ImportedEvent } from '@/db/database';

/** Fenêtre dépliée par défaut, en jours, autour d'aujourd'hui. */
const WINDOW_BEFORE = 365;
const WINDOW_AFTER = 730;

/** Garde-fou : au-delà, on considère que la règle de répétition s'emballe. */
const MAX_OCCURRENCES = 400;

/** Une date lue dans le fichier : l'instant, et s'il s'agit d'une journée entière. */
type IcsDate = { at: Date; allDay: boolean };

/** Une propriété d'un VEVENT : sa valeur et ses paramètres (`;VALUE=DATE`…). */
type Prop = { value: string; params: Record<string, string> };

/**
 * Lit un fichier .ics et renvoie ses événements, prêts pour la base.
 * Ne lève jamais : une ligne incompréhensible est simplement ignorée.
 */
export function parseIcs(
  text: string,
  window?: { from?: string; to?: string },
): ImportedEvent[] {
  const from = window?.from ?? addDays(todayKey(), -WINDOW_BEFORE);
  const to = window?.to ?? addDays(todayKey(), WINDOW_AFTER);

  const out: ImportedEvent[] = [];
  for (const block of splitEvents(unfold(text))) {
    try {
      out.push(...expand(block, from, to));
    } catch {
      // Un événement mal formé ne doit pas emporter tout l'abonnement.
    }
  }
  return out;
}

// --- Découpage du fichier --------------------------------------------------

/**
 * Recolle les lignes repliées. La norme coupe les lignes longues et poursuit
 * la suivante par une espace (ou une tabulation) : sans ce recollage, un titre
 * un peu long ressortirait tronqué.
 */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** Isole les blocs VEVENT et range leurs propriétés par nom. */
function splitEvents(lines: string[]): Map<string, Prop[]>[] {
  const blocks: Map<string, Prop[]>[] = [];
  let current: Map<string, Prop[]> | null = null;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = new Map();
      continue;
    }
    if (line.startsWith('END:VEVENT')) {
      if (current) blocks.push(current);
      current = null;
      continue;
    }
    if (!current) continue; // hors VEVENT : en-tête du calendrier, VTIMEZONE…

    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const left = line.slice(0, colon);
    const value = line.slice(colon + 1);

    // "DTSTART;TZID=Europe/Paris" → nom + paramètres
    const [name, ...paramParts] = left.split(';');
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).toUpperCase();
    }

    const key = name.toUpperCase();
    const list = current.get(key) ?? [];
    list.push({ value, params });
    current.set(key, list);
  }
  return blocks;
}

// --- Lecture d'un événement ------------------------------------------------

/** Déplie un VEVENT en une ou plusieurs occurrences, bornées à la fenêtre. */
function expand(block: Map<string, Prop[]>, from: string, to: string): ImportedEvent[] {
  const dtstartProp = block.get('DTSTART')?.[0];
  if (!dtstartProp) return []; // sans début, pas d'événement

  const start = parseDate(dtstartProp);
  if (!start) return [];

  const title = decodeText(block.get('SUMMARY')?.[0]?.value ?? '(sans titre)');

  // Durée : soit DTEND, soit DURATION, sinon 1 h (ou la journée si VALUE=DATE).
  const dtendProp = block.get('DTEND')?.[0];
  const durationProp = block.get('DURATION')?.[0];
  let durationMs: number;
  if (dtendProp) {
    const end = parseDate(dtendProp);
    durationMs = end ? end.at.getTime() - start.at.getTime() : fallbackDuration(start);
  } else if (durationProp) {
    durationMs = parseDuration(durationProp.value) ?? fallbackDuration(start);
  } else {
    durationMs = fallbackDuration(start);
  }
  if (durationMs <= 0) durationMs = fallbackDuration(start);

  // Les dates explicitement retirées de la série.
  const excluded = new Set<number>();
  for (const ex of block.get('EXDATE') ?? []) {
    for (const piece of ex.value.split(',')) {
      const d = parseDate({ value: piece, params: ex.params });
      if (d) excluded.add(d.at.getTime());
    }
  }

  const rrule = block.get('RRULE')?.[0]?.value;
  const starts = rrule
    ? occurrences(start.at, rrule, from, to)
    : [start.at];

  const events: ImportedEvent[] = [];
  for (const at of starts) {
    if (excluded.has(at.getTime())) continue;
    const event = toEvent(title, at, durationMs, start.allDay);
    // Hors fenêtre : on jette (une série sans RRULE peut être très ancienne).
    if (event.end_day < from || event.day > to) continue;
    events.push(event);
  }
  return events;
}

/** Durée par défaut : la journée entière pour une date, une heure sinon. */
function fallbackDuration(start: IcsDate): number {
  return start.allDay ? 86_400_000 : 3_600_000;
}

/** Met une occurrence à la convention de l'app (jours + heures locales). */
function toEvent(title: string, at: Date, durationMs: number, allDay: boolean): ImportedEvent {
  const day = toDayKey(at);
  if (allDay) {
    // DTEND est EXCLUSIF dans la norme : un événement d'un jour va du 3 au 4.
    // On revient donc d'un jour pour obtenir le dernier jour réellement occupé.
    const lastMs = at.getTime() + durationMs - 86_400_000;
    const endDay = toDayKey(new Date(Math.max(lastMs, at.getTime())));
    return { title, day, end_day: endDay, start: '00:00', end: '23:59' };
  }
  const endAt = new Date(at.getTime() + durationMs);
  return {
    title,
    day,
    end_day: toDayKey(endAt),
    start: toTimeKey(at),
    end: toTimeKey(endAt),
  };
}

// --- Dates -----------------------------------------------------------------

/**
 * Lit une date iCalendar : "20260906" (journée entière), "20260906T143000"
 * (heure locale) ou "20260906T123000Z" (UTC, converti en local).
 */
function parseDate(prop: Prop): IcsDate | null {
  const v = prop.value.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, sec, utc] = m;
  const allDay = h === undefined || prop.params.VALUE === 'DATE';

  if (allDay) return { at: new Date(+y, +mo - 1, +d), allDay: true };
  if (utc) {
    return { at: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec)), allDay: false };
  }
  // Heure « flottante » ou TZID : on la prend telle quelle, en local.
  return { at: new Date(+y, +mo - 1, +d, +h, +mi, +sec), allDay: false };
}

/** Lit une durée ISO 8601 ("P1D", "PT1H30M") en millisecondes. */
function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    value.trim().toUpperCase(),
  );
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m;
  const ms =
    (+(w ?? 0) * 7 + +(d ?? 0)) * 86_400_000 +
    +(h ?? 0) * 3_600_000 +
    +(mi ?? 0) * 60_000 +
    +(s ?? 0) * 1000;
  return sign === '-' ? -ms : ms;
}

/** Défait les échappements du format : "\," "\;" "\n" "\\". */
function decodeText(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\([,;\\])/g, '$1')
    .trim();
}

// --- Répétition ------------------------------------------------------------

/** Les jours de la semaine de la norme, dans l'ordre de `Date.getDay()`. */
const BYDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * Déplie une `RRULE` en une liste de dates de début, bornée par la fenêtre,
 * par `COUNT`/`UNTIL` et par `MAX_OCCURRENCES`.
 *
 * L'heure de la première occurrence est conservée telle quelle à chaque
 * répétition : on avance de jour en jour / de mois en mois sur un objet `Date`
 * local, donc un passage à l'heure d'été ne décale pas le rendez-vous.
 */
function occurrences(start: Date, rrule: string, from: string, to: string): Date[] {
  const parts: Record<string, string> = {};
  for (const piece of rrule.split(';')) {
    const eq = piece.indexOf('=');
    if (eq > 0) parts[piece.slice(0, eq).toUpperCase()] = piece.slice(eq + 1).toUpperCase();
  }

  const freq = parts.FREQ;
  if (!freq) return [start];
  const interval = Math.max(1, Number(parts.INTERVAL ?? 1) || 1);
  const count = parts.COUNT ? Number(parts.COUNT) : null;
  const untilDate = parts.UNTIL ? parseDate({ value: parts.UNTIL, params: {} })?.at : null;

  // Les jours retenus dans la semaine (hebdomadaire uniquement) ; un "2TH"
  // positionnel n'est pas géré, on ne garde que le code du jour.
  const byDay = parts.BYDAY
    ? parts.BYDAY.split(',')
        .map((code) => BYDAY_CODES.indexOf(code.replace(/^[+-]?\d+/, '')))
        .filter((i) => i >= 0)
    : [];

  const lastDay = fromDayKey(to);
  lastDay.setHours(23, 59, 59, 0);
  const windowEnd = lastDay.getTime();
  const out: Date[] = [];
  let cursor = new Date(start.getTime());
  let emitted = 0;

  /** Ajoute une date si elle tient dans toutes les bornes. Renvoie false si on doit s'arrêter. */
  function push(at: Date): boolean {
    if (untilDate && at.getTime() > untilDate.getTime()) return false;
    if (at.getTime() > windowEnd) return false;
    if (count !== null && emitted >= count) return false;
    emitted += 1;
    // On ne garde que ce qui touche la fenêtre — mais on continue à compter,
    // car COUNT s'applique à la série entière, pas à la partie visible.
    if (toDayKey(at) >= from) out.push(new Date(at.getTime()));
    return out.length < MAX_OCCURRENCES;
  }

  for (let guard = 0; guard < 5000; guard += 1) {
    if (freq === 'WEEKLY' && byDay.length > 0) {
      // Une semaine à la fois : on émet chaque jour demandé de cette semaine.
      const monday = new Date(cursor.getTime());
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      let stop = false;
      for (const dow of [...byDay].sort()) {
        const at = new Date(monday.getTime());
        at.setDate(monday.getDate() + ((dow + 6) % 7));
        at.setHours(start.getHours(), start.getMinutes(), 0, 0);
        if (at.getTime() < start.getTime()) continue; // avant le début de la série
        if (!push(at)) {
          stop = true;
          break;
        }
      }
      if (stop) break;
      cursor.setDate(cursor.getDate() + 7 * interval);
    } else {
      if (!push(cursor)) break;
      cursor = advance(cursor, freq, interval);
    }
    if (cursor.getTime() > windowEnd) break;
  }

  return out;
}

/** Avance d'un pas de répétition. Une fréquence inconnue arrête la série. */
function advance(at: Date, freq: string, interval: number): Date {
  const next = new Date(at.getTime());
  if (freq === 'DAILY') next.setDate(next.getDate() + interval);
  else if (freq === 'WEEKLY') next.setDate(next.getDate() + 7 * interval);
  else if (freq === 'MONTHLY') next.setMonth(next.getMonth() + interval);
  else if (freq === 'YEARLY') next.setFullYear(next.getFullYear() + interval);
  else next.setFullYear(next.getFullYear() + 100); // inconnue : on sort de la fenêtre
  return next;
}
