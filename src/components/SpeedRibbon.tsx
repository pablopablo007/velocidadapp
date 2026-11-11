import React, { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { colors, mono, speedColor } from '@/theme/theme';

type Props = {
  speedKmh: number;
  maxKmh: number;
  /** Cuántos segundos de historia mostrar. */
  seconds?: number;
  limitKmh?: number | null;
  height?: number;
};

/**
 * Cinta con la velocidad de los últimos segundos, la más reciente a la derecha.
 *
 * Se muestrea con un temporizador propio a 1 Hz en vez de reaccionar a cada
 * lectura del GPS: el eje tiene que ser el tiempo, no el número de lecturas, o
 * la cinta se comprime y se estira según la señal que haya.
 */
function SpeedRibbonBase({ speedKmh, maxKmh, seconds = 60, limitKmh, height = 48 }: Props) {
  const [samples, setSamples] = useState<number[]>(() => new Array(seconds).fill(0));
  const latest = useRef(speedKmh);
  useEffect(() => {
    latest.current = speedKmh;
  }, [speedKmh]);

  useEffect(() => {
    const id = setInterval(() => {
      setSamples((prev) => [...prev.slice(1), Math.max(0, latest.current)]);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const escala = Math.max(40, maxKmh);
  const anchoBarra = 100 / seconds;
  const pico = Math.max(...samples);

  return (
    <View style={[styles.wrap, { height }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 100 40`} preserveAspectRatio="none">
        {limitKmh != null && limitKmh > 0 && limitKmh < escala && (
          <Line
            x1={0}
            y1={40 - (limitKmh / escala) * 40}
            x2={100}
            y2={40 - (limitKmh / escala) * 40}
            stroke={colors.amber}
            strokeOpacity={0.55}
            strokeWidth={0.5}
            strokeDasharray="2 2"
          />
        )}
        {samples.map((v, i) => {
          const alto = Math.max(v > 0 ? 1 : 0.5, (Math.min(v, escala) / escala) * 40);
          return (
            <Rect
              key={i}
              x={i * anchoBarra}
              y={40 - alto}
              width={anchoBarra * 0.72}
              height={alto}
              fill={v > 0 ? speedColor(v) : colors.track}
              // Las muestras más viejas se desvanecen hacia la izquierda.
              opacity={0.35 + (i / seconds) * 0.65}
            />
          );
        })}
      </Svg>
      <View style={styles.labels}>
        <Text style={styles.label}>−{seconds}s</Text>
        <Text style={styles.peak}>pico {Math.round(pico)}</Text>
        <Text style={styles.label}>ahora</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 3,
  },
  label: { fontSize: 9, color: colors.textFaint, fontFamily: mono },
  peak: { fontSize: 9, color: colors.textMuted, fontFamily: mono },
});

export const SpeedRibbon = memo(SpeedRibbonBase);
