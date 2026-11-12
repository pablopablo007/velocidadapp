import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';

import { useSmoothValue } from '@/hooks/useSmoothValue';
import { colors, fonts } from '@/theme/theme';
import {
  GAUGE_START_DEG as START_DEG,
  GAUGE_SWEEP_DEG as SWEEP_DEG,
  arcPath,
  gaugeDegFor,
  polar,
} from '@/utils/gauge';

type Props = {
  /** Velocidad ya convertida a la unidad que se muestra. */
  value: number;
  max: number;
  unitLabel: string;
  /** Marca de velocidad máxima alcanzada (misma unidad). */
  peak?: number;
  /** Marca del límite configurado (misma unidad). */
  limit?: number | null;
  /** Velocidad máxima del vehículo: tramo final en rojo (misma unidad). */
  vehicleTop?: number | null;
  size?: number;
  overLimit?: boolean;
  /** Texto pequeño sobre la cifra. Por defecto, "velocidad". */
  caption?: string;
  /** Color con el que se enciende el dial: el del carro, o azul en horizontal. */
  tint?: string;
  /** Desplaza la lectura central, en fracción del tamaño (negativo = arriba). */
  centerShift?: number;
};

type Geometry = {
  size: number;
  cx: number;
  cy: number;
  rRim: number;
  tickOuter: number;
  majorLen: number;
  minorLen: number;
  rNumbers: number;
};

function geometryFor(size: number): Geometry {
  const rRim = size / 2 - size * 0.045; // deja sitio al resplandor por fuera
  const tickOuter = rRim - size * 0.02;
  const majorLen = size * 0.05;
  return {
    size,
    cx: size / 2,
    cy: size / 2,
    rRim,
    tickOuter,
    majorLen,
    minorLen: size * 0.022,
    rNumbers: tickOuter - majorLen - size * 0.052,
  };
}

