/**
 * ReminderPicker — choisir les rappels d'un événement (ou d'un abonnement).
 *
 * Un seul bouton, qui résume le choix courant (« 15 min avant, 1 h avant ») ;
 * le toucher ouvre une liste déroulante des délais proposés (`REMINDER_PRESETS`),
 * où l'on en coche un ou plusieurs. Dès qu'un rappel est choisi, un
 * interrupteur « Sonner comme une alarme » apparaît sous le bouton (canal
 * Android dédié, volume des alarmes).
 *
 * La liste est une modale posée DANS la feuille parente : Android comme iOS
 * savent empiler une modale enfant tant qu'elle est rendue dans l'arbre de la
 * première.
 *
 * Composant contrôlé : il ne touche pas la base, le parent enregistre.
 */

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { REMINDER_PRESETS, labelReminder, summarizeReminders } from '@/lib/eventReminders';
import { font, radius, spacing, useC, type Palette } from '@/theme';

type Props = {
  value: number[]; // minutes avant le début
  onChange: (minutes: number[]) => void;
  alarm: boolean;
  onAlarmChange: (on: boolean) => void;
};

export function ReminderPicker({ value, onChange, alarm, onAlarmChange }: Props) {
  const c = useC();
  const styles = makeStyles(c);
  const [open, setOpen] = useState(false);

  /** Coche / décoche un délai ; la liste reste triée. */
  function toggle(minutes: number) {
    onChange(
      value.includes(minutes)
        ? value.filter((m) => m !== minutes)
        : [...value, minutes].sort((a, b) => a - b),
    );
  }

  const none = value.length === 0;

  return (
    <View>
      {/* Le bouton : le choix courant, en résumé */}
      <Pressable onPress={() => setOpen(true)} style={styles.field}>
        <Ionicons
          name={alarm && !none ? 'alarm-outline' : 'notifications-outline'}
          size={18}
          color={c.primary}
        />
        <Text style={[styles.fieldText, none && styles.fieldTextMuted]} numberOfLines={1}>
          {summarizeReminders(value, false)}
        </Text>
        <Ionicons name="chevron-down" size={18} color={c.textMuted} />
      </Pressable>

      {!none && (
        <View style={styles.alarmRow}>
          <View style={styles.alarmLeft}>
            <Ionicons name="alarm-outline" size={18} color={c.aurora} />
            <View style={styles.alarmTexts}>
              <Text style={styles.alarmLabel}>Sonner comme une alarme</Text>
              <Text style={styles.alarmHint}>Volume des alarmes, même en silencieux</Text>
            </View>
          </View>
          <Switch
            value={alarm}
            onValueChange={onAlarmChange}
            trackColor={{ true: c.primary, false: c.surfaceStrong }}
            thumbColor={c.white}
          />
        </View>
      )}

      {/* La liste déroulante des délais */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.center} pointerEvents="box-none">
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Rappels</Text>
            <ScrollView style={styles.menuList}>
              {REMINDER_PRESETS.map((minutes) => {
                const active = value.includes(minutes);
                return (
                  <Pressable
                    key={minutes}
                    onPress={() => toggle(minutes)}
                    style={({ pressed }) => [styles.option, pressed && { backgroundColor: c.surfaceAlt }]}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>
                      {labelReminder(minutes)}
                    </Text>
                    <Ionicons
                      name={active ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={active ? c.primary : c.textFaint}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.menuFooter}>
              {!none && (
                <Pressable onPress={() => onChange([])} hitSlop={8}>
                  <Text style={styles.clear}>Aucun rappel</Text>
                </Pressable>
              )}
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setOpen(false)} style={styles.ok}>
                <Text style={styles.okText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: c.surfaceAlt, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
  },
  fieldText: { flex: 1, fontSize: font.body, color: c.text, fontWeight: '600' },
  fieldTextMuted: { color: c.textMuted, fontWeight: '400' },
  alarmRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  alarmLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  alarmTexts: { flex: 1 },
  alarmLabel: { fontSize: font.body, color: c.text },
  alarmHint: { fontSize: font.tiny, color: c.textMuted },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0008' },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  menu: {
    backgroundColor: c.nightAlt, borderRadius: radius.lg,
    borderWidth: 1, borderColor: c.glassBorder,
    paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  menuTitle: {
    fontSize: font.body, fontWeight: '700', color: c.text,
    paddingHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  // Environ cinq lignes visibles : le reste défile.
  menuList: { maxHeight: 260 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 4,
  },
  optionText: { fontSize: font.body, color: c.text },
  optionTextActive: { color: c.primary, fontWeight: '700' },
  menuFooter: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.glassBorder,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, marginTop: spacing.xs,
  },
  clear: { fontSize: font.small, color: c.danger, fontWeight: '600' },
  ok: {
    backgroundColor: c.primary, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs + 2,
  },
  okText: { color: c.textOnAurora, fontSize: font.body, fontWeight: '700' },
});
