/**
 * GradientHeader — l'en-tête de chaque écran.
 *
 * Sur le fond forêt, l'en-tête n'est plus une bande colorée : juste un léger
 * voile sombre dégradé (du haut vers le bas) qui assombrit la zone du titre
 * pour la lisibilité, tout en laissant deviner la forêt derrière. Composant de
 * présentation « bête » : il n'affiche que ce qu'on lui passe.
 */

import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, spacing } from '@/theme';

// Voile sombre par défaut : dense en haut, transparent en bas.
const SCRIM = ['rgba(9,16,13,0.66)', 'rgba(9,16,13,0.0)'] as const;

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode; // ex : un sélecteur de vue, un bouton
  /** Force un dégradé précis (sinon : voile sombre discret). */
  gradient?: readonly [string, string];
};

export function GradientHeader({ title, subtitle, right, gradient }: Props) {
  // `insets.top` = hauteur de la barre d'état / encoche.
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={gradient ?? SCRIM}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.container, { paddingTop: insets.top + spacing.md }]}
    >
      <View style={styles.row}>
        <View style={styles.texts}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  texts: { flex: 1 },
  title: {
    fontSize: font.title,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.3,
    // légère ombre portée : le titre reste lisible même sur une zone claire
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: font.body,
    color: 'rgba(239,243,238,0.85)',
    marginTop: spacing.xs,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 6,
  },
});
