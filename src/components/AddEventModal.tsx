/**
 * AddEventModal — création d'un événement d'agenda (titre + date + horaires).
 *
 * On utilise le sélecteur natif Android (@react-native-community/datetimepicker)
 * pour la date et les heures : c'est l'UX standard, fiable et « moderne ».
 * Sur Android il s'affiche comme une boîte de dialogue système qu'on ouvre à la
 * demande (mode 'date' ou 'time').
 *
 * Le composant renvoie des chaînes normalisées ("YYYY-MM-DD", "HH:MM") au
 * parent via `onAdd`. Il ne touche pas la base.
 */

import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { fromDayKey, labelDayLong, toDayKey, toTimeKey } from '@/lib/dates';
import { colors, font, radius, spacing } from '@/theme';

type Props = {
  visible: boolean;
  defaultDay: string; // jour présélectionné (celui qu'on regarde)
  onClose: () => void;
  onAdd: (title: string, day: string, start: string, end: string) => void;
};

// Quel sélecteur natif est ouvert (aucun le reste du temps).
type PickerKind = 'date' | 'start' | 'end' | null;

/** Un objet Date « aujourd'hui » à l'heure h:00 (pour des valeurs par défaut). */
function atHour(day: string, hour: number): Date {
  const d = fromDayKey(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function AddEventModal({ visible, defaultDay, onClose, onAdd }: Props) {
  const [title, setTitle] = useState('');
  const [day, setDay] = useState<Date>(fromDayKey(defaultDay));
  const [start, setStart] = useState<Date>(atHour(defaultDay, 9));
  const [end, setEnd] = useState<Date>(atHour(defaultDay, 10));
  const [picker, setPicker] = useState<PickerKind>(null);

  // Quand on ouvre la modale sur un autre jour, on resynchronise les valeurs.
  useEffect(() => {
    if (visible) {
      setTitle('');
      setDay(fromDayKey(defaultDay));
      setStart(atHour(defaultDay, 9));
      setEnd(atHour(defaultDay, 10));
      setPicker(null);
    }
  }, [visible, defaultDay]);

  /** Callback commun du sélecteur natif. */
  function onPick(selected: Date | undefined) {
    const kind = picker;
    setPicker(null); // sur Android le dialog se ferme après le choix
    if (!selected) return; // annulation
    if (kind === 'date') setDay(selected);
    if (kind === 'start') setStart(selected);
    if (kind === 'end') setEnd(selected);
  }

  function submit() {
    const t = title.trim();
    if (t.length === 0) return;
    onAdd(t, toDayKey(day), toTimeKey(start), toTimeKey(end));
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Nouvel événement</Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Travail, sport, méditation…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            autoFocus
          />

          {/* Ligne Date */}
          <PickerRow
            icon="calendar-outline"
            label="Date"
            value={labelDayLong(toDayKey(day))}
            onPress={() => setPicker('date')}
          />

          {/* Ligne heures début / fin côte à côte */}
          <View style={styles.timesRow}>
            <View style={styles.timeCol}>
              <PickerRow
                icon="time-outline"
                label="Début"
                value={toTimeKey(start)}
                onPress={() => setPicker('start')}
              />
            </View>
            <View style={styles.timeCol}>
              <PickerRow
                icon="time-outline"
                label="Fin"
                value={toTimeKey(end)}
                onPress={() => setPicker('end')}
              />
            </View>
          </View>

          <Pressable
            onPress={submit}
            disabled={title.trim().length === 0}
            style={({ pressed }) => [
              styles.submit,
              (pressed || title.trim().length === 0) && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.submitText}>Ajouter</Text>
          </Pressable>
        </View>
      </View>

      {/* Sélecteur natif : monté seulement quand ouvert */}
      {picker !== null && (
        <DateTimePicker
          value={picker === 'date' ? day : picker === 'start' ? start : end}
          mode={picker === 'date' ? 'date' : 'time'}
          is24Hour
          onChange={(_event, selected) => onPick(selected)}
        />
      )}
    </Modal>
  );
}

/** Une ligne « étiquette + valeur » qui ouvre un sélecteur au tap. */
function PickerRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.pickerRow}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.pickerLabel}>{label}</Text>
        <Text style={styles.pickerValue}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0006',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.nightAlt,
    borderTopWidth: 1,
    borderColor: colors.glassBorder,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: font.heading,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: font.body,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  timesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timeCol: { flex: 1 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  pickerLabel: {
    fontSize: font.small,
    color: colors.textMuted,
  },
  pickerValue: {
    fontSize: font.body,
    color: colors.text,
    fontWeight: '600',
  },
  submit: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  submitText: {
    color: colors.white,
    fontSize: font.body,
    fontWeight: '700',
  },
});
