/**
 * ScreenBackground — le fond commun : une forêt brumeuse.
 *
 * Trois couches :
 *   1. l'image de forêt (assets/forest.png), déjà douce/floutée,
 *   2. un voile sombre dégradé (scrim) pour que le texte reste lisible,
 *   3. le contenu de l'écran.
 *
 * Bonus : au toucher, une onde douce se propage depuis le point touché
 * (comme une goutte sur l'eau). L'événement `onTouchStart` est capté au niveau
 * de la racine : il se déclenche partout, sans bloquer les boutons.
 */

import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  GestureResponderEvent,
  ImageBackground,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const FOREST = require('../../../assets/forest.png');

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
    const { pageX, pageY } = e.nativeEvent; // position à l'écran
    const id = nextId.current++;
    // On garde au plus quelques ondes en vie simultanément.
    setRipples((rs) => [...rs.slice(-4), { id, x: pageX, y: pageY }]);
  }

  return (
    <View style={styles.root} onTouchStart={onTouch}>
      <ImageBackground source={FOREST} resizeMode="cover" style={StyleSheet.absoluteFill}>
        {/* Voile dégradé : plus dense en haut (en-tête) et en bas (barre) */}
        <LinearGradient
          colors={['rgba(9,16,13,0.60)', 'rgba(9,16,13,0.18)', 'rgba(9,16,13,0.72)']}
          locations={[0.9, 0.1, 1]}
          style={StyleSheet.absoluteFill}
        />
        {dim && <View style={[StyleSheet.absoluteFill, styles.dim]} />}
      </ImageBackground>

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

/** Une onde : un anneau clair qui grandit et s'efface. */
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
  root: { flex: 1, backgroundColor: '#0A100D' },
  content: { flex: 1 },
  dim: { backgroundColor: 'rgba(8,14,12,0.42)' },
  ripple: {
    position: 'absolute',
    width: RIPPLE,
    height: RIPPLE,
    borderRadius: RIPPLE / 2,
    borderWidth: 2,
    borderColor: 'rgba(226,236,228,0.75)',
  },
});
