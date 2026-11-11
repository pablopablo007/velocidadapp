import { Image } from 'expo-image';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { MIN_FRAMES_FOR_SPIN } from '@/services/carPhotos';
import { colors, mono } from '@/theme/theme';
import { useAccent } from '@/theme/accent';

/** Píxeles de arrastre que hacen avanzar un fotograma. */
const DRAG_PER_FRAME = 18;

type Props = {
  frames: string[];
  height?: number;
  /** Gira solo hasta que lo tocas por primera vez. */
  autoSpin?: boolean;
};

function CarSpinnerBase({ frames, height = 190, autoSpin = true }: Props) {
  const accent = useAccent();
  const [index, setIndex] = useState(0);
  const [touched, setTouched] = useState(false);

  const indexRef = useRef(0);
  const startIndexRef = useRef(0);
  const touchedRef = useRef(false);
  const total = frames.length;
  const spinnable = total >= MIN_FRAMES_FOR_SPIN;

  // Las fotos se precargan para que el primer giro no se entrecorte.
  useEffect(() => {
    if (frames.length > 1) Image.prefetch(frames).catch(() => {});
  }, [frames]);

  // Si cambian las fotos se vuelve al primer cuadro. Se ajusta durante el
  // render (patrón recomendado por React) en vez de en un efecto.
  const [prevFrames, setPrevFrames] = useState(frames);
  if (frames !== prevFrames) {
    setPrevFrames(frames);
    setIndex(0);
  }
  useEffect(() => {
    indexRef.current = 0;
  }, [frames]);

  // Giro lento de presentación, que se detiene en cuanto lo tocas.
  useEffect(() => {
    if (!autoSpin || !spinnable || touched) return;
    const id = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % total;
      setIndex(indexRef.current);
    }, 110);
    return () => clearInterval(id);
  }, [autoSpin, spinnable, touched, total]);

  // Los refs solo se leen dentro de los manejadores del gesto, nunca al
  // renderizar; la regla no distingue el PanResponder de un cálculo de render.
  /* eslint-disable react-hooks/refs */
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => spinnable,
        // Solo captura el gesto si es claramente horizontal: si no, se comería
        // el desplazamiento vertical de la pantalla.
        onMoveShouldSetPanResponder: (_, g) =>
          spinnable && Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 4,
        onPanResponderGrant: () => {
          startIndexRef.current = indexRef.current;
          if (!touchedRef.current) {
            touchedRef.current = true;
            setTouched(true);
          }
        },
        onPanResponderMove: (_, g) => {
          const avance = Math.round(g.dx / DRAG_PER_FRAME);
          const siguiente = (((startIndexRef.current + avance) % total) + total) % total;
          if (siguiente !== indexRef.current) {
            indexRef.current = siguiente;
            setIndex(siguiente);
          }
        },
      }),
    [spinnable, total]
  );
  /* eslint-enable react-hooks/refs */

  if (total === 0) {
    return (
      <View style={{ height }}>
        <CarIllustration height={height} />
      </View>
    );
  }

  return (
    <View style={{ height }} {...(spinnable ? pan.panHandlers : {})}>
      <Image
        source={{ uri: frames[Math.min(index, total - 1)] }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
      />
      {spinnable && (
        <View style={styles.hint} pointerEvents="none">
          {!touched ? (
            <Text style={styles.hintText}>ARRASTRA PARA GIRAR</Text>
          ) : (
            <View style={styles.dots}>
              {frames.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === index && { backgroundColor: accent.accent, width: 14 },
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Ilustración por defecto mientras no haya fotos.
 * Es un dibujo, no una foto: no pretende pasar por real, solo que la tarjeta
 * se vea completa desde el primer día.
 */
export function CarIllustration({ height = 190 }: { height?: number }) {
  const accent = useAccent();
  return (
    <View style={{ height, width: '100%' }}>
      <Svg width="100%" height="100%" viewBox="0 0 260 120" preserveAspectRatio="xMidYMid meet">
        <Defs>
          <LinearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3B4C5E" />
            <Stop offset="0.45" stopColor="#222D39" />
            <Stop offset="1" stopColor="#141B23" />
          </LinearGradient>
          <LinearGradient id="glass" x1="0" y1="0" x2="0.4" y2="1">
            <Stop offset="0" stopColor="#7C93A6" stopOpacity="0.9" />
            <Stop offset="0.5" stopColor="#3A4854" stopOpacity="0.95" />
            <Stop offset="1" stopColor="#222C36" stopOpacity="1" />
          </LinearGradient>
          <LinearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Sombra sobre el piso */}
        <Ellipse cx="130" cy="103" rx="102" ry="8" fill="#000" opacity="0.45" />

        {/* Carrocería */}
        <Path
          d="M 28 88 L 25 72 C 24 65, 26 61, 32 58 L 50 53 L 69 29 C 72 24, 78 21, 86 21
             L 152 20 C 162 20, 168 23, 173 29 L 196 50 L 224 55 C 233 56, 238 61, 239 68
             L 240 80 C 240 86, 238 88, 234 88 Z"
          fill="url(#paint)"
          stroke="#54697E"
          strokeWidth={1.3}
        />
        {/* Brillo lateral: una franja clara a media altura da sensación de chapa */}
        <Path d="M 30 66 L 236 70 L 236 74 L 30 70 Z" fill="url(#shine)" />

        {/* Cristales */}
        <Path
          d="M 60 50 L 76 30 C 78 27, 82 26, 87 26 L 150 25 C 157 25, 161 27, 165 32 L 182 49 Z"
          fill="url(#glass)"
        />
        <Rect x="119" y="26" width="2.6" height="23" fill="#1A232C" />

        {/* Puerta y manija */}
        <Path d="M 119 50 L 119 87" stroke="#0F161D" strokeWidth={1.2} opacity={0.85} />
        <Rect x="128" y="57" width="12" height="2.8" rx={1.4} fill="#5B7086" />

        {/* Espejo */}
        <Path d="M 172 45 L 182 43 L 182 48 Z" fill="#2E3A46" />

        {/* Faro y piloto */}
        <Path d="M 228 60 L 238 62 L 238 68 L 228 67 Z" fill="#FFF6D8" opacity={0.9} />
        <Path d="M 27 62 L 37 61 L 37 68 L 27 68 Z" fill={colors.danger} opacity={0.9} />

        {/* Ruedas */}
        {[
          { cx: 70, r: 17 },
          { cx: 186, r: 17 },
        ].map(({ cx, r }) => (
          <G key={cx}>
            <Path
              d={`M ${cx - r - 5} 86 A ${r + 5} ${r + 5} 0 0 1 ${cx + r + 5} 86`}
              fill="none"
              stroke="#0C1218"
              strokeWidth={3}
            />
            <Ellipse cx={cx} cy={86} rx={r} ry={r} fill="#0B1016" stroke="#33404C" strokeWidth={1.5} />
            <Ellipse cx={cx} cy={86} rx={r * 0.6} ry={r * 0.6} fill="#212C37" />
            {[0, 60, 120].map((a) => (
              <Rect
                key={a}
                x={cx - 1.3}
                y={86 - r * 0.58}
                width={2.6}
                height={r * 1.16}
                rx={1.3}
                fill="#4E6376"
                transform={`rotate(${a}, ${cx}, 86)`}
              />
            ))}
            <Ellipse cx={cx} cy={86} rx={3} ry={3} fill={accent.accent} />
          </G>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  hintText: {
    fontSize: 9,
    letterSpacing: 1.4,
    color: colors.textFaint,
    fontFamily: mono,
  },
  dots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
});

export const CarSpinner = memo(CarSpinnerBase);
