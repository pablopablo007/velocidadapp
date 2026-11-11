import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { useSmoothValue } from '@/hooks/useSmoothValue';
import { SPEED_GRADIENT, colors, mono, speedColor } from '@/theme/theme';
import { KMH_TO_MPH } from '@/utils/format';
import {
  GAUGE_START_DEG as START_DEG,
  GAUGE_SWEEP_DEG as SWEEP_DEG,
  GAUGE_UP_DEG as UP_DEG,
  arcPath,
  gaugeArcLength,
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
  /** Velocidad máxima del vehículo: pinta la zona roja (misma unidad). */
  vehicleTop?: number | null;
  size?: number;
  overLimit?: boolean;
  /** Texto secundario bajo el número. */
  caption?: string;
};

function SpeedometerBase({
  value,
  max,
  unitLabel,
  peak = 0,
  limit = null,
  vehicleTop = null,
  size = 320,
  overLimit = false,
  caption,
}: Props) {
  const target = Math.max(0, Math.min(value, max));
  const smooth = useSmoothValue(target, 240, 0.05);
  const ratio = max > 0 ? smooth / max : 0;

  const cx = size / 2;
  const cy = size / 2;
  const stroke = size * 0.058;
  // Se deja aire por fuera del arco para los marcadores de límite y de pico.
  const radius = cx - stroke / 2 - size * 0.085;
  const arcLength = gaugeArcLength(radius);

  const trackPath = useMemo(
    () => arcPath(cx, cy, radius, START_DEG, START_DEG + SWEEP_DEG),
    [cx, cy, radius]
  );

  const majorStep = max <= 120 ? 20 : max <= 260 ? 40 : 60;
  const ticks = useMemo(() => {
    const out: { v: number; major: boolean }[] = [];
    const minorStep = majorStep / 4;
    for (let v = 0; v <= max + 0.001; v += minorStep) {
      out.push({ v, major: Math.abs(v % majorStep) < 0.001 });
    }
    return out;
  }, [max, majorStep]);

  const degFor = (v: number) => gaugeDegFor(v, max);
  const rotateTo = (v: number) => `rotate(${degFor(v) - UP_DEG}, ${cx}, ${cy})`;

  const currentDeg = START_DEG + ratio * SWEEP_DEG;
  const kmh = unitLabel === 'mph' ? smooth / KMH_TO_MPH : smooth;
  const tint = overLimit ? colors.danger : speedColor(kmh);

  // La aguja no llega al centro: así el número grande queda libre y no se
  // encima con el buje, que era lo que ensuciaba la lectura.
  const needleInner = radius * 0.60;
  const needleOuter = radius - stroke * 0.85;
  const pointer = polar(cx, cy, radius, currentDeg);

  const redlineFrom = vehicleTop != null && vehicleTop < max ? vehicleTop : null;
  const dashOffset = arcLength * (1 - ratio);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="speedArc" x1="0" y1="0.5" x2="1" y2="0.5">
            {SPEED_GRADIENT.map(([offset, color]) => (
              <Stop key={offset} offset={String(offset)} stopColor={color} />
            ))}
          </LinearGradient>
          <RadialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            {/* Con exceso de velocidad el halo se atenúa: si no, el número
                rojo sobre fondo rojo pierde contraste justo cuando más
                importa leerlo de un vistazo. */}
            <Stop offset="0" stopColor={tint} stopOpacity={overLimit ? '0.15' : '0.30'} />
            <Stop offset="0.55" stopColor={tint} stopOpacity={overLimit ? '0.05' : '0.09'} />
            <Stop offset="1" stopColor={tint} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/* Halo del centro: tiñe el fondo con el color de la velocidad */}
        <Circle cx={cx} cy={cy} r={radius * 0.92} fill="url(#coreGlow)" />

        {/* Aro exterior fino, a modo de bisel */}
        <Path
          d={arcPath(cx, cy, radius + stroke * 0.78, START_DEG, START_DEG + SWEEP_DEG)}
          stroke={colors.border}
          strokeWidth={1}
          fill="none"
        />

        {/* Canal de fondo */}
        <Path
          d={trackPath}
          stroke={colors.track}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />

        {/* Zona roja: por encima de la velocidad máxima del vehículo */}
        {redlineFrom != null && (
          <Path
            d={arcPath(cx, cy, radius, degFor(redlineFrom), START_DEG + SWEEP_DEG)}
            stroke={colors.danger}
            strokeOpacity={0.3}
            strokeWidth={stroke}
            fill="none"
          />
        )}

        {/*
          Resplandor del arco: tres pasadas cada vez más anchas y transparentes.
          react-native-svg no aplica filtros de desenfoque de forma fiable en
          todas las versiones, y así el brillo se ve igual en cualquiera.
        */}
        {ratio > 0.01 &&
          [
            { w: stroke * 2.4, o: 0.1 },
            { w: stroke * 1.7, o: 0.16 },
          ].map((capa) => (
            <Path
              key={capa.w}
              d={trackPath}
              stroke={tint}
              strokeOpacity={capa.o}
              strokeWidth={capa.w}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${arcLength} ${arcLength}`}
              strokeDashoffset={dashOffset}
            />
          ))}

        {/* Arco de progreso */}
        <Path
          d={trackPath}
          stroke="url(#speedArc)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${arcLength} ${arcLength}`}
          strokeDashoffset={dashOffset}
        />

        {/* Aro rojo cuando te pasas del límite */}
        {overLimit && (
          <Path
            d={arcPath(cx, cy, radius + stroke * 0.78, START_DEG, START_DEG + SWEEP_DEG)}
            stroke={colors.danger}
            strokeOpacity={0.55}
            strokeWidth={2.5}
            fill="none"
          />
        )}

        {/* Marcas y números */}
        <G>
          {ticks.map(({ v, major }) => {
            const deg = degFor(v);
            const rOuter = radius - stroke * 0.62;
            const rInner = rOuter - (major ? size * 0.036 : size * 0.016);
            const p1 = polar(cx, cy, rOuter, deg);
            const p2 = polar(cx, cy, rInner, deg);
            // Las cifras van lo más pegadas al aro que se puede: cada píxel que
            // ganan hacia fuera es hueco libre para la lectura digital central.
            const etiqueta = polar(cx, cy, rInner - size * 0.038, deg);
            const pasado = v <= smooth;
            return (
              <G key={v}>
                <Line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={major ? colors.text : colors.textFaint}
                  strokeOpacity={major ? (pasado ? 0.95 : 0.55) : pasado ? 0.6 : 0.3}
                  strokeWidth={major ? 2.4 : 1.2}
                  strokeLinecap="round"
                />
                {major && (
                  <SvgText
                    x={etiqueta.x}
                    y={etiqueta.y + size * 0.017}
                    fill={pasado ? colors.text : colors.textFaint}
                    fontSize={size * 0.047}
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {String(Math.round(v))}
                  </SvgText>
                )}
              </G>
            );
          })}
        </G>

        {/* Marca del límite: triángulo por fuera del arco */}
        {limit != null && limit > 0 && limit <= max && (
          <G transform={rotateTo(limit)}>
            <Polygon
              points={`${cx},${cy - radius - stroke * 0.52} ${cx - size * 0.021},${
                cy - radius - stroke * 0.52 - size * 0.032
              } ${cx + size * 0.021},${cy - radius - stroke * 0.52 - size * 0.032}`}
              fill={colors.amber}
            />
          </G>
        )}

        {/* Máxima alcanzada en la sesión */}
        {peak > 0 && peak <= max && (
          <G transform={rotateTo(peak)}>
            <Line
              x1={cx}
              y1={cy - radius - stroke * 0.55}
              x2={cx}
              y2={cy - radius + stroke * 0.55}
              stroke="#FFFFFF"
              strokeOpacity={0.9}
              strokeWidth={3}
              strokeLinecap="round"
            />
          </G>
        )}

        {/* Aguja flotante, sin llegar al centro */}
        <G transform={`rotate(${currentDeg - UP_DEG}, ${cx}, ${cy})`}>
          <Line
            x1={cx}
            y1={cy - needleInner}
            x2={cx}
            y2={cy - needleOuter}
            stroke={tint}
            strokeOpacity={0.22}
            strokeWidth={size * 0.036}
            strokeLinecap="round"
          />
          <Line
            x1={cx}
            y1={cy - needleInner}
            x2={cx}
            y2={cy - needleOuter}
            stroke={tint}
            strokeWidth={size * 0.014}
            strokeLinecap="round"
          />
        </G>

        {/* Punto que cabalga sobre el arco */}
        <Circle cx={pointer.x} cy={pointer.y} r={stroke * 0.62} fill={tint} opacity={0.28} />
        <Circle
          cx={pointer.x}
          cy={pointer.y}
          r={stroke * 0.3}
          fill="#FFFFFF"
          stroke={tint}
          strokeWidth={2.5}
        />
      </Svg>

      {/*
        Lectura digital superpuesta: RN Text da mejor tipografía y kerning que
        SVG Text. El ancho se limita a propósito — con tres cifras el número se
        comía las del dial, así que se encoge solo antes de invadirlas.
      */}
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        {!!caption && (
          <Text
            style={[styles.caption, { fontSize: size * 0.036, maxWidth: size * 0.46 }]}
            numberOfLines={1}
          >
            {caption}
          </Text>
        )}
        <Text
          style={[
            styles.value,
            {
              fontSize: size * 0.21,
              width: size * 0.40,
              color: overLimit ? colors.danger : colors.text,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          allowFontScaling={false}
        >
          {Math.round(smooth)}
        </Text>
        <View style={[styles.unitPill, { borderColor: `${tint}66`, backgroundColor: `${tint}1A` }]}>
          <Text style={[styles.unit, { fontSize: size * 0.034, color: tint }]}>
            {unitLabel.toUpperCase()}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  value: {
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    textAlign: 'center',
  },
  unitPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginTop: 4,
  },
  unit: { fontWeight: '800', letterSpacing: 1.5 },
  caption: { color: colors.textMuted, fontFamily: mono, marginBottom: 4 },
});

export const Speedometer = memo(SpeedometerBase);
