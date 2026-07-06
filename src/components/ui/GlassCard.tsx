/**
 * GlassCard — une carte en « verre givré » (glassmorphism).
 *
 * On empile : une lueur portée (glow), un flou (BlurView) qui trouble ce qui
 * est derrière, et un voile clair translucide + liseré pour l'effet verre.
 * Un fond translucide de secours garantit le rendu même si le flou est faible
 * sur certains appareils Android.
 */

import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Halo aurore sous la carte (par défaut) ou ombre neutre discrète. */
  glow?: boolean;
  /** Padding intérieur (par défaut : spacing.lg). */
  padding?: number;
};

export function GlassCard({ children, style, glow = false, padding }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <BlurView
        intensity={24}
        tint="dark"
        // Active un vrai flou sur Android (ignoré sur iOS qui floute nativement).
        experimentalBlurMethod="dimezisBlurView"
        style={styles.blur}
      >
        <View style={[styles.inner, { padding: padding ?? spacing.lg }]}>
          {children}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    // Le flou doit être « découpé » aux coins arrondis :
    overflow: 'hidden',
  },
  blur: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
  },
  inner: {
    backgroundColor: colors.surface, // voile clair de secours + teinte verre
  },
});
