/**
 * MeditationScreen — chronomètre de méditation (épuré, thémé, robuste au verrouillage).
 *
 * - Temps calculé sur l'HORLOGE RÉELLE (timestamp de départ) → continue même
 *   écran éteint / app en arrière-plan.
 * - Objectif OPTIONNEL de durée libre (pastille discrète en bas) : à l'échéance,
 *   cloche + vibration si l'app est ouverte, sinon notification — puis le
 *   chronomètre continue.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ScreenBackground } from '@/components/ui/ScreenBackground';
import { addMeditation, getMeditationSecondsForDay } from '@/db/database';
import { todayKey } from '@/lib/dates';
import { playBell } from '@/lib/sound';
import { cancelReminder, scheduleReminder } from '@/lib/notifications';
import { font, radius, spacing, useC } from '@/theme';

type Phase = 'idle' | 'running' | 'paused';

const PRESETS = [5, 10, 15, 20, 30, 45];
const MAX_MIN = 180;

function formatClock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatMinutes(total: number): string {
  return `${Math.round(total / 60)} min`;
}

export function MeditationScreen() {
  const c = useC();

  const [phase, setPhase] = useState<Phase>('idle');
  const [targetMin, setTargetMin] = useState<number | null>(null);
  const [reached, setReached] = useState(false);
  const [, setTick] = useState(0);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);

  const startedAt = useRef<number | null>(null);
  const accumulatedMs = useRef(0);
  const notifId = useRef<string | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const reachedRef = useRef(false);
  const targetMsRef = useRef(0);
  targetMsRef.current = (targetMin ?? 0) * 60_000;

  const elapsedMs = useCallback(() => {
    const live = phaseRef.current === 'running' && startedAt.current != null ? Date.now() - startedAt.current : 0;
    return accumulatedMs.current + live;
  }, []);

  function setPhaseBoth(p: Phase) {
    phaseRef.current = p;
    setPhase(p);
  }
  function setReachedBoth(v: boolean) {
    reachedRef.current = v;
    setReached(v);
  }

  useFocusEffect(
    useCallback(() => {
      setTodaySeconds(getMeditationSecondsForDay(todayKey()));
    }, []),
  );

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => {
      setTick((x) => x + 1);
      if (targetMsRef.current > 0 && !reachedRef.current && elapsedMs() >= targetMsRef.current) {
        setReachedBoth(true);
        playBell();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, 500);
    return () => clearInterval(id);
  }, [phase, elapsedMs]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        setTick((x) => x + 1);
        cancelReminder(notifId.current);
        notifId.current = null;
        if (phaseRef.current === 'running' && targetMsRef.current > 0 && !reachedRef.current && elapsedMs() >= targetMsRef.current) {
          setReachedBoth(true);
        }
      } else if (phaseRef.current === 'running' && targetMsRef.current > 0 && !reachedRef.current) {
        const remaining = targetMsRef.current - elapsedMs();
        if (remaining > 0) {
          scheduleReminder(new Date(Date.now() + remaining), 'Cloche de méditation', 'Objectif atteint. Continue si tu veux.').then(
            (id) => {
              notifId.current = id;
            },
          );
        }
      }
    });
    return () => sub.remove();
  }, [elapsedMs]);

  function start() {
    accumulatedMs.current = 0;
    startedAt.current = Date.now();
    setReachedBoth(false);
    setPhaseBoth('running');
  }
  function pause() {
    accumulatedMs.current = elapsedMs();
    startedAt.current = null;
    setPhaseBoth('paused');
    cancelReminder(notifId.current);
    notifId.current = null;
  }
  function resume() {
    startedAt.current = Date.now();
    setPhaseBoth('running');
  }
  function finish() {
    const secs = Math.round(elapsedMs() / 1000);
    if (secs > 0) {
      addMeditation(secs);
      setTodaySeconds(getMeditationSecondsForDay(todayKey()));
    }
    cancelReminder(notifId.current);
    notifId.current = null;
    accumulatedMs.current = 0;
    startedAt.current = null;
    setReachedBoth(false);
    setPhaseBoth('idle');
  }

  // Réglage de l'objectif (durée libre).
  function bump(delta: number) {
    const cur = targetMin ?? 0;
    const next = Math.min(MAX_MIN, Math.max(0, cur + delta));
    setTargetMin(next === 0 ? null : next);
  }

  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);
  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.12] });
  const glow = breath.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.4] });

  const elapsedSec = Math.floor(elapsedMs() / 1000);
  const idle = phase === 'idle';
  const targetSec = (targetMin ?? 0) * 60;
  const remainingSec = Math.max(0, targetSec - elapsedSec);

  return (
    <ScreenBackground dim>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Text style={[styles.eyebrow, { color: c.primary }]}>MÉDITER</Text>

        {/* Cercle qui respire + temps au centre */}
        <View style={styles.center}>
          <Animated.View style={[styles.glow, { backgroundColor: c.primary, opacity: glow, transform: [{ scale }] }]} />
          <Animated.View style={[styles.ring, { borderColor: c.primary, transform: [{ scale }] }]} />
          <View style={styles.clockWrap}>
            <Text style={[styles.clock, { color: c.text }]}>{formatClock(elapsedSec)}</Text>
            {phase === 'running' && !reached && targetMin != null && (
              <Text style={[styles.sub, { color: c.textMuted }]}>objectif dans {formatClock(remainingSec)}</Text>
            )}
            {reached && <Text style={[styles.sub, { color: c.primary }]}>objectif atteint ✓</Text>}
            {phase === 'running' && (targetMin == null || reached) && (
              <Text style={[styles.sub, { color: c.primary }]}>respire</Text>
            )}
          </View>
        </View>

        {/* Bas : objectif + commandes + total du jour */}
        <View style={styles.bottom}>
          {idle && (
            <Pressable
              onPress={() => setSheetOpen(true)}
              style={[styles.targetPill, { borderColor: c.glassBorder, backgroundColor: c.surface }]}
            >
              <Ionicons name="timer-outline" size={16} color={c.primary} />
              <Text style={[styles.targetPillText, { color: c.text }]}>
                {targetMin == null ? 'Objectif · aucun' : `Objectif · ${targetMin} min`}
              </Text>
              <Ionicons name="chevron-forward" size={15} color={c.textFaint} />
            </Pressable>
          )}

          <View style={styles.controls}>
            {idle && <PrimaryButton label="Commencer" onPress={start} />}
            {phase === 'running' && (
              <View style={styles.row}>
                <GhostButton label="Pause" onPress={pause} />
                <PrimaryButton label="Terminer" onPress={finish} />
              </View>
            )}
            {phase === 'paused' && (
              <View style={styles.row}>
                <GhostButton label="Reprendre" onPress={resume} />
                <PrimaryButton label="Terminer" onPress={finish} />
              </View>
            )}
          </View>

          <Text style={[styles.today, { color: c.textMuted }]}>
            {formatMinutes(todaySeconds)} médité aujourd’hui
          </Text>
        </View>
      </SafeAreaView>

      {/* Feuille de réglage de l'objectif */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)} />
        <View style={styles.sheetWrap}>
          <View style={[styles.sheet, { backgroundColor: c.nightAlt }]}>
            <View style={[styles.handle, { backgroundColor: c.glassBorder }]} />
            <Text style={[styles.sheetTitle, { color: c.text }]}>Objectif</Text>
            <Text style={[styles.sheetHint, { color: c.textMuted }]}>
              Une cloche sonnera à la fin — le chrono continue si tu veux.
            </Text>

            {/* Valeur + stepper */}
            <View style={styles.stepper}>
              <StepBtn label="−5" onPress={() => bump(-5)} c={c} />
              <StepBtn label="−1" onPress={() => bump(-1)} c={c} />
              <View style={styles.valueWrap}>
                <Text style={[styles.value, { color: c.text }]}>{targetMin ?? '—'}</Text>
                <Text style={[styles.valueUnit, { color: c.textMuted }]}>{targetMin == null ? 'aucun' : 'min'}</Text>
              </View>
              <StepBtn label="+1" onPress={() => bump(1)} c={c} />
              <StepBtn label="+5" onPress={() => bump(5)} c={c} />
            </View>

            {/* Raccourcis */}
            <View style={styles.presets}>
              {PRESETS.map((p) => {
                const active = targetMin === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setTargetMin(p)}
                    style={[styles.preset, { borderColor: active ? c.primary : c.glassBorder }, active && { backgroundColor: c.primarySoft }]}
                  >
                    <Text style={[styles.presetText, { color: active ? c.primary : c.textMuted }]}>{p}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.sheetActions}>
              <Pressable onPress={() => setTargetMin(null)} style={styles.noneBtn}>
                <Text style={[styles.noneText, { color: c.textMuted }]}>Aucun objectif</Text>
              </Pressable>
              <Pressable
                onPress={() => setSheetOpen(false)}
                style={({ pressed }) => [styles.validate, { backgroundColor: c.primary }, pressed && { opacity: 0.85 }]}
              >
                <Text style={[styles.validateText, { color: c.textOnAurora }]}>Valider</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenBackground>
  );
}

