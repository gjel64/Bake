/**
 * PanoramaBackground — le paysage d'Alaska, en fond GLOBAL derrière la
 * navigation. Une seule grande image large ; on la fait glisser
 * horizontalement selon l'onglet actif (`index`), ce qui donne l'effet de
 * parallaxe : chaque écran découvre une tranche du paysage.
 */

import { Animated, StyleSheet, useWindowDimensions } from 'react-native';

const PANO = require('../../../assets/panorama.jpg');

export function PanoramaBackground({
  index,
  count,
}: {
  index: Animated.Value; // valeur animée 0 … count-1 (onglet courant)
  count: number;
}) {
  const { width, height } = useWindowDimensions();
  const totalWidth = width * count;

  // À l'onglet 0 on montre la gauche du panorama ; au dernier, la droite.
  const translateX = index.interpolate({
    inputRange: [0, Math.max(1, count - 1)],
    outputRange: [0, -(width * (count - 1))],
  });

  return (
    <Animated.Image
      source={PANO}
      resizeMode="cover"
      style={[
        styles.image,
        { width: totalWidth, height, transform: [{ translateX }] },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  image: { position: 'absolute', left: 0, top: 0 },
});
