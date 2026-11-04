/**
 * habitsReminder.ts — le rappel QUOTIDIEN des habitudes.
 *
 * Une seule notification pour toutes les habitudes, à une heure choisie par
 * l'utilisateur dans les réglages ("HH:MM", heure locale). Elle se répète
 * chaque jour toute seule : il n'y a rien à reprogrammer au fil des jours.
 *
 * Son texte liste les habitudes COCHÉES dans les réglages (`habits.notify`)
 * qui restent à valider aujourd'hui, une par ligne. Ce texte est figé au moment
 * où la notif est programmée — une notification répétitive ne peut pas
 * s'adapter à l'instant où elle sonne — donc on la reprogramme à chaque
 * validation d'une habitude. Quand tout est validé, il n'y a plus rien à
 * rappeler : la notification est supprimée, jusqu'à la prochaine
 * reprogrammation (ouverture de l'app) qui repart de la liste du jour.
 * Conséquence assumée : entre deux ouvertures de l'app, le texte reste celui
 * du dernier passage, même le lendemain.
 *
 * Ce module fait le pont entre le réglage stocké en base (`settings`) et la
 * notification programmée dans le système — `lib/notifications.ts` reste, lui,
 * ignorant de la base de données.
 *
 * `syncHabitsReminder()` est le point d'entrée à rejouer dès que le réglage, la
 * liste des habitudes citées OU ce qui reste à valider a pu bouger : à chaque
 * ouverture de l'app, après la validation d'une habitude, son ajout, son
 * archivage ou sa remise (une habitude archivée n'est plus citée), après un
 * changement de sélection, et après l'import d'une sauvegarde (qui peut aussi
 * bien poser une autre heure que couper le rappel).
 */

import {
  SETTING_HABITS_REMINDER_TIME,
  getNotifiedHabits,
  getPendingHabits,
  getSetting,
  setSetting,
} from '@/db/database';
import { cancelDailyReminders, scheduleDailyReminder } from '@/lib/notifications';

/** Titre de la notification. */
const REMINDER_TITLE = 'Tes habitudes';

/** Texte de repli quand aucune habitude n'est cochée (ou qu'il n'y en a aucune). */
const REMINDER_FALLBACK = 'Un petit moment pour toi : valide tes habitudes du jour.';

/**
 * Le texte du rappel : les habitudes cochées qui restent à valider aujourd'hui,
 * une par ligne (« - Sport »), ou null si elles sont toutes validées.
 * Attention, Android n'affiche que la PREMIÈRE ligne tant que la notification
 * n'est pas dépliée — c'est le titre qui porte le sens au premier coup d'œil.
 */
function reminderBody(): string | null {
  const notified = getNotifiedHabits();
  if (notified.length === 0) return REMINDER_FALLBACK;
  const pendingIds = new Set(getPendingHabits().map((h) => h.id));
  const names = notified.filter((h) => pendingIds.has(h.id)).map((h) => h.name);
  return names.length === 0 ? null : `- ${names.join('\n- ')}`;
}

/** L'heure du rappel quotidien ("HH:MM"), ou null s'il est désactivé. */
export function getHabitsReminderTime(): string | null {
  return getSetting(SETTING_HABITS_REMINDER_TIME);
}

/**
 * Efface la notification précédente et en programme une nouvelle d'après la
 * base. Renvoie true si le rappel réglé est bien en place (ou s'il n'y a rien
 * à programmer).
 *
 * On n'a pas besoin de mémoriser l'identifiant de la notification : elle porte
 * un marqueur qui permet de la retrouver, y compris après un import de
 * sauvegarde où tout identifiant conservé serait de toute façon périmé.
 */
async function reschedule(): Promise<boolean> {
  await cancelDailyReminders();
  const time = getHabitsReminderTime();
  if (time === null) return true;
  const body = reminderBody();
  if (body === null) return true; // tout est validé : rien à rappeler

  const [hour, minute] = time.split(':').map(Number);
  const notifId = await scheduleDailyReminder(hour, minute, REMINDER_TITLE, body);
  return notifId !== null;
}

/** File d'attente : deux habitudes validées coup sur coup ne doivent pas se croiser. */
let queue: Promise<boolean> = Promise.resolve(true);

/**
 * Met une reprogrammation en file. Sans elle, deux synchros entrelacées
 * (effacer, effacer, programmer, programmer) laisseraient deux notifications.
 */
function enqueue(): Promise<boolean> {
  queue = queue.then(reschedule, reschedule);
  return queue;
}

/**
 * Règle (ou coupe, avec `null`) le rappel quotidien : l'heure est gardée en
 * base, puis la notification est reprogrammée. Renvoie true si le rappel
 * demandé est bien en place.
 */
export function setHabitsReminderTime(time: string | null): Promise<boolean> {
  setSetting(SETTING_HABITS_REMINDER_TIME, time);
  return enqueue();
}

/**
 * Remet la notification système en accord avec ce qui est enregistré : elle est
 * (re)programmée — avec le texte à jour — si une heure est réglée et qu'il reste
 * quelque chose à valider, et effacée sinon (le cas d'une sauvegarde importée
 * qui, elle, n'avait pas de rappel).
 */
export async function syncHabitsReminder(): Promise<void> {
  await enqueue();
}
