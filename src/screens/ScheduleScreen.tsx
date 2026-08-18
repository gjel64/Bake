/**
 * ScheduleScreen — l'agenda personnel.
 *
 * Trois vues (sélecteur en haut) : Jour (par défaut), Semaine, Mois.
 * On peut naviguer d'une période à l'autre (‹ ›), ajouter un événement (+),
 * et supprimer un événement (appui long / bouton corbeille).
 *
 * Un événement peut courir sur plusieurs jours : il apparaît alors sur CHAQUE
 * jour de sa plage, avec son heure de début le premier jour, sa fin le dernier
 * et « journée » entre les deux (voir `spanFor`).
 *
 * Découpage : cet écran gère l'ÉTAT (vue courante, jour sélectionné, données)
 * et délègue le rendu de chaque vue à un petit composant dédié plus bas.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { GradientHeader } from '@/components/GradientHeader';
import { ScreenBackground } from '@/components/ui/ScreenBackground';
import { SegmentedControl } from '@/components/SegmentedControl';
import { AddEventModal } from '@/components/AddEventModal';
import {
  EventItem,
  getEventCountsInRange,
  getEventsForDay,
  getMeditationSecondsForDay,
  setTodosDone,
} from '@/db/database';
import {
  addDays,
  daysBetween,
  isSameMonth,
  labelDayLong,
  labelDayShort,
  labelMonth,
  monthGrid,
  todayKey,
  weekDays,
  WEEKDAYS_SHORT,
} from '@/lib/dates';
import { font, radius, spacing, useC, type Palette } from '@/theme';

const VIEWS = ['Jour', 'Semaine', 'Mois'] as const;
type ViewMode = (typeof VIEWS)[number];

export function ScheduleScreen() {
  const c = useC();
  const styles = makeStyles(c);
  const [view, setView] = useState<ViewMode>('Jour');
  const [selectedDay, setSelectedDay] = useState<string>(todayKey());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  // Compteur qui, lorsqu'il change, force le rechargement des données.
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  // Recharge quand l'onglet redevient visible.
  useFocusEffect(useCallback(() => reload(), []));

  /** Avance/recule d'une période selon la vue courante. */
  function shift(direction: -1 | 1) {
    const step = view === 'Jour' ? 1 : view === 'Semaine' ? 7 : 0;
    if (view === 'Mois') {
      // Mois : on saute au 1er du mois précédent/suivant.
      const d = new Date(selectedDay);
      d.setDate(1);
      d.setMonth(d.getMonth() + direction);
      setSelectedDay(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
      );
    } else {
      setSelectedDay(addDays(selectedDay, step * direction));
    }
  }

  /** Ouvre l'édition d'un événement (le tap sur une carte). */
  function openEdit(ev: EventItem) {
    setEditing(ev);
    setModalOpen(true);
  }

  /**
   * Coche/décoche un événement lié : on bascule TOUS ses to-dos d'un coup.
   * Tant qu'il en reste un à faire, la case coche tout ; une fois tout fait,
   * elle décoche tout.
   */
  function toggleLinked(ev: EventItem) {
    if (ev.todo_ids.length === 0) return;
    setTodosDone(ev.todo_ids, ev.done !== 1);
    reload();
  }

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }

  // Libellé de la période affichée dans la barre de navigation.
  const periodLabel =
    view === 'Jour'
      ? labelDayLong(selectedDay)
      : view === 'Semaine'
        ? weekRangeLabel(selectedDay)
        : labelMonth(selectedDay);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container} edges={['bottom']}>
      <GradientHeader
        title="Agenda"
        right={
          <SegmentedControl options={VIEWS} value={view} onChange={setView} />
        }
      />

      {/* Barre de navigation de période : ‹ label › — le label ramène à aujourd'hui */}
      <View style={styles.navBar}>
        <NavArrow icon="chevron-back" onPress={() => shift(-1)} />
        <Pressable onPress={() => setSelectedDay(todayKey())} hitSlop={8}>
          <Text style={styles.periodLabel}>{periodLabel}</Text>
        </Pressable>
        <NavArrow icon="chevron-forward" onPress={() => shift(1)} />
      </View>

      {/* La vue active */}
      {view === 'Jour' && (
        <DayView day={selectedDay} version={version} onOpen={openEdit} onToggle={toggleLinked} />
      )}
      {view === 'Semaine' && (
        <WeekView
          day={selectedDay}
          version={version}
          onOpen={openEdit}
          onPickDay={(d) => {
            setSelectedDay(d);
            setView('Jour');
          }}
        />
      )}
      {view === 'Mois' && (
        <MonthView
          day={selectedDay}
          version={version}
          selected={selectedDay}
          onPickDay={(d) => {
            setSelectedDay(d);
            setView('Jour');
          }}
        />
      )}

      <Pressable
        onPress={openAdd}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="add" size={30} color={c.textOnAurora} />
      </Pressable>

      <AddEventModal
        visible={modalOpen}
        defaultDay={selectedDay}
        event={editing}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
      />
      </SafeAreaView>
    </ScreenBackground>
  );
}

