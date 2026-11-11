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
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { liveLatG, liveLongG, liveSpeedMs } from '@/state/liveMotion';
import { useAccent } from '@/theme/accent';
import { colors, fonts } from '@/theme/theme';
import type { BodyType } from '@/vehicles/polo';

const AnimatedLine = Animated.createAnimatedComponent(Line);

/**
 * Mini carro en vivo: el carro visto desde atrás, moviéndose como el de verdad.
 *
 * - Se inclina en las curvas con la fuerza lateral medida (giroscopio × velocidad).
 * - Se agacha de atrás al acelerar y levanta la cola al frenar, con la
 *   aceleración del acelerómetro calibrado contra el GPS.
 * - Las luces de freno se encienden cuando de verdad estás frenando.
 * - Las líneas del carril corren a la velocidad real del GPS.
 *
 * Nada de esto pasa por React: las lecturas llegan en valores compartidos y el
 * movimiento se calcula en el hilo de interfaz, a los cuadros de la pantalla
 * (120 por segundo en el iPhone 15 Pro). Las ruedas no se inclinan: quedan en
 * el piso y la carrocería se mueve sobre ellas, como una suspensión.
 */

const SPRING = { damping: 16, stiffness: 150, mass: 0.7 };
const DASHES = 4;

type Props = {
  size?: number;
  bodyType: BodyType;
  /** Fuerza lateral para la cifra (se refresca unas 8 veces por segundo). */
  lateralG: number;
  active?: boolean;
};

