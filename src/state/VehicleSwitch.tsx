import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { GOL_ART_RATIO, GolPickupArt } from '@/components/GolPickupArt';
import { useSettings } from '@/state/SettingsContext';
import { useTracking } from '@/state/TrackingContext';
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
 * Secuencia:
 *   1. Cinco láminas inclinadas, con el filo del color nuevo, entran en
 *      cascada desde la derecha y tapan la pantalla.
 *   2. Con la pantalla tapada se cambia la ficha y el color de toda la app
 *      (no se ve ningún parpadeo) y el teléfono da un golpe háptico.
 *   3. El carro nuevo entra rodando desde la derecha y frena con un pequeño
 *      rebote sobre una línea de piso que se enciende; aparecen su nombre y
 *      sus tres cifras clave, una tras otra.
 *   4. El carro acelera y sale por la izquierda, y las láminas se van tras él
 *      descubriendo la app ya con su color.
 */

type Ctx = {
  /** Cambia al vehículo `id` con la transición. */
  switchVehicle: (id: string, origin?: { x: number; y: number }) => void;
  switching: boolean;
};

const VehicleSwitchContext = createContext<Ctx | null>(null);

const COVER_MS = 420;
const SHOW_MS = 1250;
const REVEAL_MS = 520;

const POLO_PHOTO = require('../../assets/images/polo-track.png');
const POLO_RATIO = 751 / 1400;

type Target = { vehicle: Vehicle; theme: VehicleTheme };

