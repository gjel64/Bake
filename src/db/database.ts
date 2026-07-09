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
  category_id: number | null;
  todo_id: number | null; // si l'événement provient d'un to-do (lien)
  color: string | null; // couleur de la catégorie (jointure, pour l'affichage)
  done: number; // 0/1 — pour un événement lié, reflète l'état du to-do
};

/** Une catégorie (partagée entre to-dos et événements). */
export type Category = {
  id: number;
  name: string;
  color: string;
  icon: string; // nom d'icône Ionicons
  position: number;
};

/** Priorité d'un to-do. */
export const PRIORITIES = { basse: 0, moyenne: 1, haute: 2 } as const;

/** Un to-do. Il peut être planifié (→ un événement lié apparaît dans l'agenda). */
export type Todo = {
  id: number;
  title: string;
  notes: string;
  category_id: number | null;
  priority: number; // 0 basse, 1 moyenne, 2 haute
  done: number; // 0/1
  done_at: string | null;
  remind_at: string | null; // ISO datetime du rappel
  notif_id: string | null; // id de la notification programmée
  created_at: string;
  position: number;
  // Champs joints depuis la catégorie (pour l'affichage) :
  cat_name: string | null;
  cat_color: string | null;
  cat_icon: string | null;
  // Vrai (1) si le to-do a un événement lié dans l'agenda :
  scheduled: number;
};

/** Jeu de catégories de départ (modifiable ensuite par l'utilisateur). */
const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Perso', color: '#9FC3AD', icon: 'person-outline', position: 0 },
  { name: 'Travail', color: '#9FBAC4', icon: 'briefcase-outline', position: 1 },
  { name: 'Sport', color: '#D6A98E', icon: 'barbell-outline', position: 2 },
  { name: 'Santé', color: '#D9A7B0', icon: 'heart-outline', position: 3 },
  { name: 'Méditation', color: '#B3A9D6', icon: 'flower-outline', position: 4 },
  { name: 'Maison', color: '#D9BE86', icon: 'home-outline', position: 5 },
];

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

    CREATE TABLE IF NOT EXISTS categories (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      color    TEXT NOT NULL,
      icon     TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS todos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL,
      notes       TEXT NOT NULL DEFAULT '',
      category_id INTEGER,
      priority    INTEGER NOT NULL DEFAULT 1,
      done        INTEGER NOT NULL DEFAULT 0,
      done_at     TEXT,
      remind_at   TEXT,
      notif_id    TEXT,
      created_at  TEXT NOT NULL,
      position    INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Migration douce : ajoute les colonnes manquantes à `events` (V1 → V2).
  ensureColumn('events', 'category_id', 'category_id INTEGER');
  ensureColumn('events', 'todo_id', 'todo_id INTEGER');

  // Amorce les catégories par défaut si la table est vide.
  const count = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM categories');
  if ((count?.n ?? 0) === 0) {
    for (const c of DEFAULT_CATEGORIES) {
      db.runSync(
        'INSERT INTO categories (name, color, icon, position) VALUES (?, ?, ?, ?)',
        c.name,
        c.color,
        c.icon,
        c.position,
      );
    }
  }
}

