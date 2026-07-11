/**
 * PriorityPicker — trois segments : Basse / Moyenne / Haute (valeurs 0/1/2).
 * Les couleurs de priorité sont fixes (mêmes en clair et sombre).
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, radius, spacing, useC } from '@/theme';

export const PRIORITY_META = [
  { label: 'Basse', color: '#8E8E93' },
  { label: 'Moyenne', color: '#E0A93E' },
  { label: 'Haute', color: '#FF3B30' },
];

export function PriorityPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const c = useC();
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
              { borderColor: active ? p.color : c.glassBorder },
              active && { backgroundColor: p.color + '24' },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: p.color }]} />
            <Text style={[styles.label, { color: active ? c.text : c.textMuted }]}>{p.label}</Text>
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
  label: { fontSize: font.small, fontWeight: '600' },
});
