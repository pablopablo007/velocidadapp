import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useSettings } from '@/state/SettingsContext';
import { colors, fonts } from '@/theme/theme';
import { VehicleTheme, themeFor } from '@/vehicles';
import { Vehicle } from '@/vehicles/polo';

/**
 * Transición al cambiar de vehículo.
 *
 * Todo el movimiento corre en el hilo de interfaz con Reanimated: no pasa por
 * JavaScript cuadro a cuadro, así que en la pantalla ProMotion del iPhone 15 Pro
 * va a 120 fps (Info.plist lleva CADisableMinimumFrameDurationOnPhone para que
 * iOS no lo limite a 60).
 *
 * Secuencia (un solo valor `p` de 0 a 2):
 *   0 → 1  un círculo oscuro con borde del color nuevo se abre desde donde
 *          tocaste y tapa la pantalla; cruzan estelas de velocidad y entra el
 *          nombre del carro.
 *   1      con la pantalla tapada se cambia la ficha y el color de toda la app
 *          (así no se ve ningún parpadeo) y vibra.
 *   1 → 2  el nombre sale hacia la izquierda y el círculo se desvanece
 *          creciendo, descubriendo la app ya con el color nuevo.
 */

type Origin = { x: number; y: number };

type Ctx = {
  /** Cambia al vehículo `id` con la transición. `origin` es el punto tocado. */
  switchVehicle: (id: string, origin?: Origin) => void;
  switching: boolean;
};

const VehicleSwitchContext = createContext<Ctx | null>(null);

const COVER_MS = 460;
const HOLD_MS = 260;
const REVEAL_MS = 560;

type Target = { vehicle: Vehicle; theme: VehicleTheme; origin: Origin };

export function VehicleSwitchProvider({ children }: { children: React.ReactNode }) {
  const { settings, setActiveVehicle } = useSettings();
  const { width, height } = useWindowDimensions();
  const [target, setTarget] = useState<Target | null>(null);
  const busy = useRef(false);
  const p = useSharedValue(0);

  const commit = useCallback(
    (id: string) => {
      setActiveVehicle(id);
      if (settings.hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      }
    },
    [setActiveVehicle, settings.hapticsEnabled],
  );

  const finish = useCallback(() => {
    busy.current = false;
    setTarget(null);
    p.set(0);
  }, [p]);

  const switchVehicle = useCallback(
    (id: string, origin?: Origin) => {
      if (busy.current || id === settings.activeVehicleId) return;
      const vehicle = settings.vehicles[id];
      if (!vehicle) return;
      busy.current = true;
      setTarget({ vehicle, theme: themeFor(id), origin: origin ?? { x: width / 2, y: height / 2 } });
      if (settings.hapticsEnabled) Haptics.selectionAsync().catch(() => {});

      p.set(0);
      p.set(
        withSequence(
          withTiming(1, { duration: COVER_MS, easing: Easing.bezier(0.7, 0, 0.2, 1) }, (done) => {
            if (done) scheduleOnRN(commit, id);
          }),
          withDelay(
            HOLD_MS,
            withTiming(2, { duration: REVEAL_MS, easing: Easing.bezier(0.3, 0, 0.1, 1) }, (done) => {
              if (done) scheduleOnRN(finish);
            }),
          ),
        ),
      );
    },
    [settings.activeVehicleId, settings.vehicles, settings.hapticsEnabled, width, height, p, commit, finish],
  );

  const value = useMemo<Ctx>(() => ({ switchVehicle, switching: target != null }), [switchVehicle, target]);

  return (
    <VehicleSwitchContext.Provider value={value}>
      {children}
      {target && <SwitchOverlay p={p} target={target} width={width} height={height} />}
    </VehicleSwitchContext.Provider>
  );
}

export function useVehicleSwitch(): Ctx {
  const ctx = useContext(VehicleSwitchContext);
  if (!ctx) throw new Error('useVehicleSwitch debe usarse dentro de <VehicleSwitchProvider>');
  return ctx;
}

// ----------------------------------------------------------------------------

type OverlayProps = {
  p: ReturnType<typeof useSharedValue<number>>;
  target: Target;
  width: number;
  height: number;
};

const STREAKS = [0.18, 0.31, 0.44, 0.57, 0.7, 0.83];

