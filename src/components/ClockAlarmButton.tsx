/**
 * ClockAlarmButton — « Alarme dans l'Horloge » pour un événement.
 *
 * Demande à quel moment sonner (à l'heure, 15 min ou 1 h avant), puis pose
 * l'alarme dans l'app Horloge du téléphone via `@/lib/alarmClock`. L'Horloge
 * ne connaissant que l'heure, un événement à plus de 24 h est refusé avec une
 * explication plutôt que de sonner le mauvais jour.
 *
 * Ne s'affiche pas du tout là où c'est impossible (iOS, Expo Go, build ancien).
 */

import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { canSetClockAlarm, setClockAlarm } from '@/lib/alarmClock';
import { eventStartDate, labelReminder } from '@/lib/eventReminders';
import { toTimeKey } from '@/lib/dates';
import { font, radius, spacing, useC, type Palette } from '@/theme';

type Props = {
  title: string;
  day: string; // premier jour de l'événement, "YYYY-MM-DD"
  start: string; // heure de début, "HH:MM"
};

/** Les moments proposés — trois, le maximum d'une alerte Android. */
const ALARM_OFFSETS = [60, 15, 0];

export function ClockAlarmButton({ title, day, start }: Props) {
  const c = useC();
  const styles = makeStyles(c);
  if (!canSetClockAlarm()) return null;

  /** Pose l'alarme `minutes` avant le début et dit ce qu'il en est. */
  function place(minutes: number) {
    const at = new Date(eventStartDate({ day, start }).getTime() - minutes * 60_000);
    const label = title.trim() || 'Événement';
    const result = setClockAlarm(at, label);
    if (result === 'ok') {
      Alert.alert('Alarme réglée', `L’Horloge sonnera à ${toTimeKey(at)} pour « ${label} ».`);
    } else if (result === 'past') {
      Alert.alert('Trop tard', 'Ce moment est déjà passé.');
    } else if (result === 'too-far') {
      Alert.alert(
        'Encore trop loin',
        'L’Horloge ne retient qu’une heure, pas une date : une alarme ne peut être posée que dans les 24 h qui précèdent. En attendant, active un rappel « alarme » ci-dessus.',
      );
    } else {
      Alert.alert('Horloge indisponible', 'Aucune app d’horloge n’a accepté l’alarme.');
    }
  }

  function ask() {
    Alert.alert(
      'Alarme dans l’Horloge',
      'À quel moment sonner ?',
      ALARM_OFFSETS.map((m) => ({ text: labelReminder(m), onPress: () => place(m) })),
      { cancelable: true },
    );
  }

  return (
    <Pressable onPress={ask} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}>
      <Ionicons name="alarm-outline" size={18} color={c.aurora} />
      <Text style={styles.text}>Alarme dans l’Horloge</Text>
    </Pressable>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: c.glassBorder, borderRadius: radius.md,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm,
  },
  text: { fontSize: font.small, color: c.text, fontWeight: '600' },
});
