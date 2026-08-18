/**
 * notifications.ts — les rappels locaux, via expo-notifications.
 *
 * Deux usages : le rappel ponctuel d'un to-do (`scheduleReminder`) et le
 * rappel QUOTIDIEN des habitudes (`scheduleDailyReminder`), qui se répète tout
 * seul chaque jour à heure fixe — inutile de le reprogrammer.
 *
 * Ce sont des notifications LOCALES programmées (aucun serveur). Elles ne
 * fonctionnent pas dans Expo Go : il faut un build de dev/preview (ce que tu
 * fais déjà avec EAS). Toutes les fonctions échouent en douceur (no-op) si la
 * permission est refusée, pour ne jamais casser le reste de l'app.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Marqueur glissé dans les rappels quotidiens, pour les retrouver plus tard. */
const DAILY_KIND = 'habits-daily';

// Comment afficher une notif quand l'app est au premier plan.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** À appeler une fois au démarrage : crée les canaux Android + demande la permission. */
export async function initNotifications(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('rappels', {
        name: 'Rappels',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      // Canal séparé : l'utilisateur peut couper le rappel quotidien des
      // habitudes depuis Android sans perdre les rappels de to-dos.
      await Notifications.setNotificationChannelAsync('habitudes', {
        name: 'Habitudes',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    await Notifications.requestPermissionsAsync();
  } catch {
    // permission refusée ou module indisponible : on ignore.
  }
}

/**
 * Programme un rappel à la date donnée. Renvoie l'identifiant de la notif
 * (à stocker pour pouvoir l'annuler), ou null si ça n'a pas pu se faire.
 */
export async function scheduleReminder(
  date: Date,
  title: string,
  body: string,
): Promise<string | null> {
  if (date.getTime() <= Date.now()) return null; // dans le passé : rien à faire
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: { date, channelId: 'rappels' },
    });
  } catch {
    return null;
  }
}

/**
 * Programme un rappel QUOTIDIEN à `hour:minute` (heure locale), qui se répète
 * indéfiniment. Renvoie l'identifiant de la notif (à stocker pour l'annuler),
 * ou null si ça n'a pas pu se faire.
 *
 * Le texte est figé une fois pour toutes : une notification répétitive ne peut
 * pas être personnalisée au moment où elle sonne (« il te reste 3 habitudes »
 * serait donc impossible).
 */
export async function scheduleDailyReminder(
  hour: number,
  minute: number,
  title: string,
  body: string,
): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { kind: DAILY_KIND } },
      trigger: { hour, minute, repeats: true, channelId: 'habitudes' },
    });
  } catch {
    return null;
  }
}

/**
 * Annule TOUS les rappels quotidiens déjà programmés, y compris ceux dont on a
 * perdu l'identifiant — c'est le cas après l'import d'une sauvegarde, qui
 * ramène un id périmé. Sans ce ménage, l'ancienne notification continuerait de
 * sonner chaque jour sans qu'on puisse la retrouver. Les rappels de to-dos, eux,
 * ne portent pas le marqueur et ne sont pas touchés.
 */
export async function cancelDailyReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      const data = n.content.data as { kind?: string } | undefined;
      if (data?.kind === DAILY_KIND) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {
    // module indisponible : on ignore.
  }
}

/** Annule un rappel programmé (si l'id existe). */
export async function cancelReminder(notifId: string | null): Promise<void> {
  if (!notifId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {
    // déjà annulé / indisponible : on ignore.
  }
}
