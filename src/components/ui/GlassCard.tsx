/**
 * GlassCard — une carte iOS solide (coins arrondis, séparateur fin, ombre douce).
 *
 * (Nom conservé pour ne pas toucher aux écrans.) Plus de flou : sur un fond uni,
 * une carte pleine `surface` est plus lisible et plus « iOS ».
 */

import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { radius, softShadow, spacing, useC } from '@/theme';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  glow?: boolean; // conservé pour compat (même ombre douce)
  padding?: number;
};

export function GlassCard({ children, style, padding }: Props) {
  const c = useC();
  return (
    <View
      style={[
        styles.card,
        softShadow,
        { backgroundColor: c.surface, borderColor: c.glassBorder, padding: padding ?? spacing.lg },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
