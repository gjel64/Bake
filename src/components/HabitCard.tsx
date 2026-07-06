/**
 * HabitCard — une carte d'habitude à valider.
 *
 * À gauche : un liseré de la couleur de l'habitude + nom + description.
 * À droite : un rond « valider ». Un appui déclenche `onComplete`.
 *
 * Le composant ne connaît PAS la base de données : il remonte juste l'intention
 * (« l'utilisateur veut valider cette habitude ») via la prop `onComplete`.
 * C'est le parent (l'écran) qui décide quoi en faire. Flux descendant classique.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Habit } from '@/db/database';
import { colors, font, radius, spacing } from '@/theme';

type Props = {
  habit: Habit;
  onComplete: (habit: Habit) => void;
};

export function HabitCard({ habit, onComplete }: Props) {
  // Apparition douce au montage : léger fondu + montée de quelques pixels.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const animatedStyle = {
    opacity: enter,
    transform: [
      { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
    ],
  };

  return (
    <Animated.View style={[styles.card, animatedStyle]}>
      {/* Liseré coloré = identité visuelle de l'habitude */}
      <View style={[styles.stripe, { backgroundColor: habit.color }]} />

      <View style={styles.body}>
        <Text style={styles.name}>{habit.name}</Text>
        {habit.description ? (
          <Text style={styles.desc} numberOfLines={2}>
            {habit.description}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => onComplete(habit)}
        android_ripple={{ color: colors.primarySoft, borderless: true }}
        hitSlop={8}
        style={({ pressed }) => [
          styles.check,
          { borderColor: habit.color },
          pressed && { backgroundColor: habit.color },
        ]}
      >
        {({ pressed }) => (
          <Ionicons
            name="checkmark"
            size={26}
            color={pressed ? colors.white : habit.color}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface, // verre translucide sur le fond aurore
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    overflow: 'hidden',
  },
  stripe: {
    width: 6,
    alignSelf: 'stretch',
  },
  body: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  name: {
    fontSize: font.body,
    fontWeight: '700',
    color: colors.text,
  },
  desc: {
    fontSize: font.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  check: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
});