function StepBtn({ label, onPress, c }: { label: string; onPress: () => void; c: ReturnType<typeof useC> }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.stepBtn, { borderColor: c.glassBorder }, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.stepText, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useC();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.primary, { backgroundColor: c.primary }, pressed && { opacity: 0.85 }]}>
      <Text style={[styles.primaryText, { color: c.textOnAurora }]}>{label}</Text>
    </Pressable>
  );
}

function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useC();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ghost, { borderColor: c.glassBorder }, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.ghostText, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

const RING = 240;

const styles = StyleSheet.create({
  safe: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xl, paddingBottom: spacing.xl * 3 },
  eyebrow: { fontSize: font.small, fontWeight: '700', letterSpacing: 4, marginTop: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: RING + 60, height: RING + 60, borderRadius: (RING + 60) / 2 },
  ring: { position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2 },
  clockWrap: { alignItems: 'center' },
  clock: { fontSize: font.display, fontWeight: '200', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  sub: { fontSize: font.small, letterSpacing: 1, marginTop: spacing.xs },

  bottom: { alignItems: 'center', gap: spacing.lg },
  targetPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  targetPillText: { fontSize: font.small, fontWeight: '600' },
  controls: { minHeight: 56, justifyContent: 'center' },
  row: { flexDirection: 'row', gap: spacing.md },
  primary: { borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, minWidth: 150, alignItems: 'center' },
  primaryText: { fontSize: font.body, fontWeight: '700' },
  ghost: { borderRadius: radius.pill, borderWidth: 1.5, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, minWidth: 150, alignItems: 'center' },
  ghostText: { fontSize: font.body, fontWeight: '600' },
  today: { fontSize: font.small },

  // Feuille objectif
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0008' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xl },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: radius.pill, marginBottom: spacing.md },
  sheetTitle: { fontSize: font.heading, fontWeight: '700' },
  sheetHint: { fontSize: font.small, marginTop: 2, marginBottom: spacing.lg },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  stepBtn: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: font.body, fontWeight: '700' },
  valueWrap: { minWidth: 96, alignItems: 'center' },
  value: { fontSize: font.large, fontWeight: '300', fontVariant: ['tabular-nums'] },
  valueUnit: { fontSize: font.small, marginTop: -2 },
  presets: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  preset: { minWidth: 48, alignItems: 'center', borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  presetText: { fontSize: font.small, fontWeight: '700' },
  sheetActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl },
  noneBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  noneText: { fontSize: font.body, fontWeight: '600' },
  validate: { borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, alignItems: 'center' },
  validateText: { fontSize: font.body, fontWeight: '700' },
});
