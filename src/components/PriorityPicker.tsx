/**
 * PriorityPicker — trois segments : Basse / Moyenne / Haute (valeurs 0/1/2).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme';

export const PRIORITY_META = [
  { label: 'Basse', color: colors.textMuted },
  { label: 'Moyenne', color: colors.amber },
  { label: 'Haute', color: colors.danger },
];

export function PriorityPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.row}>
      {PRIORITY_META.map((p, i) => {
        const active = i === value;
        return (
          <Pressable
            key={i}
            onPress={() => onChange(i)}
            style={[
              styles.seg,
              { borderColor: active ? p.color : colors.glassBorder },
              active && { backgroundColor: p.color + '2A' },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: p.color }]} />
            <Text style={[styles.label, active && { color: colors.text }]}>{p.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: font.small, color: colors.textMuted, fontWeight: '600' },
});
