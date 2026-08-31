/**
 * ScheduleScreen — l'agenda personnel.
 *
 * Trois vues (sélecteur en haut) :
 *  - **Jour** : un vrai planning heure par heure façon calendrier iOS —
 *    colonne des heures à gauche, blocs d'événements posés à leur horaire,
 *    trait rouge de l'heure courante, bande « toute la journée » au-dessus
 *    pour les événements longs. Toucher un créneau vide crée un événement à
 *    cette heure-là.
 *  - **Semaine** : la liste des sept jours, chacun avec ses événements.
 *  - **Mois** : la grille du mois (pastilles colorées sous les jours occupés)
 *    et, en dessous, le détail du jour sélectionné.
 *
 * Un événement peut courir sur plusieurs jours : il apparaît alors sur CHAQUE
 * jour de sa plage, avec son heure de début le premier jour, sa fin le dernier
 * et « journée » entre les deux (voir `spanFor`).
 *
 * Les événements venus d'un abonnement .ics se mêlent aux autres, dans la
 * couleur de leur abonnement, mais ne s'ouvrent qu'en lecture (`openEdit`).
 * C'est cet écran qui déclenche leur synchronisation, une fois par session.
 *
 * Découpage : cet écran gère l'ÉTAT (vue courante, jour sélectionné, données)
 * et délègue le rendu de chaque vue à un petit composant dédié plus bas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { GradientHeader } from '@/components/GradientHeader';
import { ScreenBackground } from '@/components/ui/ScreenBackground';
import { SegmentedControl } from '@/components/SegmentedControl';
import { AddEventModal } from '@/components/AddEventModal';
import { syncAllCalendars } from '@/lib/calendars';
import {
  DaySummary,
  EventItem,
  getCalendar,
  getEventDaysInRange,
  getEventsForDay,
  getMeditationSecondsForDay,
  setTodosDone,
} from '@/db/database';
import {
  addDays,
  daysBetween,
  fromDayKey,
  isSameMonth,
  labelDayLong,
  labelDayShort,
  labelHour,
  labelMonth,
  minutesOfTime,
  monthWeeks,
  nowMinutes,
  todayKey,
  weekDays,
  WEEKDAYS_SHORT,
} from '@/lib/dates';
import { font, radius, softShadow, spacing, useC, useIsDark, withAlpha, type Palette } from '@/theme';

const VIEWS = ['Jour', 'Semaine', 'Mois'] as const;
type ViewMode = (typeof VIEWS)[number];

/** Hauteur d'une heure dans le planning (px) — règle tout le calage vertical. */
const HOUR_HEIGHT = 58;
/** Largeur de la colonne des heures, à gauche du planning. */
const GUTTER = 54;
/** Les 24 heures de la journée, une fois pour toutes. */
const HOURS = Array.from({ length: 24 }, (_, i) => i);
/** Hauteur minimale d'un bloc, pour qu'un événement très court reste lisible. */
const MIN_BLOCK = 26;

/**
 * Côté de la pastille d'un jour (bande des jours et grille du mois). Son rayon
 * vaut EXACTEMENT la moitié : c'est la seule forme de cercle qu'Android rende
 * sans discuter — un `borderRadius` géant façon `radius.pill` peut y ressortir
 * en carré arrondi.
 */
const DAY_BUBBLE = 34;

