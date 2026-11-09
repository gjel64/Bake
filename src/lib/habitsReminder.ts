/**
 * habitsReminder.ts — le rappel QUOTIDIEN des habitudes.
 *
 * Chaque matin, à une heure choisie dans les réglages ("HH:MM", heure locale),
 * une notification liste les habitudes COCHÉES dans les réglages
 * (`habits.notify`) qui restent à valider ce jour-là, une par ligne.
 *
 * Sur Android (build natif à jour), c'est le module local `modules/bake-habits`
 * qui s'en charge, et la notification est PERSISTANTE :
 *  - elle se met à jour, sans sonner, à chaque habitude validée, et disparaît
 *    quand tout est fait ;
 *  - si on la balaie, elle revient aussitôt (tant qu'il reste quelque chose) ;
 *  - une alarme native la réaffiche chaque matin, app fermée, sans limite de
 *    durée : le natif garde le texte d'un jour ordinaire (toutes les habitudes
 *    cochées) et celui d'aujourd'hui (ce qui reste). La liste de la veille est
 *    retirée avant l'heure du rappel.
 *
 * Ailleurs (iOS, Expo Go, ou tant que l'APK n'a pas été rebuildé), repli sur
 * des notifications expo DATÉES, une par jour sur `WINDOW_DAYS` jours : on ne
 * peut alors ni modifier une notification déjà affichée, ni l'empêcher d'être
 * balayée. Les notifs expo du rappel — ce repli, ou l'ancienne notification
 * répétitive de la v5.4 — sont effacées à chaque synchro dans tous les cas.
 *
 * Ce module fait le pont entre le réglage stocké en base (`settings`) et le
 * système — `lib/notifications.ts` et le module natif ignorent la base.
 *
 * `syncHabitsReminder()` est le point d'entrée à rejouer dès que le réglage, la
 * liste des habitudes citées OU ce qui reste à valider a pu bouger : à chaque
 * ouverture de l'app, après la validation d'une habitude, son ajout, son
 * archivage ou sa remise (une habitude archivée n'est plus citée), après un
 * changement de sélection, et après l'import d'une sauvegarde (qui peut aussi
 * bien poser une autre heure que couper le rappel).
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import {
  Habit,
  SETTING_HABITS_REMINDER_TIME,
  getActiveHabits,
  getNotifiedHabits,
  getPendingHabits,
  getSetting,
  setSetting,
} from '@/db/database';
import { addDays, fromDayKey, todayKey } from '@/lib/dates';
import { cancelDailyReminders, scheduleHabitsReminder } from '@/lib/notifications';

/** Ce qu'expose le module natif `BakeHabits` (modules/bake-habits). */
type BakeHabitsNative = {
  /** Renvoie false si les notifications sont refusées. */
  sync(
    hour: number,
    minute: number,
    title: string,
    body: string | null,
    today: string,
    todayBody: string | null,
  ): boolean;
  stop(): void;
};

const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<BakeHabitsNative>('BakeHabits') : null;

/** Titre de la notification. */
const REMINDER_TITLE = 'Tes habitudes';

/** Texte de repli quand aucune habitude n'est cochée dans les réglages. */
const REMINDER_FALLBACK = 'Un petit moment pour toi : valide tes habitudes du jour.';

/**
 * Repli seulement : nombre de jours programmés d'avance, aujourd'hui compris.
 * Borné par iOS (64 notifications en attente au total, voir `lib/eventReminders.ts`).
 */
const WINDOW_DAYS = 7;

/**
 * Le texte d'un rappel : les habitudes cochées parmi `pending` (ce qui reste à
 * valider ce jour-là), une par ligne (« - Sport »), ou null s'il n'y a rien à
 * rappeler. Sans habitude cochée, le texte de repli tant qu'il reste quelque
 * chose — la notification étant persistante, elle doit pouvoir disparaître.
 * Attention, Android n'affiche que la PREMIÈRE ligne tant que la notification
 * n'est pas dépliée — c'est le titre qui porte le sens au premier coup d'œil.
 */
function reminderBody(notified: Habit[], pending: Habit[]): string | null {
  if (pending.length === 0) return null;
  if (notified.length === 0) return REMINDER_FALLBACK;
  const pendingIds = new Set(pending.map((h) => h.id));
  const names = notified.filter((h) => pendingIds.has(h.id)).map((h) => h.name);
  return names.length === 0 ? null : `- ${names.join('\n- ')}`;
}

/** L'heure du rappel quotidien ("HH:MM"), ou null s'il est désactivé. */
export function getHabitsReminderTime(): string | null {
  return getSetting(SETTING_HABITS_REMINDER_TIME);
}

/**
 * Remet le rappel en accord avec la base. Renvoie true si le rappel réglé est
 * bien en place (ou s'il n'y a rien à programmer).
 *
 * On n'a pas besoin de mémoriser d'identifiant : les notifs expo portent un
 * marqueur qui permet de les retrouver, y compris après un import de
 * sauvegarde, et le module natif n'a qu'une seule notification.
 */
async function reschedule(): Promise<boolean> {
  await cancelDailyReminders();
  const time = getHabitsReminderTime();
  if (time === null) {
    try {
      native?.stop();
    } catch {
      // module indisponible : rien à couper.
    }
    return true;
  }

  const [hour, minute] = time.split(':').map(Number);
  const notified = getNotifiedHabits();
  const everyDay = reminderBody(notified, getActiveHabits()); // rien n'y est encore validé
  const today = todayKey();
  const todayBody = reminderBody(notified, getPendingHabits());

  if (native) {
    try {
      return native.sync(hour, minute, REMINDER_TITLE, everyDay, today, todayBody);
    } catch {
      return false;
    }
  }

  // Repli : une notification datée par jour.
  const now = Date.now();
  let ok = true;
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const at = fromDayKey(addDays(today, i));
    at.setHours(hour, minute, 0, 0);
    if (at.getTime() <= now) continue; // l'heure est passée aujourd'hui
    const body = i === 0 ? todayBody : everyDay;
    if (body === null) continue; // rien à rappeler ce jour-là
    if (!(await scheduleHabitsReminder(at, REMINDER_TITLE, body))) ok = false;
  }
  return ok;
}

/** File d'attente : deux habitudes validées coup sur coup ne doivent pas se croiser. */
let queue: Promise<boolean> = Promise.resolve(true);

/**
 * Met une reprogrammation en file. Sans elle, deux synchros entrelacées
 * (effacer, effacer, programmer, programmer) doubleraient les rappels.
 */
function enqueue(): Promise<boolean> {
  queue = queue.then(reschedule, reschedule);
  return queue;
}

/**
 * Règle (ou coupe, avec `null`) le rappel quotidien : l'heure est gardée en
 * base, puis le rappel est reprogrammé. Renvoie true si le rappel demandé est
 * bien en place.
 */
export function setHabitsReminderTime(time: string | null): Promise<boolean> {
  setSetting(SETTING_HABITS_REMINDER_TIME, time);
  return enqueue();
}

/**
 * Remet le rappel en accord avec ce qui est enregistré : (re)programmé — avec
 * le texte à jour — si une heure est réglée, coupé sinon (le cas d'une
 * sauvegarde importée qui, elle, n'avait pas de rappel).
 */
export async function syncHabitsReminder(): Promise<void> {
  await enqueue();
}
