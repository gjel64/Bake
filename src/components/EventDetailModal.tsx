/**
 * EventDetailModal — la fiche d'un événement d'abonnement .ics.
 *
 * Ces événements sont en LECTURE SEULE (réécrits à chaque synchronisation) :
 * pas de formulaire, seulement le détail — quand, où, quel abonnement, quels
 * rappels — et deux actions qui ne modifient pas l'événement :
 *  - « Créer une tâche » : ouvre un to-do pré-rempli (le parent s'en charge) ;
 *  - « Alarme dans l'Horloge » (Android).
 *
 * Les rappels s'affichent sans pouvoir s'éditer ici : ils appartiennent à
 * l'abonnement entier et se règlent dans sa fiche, depuis les Réglages.
 */

import { useMemo, useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ClockAlarmButton } from '@/components/ClockAlarmButton';
import { EventItem, getCalendar } from '@/db/database';
import { summarizeReminders } from '@/lib/eventReminders';
import { labelDayLong } from '@/lib/dates';
import { font, radius, spacing, useC, type Palette } from '@/theme';

type Props = {
  event: EventItem | null; // null = fermée
  onClose: () => void;
  onMakeTodo: (ev: EventItem) => void;
};

/** Quand a lieu un événement, ex : "lundi 6 juillet, 14:00 – 15:00". */
export function eventWhenLabel(ev: EventItem): string {
  return ev.end_day > ev.day
    ? `Du ${labelDayLong(ev.day)} (${ev.start}) au ${labelDayLong(ev.end_day)} (${ev.end})`
    : `${labelDayLong(ev.day)}, ${ev.start} – ${ev.end}`;
}

export function EventDetailModal({ event, onClose, onMakeTodo }: Props) {
  const c = useC();
  const styles = makeStyles(c);

  // On garde le dernier événement affiché : la fiche reste remplie pendant
  // qu'elle glisse vers le bas, après que le parent l'a remise à null.
  const last = useRef<EventItem | null>(event);
  if (event) last.current = event;
  const ev = last.current;

  const calendarName = useMemo(
    () => (ev?.calendar_id != null ? getCalendar(ev.calendar_id)?.name : undefined),
    [ev],
  );

  return (
    <Modal visible={event !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {ev && (
            <ScrollView>
              <View style={styles.titleRow}>
                <View style={[styles.titleBar, { backgroundColor: ev.color ?? c.primary }]} />
                <Text style={styles.title}>{ev.title}</Text>
              </View>

              <InfoRow icon="time-outline" text={eventWhenLabel(ev)} />
              {ev.location !== '' && <InfoRow icon="location-outline" text={ev.location} />}
              <InfoRow
                icon="calendar-outline"
                text={`Abonnement « ${calendarName ?? 'agenda externe'} » — lecture seule`}
              />
              <InfoRow
                icon={ev.reminder_alarm === 1 ? 'alarm-outline' : 'notifications-outline'}
                text={summarizeReminders(ev.reminders, ev.reminder_alarm === 1)}
              />
              <Text style={styles.hint}>
                Les rappels valent pour tout l’abonnement : ils se règlent dans sa fiche, depuis les Réglages.
              </Text>

              <View style={styles.actions}>
                <Pressable
                  onPress={() => onMakeTodo(ev)}
                  style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="checkbox-outline" size={18} color={c.aurora} />
                  <Text style={styles.actionText}>Créer une tâche</Text>
                </Pressable>
                <ClockAlarmButton title={ev.title} day={ev.day} start={ev.start} />
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Une ligne d'information : icône + texte. */
function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const c = useC();
  const styles = makeStyles(c);
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={c.primary} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0009' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '80%',
    backgroundColor: c.nightAlt,
    borderTopWidth: 1,
    borderColor: c.glassBorder,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  handle: {
    alignSelf: 'center', width: 44, height: 5, borderRadius: radius.pill,
    backgroundColor: c.border, marginBottom: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm, marginBottom: spacing.md },
  titleBar: { width: 4, borderRadius: 2 },
  title: { flex: 1, fontSize: font.heading, fontWeight: '700', color: c.text },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: c.surfaceAlt, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, marginTop: spacing.sm,
  },
  infoText: { flex: 1, fontSize: font.body, color: c.text },
  hint: { fontSize: font.tiny, color: c.textMuted, marginTop: spacing.xs, marginHorizontal: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: c.glassBorder, borderRadius: radius.md,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm,
  },
  actionText: { fontSize: font.small, color: c.text, fontWeight: '600' },
});
