/**
 * TodoScreen — la liste de tâches, regroupée par priorité ou par catégorie.
 *
 * En haut, les tâches « à faire » groupées par PRIORITÉ (vue par défaut) ou par
 * catégorie. En bas, une section « Terminé » repliable (tâches barrées).
 * Un appui sur une tâche l'édite ; la case à cocher la termine ; l'icône
 * calendrier la planifie dans l'agenda — ou rouvre l'événement déjà lié.
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
  EventItem,
  Todo,
  getCategories,
  getLinkedEvents,
  getTodos,
  toggleTodoDone,
} from '@/db/database';
import { todayKey } from '@/lib/dates';
import { font, radius, spacing, useC, type Palette } from '@/theme';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// L'ordre compte : le premier est le mode par défaut (et s'affiche en premier).
const GROUP_MODES = ['Priorité', 'Catégorie'] as const;
type GroupMode = (typeof GROUP_MODES)[number];

export function TodoScreen() {
  const c = useC();
  const styles = makeStyles(c);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [scheduling, setScheduling] = useState<Todo | null>(null);
  const [linkedEvent, setLinkedEvent] = useState<EventItem | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>(GROUP_MODES[0]);

  const refresh = useCallback(() => {
    setTodos(getTodos());
    setCats(getCategories());
  }, []);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const pending = todos.filter((t) => t.done === 0);
  const done = todos.filter((t) => t.done === 1);

  // Groupes « à faire » : par catégorie, ou par priorité selon la vue choisie.
  const groups = useMemo(() => {
    const out: { key: string; label: string; color: string; icon: string; items: Todo[] }[] = [];

    if (groupMode === 'Priorité') {
      const icons = ['chevron-down-outline', 'remove-outline', 'chevron-up-outline']; // basse, moyenne, haute
      for (const p of [2, 1, 0]) {
        const items = pending.filter((t) => t.priority === p);
        if (items.length) {
          out.push({ key: `p${p}`, label: PRIORITY_META[p].label, color: PRIORITY_META[p].color, icon: icons[p], items });
        }
      }
      return out;
    }

    for (const cat of cats) {
      const items = pending.filter((t) => t.category_id === cat.id);
      if (items.length) out.push({ key: `c${cat.id}`, label: cat.name, color: cat.color, icon: cat.icon, items });
    }
    const none = pending.filter((t) => t.category_id === null);
    if (none.length) out.push({ key: 'none', label: 'Sans catégorie', color: c.textMuted, icon: 'ellipse-outline', items: none });
    return out;
  }, [cats, pending, groupMode, c]);

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

  /**
   * Icône calendrier : ouvre l'événement déjà lié s'il y en a un (pour le
   * déplacer, y ajouter d'autres tâches ou le supprimer), sinon en crée un.
   */
  function openSchedule(t: Todo) {
    const [existing] = getLinkedEvents(t.id);
    if (existing) setLinkedEvent(existing);
    else setScheduling(t);
  }

  function closeSchedule() {
    setScheduling(null);
    setLinkedEvent(null);
  }

  // Identité stable : ce tableau part en dépendance d'un effet dans la modale.
  const presetTodoIds = useMemo(
    () => (scheduling ? [scheduling.id] : []),
    [scheduling],
  );

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <GradientHeader
          title="To-do"
          subtitle={pending.length === 0 ? 'Rien en attente — souffle.' : `${pending.length} à faire`}
        />

        <View style={styles.modeRow}>
          <View style={styles.toggle}>
            {GROUP_MODES.map((m) => {
              const active = groupMode === m;
              const ic = m === 'Catégorie' ? 'pricetags-outline' : 'flag-outline';
              return (
                <Pressable
                  key={m}
                  onPress={() => setGroupMode(m)}
                  style={[styles.toggleBtn, active && { backgroundColor: c.primary }]}
                >
                  <Ionicons name={ic} size={15} color={active ? c.textOnAurora : c.textMuted} />
                  <Text style={[styles.toggleText, { color: active ? c.textOnAurora : c.textMuted }]}>{m}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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
                  onSchedule={() => openSchedule(t)}
                />
              ))}
            </View>
          ))}

          {groups.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-outline" size={52} color={c.primary} />
              <Text style={styles.emptyText}>Aucune tâche en attente. Ajoute-en une avec +.</Text>
            </View>
          )}

          {/* Section Terminé */}
          {done.length > 0 && (
            <View style={styles.group}>
              <Pressable onPress={() => setDoneOpen((v) => !v)} style={styles.doneHead}>
                <Ionicons name={doneOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={c.textMuted} />
                <Text style={styles.doneTitle}>Terminé ({done.length})</Text>
              </Pressable>
              {doneOpen &&
                done.map((t) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    onToggle={() => toggle(t)}
                    onEdit={() => openEdit(t)}
                    onSchedule={() => openSchedule(t)}
                  />
                ))}
            </View>
          )}
        </ScrollView>

        <Pressable
          onPress={openAdd}
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={30} color={c.textOnAurora} />
        </Pressable>

        <TodoModal
          visible={modalOpen}
          todo={editing}
          onClose={() => setModalOpen(false)}
          onSaved={refresh}
        />

        {/* Planifier un to-do dans l'agenda — ou rouvrir l'événement lié */}
        <AddEventModal
          visible={scheduling !== null || linkedEvent !== null}
          defaultDay={todayKey()}
          event={linkedEvent}
          presetTitle={scheduling?.title}
          presetTodoIds={presetTodoIds}
          presetCategoryId={scheduling?.category_id ?? null}
          onClose={closeSchedule}
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
  const c = useC();
  const styles = makeStyles(c);
  const done = todo.done === 1;
  const prio = PRIORITY_META[todo.priority] ?? PRIORITY_META[1];

  return (
    <Pressable onPress={onEdit} style={styles.row}>
      {/* Case à cocher */}
      <Pressable onPress={onToggle} hitSlop={8} style={[styles.check, done && styles.checkDone]}>
        {done && <Ionicons name="checkmark" size={16} color={c.textOnAurora} />}
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
            <Ionicons name="notifications-outline" size={12} color={c.aurora} />
            <Text style={styles.remindText}>
              {new Date(todo.remind_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Priorité */}
      {!done && <View style={[styles.prioDot, { backgroundColor: prio.color }]} />}

      {/* Planifié / planifier — dans les deux cas, on peut ouvrir l'agenda */}
      <Pressable onPress={onSchedule} hitSlop={8} style={styles.calBtn}>
        <Ionicons
          name={todo.scheduled === 1 ? 'calendar' : 'calendar-outline'}
          size={18}
          color={todo.scheduled === 1 ? c.aurora : c.textMuted}
        />
      </Pressable>
    </Pressable>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  modeRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.pill,
    padding: 3,
    gap: 2,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
    borderRadius: radius.pill,
  },
  toggleText: { fontSize: font.small, fontWeight: '600' },
  list: { padding: spacing.lg, paddingBottom: 150, gap: spacing.md },
  group: { gap: spacing.xs },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs, marginTop: spacing.sm },
  groupTitle: { fontSize: font.small, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  doneTitle: { fontSize: font.small, fontWeight: '700', color: c.textMuted },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  check: {
    width: 26, height: 26, borderRadius: radius.pill, borderWidth: 2,
    borderColor: c.primary, alignItems: 'center', justifyContent: 'center',
  },
  checkDone: { backgroundColor: c.primary },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: font.body, color: c.text, fontWeight: '600' },
  rowTitleDone: { color: c.textMuted, textDecorationLine: 'line-through' },
  rowNotes: { fontSize: font.small, color: c.textMuted, marginTop: 1 },
  remindTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  remindText: { fontSize: font.tiny, color: c.aurora },
  prioDot: { width: 10, height: 10, borderRadius: 5 },
  calBtn: { padding: 2 },

  empty: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl * 2, paddingHorizontal: spacing.xl },
  emptyText: { fontSize: font.body, color: c.textMuted, textAlign: 'center' },
  fab: {
    position: 'absolute', right: spacing.lg, bottom: spacing.lg + 64,
    width: 60, height: 60, borderRadius: radius.pill, backgroundColor: c.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
});
