/**
 * ScreenBackground — le voile + l'onde tactile de chaque écran.
 *
 * L'IMAGE de fond (le panorama d'Alaska) est désormais une couche GLOBALE
 * derrière la navigation (voir PanoramaBackground + App.tsx) : elle glisse en
 * parallaxe quand on change d'onglet. Ici on ne pose plus que :
 *   1. un voile sombre dégradé (scrim) pour la lisibilité,
 *   2. l'onde douce au toucher,
 *   3. le contenu.
 * Le fond est transparent pour laisser voir le panorama en dessous.
 */

import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  GestureResponderEvent,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Ripple = { id: number; x: number; y: number };

type Props = {
  children: ReactNode;
  /** Assombrit davantage (écran Méditer, pour un calme plus profond). */
  dim?: boolean;
};

export function ScreenBackground({ children, dim = false }: Props) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);

  function onTouch(e: GestureResponderEvent) {
    const { pageX, pageY } = e.nativeEvent;
    const id = nextId.current++;
    setRipples((rs) => [...rs.slice(-4), { id, x: pageX, y: pageY }]);
  }

  return (
    <View style={styles.root} onTouchStart={onTouch}>
      {/* Voile dégradé : dense en haut (en-tête) et en bas (barre d'onglets) */}
      <LinearGradient
        colors={['rgba(9,16,13,0.55)', 'rgba(9,16,13,0.14)', 'rgba(9,16,13,0.72)']}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {dim && <View style={[StyleSheet.absoluteFill, styles.dim]} pointerEvents="none" />}

      {/* Contenu */}
      <View style={styles.content}>{children}</View>

      {/* Ondes tactiles (au-dessus de tout, mais ne captent aucun toucher) */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {ripples.map((r) => (
          <TouchRipple
            key={r.id}
            x={r.x}
            y={r.y}
            onDone={() => setRipples((rs) => rs.filter((v) => v.id !== r.id))}
          />
        ))}
      </View>
    </View>
  );
}

const RIPPLE = 150;

function TouchRipple({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 750,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(onDone);
  }, [anim, onDone]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 2.3] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <Animated.View
      style={[
        styles.ripple,
        { left: x - RIPPLE / 2, top: y - RIPPLE / 2, opacity, transform: [{ scale }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  content: { flex: 1 },
  dim: { backgroundColor: 'rgba(8,14,12,0.42)' },
  ripple: {
    position: 'absolute',
    width: RIPPLE,
    height: RIPPLE,
    borderRadius: RIPPLE / 2,
    borderWidth: 2,
    borderColor: 'rgba(226,236,228,0.7)',
  },
});