// ===========================================================================
//  VUE JOUR
// ===========================================================================

function DayView({
  day,
  version,
  onOpen,
  onToggle,
}: {
  day: string;
  version: number;
  onOpen: (ev: EventItem) => void;
  onToggle: (ev: EventItem) => void;
}) {
  const c = useC();
  const styles = makeStyles(c);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [meditationSec, setMeditationSec] = useState(0);
  useEffect(() => {
    setEvents(getEventsForDay(day));
    setMeditationSec(getMeditationSecondsForDay(day));
  }, [day, version]);

  // Journée sans rien : ni événement ni méditation.
  if (events.length === 0 && meditationSec === 0) {
    return <Empty text="Journée libre. Ajoute un événement avec +." />;
  }

  return (
    <ScrollView contentContainerStyle={styles.dayList}>
      {meditationSec > 0 && <MeditationBadge seconds={meditationSec} />}
      {events.map((ev) => (
        <EventRow key={ev.id} event={ev} day={day} onOpen={onOpen} onToggle={onToggle} />
      ))}
    </ScrollView>
  );
}

/** Bandeau discret « médité X min » (couleur aurore). */
function MeditationBadge({ seconds }: { seconds: number }) {
  const c = useC();
  const styles = makeStyles(c);
  return (
    <View style={styles.medBadge}>
      <Ionicons name="flower-outline" size={18} color={c.aurora} />
      <Text style={styles.medBadgeText}>
        Médité {Math.round(seconds / 60)} min
      </Text>
    </View>
  );
}

/** Une ligne d'événement : horaires + titre. Tap = éditer. Case = to-do lié. */
function EventRow({
  event,
  day,
  onOpen,
  onToggle,
}: {
  event: EventItem;
  day: string; // le jour affiché : un événement long ne s'y montre pas pareil
  onOpen: (ev: EventItem) => void;
  onToggle: (ev: EventItem) => void;
}) {
  const c = useC();
  const styles = makeStyles(c);
  const accent = event.color ?? c.primary;
  const linkCount = event.todo_ids.length;
  const done = event.done === 1;
  const span = spanFor(event, day);
  return (
    <Pressable onPress={() => onOpen(event)} style={styles.eventRow}>
      <View style={styles.timeCol}>
        {span.total === 1 ? (
          <>
            <Text style={styles.timeStart}>{event.start}</Text>
            <Text style={styles.timeEnd}>{event.end}</Text>
          </>
        ) : span.first ? (
          <>
            <Text style={styles.timeStart}>{event.start}</Text>
            <Text style={styles.timeEnd}>→</Text>
          </>
        ) : span.last ? (
          <>
            <Text style={styles.timeEnd}>→</Text>
            <Text style={styles.timeStart}>{event.end}</Text>
          </>
        ) : (
          // Journée entièrement occupée : ni début ni fin ce jour-là.
          <Text style={styles.timeAllDay}>journée</Text>
        )}
      </View>
      <View style={[styles.eventAccent, { backgroundColor: accent }]} />

      {/* Case à cocher seulement pour un événement lié à des to-dos */}
      {linkCount > 0 && (
        <Pressable
          onPress={() => onToggle(event)}
          hitSlop={8}
          style={[styles.eventCheck, { borderColor: accent }, done && { backgroundColor: accent }]}
        >
          {done && <Ionicons name="checkmark" size={14} color={c.textOnAurora} />}
        </Pressable>
      )}

      <Text
        style={[styles.eventTitle, done && { color: c.textMuted, textDecorationLine: 'line-through' }]}
        numberOfLines={1}
      >
        {event.title}
      </Text>

      {/* Événement long : où on en est dans la plage — « J2/4 » */}
      {span.total > 1 && (
        <Text style={[styles.spanBadge, { color: accent, borderColor: accent }]}>
          J{span.index}/{span.total}
        </Text>
      )}

      {/* Avancement quand plusieurs to-dos sont rattachés : « 1/3 » */}
      {linkCount > 1 && (
        <Text style={styles.eventCount}>
          {event.todo_done}/{linkCount}
        </Text>
      )}

      <Ionicons name="chevron-forward" size={18} color={c.textFaint} />
    </Pressable>
  );
}