export function ScheduleScreen() {
  const c = useC();
  const styles = makeStyles(c);
  const [view, setView] = useState<ViewMode>('Jour');
  const [selectedDay, setSelectedDay] = useState<string>(todayKey());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  // Heure proposée à la création (créneau touché dans le planning).
  const [presetHour, setPresetHour] = useState<number | undefined>(undefined);
  // Compteur qui, lorsqu'il change, force le rechargement des données.
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  // Recharge quand l'onglet redevient visible.
  useFocusEffect(useCallback(() => reload(), []));

  // Une seule fois par session, à la première ouverture de l'agenda : on
  // rafraîchit les abonnements .ics, puis on relit si quelque chose a bougé.
  // (Le téléchargement est silencieux — en attendant, l'agenda affiche les
  // événements de la dernière synchronisation réussie.)
  useEffect(() => {
    let alive = true;
    syncAllCalendars().then((n) => {
      if (alive && n > 0) reload();
    });
    return () => {
      alive = false;
    };
  }, []);

  /** Avance/recule d'une période selon la vue courante. */
  function shift(direction: -1 | 1) {
    const step = view === 'Jour' ? 1 : view === 'Semaine' ? 7 : 0;
    if (view === 'Mois') {
      // Mois : on saute au 1er du mois précédent/suivant. `fromDayKey` garde
      // l'heure LOCALE — `new Date("2026-08-31")` serait interprété en UTC.
      const d = fromDayKey(selectedDay);
      d.setDate(1);
      d.setMonth(d.getMonth() + direction);
      setSelectedDay(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
      );
    } else {
      setSelectedDay(addDays(selectedDay, step * direction));
    }
  }

  /**
   * Ouvre l'édition d'un événement (le tap sur un bloc ou une ligne).
   * Un événement venu d'un abonnement .ics est en LECTURE SEULE : il serait
   * de toute façon écrasé à la prochaine synchronisation, alors on se contente
   * d'en montrer le détail.
   */
  function openEdit(ev: EventItem) {
    if (ev.calendar_id !== null) {
      const cal = getCalendar(ev.calendar_id);
      const span = spanFor(ev, selectedDay);
      const when =
        span.total === 1
          ? `${labelDayLong(ev.day)}, ${ev.start} – ${ev.end}`
          : `Du ${labelDayLong(ev.day)} (${ev.start}) au ${labelDayLong(ev.end_day)} (${ev.end})`;
      Alert.alert(
        ev.title,
        `${when}\n\nAbonnement « ${cal?.name ?? 'agenda externe'} » — lecture seule.`,
      );
      return;
    }
    setEditing(ev);
    setPresetHour(undefined);
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

  /** Nouvel événement — `hour` vient d'un créneau touché dans le planning. */
  function openAdd(hour?: number) {
    setEditing(null);
    setPresetHour(hour);
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
          <DayView
            day={selectedDay}
            version={version}
            onOpen={openEdit}
            onToggle={toggleLinked}
            onCreateAt={openAdd}
            onPickDay={setSelectedDay}
          />
        )}
        {view === 'Semaine' && (
          <WeekView
            day={selectedDay}
            version={version}
            onOpen={openEdit}
            onToggle={toggleLinked}
            onPickDay={(d) => {
              setSelectedDay(d);
              setView('Jour');
            }}
          />
        )}
        {view === 'Mois' && (
          <MonthView
            month={selectedDay}
            selected={selectedDay}
            version={version}
            onSelect={setSelectedDay}
            onOpen={openEdit}
            onToggle={toggleLinked}
            onOpenDay={(d) => {
              setSelectedDay(d);
              setView('Jour');
            }}
          />
        )}

        <Pressable
          onPress={() => openAdd()}
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="add" size={30} color={c.textOnAurora} />
        </Pressable>

        <AddEventModal
          visible={modalOpen}
          defaultDay={selectedDay}
          defaultHour={presetHour}
          event={editing}
          onClose={() => setModalOpen(false)}
          onSaved={reload}
        />
      </SafeAreaView>
    </ScreenBackground>
  );
}

// ===========================================================================
//  VUE JOUR — planning heure par heure
// ===========================================================================