/**
 * Velocímetro de tablero digital.
 *
 * Un aro con las marcas y las cifras por dentro. El aro lleva una luz propia
 * del color del carro y, encima, el tramo recorrido se enciende con
 * resplandor hasta la velocidad actual. Sin aguja: la cifra central es la
 * lectura y el aro, el contexto.
 *
 * Va en dos capas: la fija (aro, marcas, cifras, zona roja) se dibuja una vez
 * y la viva (tramo encendido) es lo único que cambia cuadro a cuadro.
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
  caption = 'velocidad',
  tint = colors.text,
  centerShift = 0,
}: Props) {
  // La cifra muestra la velocidad real aunque supere la escala; solo el aro
  // se detiene en el tope del dial.
  const shown = useSmoothValue(Math.max(0, value), 240, 0.05);
  const smooth = Math.min(shown, max);

  const g = useMemo(() => geometryFor(size), [size]);
  const majorStep = max <= 260 ? 20 : 40;
  const minorStep = majorStep / 4;
  const lit = overLimit ? colors.danger : tint;
  const moving = smooth > 0.5;

  // Marcas encendidas: un solo trazo con todas las que ya pasó la velocidad.
  // Solo se recalcula cuando la velocidad cruza una marca nueva.
  const litCount = moving ? Math.floor((smooth + 0.01) / minorStep) : -1;
  const litTicks = useMemo(() => {
    let d = '';
    for (let i = 0; i <= litCount; i++) {
      const v = i * minorStep;
      const major = Math.abs(v % majorStep) < 0.001;
      const deg = gaugeDegFor(v, max);
      const a = polar(g.cx, g.cy, g.tickOuter, deg);
      const b = polar(g.cx, g.cy, g.tickOuter - (major ? g.majorLen : g.minorLen), deg);
      d += `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)} `;
    }
    return d;
  }, [litCount, minorStep, majorStep, max, g]);

  const progress = moving ? arcPath(g.cx, g.cy, g.rRim, START_DEG, gaugeDegFor(smooth, max)) : null;
  const peakMark =
    peak > 0.5 && peak <= max ? polar(g.cx, g.cy, g.rRim + size * 0.026, gaugeDegFor(peak, max)) : null;

  return (
    <View style={{ width: size, height: size }}>
      <DialFace g={g} max={max} tint={tint} limit={limit} vehicleTop={vehicleTop} />

      {/* Capa viva: tramo encendido hasta la velocidad actual */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {progress && (
          <>
            <Path d={progress} stroke={lit} strokeOpacity={0.1} strokeWidth={size * 0.075} strokeLinecap="round" fill="none" />
            <Path d={progress} stroke={lit} strokeOpacity={0.22} strokeWidth={size * 0.038} strokeLinecap="round" fill="none" />
            <Path d={progress} stroke={lit} strokeWidth={size * 0.014} strokeLinecap="round" fill="none" />
          </>
        )}
        {litTicks !== '' && <Path d={litTicks} stroke={lit} strokeWidth={2.2} strokeLinecap="round" fill="none" />}
        {/* Máxima de la sesión: punto sobre el borde exterior */}
        {peakMark && <Circle cx={peakMark.x} cy={peakMark.y} r={size * 0.01} fill={colors.text} />}
      </Svg>

      {/* Lectura central */}
      <View
        style={[StyleSheet.absoluteFill, styles.center, { transform: [{ translateY: size * centerShift }] }]}
        pointerEvents="none"
      >
        <Text
          style={[
            styles.caption,
            { fontSize: size * 0.045, color: overLimit ? colors.danger : colors.textMuted },
          ]}
        >
          {caption}
        </Text>
        <Text
          style={[
            styles.value,
            {
              fontSize: size * 0.3,
              lineHeight: size * 0.33,
              color: overLimit ? colors.danger : colors.text,
              textShadowColor: overLimit ? colors.danger : lit,
              textShadowRadius: moving ? size * 0.05 : 0,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          allowFontScaling={false}
        >
          {Math.round(shown)}
        </Text>
        <Text style={[styles.unit, { fontSize: size * 0.052 }]}>{unitLabel}</Text>
      </View>
    </View>
  );
}

/**
 * Capa fija del dial. Memorizada: no se vuelve a dibujar mientras la
 * velocidad cambia, solo si cambia el tamaño, la escala o el color.
 */
const DialFace = memo(function DialFace({
  g,
  max,
  tint,
  limit,
  vehicleTop,
}: {
  g: Geometry;
  max: number;
  tint: string;
  limit: number | null;
  vehicleTop: number | null;
}) {
  const { size, cx, cy, rRim } = g;
  const majorStep = max <= 260 ? 20 : 40;
  const minorStep = majorStep / 4;

  const ticks: { v: number; major: boolean }[] = [];
  for (let v = 0; v <= max + 0.001; v += minorStep) {
    ticks.push({ v, major: Math.abs(v % majorStep) < 0.001 });
  }

  const sweep = arcPath(cx, cy, rRim, START_DEG, START_DEG + SWEEP_DEG);
  const redFrom = vehicleTop != null && vehicleTop < max ? vehicleTop : null;
  const redArc = redFrom != null ? arcPath(cx, cy, rRim, gaugeDegFor(redFrom, max), START_DEG + SWEEP_DEG) : null;
  const limitMark =
    limit != null && limit > 0 && limit <= max
      ? {
          a: polar(cx, cy, rRim + size * 0.02, gaugeDegFor(limit, max)),
          b: polar(cx, cy, g.tickOuter - g.majorLen - size * 0.01, gaugeDegFor(limit, max)),
        }
      : null;

  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs>
        {/* Fondo del dial: un poco más claro al centro, da profundidad */}
        <RadialGradient id="dialFace" cx={cx} cy={cy} r={rRim} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#17171B" stopOpacity="0.95" />
          <Stop offset="0.7" stopColor="#0C0C0E" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#050506" stopOpacity="0.85" />
        </RadialGradient>
        {/* Luz del aro: fuerte donde arranca la escala y se apaga hacia arriba */}
        <LinearGradient id="dialRim" x1={0} y1={size} x2={size} y2={size * 0.2} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={tint} stopOpacity="1" />
          <Stop offset="0.5" stopColor={tint} stopOpacity="0.12" />
          <Stop offset="1" stopColor={tint} stopOpacity="0.32" />
        </LinearGradient>
      </Defs>

      <Circle cx={cx} cy={cy} r={rRim - size * 0.008} fill="url(#dialFace)" />

      {/* Aro: base oscura y luz propia con resplandor */}
      <Path d={sweep} stroke={colors.surfaceStrong} strokeWidth={size * 0.014} strokeLinecap="round" fill="none" />
      <Path d={sweep} stroke="url(#dialRim)" strokeOpacity={0.12} strokeWidth={size * 0.07} strokeLinecap="round" fill="none" />
      <Path d={sweep} stroke="url(#dialRim)" strokeOpacity={0.28} strokeWidth={size * 0.03} strokeLinecap="round" fill="none" />
      <Path d={sweep} stroke="url(#dialRim)" strokeOpacity={0.9} strokeWidth={size * 0.007} strokeLinecap="round" fill="none" />

      {/* Tramo final: por encima de la velocidad máxima del carro */}
      {redArc && (
        <>
          <Path d={redArc} stroke={colors.danger} strokeOpacity={0.18} strokeWidth={size * 0.07} fill="none" />
          <Path d={redArc} stroke={colors.danger} strokeOpacity={0.9} strokeWidth={size * 0.026} fill="none" />
        </>
      )}

      {/* Marcas */}
      {ticks.map(({ v, major }) => {
        const deg = gaugeDegFor(v, max);
        const a = polar(cx, cy, g.tickOuter, deg);
        const b = polar(cx, cy, g.tickOuter - (major ? g.majorLen : g.minorLen), deg);
        return (
          <Line
            key={v}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={major ? colors.text : colors.textMuted}
            strokeOpacity={major ? 0.9 : 0.45}
            strokeWidth={major ? 2.2 : 1}
            strokeLinecap="round"
          />
        );
      })}

      {/* Cifras por dentro de las marcas */}
      {ticks
        .filter((t) => t.major)
        .map(({ v }) => {
          const p = polar(cx, cy, g.rNumbers, gaugeDegFor(v, max));
          return (
            <SvgText
              key={`n${v}`}
              x={p.x}
              y={p.y + size * 0.017}
              fill={colors.text}
              fillOpacity={0.86}
              fontSize={size * 0.048}
              fontFamily={fonts.medium}
              textAnchor="middle"
            >
              {String(Math.round(v))}
            </SvgText>
          );
        })}

      {/* Límite: muesca roja que cruza las marcas */}
      {limitMark && (
        <Line
          x1={limitMark.a.x}
          y1={limitMark.a.y}
          x2={limitMark.b.x}
          y2={limitMark.b.y}
          stroke={colors.danger}
          strokeWidth={3}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  caption: { fontFamily: fonts.medium, letterSpacing: 0.3 },
  value: {
    fontFamily: fonts.semiboldItalic,
    letterSpacing: -1,
    includeFontPadding: false,
    textAlign: 'center',
    minWidth: '40%',
    textShadowOffset: { width: 0, height: 0 },
  },
  unit: { color: colors.textMuted, fontFamily: fonts.medium, letterSpacing: 0.5 },
});

export const Speedometer = memo(SpeedometerBase);
