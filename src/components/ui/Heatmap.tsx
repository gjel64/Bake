/**
 * Heatmap — un calendrier-heatmap façon GitHub (intensité par jour).
 *
 * Une colonne = une semaine (lundi en haut → dimanche en bas). La couleur de
 * chaque case dépend de l'intensité (0 → 1) : plus c'est fort, plus l'aurore
 * est vive. Les jours hors plage sont laissés vides.
 *
 * Le composant est « bête » : il reçoit une grille déjà prête (`weeks`).
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors, font, spacing } from '@/theme';

export type HeatCell = { day: string; intensity: number; inRange: boolean };

type Props = {
  weeks: HeatCell[][]; // chaque semaine = 7 cases (lundi → dimanche)
  tint?: string; // couleur d'aurore de base
};

const ROWS = ['L', '', 'M', '', 'J', '', 'D']; // repères de lignes discrets

export function Heatmap({ weeks, tint = colors.aurora }: Props) {
  return (
    <View style={styles.row}>
      {/* Repères de jours de semaine à gauche */}
      <View style={styles.rowLabels}>
        {ROWS.map((r, i) => (
          <Text key={i} style={styles.rowLabel}>
            {r}
          </Text>
        ))}
      </View>

      {/* Colonnes = semaines */}
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
                        ? colors.surface
                        : tint,
                    opacity: !cell.inRange
                      ? 0
                      : cell.intensity <= 0
                        ? 1
                        : 0.25 + 0.75 * cell.intensity,
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
  rowLabel: { height: CELL, fontSize: font.tiny, color: colors.textFaint },
  grid: { flexDirection: 'row', gap: 4, flex: 1 },
  week: { gap: 4, flex: 1 },
  cell: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: CELL,
    borderRadius: 4,
  },
});