function DayView({
  day,
  version,
  onOpen,
  onToggle,
  onCreateAt,
  onPickDay,
}: {
  day: string;
  version: number;
  onOpen: (ev: EventItem) => void;
  onToggle: (ev: EventItem) => void;
  onCreateAt: (hour: number) => void;
  onPickDay: (day: string) => void;
}) {
  const c = useC();
  const styles = makeStyles(c);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [meditationSec, setMeditationSec] = useState(0);
  useEffect(() => {
    setEvents(getEventsForDay(day));
    setMeditationSec(getMeditationSecondsForDay(day));
  }, [day, version]);

  // Les événements sur plusieurs jours vont dans la bande du haut ; les autres
  // se posent dans le planning, à leur horaire.
  const longEvents = events.filter((ev) => ev.end_day > ev.day);
  const timed = events.filter((ev) => ev.end_day === ev.day);

  return (
    <View style={styles.dayWrap}>
      <WeekStrip day={day} version={version} onPick={onPickDay} />

      {(longEvents.length > 0 || meditationSec > 0) && (
        <View style={styles.allDayBand}>
          {longEvents.map((ev) => (
            <LongEventChip key={ev.id} event={ev} day={day} onPress={() => onOpen(ev)} />
          ))}
          {meditationSec > 0 && <MeditationBadge seconds={meditationSec} />}
        </View>
      )}

      <Timeline
        day={day}
        events={timed}
        onOpen={onOpen}
        onToggle={onToggle}
        onCreateAt={onCreateAt}
      />
    </View>
  );
}

