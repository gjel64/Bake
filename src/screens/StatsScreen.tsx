/**
 * StatsScreen — la vitrine chiffrée : habitudes tenues, séries, méditation.
 *
 * Tout est lu depuis la base au moment où l'onglet devient visible, puis mis
 * en forme par les composants « ui » (anneau, histogramme, heatmap). Les
 * sections apparaissent en cascade (animations d'entrée Reanimated).
 */

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GradientHeader } from '@/components/GradientHeader';
import { SettingsModal } from '@/components/SettingsModal';
import { ScreenBackground } from '@/components/ui/ScreenBackground';
import { GlassCard } from '@/components/ui/GlassCard';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { AnimatedCount } from '@/components/ui/AnimatedCount';
import { MiniBars, BarDatum } from '@/components/ui/MiniBars';
import { Heatmap, HeatCell } from '@/components/ui/Heatmap';
import {
  countCompletedToday,
  getAllHabits,
  getCompletionCountsInRange,
  getHabitStreak,
  getLongestMeditationSeconds,
  getMeditationSecondsInRange,
  getMeditationSessionCount,
  getTotalCompletions,
  getTotalMeditationSeconds,
} from '@/db/database';
import {
  addDays,
  fromDayKey,
  startOfWeek,
  todayKey,
  WEEKDAYS_SHORT,
} from '@/lib/dates';
import { font, gradients, spacing, useC, type Palette } from '@/theme';

// --- Petits utilitaires de mise en forme ---------------------------------

/** "1 h 20" / "45 min" à partir de secondes. */
function formatDuration(totalSec: number): string {
  const m = Math.round(totalSec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** Lettre du jour de semaine (L, M, …) pour une clé jour. */
function weekdayLetter(dayKey: string): string {
  const idx = (fromDayKey(dayKey).getDay() + 6) % 7; // 0 = lundi
  return WEEKDAYS_SHORT[idx];
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// --- Forme des données affichées -----------------------------------------

type Stats = {
  todayRate: number; // 0..1 (habitudes validées aujourd'hui)
  rate7: number;
  rate30: number;
  streak: number;
  totalCompletions: number;
  medTotalSec: number;
  medWeekMinutes: number;
  medSessions: number;
  medLongestSec: number;
  medSeries: BarDatum[]; // 7 derniers jours
  heatWeeks: HeatCell[][]; // 5 semaines
};

/** Rassemble toutes les statistiques depuis la base. */
function computeStats(): Stats {
  const today = todayKey();
  const totalHabits = getAllHabits().length;

  // Taux du jour.
  const todayRate = totalHabits > 0 ? countCompletedToday() / totalHabits : 0;

  // Taux sur 7 et 30 jours : validations / (habitudes × jours).
  const sumRange = (days: number) => {
    const start = addDays(today, -(days - 1));
    const counts = getCompletionCountsInRange(start, today);
    return Object.values(counts).reduce((a, b) => a + b, 0);
  };
  const rate7 = totalHabits > 0 ? clamp01(sumRange(7) / (totalHabits * 7)) : 0;
  const rate30 = totalHabits > 0 ? clamp01(sumRange(30) / (totalHabits * 30)) : 0;

  // Méditation — 7 derniers jours (minutes/jour).
  const start7 = addDays(today, -6);
  const medMap = getMeditationSecondsInRange(start7, today);
  const medSeries: BarDatum[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start7, i);
    return { label: weekdayLetter(day), value: Math.round((medMap[day] ?? 0) / 60) };
  });
  const medWeekMinutes = medSeries.reduce((a, b) => a + b.value, 0);

  // Heatmap d'activité — 5 semaines (lundi → dimanche), habitudes + méditation.
  const gridStart = addDays(startOfWeek(today), -7 * 4); // lundi il y a 4 semaines
  const gridEnd = addDays(gridStart, 34);
  const compMap = getCompletionCountsInRange(gridStart, gridEnd);
  const medMapWide = getMeditationSecondsInRange(gridStart, gridEnd);
  // Score par jour = validations + (a médité ? 1 : 0).
  const score = (day: string) =>
    (compMap[day] ?? 0) + ((medMapWide[day] ?? 0) > 0 ? 1 : 0);
  let maxScore = 1;
  for (let i = 0; i < 35; i++) maxScore = Math.max(maxScore, score(addDays(gridStart, i)));
  const heatWeeks: HeatCell[][] = Array.from({ length: 5 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = addDays(gridStart, w * 7 + d);
      return {
        day,
        intensity: score(day) / maxScore,
        inRange: day <= today,
      };
    }),
  );

  return {
    todayRate,
    rate7,
    rate30,
    streak: getHabitStreak(),
    totalCompletions: getTotalCompletions(),
    medTotalSec: getTotalMeditationSeconds(),
    medWeekMinutes,
    medSessions: getMeditationSessionCount(),
    medLongestSec: getLongestMeditationSeconds(),
    medSeries,
    heatWeeks,
  };
}