function LiveCarBase({ size = 110, bodyType, lateralG, active = true }: Props) {
  const accent = useAccent();

  // Los sensores entregan 60 lecturas por segundo; el resorte las interpola
  // hasta la frecuencia de la pantalla y le da inercia de carrocería.
  const lat = useDerivedValue(() => withSpring(liveLatG.value, SPRING));
  const long = useDerivedValue(() => withSpring(liveLongG.value, SPRING));

  // Avance de las líneas del carril, integrado cuadro a cuadro con la velocidad real.
  const road = useSharedValue(0);
  useFrameCallback((frame) => {
    const dt = Math.min(64, frame.timeSincePreviousFrame ?? 16) / 1000;
    // 6 m entre rayas: a 60 km/h pasan casi tres por segundo.
    road.value = (road.value + (liveSpeedMs.value * dt) / 6) % 1;
  });

  const body = useAnimatedStyle(() => ({
    transform: [
      // En una curva a la derecha la carrocería se recuesta hacia la izquierda.
      { translateX: interpolate(lat.value, [-0.8, 0.8], [size * 0.045, -size * 0.045], Extrapolation.CLAMP) },
      // Acelerar hunde la cola (baja); frenar la levanta.
      { translateY: interpolate(long.value, [-0.8, 0, 0.45], [-size * 0.05, 0, size * 0.04], Extrapolation.CLAMP) },
      { rotateZ: `${interpolate(lat.value, [-0.8, 0.8], [11, -11], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(long.value, [-0.8, 0, 0.45], [0.965, 1, 1.03], Extrapolation.CLAMP) },
    ],
  }));

  const brake = useAnimatedStyle(() => ({
    opacity: interpolate(long.value, [-0.3, -0.05], [1, 0], Extrapolation.CLAMP),
  }));

  // Halo bajo el carro: más intenso cuanto más fuerza total hay.
  const halo = useAnimatedStyle(() => {
    const total = Math.min(1, Math.hypot(lat.value, long.value) / 0.6);
    return { opacity: 0.25 + total * 0.6, transform: [{ scaleX: 1 + total * 0.25 }] };
  });

  const pickup = bodyType === 'pickup';

  return (
    <View style={{ width: size, height: size }}>
      {/* Piso: bisel, horizonte y carril en perspectiva */}
      <Svg width={size} height={size} viewBox="0 0 120 120" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="lcSky" cx="50%" cy="38%" rx="55%" ry="55%">
            <Stop offset="0" stopColor={accent.accent} stopOpacity="0.16" />
            <Stop offset="1" stopColor={accent.accent} stopOpacity="0" />
          </RadialGradient>
          <ClipPath id="lcClip">
            <Circle cx="60" cy="60" r="55.5" />
          </ClipPath>
        </Defs>
        <Circle cx="60" cy="60" r="57" fill={colors.surface} stroke={colors.borderStrong} strokeWidth="1" />
        <Circle cx="60" cy="60" r="56" fill="url(#lcSky)" />
        {/* Bordes del carril: guía tenue bajo las rayas que corren */}
        {/* Todo el carril se recorta al círculo del reloj */}
        <G clipPath="url(#lcClip)">
          <Line x1="44" y1="44" x2="-2" y2="104" stroke={colors.track} strokeWidth="1" />
          <Line x1="76" y1="44" x2="122" y2="104" stroke={colors.track} strokeWidth="1" />
          {Array.from({ length: DASHES }, (_, i) => (
            <LaneDash key={`l${i}`} road={road} index={i} side={-1} color={accent.accent} />
          ))}
          {Array.from({ length: DASHES }, (_, i) => (
            <LaneDash key={`r${i}`} road={road} index={i} side={1} color={accent.accent} />
          ))}
        </G>
      </Svg>

      {/* Halo en el piso */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            width: size * 0.56,
            height: size * 0.1,
            left: size * 0.22,
            top: size * 0.69,
            backgroundColor: accent.glow,
            shadowColor: accent.accent,
          },
          halo,
        ]}
      />

      {/* Ruedas: se quedan en el piso */}
      <Svg width={size} height={size} viewBox="0 0 120 120" style={StyleSheet.absoluteFill}>
        <Ellipse cx="60" cy="88" rx="32" ry="4" fill="#000" opacity="0.6" />
        <Rect x="30" y="68" width="11" height="20" rx="3.5" fill="#0B0C0E" stroke="#26292E" strokeWidth="0.8" />
        <Rect x="79" y="68" width="11" height="20" rx="3.5" fill="#0B0C0E" stroke="#26292E" strokeWidth="0.8" />
      </Svg>

      {/* Carrocería: se mueve sobre las ruedas */}
      <Animated.View style={[StyleSheet.absoluteFill, body]}>
        <Svg width={size} height={size} viewBox="0 0 120 120">
          {pickup ? <PickupRear /> : <HatchRear />}
        </Svg>
        {/* Luces de freno: resplandor que aparece al frenar de verdad */}
        <Animated.View style={[StyleSheet.absoluteFill, brake]} pointerEvents="none">
          <Svg width={size} height={size} viewBox="0 0 120 120">
            <Defs>
              <RadialGradient id="lcBrake" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor="#FF2D46" stopOpacity="0.95" />
                <Stop offset="0.45" stopColor="#FF2D46" stopOpacity="0.45" />
                <Stop offset="1" stopColor="#FF2D46" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            {pickup ? (
              <>
                <Ellipse cx="33.5" cy="63" rx="11" ry="14" fill="url(#lcBrake)" />
                <Ellipse cx="86.5" cy="63" rx="11" ry="14" fill="url(#lcBrake)" />
                <Rect x="31.5" y="56" width="4" height="14" rx="1.5" fill="#FFD0D5" />
                <Rect x="84.5" y="56" width="4" height="14" rx="1.5" fill="#FFD0D5" />
              </>
            ) : (
              <>
                <Ellipse cx="38" cy="60" rx="14" ry="10" fill="url(#lcBrake)" />
                <Ellipse cx="82" cy="60" rx="14" ry="10" fill="url(#lcBrake)" />
                <Rect x="32" y="58.5" width="12" height="3" rx="1.5" fill="#FFD0D5" />
                <Rect x="76" y="58.5" width="12" height="3" rx="1.5" fill="#FFD0D5" />
                <Rect x="52" y="37.6" width="16" height="1.8" rx="0.9" fill="#FF6070" />
              </>
            )}
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* Cifra: fuerza lateral medida */}
      <View style={styles.readout} pointerEvents="none">
        <Text style={styles.label}>curva</Text>
        <Text style={[styles.value, { fontSize: size * 0.13 }]}>
          {active ? `${lateralG < -0.03 ? '‹ ' : ''}${Math.abs(lateralG).toFixed(2)}${lateralG > 0.03 ? ' ›' : ''}` : '—'}
          <Text style={styles.unit}> g</Text>
        </Text>
      </View>
    </View>
  );
}

/**
 * Raya del carril en perspectiva. Nace en el horizonte y crece al acercarse;
 * su posición sale del avance acumulado con la velocidad real.
 */
function LaneDash({
  road,
  index,
  side,
  color,
}: {
  road: { value: number };
  index: number;
  side: 1 | -1;
  color: string;
}) {
  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const u = (road.value + index) / DASHES; // 0 = horizonte, 1 = junto al carro
    const a = u * u;
    const b = Math.min(1, u + 0.11) ** 2;
    // Sobre el borde del carril, en perspectiva: quedan a los lados del carro.
    const x = (k: number) => 60 + side * (16 + 46 * k);
    const y = (k: number) => 44 + 60 * k;
    return {
      x1: x(a),
      y1: y(a),
      x2: x(b),
      y2: y(b),
      strokeWidth: 0.6 + 1.6 * u,
      strokeOpacity: Math.min(1, u * 2.2) * 0.75,
    };
  });
  return <AnimatedLine animatedProps={animatedProps} stroke={color} strokeLinecap="round" />;
}

/** Polo visto desde atrás: hatchback oscuro. */
function HatchRear() {
  return (
    <>
      <Defs>
        <LinearGradient id="hrBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#4A5058" />
          <Stop offset="0.5" stopColor="#23272C" />
          <Stop offset="1" stopColor="#0E1013" />
        </LinearGradient>
        <LinearGradient id="hrGlass" x1="0" y1="0" x2="0.3" y2="1">
          <Stop offset="0" stopColor="#7E93A8" />
          <Stop offset="1" stopColor="#1A222B" />
        </LinearGradient>
      </Defs>
      {/* Techo y cabina */}
      <Path
        d="M 40 54 L 45 38 Q 47 33 53 33 L 67 33 Q 73 33 75 38 L 80 54 Z"
        fill="url(#hrBody)"
        stroke="#5A616A"
        strokeWidth="0.8"
      />
      <Path d="M 44.5 52 L 48 39.5 Q 49 37 52 37 L 68 37 Q 71 37 72 39.5 L 75.5 52 Z" fill="url(#hrGlass)" />
      <Path d="M 50 39 L 46.5 51" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="2.2" />
      {/* Cuerpo */}
      <Path
        d="M 30 58 Q 30 52 37 52 L 83 52 Q 90 52 90 58 L 91 76 Q 91 81 86 81 L 34 81 Q 29 81 29 76 Z"
        fill="url(#hrBody)"
        stroke="#5A616A"
        strokeWidth="0.8"
      />
      {/* Luces traseras (apagadas) */}
      <Rect x="31" y="56.5" width="15" height="7" rx="2.5" fill="#7A1420" />
      <Rect x="74" y="56.5" width="15" height="7" rx="2.5" fill="#7A1420" />
      {/* Franja y placa */}
      <Rect x="46" y="59" width="28" height="1.6" rx="0.8" fill="#3A4047" />
      <Rect x="51" y="65" width="18" height="7" rx="1.2" fill="#E9EDF1" />
      <Circle cx="60" cy="55.6" r="2.1" fill="none" stroke="#AEB6BF" strokeWidth="0.8" />
      {/* Parachoques */}
      <Path d="M 30 75 L 90 75 L 90.5 78 Q 90.5 81 86 81 L 34 81 Q 29.5 81 29.5 78 Z" fill="#0A0B0D" />
      <Rect x="36" y="77.2" width="6" height="1.6" rx="0.8" fill="#4A1016" />
      <Rect x="78" y="77.2" width="6" height="1.6" rx="0.8" fill="#4A1016" />
    </>
  );
}

/** Gol Pick Up vista desde atrás: cabina simple y portón del balde, blanca. */
function PickupRear() {
  return (
    <>
      <Defs>
        <LinearGradient id="prBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.55" stopColor="#DDE2E8" />
          <Stop offset="1" stopColor="#96A0AC" />
        </LinearGradient>
        <LinearGradient id="prGlass" x1="0" y1="0" x2="0.3" y2="1">
          <Stop offset="0" stopColor="#6E8296" />
          <Stop offset="1" stopColor="#161D25" />
        </LinearGradient>
      </Defs>
      {/* Cabina simple */}
      <Path
        d="M 41 50 L 44 37 Q 45.5 32.5 51 32.5 L 69 32.5 Q 74.5 32.5 76 37 L 79 50 Z"
        fill="url(#prBody)"
        stroke="#8A94A0"
        strokeWidth="0.8"
      />
      <Path d="M 45.5 48.5 L 47.6 39 Q 48.5 36.5 51.5 36.5 L 68.5 36.5 Q 71.5 36.5 72.4 39 L 74.5 48.5 Z" fill="url(#prGlass)" />
      <Path d="M 51 38.5 L 48.5 47.5" stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="2.2" />
      {/* Balde y portón */}
      <Path
        d="M 29 53 Q 29 49.5 33 49.5 L 87 49.5 Q 91 49.5 91 53 L 91 76 Q 91 80 87 80 L 33 80 Q 29 80 29 76 Z"
        fill="url(#prBody)"
        stroke="#8A94A0"
        strokeWidth="0.8"
      />
      <Rect x="29.6" y="49.8" width="60.8" height="2.6" rx="1.2" fill="#2A2F35" />
      <Rect x="38.5" y="55" width="43" height="17.5" rx="1.5" fill="none" stroke="#9BA5B0" strokeWidth="0.9" />
      <Rect x="55" y="57.5" width="10" height="2.4" rx="1.2" fill="#2A2F35" />
      <Rect x="52" y="63.5" width="16" height="6.5" rx="1.1" fill="#F4F6F8" stroke="#A9B2BC" strokeWidth="0.5" />
      {/* Luces traseras verticales (apagadas) */}
      <Rect x="30.5" y="54.5" width="6" height="17" rx="1.8" fill="#8E1524" />
      <Rect x="83.5" y="54.5" width="6" height="17" rx="1.8" fill="#8E1524" />
      {/* Parachoques negro */}
      <Path d="M 29 73.5 L 91 73.5 L 91 76.5 Q 91 80.5 87 80.5 L 33 80.5 Q 29 80.5 29 76.5 Z" fill="#101215" />
    </>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
    borderRadius: 999,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  readout: { position: 'absolute', left: 0, right: 0, bottom: '7%', alignItems: 'center' },
  label: { fontSize: 8, color: colors.textMuted, fontWeight: '500', letterSpacing: 0.3 },
  value: { fontFamily: fonts.medium, color: colors.text, marginTop: -1 },
  unit: { fontSize: 9, fontFamily: fonts.regular, color: colors.textMuted },
});

export const LiveCar = memo(LiveCarBase);
