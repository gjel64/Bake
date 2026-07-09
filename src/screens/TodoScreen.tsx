/**
 * TodoScreen — la liste de tâches, regroupée par catégorie.
 *
 * En haut, les tâches « à faire » groupées par catégorie (+ un groupe « Sans
 * catégorie »). En bas, une section « Terminé » repliable (tâches barrées).
 * Un appui sur une tâche l'édite ; la case à cocher la termine ; l'icône
 * calendrier la planifie dans l'agenda (elle y apparaît, liée).
 */

import { useCallback, useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { GradientHeader } from '@/components/GradientHeader';
import { ScreenBackground } from '@/components/ui/ScreenBackground';
import { TodoModal } from '@/components/TodoModal';
import { AddEventModal } from '@/components/AddEventModal';
import { PRIORITY_META } from '@/components/PriorityPicker';
import {
  Category,
  Todo,
  getCategories,
  getTodos,
  toggleTodoDone,
} from '@/db/database';
import { todayKey } from '@/lib/dates';
import { colors, font, radius, spacing } from '@/theme';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export function TodoScreen() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [scheduling, setScheduling] = useState<Todo | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);

  const refresh = useCallback(() => {
    setTodos(getTodos());
    setCats(getCategories());
  }, []);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const pending = todos.filter((t) => t.done === 0);
  const done = todos.filter((t) => t.done === 1);

  // Groupes « à faire » : une entrée par catégorie non vide, puis « Sans catégorie ».
  const groups = useMemo(() => {
    const out: { key: string; label: string; color: string; icon: string; items: Todo[] }[] = [];
    for (const c of cats) {
      const items = pending.filter((t) => t.category_id === c.id);
      if (items.length) out.push({ key: `c${c.id}`, label: c.name, color: c.color, icon: c.icon, items });
    }
    const none = pending.filter((t) => t.category_id === null);
    if (none.length) out.push({ key: 'none', label: 'Sans catégorie', color: colors.textMuted, icon: 'ellipse-outline', items: none });
    return out;
  }, [cats, pending]);

  function toggle(t: Todo) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    toggleTodoDone(t.id);
    refresh();
  }

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(t: Todo) {
    setEditing(t);
    setModalOpen(true);
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <GradientHeader
          title="To-do"
          subtitle={pending.length === 0 ? 'Rien en attente — souffle.' : `${pending.length} à faire`}
        />

        <ScrollView contentContainerStyle={styles.list}>
          {groups.map((g) => (
            <View key={g.key} style={styles.group}>
              <View style={styles.groupHead}>
                <Ionicons name={g.icon as keyof typeof Ionicons.glyphMap} size={16} color={g.color} />
                <Text style={[styles.groupTitle, { color: g.color }]}>{g.label}</Text>
              </View>
              {g.items.map((t) => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  onToggle={() => toggle(t)}
                  onEdit={() => openEdit(t)}
                  onSchedule={() => setScheduling(t)}
                />
              ))}
            </View>
          ))}

          {groups.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-outline" size={52} color={colors.primary} />
              <Text style={styles.emptyText}>Aucune tâche en attente. Ajoute-en une avec +.</Text>
            </View>
          )}

          {/* Section Terminé */}
          {done.length > 0 && (
            <View style={styles.group}>
              <Pressable onPress={() => setDoneOpen((v) => !v)} style={styles.doneHead}>
                <Ionicons name={doneOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.textMuted} />
                <Text style={styles.doneTitle}>Terminé ({done.length})</Text>
              </Pressable>
              {doneOpen &&
                done.map((t) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    onToggle={() => toggle(t)}
                    onEdit={() => openEdit(t)}
                    onSchedule={() => setScheduling(t)}
                  />
                ))}
            </View>
          )}
        </ScrollView>

        <Pressable
          onPress={openAdd}
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={30} color={colors.textOnAurora} />
        </Pressable>

        <TodoModal
          visible={modalOpen}
          todo={editing}
          onClose={() => setModalOpen(false)}
          onSaved={refresh}
        />

        {/* Planifier un to-do dans l'agenda (événement lié) */}
        <AddEventModal
          visible={scheduling !== null}
          defaultDay={todayKey()}
          presetTitle={scheduling?.title}
          presetTodoId={scheduling?.id ?? null}
          presetCategoryId={scheduling?.category_id ?? null}
          onClose={() => setScheduling(null)}
          onSaved={refresh}
        />
      </SafeAreaView>
    </ScreenBackground>
  );
}

function TodoRow({
  todo,
  onToggle,
  onEdit,
  onSchedule,
}: {
  todo: Todo;
  onToggle: () => void;
  onEdit: () => void;
  onSchedule: () => void;
}) {
  const done = todo.done === 1;
  const prio = PRIORITY_META[todo.priority] ?? PRIORITY_META[1];

  return (
    <Pressable onPress={onEdit} style={styles.row}>
      {/* Case à cocher */}
      <Pressable onPress={onToggle} hitSlop={8} style={[styles.check, done && styles.checkDone]}>
        {done && <Ionicons name="checkmark" size={16} color={colors.textOnAurora} />}
      </Pressable>

      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, done && styles.rowTitleDone]} numberOfLines={1}>
          {todo.title}
        </Text>
        {todo.notes ? (
          <Text style={styles.rowNotes} numberOfLines={1}>{todo.notes}</Text>
        ) : null}
        {todo.remind_at ? (
          <View style={styles.remindTag}>
            <Ionicons name="notifications-outline" size={12} color={colors.aurora} />
            <Text style={styles.remindText}>
              {new Date(todo.remind_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Priorité */}
      {!done && <View style={[styles.prioDot, { backgroundColor: prio.color }]} />}

      {/* Planifié / planifier */}
      {todo.scheduled === 1 ? (
        <Ionicons name="calendar" size={18} color={colors.aurora} style={styles.calIcon} />
      ) : (
        <Pressable onPress={onSchedule} hitSlop={8} style={styles.calBtn}>
          <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  list: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },
  group: { gap: spacing.xs },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs, marginTop: spacing.sm },
  groupTitle: { fontSize: font.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  doneTitle: { fontSize: font.small, fontWeight: '700', color: colors.textMuted },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  check: {
    width: 26, height: 26, borderRadius: radius.pill, borderWidth: 2,
    borderColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  checkDone: { backgroundColor: colors.primary },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  rowTitleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  rowNotes: { fontSize: font.small, color: colors.textMuted, marginTop: 1 },
  remindTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  remindText: { fontSize: font.tiny, color: colors.aurora },
  prioDot: { width: 10, height: 10, borderRadius: 5 },
  calIcon: { marginLeft: 2 },
  calBtn: { padding: 2 },

  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl * 2, paddingHorizontal: spacing.xl },
  emptyText: { fontSize: font.body, color: colors.textMuted, textAlign: 'center' },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.lg,
    width: 60, height: 60, borderRadius: radius.pill, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
});
