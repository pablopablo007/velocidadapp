import React, { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, fonts } from '@/theme/theme';
import { GAUGE_START_DEG as START, GAUGE_SWEEP_DEG as SWEEP, arcPath, gaugeDegFor, polar } from '@/utils/gauge';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

type Props = {
  /** Velocidad ya convertida a la unidad que se muestra. */
  value: number;
  max: number;
  unitLabel: string;
  /** Máxima de la sesión (misma unidad). */
  peak?: number;
  /** Límite configurado (misma unidad). */
  limit?: number | null;
  /** Velocidad máxima del carro: desde ahí el aro es rojo (misma unidad). */
  vehicleTop?: number | null;
  size?: number;
  overLimit?: boolean;
  /** Color de la aguja y del tramo recorrido: el del carro. */
  tint?: string;
  /** Lo que va en el centro del aro (la foto del carro). */
  children?: React.ReactNode;
};

/** El barrido de encendido se hace una vez por sesión, no en cada giro del teléfono. */
let ignitionDone = false;

/**
 * Velocímetro de cabina digital, en el estilo de los tableros de Volkswagen:
 * un aro fino, las cifras por fuera con puntos entre ellas, una aguja corta
 * que cruza el aro y el tramo recorrido iluminado detrás de ella. En el
 * centro, la foto del carro; abajo, la velocidad en cifras.
 *
 * Fluidez: la aguja, el tramo iluminado y el brillo de las cifras se mueven
 * en el hilo de interfaz con Reanimated, a los cuadros de la pantalla (120 por
 * segundo en ProMotion). El GPS da una lectura por segundo y la aguja recorre
 * el camino entre una y otra sin saltos. React solo vuelve a dibujar la cifra
 * cuando cambia de número.
 *
 * Al abrir la app la aguja hace un barrido completo, como al dar contacto.
 */
function SpeedometerBase({
  value,
  max,
  unitLabel,
  peak = 0,
  limit = null,
  vehicleTop = null,
  size = 320,
  overLimit = false,
  tint = colors.text,
  children,
}: Props) {
  const g = useMemo(() => geometry(size), [size]);

  // Velocidad animada: recorre el camino hasta la nueva lectura en lo que
  // tarda en llegar la siguiente.
  const speed = useSharedValue(Math.max(0, value));
  useEffect(() => {
    speed.set(withTiming(Math.max(0, Math.min(value, max * 1.02)), { duration: 900, easing: Easing.out(Easing.quad) }));
  }, [value, max, speed]);

  // Barrido de encendido: sube hasta el tope y vuelve.
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (ignitionDone) return;
    ignitionDone = true;
    sweep.set(
      withDelay(
        250,
        withSequence(
          withTiming(max, { duration: 950, easing: Easing.inOut(Easing.cubic) }),
          withDelay(120, withTiming(0, { duration: 800, easing: Easing.inOut(Easing.cubic) }))
        )
      )
    );
  }, [max, sweep]);

  const needle = useDerivedValue(() => Math.min(max, Math.max(speed.value, sweep.value)));

  return (
    <View style={{ width: size, height: size }}>
      <DialFace g={g} max={max} limit={limit} vehicleTop={vehicleTop} />
      <LiveLayer g={g} max={max} needle={needle} tint={overLimit ? colors.danger : tint} peak={peak} />

      {/* Centro: la foto del carro */}
      <View style={[styles.center, { top: g.cy - g.ring * 0.78, height: g.ring * 1.02 }]} pointerEvents="none">
        {children}
      </View>

      {/* Velocidad en cifras, abajo dentro del aro */}
      <View style={[styles.readout, { top: g.cy + g.ring * 0.2 }]} pointerEvents="none">
        <SpeedDigits speed={speed} initial={Math.round(Math.max(0, value))} size={size} overLimit={overLimit} />
        <Text style={[styles.unit, { fontSize: size * 0.04 }]}>{unitLabel}</Text>
      </View>
    </View>
  );
}

