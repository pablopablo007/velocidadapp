import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, fonts } from '@/theme/theme';

/*
 * Ocultar y mostrar el mapa, con el efecto de una pantalla de tubo que se
 * apaga: el mapa se aplasta hasta una línea de luz, la línea se encoge hasta
 * un punto y el punto destella y se apaga. Al mostrarlo, lo mismo al revés.
 *
 * Todo depende de un solo valor `progress` (1 = mapa a la vista, 0 = oculto)
 * que se anima en el hilo de interfaz; el tablero lo usa también para
 * recolocar el velocímetro mientras tanto.
 */

const HIDE_MS = 760;
const SHOW_MS = 860;

/**
 * Valor animado del mapa y si hay que tenerlo montado. Oculto, el mapa se
 * desmonta del todo: MapKit deja de dibujar y no gasta batería.
 */
export function useMapToggle(hidden: boolean, ready: boolean) {
  const progress = useSharedValue(hidden ? 0 : 1);
  // Terminó la animación de ocultar: ya se puede desmontar el mapa.
  const [hideDone, setHideDone] = useState(hidden);
  const [prevHidden, setPrevHidden] = useState(hidden);
  if (prevHidden !== hidden) {
    setPrevHidden(hidden);
    setHideDone(false);
  }
  const first = useRef(true);

  useEffect(() => {
    if (!ready) return;
    const instant = first.current;
    first.current = false;
    if (hidden) {
      // Al abrir la app se respeta la elección guardada, sin animación.
      progress.set(
        withTiming(0, { duration: instant ? 0 : HIDE_MS, easing: Easing.bezier(0.55, 0, 0.35, 1) }, (done) => {
          if (done) scheduleOnRN(setHideDone, true);
        })
      );
    } else {
      progress.set(withTiming(1, { duration: instant ? 0 : SHOW_MS, easing: Easing.bezier(0.3, 0, 0.2, 1) }));
    }
  }, [hidden, ready, progress]);

  return { progress, mounted: !hidden || !hideDone };
}

/**
 * Envuelve el mapa con el efecto. `originY` es la altura (en fracción) del
 * centro de la parte visible del mapa: ahí se forma la línea de luz.
 */
export function MapReveal({
  progress,
  mounted,
  originY = 0.5,
  tint,
  style,
  children,
}: {
  progress: SharedValue<number>;
  mounted: boolean;
  originY?: number;
  tint: string;
  style: object;
  children: React.ReactNode;
}) {
  // El mapa: se aplasta en vertical (1 → 0,5) y luego se estrecha (0,5 → 0,15).
  const body = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0.12, 0.2], [0, 1], Extrapolation.CLAMP),
      transform: [
        { scaleX: interpolate(p, [0.15, 0.5], [0.002, 1], Extrapolation.CLAMP) },
        { scaleY: interpolate(p, [0.5, 1], [0.008, 1], Extrapolation.CLAMP) },
      ],
    };
  });

  // Destello: el mapa se vuelve luz mientras se aplasta.
  const flash = useAnimatedStyle(() => ({
    // Solo cuando ya es una franja fina: así se ve como una línea de luz, no como un recuadro blanco.
    opacity: interpolate(progress.value, [0.3, 0.55, 0.72, 0.9], [1, 1, 0.12, 0], Extrapolation.CLAMP),
  }));

  // Punto final: aparece cuando la línea termina de encogerse y se apaga.
  const dot = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.05, 0.14, 0.22], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(p, [0, 0.07, 0.2], [0.2, 1.4, 0.6], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={style} pointerEvents="box-none">
      {mounted && (
        <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: `50% ${originY * 100}%` }, body]}>
          {children}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, flash]}>
            {/* Brillante en la línea donde se cierra y suave hacia los bordes */}
            <LinearGradient
              colors={['rgba(245,245,247,0)', '#FFFFFF', 'rgba(245,245,247,0)']}
              locations={[0, Math.min(0.95, Math.max(0.05, originY)), 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.12 }]} />
          </Animated.View>
        </Animated.View>
      )}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.dot,
          { top: `${originY * 100}%`, backgroundColor: '#FFFFFF', shadowColor: tint },
          dot,
        ]}
      />
    </View>
  );
}

/** Botón "Ocultar mapa / Mostrar mapa". */
export function MapToggleButton({
  hidden,
  haptics,
  onToggle,
  style,
}: {
  hidden: boolean;
  haptics: boolean;
  onToggle: () => void;
  style?: object;
}) {
  return (
    <Pressable
      onPress={() => {
        if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onToggle();
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={hidden ? 'Mostrar mapa' : 'Ocultar mapa'}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }, style]}
    >
      <Ionicons name={hidden ? 'map-outline' : 'eye-off-outline'} size={14} color={colors.text} />
      <Text style={styles.buttonText}>{hidden ? 'Mostrar mapa' : 'Ocultar mapa'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    left: '50%',
    width: 10,
    height: 10,
    marginLeft: -5,
    marginTop: -5,
    borderRadius: 5,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  button: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: 'rgba(10,10,11,0.72)',
  },
  buttonText: { fontSize: 12, fontFamily: fonts.medium, color: colors.text, letterSpacing: 0.2 },
});
