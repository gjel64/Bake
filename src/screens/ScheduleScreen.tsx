/**
 * ScheduleScreen — l'agenda personnel.
 *
 * Trois vues (sélecteur en haut) : Jour (par défaut), Semaine, Mois.
 * On peut naviguer d'une période à l'autre (‹ ›), ajouter un événement (+),
 * et supprimer un événement (appui long / bouton corbeille).
 *
 * Découpage : cet écran gère l'ÉTAT (vue courante, jour sélectionné, données)
 * et délègue le rendu de chaque vue à un petit composant dédié plus bas.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { GradientHeader } from '@/components/GradientHeader';
import { ScreenBackground } from '@/components/ui/ScreenBackground';
import { SegmentedControl } from '@/components/SegmentedControl';
import { AddEventModal } from '@/components/AddEventModal';
import {
  EventItem,
  addEvent,
  deleteEvent,
  getEventCountsInRange,
  getEventsForDay,
  getMeditationSecondsForDay,
} from '@/db/database';
import {
  addDays,
  isSameMonth,
  labelDayLong,
  labelDayShort,
  labelMonth,
  monthGrid,
  todayKey,
  weekDays,
  WEEKDAYS_SHORT,
} from '@/lib/dates';
import { colors, font, radius, spacing } from '@/theme';

const VIEWS = ['Jour', 'Semaine', 'Mois'] as const;
type ViewMode = (typeof VIEWS)[number];

export function ScheduleScreen() {
  const [view, setView] = useState<ViewMode>('Jour');
  const [selectedDay, setSelectedDay] = useState<string>(todayKey());
  const [modalOpen, setModalOpen] = useState(false);
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

  /** Suppression avec confirmation. */
  function askDelete(ev: EventItem) {
    Alert.alert('Supprimer', `Supprimer « ${ev.title} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          deleteEvent(ev.id);
          reload();
        },
      },
    ]);
  }

  function onAdd(title: string, day: string, start: string, end: string) {
    addEvent(title, day, start, end);
    reload();
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

      {/* Barre de navigation de période : ‹ label › */}
      <View style={styles.navBar}>
        <NavArrow icon="chevron-back" onPress={() => shift(-1)} />
        <Text style={styles.periodLabel}>{periodLabel}</Text>
        <NavArrow icon="chevron-forward" onPress={() => shift(1)} />
      </View>

      {/* La vue active */}
      {view === 'Jour' && (
        <DayView day={selectedDay} version={version} onDelete={askDelete} />
      )}
      {view === 'Semaine' && (
        <WeekView
          day={selectedDay}
          version={version}
          onDelete={askDelete}
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
        onPress={() => setModalOpen(true)}
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="add" size={30} color={colors.white} />
      </Pressable>

      <AddEventModal
        visible={modalOpen}
        defaultDay={selectedDay}
        onClose={() => setModalOpen(false)}
        onAdd={onAdd}
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
  onDelete,
}: {
  day: string;
  version: number;
  onDelete: (ev: EventItem) => void;
}) {
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
        <EventRow key={ev.id} event={ev} onDelete={onDelete} />
      ))}
    </ScrollView>
  );
}

/** Bandeau discret « médité X min » (couleur aurore). */
function MeditationBadge({ seconds }: { seconds: number }) {
  return (
    <View style={styles.medBadge}>
      <Ionicons name="flower-outline" size={18} color={colors.aurora} />
      <Text style={styles.medBadgeText}>
        Médité {Math.round(seconds / 60)} min
      </Text>
    </View>
  );
}

/** Une ligne d'événement : plage horaire + titre + corbeille. */
function EventRow({
  event,
  onDelete,
}: {
  event: EventItem;
  onDelete: (ev: EventItem) => void;
}) {
  return (
    <View style={[styles.eventRow]}>
      <View style={styles.timeCol}>
        <Text style={styles.timeStart}>{event.start}</Text>
        <Text style={styles.timeEnd}>{event.end}</Text>
      </View>
      <View style={styles.eventAccent} />
      <Text style={styles.eventTitle}>{event.title}</Text>
      <Pressable onPress={() => onDelete(event)} hitSlop={10} style={styles.trash}>
        <Ionicons name="trash-outline" size={20} color={colors.danger} />
      </Pressable>
    </View>
  );
}

// ===========================================================================
//  VUE SEMAINE
// ===========================================================================

function WeekView({
  day,
  version,
  onDelete,
  onPickDay,
}: {
  day: string;
  version: number;
  onDelete: (ev: EventItem) => void;
  onPickDay: (day: string) => void;
}) {
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
          onDelete={onDelete}
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
  onDelete,
}: {
  day: string;
  version: number;
  isToday: boolean;
  onTitlePress: () => void;
  onDelete: (ev: EventItem) => void;
}) {
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
          <View key={ev.id} style={styles.weekEventRow}>
            <Text style={styles.weekEventTime}>{ev.start}</Text>
            <Text style={styles.weekEventTitle} numberOfLines={1}>
              {ev.title}
            </Text>
            <Pressable onPress={() => onDelete(ev)} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
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
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.navArrow}>
      <Ionicons name={icon} size={22} color={colors.aurora} />
    </Pressable>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="calendar-clear-outline" size={52} color={colors.primary} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

/** Libellé de plage de semaine, ex : "6 – 12 juil.". */
function weekRangeLabel(day: string): string {
  const days = weekDays(day);
  return `${labelDayShort(days[0])} – ${labelDayShort(days[6])}`;
}

const styles = StyleSheet.create({
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodLabel: {
    fontSize: font.body,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
  },

  // Vue jour
  dayList: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  timeCol: { width: 52 },
  timeStart: { fontSize: font.body, fontWeight: '700', color: colors.text },
  timeEnd: { fontSize: font.small, color: colors.textMuted },
  eventAccent: {
    width: 4,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    marginHorizontal: spacing.md,
  },
  eventTitle: { flex: 1, fontSize: font.body, color: colors.text },
  trash: { padding: spacing.xs },

  // Bandeau « médité » (vue jour)
  medBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.xs,
  },
  medBadgeText: {
    color: colors.aurora,
    fontSize: font.small,
    fontWeight: '700',
  },

  // Vue semaine
  weekList: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  weekBlock: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassBorder,
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
    color: colors.text,
    textTransform: 'capitalize',
  },
  weekDayToday: { color: colors.primary },
  weekMed: {
    fontSize: font.small,
    color: colors.primary,
    fontWeight: '600',
  },
  todayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  weekEmpty: { color: colors.textMuted, fontSize: font.small },
  weekEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 1,
  },
  weekEventTime: {
    width: 44,
    fontSize: font.small,
    color: colors.textMuted,
    fontWeight: '600',
  },
  weekEventTitle: { flex: 1, fontSize: font.body, color: colors.text },

  // Vue mois
  monthWrap: { paddingHorizontal: spacing.md },
  weekdaysRow: { flexDirection: 'row', marginBottom: spacing.sm },
  weekdayHead: {
    flex: 1,
    textAlign: 'center',
    fontSize: font.small,
    color: colors.textMuted,
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
  cellSelected: { backgroundColor: colors.primarySoft },
  cellCircle: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellToday: { backgroundColor: colors.primary },
  cellText: { fontSize: font.body, color: colors.text },
  cellTextMuted: { color: colors.border },
  cellTextToday: { color: colors.white, fontWeight: '700' },
  cellDot: {
    position: 'absolute',
    bottom: 6,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.gold,
  },
  monthHint: {
    textAlign: 'center',
    color: colors.textMuted,
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
    color: colors.textMuted,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
