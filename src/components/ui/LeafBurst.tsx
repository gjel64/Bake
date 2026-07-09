/**
 * LeafBurst — une petite envolée de feuilles quand on réussit une habitude.
 *
 * Usage : on incrémente la prop `trigger` pour déclencher une envolée. À chaque
 * changement, un lot de feuilles est régénéré ; chacune monte, dérive, tourne
 * et s'efface. La couche ne capte aucun toucher (pointerEvents="none").
 */

import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const LEAF_COLORS = ['#9FC3AD', '#8FB6A2', '#D9BE86', '#7FA88C', '#C6D8C2'];
const LEAF_ICONS = ['leaf', 'leaf-outline'] as const;

type Leaf = {
  id: number;
  x: number;
  size: number;
  color: string;
  icon: (typeof LEAF_ICONS)[number];
  drift: number;
  rise: number;
  spin: number;
  delay: number;
};

function makeLeaves(width: number): Leaf[] {
  const cx = width / 2;
  return Array.from({ length: 14 }, (_, i) => ({
    id: Date.now() + i,
    x: cx + (Math.random() - 0.5) * width * 0.7,
    size: 16 + Math.random() * 12,
    color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
    icon: LEAF_ICONS[Math.floor(Math.random() * LEAF_ICONS.length)],
    drift: (Math.random() - 0.5) * 120,
    rise: 180 + Math.random() * 220,
    spin: (Math.random() - 0.5) * 360,
    delay: Math.random() * 120,
  }));
}

export function LeafBurst({ trigger, originY }: { trigger: number; originY: number }) {
  const { width } = useWindowDimensions();
  const [leaves, setLeaves] = useState<Leaf[]>([]);

  useEffect(() => {
    if (trigger === 0) return;
    setLeaves(makeLeaves(width));
  }, [trigger, width]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {leaves.map((l) => (
        <Particle key={l.id} leaf={l} originY={originY} />
      ))}
    </View>
  );
}

function Particle({ leaf, originY }: { leaf: Leaf; originY: number }) {
  const [a] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: 1200,
      delay: leaf.delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [a, leaf.delay]);

  const translateY = a.interpolate({ inputRange: [0, 1], outputRange: [0, -leaf.rise] });
  const translateX = a.interpolate({ inputRange: [0, 1], outputRange: [0, leaf.drift] });
  const rotate = a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${leaf.spin}deg`] });
  const opacity = a.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] });
  const scale = a.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 1, 0.9] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: leaf.x,
        top: originY,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }, { scale }],
      }}
    >
      <Ionicons name={leaf.icon} size={leaf.size} color={leaf.color} />
    </Animated.View>
  );
}
