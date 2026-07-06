# Bake — Guide technique

Écrit pour quelqu'un qui vient du **C++** : on va parler modèle d'exécution,
sémantique, et coût, pas juste « colle ce bout de code ». Puis un **catalogue**
des composants sympa fournis par React Native / Expo.

---

## 1. Modèle d'exécution

### Les acteurs

Une app RN tourne sur **deux mondes** qui communiquent :

```
┌────────────────────────┐        JSI / bridge        ┌───────────────────────┐
│   Moteur JavaScript     │  <───────────────────────> │   Côté natif (UI)     │
│   (Hermes)              │   appels de fonctions,     │   Views Android/iOS   │
│   → TON code tourne ici │   sérialisation légère     │   thread principal UI │
└────────────────────────┘                            └───────────────────────┘
```

- **Hermes** = une VM JavaScript (bytecode précompilé, GC), l'équivalent d'un
  interpréteur/JIT embarqué. Ton code TSX est transpilé en JS, puis exécuté ici.
- Le **thread UI natif** manipule les vraies `View` Android. Ton JS ne les
  touche jamais directement : il **décrit** ce qu'il veut, le natif applique.
- La communication passe par **JSI** (interface C++ qui expose des objets
  natifs au moteur JS). C'est proche d'un FFI : appels quasi directs, pas de
  RPC réseau.

Conséquence pratique : garde le thread JS libre. Une boucle lourde en JS gèle
l'UI, exactement comme bloquer le main thread en C++.

### Déclaratif, pas impératif

En C++/Qt tu écrirais :

```cpp
label->setText("Hello");   // tu MUTES l'objet existant
```

En RN tu écris une **fonction pure** qui renvoie une *description* de l'UI pour
un état donné :

```tsx
function App() {
  return <Text>Hello</Text>;   // tu RETOURNES un arbre, tu ne mutes rien
}
```

Le framework compare l'ancien arbre et le nouveau (**réconciliation**, un diff
d'arbres), et n'applique au natif que le delta. Mentalement :
`UI = f(state)`. Tu ne décris jamais *les transitions*, seulement *l'état
cible*. La machine calcule les mutations minimales.

### JSX = sucre syntaxique

JSX n'est pas magique. C'est réécrit en appels de fonction à la compilation :

```tsx
<View style={s.box}><Text>Hi</Text></View>
```

devient, après transpilation (Babel) :

```ts
React.createElement(View, { style: s.box },
  React.createElement(Text, null, "Hi"));
```

`createElement` renvoie un objet plain-old-data (`{ type, props, children }`) :
un nœud d'arbre. Un composant est donc une **factory d'AST d'UI**. Rien ne
s'affiche tant que le moteur n'a pas *monté* cet arbre.

### État, immutabilité et re-render

```tsx
const [count, setCount] = useState(0);
```

- `count` est une **valeur** (snapshot immuable pour ce rendu).
- `setCount(v)` ne mute pas `count` : il **planifie un nouveau rendu**, c.-à-d.
  un nouvel appel de la fonction composant, où `useState` renverra la valeur à
  jour. C'est de la **value semantics**, pas des références mutables.

Règle qui surprend les gens venant du C++ : **ne mute jamais l'état en place**.

```tsx
list.push(x);          // ❌ mutation : React ne "voit" pas le changement
setList([...list, x]); // ✅ nouvelle valeur : déclenche le diff
```

Pense « copy-on-write » / passage par valeur. Le diff d'arbres repose sur la
comparaison d'identités : muter en place casse cette détection.

### Props = paramètres immuables

Les `props` sont les arguments d'un composant, **en lecture seule** (comme un
`const&`). Le flux de données est **descendant** (parent → enfant). Pour
remonter de l'information, le parent passe un *callback* :

```tsx
function Parent() {
  const [n, setN] = useState(0);
  return <Child value={n} onInc={() => setN(n + 1)} />;
}

type ChildProps = { value: number; onInc: () => void };
function Child({ value, onInc }: ChildProps) {
  return <Button title={`${value}`} onPress={onInc} />;
}
```

### Hooks : de l'état attaché à l'instance

`useState`, `useEffect`, etc. sont des **hooks**. Contrainte non négociable :
ils doivent être appelés **au top-level du composant, dans le même ordre à
chaque rendu** (pas dans un `if`, pas dans une boucle). En interne React les
identifie **par position d'appel** (indice), pas par nom — d'où la règle.

```tsx
useEffect(() => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);   // cleanup ~ destructeur / RAII
}, []);                              // [] = deps : exécuté une fois au montage
```

Le `return` d'un `useEffect` est ta fonction de nettoyage : c'est l'analogue
d'un destructeur RAII, appelé au démontage (ou avant de ré-exécuter l'effet si
les deps changent).

### Layout : Yoga (un moteur C++)

Le positionnement se fait en **Flexbox**, calculé par **Yoga**, une lib de
layout écrite en C++ et embarquée dans RN. Deux différences avec le web :
`flexDirection` vaut `'column'` par défaut (empilement vertical), et les
dimensions sont des nombres (DIP), sans unité.

