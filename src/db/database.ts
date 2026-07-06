/**
 * database.ts — toute la persistance de l'app, isolée ici.
 *
 * On utilise expo-sqlite en mode SYNCHRONE (getAllSync/runSync/…). C'est le
 * plus simple à lire : ça se comporte comme des appels de fonction normaux,
 * pas de promesses à gérer. Les volumes sont minuscules (usage perso), donc
 * bloquer une microseconde le thread JS n'a aucun impact perceptible.
 *
 * Les écrans n'écrivent JAMAIS de SQL : ils appellent uniquement les fonctions
 * exportées ci-dessous. C'est notre unique « API de données ».
 *
 * Schéma :
 *   habits(id, name, description, color, created_at)
 *   completions(id, habit_id, day)   -- une ligne = « habit validé ce jour-là »
 *   events(id, title, day, start, end)
 */

import * as SQLite from 'expo-sqlite';
import { addDays, todayKey } from '@/lib/dates';

// Ouverture (ou création) du fichier de base. Une seule instance partagée.
const db = SQLite.openDatabaseSync('bake.db');

// --- Types métier : la forme des objets manipulés par les écrans -----------

export type Habit = {
  id: number;
  name: string;
  description: string;
  color: string;
  created_at: string; // "YYYY-MM-DD"
};

