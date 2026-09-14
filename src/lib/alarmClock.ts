/**
 * alarmClock.ts — poser une alarme dans l'app Horloge du téléphone (Android).
 *
 * Passe par le petit module natif local `modules/bake-alarm`, qui lance
 * l'intent système `AlarmClock.ACTION_SET_ALARM`. Un module natif est
 * indispensable : `Linking.sendIntent` de React Native transmet tous les
 * nombres en `Double`, alors que l'Horloge lit l'heure en `Int` — l'alarme
 * partirait à la mauvaise heure.
 *
 * Limite du système, pas de l'app : l'Horloge ne reçoit qu'une HEURE, jamais
 * une date. L'alarme sonne à la prochaine occurrence de cette heure ; on refuse
 * donc tout ce qui tombe au-delà de 24 h (elle sonnerait le mauvais jour). Pour
 * plus loin, les rappels « alarme » de Bake (`lib/eventReminders.ts`) prennent
 * le relais.
 *
 * Absent sur iOS, dans Expo Go, ou tant que l'app n'a pas été rebuildée : tout
 * échoue alors en douceur (`canSetClockAlarm()` vaut false).
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/** Ce qu'expose le module natif `BakeAlarm`. */
type BakeAlarmNative = {
  setAlarm(hour: number, minute: number, message: string): boolean;
};

const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<BakeAlarmNative>('BakeAlarm') : null;

/** Au-delà, l'Horloge (qui ignore la date) sonnerait le mauvais jour. */
const MAX_AHEAD_MS = 24 * 3_600_000;

/** L'issue d'une demande d'alarme. */
export type ClockAlarmResult = 'ok' | 'past' | 'too-far' | 'unavailable';

/** Vrai si l'app peut poser une alarme dans l'Horloge (Android, build natif à jour). */
export function canSetClockAlarm(): boolean {
  return native !== null;
}

/** Pose une alarme à `date` (heure locale) dans l'Horloge, avec `label` comme nom. */
export function setClockAlarm(date: Date, label: string): ClockAlarmResult {
  if (!native) return 'unavailable';
  const ahead = date.getTime() - Date.now();
  if (ahead <= 0) return 'past';
  if (ahead > MAX_AHEAD_MS) return 'too-far';
  try {
    return native.setAlarm(date.getHours(), date.getMinutes(), label) ? 'ok' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
