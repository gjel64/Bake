/**
 * MiniBars — un petit histogramme (Views + dégradés), thémé clair/sombre.
 */

import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { font, radius, spacing, useAccentPair, useC } from '@/theme';

export type BarDatum = { label: string; value: number };

type Props = {
  data: BarDatum[];
  height?: number;
  colorsPair?: readonly [string, string]; // par défaut : le dégradé d'accent courant
};

export function MiniBars({ data, height = 120, colorsPair }: Props) {
  const c = useC();
  const pair = useAccentPair();
  const colors = colorsPair ?? pair;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <View>
      <View style={[styles.chart, { height }]}>
        {data.map((d, i) => {
          const barH = Math.max(4, (d.value / max) * height);
          const active = d.value > 0;
          return (
            <View key={i} style={styles.col}>
              <View style={[styles.track, { height, backgroundColor: c.surfaceAlt }]} />
              <LinearGradient
                colors={active ? colors : [c.surfaceAlt, c.surfaceAlt]}
                start={{ x: 0, y: 1 }}
                end={{ x: 0, y: 0 }}
                style={[styles.bar, { height: barH }]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {data.map((d, i) => (
          <Text key={i} style={[styles.label, { color: c.textMuted }]} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  track: { position: 'absolute', bottom: 0, width: '66%', borderRadius: radius.sm },
  bar: { width: '66%', borderRadius: radius.sm },
  labels: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  label: { flex: 1, textAlign: 'center', fontSize: font.tiny },
});