type Geometry = ReturnType<typeof geometry>;

function geometry(size: number) {
  const cx = size / 2;
  const cy = size / 2;
  return {
    size,
    cx,
    cy,
    /** Aro fino. */
    ring: size * 0.395,
    /** Cifras de la escala. */
    numbers: size * 0.462,
    /** Puntos entre cifras. */
    dots: size * 0.462,
    arcLen: 2 * Math.PI * size * 0.395 * (SWEEP / 360),
    circumference: 2 * Math.PI * size * 0.395,
  };
}

function scaleSteps(max: number) {
  const major = max <= 220 ? 20 : 40;
  return { major, minor: major / 2 };
}

/** Lo que no se mueve: aro, cifras, puntos, zona roja y límite. Se dibuja una vez. */
const DialFace = memo(function DialFace({
  g,
  max,
  limit,
  vehicleTop,
}: {
  g: Geometry;
  max: number;
  limit: number | null;
  vehicleTop: number | null;
}) {
  const { size, cx, cy } = g;
  const { major, minor } = scaleSteps(max);
  const dots: number[] = [];
  for (let v = minor; v < max; v += major) dots.push(v);

  const redFrom = vehicleTop != null && vehicleTop < max ? vehicleTop : null;
  const limitDot = limit != null && limit > 0 && limit <= max ? polar(cx, cy, g.ring - size * 0.03, gaugeDegFor(limit, max)) : null;

  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      {/* Fondo del centro: oscurece lo que haya detrás (el mapa) */}
      <Circle cx={cx} cy={cy} r={g.ring} fill={colors.bg} fillOpacity={0.86} />
      {/* Aro completo, muy tenue, y el tramo de la escala algo más visible */}
      <Circle cx={cx} cy={cy} r={g.ring} stroke={colors.text} strokeOpacity={0.1} strokeWidth={1} fill="none" />
      <Path d={arcPath(cx, cy, g.ring, START, START + SWEEP)} stroke={colors.text} strokeOpacity={0.22} strokeWidth={1.4} fill="none" />
      {redFrom != null && (
        <Path
          d={arcPath(cx, cy, g.ring, gaugeDegFor(redFrom, max), START + SWEEP)}
          stroke={colors.danger}
          strokeOpacity={0.85}
          strokeWidth={2}
          fill="none"
        />
      )}
      {dots.map((v) => {
        const p = polar(cx, cy, g.dots, gaugeDegFor(v, max));
        return <Circle key={v} cx={p.x} cy={p.y} r={size * 0.0055} fill={colors.textMuted} fillOpacity={0.55} />;
      })}
      {limitDot && <Circle cx={limitDot.x} cy={limitDot.y} r={size * 0.009} fill={colors.danger} />}
    </Svg>
  );
});

