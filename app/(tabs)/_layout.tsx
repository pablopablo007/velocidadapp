import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
// Tabs y useBottomTabBarHeight tienen que salir del mismo módulo: si no, la
// cabina no encuentra el contexto con la altura de la barra.
import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';

import { TAB_BAR_STYLE } from '@/theme/tabBar';
import { colors } from '@/theme/theme';

/**
 * Icono de pestaña. Desde RN 0.88 el color llega como ColorValue (admite null),
 * pero aquí siempre es el string de tabBarActiveTintColor/InactiveTintColor.
 */
const tabIcon =
  (name: React.ComponentProps<typeof Ionicons>['name']) =>
  function TabIcon({ color, size }: { color: unknown; size: number }) {
    return (
      <Ionicons name={name} size={size} color={typeof color === 'string' ? color : colors.textFaint} />
    );
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: TAB_BAR_STYLE,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500', letterSpacing: 0.2 },
        tabBarBackground:
          Platform.OS === 'ios'
            ? () => (
                <BlurView
                  intensity={70}
                  tint="dark"
                  style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,10,11,0.82)' }]}
                />
              )
            : undefined,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Velocidad',
          tabBarIcon: tabIcon('speedometer'),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Mapa',
          tabBarIcon: tabIcon('map'),
        }}
      />
      <Tabs.Screen
        name="chrono"
        options={{
          title: 'Crono',
          tabBarIcon: tabIcon('timer'),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historial',
          tabBarIcon: tabIcon('list'),
        }}
      />
      <Tabs.Screen
        name="garage"
        options={{
          title: 'Garaje',
          tabBarIcon: tabIcon('car-sport'),
        }}
      />
    </Tabs>
  );
}