// ===========================================================================
//  VUE SEMAINE
// ===========================================================================

function WeekView({
  day,
  version,
  onOpen,
  onPickDay,
}: {
  day: string;
  version: number;
  onOpen: (ev: EventItem) => void;
  onPickDay: (day: string) => void;
}) {
  const c = useC();
  const styles = makeStyles(c);
  const days = weekDays(day); // 7 clés (lundi → dimanche)
  const today = todayKey();

  return (
    <ScrollView contentContainerStyle={styles.weekList}>
      {days.map((d) => (
        <WeekDayBlock
          key={d}
          day={d}
          version={version}
          isToday={d === today}
          onTitlePress={() => onPickDay(d)}
          onOpen={onOpen}
        />
      ))}
    </ScrollView>
  );
}

function WeekDayBlock({
  day,
  version,
  isToday,
  onTitlePress,
  onOpen,
}: {
  day: string;
  version: number;
  isToday: boolean;
  onTitlePress: () => void;
  onOpen: (ev: EventItem) => void;
}) {
  const c = useC();
  const styles = makeStyles(c);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [meditationSec, setMeditationSec] = useState(0);
  useEffect(() => {
    setEvents(getEventsForDay(day));
    setMeditationSec(getMeditationSecondsForDay(day));
  }, [day, version]);

  return (
    <View style={styles.weekBlock}>
      <Pressable onPress={onTitlePress} style={styles.weekDayHeader}>
        <Text style={[styles.weekDayLabel, isToday && styles.weekDayToday]}>
          {labelDayShort(day)}
        </Text>
        {isToday && <View style={styles.todayDot} />}
        {meditationSec > 0 && (
          <Text style={styles.weekMed}>· médité {Math.round(meditationSec / 60)} min</Text>
        )}
      </Pressable>

      {events.length === 0 ? (
        <Text style={styles.weekEmpty}>—</Text>
      ) : (
        events.map((ev) => (
          <Pressable key={ev.id} onPress={() => onOpen(ev)} style={styles.weekEventRow}>
            <View style={[styles.weekDot, { backgroundColor: ev.color ?? c.primary }]} />
            <Text style={styles.weekEventTime}>{weekTimeLabel(ev, day)}</Text>
            <Text
              style={[
                styles.weekEventTitle,
                ev.done === 1 && { color: c.textMuted, textDecorationLine: 'line-through' },
              ]}
              numberOfLines={1}
            >
              {ev.title}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
          </Pressable>
        ))
      )}
    </View>
  );
}

// ===========================================================================
//  VUE MOIS
// ===========================================================================

