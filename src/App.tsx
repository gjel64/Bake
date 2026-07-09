/**
 * App.tsx — le composant racine.
 *
 * Rôle : initialiser la base + les notifications, poser le fond panorama
 * global, puis la navigation à 5 onglets.
 *
 * Navigation : `material-top-tabs`, barre en bas + swipe. Le panorama d'Alaska
 * est rendu DERRIÈRE le navigateur (scènes transparentes) et glisse selon
 * l'onglet actif → effet de parallaxe.
 */

import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  DefaultTheme,
  NavigationContainer,
  NavigationState,
  Theme,
} from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Ionicons } from '@expo/vector-icons';

import { HabitsScreen } from '@/screens/HabitsScreen';
import { TodoScreen } from '@/screens/TodoScreen';
import { MeditationScreen } from '@/screens/MeditationScreen';
import { ScheduleScreen } from '@/screens/ScheduleScreen';
import { StatsScreen } from '@/screens/StatsScreen';
import { PanoramaBackground } from '@/components/ui/PanoramaBackground';
import { initDatabase } from '@/db/database';
import { initNotifications } from '@/lib/notifications';
import { colors, font } from '@/theme';

const TAB_COUNT = 5;

/** Icône d'onglet selon la page (Ionicons). */
function tabIcon(routeName: string): keyof typeof Ionicons.glyphMap {
  if (routeName === 'Habitudes') return 'leaf';
  if (routeName === 'To-do') return 'checkbox-outline';
  if (routeName === 'Agenda') return 'calendar';
  if (routeName === 'Méditer') return 'flower';
  return 'stats-chart';
}

// Thème React Navigation transparent : laisse voir le panorama derrière.
const navTheme: Theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent' },
};

const Tab = createMaterialTopTabNavigator();

export default function App(): React.JSX.Element {
  useEffect(() => {
    initDatabase();
    initNotifications();
  }, []);

  // Position animée du panorama, pilotée par l'onglet actif.
  const pos = useRef(new Animated.Value(0)).current;

  function onStateChange(state: NavigationState | undefined) {
    if (!state) return;
    Animated.timing(pos, {
      toValue: state.index,
      duration: 320,
      useNativeDriver: true,
    }).start();
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />

      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Fond panorama global (parallaxe) */}
        <PanoramaBackground index={pos} count={TAB_COUNT} />

        <NavigationContainer theme={navTheme} onStateChange={onStateChange}>
          <Tab.Navigator
            tabBarPosition="bottom"
            sceneContainerStyle={{ backgroundColor: 'transparent' }}
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
              tabBarItemStyle: { paddingHorizontal: 0 },
              tabBarIcon: ({ color }) => (
                <Ionicons name={tabIcon(route.name)} size={20} color={color} />
              ),
            })}
          >
            <Tab.Screen name="Habitudes" component={HabitsScreen} />
            <Tab.Screen name="To-do" component={TodoScreen} />
            <Tab.Screen name="Agenda" component={ScheduleScreen} />
            <Tab.Screen name="Méditer" component={MeditationScreen} />
            <Tab.Screen name="Stats" component={StatsScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}
