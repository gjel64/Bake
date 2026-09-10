/**
 * calendars.ts — les abonnements à des agendas externes (liens .ics).
 *
 * Ce module fait le pont entre le réseau, le parseur (`lib/ics.ts`) et la base :
 * il télécharge le fichier d'un abonnement, le lit, et remplace d'un bloc les
 * événements que cet abonnement avait apportés.
 *
 * Comme `lib/notifications.ts`, il n'explose JAMAIS : une erreur réseau est
 * renvoyée sous forme de message à afficher, pas d'exception à attraper. Un
 * abonnement injoignable laisse simplement en place les événements de la
 * dernière synchronisation réussie.
 *
 * La synchronisation est rejouée à chaque retour sur l'agenda — au plus une
 * fois toutes les `MIN_INTERVAL_MS` — et à la demande depuis les Réglages ; il
 * n'y a pas de tâche de fond.
 */

import {
  CalendarSub,
  ImportedEvent,
  getCalendars,
  replaceCalendarEvents,
} from '@/db/database';
import { parseIcs } from '@/lib/ics';

/** Abandon d'un téléchargement qui traîne (ms). */
const TIMEOUT_MS = 20_000;

/** Intervalle minimal entre deux synchronisations automatiques (ms). */
const MIN_INTERVAL_MS = 5 * 60_000;

/** Horodatage de la dernière synchronisation automatique (0 = jamais). */
let lastAutoSync = 0;

/** Le résultat d'une synchronisation, à montrer dans les Réglages. */
export type SyncResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

/** Idem, avec les événements lus — pour vérifier un lien avant de l'enregistrer. */
export type FetchResult =
  | { ok: true; count: number; events: ImportedEvent[] }
  | { ok: false; error: string };

/**
 * Rend un lien d'abonnement téléchargeable : les agendas partagés sont souvent
 * donnés en `webcal://`, qui n'est qu'un `https://` déguisé.
 */
export function normalizeIcsUrl(url: string): string {
  const trimmed = url.trim();
  if (/^webcal:\/\//i.test(trimmed)) return trimmed.replace(/^webcal:\/\//i, 'https://');
  return trimmed;
}

/**
 * Télécharge un lien .ics et renvoie ses événements SANS rien enregistrer —
 * de quoi vérifier une adresse au moment où l'utilisateur la saisit.
 */
export async function fetchIcs(url: string): Promise<FetchResult> {
  const target = normalizeIcsUrl(url);
  if (!/^https?:\/\//i.test(target)) {
    return { ok: false, error: 'L’adresse doit commencer par https:// ou webcal://' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // `no-cache` est ESSENTIEL : sans lui, le cache HTTP du téléphone peut
    // resservir le fichier de la veille — un événement supprimé à la source
    // resterait alors affiché, sans qu'aucune erreur ne le laisse deviner.
    const res = await fetch(target, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    });
    if (!res.ok) return { ok: false, error: `Le serveur a répondu ${res.status}.` };

    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) {
      return { ok: false, error: 'Ce lien ne renvoie pas un fichier .ics.' };
    }

    const events = parseIcs(text);
    return { ok: true, count: events.length, events };
  } catch (e) {
    // Coupure réseau, DNS, certificat, délai dépassé…
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { ok: false, error: aborted ? 'Le serveur met trop de temps à répondre.' : 'Téléchargement impossible.' };
  } finally {
    clearTimeout(timer);
  }
}

/** Synchronise un abonnement : téléchargement, lecture, puis remplacement en base. */
export async function syncCalendar(cal: CalendarSub): Promise<SyncResult> {
  const result = await fetchIcs(cal.url);
  if (!result.ok) return result;
  replaceCalendarEvents(cal.id, result.events);
  return { ok: true, count: result.count };
}

/**
 * Synchronise tous les abonnements, en parallèle et sans bruit : c'est ce qu'on
 * lance en ouvrant l'agenda. Renvoie le nombre d'abonnements remis à jour.
 *
 * Un garde-fou de `MIN_INTERVAL_MS` évite de retélécharger à chaque aller-retour
 * entre les onglets ; `force` le contourne (bouton « rafraîchir » des Réglages).
 */
export async function syncAllCalendars(force = false): Promise<number> {
  const cals = getCalendars();
  if (cals.length === 0) return 0;
  if (!force && Date.now() - lastAutoSync < MIN_INTERVAL_MS) return 0;
  lastAutoSync = Date.now();

  const results = await Promise.all(cals.map((cal) => syncCalendar(cal)));
  return results.filter((r) => r.ok).length;
}
