/**
 * eventReminders.ts — les rappels AVANT les événements de l'agenda.
 *
 * Un événement perso porte ses propres rappels (« 15 min avant », « 1 h
 * avant »…) ; un événement d'abonnement .ics prend ceux de son abonnement,
 * puisqu'il est réécrit à chaque synchronisation. Chaque rappel peut sonner
 * comme une simple notification ou comme une ALARME (canal Android dédié, qui
 * passe par le volume des alarmes et traverse le mode Ne pas déranger).
 *
 * Même logique que le rappel des habitudes : on ne garde AUCUN identifiant de
 * notification. Les rappels portent le marqueur `data.kind = 'event-reminder'`,
 * et `syncEventReminders()` efface tout le lot pour le reprogrammer d'après la
 * base. C'est ce qui le rend sûr après une synchro .ics (les ids d'événements
 * changent), une suppression, ou l'import d'une sauvegarde.
 *
 * Deux limites assumées :
 *  - on ne programme que les `WINDOW_DAYS` prochains jours, et au plus
 *    `MAX_SCHEDULED` rappels (iOS refuse au-delà de 64 notifications en
 *    attente). La fenêtre avance à chaque ouverture de l'app ou de l'agenda ;
 *  - un rappel programmé est figé : il faut rejouer `syncEventReminders()`
 *    après TOUT ce qui touche aux événements ou aux rappels.
 */

import { EventItem, getEventsWithReminders } from '@/db/database';
import { addDays, fromDayKey, labelDayShort, todayKey } from '@/lib/dates';
import { cancelEventReminders, scheduleEventReminder } from '@/lib/notifications';

/** Les délais proposés, en minutes avant le début de l'événement. */
export const REMINDER_PRESETS: readonly number[] = [0, 5, 15, 30, 60, 120, 1440];

/** Horizon de programmation, en jours. */
const WINDOW_DAYS = 14;

/**
 * Plafond de rappels programmés d'un coup. iOS n'en garde que 64 en attente au
 * total : il faut laisser la place aux 7 rappels des habitudes
 * (`lib/habitsReminder.ts`) et aux rappels de to-dos.
 */
const MAX_SCHEDULED = 50;

/** Une durée lisible : 5 → "5 min", 60 → "1 h", 90 → "1 h 30", 1440 → "1 jour". */
function labelDelay(minutes: number): string {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? '1 jour' : `${days} jours`;
  }
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
  }
  return `${minutes} min`;
}

/** Le libellé d'un rappel : 0 → "À l'heure", 15 → "15 min avant". */
export function labelReminder(minutes: number): string {
  return minutes === 0 ? 'À l’heure' : `${labelDelay(minutes)} avant`;
}

/** Résumé d'une liste de rappels, ex : "15 min avant, 1 h avant · alarme". */
export function summarizeReminders(minutes: number[], alarm: boolean): string {
  if (minutes.length === 0) return 'Aucun rappel';
  return `${minutes.map(labelReminder).join(', ')}${alarm ? ' · alarme' : ''}`;
}

/** Le début d'un événement, en date locale (premier jour, heure de début). */
export function eventStartDate(ev: Pick<EventItem, 'day' | 'start'>): Date {
  const [h, m] = ev.start.split(':').map(Number);
  const d = fromDayKey(ev.day);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/** Le texte d'un rappel, ex : "Dans 15 min · 14:00 – 15:00 · Salle B". */
function reminderBody(ev: EventItem, minutes: number): string {
  const lead = minutes === 0 ? 'Maintenant' : `Dans ${labelDelay(minutes)}`;
  const when =
    ev.end_day > ev.day
      ? `dès ${ev.start}, jusqu’au ${labelDayShort(ev.end_day)} ${ev.end}`
      : `${ev.start} – ${ev.end}`;
  const where = ev.location ? ` · ${ev.location}` : '';
  return `${lead} · ${when}${where}`;
}

/** Efface puis reprogramme tous les rappels d'événements (jamais d'exception). */
async function reschedule(): Promise<void> {
  try {
    await cancelEventReminders();

    const now = Date.now();
    const horizon = now + WINDOW_DAYS * 86_400_000;
    const today = todayKey();
    // Le plus long délai proposé est d'un jour : un événement juste au-delà de
    // la fenêtre peut donc encore y faire tomber un rappel.
    const events = getEventsWithReminders(today, addDays(today, WINDOW_DAYS + 1));

    const due: { at: Date; ev: EventItem; minutes: number }[] = [];
    for (const ev of events) {
      const start = eventStartDate(ev).getTime();
      for (const minutes of ev.reminders) {
        const at = start - minutes * 60_000;
        if (at > now && at <= horizon) due.push({ at: new Date(at), ev, minutes });
      }
    }
    due.sort((a, b) => a.at.getTime() - b.at.getTime());

    for (const { at, ev, minutes } of due.slice(0, MAX_SCHEDULED)) {
      await scheduleEventReminder(at, ev.title, reminderBody(ev, minutes), ev.reminder_alarm === 1);
    }
  } catch {
    // base ou notifications indisponibles : on ne casse jamais l'app pour un rappel.
  }
}

/** File d'attente : deux synchros lancées coup sur coup ne doivent pas se croiser. */
let queue: Promise<void> = Promise.resolve();

/**
 * Remet les notifications système en accord avec la base : à rejouer après
 * chaque ajout / modification / suppression d'événement, chaque synchro .ics,
 * chaque changement des rappels d'un abonnement, et après un import.
 * Les appels sont mis en file : sinon deux synchros entrelacées (effacer,
 * effacer, programmer, programmer) doubleraient chaque rappel.
 */
export function syncEventReminders(): Promise<void> {
  queue = queue.then(reschedule);
  return queue;
}
