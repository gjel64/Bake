/**
 * dates.ts — petites fonctions pures autour des dates.
 *
 * Convention unique dans toute l'app : une date « jour » est une chaîne
 * ISO courte "YYYY-MM-DD". C'est trivialement comparable et stockable en SQL.
 * Une heure est une chaîne "HH:MM".
 *
 * Tout est en heure LOCALE (pas UTC) : "aujourd'hui" doit correspondre au
 * jour affiché sur le téléphone de l'utilisateur.
 */

/** Formatte un objet Date en "YYYY-MM-DD" (heure locale). */
export function toDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Formatte l'heure d'un objet Date en "HH:MM" (heure locale). */
export function toTimeKey(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

/** La clé du jour courant. */
export function todayKey(): string {
  return toDayKey(new Date());
}

/** Reconstruit un objet Date (à minuit local) depuis une clé "YYYY-MM-DD". */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d); // minuit local
}

/** Décale une clé jour de n jours (n peut être négatif). */
export function addDays(key: string, n: number): string {
  const d = fromDayKey(key);
  d.setDate(d.getDate() + n);
  return toDayKey(d);
}

/** Nombre de jours entiers entre deux clés jour (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = fromDayKey(b).getTime() - fromDayKey(a).getTime();
  return Math.round(ms / 86_400_000); // 1 jour = 86 400 000 ms
}

/**
 * Lundi de la semaine contenant `key` (la semaine commence le lundi).
 * getDay() renvoie 0=dimanche..6=samedi, on ramène ça à 0=lundi..6=dimanche.
 */
export function startOfWeek(key: string): string {
  const d = fromDayKey(key);
  const dow = (d.getDay() + 6) % 7; // 0 = lundi
  return addDays(key, -dow);
}

/** Les 7 clés jour de la semaine contenant `key` (lundi → dimanche). */
export function weekDays(key: string): string[] {
  const monday = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * Grille du mois pour un affichage calendrier : toujours des semaines
 * complètes (commençant lundi). Renvoie des clés jour, dont certaines
 * débordent sur le mois précédent/suivant pour remplir la grille.
 */
export function monthGrid(key: string): string[] {
  const d = fromDayKey(key);
  const firstOfMonth = toDayKey(new Date(d.getFullYear(), d.getMonth(), 1));
  const gridStart = startOfWeek(firstOfMonth);
  // 6 semaines = 42 cases : couvre tous les cas de figure d'un mois.
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

/**
 * Les semaines à afficher pour le mois de `key` : des tableaux de 7 clés jour
 * (lundi → dimanche). Contrairement à `monthGrid`, on ne garde que les semaines
 * qui touchent réellement le mois — 4, 5 ou 6 lignes selon le mois, comme le
 * calendrier iOS, plutôt que 6 lignes systématiques dont une vide.
 */
export function monthWeeks(key: string): string[][] {
  const cells = monthGrid(key);
  const weeks: string[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  // On retire par la fin les semaines entièrement hors du mois affiché.
  while (weeks.length > 4 && weeks[weeks.length - 1].every((d) => !isSameMonth(d, key))) {
    weeks.pop();
  }
  return weeks;
}

/** Vrai si la clé appartient au même mois/année que `ref`. */
export function isSameMonth(key: string, ref: string): boolean {
  return key.slice(0, 7) === ref.slice(0, 7);
}

// --- Libellés lisibles (français) ---------------------------------------

const MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const WEEKDAYS_LONG = [
  'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
];
export const WEEKDAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/** Ex : "lundi 6 juillet". */
export function labelDayLong(key: string): string {
  const d = fromDayKey(key);
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Ex : "juillet 2026". */
export function labelMonth(key: string): string {
  const d = fromDayKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Ex : "6 juil." (compact, pour en-têtes de colonnes). */
export function labelDayShort(key: string): string {
  const d = fromDayKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 4)}.`;
}

// --- Heures ---------------------------------------------------------------

/** Convertit une heure "HH:MM" en minutes depuis minuit (08:30 → 510). */
export function minutesOfTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Les minutes écoulées depuis minuit à l'instant présent. */
export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** Le libellé d'une heure pleine dans la colonne du planning : 8 → "08:00". */
export function labelHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}