export function VehicleSwitchProvider({ children }: { children: React.ReactNode }) {
  const { settings, setActiveVehicle } = useSettings();
  const { status } = useTracking();
  const { width, height } = useWindowDimensions();
  const [target, setTarget] = useState<Target | null>(null);
  const busy = useRef(false);

  /** Láminas: 0 → 1 tapan, 1 → 2 descubren. */
  const cover = useSharedValue(0);
  /** Carro y textos: 0 → 1 entran, 1 → 2 salen. */
  const stage = useSharedValue(0);

  const haptics = settings.hapticsEnabled;

  const commit = useCallback(
    (id: string) => {
      setActiveVehicle(id);
      if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    },
    [setActiveVehicle, haptics]
  );

  const arrived = useCallback(() => {
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
  }, [haptics]);

  const finish = useCallback(() => {
    busy.current = false;
    setTarget(null);
    cover.set(0);
    stage.set(0);
  }, [cover, stage]);

  const switchVehicle = useCallback(
    (id: string) => {
      if (busy.current || id === settings.activeVehicleId) return;
      const vehicle = settings.vehicles[id];
      if (!vehicle) return;
      if (status !== 'idle') {
        // El viaje en curso pertenece al carro con el que empezó.
        Alert.alert(
          'Hay un viaje en curso',
          `Termina el viaje del ${settings.vehicle.model} antes de cambiar de carro, para que se guarde en su historial.`
        );
        return;
      }
      busy.current = true;
      setTarget({ vehicle, theme: themeFor(id) });
      if (haptics) Haptics.selectionAsync().catch(() => {});

      cover.set(0);
      stage.set(0);
      cover.set(
        withSequence(
          withTiming(1, { duration: COVER_MS, easing: Easing.bezier(0.65, 0, 0.2, 1) }, (done) => {
            if (done) scheduleOnRN(commit, id);
          }),
          withDelay(
            SHOW_MS,
            withTiming(2, { duration: REVEAL_MS, easing: Easing.bezier(0.6, 0, 0.15, 1) }, (done) => {
              if (done) scheduleOnRN(finish);
            })
          )
        )
      );
      stage.set(
        withDelay(
          COVER_MS - 140,
          withSequence(
            // Frenada con rebote: se pasa un poco y vuelve.
            withTiming(1, { duration: 620, easing: Easing.out(Easing.back(1.5)) }, (done) => {
              if (done) scheduleOnRN(arrived);
            }),
            withDelay(SHOW_MS - 620 - 60, withTiming(2, { duration: 420, easing: Easing.in(Easing.cubic) }))
          )
        )
      );
    },
    [settings.activeVehicleId, settings.vehicles, settings.vehicle.model, status, haptics, cover, stage, commit, finish, arrived]
  );

  const value = useMemo<Ctx>(() => ({ switchVehicle, switching: target != null }), [switchVehicle, target]);

  return (
    <VehicleSwitchContext.Provider value={value}>
      {children}
      {target && <SwitchOverlay cover={cover} stage={stage} target={target} width={width} height={height} />}
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
  cover: SharedValue<number>;
  stage: SharedValue<number>;
  target: Target;
  width: number;
  height: number;
};

const SLATS = 5;
const STREAKS = [0.2, 0.29, 0.37, 0.52, 0.6];

function SwitchOverlay({ cover, stage, target, width, height }: OverlayProps) {
  const { theme, vehicle } = target;
  const landscape = width > height;

  const ratio = vehicle.bodyType === 'pickup' ? GOL_ART_RATIO : POLO_RATIO;
  const carW = Math.min(width * (landscape ? 0.46 : 0.86), (height * (landscape ? 0.46 : 0.3)) / ratio);
  const carH = carW * ratio;

  // Fondo liso bajo las láminas: garantiza que no se vea la app por ninguna
  // rendija mientras se cambia el color.
  const backdrop = useAnimatedStyle(() => ({
    opacity: interpolate(cover.value, [0.55, 0.95, 1.1, 1.45], [0, 1, 1, 0], Extrapolation.CLAMP),
  }));

  const car = useAnimatedStyle(() => {
    const s = stage.value;
    const x =
      s <= 1
        ? interpolate(s, [0, 1], [width * 1.1, 0])
        : interpolate(s, [1, 2], [0, -width * 1.3], Extrapolation.CLAMP);
    return {
      opacity: interpolate(s, [0, 0.15, 1.9, 2], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: x },
        // Cabecea al frenar y se agacha al salir.
        { rotateZ: `${interpolate(s, [0.6, 0.9, 1, 1.25, 2], [0, -1.6, 0, 1.2, 1.2], Extrapolation.CLAMP)}deg` },
        { scale: interpolate(s, [0, 1, 2], [1.06, 1, 0.98], Extrapolation.CLAMP) },
      ],
    };
  });

  const floor = useAnimatedStyle(() => ({
    opacity: interpolate(stage.value, [0.3, 0.8, 1.2, 1.7], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ scaleX: interpolate(stage.value, [0.3, 1, 1.2, 1.8], [0, 1, 1, 0.2], Extrapolation.CLAMP) }],
  }));

  const glow = useAnimatedStyle(() => ({
    opacity: interpolate(stage.value, [0.5, 1, 1.2, 1.7], [0, 0.85, 0.85, 0], Extrapolation.CLAMP),
  }));

  const kicker = useAnimatedStyle(() => ({
    opacity: interpolate(stage.value, [0.55, 0.85, 1.15, 1.5], [0, 1, 1, 0], Extrapolation.CLAMP),
    letterSpacing: interpolate(stage.value, [0.55, 1], [12, 5], Extrapolation.CLAMP),
  }));

  const title = useAnimatedStyle(() => ({
    opacity: interpolate(stage.value, [0.6, 0.95, 1.15, 1.5], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(stage.value, [0.6, 1], [26, 0], Extrapolation.CLAMP) },
      { translateX: interpolate(stage.value, [1.15, 1.6], [0, -120], Extrapolation.CLAMP) },
    ],
  }));

  const specs = [
    { value: `${vehicle.powerCv}`, unit: 'CV' },
    { value: `${vehicle.torqueNm}`, unit: 'Nm' },
    { value: `${vehicle.topSpeedKmh}`, unit: 'km/h' },
  ];

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents="auto">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, backdrop]} />

      {Array.from({ length: SLATS }, (_, i) => (
        <Slat key={i} index={i} cover={cover} width={width} height={height} color={theme.accent} />
      ))}

      {STREAKS.map((y, i) => (
        <Streak key={y} stage={stage} y={y * height} width={width} index={i} color={theme.accent} />
      ))}

      <View style={styles.center} pointerEvents="none">
        <Animated.Text style={[styles.kicker, { color: theme.accent }, kicker]}>
          {theme.name.toUpperCase()}
        </Animated.Text>

        <View style={{ width: carW, height: carH + 26, marginTop: landscape ? 6 : 18 }}>
          <Animated.View
            style={[
              styles.glow,
              { width: carW * 0.9, height: carH * 0.5, left: carW * 0.05, top: carH * 0.55, backgroundColor: theme.glow, shadowColor: theme.accent },
              glow,
            ]}
          />
          <Animated.View style={car}>
            {vehicle.bodyType === 'pickup' ? (
              <GolPickupArt width={carW} height={carH} />
            ) : (
              <Image source={POLO_PHOTO} style={{ width: carW, height: carH }} resizeMode="contain" />
            )}
          </Animated.View>
          <Animated.View style={[styles.floor, { backgroundColor: theme.accent, shadowColor: theme.accent }, floor]} />
        </View>

        <Animated.View style={[styles.titleBlock, title]}>
          <Text style={styles.model} numberOfLines={1} adjustsFontSizeToFit>
            {vehicle.model.toUpperCase()}
          </Text>
          <Text style={styles.trim}>
            {vehicle.year} · {vehicle.trim}
          </Text>
        </Animated.View>

        <View style={styles.specRow}>
          {specs.map((s, i) => (
            <Spec key={s.unit} stage={stage} index={i} value={s.value} unit={s.unit} color={theme.accent} />
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Lámina inclinada. Entre las cinco cubren la pantalla; cada una entra y sale
 * un poco después que la anterior, en cascada.
 */
function Slat({
  index,
  cover,
  width,
  height,
  color,
}: {
  index: number;
  cover: SharedValue<number>;
  width: number;
  height: number;
  color: string;
}) {
  const slot = width / SLATS;
  // Sobran márgenes a los lados y arriba/abajo: al inclinarla no deja huecos.
  const w = slot + height * 0.32;
  const left = index * slot - height * 0.16;
  const inFrom = index * 0.09;
  const outFrom = 1 + (SLATS - 1 - index) * 0.07;

  const style = useAnimatedStyle(() => {
    const c = cover.value;
    const x =
      c <= 1
        ? interpolate(c, [inFrom, inFrom + 0.64], [width + w, 0], Extrapolation.CLAMP)
        : interpolate(c, [outFrom, outFrom + 0.72], [0, -(width + w * 2)], Extrapolation.CLAMP);
    return { transform: [{ translateX: x }, { skewX: '-14deg' }] };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.slat,
        { left, width: w, top: -height * 0.25, height: height * 1.5, borderLeftColor: color, shadowColor: color },
        style,
      ]}
    />
  );
}

/** Estela de velocidad que cruza mientras el carro entra y cuando sale. */
function Streak({
  stage,
  y,
  width,
  index,
  color,
}: {
  stage: SharedValue<number>;
  y: number;
  width: number;
  index: number;
  color: string;
}) {
  const len = width * (0.3 + (index % 3) * 0.14);
  const a = 0.05 + index * 0.06;
  const style = useAnimatedStyle(() => {
    const s = stage.value;
    // Primera pasada con la entrada del carro, segunda con la salida.
    const x =
      s <= 1.1
        ? interpolate(s, [a, a + 0.7], [width, -len], Extrapolation.CLAMP)
        : interpolate(s, [1.15 + a * 0.5, 1.9], [width, -len], Extrapolation.CLAMP);
    const o =
      s <= 1.1
        ? interpolate(s, [a, a + 0.12, a + 0.55, a + 0.7], [0, 0.8, 0.8, 0], Extrapolation.CLAMP)
        : interpolate(s, [1.15, 1.3, 1.8, 1.9], [0, 0.8, 0.8, 0], Extrapolation.CLAMP);
    return { opacity: o, transform: [{ translateX: x }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.streak, { top: y, width: len, backgroundColor: color, height: index % 2 ? 1.5 : 2.5 }, style]}
    />
  );
}

/** Cifra clave del carro: sube y aparece, una tras otra. */
function Spec({
  stage,
  index,
  value,
  unit,
  color,
}: {
  stage: SharedValue<number>;
  index: number;
  value: string;
  unit: string;
  color: string;
}) {
  const from = 0.72 + index * 0.08;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(stage.value, [from, from + 0.2, 1.1, 1.4], [0, 1, 1, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(stage.value, [from, from + 0.25], [18, 0], Extrapolation.CLAMP) }],
  }));
  return (
    <Animated.View style={[styles.spec, style]}>
      <Text style={styles.specValue}>{value}</Text>
      <Text style={[styles.specUnit, { color }]}>{unit}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  slat: {
    position: 'absolute',
    backgroundColor: colors.bg,
    borderLeftWidth: 2.5,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: -4, height: 0 },
  },
  glow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0,
    shadowOpacity: 1,
    shadowRadius: 60,
    shadowOffset: { width: 0, height: 0 },
    transform: [{ scaleY: 0.3 }],
  },
  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    height: 2,
    borderRadius: 1,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  kicker: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 5 },
  titleBlock: { alignItems: 'center', paddingHorizontal: 24, maxWidth: '100%' },
  model: { fontFamily: fonts.bold, fontSize: 42, letterSpacing: 2, color: colors.text },
  trim: { fontFamily: fonts.medium, fontSize: 13, letterSpacing: 1.5, color: colors.textMuted, marginTop: 4 },
  specRow: { flexDirection: 'row', gap: 28, marginTop: 18 },
  spec: { alignItems: 'center' },
  specValue: { fontFamily: fonts.semibold, fontSize: 24, color: colors.text },
  specUnit: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 1.5, marginTop: 1 },
  streak: { position: 'absolute', left: 0, borderRadius: 2 },
});
