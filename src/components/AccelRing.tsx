import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line } from 'react-native-svg';

import { liveLongG } from '@/state/liveMotion';
import { useAccent } from '@/theme/accent';
import { colors, fonts } from '@/theme/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Anillo de aceleración.
 *
 * Desde arriba, el aro se llena hacia la derecha con el color del carro al
 * acelerar y hacia la izquierda, en rojo, al frenar. Detrás de cada arco va un
 * resplandor, y un punto marca el máximo reciente de cada lado y vuelve
 * despacio, para que se alcance a ver qué tan fuerte fue.
 *
 * La lectura es la aceleración longitudinal real: el acelerómetro del iPhone
 * proyectado sobre la dirección de avance (que se calibra sola contra el GPS).
 * El movimiento corre en el hilo de interfaz, a los cuadros de la pantalla.
 *
 * Escalas: el aro de acelerar se llena a 0,45 g y el de frenar a 0,90 g. Un
 * carro de calle frena bastante más fuerte de lo que acelera, y con una sola
 * escala la aceleración casi no se vería.
 */

export const ACCEL_FULL_G = 0.45;
export const BRAKE_FULL_G = 0.9;

const SPRING = { damping: 18, stiffness: 190, mass: 0.6 };
/** Lo que tarda el punto de máximo en volver, en fracción de aro por segundo. */
const PEAK_FALL_PER_S = 0.22;
const PEAK_HOLD_S = 1.2;

type Props = {
  size?: number;
  /** Aceleración para la cifra (se refresca unas 8 veces por segundo). */
  longG: number;
  /** `true` si ya manda el acelerómetro; si no, la lectura es la del GPS. */
  calibrated: boolean;
  /** Solo el aro, sin cifra ni marcas: para llevarlo pequeño junto a un texto. */
  compact?: boolean;
};

