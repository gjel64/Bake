/**
 * AddEventModal — créer / modifier un événement d'agenda.
 *
 * Contient :
 *  - une catégorie (couleur partagée avec les to-dos),
 *  - « To-dos liés » : zéro, un ou PLUSIEURS to-dos rattachés à l'événement
 *    (cocher l'événement coche toutes ces tâches, et inversement),
 *  - mode édition (pré-rempli) avec suppression,
 *  - un interrupteur « Sur plusieurs jours » : l'événement court alors du
 *    premier jour (à l'heure de début) au dernier (à l'heure de fin), les
 *    journées intermédiaires étant occupées en entier.
 *
 * Sur une seule journée, choisir une heure de début recale la fin à +1 h ;
 * sur plusieurs jours les deux heures sont indépendantes (14:00 → 11:00 est
 * parfaitement valide).
 *
 * Écrit directement en base puis prévient via `onSaved`.
 */

import { useEffect, useState } from 'react';
import {
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
import {
  EventItem,
  Todo,
  addEvent,
  deleteEvent,
  getTodos,
  updateEvent,
} from '@/db/database';
import {
  addDays,
  daysBetween,
  fromDayKey,
  labelDayLong,
  labelDayShort,
  toDayKey,
  toTimeKey,
} from '@/lib/dates';
import { font, radius, spacing, useC, type Palette } from '@/theme';

type Props = {
  visible: boolean;
  defaultDay: string;
  event?: EventItem | null; // édition
  presetTitle?: string; // pré-remplissage (depuis un to-do)
  presetTodoIds?: number[];
  presetCategoryId?: number | null;
  onClose: () => void;
  onSaved: () => void;
};

type PickerKind = 'date' | 'endDate' | 'start' | 'end' | null;

/** Durée par défaut d'un événement : une heure. */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

function atHour(day: string, hour: number): Date {
  const d = fromDayKey(day);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function atMinute(day: string, hour: number, minute: number): Date {
  const d = fromDayKey(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** La même date, une heure plus tard. */
function plusOneHour(d: Date): Date {
  return new Date(d.getTime() + DEFAULT_DURATION_MS);
}

export function AddEventModal({
  visible,
  defaultDay,
  event,
  presetTitle,
  presetTodoIds,
  presetCategoryId,
  onClose,
  onSaved,
}: Props) {
  const c = useC();
  const styles = makeStyles(c);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [linkTodoIds, setLinkTodoIds] = useState<number[]>([]);
  const [day, setDay] = useState<Date>(fromDayKey(defaultDay));
  const [endDay, setEndDay] = useState<Date>(fromDayKey(defaultDay));
  const [multiDay, setMultiDay] = useState(false);
  const [start, setStart] = useState<Date>(atHour(defaultDay, 9));
  const [end, setEnd] = useState<Date>(atHour(defaultDay, 10));
  const [picker, setPicker] = useState<PickerKind>(null);
  const [todos, setTodos] = useState<Todo[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (event) {
      // Édition d'un événement existant.
      const [sh, sm] = event.start.split(':').map(Number);
      const [eh, em] = event.end.split(':').map(Number);
      setTitle(event.title);
      setCategoryId(event.category_id);
      setLinkTodoIds(event.todo_ids);
      setDay(fromDayKey(event.day));
      setEndDay(fromDayKey(event.end_day));
      setMultiDay(event.end_day > event.day);
      setStart(atMinute(event.day, sh, sm));
      setEnd(atMinute(event.day, eh, em));
      // On propose les tâches à faire + celles déjà rattachées (pour les retirer).
      setTodos(
        getTodos().filter((t) => t.done === 0 || event.todo_ids.includes(t.id)),
      );
    } else {
      setTitle(presetTitle ?? '');
      setCategoryId(presetCategoryId ?? null);
      setLinkTodoIds(presetTodoIds ?? []);
      setDay(fromDayKey(defaultDay));
      setEndDay(fromDayKey(defaultDay));
      setMultiDay(false);
      setStart(atHour(defaultDay, 9));
      setEnd(atHour(defaultDay, 10));
      // Tâches à faire : celles déjà planifiées ailleurs restent proposées.
      setTodos(getTodos().filter((t) => t.done === 0));
    }
    setPicker(null);
  }, [visible, event, defaultDay, presetTitle, presetTodoIds, presetCategoryId]);

  function onPick(selected: Date | undefined) {
    const kind = picker;
    setPicker(null);
    if (!selected) return;
    if (kind === 'date') {
      setDay(selected);
      // Le dernier jour ne peut pas passer avant le premier : on le pousse.
      if (toDayKey(selected) > toDayKey(endDay)) setEndDay(selected);
    }
    if (kind === 'endDate') {
      // Idem dans l'autre sens : un dernier jour trop tôt est ramené au premier.
      setEndDay(toDayKey(selected) < toDayKey(day) ? day : selected);
    }
    if (kind === 'start') {
      setStart(selected);
      // Sur une seule journée, la fin suit le début à +1 h ; sur plusieurs
      // jours c'est l'heure du dernier jour, elle n'a pas à bouger.
      if (!multiDay) setEnd(plusOneHour(selected));
    }
    if (kind === 'end') setEnd(selected);
  }

  /** Bascule « sur plusieurs jours » : par défaut le lendemain, sinon retour au jour même. */
  function toggleMultiDay(on: boolean) {
    setMultiDay(on);
    setEndDay(on ? fromDayKey(addDays(toDayKey(day), 1)) : day);
  }

  /** Rattache / détache un to-do. Le premier rattaché remplit le formulaire. */
  function toggleTodoLink(t: Todo) {
    if (linkTodoIds.includes(t.id)) {
      setLinkTodoIds(linkTodoIds.filter((id) => id !== t.id));
      return;
    }
    // Premier to-do rattaché : on en reprend le titre et la catégorie s'ils sont vides.
    if (linkTodoIds.length === 0) {
      if (title.trim().length === 0) setTitle(t.title);
      if (categoryId === null) setCategoryId(t.category_id);
    }
    setLinkTodoIds([...linkTodoIds, t.id]);
  }

  function submit() {
    const t = title.trim();
    if (t.length === 0) return;
    const dayKey = toDayKey(day);
    const endDayKey = multiDay ? toDayKey(endDay) : dayKey;
    // Garde-fou : sur une seule journée, une fin avant (ou égale au) début n'a
    // pas de sens. Sur plusieurs jours, les deux heures sont sur des jours
    // différents : n'importe quel couple est valide.
    const safeEnd =
      endDayKey === dayKey && end.getTime() <= start.getTime() ? plusOneHour(start) : end;
    if (event) {
      updateEvent(
        event.id, t, dayKey, endDayKey,
        toTimeKey(start), toTimeKey(safeEnd), categoryId, linkTodoIds,
      );
    } else {
      addEvent(
        t, dayKey, endDayKey,
        toTimeKey(start), toTimeKey(safeEnd), categoryId, linkTodoIds,
      );
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

  const showTodoLinks = todos.length > 0;

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

            {showTodoLinks && (
              <>
                <Text style={styles.label}>To-dos liés (plusieurs possibles)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.todoRow}>
                  {todos.map((t) => {
                    const linked = linkTodoIds.includes(t.id);
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => toggleTodoLink(t)}
                        style={[styles.todoChip, linked && styles.todoChipActive]}
                      >
                        <Ionicons
                          name={linked ? 'checkbox' : 'square-outline'}
                          size={15}
                          color={linked ? c.primary : (t.cat_color ?? c.textMuted)}
                        />
                        <Text style={styles.todoChipText} numberOfLines={1}>{t.title}</Text>
                      </Pressable>
                    );
                  })}
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
              label={multiDay ? 'Premier jour' : 'Date'}
              value={labelDayLong(toDayKey(day))}
              onPress={() => setPicker('date')}
            />

            {/* Événement long : on ouvre un second sélecteur de date */}
            <View style={styles.spanRow}>
              <View style={styles.spanLeft}>
                <Ionicons name="calendar-number-outline" size={18} color={c.aurora} />
                <Text style={styles.spanLabel}>Sur plusieurs jours</Text>
              </View>
              <Switch
                value={multiDay}
                onValueChange={toggleMultiDay}
                trackColor={{ true: c.primary, false: c.surfaceStrong }}
                thumbColor={c.white}
              />
            </View>

            {multiDay && (
              <PickerRow
                icon="calendar-outline"
                label="Dernier jour"
                value={labelDayLong(toDayKey(endDay))}
                onPress={() => setPicker('endDate')}
              />
            )}

            <View style={styles.timesRow}>
              <View style={styles.timeCol}>
                <PickerRow
                  icon="time-outline"
                  label={multiDay ? 'Début (1er jour)' : 'Début'}
                  value={toTimeKey(start)}
                  onPress={() => setPicker('start')}
                />
              </View>
              <View style={styles.timeCol}>
                <PickerRow
                  icon="time-outline"
                  label={multiDay ? 'Fin (dernier jour)' : 'Fin'}
                  value={toTimeKey(end)}
                  onPress={() => setPicker('end')}
                />
              </View>
            </View>

            {multiDay && (
              <View style={styles.spanNote}>
                <Ionicons name="resize-outline" size={14} color={c.aurora} />
                <Text style={styles.spanNoteText}>{spanSummary(day, endDay, start, end)}</Text>
              </View>
            )}

            {linkTodoIds.length > 0 && (
              <View style={styles.linkNote}>
                <Ionicons name="link-outline" size={14} color={c.aurora} />
                <Text style={styles.linkNoteText}>
                  {linkTodoIds.length === 1
                    ? 'Lié à 1 to-do (coché des deux côtés)'
                    : `Lié à ${linkTodoIds.length} to-dos (cochés des deux côtés)`}
                </Text>
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
          value={
            picker === 'date'
              ? day
              : picker === 'endDate'
                ? endDay
                : picker === 'start'
                  ? start
                  : end
          }
          mode={picker === 'date' || picker === 'endDate' ? 'date' : 'time'}
          // Le dernier jour ne peut pas être choisi avant le premier.
          minimumDate={picker === 'endDate' ? day : undefined}
          is24Hour
          onChange={(_e, sel) => onPick(sel)}
        />
      )}
    </Modal>
  );
}

/** Résumé d'un événement long, ex : « Du 3 juil. 14:00 au 6 juil. 11:00 · 4 jours ». */
function spanSummary(day: Date, endDay: Date, start: Date, end: Date): string {
  const total = daysBetween(toDayKey(day), toDayKey(endDay)) + 1;
  return (
    `Du ${labelDayShort(toDayKey(day))} ${toTimeKey(start)}` +
    ` au ${labelDayShort(toDayKey(endDay))} ${toTimeKey(end)} · ${total} jours`
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
  spanRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  spanLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  spanLabel: { fontSize: font.body, color: c.text },
  spanNote: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    marginTop: spacing.sm,
  },
  spanNoteText: { fontSize: font.small, color: c.aurora },
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
