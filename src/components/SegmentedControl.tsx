/**
 * SegmentedControl — sélecteur à segments façon iOS (Jour / Semaine / Mois).
 * Piste creuse + pastille active pleine avec une ombre douce. Thémé.
 *
 * Par défaut chaque segment fait la largeur de son libellé (en-tête d'écran) ;
 * `fill` les répartit à parts égales sur toute la largeur (ligne de réglage).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, radius, softShadow, spacing, useC } from '@/theme';

type Props<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  fill?: boolean; // segments à parts égales sur toute la largeur
};

export function SegmentedControl<T extends string>({ options, value, onChange, fill }: Props<T>) {
  const c = useC();
  return (
    <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              styles.segment,
              fill && styles.segmentFill,
              active && [styles.active, softShadow, { backgroundColor: c.surface }],
            ]}
          >
            <Text
              style={[styles.label, fill && styles.labelFill, { color: active ? c.text : c.textMuted }]}
            >
              {opt}
            </Text>
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
  segmentFill: { flex: 1 },
  active: {},
  label: { fontSize: font.small, fontWeight: '600' },
  labelFill: { fontSize: font.body, textAlign: 'center' },
});
