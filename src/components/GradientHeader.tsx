/**
 * GradientHeader — l'en-tête « grand titre » façon iOS.
 *
 * (On garde le nom pour ne pas toucher aux écrans.) Un grand titre gras à
 * gauche, un sous-titre discret, et un accessoire optionnel à droite. Posé sur
 * le fond de l'écran, sans dégradé.
 */

import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, spacing, useC } from '@/theme';

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export function GradientHeader({ title, subtitle, right }: Props) {
  const c = useC();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        <View style={styles.texts}>
          <Text style={[styles.title, { color: c.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: c.textMuted }]}>{subtitle}</Text>
          ) : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  texts: { flex: 1 },
  title: { fontSize: font.large, fontWeight: '800', letterSpacing: 0.35 },
  subtitle: { fontSize: font.body, marginTop: 3 },
});