```tsx
const s = StyleSheet.create({
  row:  { flexDirection: 'row', gap: 8, alignItems: 'center' },
  fill: { flex: 1 },   // ~ facteur de croissance (flex-grow)
});
```

`StyleSheet.create` renvoie juste un objet figé (opportunité d'optim + validation
de types), rien de plus. Un style est un objet JS ordinaire.

---

## 2. Anatomie d'un composant typé

```tsx
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Le "contrat" du composant : ses paramètres, typés (comme une signature).
type CounterProps = {
  initial?: number;              // '?' → optionnel (a une valeur par défaut)
  step?: number;
};

export function Counter({ initial = 0, step = 1 }: CounterProps) {
  const [n, setN] = useState<number>(initial);   // état local typé

  return (
    <View style={styles.row}>
      <Pressable onPress={() => setN(n - step)} style={styles.btn}>
        <Text style={styles.sign}>−</Text>
      </Pressable>

      <Text style={styles.value}>{n}</Text>

      <Pressable onPress={() => setN(n + step)} style={styles.btn}>
        <Text style={styles.sign}>＋</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 16 },
  btn:   { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#eef' },
  sign:  { fontSize: 22, fontWeight: '700' },
  value: { fontSize: 20, minWidth: 40, textAlign: 'center' },
});
```

---

## 3. Catalogue des composants « jolis »

> Convention : *core* = fourni par `react-native`, aucune install. *expo* /
> *community* = un paquet à installer (commande donnée). Toujours préférer
> `npx expo install <pkg>` : il verrouille la version compatible avec ton SDK.

### 3.1 Onglets en bas (Tabs) — *à installer*

Le composant le plus « app native ». Nécessite React Navigation :

```bash
npx expo install @react-navigation/native @react-navigation/bottom-tabs \
  react-native-screens react-native-safe-area-context
```

```tsx
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

const Tab = createBottomTabNavigator();

const Home  = () => <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><Text>Home</Text></View>;
const Prefs = () => <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><Text>Réglages</Text></View>;

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: '#4F46E5',
          tabBarIcon: ({ color, size }) => {
            const name = route.name === 'Home' ? 'home' : 'settings';
            return <Ionicons name={name} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Home"  component={Home} />
        <Tab.Screen name="Prefs" component={Prefs} options={{ title: 'Réglages' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
```

Variante **onglets en haut** : `@react-navigation/material-top-tabs`.
Navigation en **pile** (push/pop, comme une stack d'écrans) :
`@react-navigation/native-stack`.

### 3.2 Listes performantes — *core*

`ScrollView` rend **tous** ses enfants d'un coup (ok pour peu d'éléments).
`FlatList` **virtualise** (ne monte que ce qui est visible + un buffer) — c'est
lui qu'il faut pour de vraies listes.

```tsx
import { FlatList, Text, View } from 'react-native';

<FlatList
  data={items}                                   // T[]
  keyExtractor={(it) => it.id}                    // clé stable = identité pour le diff
  ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#eee' }} />}
  renderItem={({ item }) => <Text style={{ padding: 12 }}>{item.label}</Text>}
  ListEmptyComponent={<Text>Vide</Text>}
  ListHeaderComponent={<Text style={{ fontWeight: '700' }}>Titre</Text>}
/>
```

Besoin de sections (listes groupées avec en-têtes) : `SectionList`.

### 3.3 Pressable — *core*

Le primitif tactile bas niveau. Son `style` peut être une **fonction** de
l'état d'interaction (feedback sans state manuel) :

```tsx
import { Pressable, Text } from 'react-native';

<Pressable
  onPress={() => {}}
  android_ripple={{ color: '#ccc' }}                 // effet ripple natif Android
  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 12 })}
>
  <Text>Tape-moi</Text>
</Pressable>
```

### 3.4 Interrupteur & curseur

```tsx
// Switch — core
import { Switch } from 'react-native';
const [on, setOn] = useState(false);
<Switch value={on} onValueChange={setOn} />
```

```bash
# Slider — community
npx expo install @react-native-community/slider
```
```tsx
import Slider from '@react-native-community/slider';
<Slider minimumValue={0} maximumValue={100} step={1} onValueChange={setVal} />
```

### 3.5 Modal — *core*

Vue superposée plein écran. `visible` est piloté par ton état (déclaratif) :

```tsx
import { Modal, View, Text, Button } from 'react-native';
const [open, setOpen] = useState(false);

<Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
  <View style={{ flex:1, backgroundColor:'#0008', justifyContent:'center', padding:24 }}>
    <View style={{ backgroundColor:'#fff', borderRadius:16, padding:24 }}>
      <Text>Contenu de la modale</Text>
      <Button title="Fermer" onPress={() => setOpen(false)} />
    </View>
  </View>
</Modal>
```

### 3.6 Indicateur de chargement — *core*

```tsx
import { ActivityIndicator } from 'react-native';
<ActivityIndicator size="large" color="#4F46E5" />
```

### 3.7 Pull-to-refresh — *core*

Se branche sur une `FlatList`/`ScrollView` via `refreshControl` :

