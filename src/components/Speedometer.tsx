import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { useSmoothValue } from '@/hooks/useSmoothValue';
import { colors, fonts, speedColor } from '@/theme/theme';
import { KMH_TO_MPH } from '@/utils/format';
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
};

/**
 * Velocímetro de tablero digital: una banda oscura con las marcas por dentro,
 * que se encienden al pasar la velocidad, y un arco fino de progreso en el
 * borde interior. Sin aguja: la cifra central es la lectura y el arco, el contexto.
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
}: Props) {
  // La cifra muestra la velocidad real aunque supere la escala; solo el arco
  // se detiene en el tope del dial.
  const shown = useSmoothValue(Math.max(0, value), 240, 0.05);
  const smooth = Math.min(shown, max);

  const cx = size / 2;
  const cy = size / 2;
  const band = size * 0.075; // ancho de la banda oscura
  const rBand = size / 2 - band / 2 - size * 0.02; // radio medio de la banda
  const rInner = rBand - band / 2; // borde interior: ahí corre el progreso
  const rOuter = rBand + band / 2;

  const majorStep = max <= 260 ? 20 : 40;
  const minorStep = majorStep / 4;

  const ticks = useMemo(() => {
    const out: { v: number; major: boolean }[] = [];
    for (let v = 0; v <= max + 0.001; v += minorStep) {
      out.push({ v, major: Math.abs(v % majorStep) < 0.001 });
    }
    return out;
  }, [max, majorStep, minorStep]);

  const degFor = (v: number) => gaugeDegFor(v, max);
  const kmh = unitLabel === 'mph' ? smooth / KMH_TO_MPH : smooth;
  const tint = overLimit ? colors.danger : speedColor(kmh);
  const moving = smooth > 0.5;

  const bandPath = arcPath(cx, cy, rBand, START_DEG, START_DEG + SWEEP_DEG);
  const redFrom = vehicleTop != null && vehicleTop < max ? vehicleTop : null;

  const limitMark =
    limit != null && limit > 0 && limit <= max
      ? { a: polar(cx, cy, rOuter + 3, degFor(limit)), b: polar(cx, cy, rInner - 3, degFor(limit)) }
      : null;
  const peakMark =
    peak > 0.5 && peak <= max ? polar(cx, cy, rOuter + size * 0.018, degFor(peak)) : null;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Banda */}
        <Path d={bandPath} stroke={colors.surfaceStrong} strokeWidth={band} fill="none" />
        <Path
          d={arcPath(cx, cy, rOuter + 1, START_DEG, START_DEG + SWEEP_DEG)}
          stroke={colors.border}
          strokeWidth={1}
          fill="none"
        />

        {/* Tramo final: por encima de la velocidad máxima del carro */}
        {redFrom != null && (
          <Path
            d={arcPath(cx, cy, rOuter - 1.5, degFor(redFrom), START_DEG + SWEEP_DEG)}
            stroke={colors.danger}
            strokeOpacity={0.7}
            strokeWidth={2}
            fill="none"
          />
        )}

        {/* Marcas dentro de la banda: encendidas hasta la velocidad actual */}
        <G>
          {ticks.map(({ v, major }) => {
            const deg = degFor(v);
            const largo = major ? band * 0.62 : band * 0.36;
            const p1 = polar(cx, cy, rOuter - band * 0.18, deg);
            const p2 = polar(cx, cy, rOuter - band * 0.18 - largo, deg);
            const pasado = moving && v <= smooth + 0.01;
            return (
              <Line
                key={v}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={pasado ? tint : colors.textMuted}
                strokeOpacity={pasado ? 1 : major ? 0.75 : 0.4}
                strokeWidth={major ? 2 : 1.2}
                strokeLinecap="round"
              />
            );
          })}
        </G>

        {/* Cifras por dentro de la banda */}
        {ticks
          .filter((t) => t.major)
          .map(({ v }) => {
            const p = polar(cx, cy, rInner - size * 0.055, degFor(v));
            const pasado = moving && v <= smooth + 0.01;
            return (
              <SvgText
                key={`n${v}`}
                x={p.x}
                y={p.y + size * 0.014}
                fill={pasado ? colors.text : colors.textMuted}
                fontSize={size * 0.04}
                fontFamily={fonts.medium}
                textAnchor="middle"
              >
                {String(Math.round(v))}
              </SvgText>
            );
          })}

        {/* Progreso: arco fino en el borde interior de la banda */}
        {moving && (
          <Path
            d={arcPath(cx, cy, rInner + 1.5, START_DEG, degFor(smooth))}
            stroke={tint}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
        )}

        {/* Límite: muesca roja que cruza la banda */}
        {limitMark && (
          <Line
            x1={limitMark.a.x}
            y1={limitMark.a.y}
            x2={limitMark.b.x}
            y2={limitMark.b.y}
            stroke={colors.danger}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        )}

        {/* Máxima de la sesión: punto sobre el borde exterior */}
        {peakMark && <Circle cx={peakMark.x} cy={peakMark.y} r={size * 0.009} fill={colors.text} />}
      </Svg>

      {/* Lectura central */}
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text
          style={[
            styles.caption,
            { fontSize: size * 0.042, color: overLimit ? colors.danger : colors.textMuted },
          ]}
        >
          {caption}
        </Text>
        <Text
          style={[
            styles.value,
            {
              fontSize: size * 0.27,
              lineHeight: size * 0.31,
              color: overLimit ? colors.danger : colors.text,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          allowFontScaling={false}
        >
          {Math.round(shown)}
        </Text>
        <Text style={[styles.unit, { fontSize: size * 0.045 }]}>{unitLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  caption: { fontWeight: '500', letterSpacing: 0.3 },
  value: {
    fontFamily: fonts.medium,
    letterSpacing: -1,
    includeFontPadding: false,
    textAlign: 'center',
    minWidth: '40%',
  },
  unit: { color: colors.textMuted, fontWeight: '500', letterSpacing: 0.5 },
});

export const Speedometer = memo(SpeedometerBase);
