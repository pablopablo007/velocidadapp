import {
  ChakraPetch_300Light,
  ChakraPetch_400Regular,
  ChakraPetch_500Medium,
  ChakraPetch_600SemiBold,
  ChakraPetch_600SemiBold_Italic,
  ChakraPetch_700Bold,
  ChakraPetch_700Bold_Italic,
  useFonts,
} from '@expo-google-fonts/chakra-petch';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// El import registra la tarea de segundo plano en el arranque (requisito de
// expo-task-manager: `defineTask` debe ejecutarse antes de que iOS la invoque).
import '@/services/backgroundLocation';

import { CarPlaySync } from '@/state/CarPlaySync';
import { SensorsProvider } from '@/state/SensorsContext';
import { SettingsProvider } from '@/state/SettingsContext';
import { TrackingProvider } from '@/state/TrackingContext';
import { VehicleSwitchProvider } from '@/state/VehicleSwitch';
import { AccentProvider } from '@/theme/accent';
import { colors } from '@/theme/theme';

// La pantalla de carga se queda hasta tener la tipografía: si no, las cifras
// aparecerían un instante con la fuente del sistema y luego saltarían.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ChakraPetch_300Light,
    ChakraPetch_400Regular,
    ChakraPetch_500Medium,
    ChakraPetch_600SemiBold,
    ChakraPetch_600SemiBold_Italic,
    ChakraPetch_700Bold,
    ChakraPetch_700Bold_Italic,
  });

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Si la fuente falla (sin espacio, archivo dañado) la app sigue con la del sistema.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <AccentProvider>
          <TrackingProvider>
          <VehicleSwitchProvider>
            <SensorsProvider>
            <CarPlaySync />
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="trip/[id]"
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="car-photos"
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
            </Stack>
            </SensorsProvider>
          </VehicleSwitchProvider>
          </TrackingProvider>
          </AccentProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
