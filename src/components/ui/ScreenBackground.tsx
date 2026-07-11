/**
 * ScreenBackground — le fond uni de chaque écran (style iOS « grouped »).
 *
 * Plus d'image ni d'onde tactile : juste un fond système, clair ou sombre selon
 * le thème. `dim` (écran Méditer) utilise le fond « night » du thème.
 */

import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useC } from '@/theme';

export function ScreenBackground({
  children,
  dim = false,
}: {
  children: ReactNode;
  dim?: boolean;
}) {
  const c = useC();
  return (
    <View style={[styles.root, { backgroundColor: dim ? c.night : c.bg }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
