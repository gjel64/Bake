/**
 * SegmentedControl — sélecteur à segments façon iOS (Jour / Semaine / Mois).
 * Piste creuse + pastille active pleine avec une ombre douce. Thémé.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, radius, softShadow, spacing, useC } from '@/theme';

type Props<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const c = useC();
  return (
    <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.segment, active && [styles.active, softShadow, { backgroundColor: c.surface }]]}
          >
            <Text style={[styles.label, { color: active ? c.text : c.textMuted }]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.sm, padding: 2 },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm - 2,
  },
  active: {},
  label: { fontSize: font.small, fontWeight: '600' },
});
