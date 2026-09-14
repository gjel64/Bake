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
 *   events(id, title, day, end_day, start, end, category_id, calendar_id, location,
 *          reminders, reminder_alarm, todo_id*)
 *   event_todos(event_id, todo_id)   -- lien N..N entre événements et to-dos
 *   calendars(id, name, url, color, reminders, reminder_alarm)  -- abonnements .ics
 *   settings(key, value)             -- réglages de l'app (clé → valeur texte)
 *
 *   `reminders` est une liste de minutes AVANT le début, en texte ("0,15,60" ;
 *   '' = aucun rappel), et `reminder_alarm` dit si ces rappels sonnent comme une
 *   alarme (1) ou comme une simple notification (0). Un événement perso porte
 *   ses propres rappels ; un événement d'abonnement, réécrit à chaque synchro,
 *   ne peut rien garder : il prend ceux de son ABONNEMENT (voir EVENT_SELECT).
 *
 *   `events.calendar_id` distingue les deux origines : NULL = un événement créé
 *   dans l'app (modifiable), sinon l'abonnement .ics qui l'a apporté. Ces
 *   derniers sont en LECTURE SEULE — `updateEvent`/`deleteEvent` refusent d'y
 *   toucher — et sont intégralement réécrits à chaque synchronisation.
 *
 *   `events.day` et `events.end_day` bornent la PLAGE de jours d'un événement
 *   (end_day = day pour un événement d'une seule journée). `start` est l'heure
 *   du premier jour, `end` celle du dernier ; les jours intermédiaires d'un
 *   événement long comptent comme des journées entières.
 *
 *   (*) events.todo_id est un vestige de la V2 (un seul to-do par événement).
 *   Il est vidé au démarrage par `migrateEventTodoLinks()` au profit de la
 *   table `event_todos`. On ne le supprime pas : les bases déjà installées et
 *   les vieilles sauvegardes le contiennent encore.
 */

import * as SQLite from 'expo-sqlite';
import { addDays, daysBetween, todayKey } from '@/lib/dates';

// Ouverture (ou création) du fichier de base. Une seule instance partagée.
const db = SQLite.openDatabaseSync('bake.db');

// --- Types métier : la forme des objets manipulés par les écrans -----------

export type Habit = {
  id: number;
  name: string;
  description: string;
  color: string;
  created_at: string; // "YYYY-MM-DD"
  notify: number; // 1 = citée dans le rappel quotidien, 0 = ignorée
};

export type EventItem = {
  id: number;
  title: string;
  day: string; // premier jour, "YYYY-MM-DD"
  end_day: string; // dernier jour, "YYYY-MM-DD" (= day si l'événement tient sur un jour)
  start: string; // "HH:MM" — heure de début, le premier jour
  end: string; // "HH:MM" — heure de fin, le dernier jour
  category_id: number | null;
  calendar_id: number | null; // non nul = importé d'un abonnement .ics (lecture seule)
  location: string; // lieu, renseigné seulement par les abonnements .ics ('' sinon)
  color: string | null; // couleur de la catégorie, sinon celle de l'abonnement
  reminders: number[]; // rappels, en minutes avant le début (ceux de l'abonnement s'il en vient)
  reminder_alarm: number; // 1 = les rappels sonnent comme une alarme
  todo_ids: number[]; // to-dos liés à cet événement (0, 1 ou plusieurs)
  todo_done: number; // combien de ces to-dos sont cochés
  done: number; // 1 si l'événement a des to-dos liés et qu'ils sont TOUS faits
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
      created_at  TEXT NOT NULL,
      notify      INTEGER NOT NULL DEFAULT 1
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

    CREATE TABLE IF NOT EXISTS event_todos (
      event_id INTEGER NOT NULL,
      todo_id  INTEGER NOT NULL,
      PRIMARY KEY (event_id, todo_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendars (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      url        TEXT NOT NULL,
      color      TEXT NOT NULL,
      last_sync  TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Migration douce : ajoute les colonnes manquantes à `events` (V1 → V2).
  ensureColumn('events', 'category_id', 'category_id INTEGER');
  ensureColumn('events', 'todo_id', 'todo_id INTEGER');

  // V3 → V4 : un événement porte une plage de jours (day → end_day).
  ensureColumn('events', 'end_day', 'end_day TEXT');

  // V4 → V5 : un événement peut venir d'un abonnement .ics.
  ensureColumn('events', 'calendar_id', 'calendar_id INTEGER');

  // V6 → V7 : un événement importé peut porter un lieu (LOCATION du .ics).
  ensureColumn('events', 'location', "location TEXT NOT NULL DEFAULT ''");

  // V7 → V8 : rappels avant un événement — sur l'événement perso, ou sur
  // l'abonnement pour tous ses événements.
  ensureColumn('events', 'reminders', "reminders TEXT NOT NULL DEFAULT ''");
  ensureColumn('events', 'reminder_alarm', 'reminder_alarm INTEGER NOT NULL DEFAULT 0');
  ensureColumn('calendars', 'reminders', "reminders TEXT NOT NULL DEFAULT ''");
  ensureColumn('calendars', 'reminder_alarm', 'reminder_alarm INTEGER NOT NULL DEFAULT 0');

  // V5 → V6 : chaque habitude dit si elle est citée dans le rappel quotidien.
  ensureColumn('habits', 'notify', 'notify INTEGER NOT NULL DEFAULT 1');

  // V2 → V3 : le lien unique events.todo_id devient la table event_todos.
  migrateEventTodoLinks();
  migrateEventEndDay();

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

/**
 * Reporte les anciens liens `events.todo_id` (un seul to-do par événement)
 * dans `event_todos`, puis VIDE la colonne. Ce vidage est ce qui rend la
 * migration idempotente : sans lui, un lien supprimé par l'utilisateur serait
 * ressuscité au démarrage suivant. Sert aussi après l'import d'une vieille
 * sauvegarde.
 */
function migrateEventTodoLinks(): void {
  const legacy = db.getAllSync<{ id: number; todo_id: number }>(
    'SELECT id, todo_id FROM events WHERE todo_id IS NOT NULL',
  );
  if (legacy.length === 0) return;

  db.withTransactionSync(() => {
    for (const row of legacy) {
      db.runSync(
        'INSERT OR IGNORE INTO event_todos (event_id, todo_id) VALUES (?, ?)',
        row.id,
        row.todo_id,
      );
    }
    db.runSync('UPDATE events SET todo_id = NULL');
  });
}

/**
 * Donne une date de fin aux événements qui n'en ont pas (créés avant la V4) :
 * ils tiennent sur une seule journée, donc `end_day = day`. Idempotente : ne
 * touche que les lignes encore à NULL. Sert aussi après l'import d'une vieille
 * sauvegarde.
 */
function migrateEventEndDay(): void {
  db.runSync('UPDATE events SET end_day = day WHERE end_day IS NULL');
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

/** Les habitudes à citer dans le rappel quotidien (celles cochées dans les réglages). */
export function getNotifiedHabits(): Habit[] {
  return db.getAllSync<Habit>('SELECT * FROM habits WHERE notify = 1 ORDER BY id ASC');
}

/** Coche / décoche une habitude dans le rappel quotidien. */
export function setHabitNotify(habitId: number, notify: boolean): void {
  db.runSync('UPDATE habits SET notify = ? WHERE id = ?', notify ? 1 : 0, habitId);
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

/**
 * Sélection commune : on joint la catégorie (couleur) et on agrège les to-dos
 * liés — leurs ids (chaîne "3,7,12") et le nombre d'entre eux déjà cochés.
 * `end_day` est normalisé : jamais NULL, même pour une ligne d'avant la V4.
 * Les rappels sont ceux qui s'APPLIQUENT : ceux de l'événement s'il est perso,
 * ceux de son abonnement sinon.
 */
const EVENT_SELECT = `
  SELECT e.id, e.title, e.day, COALESCE(e.end_day, e.day) AS end_day,
         e.start, e.end, e.category_id, e.calendar_id,
         COALESCE(e.location, '') AS location,
         COALESCE(c.color, cal.color) AS color,
         CASE WHEN e.calendar_id IS NULL THEN e.reminders ELSE cal.reminders END AS reminders_csv,
         CASE WHEN e.calendar_id IS NULL THEN e.reminder_alarm ELSE cal.reminder_alarm END
           AS reminder_alarm,
         (SELECT group_concat(et.todo_id)
            FROM event_todos et WHERE et.event_id = e.id) AS todo_ids_csv,
         (SELECT COUNT(*)
            FROM event_todos et
            JOIN todos t ON t.id = et.todo_id
           WHERE et.event_id = e.id AND t.done = 1) AS todo_done
  FROM events e
  LEFT JOIN categories c ON c.id = e.category_id
  LEFT JOIN calendars cal ON cal.id = e.calendar_id
`;

/** La ligne brute renvoyée par EVENT_SELECT (avant mise en forme). */
type EventRow = Omit<EventItem, 'todo_ids' | 'done' | 'reminders' | 'reminder_alarm'> & {
  todo_ids_csv: string | null;
  reminders_csv: string | null;
  reminder_alarm: number | null;
};

/** Met une ligne brute en forme : ids et rappels en tableaux, `done` calculé. */
function mapEvent(row: EventRow): EventItem {
  const ids = row.todo_ids_csv
    ? row.todo_ids_csv.split(',').map(Number).filter((n) => !Number.isNaN(n))
    : [];
  const { todo_ids_csv, reminders_csv, ...rest } = row;
  return {
    ...rest,
    reminders: parseReminders(reminders_csv),
    reminder_alarm: row.reminder_alarm ?? 0,
    todo_ids: ids,
    // Un événement n'est « fait » que s'il a des to-dos liés et qu'ils le sont tous.
    done: ids.length > 0 && row.todo_done === ids.length ? 1 : 0,
  };
}

/**
 * Les événements qui COUVRENT un jour donné, triés par heure de début.
 * Un événement sur plusieurs jours ressort donc chaque jour de sa plage ; les
 * jours où il ne fait que courir sont triés comme s'ils commençaient à minuit.
 * `hidden` masque des SOURCES entières (voir `eventSourceKey`).
 */
export function getEventsForDay(day: string, hidden?: ReadonlySet<string>): EventItem[] {
  return db
    .getAllSync<EventRow>(
      `${EVENT_SELECT} WHERE ? BETWEEN e.day AND COALESCE(e.end_day, e.day)
       ORDER BY CASE WHEN e.day = ? THEN e.start ELSE '00:00' END ASC, e.id ASC`,
      day,
      day,
    )
    .filter((row) => !isHidden(row, hidden))
    .map(mapEvent);
}

/**
 * Les événements qui CHEVAUCHENT une plage de jours (bornes incluses).
 * Un événement long est renvoyé une seule fois, même s'il déborde des bornes.
 * `hidden` masque des SOURCES entières (voir `eventSourceKey`).
 */
export function getEventsInRange(
  startDay: string,
  endDay: string,
  hidden?: ReadonlySet<string>,
): EventItem[] {
  return db
    .getAllSync<EventRow>(
      `${EVENT_SELECT} WHERE e.day <= ? AND COALESCE(e.end_day, e.day) >= ?
       ORDER BY e.day ASC, e.start ASC`,
      endDay,
      startDay,
    )
    .filter((row) => !isHidden(row, hidden))
    .map(mapEvent);
}

// --- Sources d'événements (ce que l'agenda peut masquer) ------------------

/** Clé de la source « événement perso sans catégorie ». */
export const NO_CATEGORY_SOURCE = 'none';

/**
 * La SOURCE d'un événement, sous forme de clé texte : son abonnement .ics s'il
 * en vient, sinon sa catégorie, sinon `NO_CATEGORY_SOURCE`. C'est l'unité que
 * l'agenda masque (voir `@/lib/agendaFilters`) — une clé plutôt qu'un id parce
 * qu'un abonnement 3 et une catégorie 3 ne sont pas la même chose.
 */
export function eventSourceKey(ev: {
  category_id: number | null;
  calendar_id: number | null;
}): string {
  if (ev.calendar_id !== null) return `cal:${ev.calendar_id}`;
  if (ev.category_id !== null) return `cat:${ev.category_id}`;
  return NO_CATEGORY_SOURCE;
}

/** Vrai si la source de cette ligne fait partie des sources masquées. */
function isHidden(
  ev: { category_id: number | null; calendar_id: number | null },
  hidden?: ReadonlySet<string>,
): boolean {
  return hidden !== undefined && hidden.size > 0 && hidden.has(eventSourceKey(ev));
}

/** Une source d'événements, telle que la liste le filtre de l'agenda. */
export type EventSource = {
  key: string; // la clé rendue par `eventSourceKey`
  label: string; // nom de la catégorie ou de l'abonnement
  color: string | null; // sa couleur (null pour « sans catégorie »)
  kind: 'category' | 'calendar' | 'none';
};

/**
 * Toutes les sources d'événements existantes : les catégories, les abonnements
 * .ics, et la pseudo-source « sans catégorie ». C'est la liste que propose le
 * filtre de l'agenda.
 */
export function getEventSources(): EventSource[] {
  return [
    ...getCategories().map<EventSource>((cat) => ({
      key: eventSourceKey({ category_id: cat.id, calendar_id: null }),
      label: cat.name,
      color: cat.color,
      kind: 'category',
    })),
    { key: NO_CATEGORY_SOURCE, label: 'Sans catégorie', color: null, kind: 'none' },
    ...getCalendars().map<EventSource>((cal) => ({
      key: eventSourceKey({ category_id: null, calendar_id: cal.id }),
      label: cal.name,
      color: cal.color,
      kind: 'calendar',
    })),
  ];
}

/** Ce qu'il faut savoir d'un jour pour la grille du mois. */
export type DaySummary = {
  count: number; // nombre d'événements couvrant ce jour
  colors: string[]; // leurs couleurs, sans doublon, dans l'ordre d'affichage
};

/** Le résumé de chaque jour occupé d'une plage : { "2026-07-06": { count, colors }, … }.
 *  Sert aux pastilles colorées de la vue mois et de la bande semaine.
 *  Un événement sur plusieurs jours compte pour CHAQUE jour qu'il couvre :
 *  impossible à faire en SQL simple, on déplie donc la plage en JS.
 *  `hidden` masque des SOURCES entières (voir `eventSourceKey`) : une pastille
 *  ne doit pas trahir un événement que la vue ne montre pas. */
export function getEventDaysInRange(
  startDay: string,
  endDay: string,
  hidden?: ReadonlySet<string>,
): Record<string, DaySummary> {
  const rows = db.getAllSync<{
    day: string;
    end_day: string;
    color: string | null;
    category_id: number | null;
    calendar_id: number | null;
  }>(
    `SELECT e.day, COALESCE(e.end_day, e.day) AS end_day,
            e.category_id, e.calendar_id,
            COALESCE(c.color, cal.color) AS color
       FROM events e
       LEFT JOIN categories c ON c.id = e.category_id
       LEFT JOIN calendars cal ON cal.id = e.calendar_id
      WHERE e.day <= ? AND COALESCE(e.end_day, e.day) >= ?
      ORDER BY e.day ASC, e.start ASC`,
    endDay,
    startDay,
  );
  const map: Record<string, DaySummary> = {};
  for (const r of rows) {
    if (isHidden(r, hidden)) continue;
    // On borne la plage de l'événement à celle demandée avant de la déplier.
    let d = r.day < startDay ? startDay : r.day;
    const last = r.end_day > endDay ? endDay : r.end_day;
    while (d <= last) {
      const entry = (map[d] ??= { count: 0, colors: [] });
      entry.count += 1;
      if (r.color && !entry.colors.includes(r.color)) entry.colors.push(r.color);
      d = addDays(d, 1);
    }
  }
  return map;
}

// --- Rappels --------------------------------------------------------------

/** Lit une liste de rappels stockée ("0,15,60") : minutes, sans doublon, croissantes. */
function parseReminders(csv: string | null): number[] {
  if (!csv) return [];
  const mins = csv
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0);
  return [...new Set(mins)].sort((a, b) => a - b);
}

/** Met une liste de rappels au format stocké ("0,15,60"). */
function formatReminders(minutes: number[]): string {
  return parseReminders(minutes.join(',')).join(',');
}

/**
 * Les événements qui COMMENCENT dans une plage de jours et portent au moins un
 * rappel (le leur, ou celui de leur abonnement). Sert à programmer les
 * notifications : les filtres de l'agenda n'ont rien à y voir, ils ne jouent
 * que sur l'affichage.
 */
export function getEventsWithReminders(startDay: string, endDay: string): EventItem[] {
  return db
    .getAllSync<EventRow>(
      `${EVENT_SELECT} WHERE e.day BETWEEN ? AND ?
         AND (CASE WHEN e.calendar_id IS NULL THEN e.reminders ELSE cal.reminders END) <> ''
       ORDER BY e.day ASC, e.start ASC`,
      startDay,
      endDay,
    )
    .map(mapEvent);
}

/**
 * Ajoute un événement à l'agenda, avec ses to-dos liés et ses rappels. Renvoie
 * son id. `endDay` est le dernier jour de l'événement (= `day` s'il tient sur un
 * jour) ; une valeur antérieure à `day` est ramenée à `day`.
 */
export function addEvent(
  title: string,
  day: string,
  endDay: string,
  start: string,
  end: string,
  categoryId: number | null = null,
  todoIds: number[] = [],
  reminders: number[] = [],
  reminderAlarm = false,
): number {
  let id = 0;
  db.withTransactionSync(() => {
    const res = db.runSync(
      `INSERT INTO events (title, day, end_day, start, end, category_id, reminders, reminder_alarm)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      title.trim(),
      day,
      endDay < day ? day : endDay,
      start,
      end,
      categoryId,
      formatReminders(reminders),
      reminderAlarm ? 1 : 0,
    );
    id = res.lastInsertRowId;
    linkTodos(id, todoIds);
  });
  return id;
}

/** Modifie un événement existant (titre, plage de jours, horaires, catégorie, to-dos liés, rappels). */
export function updateEvent(
  id: number,
  title: string,
  day: string,
  endDay: string,
  start: string,
  end: string,
  categoryId: number | null,
  todoIds: number[] = [],
  reminders: number[] = [],
  reminderAlarm = false,
): void {
  db.withTransactionSync(() => {
    db.runSync(
      `UPDATE events SET title = ?, day = ?, end_day = ?, start = ?, end = ?, category_id = ?,
                         reminders = ?, reminder_alarm = ?
       WHERE id = ? AND calendar_id IS NULL`,
      title.trim(),
      day,
      endDay < day ? day : endDay,
      start,
      end,
      categoryId,
      formatReminders(reminders),
      reminderAlarm ? 1 : 0,
      id,
    );
    db.runSync('DELETE FROM event_todos WHERE event_id = ?', id);
    linkTodos(id, todoIds);
  });
}

/** Remplace la liste des to-dos liés à un événement (appelé sous transaction). */
function linkTodos(eventId: number, todoIds: number[]): void {
  for (const todoId of todoIds) {
    db.runSync(
      'INSERT OR IGNORE INTO event_todos (event_id, todo_id) VALUES (?, ?)',
      eventId,
      todoId,
    );
  }
}

/**
 * Rattache un to-do à un événement PERSO (cocher l'un coche l'autre). Sans effet
 * sur un événement d'abonnement : il est réécrit à chaque synchronisation, le
 * lien serait perdu à la suivante.
 */
export function linkTodoToEvent(eventId: number, todoId: number): void {
  db.runSync(
    `INSERT OR IGNORE INTO event_todos (event_id, todo_id)
     SELECT ?, ? WHERE EXISTS (SELECT 1 FROM events WHERE id = ? AND calendar_id IS NULL)`,
    eventId,
    todoId,
    eventId,
  );
}

/** Supprime un événement (les to-dos liés, eux, restent dans la liste). */
export function deleteEvent(id: number): void {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM event_todos WHERE event_id = ?', id);
    db.runSync('DELETE FROM events WHERE id = ? AND calendar_id IS NULL', id);
  });
}

// ===========================================================================
//  CALENDARS (abonnements .ics)
// ===========================================================================

/** Un abonnement à un agenda externe (lien .ics). */
export type CalendarSub = {
  id: number;
  name: string;
  url: string;
  color: string; // couleur de TOUS les événements de cet abonnement
  reminders: number[]; // rappels appliqués à TOUS ses événements (minutes avant)
  reminder_alarm: number; // 1 = ces rappels sonnent comme une alarme
  last_sync: string | null; // "YYYY-MM-DD HH:MM" locale, ou null si jamais synchronisé
  created_at: string;
};

/** La ligne brute d'un abonnement (rappels encore en texte). */
type CalendarRow = Omit<CalendarSub, 'reminders'> & { reminders: string | null };

/** Met une ligne d'abonnement en forme. */
function mapCalendar(row: CalendarRow): CalendarSub {
  return { ...row, reminders: parseReminders(row.reminders), reminder_alarm: row.reminder_alarm ?? 0 };
}

/** Un événement lu dans un fichier .ics, prêt à être rangé en base. */
export type ImportedEvent = {
  title: string;
  day: string; // "YYYY-MM-DD"
  end_day: string;
  start: string; // "HH:MM"
  end: string;
  location: string; // lieu (LOCATION), '' si absent du fichier
};

/** Les abonnements, du plus ancien au plus récent. */
export function getCalendars(): CalendarSub[] {
  return db.getAllSync<CalendarRow>('SELECT * FROM calendars ORDER BY id ASC').map(mapCalendar);
}

/** Un abonnement par son id (null s'il vient d'être supprimé). */
export function getCalendar(id: number): CalendarSub | null {
  const row = db.getFirstSync<CalendarRow>('SELECT * FROM calendars WHERE id = ?', id);
  return row ? mapCalendar(row) : null;
}

/** Crée un abonnement (sans rien télécharger) et renvoie son id. */
export function addCalendar(
  name: string,
  url: string,
  color: string,
  reminders: number[] = [],
  reminderAlarm = false,
): number {
  const r = db.runSync(
    `INSERT INTO calendars (name, url, color, reminders, reminder_alarm, last_sync, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    name.trim(),
    url.trim(),
    color,
    formatReminders(reminders),
    reminderAlarm ? 1 : 0,
    todayKey(),
  );
  return r.lastInsertRowId;
}

/** Renomme / recolore / repointe un abonnement, et règle les rappels de ses événements. */
export function updateCalendar(
  id: number,
  name: string,
  url: string,
  color: string,
  reminders: number[] = [],
  reminderAlarm = false,
): void {
  db.runSync(
    'UPDATE calendars SET name = ?, url = ?, color = ?, reminders = ?, reminder_alarm = ? WHERE id = ?',
    name.trim(),
    url.trim(),
    color,
    formatReminders(reminders),
    reminderAlarm ? 1 : 0,
    id,
  );
}

/** Supprime un abonnement ET tous les événements qu'il avait apportés. */
export function deleteCalendar(id: number): void {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM events WHERE calendar_id = ?', id);
    db.runSync('DELETE FROM calendars WHERE id = ?', id);
  });
}

/**
 * Remplace d'un bloc tous les événements d'un abonnement par ceux qu'on vient
 * de lire. C'est volontairement brutal — supprimer puis réinsérer — parce que
 * c'est la seule façon simple de refléter une suppression faite à la source.
 * Les événements créés dans l'app (calendar_id NULL) ne sont jamais touchés.
 */
export function replaceCalendarEvents(id: number, events: ImportedEvent[]): void {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM events WHERE calendar_id = ?', id);
    for (const e of events) {
      db.runSync(
        `INSERT INTO events (title, day, end_day, start, end, category_id, calendar_id, location)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
        e.title,
        e.day,
        e.end_day < e.day ? e.day : e.end_day,
        e.start,
        e.end,
        id,
        e.location,
      );
    }
    db.runSync('UPDATE calendars SET last_sync = ? WHERE id = ?', localStamp(), id);
  });
}

/** Horodatage local lisible, "YYYY-MM-DD HH:MM" — pour `last_sync`. */
function localStamp(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${todayKey()} ${h}:${m}`;
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

/** Le détail d'UNE habitude sur la page Stats. */
export type HabitStat = {
  id: number;
  name: string;
  color: string;
  week: boolean[]; // les 7 derniers jours, le dernier étant aujourd'hui
  rate: number; // 0..1 sur les 30 derniers jours (voir plus bas)
  window: number; // sur combien de jours ce taux est calculé (≤ 30)
  streak: number; // jours consécutifs validés, même tolérance que `getHabitStreak`
  total: number; // validations depuis la création
};

/**
 * Le détail de CHAQUE habitude : sa semaine, son taux, sa série, son total.
 * Le taux global de la page cache l'habitude qu'on laisse filer — c'est ce
 * tableau qui le dit.
 *
 * Le taux est borné à l'ÂGE de l'habitude : une habitude créée avant-hier
 * afficherait sinon 7 % pour deux jours parfaits. `window` dit sur combien de
 * jours il porte réellement, pour que l'écran puisse le nuancer.
 *
 * Une seule requête, dépliée en JS : les volumes sont minuscules (usage perso)
 * et la série, elle, peut remonter bien au-delà de la fenêtre de 30 jours.
 */
export function getHabitStats(): HabitStat[] {
  const today = todayKey();
  const rows = db.getAllSync<{ habit_id: number; day: string }>(
    'SELECT DISTINCT habit_id, day FROM completions',
  );
  const byHabit = new Map<number, Set<string>>();
  for (const r of rows) {
    const days = byHabit.get(r.habit_id) ?? new Set<string>();
    days.add(r.day);
    byHabit.set(r.habit_id, days);
  }

  return getAllHabits().map((habit) => {
    const done = byHabit.get(habit.id) ?? new Set<string>();

    // Les sept derniers jours, du plus ancien à aujourd'hui.
    const week = Array.from({ length: 7 }, (_, i) => done.has(addDays(today, i - 6)));

    // Taux sur 30 jours, jamais plus large que l'âge de l'habitude.
    const age = daysBetween(habit.created_at, today) + 1;
    const window = Math.max(1, Math.min(30, age));
    let hits = 0;
    for (let i = 0; i < window; i += 1) {
      if (done.has(addDays(today, -i))) hits += 1;
    }

    // Série : on part d'aujourd'hui s'il est validé, sinon d'hier — la journée
    // en cours ne doit pas casser une série tant qu'elle n'est pas finie.
    let cursor = done.has(today) ? today : addDays(today, -1);
    let streak = 0;
    while (done.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }

    return {
      id: habit.id,
      name: habit.name,
      color: habit.color,
      week,
      rate: hits / window,
      window,
      streak,
      total: done.size,
    };
  });
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
         EXISTS(SELECT 1 FROM event_todos et WHERE et.todo_id = t.id) AS scheduled
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

/** Coche (ou décoche) plusieurs to-dos d'un coup — depuis un événement lié. */
export function setTodosDone(ids: number[], done: boolean): void {
  if (ids.length === 0) return;
  db.withTransactionSync(() => {
    for (const id of ids) {
      db.runSync(
        'UPDATE todos SET done = ?, done_at = ? WHERE id = ?',
        done ? 1 : 0,
        done ? todayKey() : null,
        id,
      );
    }
  });
}

/**
 * Supprime un to-do. Ses liens disparaissent ; un événement qui se retrouve
 * SANS aucun to-do lié est supprimé lui aussi (c'était une tâche planifiée,
 * elle n'a plus de raison d'être). Les événements qui gardent d'autres to-dos
 * restent en place.
 */
export function deleteTodo(id: number): void {
  db.withTransactionSync(() => {
    const linked = db.getAllSync<{ event_id: number }>(
      'SELECT event_id FROM event_todos WHERE todo_id = ?',
      id,
    );
    db.runSync('DELETE FROM event_todos WHERE todo_id = ?', id);
    for (const { event_id } of linked) {
      const rest = db.getFirstSync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM event_todos WHERE event_id = ?',
        event_id,
      );
      if ((rest?.n ?? 0) === 0) db.runSync('DELETE FROM events WHERE id = ?', event_id);
    }
    db.runSync('DELETE FROM todos WHERE id = ?', id);
  });
}

/** Les événements auxquels un to-do est rattaché (souvent zéro ou un). */
export function getLinkedEvents(todoId: number): EventItem[] {
  return db
    .getAllSync<EventRow>(
      `${EVENT_SELECT} WHERE EXISTS(
         SELECT 1 FROM event_todos et WHERE et.event_id = e.id AND et.todo_id = ?
       ) ORDER BY e.day ASC, e.start ASC`,
      todoId,
    )
    .map(mapEvent);
}

/**
 * Déplanifie un to-do : on retire ses liens, et on supprime les événements qui
 * n'ont plus aucun to-do rattaché (même règle que `deleteTodo`).
 */
export function unscheduleTodo(todoId: number): void {
  db.withTransactionSync(() => {
    const linked = db.getAllSync<{ event_id: number }>(
      'SELECT event_id FROM event_todos WHERE todo_id = ?',
      todoId,
    );
    db.runSync('DELETE FROM event_todos WHERE todo_id = ?', todoId);
    for (const { event_id } of linked) {
      const rest = db.getFirstSync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM event_todos WHERE event_id = ?',
        event_id,
      );
      if ((rest?.n ?? 0) === 0) db.runSync('DELETE FROM events WHERE id = ?', event_id);
    }
  });
}

// ===========================================================================
//  RÉGLAGES (petites préférences, une ligne par clé)
// ===========================================================================

/** Heure du rappel quotidien des habitudes, "HH:MM" (absent = désactivé). */
export const SETTING_HABITS_REMINDER_TIME = 'habits_reminder_time';

/** Apparence forcée : "light" ou "dark" (absent = on suit le téléphone). */
export const SETTING_THEME_MODE = 'theme_mode';

/** Teinte d'accent : "orange" (absent = vert, la couleur d'origine). */
export const SETTING_ACCENT = 'accent';

/** Préfixe des sources masquées dans l'agenda, une clé par vue (`@/lib/agendaFilters`). */
export const SETTING_AGENDA_HIDDEN = 'agenda_hidden';

/** Lit un réglage, ou null s'il n'a jamais été posé. */
export function getSetting(key: string): string | null {
  const row = db.getFirstSync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

/** Écrit un réglage. Passer `null` l'efface. */
export function setSetting(key: string, value: string | null): void {
  if (value === null) {
    db.runSync('DELETE FROM settings WHERE key = ?', key);
    return;
  }
  db.runSync(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?',
    key,
    value,
    value,
  );
}

// ===========================================================================
//  EXPORT / IMPORT (sauvegarde anti-réinstallation)
// ===========================================================================

/** Version du format d'export (8 = rappels des événements et des abonnements). */
export const BACKUP_VERSION = 8;

type Backup = {
  version: number;
  exportedAt: string;
  habits: unknown[];
  completions: unknown[];
  events: unknown[];
  meditations: unknown[];
  categories: unknown[];
  todos: unknown[];
  event_todos?: unknown[]; // absent des sauvegardes v1/v2
  settings?: unknown[]; // absent des sauvegardes v1/v2/v3
  calendars?: unknown[]; // absent des sauvegardes v1..v4
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
    event_todos: dump('event_todos'),
    settings: dump('settings'),
    calendars: dump('calendars'),
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
    const tables = [
      'habits', 'completions', 'events', 'meditations',
      'categories', 'todos', 'event_todos', 'settings', 'calendars',
    ];
    for (const t of tables) db.runSync(`DELETE FROM ${t}`);

    restoreTable('habits', backup.habits ?? []);
    restoreTable('completions', backup.completions ?? []);
    restoreTable('events', backup.events ?? []);
    restoreTable('meditations', backup.meditations ?? []);
    restoreTable('categories', backup.categories ?? []);
    restoreTable('todos', backup.todos ?? []);
    restoreTable('event_todos', backup.event_todos ?? []);
    restoreTable('settings', backup.settings ?? []);
    restoreTable('calendars', backup.calendars ?? []);
  });

  // Une sauvegarde v1/v2 porte ses liens dans events.todo_id : on les convertit.
  migrateEventTodoLinks();
  // Une sauvegarde v1/v2/v3 ignore end_day : ses événements tiennent sur un jour.
  migrateEventEndDay();
}
