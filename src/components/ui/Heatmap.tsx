/**
 * Heatmap — calendrier-heatmap (intensité par jour), thémé clair/sombre.
 */

import { StyleSheet, Text, View } from 'react-native';
import { font, gradients, spacing, useC } from '@/theme';

export type HeatCell = { day: string; intensity: number; inRange: boolean };

type Props = {
  weeks: HeatCell[][]; // chaque semaine = 7 cases (lundi → dimanche)
  tint?: string;
};

const ROWS = ['L', '', 'M', '', 'J', '', 'D'];

export function Heatmap({ weeks, tint = gradients.aurora[0] }: Props) {
  const c = useC();
  return (
    <View style={styles.row}>
      <View style={styles.rowLabels}>
        {ROWS.map((r, i) => (
          <Text key={i} style={[styles.rowLabel, { color: c.textFaint }]}>{r}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.week}>
            {week.map((cell, di) => (
              <View
                key={di}
                style={[
                  styles.cell,
                  {
                    backgroundColor: !cell.inRange
                      ? 'transparent'
                      : cell.intensity <= 0
                        ? c.surfaceAlt
                        : tint,
                    opacity: !cell.inRange ? 0 : cell.intensity <= 0 ? 1 : 0.28 + 0.72 * cell.intensity,
                  },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const CELL = 15;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  rowLabels: { justifyContent: 'space-between', paddingVertical: 1 },
  rowLabel: { height: CELL, fontSize: font.tiny },
  grid: { flexDirection: 'row', gap: 4, flex: 1 },
  week: { gap: 4, flex: 1 },
  cell: { width: '100%', aspectRatio: 1, maxHeight: CELL, borderRadius: 4 },
});
