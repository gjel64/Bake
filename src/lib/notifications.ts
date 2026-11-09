/**
 * notifications.ts — les rappels locaux, via expo-notifications.
 *
 * Trois usages : le rappel ponctuel d'un to-do (`scheduleReminder`), le rappel
 * quotidien des habitudes (`scheduleHabitsReminder`, une notif datée par jour,
 * orchestrées par `lib/habitsReminder.ts`), et les rappels AVANT un événement
 * de l'agenda (`scheduleEventReminder`, orchestrés par `lib/eventReminders.ts`).
 *
 * Ce sont des notifications LOCALES programmées (aucun serveur). Elles ne
 * fonctionnent pas dans Expo Go : il faut un build de dev/preview (ce que tu
 * fais déjà avec EAS). Toutes les fonctions échouent en douceur (no-op) si la
 * permission est refusée, pour ne jamais casser le reste de l'app.
 *
 * Sur Android, un canal n'est plus modifiable une fois créé (c'est l'utilisateur
 * qui en garde la main) : changer l'importance ou le son d'un canal existant
 * impose de lui donner un NOUVEL identifiant.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Marqueur glissé dans les rappels des habitudes, pour les retrouver plus tard.
 * Ne pas le renommer : c'est aussi lui qui permet d'effacer l'ancienne notif
 * répétitive (versions ≤ 5.4) restée programmée sur les téléphones.
 */
const DAILY_KIND = 'habits-daily';

/** Marqueur des rappels d'événements (tous effacés puis reprogrammés d'un bloc). */
const EVENT_KIND = 'event-reminder';

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
      // Rappels d'événements : en bandeau (importance haute).
      await Notifications.setNotificationChannelAsync('evenements', {
        name: 'Événements',
        importance: Notifications.AndroidImportance.HIGH,
      });
      // Rappels « alarme » : volume des alarmes, longue vibration, et passage
      // à travers le mode Ne pas déranger.
      await Notifications.setNotificationChannelAsync('alarmes', {
        name: 'Alarmes d’événements',
        importance: Notifications.AndroidImportance.MAX,
        bypassDnd: true,
        sound: 'default',
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.ALARM,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
        vibrationPattern: [0, 800, 400, 800, 400, 800],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
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
 * Programme UN rappel des habitudes, à la date donnée (une seule fois, pas de
 * répétition). `lib/habitsReminder.ts` en programme un par jour, chacun avec
 * son propre texte. Aucun identifiant à garder : le marqueur `DAILY_KIND`
 * suffit à tous les retrouver (`cancelDailyReminders`).
 * Renvoie false si ça n'a pas pu se faire.
 */
export async function scheduleHabitsReminder(
  date: Date,
  title: string,
  body: string,
): Promise<boolean> {
  if (date.getTime() <= Date.now()) return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { kind: DAILY_KIND } },
      trigger: { date, channelId: 'habitudes' },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Programme le rappel d'un événement à la date donnée, sur le canal « alarmes »
 * si `alarm`, sinon « evenements ». Aucun identifiant à garder : le marqueur
 * `EVENT_KIND` suffit à tous les retrouver (`cancelEventReminders`).
 * Renvoie false si ça n'a pas pu se faire.
 */
export async function scheduleEventReminder(
  date: Date,
  title: string,
  body: string,
  alarm: boolean,
): Promise<boolean> {
  if (date.getTime() <= Date.now()) return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data: { kind: EVENT_KIND },
        priority: alarm
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: { date, channelId: alarm ? 'alarmes' : 'evenements' },
    });
    return true;
  } catch {
    return false;
  }
}

/** Annule toutes les notifications programmées qui portent le marqueur `kind`. */
async function cancelKind(kind: string): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      const data = n.content.data as { kind?: string } | undefined;
      if (data?.kind === kind) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {
    // module indisponible : on ignore.
  }
}

/**
 * Annule TOUS les rappels des habitudes déjà programmés (avant de les
 * reprogrammer), y compris l'ancienne notification répétitive des versions
 * ≤ 5.4, qui porte le même marqueur. Les rappels de to-dos, eux, ne portent
 * pas le marqueur et ne sont pas touchés.
 */
export async function cancelDailyReminders(): Promise<void> {
  await cancelKind(DAILY_KIND);
}

/** Annule TOUS les rappels d'événements programmés (avant de les reprogrammer). */
export async function cancelEventReminders(): Promise<void> {
  await cancelKind(EVENT_KIND);
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