function SwitchOverlay({ p, target, width, height }: OverlayProps) {
  const { origin, theme, vehicle } = target;
  // Radio que cubre la pantalla entera desde el punto tocado.
  const reach = Math.hypot(Math.max(origin.x, width - origin.x), Math.max(origin.y, height - origin.y)) + 24;
  const d = reach * 2;

  const wipe = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.05, 1.25, 2], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(p.value, [0, 1, 2], [0.001, 1, 1.12], Extrapolation.CLAMP) }],
  }));

  // Anillo del color nuevo que va por delante del círculo.
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.1, 0.85, 1.05], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(p.value, [0, 1], [0.001, 1.04], Extrapolation.CLAMP) }],
  }));

  const title = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.45, 0.85, 1.15, 1.55], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(p.value, [0.45, 1, 1.15, 1.6], [60, 0, 0, -90], Extrapolation.CLAMP) },
      { scale: interpolate(p.value, [0.45, 1], [1.08, 1], Extrapolation.CLAMP) },
    ],
  }));

  const underline = useAnimatedStyle(() => ({
    transform: [{ scaleX: interpolate(p.value, [0.6, 1.05, 1.2, 1.6], [0, 1, 1, 0], Extrapolation.CLAMP) }],
  }));

  const glow = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.5, 1, 1.3, 1.8], [0, 0.9, 0.9, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <Animated.View
        style={[
          styles.circle,
          {
            width: d,
            height: d,
            borderRadius: reach,
            left: origin.x - reach,
            top: origin.y - reach,
            backgroundColor: colors.bg,
          },
          wipe,
        ]}
      />
      <Animated.View
        style={[
          styles.circle,
          {
            width: d,
            height: d,
            borderRadius: reach,
            left: origin.x - reach,
            top: origin.y - reach,
            borderWidth: 3,
            borderColor: theme.accent,
            shadowColor: theme.accent,
            shadowOpacity: 0.9,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 0 },
          },
          ring,
        ]}
      />

      {STREAKS.map((y, i) => (
        <Streak key={y} p={p} y={y * height} width={width} index={i} color={theme.accent} />
      ))}

      <View style={styles.center} pointerEvents="none">
        <Animated.View
          style={[styles.glow, { backgroundColor: theme.glow, shadowColor: theme.accent }, glow]}
        />
        <Animated.View style={[styles.titleBlock, title]}>
          <Text style={[styles.kicker, { color: theme.accent }]}>{theme.name.toUpperCase()}</Text>
          <Text style={styles.model} numberOfLines={1} adjustsFontSizeToFit>
            {vehicle.model.toUpperCase()}
          </Text>
          <Animated.View style={[styles.underline, { backgroundColor: theme.accent }, underline]} />
          <Text style={styles.trim}>
            {vehicle.year} · {vehicle.trim} · {vehicle.powerCv} CV
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

/** Estela de velocidad: una raya fina que cruza la pantalla de derecha a izquierda. */
function Streak({
  p,
  y,
  width,
  index,
  color,
}: {
  p: OverlayProps['p'];
  y: number;
  width: number;
  index: number;
  color: string;
}) {
  const len = width * (0.35 + (index % 3) * 0.12);
  const start = 0.25 + index * 0.05;
  const end = start + 0.9;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      p.value,
      [start, start + 0.15, end - 0.2, end],
      [0, 0.85, 0.85, 0],
      Extrapolation.CLAMP,
    ),
    transform: [{ translateX: interpolate(p.value, [start, end], [width, -len], Extrapolation.CLAMP) }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.streak,
        { top: y, width: len, backgroundColor: color, height: index % 2 ? 1.5 : 2.5 },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  circle: { position: 'absolute' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0,
    shadowOpacity: 1,
    shadowRadius: 80,
    shadowOffset: { width: 0, height: 0 },
    transform: [{ scaleY: 0.35 }],
  },
  titleBlock: { alignItems: 'center', paddingHorizontal: 24, maxWidth: '100%' },
  kicker: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 5 },
  model: {
    fontFamily: fonts.bold,
    fontSize: 44,
    letterSpacing: 2,
    color: colors.text,
    marginTop: 6,
  },
  underline: { height: 3, width: 180, borderRadius: 2, marginTop: 10 },
  trim: {
    fontFamily: fonts.medium,
    fontSize: 13,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginTop: 12,
  },
  streak: { position: 'absolute', left: 0, borderRadius: 2 },
});
