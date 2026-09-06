/**
 * habitsReminder.ts — le rappel QUOTIDIEN des habitudes.
 *
 * Une seule notification pour toutes les habitudes, à une heure choisie par
 * l'utilisateur dans les réglages ("HH:MM", heure locale). Elle se répète
 * chaque jour toute seule : il n'y a rien à reprogrammer au fil des jours.
 *
 * Son texte liste les habitudes COCHÉES dans les réglages (`habits.notify`),
 * une par ligne. Ce texte est figé au moment où la notif est programmée — une
 * notification répétitive ne peut pas s'adapter à l'instant où elle sonne, donc
 * elle ne sait pas ce qui reste réellement à valider.
 *
 * Ce module fait le pont entre le réglage stocké en base (`settings`) et la
 * notification programmée dans le système — `lib/notifications.ts` reste, lui,
 * ignorant de la base de données.
 *
 * `syncHabitsReminder()` est le point d'entrée à rejouer dès que le réglage OU
 * la liste des habitudes citées a pu bouger : au démarrage, après l'ajout d'une
 * habitude, après un changement de sélection, et après l'import d'une
 * sauvegarde (qui peut aussi bien poser une autre heure que couper le rappel).
 */

import {
  SETTING_HABITS_REMINDER_TIME,
  getNotifiedHabits,
  getSetting,
  setSetting,
} from '@/db/database';
import { cancelDailyReminders, scheduleDailyReminder } from '@/lib/notifications';

/** Titre de la notification. */
const REMINDER_TITLE = 'Tes habitudes';

/** Texte de repli quand aucune habitude n'est cochée (ou qu'il n'y en a aucune). */
const REMINDER_FALLBACK = 'Un petit moment pour toi : valide tes habitudes du jour.';

/**
 * Le texte du rappel : les habitudes cochées, une par ligne (« - Sport »).
 * Attention, Android n'affiche que la PREMIÈRE ligne tant que la notification
 * n'est pas dépliée — c'est le titre qui porte le sens au premier coup d'œil.
 */
function reminderBody(): string {
  const names = getNotifiedHabits().map((h) => h.name);
  return names.length === 0 ? REMINDER_FALLBACK : `- ${names.join('\n- ')}`;
}

/** L'heure du rappel quotidien ("HH:MM"), ou null s'il est désactivé. */
export function getHabitsReminderTime(): string | null {
  return getSetting(SETTING_HABITS_REMINDER_TIME);
}

/**
 * Règle (ou coupe, avec `null`) le rappel quotidien : on efface la notification
 * précédente, on en programme une nouvelle, et on garde l'heure en base.
 * Renvoie true si le rappel demandé est bien en place.
 *
 * On n'a pas besoin de mémoriser l'identifiant de la notification : elle porte
 * un marqueur qui permet de la retrouver, y compris après un import de
 * sauvegarde où tout identifiant conservé serait de toute façon périmé.
 */
export async function setHabitsReminderTime(time: string | null): Promise<boolean> {
  await cancelDailyReminders();
  setSetting(SETTING_HABITS_REMINDER_TIME, time);
  if (time === null) return true;

  const [hour, minute] = time.split(':').map(Number);
  const notifId = await scheduleDailyReminder(hour, minute, REMINDER_TITLE, reminderBody());
  return notifId !== null;
}

/**
 * Remet la notification système en accord avec ce qui est enregistré : elle est
 * (re)programmée — avec le texte à jour — si une heure est réglée, et effacée
 * sinon (le cas d'une sauvegarde importée qui, elle, n'avait pas de rappel).
 */
export async function syncHabitsReminder(): Promise<void> {
  await setHabitsReminderTime(getHabitsReminderTime());
}