function AccelRingBase({ size = 110, longG, calibrated, compact = false }: Props) {
  const accent = useAccent();
  const c = size / 2;
  const stroke = compact ? Math.max(3.5, size * 0.11) : Math.max(5, size * 0.065);
  const r = size / 2 - stroke / 2 - (compact ? stroke * 0.6 : size * 0.07);
  const circumference = 2 * Math.PI * r;
  const half = circumference / 2;

  const g = useDerivedValue(() => withSpring(liveLongG.value, SPRING));
  const accelFrac = useDerivedValue(() => Math.max(0, Math.min(1, g.value / ACCEL_FULL_G)));
  const brakeFrac = useDerivedValue(() => Math.max(0, Math.min(1, -g.value / BRAKE_FULL_G)));

  // Máximos recientes: suben al instante, aguantan un momento y bajan despacio.
  const accelPeak = useSharedValue(0);
  const brakePeak = useSharedValue(0);
  const accelHold = useSharedValue(0);
  const brakeHold = useSharedValue(0);
  useFrameCallback((frame) => {
    const dt = Math.min(64, frame.timeSincePreviousFrame ?? 16) / 1000;
    if (accelFrac.value >= accelPeak.value) {
      accelPeak.value = accelFrac.value;
      accelHold.value = PEAK_HOLD_S;
    } else if (accelHold.value > 0) {
      accelHold.value -= dt;
    } else {
      accelPeak.value = Math.max(accelFrac.value, accelPeak.value - PEAK_FALL_PER_S * dt);
    }
    if (brakeFrac.value >= brakePeak.value) {
      brakePeak.value = brakeFrac.value;
      brakeHold.value = PEAK_HOLD_S;
    } else if (brakeHold.value > 0) {
      brakeHold.value -= dt;
    } else {
      brakePeak.value = Math.max(brakeFrac.value, brakePeak.value - PEAK_FALL_PER_S * dt);
    }
  });

  // Cada arco es media circunferencia; el desfase del trazo descubre la parte llena.
  const accelArc = useAnimatedProps(() => ({ strokeDashoffset: half * (1 - accelFrac.value) }));
  const brakeArc = useAnimatedProps(() => ({ strokeDashoffset: half * (1 - brakeFrac.value) }));
  const accelGlow = useAnimatedProps(() => ({
    strokeDashoffset: half * (1 - accelFrac.value),
    strokeOpacity: 0.12 + accelFrac.value * 0.3,
  }));
  const brakeGlow = useAnimatedProps(() => ({
    strokeDashoffset: half * (1 - brakeFrac.value),
    strokeOpacity: 0.12 + brakeFrac.value * 0.3,
  }));

  const accelDot = useAnimatedStyle(() => ({
    opacity: interpolate(accelPeak.value, [0.03, 0.1], [0, 1], Extrapolation.CLAMP),
    transform: [{ rotateZ: `${accelPeak.value * 180}deg` }],
  }));
  const brakeDot = useAnimatedStyle(() => ({
    opacity: interpolate(brakePeak.value, [0.03, 0.1], [0, 1], Extrapolation.CLAMP),
    transform: [{ rotateZ: `${-brakePeak.value * 180}deg` }],
  }));

  // Núcleo: late con la fuerza, del color de lo que estés haciendo.
  const coreAccel = useAnimatedStyle(() => ({
    opacity: accelFrac.value * 0.55,
    transform: [{ scale: 0.72 + accelFrac.value * 0.3 }],
  }));
  const coreBrake = useAnimatedStyle(() => ({
    opacity: brakeFrac.value * 0.6,
    transform: [{ scale: 0.72 + brakeFrac.value * 0.3 }],
  }));

  const state = longG > 0.03 ? 'acelera' : longG < -0.03 ? 'frena' : 'estable';
  const tint = state === 'acelera' ? accent.accent : state === 'frena' ? colors.danger : colors.textMuted;
  const coreSize = (r - stroke) * 2;

  const dash = `${half} ${circumference}`;
  const dotSize = stroke * 0.62;

  return (
    <View style={{ width: size, height: size }}>
      {/* Núcleo luminoso */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.core,
          { width: coreSize, height: coreSize, left: c - coreSize / 2, top: c - coreSize / 2, backgroundColor: accent.accentDim, shadowColor: accent.accent },
          coreAccel,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.core,
          { width: coreSize, height: coreSize, left: c - coreSize / 2, top: c - coreSize / 2, backgroundColor: colors.dangerDim, shadowColor: colors.danger },
          coreBrake,
        ]}
      />

      <Svg width={size} height={size}>
        {/* Pista y marcas */}
        <Circle cx={c} cy={c} r={r} stroke={colors.surfaceStrong} strokeWidth={stroke} fill="none" />
        <Circle cx={c} cy={c} r={r + stroke / 2 + 1} stroke={colors.border} strokeWidth={1} fill="none" />
        {(compact ? [] : [0, 45, 90, 135, 180, 225, 270, 315]).map((deg) => {
          const a = ((deg - 90) * Math.PI) / 180;
          const r1 = r + stroke / 2 + 3;
          const r2 = r1 + (deg % 90 === 0 ? 4 : 2.5);
          return (
            <Line
              key={deg}
              x1={c + Math.cos(a) * r1}
              y1={c + Math.sin(a) * r1}
              x2={c + Math.cos(a) * r2}
              y2={c + Math.sin(a) * r2}
              stroke={deg === 0 ? colors.text : colors.textFaint}
              strokeWidth={deg === 0 ? 1.6 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Acelerar: desde arriba, en sentido horario */}
        <G rotation={-90} origin={`${c}, ${c}`}>
          <AnimatedCircle
            cx={c}
            cy={c}
            r={r}
            stroke={accent.accent}
            strokeWidth={stroke * 2.1}
            strokeDasharray={dash}
            animatedProps={accelGlow}
            fill="none"
          />
          <AnimatedCircle
            cx={c}
            cy={c}
            r={r}
            stroke={accent.accent}
            strokeWidth={stroke}
            strokeDasharray={dash}
            strokeLinecap="butt"
            animatedProps={accelArc}
            fill="none"
          />
        </G>

      </Svg>

      {/* Frenar: desde arriba, en sentido antihorario */}
      <View style={[StyleSheet.absoluteFill, styles.mirror]} pointerEvents="none">
        <Svg width={size} height={size}>
          {/* Mismo arco horario, pero la vista entera va en espejo */}
          <G rotation={-90} origin={`${c}, ${c}`}>
            <AnimatedCircle
              cx={c}
              cy={c}
              r={r}
              stroke={colors.danger}
              strokeWidth={stroke * 2.1}
              strokeDasharray={dash}
              animatedProps={brakeGlow}
              fill="none"
            />
            <AnimatedCircle
              cx={c}
              cy={c}
              r={r}
              stroke={colors.danger}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeLinecap="butt"
              animatedProps={brakeArc}
              fill="none"
            />
          </G>
        </Svg>
      </View>

      {/* Puntos de máximo reciente: giran alrededor del centro */}
      <Animated.View style={[StyleSheet.absoluteFill, accelDot]} pointerEvents="none">
        <View
          style={[styles.dot, { width: dotSize, height: dotSize, left: c - dotSize / 2, top: c - r - dotSize / 2, backgroundColor: colors.text }]}
        />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, brakeDot]} pointerEvents="none">
        <View
          style={[styles.dot, { width: dotSize, height: dotSize, left: c - dotSize / 2, top: c - r - dotSize / 2, backgroundColor: colors.text }]}
        />
      </Animated.View>

      {/* Cifra */}
      {!compact && (
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text style={[styles.state, { color: tint }]}>{state}</Text>
        <Text style={[styles.value, { fontSize: size * 0.2 }]} numberOfLines={1}>
          {Math.abs(longG).toFixed(2)}
        </Text>
        <Text style={styles.unit}>{calibrated ? 'g' : 'g · gps'}</Text>
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  mirror: { transform: [{ scaleX: -1 }] },
  core: {
    position: 'absolute',
    borderRadius: 999,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  dot: { position: 'absolute', borderRadius: 999 },
  state: { fontSize: 8, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  value: { fontFamily: fonts.medium, color: colors.text, marginTop: -1 },
  unit: { fontSize: 9, color: colors.textMuted, fontFamily: fonts.regular, marginTop: -2 },
});

export const AccelRing = memo(AccelRingBase);
