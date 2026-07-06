/**
 * AnimatedCount — un nombre qui « compte » de 0 jusqu'à sa valeur au montage.
 *
 * Petit détail qui rend les stats vivantes. On anime une valeur, et on met à
 * jour le texte à chaque frame via un listener (donc `useNativeDriver: false`).
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, Text, TextStyle } from 'react-native';

type Props = {
  value: number;
  duration?: number;
  /** Transforme le nombre courant en texte (ex : "2 h 10"). Défaut : arrondi. */
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
};

export function AnimatedCount({ value, duration = 1100, format, style }: Props) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setDisplay(v));
    Animated.timing(anim, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [anim, value, duration]);

  return <Text style={style}>{format ? format(display) : Math.round(display)}</Text>;
}
