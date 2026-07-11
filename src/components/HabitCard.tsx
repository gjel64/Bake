/**
 * HabitCard — une carte d'habitude à valider (style iOS, thémé clair/sombre).
 * Liseré coloré + nom + description à gauche, rond « valider » à droite.
 * Apparition douce au montage. Ne connaît pas la base : remonte `onComplete`.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Habit } from '@/db/database';
import { font, radius, softShadow, spacing, useC } from '@/theme';

type Props = {
  habit: Habit;
  onComplete: (habit: Habit) => void;
};

export function HabitCard({ habit, onComplete }: Props) {
  const c = useC();
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enter]);

  const animatedStyle = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };

  return (
    <Animated.View
      style={[
        styles.card,
        softShadow,
        { backgroundColor: c.surface, borderColor: c.glassBorder },
        animatedStyle,
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: habit.color }]} />

      <View style={styles.body}>
        <Text style={[styles.name, { color: c.text }]}>{habit.name}</Text>
        {habit.description ? (
          <Text style={[styles.desc, { color: c.textMuted }]} numberOfLines={2}>
            {habit.description}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => onComplete(habit)}
        hitSlop={8}
        style={({ pressed }) => [
          styles.check,
          { borderColor: habit.color },
          pressed && { backgroundColor: habit.color },
        ]}
      >
        {({ pressed }) => (
          <Ionicons name="checkmark" size={24} color={pressed ? c.white : habit.color} />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs + 2,
    overflow: 'hidden',
  },
  stripe: { width: 5, alignSelf: 'stretch' },
  body: { flex: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  name: { fontSize: font.body, fontWeight: '600' },
  desc: { fontSize: font.small, marginTop: 2 },
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
