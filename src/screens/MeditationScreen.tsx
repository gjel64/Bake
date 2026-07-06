/**
 * MeditationScreen — le chronomètre de méditation.
 *
 * Un espace volontairement dépouillé : nuit polaire, un cercle qui respire, un
 * temps qui s'écoule. On s'assoit, on lance le chronomètre, on revient au
 * souffle. À la fin, la durée est enregistrée pour aujourd'hui — on la
 * retrouve dans l'agenda.
 *
 * Choix technique : un simple chronomètre qui COMPTE VERS LE HAUT (comme un
 * chronomètre de sport), pas de compte à rebours. La méditation n'a pas de
 * durée imposée.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { ScreenBackground } from '@/components/ui/ScreenBackground';
import { addMeditation, getMeditationSecondsForDay } from '@/db/database';
import { todayKey } from '@/lib/dates';
import { colors, font, radius, spacing } from '@/theme';

/** Formatte un nombre de secondes en "M:SS" (ou "H:MM:SS" au-delà d'une heure). */
function formatClock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Formatte une durée (secondes) en minutes lisibles, ex : "22 min". */
function formatMinutes(total: number): string {
  return `${Math.round(total / 60)} min`;
}

export function MeditationScreen() {
  const [elapsed, setElapsed] = useState(0); // secondes de la session en cours
  const [running, setRunning] = useState(false);
  const [todaySeconds, setTodaySeconds] = useState(0);

  // Recharge le total du jour à chaque fois que l'onglet redevient visible.
  useFocusEffect(
    useCallback(() => {
      setTodaySeconds(getMeditationSecondsForDay(todayKey()));
    }, []),
  );

  // Le tic-tac : un intervalle d'1 s, actif seulement quand `running`.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id); // nettoyage (pause, démontage)
  }, [running]);

  // Cercle qui « respire » : une boucle douce 4 s inspiration / 4 s expiration.
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 4000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 4000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.12] });
  const glow = breath.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.55] });

  /** Termine la session : enregistre si non vide, puis remet à zéro. */
  function finish() {
    if (elapsed > 0) {
      addMeditation(elapsed);
      setTodaySeconds(getMeditationSecondsForDay(todayKey()));
    }
    setRunning(false);
    setElapsed(0);
  }

  const idle = !running && elapsed === 0;

  return (
    <ScreenBackground dim>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Text style={styles.eyebrow}>MÉDITER</Text>

        {/* Le cercle qui respire + le temps au centre */}
        <View style={styles.center}>
          <Animated.View
            style={[styles.glow, { opacity: glow, transform: [{ scale }] }]}
          />
          <Animated.View style={[styles.ring, { transform: [{ scale }] }]} />
          <View style={styles.clockWrap}>
            <Text style={styles.clock}>{formatClock(elapsed)}</Text>
            {running ? <Text style={styles.breathe}>respire</Text> : null}
          </View>
        </View>

        {/* Commandes selon l'état */}
        <View style={styles.controls}>
          {idle && (
            <PrimaryButton label="Commencer" onPress={() => setRunning(true)} />
          )}

          {running && (
            <View style={styles.row}>
              <GhostButton label="Pause" onPress={() => setRunning(false)} />
              <PrimaryButton label="Terminer" onPress={finish} />
            </View>
          )}

          {!running && elapsed > 0 && (
            <View style={styles.row}>
              <GhostButton label="Reprendre" onPress={() => setRunning(true)} />
              <PrimaryButton label="Terminer" onPress={finish} />
            </View>
          )}
        </View>

        {/* Total du jour + rappel vers l'agenda */}
        <View style={styles.footer}>
          <Text style={styles.todayValue}>{formatMinutes(todaySeconds)}</Text>
          <Text style={styles.todayLabel}>médité aujourd’hui</Text>
          <Text style={styles.hint}>Ton historique t’attend dans l’agenda.</Text>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

/** Bouton plein (aurore). */
function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

/** Bouton discret (contour clair sur fond sombre). */
function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

const RING = 240; // diamètre du cercle de respiration

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.night },
  safe: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xl,
  },
  eyebrow: {
    color: colors.aurora,
    fontSize: font.small,
    fontWeight: '700',
    letterSpacing: 4,
    marginTop: spacing.md,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: RING + 60,
    height: RING + 60,
    borderRadius: (RING + 60) / 2,
    backgroundColor: colors.aurora,
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: colors.aurora2,
  },
  clockWrap: { alignItems: 'center' },
  clock: {
    color: colors.white,
    fontSize: font.display,
    fontWeight: '200', // très fin : élégant et calme
    letterSpacing: 2,
    fontVariant: ['tabular-nums'], // chiffres de largeur fixe : pas de tremblement
  },
  breathe: {
    color: colors.aurora,
    fontSize: font.small,
    letterSpacing: 3,
    marginTop: spacing.xs,
  },

  controls: { minHeight: 60, justifyContent: 'center' },
  row: { flexDirection: 'row', gap: spacing.md },
  primary: {
    backgroundColor: colors.aurora,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minWidth: 150,
    alignItems: 'center',
  },
  primaryText: {
    color: colors.night,
    fontSize: font.body,
    fontWeight: '700',
  },
  ghost: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: '#FFFFFF55',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    minWidth: 150,
    alignItems: 'center',
  },
  ghostText: {
    color: colors.textOnDark,
    fontSize: font.body,
    fontWeight: '600',
  },

  footer: { alignItems: 'center', gap: 2 },
  todayValue: {
    color: colors.white,
    fontSize: font.heading,
    fontWeight: '700',
  },
  todayLabel: {
    color: colors.aurora2,
    fontSize: font.small,
  },
  hint: {
    color: '#FFFFFF66',
    fontSize: font.small,
    marginTop: spacing.sm,
  },
});
