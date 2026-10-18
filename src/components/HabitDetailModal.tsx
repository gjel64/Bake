/**
 * HabitDetailModal — la fiche d'une habitude, ouverte en touchant une ligne
 * « Par habitude » de la page Stats (ou par un appui long sur une carte de
 * l'onglet Habitudes).
 *
 * Elle détaille ce que la ligne résume : série en cours, record, validations,
 * taux sur 30 jours et depuis la création, et un calendrier mois par mois
 * (validée / manquée / en pause).
 *
 * C'est aussi là qu'on « supprime » une habitude — en réalité on l'ARCHIVE :
 * son historique reste dans les stats, et le même bouton la remet quand on
 * veut. Les deux gestes changent la liste du rappel quotidien, d'où
 * `syncHabitsReminder()` après chacun.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  HABIT_UNLOCK_DAYS,
  HabitDayState,
  archiveHabit,
  getHabitDayStates,
  getHabitDetail,
  restoreHabit,
} from '@/db/database';
import {
  WEEKDAYS_SHORT,
  isSameMonth,
  labelDayLong,
  labelMonth,
  monthWeeks,
  shiftMonth,
  todayKey,
} from '@/lib/dates';
import { syncHabitsReminder } from '@/lib/habitsReminder';
import { font, radius, spacing, useC, type Palette } from '@/theme';

type Props = {
  habitId: number | null; // null = fermée
  onClose: () => void;
  onChanged: () => void; // archivée ou remise : le parent relit la base
};

/** "85 %", ou "—" quand il n'y a rien à mesurer. */
function pct(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)} %`;
}

export function HabitDetailModal({ habitId, onClose, onChanged }: Props) {
  const c = useC();
  const styles = makeStyles(c);

  // On garde la dernière habitude affichée : la fiche reste remplie pendant
  // qu'elle glisse vers le bas, après que le parent l'a remise à null.
  const last = useRef<number | null>(habitId);
  if (habitId !== null) last.current = habitId;
  const id = last.current;

  const [month, setMonth] = useState(() => todayKey());
  // Incrémenté pour relire la base : à chaque ouverture (l'habitude a pu être
  // validée entre-temps) et après un archivage ou une remise.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (habitId === null) return;
    setMonth(todayKey()); // chaque ouverture repart du mois en cours
    setVersion((v) => v + 1);
  }, [habitId]);

  const detail = useMemo(() => (id !== null ? getHabitDetail(id) : null), [id, version]);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const states = useMemo<Record<string, HabitDayState>>(
    () => (id !== null ? getHabitDayStates(id, weeks.flat()) : {}),
    [id, weeks, version],
  );

  /** Archive ou remet l'habitude, puis réaccorde le rappel quotidien. */
  function apply(action: (habitId: number) => void) {
    if (id === null) return;
    action(id);
    void syncHabitsReminder();
    setVersion((v) => v + 1);
    onChanged();
  }

  function confirmArchive() {
    if (!detail) return;
    Alert.alert(
      'Supprimer l’habitude',
      `« ${detail.habit.name} » quitte ta liste et le rappel, mais son historique reste dans tes stats. Tu pourras la remettre quand tu veux.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => apply(archiveHabit) },
      ],
    );
  }

  const today = todayKey();
  const habit = detail?.habit;
  // On ne remonte pas avant le mois de création, ni au-delà du mois en cours.
  const canPrev = habit ? month.slice(0, 7) > habit.created_at.slice(0, 7) : false;
  const canNext = month.slice(0, 7) < today.slice(0, 7);

  return (
    <Modal visible={habitId !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {detail && habit && (
            <ScrollView>
              <View style={styles.titleRow}>
                <View style={[styles.titleBar, { backgroundColor: habit.color }]} />
                <View style={styles.titleMain}>
                  <Text style={styles.title}>{habit.name}</Text>
                  {habit.description !== '' && <Text style={styles.desc}>{habit.description}</Text>}
                </View>
              </View>

              <Text style={styles.since}>
                Créée le {labelDayLong(habit.created_at)}
                {habit.archived_since !== null &&
                  ` · archivée depuis le ${labelDayLong(habit.archived_since)}`}
              </Text>

              <View style={styles.metrics}>
                <Metric icon="flame" tint={c.amber} value={String(detail.streak)} label="série" />
                <Metric icon="trophy-outline" tint={c.gold} value={String(detail.best)} label="record" />
                <Metric
                  icon="checkmark-done"
                  tint={c.aurora}
                  value={String(detail.total)}
                  label="validations"
                />
                <Metric
                  icon="stats-chart-outline"
                  tint={c.aurora2}
                  value={pct(detail.rate30)}
                  label="30 jours"
                />
              </View>

              {/* Calendrier du mois */}
              <View style={styles.monthHead}>
                <Pressable
                  onPress={() => setMonth(shiftMonth(month, -1))}
                  disabled={!canPrev}
                  hitSlop={12}
                >
                  <Ionicons name="chevron-back" size={20} color={canPrev ? c.text : c.textFaint} />
                </Pressable>
                <Text style={styles.monthLabel}>{labelMonth(month)}</Text>
                <Pressable
                  onPress={() => setMonth(shiftMonth(month, 1))}
                  disabled={!canNext}
                  hitSlop={12}
                >
                  <Ionicons name="chevron-forward" size={20} color={canNext ? c.text : c.textFaint} />
                </Pressable>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAYS_SHORT.map((letter, i) => (
                  <Text key={i} style={styles.weekLetter}>
                    {letter}
                  </Text>
                ))}
              </View>

              {weeks.map((week, wi) => (
                <View key={wi} style={styles.weekRow}>
                  {week.map((day) => {
                    // Les jours qui débordent sur les mois voisins restent vides.
                    if (!isSameMonth(day, month)) return <View key={day} style={styles.cellSlot} />;
                    const state = states[day] ?? 'none';
                    return (
                      <View
                        key={day}
                        style={[
                          styles.cellSlot,
                          styles.cell,
                          state === 'done' && { backgroundColor: habit.color },
                          state === 'missed' && styles.cellMissed,
                          state === 'paused' && styles.cellPaused,
                          day === today && styles.cellToday,
                        ]}
                      >
                        <Text
                          style={[
                            styles.cellText,
                            state === 'done' && styles.cellTextDone,
                            state === 'missed' && styles.cellTextMissed,
                          ]}
                        >
                          {Number(day.slice(8))}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ))}

              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: habit.color }]} />
                  <Text style={styles.legendText}>validée</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.cellMissed]} />
                  <Text style={styles.legendText}>manquée</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, styles.cellPaused]} />
                  <Text style={styles.legendText}>archivée</Text>
                </View>
              </View>

              <Text style={styles.hint}>
                Depuis sa création : {pct(detail.rateAll)} sur {detail.expectedAll} jour
                {detail.expectedAll > 1 ? 's' : ''}, jours d’archive exclus.
              </Text>

              {/* Archiver / remettre */}
              {habit.archived_since === null ? (
                <Pressable
                  onPress={confirmArchive}
                  style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                  <Text style={[styles.actionText, { color: c.danger }]}>Supprimer l’habitude</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    onPress={() => apply(restoreHabit)}
                    style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Ionicons name="arrow-undo-outline" size={18} color={c.aurora} />
                    <Text style={styles.actionText}>Remettre l’habitude</Text>
                  </Pressable>
                  <Text style={styles.hint}>
                    Elle revient dans ta liste avec tout son historique, mais sa série repart à 0 :
                    pour débloquer une nouvelle habitude, il lui faudra de nouveau{' '}
                    {HABIT_UNLOCK_DAYS} jours de suite.
                  </Text>
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Une métrique de la fiche : icône, valeur, libellé. */
function Metric({
  icon,
  tint,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: string;
  label: string;
}) {
  const c = useC();
  const styles = makeStyles(c);
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  titleBar: { width: 4, borderRadius: 2 },
  titleMain: { flex: 1, gap: 2 },
  title: { fontSize: font.heading, fontWeight: '700', color: c.text },
  desc: { fontSize: font.small, color: c.textMuted },
  since: { fontSize: font.tiny, color: c.textMuted, marginTop: spacing.sm },

  metrics: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  metric: {
    flex: 1, alignItems: 'center', gap: 2,
    backgroundColor: c.surfaceAlt, borderRadius: radius.sm, paddingVertical: spacing.sm,
  },
  metricValue: { fontSize: font.body, fontWeight: '700', color: c.text },
  metricLabel: { fontSize: font.tiny, color: c.textMuted },

  monthHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.xs,
  },
  monthLabel: { fontSize: font.body, fontWeight: '700', color: c.text },
  weekRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  weekLetter: {
    flex: 1, textAlign: 'center', fontSize: font.tiny, fontWeight: '600', color: c.textFaint,
  },
  cellSlot: { flex: 1, height: 34 },
  cell: { borderRadius: radius.sm - 2, alignItems: 'center', justifyContent: 'center' },
  cellMissed: { backgroundColor: c.surfaceAlt },
  cellPaused: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.textFaint },
  cellToday: { borderWidth: 1.5, borderStyle: 'solid', borderColor: c.text },
  cellText: { fontSize: font.small, color: c.textFaint },
  cellTextDone: { color: c.white, fontWeight: '700' },
  cellTextMissed: { color: c.textMuted },

  legendRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontSize: font.tiny, color: c.textMuted },

  hint: { fontSize: font.tiny, color: c.textMuted, marginTop: spacing.sm, marginHorizontal: spacing.xs },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderWidth: 1, borderColor: c.glassBorder, borderRadius: radius.md,
    paddingVertical: spacing.sm + 2, marginTop: spacing.lg,
  },
  actionText: { fontSize: font.small, color: c.text, fontWeight: '600' },
});
