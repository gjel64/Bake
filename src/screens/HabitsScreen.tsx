/**
 * HabitsScreen — la page d'accueil.
 *
 * Affiche les habitudes qu'il reste à valider aujourd'hui. Valider une
 * habitude la fait disparaître (jusqu'à demain) avec une petite animation et
 * un retour haptique. Un bouton « + » permet d'en créer une nouvelle, à deux
 * conditions (imposées par la base, voir `getAddHabitLock`) : 30 jours depuis
 * la dernière création, et 100 % — chaque habitude validée les 30 derniers
 * jours. Tant que ce n'est pas le cas, le bouton affiche les jours qui restent.
 *
 * Un appui long sur une carte ouvre la fiche de l'habitude (celle des Stats),
 * d'où on peut la supprimer — l'archiver, en gardant son historique.
 */

import { useCallback, useState } from 'react';
import {
  Alert,
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
import { HabitDetailModal } from '@/components/HabitDetailModal';
import {
  AddHabitLock,
  HABIT_ADD_COOLDOWN_DAYS,
  HABIT_UNLOCK_DAYS,
  Habit,
  addHabit,
  completeHabit,
  countCompletedToday,
  getActiveHabits,
  getAddHabitLock,
  getArchivedHabits,
  getPendingHabits,
} from '@/db/database';
import { syncHabitsReminder } from '@/lib/habitsReminder';
import { font, radius, spacing, useC, type Palette } from '@/theme';

// Sur Android, les animations de layout automatiques doivent être activées.
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export function HabitsScreen() {
  const [pending, setPending] = useState<Habit[]>([]);
  const [totalHabits, setTotalHabits] = useState(0);
  const [doneToday, setDoneToday] = useState(0);
  const [archivedCount, setArchivedCount] = useState(0);
  const [lock, setLock] = useState<AddHabitLock>({
    remaining: 0,
    cooldown: 0,
    streak: 0,
    weakest: null,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null); // fiche ouverte
  const [burst, setBurst] = useState(0); // déclencheur de l'envolée de feuilles
  const c = useC();
  const styles = makeStyles(c);

  /** Recharge tout l'état depuis la base. */
  const refresh = useCallback(() => {
    setPending(getPendingHabits());
    setTotalHabits(getActiveHabits().length);
    setArchivedCount(getArchivedHabits().length);
    setDoneToday(countCompletedToday());
    setLock(getAddHabitLock());
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
    // La nouvelle habitude est rappelée par défaut : le texte de la notification
    // quotidienne, figé à la programmation, doit être réécrit.
    void syncHabitsReminder();
    refresh();
  }

  /** Bouton « + » verrouillé : on rappelle les deux règles, et ce qui reste à tenir. */
  function explainLock() {
    const days = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;
    const pending: string[] = [];
    if (lock.cooldown > 0) {
      pending.push(`• Attente : encore ${days(lock.cooldown)} depuis ton dernier ajout.`);
    }
    if (lock.streak > 0) {
      const weakest = lock.weakest ? ` (« ${lock.weakest} » est la plus en retard)` : '';
      pending.push(`• 100 % : encore ${days(lock.streak)} sans faute${weakest}.`);
    }
    Alert.alert(
      'Pas encore',
      `Pour ajouter une habitude, il faut ${HABIT_ADD_COOLDOWN_DAYS} jours depuis le dernier ajout, et chacune de tes habitudes validée ${HABIT_UNLOCK_DAYS} jours de suite.\n\n${pending.join('\n')}`,
    );
  }

  const canAdd = lock.remaining === 0;
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
        renderItem={({ item }) => (
          <HabitCard habit={item} onComplete={onComplete} onLongPress={(h) => setDetailId(h.id)} />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState hasHabits={totalHabits > 0} hasArchived={archivedCount > 0} />
        }
      />

      {/* Bouton flottant d'ajout (verrouillé tant que tout n'est pas à 100 %) */}
      <Pressable
        onPress={() => (canAdd ? setModalOpen(true) : explainLock())}
        style={({ pressed }) => [
          styles.fab,
          !canAdd && styles.fabLocked,
          pressed && canAdd && { opacity: 0.85 },
        ]}
      >
        {canAdd ? (
          <Ionicons name="add" size={30} color={c.white} />
        ) : (
          <View style={styles.fabLockedInner}>
            <Ionicons name="lock-closed" size={16} color={c.white} />
            <Text style={styles.fabLockedText}>{lock.remaining} j</Text>
          </View>
        )}
      </Pressable>

        <AddHabitModal
          visible={modalOpen}
          onClose={() => setModalOpen(false)}
          onAdd={onAdd}
        />

        <HabitDetailModal
          habitId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={refresh}
        />

        {/* Envolée de feuilles à la validation (par-dessus la liste) */}
        <LeafBurst trigger={burst} originY={320} />
      </SafeAreaView>
    </ScreenBackground>
  );
}

/**
 * État « vide » : soit tout est validé, soit aucune habitude n'est en cours —
 * auquel cas on rappelle que les archivées attendent dans les Stats.
 */
function EmptyState({ hasHabits, hasArchived }: { hasHabits: boolean; hasArchived: boolean }) {
  const c = useC();
  const styles = makeStyles(c);
  return (
    <View style={styles.empty}>
      <Ionicons
        name={hasHabits ? 'leaf-outline' : 'sparkles-outline'}
        size={56}
        color={c.primary}
      />
      <Text style={styles.emptyTitle}>
        {hasHabits ? 'Tout est fait pour aujourd’hui' : 'Aucune habitude'}
      </Text>
      <Text style={styles.emptyText}>
        {hasHabits
          ? 'habitude complétées, la classe!'
          : 'Appuie sur + pour créer ta première habitude.'}
      </Text>
      {!hasHabits && hasArchived && (
        <Text style={styles.emptyText}>
          Tes habitudes archivées se remettent depuis les Stats.
        </Text>
      )}
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  list: {
    paddingTop: spacing.md,
    paddingBottom: 150, // place pour le FAB + la tab bar translucide
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
    color: c.text,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: font.body,
    color: c.textMuted,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg + 64, // au-dessus de la tab bar translucide
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabLocked: {
    backgroundColor: c.textMuted,
  },
  fabLockedInner: {
    alignItems: 'center',
  },
  fabLockedText: {
    color: c.white,
    fontSize: font.small,
    fontWeight: '700',
  },
});
