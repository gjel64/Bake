/**
 * ProgressRing — un anneau de progression lumineux (SVG).
 *
 * Un cercle de fond discret + un arc coloré (dégradé aurore) qui se remplit
 * en s'animant de 0 jusqu'au pourcentage voulu. Le contenu passé en `children`
 * est centré à l'intérieur (ex : un gros chiffre).
 *
 * L'animation utilise le moteur Animated intégré sur `strokeDashoffset`
 * (donc `useNativeDriver: false`, car ce n'est ni une transform ni l'opacité).
 */

import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  /** Progression de 0 à 1. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  colorsPair?: readonly [string, string];
  children?: ReactNode;
};

export function ProgressRing({
  progress,
  size = 180,
  strokeWidth = 14,
  colorsPair = [colors.aurora, colors.aurora2],
  children,
}: Props) {
  const r = (size - strokeWidth) / 2; // rayon de l'arc
  const c = 2 * Math.PI * r; // circonférence
  const center = size / 2;

  // Valeur animée 0 → progress.
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [anim, progress]);

  // À 0 % l'arc est entièrement « décalé » (invisible), à 100 % décalage nul.
  const dashoffset = anim.interpolate({ inputRange: [0, 1], outputRange: [c, 0] });

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colorsPair[0]} />
            <Stop offset="1" stopColor={colorsPair[1]} />
          </LinearGradient>
        </Defs>

        {/* Piste de fond */}
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={colors.surfaceStrong}
          strokeWidth={strokeWidth}
          fill="none"
        />

        {/* Arc de progression (on tourne de -90° pour partir en haut) */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={dashoffset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>

      {/* Contenu centré */}
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