/** La bande des sept jours de la semaine, au-dessus du planning (façon iOS). */
function WeekStrip({
  day,
  version,
  onPick,
}: {
  day: string;
  version: number;
  onPick: (day: string) => void;
}) {
  const c = useC();
  const styles = makeStyles(c);
  const days = weekDays(day);
  const today = todayKey();
  const [summary, setSummary] = useState<Record<string, DaySummary>>({});
  useEffect(() => {
    setSummary(getEventDaysInRange(days[0], days[6]));
  }, [days[0], version]);

  return (
    <View style={styles.strip}>
      {days.map((d, i) => {
        const selected = d === day;
        const isToday = d === today;
        const busy = (summary[d]?.count ?? 0) > 0;
        return (
          <Pressable key={d} onPress={() => onPick(d)} style={styles.stripCell}>
            <Text style={[styles.stripWeekday, isToday && { color: c.primary }]}>
              {WEEKDAYS_SHORT[i]}
            </Text>
            <View style={[styles.stripBubble, selected && { backgroundColor: c.primary }]}>
              <Text
                style={[
                  styles.stripNum,
                  isToday && !selected && { color: c.primary, fontWeight: '800' },
                  selected && { color: c.textOnAurora, fontWeight: '800' },
                ]}
              >
                {Number(d.slice(8, 10))}
              </Text>
            </View>
            <View
              style={[
                styles.stripDot,
                busy && { backgroundColor: selected ? c.primary : c.textMuted },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Le planning : 24 heures empilées, les blocs d'événements posés dessus.
 * Le contenu défile ; on l'amène d'emblée sur l'heure courante (aujourd'hui)
 * ou sur le premier événement de la journée.
 */
function Timeline({
  day,
  events,
  onOpen,
  onToggle,
  onCreateAt,
}: {
  day: string;
  events: EventItem[];
  onOpen: (ev: EventItem) => void;
  onToggle: (ev: EventItem) => void;
  onCreateAt: (hour: number) => void;
}) {
  const c = useC();
  const styles = makeStyles(c);
  const scrollRef = useRef<ScrollView>(null);
  const isToday = day === todayKey();

  // Découpe des chevauchements en colonnes (calcul pur, mémorisé).
  const slots = useMemo(() => layoutDay(events, day), [events, day]);

  // Le trait de l'heure courante, rafraîchi chaque minute.
  const [minutesNow, setMinutesNow] = useState(nowMinutes());
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setMinutesNow(nowMinutes()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  // Position de départ du défilement : l'heure courante, sinon le 1er événement.
  useEffect(() => {
    const target = isToday ? minutesNow : (slots[0]?.startMin ?? 8 * 60);
    const y = Math.max(0, (target / 60) * HOUR_HEIGHT - HOUR_HEIGHT * 1.5);
    // Le rendu doit être posé avant de défiler : on laisse passer une frame.
    const id = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(id);
    // Volontairement sans `minutesNow` : on ne veut pas re-défiler chaque minute.
  }, [day, slots.length]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.timelineScroll}
      contentContainerStyle={styles.timelineContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ height: HOUR_HEIGHT * 24 }}>
        {/* Les 24 bandes horaires : le fond du planning, et des zones de création */}
        {HOURS.map((h) => (
          <Pressable
            key={h}
            onPress={() => onCreateAt(h)}
            style={[styles.hourRow, { top: h * HOUR_HEIGHT }]}
          >
            <Text style={styles.hourLabel}>{labelHour(h)}</Text>
            <View style={styles.hourLine} />
          </Pressable>
        ))}

        {/* Les événements de la journée */}
        <View style={styles.blocksLayer} pointerEvents="box-none">
          {slots.map((s) => (
            <EventBlock key={s.event.id} slot={s} onOpen={onOpen} onToggle={onToggle} />
          ))}
        </View>

        {/* Le trait de l'heure courante */}
        {isToday && (
          <View style={[styles.nowRow, { top: (minutesNow / 60) * HOUR_HEIGHT }]} pointerEvents="none">
            <View style={styles.nowDot} />
            <View style={styles.nowLine} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/** Un événement posé dans le planning, à son horaire et dans sa colonne. */
function EventBlock({
  slot,
  onOpen,
  onToggle,
}: {
  slot: Slot;
  onOpen: (ev: EventItem) => void;
  onToggle: (ev: EventItem) => void;
}) {
  const c = useC();
  const dark = useIsDark();
  const styles = makeStyles(c);
  const ev = slot.event;
  const accent = ev.color ?? c.primary;
  const done = ev.done === 1;
  const height = Math.max(((slot.endMin - slot.startMin) / 60) * HOUR_HEIGHT - 2, MIN_BLOCK);
  // Sous ~40 px il n'y a de place que pour le titre : on met tout sur une ligne.
  const compact = height < 40;

  return (
    <Pressable
      onPress={() => onOpen(ev)}
      style={[
        styles.block,
        {
          top: (slot.startMin / 60) * HOUR_HEIGHT + 1,
          height,
          left: `${(slot.col * 100) / slot.cols}%`,
          width: `${100 / slot.cols}%`,
        },
      ]}
    >
      <View
        style={[
          styles.blockInner,
          {
            backgroundColor: withAlpha(accent, dark ? 0.26 : 0.14),
            borderLeftColor: accent,
          },
          compact && styles.blockInnerCompact,
        ]}
      >
        <View style={styles.blockTitleRow}>
          {ev.todo_ids.length > 0 && (
            <Pressable
              onPress={() => onToggle(ev)}
              hitSlop={8}
              style={[
                styles.blockCheck,
                { borderColor: accent },
                done && { backgroundColor: accent },
              ]}
            >
              {done && <Ionicons name="checkmark" size={11} color={c.textOnAurora} />}
            </Pressable>
          )}
          <Text
            style={[styles.blockTitle, done && styles.strike]}
            numberOfLines={compact ? 1 : 2}
          >
            {ev.title}
          </Text>
          {compact && <Text style={styles.blockTimeInline}>{ev.start}</Text>}
        </View>
        {!compact && (
          <Text style={styles.blockTime} numberOfLines={1}>
            {ev.start} – {ev.end}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

/** Un événement sur plusieurs jours : une pastille dans la bande du haut. */
function LongEventChip({
  event,
  day,
  onPress,
}: {
  event: EventItem;
  day: string;
  onPress: () => void;
}) {
  const c = useC();
  const dark = useIsDark();
  const styles = makeStyles(c);
  const accent = event.color ?? c.primary;
  const span = spanFor(event, day);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.longChip,
        { backgroundColor: withAlpha(accent, dark ? 0.26 : 0.14), borderColor: accent },
      ]}
    >
      <Text
        style={[styles.longChipTitle, event.done === 1 && styles.strike]}
        numberOfLines={1}
      >
        {event.title}
      </Text>
      <Text style={styles.longChipMeta}>
        J{span.index}/{span.total}
        {span.first ? ` · dès ${event.start}` : span.last ? ` · jusqu'à ${event.end}` : ''}
      </Text>
    </Pressable>
  );
}

/** Bandeau discret « médité X min » (couleur aurore). */
function MeditationBadge({ seconds }: { seconds: number }) {
  const c = useC();
  const styles = makeStyles(c);
  return (
    <View style={styles.medBadge}>
      <Ionicons name="flower-outline" size={16} color={c.aurora} />
      <Text style={styles.medBadgeText}>
        Médité {Math.round(seconds / 60)} min
      </Text>
    </View>
  );
}

// ===========================================================================
//  VUE SEMAINE
// ===========================================================================

function WeekView({
  day,
  version,
  onOpen,
  onToggle,
  onPickDay,
}: {
  day: string;
  version: number;
  onOpen: (ev: EventItem) => void;
  onToggle: (ev: EventItem) => void;
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
          onToggle={onToggle}
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
  onToggle,
}: {
  day: string;
  version: number;
  isToday: boolean;
  onTitlePress: () => void;
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

  return (
    <View style={[styles.weekBlock, isToday && { borderColor: c.primary }]}>
      <Pressable onPress={onTitlePress} style={styles.weekDayHeader}>
        <Text style={[styles.weekDayLabel, isToday && styles.weekDayToday]}>
          {labelDayShort(day)}
        </Text>
        {isToday && <View style={styles.todayDot} />}
        {meditationSec > 0 && (
          <Text style={styles.weekMed}>· médité {Math.round(meditationSec / 60)} min</Text>
        )}
        <View style={{ flex: 1 }} />
        <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
      </Pressable>

      {events.length === 0 ? (
        <Text style={styles.weekEmpty}>—</Text>
      ) : (
        events.map((ev) => (
          <EventListRow key={ev.id} event={ev} day={day} onOpen={onOpen} onToggle={onToggle} />
        ))
      )}
    </View>
  );
}

// ===========================================================================
//  VUE MOIS — grille + détail du jour sélectionné
// ===========================================================================

function MonthView({
  month,
  selected,
  version,
  onSelect,
  onOpenDay,
  onOpen,
  onToggle,
}: {
  month: string;
  selected: string;
  version: number;
  onSelect: (day: string) => void;
  onOpenDay: (day: string) => void;
  onOpen: (ev: EventItem) => void;
  onToggle: (ev: EventItem) => void;
}) {
  const c = useC();
  const styles = makeStyles(c);
  const weeks = monthWeeks(month); // 4, 5 ou 6 semaines selon le mois
  const today = todayKey();
  const first = weeks[0][0];
  const last = weeks[weeks.length - 1][6];

  const [summary, setSummary] = useState<Record<string, DaySummary>>({});
  useEffect(() => {
    setSummary(getEventDaysInRange(first, last));
  }, [first, last, version]);

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

      {/* La grille, une ligne par semaine */}
      <View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.gridRow}>
            {week.map((d) => (
              <MonthCell
                key={d}
                day={d}
                inMonth={isSameMonth(d, month)}
                isToday={d === today}
                isSelected={d === selected}
                summary={summary[d]}
                onPress={() => onSelect(d)}
              />
            ))}
          </View>
        ))}
      </View>

      {/* Le détail du jour sélectionné, sous la grille */}
      <View style={styles.monthDivider} />
      <MonthDayList
        day={selected}
        version={version}
        onOpenDay={() => onOpenDay(selected)}
        onOpen={onOpen}
        onToggle={onToggle}
      />
    </View>
  );
}

/** Une case du mois : le numéro, et jusqu'à trois pastilles de couleur. */
function MonthCell({
  day,
  inMonth,
  isToday,
  isSelected,
  summary,
  onPress,
}: {
  day: string;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  summary?: DaySummary;
  onPress: () => void;
}) {
  const c = useC();
  const styles = makeStyles(c);
  const dots = (summary?.colors.length ? summary.colors : summary ? [c.primary] : []).slice(0, 3);

  return (
    <Pressable onPress={onPress} style={styles.cell}>
      <View
        style={[
          styles.cellCircle,
          // Jour sélectionné : pastille verte pleine. Aujourd'hui non sélectionné :
          // simple cerne vert. Les deux sont des DISQUES (voir DAY_BUBBLE).
          isSelected && { backgroundColor: c.primary },
          isToday && !isSelected && { borderWidth: 1.5, borderColor: c.primary },
        ]}
      >
        <Text
          style={[
            styles.cellText,
            !inMonth && styles.cellTextMuted,
            isToday && { color: c.primary, fontWeight: '700' },
            isSelected && { color: c.textOnAurora, fontWeight: '700' },
          ]}
        >
          {Number(day.slice(8, 10))}
        </Text>
      </View>
      <View style={styles.cellDots}>
        {dots.map((color, i) => (
          <View key={i} style={[styles.cellDot, { backgroundColor: color }]} />
        ))}
      </View>
    </Pressable>
  );
}

/** Sous la grille : les événements du jour sélectionné. */
function MonthDayList({
  day,
  version,
  onOpenDay,
  onOpen,
  onToggle,
}: {
  day: string;
  version: number;
  onOpenDay: () => void;
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

  return (
    <View style={styles.monthList}>
      <Pressable onPress={onOpenDay} style={styles.monthListHeader} hitSlop={6}>
        <Text style={styles.monthListTitle}>{labelDayLong(day)}</Text>
        <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
      </Pressable>

      <ScrollView contentContainerStyle={styles.monthListContent}>
        {meditationSec > 0 && <MeditationBadge seconds={meditationSec} />}
        {events.length === 0 ? (
          <Text style={styles.monthListEmpty}>Journée libre.</Text>
        ) : (
          events.map((ev) => (
            <EventListRow key={ev.id} event={ev} day={day} onOpen={onOpen} onToggle={onToggle} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ===========================================================================
//  Petits composants partagés
// ===========================================================================

/** Une ligne d'événement en liste (vues Semaine et Mois). */
function EventListRow({
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
  const done = event.done === 1;
  const span = spanFor(event, day);
  const linkCount = event.todo_ids.length;

  return (
    <Pressable onPress={() => onOpen(event)} style={styles.listRow}>
      <View style={[styles.listBar, { backgroundColor: accent }]} />
      <View style={styles.listTimeCol}>
        <Text style={styles.listTime}>{rowTimeLabel(event, day)}</Text>
        {span.total === 1 && <Text style={styles.listTimeEnd}>{event.end}</Text>}
      </View>

      {linkCount > 0 && (
        <Pressable
          onPress={() => onToggle(event)}
          hitSlop={8}
          style={[styles.listCheck, { borderColor: accent }, done && { backgroundColor: accent }]}
        >
          {done && <Ionicons name="checkmark" size={13} color={c.textOnAurora} />}
        </Pressable>
      )}

      <Text style={[styles.listTitle, done && styles.strike]} numberOfLines={1}>
        {event.title}
      </Text>

      {span.total > 1 && (
        <Text style={[styles.spanBadge, { color: accent, borderColor: accent }]}>
          J{span.index}/{span.total}
        </Text>
      )}
      {linkCount > 1 && (
        <Text style={styles.listCount}>
          {event.todo_done}/{linkCount}
        </Text>
      )}
      <Ionicons name="chevron-forward" size={16} color={c.textFaint} />
    </Pressable>
  );
}

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
      <Ionicons name={icon} size={20} color={c.aurora} />
    </Pressable>
  );
}

// ===========================================================================
//  Calculs (fonctions pures)
// ===========================================================================

/** Un événement placé dans le planning : ses bornes en minutes et sa colonne. */
type Slot = {
  event: EventItem;
  startMin: number;
  endMin: number;
  col: number; // sa colonne parmi les événements qui se chevauchent
  cols: number; // le nombre de colonnes du groupe
};

/**
 * Pose les événements d'une journée dans le planning : bornes en minutes, puis
 * répartition en colonnes pour que deux événements qui se chevauchent soient
 * côte à côte (comme le calendrier iOS). Les événements se touchant seulement
 * par leurs extrémités (10:00–11:00 et 11:00–12:00) restent pleine largeur.
 */
function layoutDay(events: EventItem[], day: string): Slot[] {
  const items = events
    .map((event) => {
      const span = spanFor(event, day);
      const startMin = span.first ? minutesOfTime(event.start) : 0;
      const rawEnd = span.last ? minutesOfTime(event.end) : 24 * 60;
      // Un événement de durée nulle ou inversée occupe quand même un créneau.
      return { event, startMin, endMin: Math.max(rawEnd, startMin + 15) };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const out: Slot[] = [];
  let group: typeof items = [];
  let groupEnd = -1;

  /** Referme le groupe courant : on lui attribue ses colonnes. */
  function flush() {
    const colEnds: number[] = []; // fin du dernier événement de chaque colonne
    const placed = group.map((it) => {
      let col = colEnds.findIndex((end) => end <= it.startMin);
      if (col === -1) col = colEnds.length;
      colEnds[col] = it.endMin;
      return { ...it, col };
    });
    for (const p of placed) out.push({ ...p, cols: colEnds.length });
    group = [];
    groupEnd = -1;
  }

  for (const it of items) {
    // Plus aucun chevauchement avec le groupe courant : on le referme.
    if (group.length > 0 && it.startMin >= groupEnd) flush();
    group.push(it);
    groupEnd = Math.max(groupEnd, it.endMin);
  }
  if (group.length > 0) flush();

  return out;
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

/** L'heure à montrer en tête de ligne : début, fin, ou « · » au milieu. */
function rowTimeLabel(ev: EventItem, day: string): string {
  const span = spanFor(ev, day);
  if (span.total === 1 || span.first) return ev.start;
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  navArrow: {
    width: 36,
    height: 36,
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
  strike: { color: c.textMuted, textDecorationLine: 'line-through' },

  // --- Vue jour : bande des jours -----------------------------------------
  dayWrap: { flex: 1 },
  strip: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  stripCell: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  stripWeekday: { fontSize: font.tiny, color: c.textMuted, fontWeight: '600' },
  stripBubble: {
    width: DAY_BUBBLE,
    height: DAY_BUBBLE,
    borderRadius: DAY_BUBBLE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripNum: { fontSize: font.small + 1, color: c.text, fontWeight: '600' },
  stripDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'transparent' },

  // --- Vue jour : bande « plusieurs jours » --------------------------------
  allDayBand: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.glassBorder,
  },
  longChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
    borderLeftWidth: 3,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
  },
  longChipTitle: { flex: 1, fontSize: font.small + 1, fontWeight: '600', color: c.text },
  longChipMeta: { fontSize: font.tiny, color: c.textMuted, fontWeight: '600' },

  medBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    alignSelf: 'flex-start',
    backgroundColor: c.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  medBadgeText: { color: c.aurora, fontSize: font.tiny, fontWeight: '700' },

  // --- Vue jour : le planning ---------------------------------------------
  timelineScroll: { flex: 1 },
  timelineContent: { paddingBottom: 150, paddingRight: spacing.md },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: HOUR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  hourLabel: {
    width: GUTTER,
    textAlign: 'right',
    paddingRight: spacing.sm,
    marginTop: -7,
    fontSize: font.tiny,
    color: c.textFaint,
    fontVariant: ['tabular-nums'],
  },
  hourLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.glassBorder,
  },
  blocksLayer: {
    position: 'absolute',
    left: GUTTER,
    right: 0,
    top: 0,
    bottom: 0,
  },
  block: { position: 'absolute', paddingRight: 3 },
  blockInner: {
    flex: 1,
    borderRadius: radius.sm - 2,
    borderLeftWidth: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  blockInnerCompact: { justifyContent: 'center', paddingVertical: 0 },
  blockTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 1 },
  blockCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockTitle: { flex: 1, fontSize: font.small, fontWeight: '600', color: c.text },
  blockTime: { fontSize: font.tiny, color: c.textMuted, marginTop: 1 },
  blockTimeInline: { fontSize: font.tiny, color: c.textMuted },

  nowRow: {
    position: 'absolute',
    left: GUTTER - 4,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nowDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger },
  nowLine: { flex: 1, height: 1.5, backgroundColor: c.danger },

  // --- Vue semaine ---------------------------------------------------------
  weekList: { padding: spacing.md, gap: spacing.sm, paddingBottom: 150 },
  weekBlock: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  weekDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  weekDayLabel: {
    fontSize: font.small + 1,
    fontWeight: '700',
    color: c.text,
    textTransform: 'capitalize',
  },
  weekDayToday: { color: c.primary },
  weekMed: { fontSize: font.tiny, color: c.primary, fontWeight: '600' },
  todayDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary },
  weekEmpty: { color: c.textFaint, fontSize: font.small },

  // --- Lignes d'événement (semaine & mois) ---------------------------------
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  listBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, minHeight: 26 },
  listTimeCol: { width: 46 },
  listTime: { fontSize: font.small, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  listTimeEnd: { fontSize: font.tiny, color: c.textMuted, fontVariant: ['tabular-nums'] },
  listCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listTitle: { flex: 1, fontSize: font.small + 2, color: c.text },
  listCount: { fontSize: font.tiny, fontWeight: '700', color: c.textMuted },
  spanBadge: {
    fontSize: font.tiny,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
  },

  // --- Vue mois ------------------------------------------------------------
  monthWrap: { flex: 1, paddingHorizontal: spacing.sm },
  weekdaysRow: { flexDirection: 'row', paddingBottom: spacing.xs },
  weekdayHead: {
    flex: 1,
    textAlign: 'center',
    fontSize: font.tiny,
    color: c.textMuted,
    fontWeight: '700',
  },
  gridRow: { flexDirection: 'row' },
  cell: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  cellCircle: {
    width: DAY_BUBBLE,
    height: DAY_BUBBLE,
    borderRadius: DAY_BUBBLE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { fontSize: font.small + 2, color: c.text },
  cellTextMuted: { color: c.textFaint },
  cellDots: { flexDirection: 'row', gap: 3, height: 6, marginTop: 2 },
  cellDot: { width: 6, height: 6, borderRadius: 3 },

  monthDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.glassBorder,
    marginTop: spacing.sm,
    marginHorizontal: spacing.sm,
  },
  monthList: { flex: 1, paddingHorizontal: spacing.sm },
  monthListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  monthListTitle: {
    fontSize: font.small + 1,
    fontWeight: '700',
    color: c.textMuted,
    textTransform: 'capitalize',
  },
  monthListContent: { paddingBottom: 150, gap: 2 },
  monthListEmpty: { fontSize: font.small, color: c.textFaint, paddingVertical: spacing.sm },

  // --- Divers --------------------------------------------------------------
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
    ...softShadow,
    shadowColor: c.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