export function StatsScreen() {
  const c = useC();
  const styles = makeStyles(c);
  const [s, setS] = useState<Stats | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const reload = useCallback(() => setS(computeStats()), []);
  useFocusEffect(reload);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <GradientHeader
          title="Statistiques"
          subtitle=""
          right={
            <Pressable onPress={() => setSettingsOpen(true)} hitSlop={10} style={styles.gear}>
              <Ionicons name="settings-outline" size={22} color={c.text} />
            </Pressable>
          }
        />

        <SettingsModal
          visible={settingsOpen}
          onClose={() => {
            setSettingsOpen(false);
            reload();
          }}
        />

        {s && (
          <ScrollView contentContainerStyle={styles.scroll}>
            {/* 1. Anneau : taux du jour */}
            <Animated.View entering={FadeInDown.duration(500)}>
              <GlassCard glow style={styles.hero}>
                <ProgressRing progress={s.todayRate} size={190} strokeWidth={16}>
                  <AnimatedCount
                    value={Math.round(s.todayRate * 100)}
                    format={(n) => `${Math.round(n)}%`}
                    style={styles.ringPct}
                  />
                  <Text style={styles.ringCaption}>aujourd’hui</Text>
                </ProgressRing>

                <View style={styles.rateRow}>
                  <RatePill label="7 jours" value={s.rate7} />
                  <RatePill label="30 jours" value={s.rate30} />
                </View>
              </GlassCard>
            </Animated.View>

            {/* 2. Deux tuiles : série + total */}
            <Animated.View
              entering={FadeInDown.delay(90).duration(500)}
              style={styles.tileRow}
            >
              <GlassCard glow style={styles.tile}>
                <Ionicons name="flame" size={22} color={c.amber} />
                <AnimatedCount value={s.streak} style={styles.tileValue} />
                <Text style={styles.tileLabel}>jours de suite</Text>
              </GlassCard>

              <GlassCard style={styles.tile}>
                <Ionicons name="checkmark-done" size={22} color={c.aurora} />
                <AnimatedCount value={s.totalCompletions} style={styles.tileValue} />
                <Text style={styles.tileLabel}>validations</Text>
              </GlassCard>
            </Animated.View>

            {/* 3. Méditation */}
            <Animated.View entering={FadeInDown.delay(180).duration(500)}>
              <GlassCard style={styles.section}>
                <View style={styles.sectionHead}>
                  <Ionicons name="flower-outline" size={20} color={c.aurora} />
                  <Text style={styles.sectionTitle}>Méditation</Text>
                </View>

                <AnimatedCount
                  value={Math.round(s.medTotalSec / 60)}
                  format={(n) => formatDuration(Math.round(n) * 60)}
                  style={styles.bigValue}
                />
                <Text style={styles.bigCaption}>temps total médité</Text>

                <View style={styles.metaRow}>
                  <Meta label="Sessions" value={String(s.medSessions)} />
                  <Meta label="Plus longue" value={formatDuration(s.medLongestSec)} />
                  <Meta label="7 jours" value={`${s.medWeekMinutes} min`} />
                </View>

                <View style={styles.chartWrap}>
                  <MiniBars data={s.medSeries} colorsPair={gradients.auroraViolet} />
                  <Text style={styles.chartCaption}>7 derniers jours</Text>
                </View>
              </GlassCard>
            </Animated.View>

            {/* 4. Heatmap d'activité */}
            <Animated.View entering={FadeInDown.delay(270).duration(500)}>
              <GlassCard style={styles.section}>
                <View style={styles.sectionHead}>
                  <Ionicons name="grid-outline" size={20} color={c.aurora2} />
                  <Text style={styles.sectionTitle}>Activité · 5 semaines</Text>
                </View>
                <Heatmap weeks={s.heatWeeks} tint={c.aurora} />
                <Text style={styles.legend}>habitudes + méditation · moins → plus</Text>
              </GlassCard>
            </Animated.View>
          </ScrollView>
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

/** Petite pastille « taux » sous l'anneau. */
function RatePill({ label, value }: { label: string; value: number }) {
  const c = useC();
  const styles = makeStyles(c);
  return (
    <View style={styles.ratePill}>
      <Text style={styles.ratePillValue}>{Math.round(value * 100)}%</Text>
      <Text style={styles.ratePillLabel}>{label}</Text>
    </View>
  );
}

/** Petite métrique (valeur + libellé). */
function Meta({ label, value }: { label: string; value: string }) {
  const c = useC();
  const styles = makeStyles(c);
  return (
    <View style={styles.meta}>
      <Text style={styles.metaValue}>{value}</Text>
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: { flex: 1 },
  gear: {
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.glassBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 3 },

  // Hero
  hero: { alignItems: 'center', gap: spacing.lg },
  ringPct: { fontSize: font.display, fontWeight: '300', color: c.text },
  ringCaption: { fontSize: font.small, color: c.textMuted, marginTop: 2 },
  rateRow: { flexDirection: 'row', gap: spacing.xl },
  ratePill: { alignItems: 'center' },
  ratePillValue: { fontSize: font.heading, fontWeight: '700', color: c.aurora },
  ratePillLabel: { fontSize: font.small, color: c.textMuted },

  // Tuiles
  tileRow: { flexDirection: 'row', gap: spacing.md },
  tile: { flex: 1, alignItems: 'center', gap: spacing.xs },
  tileValue: { fontSize: font.title, fontWeight: '800', color: c.text },
  tileLabel: { fontSize: font.small, color: c.textMuted },

  // Sections
  section: { gap: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { fontSize: font.heading, fontWeight: '700', color: c.text },
  bigValue: { fontSize: font.title, fontWeight: '800', color: c.text },
  bigCaption: { fontSize: font.small, color: c.textMuted, marginTop: -spacing.sm },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { alignItems: 'flex-start', gap: 2 },
  metaValue: { fontSize: font.body, fontWeight: '700', color: c.text },
  metaLabel: { fontSize: font.tiny, color: c.textMuted },

  chartWrap: { marginTop: spacing.sm },
  chartCaption: {
    fontSize: font.tiny,
    color: c.textFaint,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  legend: {
    fontSize: font.tiny,
    color: c.textFaint,
    marginTop: spacing.sm,
  },
});
