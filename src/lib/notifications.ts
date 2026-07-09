/**
 * notifications.ts — les rappels de to-dos, via expo-notifications.
 *
 * Ce sont des notifications LOCALES programmées (aucun serveur). Elles ne
 * fonctionnent pas dans Expo Go : il faut un build de dev/preview (ce que tu
 * fais déjà avec EAS). Toutes les fonctions échouent en douceur (no-op) si la
 * permission est refusée, pour ne jamais casser le reste de l'app.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Comment afficher une notif quand l'app est au premier plan.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** À appeler une fois au démarrage : crée le canal Android + demande la permission. */
export async function initNotifications(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('rappels', {
        name: 'Rappels',
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

/** Annule un rappel programmé (si l'id existe). */
export async function cancelReminder(notifId: string | null): Promise<void> {
  if (!notifId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {
    // déjà annulé / indisponible : on ignore.
  }
}
