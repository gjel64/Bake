/**
 * AddEventModal — créer / modifier un événement d'agenda.
 *
 * Nouveautés V2 :
 *  - une catégorie (couleur partagée avec les to-dos),
 *  - « Depuis un to-do » : remplir l'événement à partir d'une tâche (il reste
 *    lié — cocher l'un cochera l'autre),
 *  - mode édition (pré-rempli) avec suppression.
 *
 * Écrit directement en base puis prévient via `onSaved`.
 */

import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { CategoryPicker } from '@/components/CategoryPicker';
import {
  EventItem,
  Todo,
  addEvent,
  deleteEvent,
  getTodos,
  updateEvent,
} from '@/db/database';
import { fromDayKey, labelDayLong, toDayKey, toTimeKey } from '@/lib/dates';
import { font, radius, spacing, useC, type Palette } from '@/theme';

type Props = {
  visible: boolean;
  defaultDay: string;
  event?: EventItem | null; // édition
  presetTitle?: string; // pré-remplissage (depuis un to-do)
  presetTodoId?: number | null;
  presetCategoryId?: number | null;
  onClose: () => void;
  onSaved: () => void;
};

type PickerKind = 'date' | 'start' | 'end' | null;

function atHour(day: string, hour: number): Date {
  const d = fromDayKey(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function AddEventModal({
  visible,
  defaultDay,
  event,
  presetTitle,
  presetTodoId,
  presetCategoryId,
  onClose,
  onSaved,
}: Props) {
  const c = useC();
  const styles = makeStyles(c);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [linkTodoId, setLinkTodoId] = useState<number | null>(null);
  const [day, setDay] = useState<Date>(fromDayKey(defaultDay));
  const [start, setStart] = useState<Date>(atHour(defaultDay, 9));
  const [end, setEnd] = useState<Date>(atHour(defaultDay, 10));
  const [picker, setPicker] = useState<PickerKind>(null);
  const [todos, setTodos] = useState<Todo[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (event) {
      // Édition d'un événement existant.
      setTitle(event.title);
      setCategoryId(event.category_id);
      setLinkTodoId(event.todo_id);
      setDay(fromDayKey(event.day));
      setStart(atHour(event.day, 9));
      setEnd(atHour(event.day, 10));
      const [sh, sm] = event.start.split(':').map(Number);
      const [eh, em] = event.end.split(':').map(Number);
      setStart((s) => { const d = new Date(s); d.setHours(sh, sm); return d; });
      setEnd((e) => { const d = new Date(e); d.setHours(eh, em); return d; });
    } else {
      setTitle(presetTitle ?? '');
      setCategoryId(presetCategoryId ?? null);
      setLinkTodoId(presetTodoId ?? null);
      setDay(fromDayKey(defaultDay));
      setStart(atHour(defaultDay, 9));
      setEnd(atHour(defaultDay, 10));
      // liste des to-dos non planifiés, pour le remplissage rapide
      setTodos(getTodos().filter((t) => t.done === 0 && t.scheduled === 0));
    }
    setPicker(null);
  }, [visible, event, defaultDay, presetTitle, presetTodoId, presetCategoryId]);

  function onPick(selected: Date | undefined) {
    const kind = picker;
    setPicker(null);
    if (!selected) return;
    if (kind === 'date') setDay(selected);
    if (kind === 'start') setStart(selected);
    if (kind === 'end') setEnd(selected);
  }

  function fillFromTodo(t: Todo) {
    setTitle(t.title);
    setCategoryId(t.category_id);
    setLinkTodoId(t.id);
  }

  function submit() {
    const t = title.trim();
    if (t.length === 0) return;
    if (event) {
      updateEvent(event.id, t, toDayKey(day), toTimeKey(start), toTimeKey(end), categoryId);
    } else {
      addEvent(t, toDayKey(day), toTimeKey(start), toTimeKey(end), categoryId, linkTodoId);
    }
    onSaved();
    onClose();
  }

  function remove() {
    if (!event) return;
    deleteEvent(event.id);
    onSaved();
    onClose();
  }

  const showTodoFill = !event && todos.length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>
              {event ? 'Modifier l’événement' : 'Nouvel événement'}
            </Text>

            {showTodoFill && (
              <>
                <Text style={styles.label}>Depuis un to-do</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.todoRow}>
                  {todos.map((t) => (
                    <Pressable
                      key={t.id}
                      onPress={() => fillFromTodo(t)}
                      style={[styles.todoChip, linkTodoId === t.id && styles.todoChipActive]}
                    >
                      <Ionicons
                        name="checkbox-outline"
                        size={15}
                        color={t.cat_color ?? c.textMuted}
                      />
                      <Text style={styles.todoChipText} numberOfLines={1}>{t.title}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Travail, sport, méditation…"
              placeholderTextColor={c.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Catégorie</Text>
            <CategoryPicker value={categoryId} onChange={setCategoryId} />

            <PickerRow
              icon="calendar-outline"
              label="Date"
              value={labelDayLong(toDayKey(day))}
              onPress={() => setPicker('date')}
            />
            <View style={styles.timesRow}>
              <View style={styles.timeCol}>
                <PickerRow icon="time-outline" label="Début" value={toTimeKey(start)} onPress={() => setPicker('start')} />
              </View>
              <View style={styles.timeCol}>
                <PickerRow icon="time-outline" label="Fin" value={toTimeKey(end)} onPress={() => setPicker('end')} />
              </View>
            </View>

            {linkTodoId !== null && (
              <View style={styles.linkNote}>
                <Ionicons name="link-outline" size={14} color={c.aurora} />
                <Text style={styles.linkNoteText}>Lié à un to-do (coché des deux côtés)</Text>
              </View>
            )}

            <Pressable
              onPress={submit}
              disabled={title.trim().length === 0}
              style={({ pressed }) => [
                styles.submit,
                (pressed || title.trim().length === 0) && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.submitText}>{event ? 'Enregistrer' : 'Ajouter'}</Text>
            </Pressable>

            {event && (
              <Pressable onPress={remove} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={18} color={c.danger} />
                <Text style={styles.deleteText}>Supprimer</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>

      {picker !== null && (
        <DateTimePicker
          value={picker === 'date' ? day : picker === 'start' ? start : end}
          mode={picker === 'date' ? 'date' : 'time'}
          is24Hour
          onChange={(_e, sel) => onPick(sel)}
        />
      )}
    </Modal>
  );
}

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
  const c = useC();
  const styles = makeStyles(c);
  return (
    <Pressable onPress={onPress} style={styles.pickerRow}>
      <Ionicons name={icon} size={18} color={c.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.pickerLabel}>{label}</Text>
        <Text style={styles.pickerValue}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </Pressable>
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
    fontSize: font.body, color: c.text, marginTop: spacing.sm,
  },
  label: { fontSize: font.small, color: c.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  todoRow: { flexGrow: 0, marginBottom: spacing.xs },
  todoChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 200,
    borderWidth: 1.5, borderColor: c.glassBorder, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginRight: spacing.sm,
    backgroundColor: c.surfaceAlt,
  },
  todoChipActive: { borderColor: c.primary, backgroundColor: c.primarySoft },
  todoChipText: { fontSize: font.small, color: c.text },
  timesRow: { flexDirection: 'row', gap: spacing.sm },
  timeCol: { flex: 1 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: c.surfaceAlt, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.sm,
  },
  pickerLabel: { fontSize: font.small, color: c.textMuted },
  pickerValue: { fontSize: font.body, color: c.text, fontWeight: '600' },
  linkNote: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    marginTop: spacing.md,
  },
  linkNoteText: { fontSize: font.small, color: c.aurora },
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
