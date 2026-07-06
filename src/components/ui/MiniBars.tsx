/**
 * MiniBars — un petit histogramme (ex : minutes méditées sur 7 jours).
 *
 * Rendu en Views + dégradés (pas de SVG) : la mise en page flex gère les
 * largeurs toute seule, c'est robuste et lisible. Chaque barre a une piste de
 * fond discrète et un remplissage aurore.
 */

import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, font, radius, spacing } from '@/theme';

export type BarDatum = { label: string; value: number };

type Props = {
  data: BarDatum[];
  height?: number;
  colorsPair?: readonly [string, string];
};

export function MiniBars({
  data,
  height = 120,
  colorsPair = [colors.aurora, colors.aurora2],
}: Props) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <View>
      <View style={[styles.chart, { height }]}>
        {data.map((d, i) => {
          const barH = Math.max(4, (d.value / max) * height);
          const active = d.value > 0;
          return (
            <View key={i} style={styles.col}>
              {/* Piste de fond */}
              <View style={[styles.track, { height }]} />
              {/* Barre */}
              <LinearGradient
                colors={active ? colorsPair : [colors.surfaceStrong, colors.surfaceStrong]}
                start={{ x: 0, y: 1 }}
                end={{ x: 0, y: 0 }}
                style={[styles.bar, { height: barH }]}
              />
            </View>
          );
        })}
      </View>

      {/* Étiquettes sous les barres */}
      <View style={styles.labels}>
        {data.map((d, i) => (
          <Text key={i} style={styles.label} numberOfLines={1}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  track: {
    position: 'absolute',
    bottom: 0,
    width: '66%',
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  bar: {
    width: '66%',
    borderRadius: radius.sm,
  },
  labels: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: font.tiny,
    color: colors.textMuted,
  },
});
