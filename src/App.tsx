import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Composant racine de l'application.
 *
 * En React Native, un composant est une fonction pure qui renvoie une
 * description de l'UI (l'arbre JSX). Le runtime (Metro + le moteur natif)
 * se charge de transformer cette description en vues natives Android/iOS.
 */
export default function App(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Hello, World 👋</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, // occupe toute la hauteur/largeur disponible (flexbox)
    backgroundColor: '#ffffff',
    alignItems: 'center', // centrage horizontal (axe transverse)
    justifyContent: 'center', // centrage vertical (axe principal)
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
});
