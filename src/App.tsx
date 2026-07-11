/**
 * App.tsx — le composant racine (V3, look iOS).
 *
 * Initialise la base + les notifications, puis pose une tab bar FLOTTANTE
 * arrondie (détachée du bord, icônes seules, tap uniquement). Le thème
 * (clair / sombre) suit le système via `useColorScheme`.
 */

import { useEffect } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  Theme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { HabitsScreen } from '@/screens/HabitsScreen';
import { TodoScreen } from '@/screens/TodoScreen';
import { MeditationScreen } from '@/screens/MeditationScreen';
import { ScheduleScreen } from '@/screens/ScheduleScreen';
import { StatsScreen } from '@/screens/StatsScreen';
import { initDatabase } from '@/db/database';
import { initNotifications } from '@/lib/notifications';
import { darkColors, lightColors } from '@/theme';

/** Icônes d'onglet : pleine si actif, contour sinon (convention iOS). */
function icon(routeName: string, focused: boolean): keyof typeof Ionicons.glyphMap {
  const map: Record<string, [string, string]> = {
    Habitudes: ['leaf', 'leaf-outline'],
    'To-do': ['checkbox', 'checkbox-outline'],
    Agenda: ['calendar', 'calendar-outline'],
    Méditer: ['flower', 'flower-outline'],
    Stats: ['stats-chart', 'stats-chart-outline'],
  };
  const pair = map[routeName] ?? ['ellipse', 'ellipse-outline'];
  return (focused ? pair[0] : pair[1]) as keyof typeof Ionicons.glyphMap;
}

const Tab = createBottomTabNavigator();

export default function App(): React.JSX.Element {
  useEffect(() => {
    initDatabase();
    initNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <AppNav />
    </SafeAreaProvider>
  );
}

/** La navigation, à l'intérieur du SafeAreaProvider (pour lire les marges). */
function AppNav() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const c = dark ? darkColors : lightColors;
  const insets = useSafeAreaInsets();

  const navTheme: Theme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme : DefaultTheme).colors,
      background: c.bg,
      card: c.bg,
      primary: c.primary,
      text: c.text,
      border: c.glassBorder,
    },
  };

  return (
    <>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <NavigationContainer theme={navTheme}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarShowLabel: false, // icônes seules
            tabBarActiveTintColor: c.primary,
            tabBarInactiveTintColor: c.textMuted,
            // Barre FLOTTANTE arrondie, détachée du bord.
            tabBarStyle: {
              position: 'absolute',
              left: 20,
              right: 20,
              bottom: insets.bottom + 8,
              height: 62,
              paddingBottom: 0,
              borderRadius: 30,
              backgroundColor: c.bgAlt,
              borderWidth: StyleSheet.hairlineWidth,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderColor: c.glassBorder,
              borderTopColor: c.glassBorder,
              shadowColor: '#000',
              shadowOpacity: dark ? 0.4 : 0.14,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 12,
            },
            tabBarItemStyle: { height: 62 },
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={icon(route.name, focused)} size={24} color={color} />
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
    </>
  );
}