/** Ajoute une colonne à une table si elle n'existe pas déjà (SQLite). */
function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    db.execSync(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
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

// Sélection commune : on joint la catégorie (couleur) et le to-do lié (état fait).
const EVENT_SELECT = `
  SELECT e.id, e.title, e.day, e.start, e.end, e.category_id, e.todo_id,
         c.color AS color, COALESCE(t.done, 0) AS done
  FROM events e
  LEFT JOIN categories c ON c.id = e.category_id
  LEFT JOIN todos t ON t.id = e.todo_id
`;

/** Les événements d'un jour donné, triés par heure de début. */
export function getEventsForDay(day: string): EventItem[] {
  return db.getAllSync<EventItem>(
    `${EVENT_SELECT} WHERE e.day = ? ORDER BY e.start ASC`,
    day,
  );
}

/** Les événements d'une plage de jours (bornes incluses), pour la vue semaine. */
export function getEventsInRange(startDay: string, endDay: string): EventItem[] {
  return db.getAllSync<EventItem>(
    `${EVENT_SELECT} WHERE e.day BETWEEN ? AND ? ORDER BY e.day ASC, e.start ASC`,
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

/** Ajoute un événement à l'agenda. Renvoie son id (utile pour lier un to-do). */
export function addEvent(
  title: string,
  day: string,
  start: string,
  end: string,
  categoryId: number | null = null,
  todoId: number | null = null,
): number {
  const res = db.runSync(
    'INSERT INTO events (title, day, start, end, category_id, todo_id) VALUES (?, ?, ?, ?, ?, ?)',
    title.trim(),
    day,
    start,
    end,
    categoryId,
    todoId,
  );
  return res.lastInsertRowId;
}

/** Modifie un événement existant (titre, date, horaires, catégorie). */
export function updateEvent(
  id: number,
  title: string,
  day: string,
  start: string,
  end: string,
  categoryId: number | null,
): void {
  db.runSync(
    'UPDATE events SET title = ?, day = ?, start = ?, end = ?, category_id = ? WHERE id = ?',
    title.trim(),
    day,
    start,
    end,
    categoryId,
    id,
  );
}

/** Supprime un événement par son id (le to-do lié, lui, reste dans la liste). */
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

// ===========================================================================
//  CATÉGORIES
// ===========================================================================

/** Toutes les catégories, dans l'ordre choisi. */
export function getCategories(): Category[] {
  return db.getAllSync<Category>(
    'SELECT * FROM categories ORDER BY position ASC, id ASC',
  );
}

/** Ajoute une catégorie. Renvoie son id. */
export function addCategory(name: string, color: string, icon: string): number {
  const max = db.getFirstSync<{ m: number | null }>(
    'SELECT MAX(position) AS m FROM categories',
  );
  const res = db.runSync(
    'INSERT INTO categories (name, color, icon, position) VALUES (?, ?, ?, ?)',
    name.trim(),
    color,
    icon,
    (max?.m ?? 0) + 1,
  );
  return res.lastInsertRowId;
}

/** Modifie une catégorie. */
export function updateCategory(
  id: number,
  name: string,
  color: string,
  icon: string,
): void {
  db.runSync(
    'UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?',
    name.trim(),
    color,
    icon,
    id,
  );
}

/** Supprime une catégorie ; les to-dos/événements concernés deviennent « sans catégorie ». */
export function deleteCategory(id: number): void {
  db.withTransactionSync(() => {
    db.runSync('UPDATE todos SET category_id = NULL WHERE category_id = ?', id);
    db.runSync('UPDATE events SET category_id = NULL WHERE category_id = ?', id);
    db.runSync('DELETE FROM categories WHERE id = ?', id);
  });
}

// ===========================================================================
//  TO-DOS
// ===========================================================================

// Sélection commune : joint la catégorie + indique si un événement est lié.
const TODO_SELECT = `
  SELECT t.*, c.name AS cat_name, c.color AS cat_color, c.icon AS cat_icon,
         EXISTS(SELECT 1 FROM events e WHERE e.todo_id = t.id) AS scheduled
  FROM todos t
  LEFT JOIN categories c ON c.id = t.category_id
`;

/** Tous les to-dos (triés : à faire d'abord, puis priorité décroissante). */
export function getTodos(): Todo[] {
  return db.getAllSync<Todo>(
    `${TODO_SELECT} ORDER BY t.done ASC, t.priority DESC, t.position ASC, t.id DESC`,
  );
}

/** Un to-do par id (avec les champs joints). */
export function getTodo(id: number): Todo | null {
  return db.getFirstSync<Todo>(`${TODO_SELECT} WHERE t.id = ?`, id);
}

/** Ajoute un to-do. Renvoie son id. */
export function addTodo(
  title: string,
  notes: string,
  categoryId: number | null,
  priority: number,
  remindAt: string | null,
  notifId: string | null,
): number {
  const res = db.runSync(
    `INSERT INTO todos (title, notes, category_id, priority, remind_at, notif_id, created_at, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    title.trim(),
    notes.trim(),
    categoryId,
    priority,
    remindAt,
    notifId,
    new Date().toISOString(),
  );
  return res.lastInsertRowId;
}

/** Modifie un to-do (hors état fait). */
export function updateTodo(
  id: number,
  title: string,
  notes: string,
  categoryId: number | null,
  priority: number,
  remindAt: string | null,
  notifId: string | null,
): void {
  db.runSync(
    `UPDATE todos SET title = ?, notes = ?, category_id = ?, priority = ?, remind_at = ?, notif_id = ?
     WHERE id = ?`,
    title.trim(),
    notes.trim(),
    categoryId,
    priority,
    remindAt,
    notifId,
    id,
  );
}

/** Coche / décoche un to-do (et renvoie le nouvel état). */
export function toggleTodoDone(id: number): boolean {
  const row = db.getFirstSync<{ done: number }>('SELECT done FROM todos WHERE id = ?', id);
  const next = (row?.done ?? 0) === 0 ? 1 : 0;
  db.runSync(
    'UPDATE todos SET done = ?, done_at = ? WHERE id = ?',
    next,
    next === 1 ? todayKey() : null,
    id,
  );
  return next === 1;
}

/** Supprime un to-do (et son éventuel événement lié dans l'agenda). */
export function deleteTodo(id: number): void {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM events WHERE todo_id = ?', id);
    db.runSync('DELETE FROM todos WHERE id = ?', id);
  });
}

/** L'événement lié à un to-do, s'il existe (pour l'édition/déplanification). */
export function getLinkedEvent(todoId: number): EventItem | null {
  return db.getFirstSync<EventItem>(
    `${EVENT_SELECT} WHERE e.todo_id = ?`,
    todoId,
  );
}

/** Enlève la planification d'un to-do (supprime l'événement lié). */
export function unscheduleTodo(todoId: number): void {
  db.runSync('DELETE FROM events WHERE todo_id = ?', todoId);
}

// ===========================================================================
//  EXPORT / IMPORT (sauvegarde anti-réinstallation)
// ===========================================================================

/** Version du format d'export (pour compatibilité future). */
export const BACKUP_VERSION = 2;

type Backup = {
  version: number;
  exportedAt: string;
  habits: unknown[];
  completions: unknown[];
  events: unknown[];
  meditations: unknown[];
  categories: unknown[];
  todos: unknown[];
};

/** Rassemble TOUTES les données brutes dans un objet sérialisable (JSON). */
export function exportData(): Backup {
  const dump = (t: string) => db.getAllSync(`SELECT * FROM ${t}`);
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    habits: dump('habits'),
    completions: dump('completions'),
    events: dump('events'),
    meditations: dump('meditations'),
    categories: dump('categories'),
    todos: dump('todos'),
  };
}

/** Insère une liste de lignes (objets) dans une table, colonnes dynamiques. */
function restoreTable(table: string, rows: unknown[]): void {
  for (const row of rows as Record<string, unknown>[]) {
    const keys = Object.keys(row);
    if (keys.length === 0) continue;
    const placeholders = keys.map(() => '?').join(', ');
    db.runSync(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
      ...(keys.map((k) => row[k]) as SQLite.SQLiteBindValue[]),
    );
  }
}

/**
 * Remplace TOUTES les données par celles d'une sauvegarde. Opération atomique :
 * si quoi que ce soit échoue, rien n'est modifié.
 */
export function importData(backup: Backup): void {
  db.withTransactionSync(() => {
    for (const t of ['habits', 'completions', 'events', 'meditations', 'categories', 'todos']) {
      db.runSync(`DELETE FROM ${t}`);
    }
    restoreTable('habits', backup.habits ?? []);
    restoreTable('completions', backup.completions ?? []);
    restoreTable('events', backup.events ?? []);
    restoreTable('meditations', backup.meditations ?? []);
    restoreTable('categories', backup.categories ?? []);
    restoreTable('todos', backup.todos ?? []);
  });
}
