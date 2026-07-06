/**
 * SegmentedControl — un petit sélecteur à segments (Jour / Semaine / Mois).
 *
 * Générique et réutilisable : on lui donne une liste d'options, l'option
 * active, et un callback. Il ne sait rien du calendrier.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme';

type Props<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: Props<T>) {
  return (
    <View style={styles.track}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{opt}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF22', // léger voile clair sur le dégradé
    borderRadius: radius.pill,
    padding: 3,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  segmentActive: {
    backgroundColor: colors.textOnDark, // pastille claire = segment actif
  },
  label: {
    fontSize: font.small,
    fontWeight: '600',
    color: colors.textOnDark,
  },
  labelActive: {
    color: colors.primaryDark, // texte sombre sur la pastille claire
  },
});