export type EventItem = {
  id: number;
  title: string;
  day: string; // "YYYY-MM-DD"
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

/**
 * Crée les tables si elles n'existent pas encore.
 * À appeler une fois au démarrage de l'app (dans App.tsx).
 * `execSync` exécute plusieurs instructions d'un coup.
 */
export function initDatabase(): void {
  db.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS habits (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color       TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS completions (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      day      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      day   TEXT NOT NULL,
      start TEXT NOT NULL,
      end   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meditations (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      day     TEXT NOT NULL,
      seconds INTEGER NOT NULL
    );
  `);
}

// ===========================================================================
//  HABITS
// ===========================================================================

/**
 * Les habitudes RESTANT à valider aujourd'hui : celles qui n'ont pas encore
 * de ligne `completions` pour la date du jour. C'est exactement ce qu'affiche
 * la page d'accueil (une habitude validée disparaît jusqu'à demain).
 */
export function getPendingHabits(): Habit[] {
  const day = todayKey();
  return db.getAllSync<Habit>(
    `SELECT h.* FROM habits h
     WHERE h.id NOT IN (SELECT habit_id FROM completions WHERE day = ?)
     ORDER BY h.created_at ASC, h.id ASC`,
    day,
  );
}

/** Toutes les habitudes, quel que soit leur état (utile pour un total). */
export function getAllHabits(): Habit[] {
  return db.getAllSync<Habit>('SELECT * FROM habits ORDER BY id ASC');
}

/** Combien d'habitudes ont déjà été validées aujourd'hui. */
export function countCompletedToday(): number {
  const row = db.getFirstSync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM completions WHERE day = ?',
    todayKey(),
  );
  return row?.n ?? 0;
}

/** Ajoute une habitude. La couleur est fournie par l'appelant (choix ou auto). */
export function addHabit(name: string, description: string, color: string): void {
  db.runSync(
    'INSERT INTO habits (name, description, color, created_at) VALUES (?, ?, ?, ?)',
    name.trim(),
    description.trim(),
    color,
    todayKey(),
  );
}

/** Marque une habitude comme validée aujourd'hui (idempotent dans la journée). */
export function completeHabit(habitId: number): void {
  const day = todayKey();
  const already = db.getFirstSync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM completions WHERE habit_id = ? AND day = ?',
    habitId,
    day,
  );
  if ((already?.n ?? 0) === 0) {
    db.runSync('INSERT INTO completions (habit_id, day) VALUES (?, ?)', habitId, day);
  }
}

/**
 * Règle « une seule création tous les 30 jours ».
 * On regarde la date de création la plus récente parmi les habitudes.
 * Renvoie le nombre de jours restant à attendre (0 = on peut créer maintenant).
 */
export function daysUntilCanAddHabit(): number {
  const row = db.getFirstSync<{ last: string | null }>(
    'SELECT MAX(created_at) AS last FROM habits',
  );
  if (!row?.last) return 0; // aucune habitude encore : autorisé

  const COOLDOWN = 30;
  const last = new Date(row.last).getTime();
  const now = new Date(todayKey()).getTime();
  const elapsed = Math.floor((now - last) / 86_400_000);
  const remaining = COOLDOWN - elapsed;
  return remaining > 0 ? remaining : 0;
}

// ===========================================================================
//  EVENTS (agenda)
// ===========================================================================

/** Les événements d'un jour donné, triés par heure de début. */
export function getEventsForDay(day: string): EventItem[] {
  return db.getAllSync<EventItem>(
    'SELECT * FROM events WHERE day = ? ORDER BY start ASC',
    day,
  );
}

/** Les événements d'une plage de jours (bornes incluses), pour la vue semaine. */
export function getEventsInRange(startDay: string, endDay: string): EventItem[] {
  return db.getAllSync<EventItem>(
    'SELECT * FROM events WHERE day BETWEEN ? AND ? ORDER BY day ASC, start ASC',
    startDay,
    endDay,
  );
}

/** Le nombre d'événements par jour sur une plage : { "2026-07-06": 2, … }.
 *  Sert à afficher une pastille sous les jours occupés dans la vue mois. */
export function getEventCountsInRange(
  startDay: string,
  endDay: string,
): Record<string, number> {
  const rows = db.getAllSync<{ day: string; n: number }>(
    'SELECT day, COUNT(*) AS n FROM events WHERE day BETWEEN ? AND ? GROUP BY day',
    startDay,
    endDay,
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.day] = r.n;
  return map;
}

/** Ajoute un événement à l'agenda. */
export function addEvent(title: string, day: string, start: string, end: string): void {
  db.runSync(
    'INSERT INTO events (title, day, start, end) VALUES (?, ?, ?, ?)',
    title.trim(),
    day,
    start,
    end,
  );
}

/** Supprime un événement par son id. */
export function deleteEvent(id: number): void {
  db.runSync('DELETE FROM events WHERE id = ?', id);
}

// ===========================================================================
//  MEDITATIONS (chronomètre)
// ===========================================================================

/** Enregistre une session de méditation (durée en secondes) pour aujourd'hui. */
export function addMeditation(seconds: number): void {
  if (seconds <= 0) return; // rien à enregistrer
  db.runSync(
    'INSERT INTO meditations (day, seconds) VALUES (?, ?)',
    todayKey(),
    Math.round(seconds),
  );
}

/** Total de secondes méditées un jour donné. */
export function getMeditationSecondsForDay(day: string): number {
  const row = db.getFirstSync<{ s: number | null }>(
    'SELECT SUM(seconds) AS s FROM meditations WHERE day = ?',
    day,
  );
  return row?.s ?? 0;
}

/** Secondes méditées par jour sur une plage : { "2026-07-06": 1200, … }.
 *  Sert à afficher le temps médité dans l'agenda (vues jour / semaine). */
export function getMeditationSecondsInRange(
  startDay: string,
  endDay: string,
): Record<string, number> {
  const rows = db.getAllSync<{ day: string; s: number }>(
    `SELECT day, SUM(seconds) AS s FROM meditations
     WHERE day BETWEEN ? AND ? GROUP BY day`,
    startDay,
    endDay,
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.day] = r.s;
  return map;
}

// ===========================================================================
//  STATISTIQUES (page Stats)
// ===========================================================================

/** Total de toutes les validations d'habitudes, tous jours confondus. */
export function getTotalCompletions(): number {
  const row = db.getFirstSync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM completions',
  );
  return row?.n ?? 0;
}

/** Nombre de validations par jour sur une plage : { "2026-07-06": 3, … }. */
export function getCompletionCountsInRange(
  startDay: string,
  endDay: string,
): Record<string, number> {
  const rows = db.getAllSync<{ day: string; n: number }>(
    `SELECT day, COUNT(*) AS n FROM completions
     WHERE day BETWEEN ? AND ? GROUP BY day`,
    startDay,
    endDay,
  );
  const map: Record<string, number> = {};
  for (const r of rows) map[r.day] = r.n;
  return map;
}

/**
 * Série en cours (streak) : nombre de jours consécutifs, en remontant depuis
 * aujourd'hui, où au moins une habitude a été validée. Si rien aujourd'hui mais
 * quelque chose hier, la série court encore (on ne la casse qu'après un jour
 * entier sans rien).
 */
export function getHabitStreak(): number {
  // On récupère l'ensemble des jours ayant au moins une validation.
  const rows = db.getAllSync<{ day: string }>(
    'SELECT DISTINCT day FROM completions',
  );
  const done = new Set(rows.map((r) => r.day));
  if (done.size === 0) return 0;

  const today = todayKey();
  // Point de départ : aujourd'hui si validé, sinon hier (tolérance d'un jour).
  let cursor = done.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (done.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Total de secondes méditées, tous jours confondus. */
export function getTotalMeditationSeconds(): number {
  const row = db.getFirstSync<{ s: number | null }>(
    'SELECT SUM(seconds) AS s FROM meditations',
  );
  return row?.s ?? 0;
}

/** Durée de la plus longue session de méditation (en secondes). */
export function getLongestMeditationSeconds(): number {
  const row = db.getFirstSync<{ s: number | null }>(
    'SELECT MAX(seconds) AS s FROM meditations',
  );
  return row?.s ?? 0;
}

/** Nombre total de sessions de méditation enregistrées. */
export function getMeditationSessionCount(): number {
  const row = db.getFirstSync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM meditations',
  );
  return row?.n ?? 0;
}