/** Lo que se mueve: tramo iluminado, cifras que se encienden y aguja. */
const LiveLayer = memo(function LiveLayer({
  g,
  max,
  needle,
  tint,
  peak,
}: {
  g: Geometry;
  max: number;
  needle: SharedValue<number>;
  tint: string;
  peak: number;
}) {
  const { size, cx, cy } = g;
  const { major } = scaleSteps(max);
  const numbers: number[] = [];
  for (let v = 0; v <= max + 0.001; v += major) numbers.push(v);

  // El tramo recorrido es un trazo discontinuo sobre el aro: su desfase deja
  // ver solo la parte hasta la aguja.
  const trail = useAnimatedProps(() => ({
    strokeDashoffset: g.arcLen * (1 - Math.max(0, Math.min(1, needle.value / max))),
  }));

  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${gaugeDegFor(needle.value, max) - 270}deg` }],
  }));

  const peakDot = peak > 0.5 && peak <= max ? polar(cx, cy, g.ring + size * 0.026, gaugeDegFor(peak, max)) : null;
  const dash = `${g.arcLen} ${g.circumference}`;

  return (
    <>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <G rotation={START} origin={`${cx}, ${cy}`}>
          {/* Resplandor y trazo del tramo recorrido */}
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={g.ring}
            stroke={tint}
            strokeOpacity={0.16}
            strokeWidth={size * 0.03}
            strokeDasharray={dash}
            animatedProps={trail}
            fill="none"
          />
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={g.ring}
            stroke={tint}
            strokeOpacity={0.9}
            strokeWidth={size * 0.007}
            strokeDasharray={dash}
            animatedProps={trail}
            fill="none"
          />
        </G>
        {numbers.map((v) => (
          <ScaleNumber key={v} g={g} max={max} v={v} needle={needle} />
        ))}
        {peakDot && <Circle cx={peakDot.x} cy={peakDot.y} r={size * 0.008} fill={colors.text} fillOpacity={0.85} />}
      </Svg>

      {/* Aguja: corta, cruza el aro. Se dibuja apuntando arriba y se gira entera. */}
      <Animated.View style={[StyleSheet.absoluteFill, needleStyle]} pointerEvents="none">
        <View
          style={[
            styles.needleGlow,
            {
              left: cx - size * 0.016,
              top: cy - g.ring - size * 0.04,
              width: size * 0.032,
              height: size * 0.1,
              backgroundColor: tint,
              shadowColor: tint,
            },
          ]}
        />
        <View
          style={[
            styles.needle,
            {
              left: cx - size * 0.006,
              top: cy - g.ring - size * 0.036,
              width: size * 0.012,
              height: size * 0.092,
              backgroundColor: tint,
            },
          ]}
        />
      </Animated.View>
    </>
  );
});

/** Cifra de la escala: se enciende cuando la aguja la pasa. */
function ScaleNumber({ g, max, v, needle }: { g: Geometry; max: number; v: number; needle: SharedValue<number> }) {
  const p = polar(g.cx, g.cy, g.numbers, gaugeDegFor(v, max));
  const step = scaleSteps(max).major;
  const props = useAnimatedProps(() => {
    // Transición suave en el último medio tramo antes de la cifra.
    const t = Math.max(0, Math.min(1, (needle.value - (v - step * 0.5)) / (step * 0.5)));
    return { fillOpacity: 0.42 + t * 0.58 };
  });
  return (
    <AnimatedSvgText
      x={p.x}
      y={p.y + g.size * 0.015}
      fill={colors.text}
      animatedProps={props}
      fontSize={g.size * 0.044}
      fontFamily={fonts.regular}
      textAnchor="middle"
    >
      {String(Math.round(v))}
    </AnimatedSvgText>
  );
}

/**
 * La cifra grande. Lee la velocidad animada desde el hilo de interfaz y solo
 * avisa a React cuando cambia el número entero: un render por km/h, no uno
 * por cuadro.
 */
function SpeedDigits({
  speed,
  initial,
  size,
  overLimit,
}: {
  speed: SharedValue<number>;
  initial: number;
  size: number;
  overLimit: boolean;
}) {
  const [n, setN] = useState(initial);
  useAnimatedReaction(
    () => Math.round(speed.value),
    (curr, prev) => {
      if (curr !== prev) scheduleOnRN(setN, curr);
    }
  );
  return (
    <Text
      style={[styles.digits, { fontSize: size * 0.165, lineHeight: size * 0.19, color: overLimit ? colors.danger : colors.text }]}
      allowFontScaling={false}
      numberOfLines={1}
    >
      {n}
    </Text>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'flex-end' },
  readout: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  digits: { fontFamily: fonts.light, letterSpacing: -0.5, textAlign: 'center', minWidth: '30%' },
  unit: { fontFamily: fonts.regular, color: colors.textMuted, letterSpacing: 1, marginTop: -2 },
  needle: { position: 'absolute', borderRadius: 999 },
  needleGlow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.35,
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});

export const Speedometer = memo(SpeedometerBase);