```tsx
import { RefreshControl, ScrollView } from 'react-native';
const [refreshing, setRefreshing] = useState(false);

<ScrollView
  refreshControl={
    <RefreshControl refreshing={refreshing} onRefresh={async () => {
      setRefreshing(true); await reload(); setRefreshing(false);
    }} />
  }
>
  {/* ... */}
</ScrollView>
```

### 3.8 Gestion du clavier — *core*

Évite que le clavier recouvre un champ de saisie :

```tsx
import { KeyboardAvoidingView, Platform, TextInput } from 'react-native';

<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex:1 }}>
  <TextInput placeholder="…" style={{ padding:12, borderWidth:1 }} />
</KeyboardAvoidingView>
```

### 3.9 Zones sûres (encoches) — *à installer*

```bash
npx expo install react-native-safe-area-context
```
```tsx
import { SafeAreaView } from 'react-native-safe-area-context';
<SafeAreaView style={{ flex:1 }} edges={['top']}>{/* ... */}</SafeAreaView>
```

### 3.10 Animations

Deux niveaux :

```tsx
// LayoutAnimation — core, une ligne, anime automatiquement le prochain re-layout
import { LayoutAnimation, Platform, UIManager } from 'react-native';
if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
LayoutAnimation.easeInEaseOut();
setOpen(!open);   // le changement de layout qui suit est animé
```

```tsx
// Animated — core, contrôle fin d'une valeur interpolée
import { Animated } from 'react-native';
const opacity = useRef(new Animated.Value(0)).current;
useEffect(() => {
  Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
}, []);
<Animated.View style={{ opacity }}>{/* ... */}</Animated.View>
```

Pour de l'animation complexe/gestuelle 60 fps : `react-native-reanimated`
(`npx expo install react-native-reanimated`), qui exécute les animations sur le
thread UI plutôt que JS.

### 3.11 Effets visuels — *expo*

```bash
npx expo install expo-linear-gradient expo-blur @expo/vector-icons expo-haptics
```
```tsx
import { LinearGradient } from 'expo-linear-gradient';
<LinearGradient colors={['#4F46E5', '#EC4899']} style={{ flex:1 }} />

import { BlurView } from 'expo-blur';
<BlurView intensity={40} style={StyleSheet.absoluteFill} />

import { Ionicons } from '@expo/vector-icons';
<Ionicons name="rocket" size={28} color="#4F46E5" />

import * as Haptics from 'expo-haptics';
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);   // vibration tactile
```

### 3.12 Barre d'état & images — *core / expo-status-bar*

```tsx
import { StatusBar } from 'expo-status-bar';
<StatusBar style="light" />

import { ImageBackground, Image } from 'react-native';
<ImageBackground source={{ uri:'https://…' }} style={{ flex:1 }} />
<Image source={{ uri:'https://…' }} style={{ width:64, height:64, borderRadius:32 }} />
```

---

## 4. Build, run, debug

- `npm run android` lance **Metro** (bundler + serveur de dev + file-watcher)
  et déploie sur l'émulateur/appareil. Garde-le ouvert.
- **Fast Refresh** : à la sauvegarde, seul le module changé est re-bundlé et
  réinjecté, l'état est préservé quand c'est possible. (~ hot reload, pas de
  recompilation complète.)
- Raccourcis dans le terminal Metro : `r` reload, `m` menu dev, `j` debugger,
  `a` ré-ouvrir Android.
- `npm run tsc` = passe de type-checking **sans émettre** de code (`--noEmit`),
  ton équivalent d'un `-fsyntax-only` généralisé aux types.
- Les erreurs runtime s'affichent en **rouge** dans Metro et sur l'appareil
  (redbox), avec la stack JS.

---

## 5. Table de correspondance mentale (C++ → RN)

| C++ / Qt | React Native | Note |
|---|---|---|
| `main()` | `registerRootComponent(App)` dans `index.ts` | point d'entrée |
| Objet UI muté (`setText`) | Fonction `f(state) → arbre` | déclaratif |
| Value semantics / copy | État immuable + `setState(newValue)` | jamais muter en place |
| `const&` param | `props` (lecture seule) | flux descendant |
| Callback / signal-slot | prop de type fonction (`onPress`) | remontée d'événements |
| Destructeur / RAII | `return () => {...}` d'un `useEffect` | nettoyage au démontage |
| Template `<T>` | Générique TS (`useState<number>`) | typage paramétré |
| Header/signature | `type Props = {...}` | contrat du composant |
| `-fsyntax-only` | `tsc --noEmit` | vérif sans build |
| Layout engine | **Yoga** (Flexbox, C++) | calcul des positions |
| main thread bloqué = freeze | thread JS bloqué = freeze UI | ne pas bloquer |

---

## 6. Où aller ensuite

1. Ajouter la navigation par onglets (§3.1) une fois que tu veux plus d'un écran.
2. Extraire tes composants réutilisables dans un dossier `src/components/`.
3. Introduire de l'état partagé (Context API, puis Zustand si besoin) quand
   deux écrans doivent lire la même donnée.

Doc de référence : https://reactnative.dev/docs/components-and-apis (liste
exhaustive des composants core) et https://docs.expo.dev (modules Expo).
