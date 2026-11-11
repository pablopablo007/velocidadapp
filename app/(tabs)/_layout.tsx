import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';

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
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          position: 'absolute',
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.bgElevated,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '800', fontStyle: 'italic', letterSpacing: 0.4 },
        tabBarBackground:
          Platform.OS === 'ios'
            ? () => (
                <BlurView
                  intensity={70}
                  tint="dark"
                  style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(7,7,8,0.78)' }]}
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