function MonthView({
  day,
  version,
  selected,
  onPickDay,
}: {
  day: string;
  version: number;
  selected: string;
  onPickDay: (day: string) => void;
}) {
  const cells = monthGrid(day); // 42 clés (6 semaines)
  const today = todayKey();
  // Nombre d'événements par jour, pour afficher une pastille sous les jours pleins.
  const c = useC();
  const styles = makeStyles(c);
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    setCounts(getEventCountsInRange(cells[0], cells[cells.length - 1]));
  }, [day, version]);

  return (
    <View style={styles.monthWrap}>
      {/* En-têtes de colonnes : L M M J V S D */}
      <View style={styles.weekdaysRow}>
        {WEEKDAYS_SHORT.map((w, i) => (
          <Text key={i} style={styles.weekdayHead}>
            {w}
          </Text>
        ))}
      </View>

      {/* Grille 7 × 6 */}
      <View style={styles.grid}>
        {cells.map((c) => {
          const inMonth = isSameMonth(c, day);
          const isToday = c === today;
          const isSelected = c === selected;
          const hasEvents = (counts[c] ?? 0) > 0;
          const dayNum = Number(c.slice(8, 10));

          return (
            <Pressable
              key={c}
              onPress={() => onPickDay(c)}
              style={[styles.cell, isSelected && styles.cellSelected]}
            >
              <View style={[styles.cellCircle, isToday && styles.cellToday]}>
                <Text
                  style={[
                    styles.cellText,
                    !inMonth && styles.cellTextMuted,
                    isToday && styles.cellTextToday,
                  ]}
                >
                  {dayNum}
                </Text>
              </View>
              {hasEvents && <View style={styles.cellDot} />}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.monthHint}>Touche un jour pour l’ouvrir</Text>
    </View>
  );
}

// ===========================================================================
//  Petits composants partagés
// ===========================================================================

function NavArrow({
  icon,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const c = useC();
  const styles = makeStyles(c);
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.navArrow}>
      <Ionicons name={icon} size={22} color={c.aurora} />
    </Pressable>
  );
}

function Empty({ text }: { text: string }) {
  const c = useC();
  const styles = makeStyles(c);
  return (
    <View style={styles.empty}>
      <Ionicons name="calendar-clear-outline" size={52} color={c.primary} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

/**
 * Où en est un événement le jour affiché : sur combien de jours il court
 * (`total`), le rang de ce jour dans la plage (`index`, à partir de 1) et
 * s'il s'agit du premier / dernier. Un événement d'une seule journée donne
 * `{ total: 1, index: 1, first: true, last: true }`.
 */
function spanFor(ev: EventItem, day: string) {
  const total = daysBetween(ev.day, ev.end_day) + 1;
  const index = daysBetween(ev.day, day) + 1;
  return { total, index, first: day === ev.day, last: day === ev.end_day };
}

/** L'heure à montrer dans la vue semaine : début, fin, ou « · » au milieu. */
function weekTimeLabel(ev: EventItem, day: string): string {
  const span = spanFor(ev, day);
  if (span.total === 1) return ev.start;
  if (span.first) return ev.start;
  if (span.last) return `→ ${ev.end}`;
  return '·';
}

/** Libellé de plage de semaine, ex : "6 – 12 juil.". */
function weekRangeLabel(day: string): string {
  const days = weekDays(day);
  return `${labelDayShort(days[0])} – ${labelDayShort(days[6])}`;
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  navArrow: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodLabel: {
    fontSize: font.body,
    fontWeight: '700',
    color: c.text,
    textTransform: 'capitalize',
  },

  // Vue jour
  dayList: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  timeCol: { width: 52 },
  timeStart: { fontSize: font.body, fontWeight: '700', color: c.text },
  timeEnd: { fontSize: font.small, color: c.textMuted },
  timeAllDay: { fontSize: font.small, color: c.textMuted, fontStyle: 'italic' },
  eventAccent: {
    width: 4,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: c.primary,
    marginHorizontal: spacing.md,
  },
  eventTitle: { flex: 1, fontSize: font.body, color: c.text },
  eventCount: { fontSize: font.small, fontWeight: '700', color: c.textMuted, marginRight: spacing.xs },
  spanBadge: {
    fontSize: font.small,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    marginRight: spacing.xs,
  },
  trash: { padding: spacing.xs },
  eventCheck: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },

  // Bandeau « médité » (vue jour)
  medBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: c.primarySoft,
    borderWidth: 1,
    borderColor: c.glassBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  medBadgeText: {
    color: c.aurora,
    fontSize: font.small,
    fontWeight: '700',
  },

  // Vue semaine
  weekList: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  weekBlock: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  weekDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  weekDayLabel: {
    fontSize: font.body,
    fontWeight: '700',
    color: c.text,
    textTransform: 'capitalize',
  },
  weekDayToday: { color: c.primary },
  weekMed: {
    fontSize: font.small,
    color: c.primary,
    fontWeight: '600',
  },
  todayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.primary,
  },
  weekEmpty: { color: c.textMuted, fontSize: font.small },
  weekEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 1,
  },
  weekDot: { width: 8, height: 8, borderRadius: 4 },
  weekEventTime: {
    width: 44,
    fontSize: font.small,
    color: c.textMuted,
    fontWeight: '600',
  },
  weekEventTitle: { flex: 1, fontSize: font.body, color: c.text },

  // Vue mois
  monthWrap: { paddingHorizontal: spacing.md },
  weekdaysRow: { flexDirection: 'row', marginBottom: spacing.sm },
  weekdayHead: {
    flex: 1,
    textAlign: 'center',
    fontSize: font.small,
    color: c.textMuted,
    fontWeight: '600',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  cellSelected: { backgroundColor: c.primarySoft },
  cellCircle: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellToday: { backgroundColor: c.primary },
  cellText: { fontSize: font.body, color: c.text },
  cellTextMuted: { color: c.border },
  cellTextToday: { color: c.white, fontWeight: '700' },
  cellDot: {
    position: 'absolute',
    bottom: 6,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: c.gold,
  },
  monthHint: {
    textAlign: 'center',
    color: c.textMuted,
    fontSize: font.small,
    marginTop: spacing.md,
  },

  // Divers
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    fontSize: font.body,
    color: c.textMuted,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg + 64,
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: c.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
