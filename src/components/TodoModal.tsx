/**
 * TodoModal — créer ou modifier un to-do.
 *
 * Champs : titre, catégorie, priorité, notes, et un rappel optionnel
 * (notification programmée à une date/heure). En mode édition, un bouton
 * supprime le to-do.
 *
 * La sauvegarde est ASYNCHRONE car programmer/annuler une notification l'est.
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { CategoryPicker } from '@/components/CategoryPicker';
import { PriorityPicker } from '@/components/PriorityPicker';
import { Todo, addTodo, deleteTodo, updateTodo } from '@/db/database';
import { cancelReminder, scheduleReminder } from '@/lib/notifications';
import { font, radius, spacing, useC, type Palette } from '@/theme';

type Props = {
  visible: boolean;
  todo: Todo | null; // null = création
  onClose: () => void;
  onSaved: () => void;
};

type PickerKind = 'date' | 'time' | null;

/** Date par défaut du rappel : demain à 9 h. */
function defaultRemind(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function formatRemind(d: Date): string {
  return d.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function TodoModal({ visible, todo, onClose, onSaved }: Props) {
  const c = useC();
  const styles = makeStyles(c);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [priority, setPriority] = useState(1);
  const [notes, setNotes] = useState('');
  const [remindOn, setRemindOn] = useState(false);
  const [remindDate, setRemindDate] = useState<Date>(defaultRemind());
  const [picker, setPicker] = useState<PickerKind>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(todo?.title ?? '');
    setCategoryId(todo?.category_id ?? null);
    setPriority(todo?.priority ?? 1);
    setNotes(todo?.notes ?? '');
    setRemindOn(!!todo?.remind_at);
    setRemindDate(todo?.remind_at ? new Date(todo.remind_at) : defaultRemind());
    setPicker(null);
  }, [visible, todo]);

  async function submit() {
    const t = title.trim();
    if (t.length === 0 || saving) return;
    setSaving(true);

    // Gestion du rappel : on annule l'ancien, on programme le nouveau.
    await cancelReminder(todo?.notif_id ?? null);
    let notifId: string | null = null;
    let remindAt: string | null = null;
    if (remindOn) {
      remindAt = remindDate.toISOString();
      notifId = await scheduleReminder(remindDate, 'Rappel', t);
    }

    if (todo) updateTodo(todo.id, t, notes, categoryId, priority, remindAt, notifId);
    else addTodo(t, notes, categoryId, priority, remindAt, notifId);

    setSaving(false);
    onSaved();
    onClose();
  }

  function remove() {
    if (!todo) return;
    Alert.alert('Supprimer', `Supprimer « ${todo.title} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await cancelReminder(todo.notif_id);
          deleteTodo(todo.id);
          onSaved();
          onClose();
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{todo ? 'Modifier la tâche' : 'Nouvelle tâche'}</Text>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Que faut-il faire ?"
              placeholderTextColor={c.textMuted}
              style={styles.input}
              autoFocus={!todo}
            />

            <Text style={styles.label}>Catégorie</Text>
            <CategoryPicker value={categoryId} onChange={setCategoryId} />

            <Text style={styles.label}>Priorité</Text>
            <PriorityPicker value={priority} onChange={setPriority} />

            <Text style={styles.label}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Détails (optionnel)"
              placeholderTextColor={c.textMuted}
              style={[styles.input, styles.multiline]}
              multiline
            />

            {/* Rappel */}
            <View style={styles.remindRow}>
              <View style={styles.remindLeft}>
                <Ionicons name="notifications-outline" size={18} color={c.aurora} />
                <Text style={styles.remindLabel}>Rappel</Text>
              </View>
              <Switch
                value={remindOn}
                onValueChange={setRemindOn}
                trackColor={{ true: c.primary, false: c.surfaceStrong }}
                thumbColor={c.white}
              />
            </View>
            {remindOn && (
              <View style={styles.remindPickers}>
                <Pressable onPress={() => setPicker('date')} style={styles.remindPick}>
                  <Ionicons name="calendar-outline" size={16} color={c.primary} />
                  <Text style={styles.remindPickText}>{formatRemind(remindDate)}</Text>
                </Pressable>
              </View>
            )}

            <Pressable
              onPress={submit}
              disabled={title.trim().length === 0 || saving}
              style={({ pressed }) => [
                styles.submit,
                (pressed || title.trim().length === 0 || saving) && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.submitText}>{todo ? 'Enregistrer' : 'Ajouter'}</Text>
            </Pressable>

            {todo && (
              <Pressable onPress={remove} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={18} color={c.danger} />
                <Text style={styles.deleteText}>Supprimer</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Sélecteur natif : date puis heure */}
      {picker !== null && (
        <DateTimePicker
          value={remindDate}
          mode={picker === 'date' ? 'date' : 'time'}
          is24Hour
          onChange={(_e, sel) => {
            if (picker === 'date') {
              setPicker(null);
              if (sel) {
                // on garde l'heure actuelle, on met à jour la date, puis on demande l'heure
                const d = new Date(remindDate);
                d.setFullYear(sel.getFullYear(), sel.getMonth(), sel.getDate());
                setRemindDate(d);
                setTimeout(() => setPicker('time'), 150);
              }
            } else {
              setPicker(null);
              if (sel) {
                const d = new Date(remindDate);
                d.setHours(sel.getHours(), sel.getMinutes(), 0, 0);
                setRemindDate(d);
              }
            }
          }}
        />
      )}
    </Modal>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0009' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
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
  title: { fontSize: font.heading, fontWeight: '700', color: c.text, marginBottom: spacing.md },
  input: {
    backgroundColor: c.surfaceAlt, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: font.body, color: c.text,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top', marginTop: 0 },
  label: { fontSize: font.small, color: c.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  remindRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  remindLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  remindLabel: { fontSize: font.body, color: c.text, fontWeight: '600' },
  remindPickers: { marginTop: spacing.sm },
  remindPick: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start',
    backgroundColor: c.surfaceAlt, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  remindPickText: { fontSize: font.body, color: c.text, fontWeight: '600' },
  submit: {
    marginTop: spacing.lg, backgroundColor: c.primary, borderRadius: radius.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  submitText: { color: c.textOnAurora, fontSize: font.body, fontWeight: '700' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, marginTop: spacing.xs,
  },
  deleteText: { color: c.danger, fontSize: font.body, fontWeight: '600' },
});
