/**
 * HabitsScreen — la page d'accueil.
 *
 * Affiche les habitudes qu'il reste à valider aujourd'hui. Valider une
 * habitude la fait disparaître (jusqu'à demain) avec une petite animation et
 * un retour haptique. Un bouton « + » permet d'en créer une nouvelle, mais au
 * plus une tous les 30 jours (règle imposée par la base).
 */

import { useCallback, useState } from 'react';
import {
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { GradientHeader } from '@/components/GradientHeader';
import { ScreenBackground } from '@/components/ui/ScreenBackground';
import { LeafBurst } from '@/components/ui/LeafBurst';
import { HabitCard } from '@/components/HabitCard';
import { AddHabitModal } from '@/components/AddHabitModal';
import {
  Habit,
  addHabit,
  completeHabit,
  countCompletedToday,
  daysUntilCanAddHabit,
  getAllHabits,
  getPendingHabits,
} from '@/db/database';
import { colors, font, radius, spacing } from '@/theme';

// Sur Android, les animations de layout automatiques doivent être activées.
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export function HabitsScreen() {
  const [pending, setPending] = useState<Habit[]>([]);
  const [totalHabits, setTotalHabits] = useState(0);
  const [doneToday, setDoneToday] = useState(0);
  const [cooldown, setCooldown] = useState(0); // jours restants avant nouvel ajout
  const [modalOpen, setModalOpen] = useState(false);
  const [burst, setBurst] = useState(0); // déclencheur de l'envolée de feuilles

  /** Recharge tout l'état depuis la base. */
  const refresh = useCallback(() => {
    setPending(getPendingHabits());
    setTotalHabits(getAllHabits().length);
    setDoneToday(countCompletedToday());
    setCooldown(daysUntilCanAddHabit());
  }, []);

  // Rechargé à chaque fois que l'onglet redevient visible (ex : retour depuis
  // l'agenda, ou après validation la veille → nouveau jour).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  /** Validation d'une habitude : haptic + animation + persistance. */
  function onComplete(habit: Habit) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    completeHabit(habit.id);
    setBurst((b) => b + 1); // envolée de feuilles
    refresh();
  }

  function onAdd(name: string, description: string, color: string) {
    addHabit(name, description, color);
    refresh();
  }

  const canAdd = cooldown === 0;
  const subtitle =
    totalHabits === 0
      ? 'Commence par créer une habitude'
      : `${doneToday} / ${totalHabits} validées aujourd'hui`;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <GradientHeader title="Habitudes" subtitle={subtitle} />

      <FlatList
        data={pending}
        keyExtractor={(h) => String(h.id)}
        renderItem={({ item }) => <HabitCard habit={item} onComplete={onComplete} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState hasHabits={totalHabits > 0} />}
      />

      {/* Bouton flottant d'ajout (verrouillé pendant le cooldown) */}
      <Pressable
        onPress={() => (canAdd ? setModalOpen(true) : undefined)}
        style={({ pressed }) => [
          styles.fab,
          !canAdd && styles.fabLocked,
          pressed && canAdd && { opacity: 0.85 },
        ]}
      >
        {canAdd ? (
          <Ionicons name="add" size={30} color={colors.white} />
        ) : (
          <View style={styles.fabLockedInner}>
            <Ionicons name="lock-closed" size={16} color={colors.white} />
            <Text style={styles.fabLockedText}>{cooldown} j</Text>
          </View>
        )}
      </Pressable>

        <AddHabitModal
          visible={modalOpen}
          onClose={() => setModalOpen(false)}
          onAdd={onAdd}
        />

        {/* Envolée de feuilles à la validation (par-dessus la liste) */}
        <LeafBurst trigger={burst} originY={320} />
      </SafeAreaView>
    </ScreenBackground>
  );
}

/** État « vide » : soit tout est validé, soit aucune habitude n'existe. */
function EmptyState({ hasHabits }: { hasHabits: boolean }) {
  return (
    <View style={styles.empty}>
      <Ionicons
        name={hasHabits ? 'leaf-outline' : 'sparkles-outline'}
        size={56}
        color={colors.primary}
      />
      <Text style={styles.emptyTitle}>
        {hasHabits ? 'Tout est fait pour aujourd’hui' : 'Aucune habitude'}
      </Text>
      <Text style={styles.emptyText}>
        {hasHabits
          ? 'Prends un instant pour toi. À demain.'
          : 'Appuie sur + pour créer ta première habitude.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  list: {
    paddingTop: spacing.md,
    paddingBottom: 120, // laisse la place au bouton flottant
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl * 2,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: font.heading,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
    textAlign: 'center',
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
  fabLocked: {
    backgroundColor: colors.textMuted,
  },
  fabLockedInner: {
    alignItems: 'center',
  },
  fabLockedText: {
    color: colors.white,
    fontSize: font.small,
    fontWeight: '700',
  },
});
