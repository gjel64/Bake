/**
 * App.tsx — le composant racine.
 *
 * Rôle : initialiser la base au démarrage, puis mettre en place la navigation.
 *
 * Navigation choisie : `material-top-tabs` avec la barre placée EN BAS
 * (`tabBarPosition="bottom"`). Ce navigateur est nativement SWIPEABLE — on
 * change donc de page au doigt ET via la barre d'onglets. Un seul composant
 * couvre les deux modes demandés (barre + scroll), ce qui reste très simple.
 */

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Ionicons } from '@expo/vector-icons';

import { HabitsScreen } from '@/screens/HabitsScreen';
import { MeditationScreen } from '@/screens/MeditationScreen';
import { ScheduleScreen } from '@/screens/ScheduleScreen';
import { StatsScreen } from '@/screens/StatsScreen';
import { initDatabase } from '@/db/database';
import { colors, font } from '@/theme';

/** Icône d'onglet selon la page (Ionicons). */
function tabIcon(routeName: string): keyof typeof Ionicons.glyphMap {
  if (routeName === 'Habitudes') return 'leaf';
  if (routeName === 'Méditer') return 'flower';
  if (routeName === 'Agenda') return 'calendar';
  return 'stats-chart';
}

const Tab = createMaterialTopTabNavigator();

export default function App(): React.JSX.Element {
  // Création des tables une seule fois, au montage de l'app.
  useEffect(() => {
    initDatabase();
  }, []);

  return (
    <SafeAreaProvider>
      {/* Icônes de la barre d'état en clair : elles passent sur le dégradé vert */}
      <StatusBar style="light" />

      <NavigationContainer>
        <Tab.Navigator
          // La barre d'onglets est ancrée en bas (comportement « app native »).
          tabBarPosition="bottom"
          // Le swipe latéral entre pages est activé par défaut ici.
          screenOptions={({ route }) => ({
            swipeEnabled: true,
            tabBarActiveTintColor: colors.aurora,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarShowIcon: true,
            tabBarIndicatorStyle: { backgroundColor: colors.aurora, height: 3 },
            tabBarStyle: {
              backgroundColor: colors.night,
              borderTopWidth: 1,
              borderTopColor: colors.glassBorder,
            },
            tabBarLabelStyle: {
              fontSize: font.tiny,
              fontWeight: '600',
              textTransform: 'none',
            },
            tabBarIcon: ({ color }) => (
              <Ionicons name={tabIcon(route.name)} size={20} color={color} />
            ),
          })}
        >
          <Tab.Screen name="Habitudes" component={HabitsScreen} />
          <Tab.Screen name="Méditer" component={MeditationScreen} />
          <Tab.Screen name="Agenda" component={ScheduleScreen} />
          <Tab.Screen name="Stats" component={StatsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
