import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Taillight, useMainPhoto } from '@/services/mainPhoto';
import { liveLatG, liveLongG } from '@/state/liveMotion';
import { colors } from '@/theme/theme';
import type { BodyType } from '@/vehicles/polo';

/**
 * Foto trasera del carro, de estudio oscuro.
 *
 * Con `live` se mueve como el carro de verdad, con los datos medidos y en el
 * hilo de interfaz (a los cuadros de la pantalla, 120 por segundo en el
 * iPhone 15 Pro):
 * - se recuesta un poco en las curvas (fuerza lateral del giroscopio);
 * - baja la cola al acelerar y la levanta al frenar;
 * - al frenar de verdad se encienden las luces de freno sobre la foto.
 *
 * Usa la foto que elijas en el garaje; si no hay, la de fábrica; y si el carro
 * no trae foto, un dibujo en el mismo estilo de estudio.
 */

type Props = {
  vehicleId: string;
  bodyType: BodyType;
  width: number;
  live?: boolean;
};

const SPRING = { damping: 18, stiffness: 140, mass: 0.8 };
/** Para fotos propias, sin luces ubicadas: dónde suelen estar en una foto trasera centrada. */
const GENERIC_TAILLIGHTS: Taillight[] = [
  { x: 0.24, y: 0.52, rx: 0.1, ry: 0.07 },
  { x: 0.76, y: 0.52, rx: 0.1, ry: 0.07 },
];

function CarPhotoBase({ vehicleId, bodyType, width, live = false }: Props) {
  const photo = useMainPhoto(vehicleId);
  const ratio = photo.source ? photo.ratio : FALLBACK_RATIO;
  const height = width * ratio;

  const lat = useDerivedValue(() => (live ? withSpring(liveLatG.value, SPRING) : 0));
  const long = useDerivedValue(() => (live ? withSpring(liveLongG.value, SPRING) : 0));

  const motion = useAnimatedStyle(() => ({
    transform: [
      // En una curva a la derecha la carrocería se recuesta hacia la izquierda.
      { translateX: interpolate(lat.value, [-0.8, 0.8], [width * 0.02, -width * 0.02], Extrapolation.CLAMP) },
      { translateY: interpolate(long.value, [-0.8, 0, 0.45], [-height * 0.025, 0, height * 0.02], Extrapolation.CLAMP) },
      { rotateZ: `${interpolate(lat.value, [-0.8, 0.8], [3.2, -3.2], Extrapolation.CLAMP)}deg` },
      { scale: interpolate(long.value, [-0.8, 0, 0.45], [0.975, 1, 1.02], Extrapolation.CLAMP) },
    ],
  }));

  const brake = useAnimatedStyle(() => ({
    opacity: interpolate(long.value, [-0.28, -0.05], [1, 0], Extrapolation.CLAMP),
  }));

  const lights = photo.taillights ?? (photo.source ? GENERIC_TAILLIGHTS : FALLBACK_TAILLIGHTS[bodyType]);

  return (
    <View style={{ width, height }} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, motion]}>
        {photo.source ? (
          <Image source={photo.source} style={{ width, height }} resizeMode="cover" />
        ) : (
          <StudioArt bodyType={bodyType} width={width} height={height} />
        )}

        {/* Las fotos propias no traen bordes difuminados: se funden aquí */}
        {photo.custom && (
          <>
            <LinearGradient colors={[colors.bg, 'rgba(10,10,11,0)']} style={[styles.fade, { top: 0, height: height * 0.22 }]} />
            <LinearGradient colors={['rgba(10,10,11,0)', colors.bg]} style={[styles.fade, { bottom: 0, height: height * 0.3 }]} />
            <LinearGradient
              colors={[colors.bg, 'rgba(10,10,11,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.fadeSide, { left: 0, width: width * 0.16 }]}
            />
            <LinearGradient
              colors={['rgba(10,10,11,0)', colors.bg]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.fadeSide, { right: 0, width: width * 0.16 }]}
            />
          </>
        )}

        {/* Luces de freno */}
        {live && (
          <Animated.View style={[StyleSheet.absoluteFill, brake]}>
            <Svg width={width} height={height}>
              <Defs>
                <RadialGradient id="cpBrake" cx="50%" cy="50%" rx="50%" ry="50%">
                  <Stop offset="0" stopColor="#FF3B4E" stopOpacity="0.95" />
                  <Stop offset="0.35" stopColor="#FF2D46" stopOpacity="0.55" />
                  <Stop offset="1" stopColor="#FF2D46" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              {lights.map((l, i) => (
                <Ellipse
                  key={i}
                  cx={l.x * width}
                  cy={l.y * height}
                  rx={l.rx * width * 1.25}
                  ry={l.ry * height * 1.6}
                  fill="url(#cpBrake)"
                />
              ))}
            </Svg>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Dibujo de reserva, en el mismo estilo de estudio que las fotos: se usa
// mientras el carro no tenga foto (la Gol Pick Up hasta que elijas la suya).

const FALLBACK_RATIO = 0.65;
/** Luces del dibujo de reserva (viewBox 160 × 104, carro desplazado 20 × 4). */
const FALLBACK_TAILLIGHTS: Record<BodyType, Taillight[]> = {
  pickup: [
    { x: 0.334, y: 0.644, rx: 0.024, ry: 0.085 },
    { x: 0.666, y: 0.644, rx: 0.024, ry: 0.085 },
  ],
  hatchback: [
    { x: 0.366, y: 0.615, rx: 0.05, ry: 0.036 },
    { x: 0.634, y: 0.615, rx: 0.05, ry: 0.036 },
  ],
};

function StudioArt({ bodyType, width, height }: { bodyType: BodyType; width: number; height: number }) {
  const pickup = bodyType === 'pickup';
  return (
    <Svg width={width} height={height} viewBox="0 0 160 104" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <RadialGradient id="saBack" cx="50%" cy="42%" rx="52%" ry="55%">
          <Stop offset="0" stopColor="#2A0E13" stopOpacity="0.9" />
          <Stop offset="0.6" stopColor="#12080A" stopOpacity="0.6" />
          <Stop offset="1" stopColor="#0A0A0B" stopOpacity="0" />
        </RadialGradient>
        <SvgLinearGradient id="saBeam" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FF2D46" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FF2D46" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#FF2D46" stopOpacity="0" />
        </SvgLinearGradient>
        <SvgLinearGradient id="saBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={pickup ? '#E9ECF0' : '#3B4047'} />
          <Stop offset="0.55" stopColor={pickup ? '#B9C0C9' : '#1D2025'} />
          <Stop offset="1" stopColor={pickup ? '#5E6670' : '#0C0D10'} />
        </SvgLinearGradient>
        <SvgLinearGradient id="saGlass" x1="0" y1="0" x2="0.3" y2="1">
          <Stop offset="0" stopColor="#4A5663" />
          <Stop offset="1" stopColor="#0D1116" />
        </SvgLinearGradient>
        <RadialGradient id="saFloor" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#000" stopOpacity="0.85" />
          <Stop offset="1" stopColor="#000" stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <Rect x="0" y="0" width="160" height="104" fill="url(#saBack)" />
      {/* Haces de luz en diagonal, como en la foto de estudio del Polo */}
      <G opacity={0.8}>
        <Line x1="10" y1="70" x2="58" y2="6" stroke="url(#saBeam)" strokeWidth="1.1" />
        <Line x1="22" y1="84" x2="74" y2="10" stroke="url(#saBeam)" strokeWidth="0.6" />
        <Line x1="150" y1="70" x2="102" y2="6" stroke="url(#saBeam)" strokeWidth="1.1" />
        <Line x1="138" y1="84" x2="86" y2="10" stroke="url(#saBeam)" strokeWidth="0.6" />
      </G>
      <Ellipse cx="80" cy="86" rx="46" ry="5" fill="url(#saFloor)" />

      <G transform="translate(20 4)">
        {pickup ? (
          <>
            <Path d="M 41 50 L 44 37 Q 45.5 32.5 51 32.5 L 69 32.5 Q 74.5 32.5 76 37 L 79 50 Z" fill="url(#saBody)" />
            <Path d="M 45.5 48.5 L 47.6 39 Q 48.5 36.5 51.5 36.5 L 68.5 36.5 Q 71.5 36.5 72.4 39 L 74.5 48.5 Z" fill="url(#saGlass)" />
            <Path
              d="M 29 53 Q 29 49.5 33 49.5 L 87 49.5 Q 91 49.5 91 53 L 91 76 Q 91 80 87 80 L 33 80 Q 29 80 29 76 Z"
              fill="url(#saBody)"
            />
            <Rect x="29.6" y="49.8" width="60.8" height="2.6" rx="1.2" fill="#1B1E22" />
            <Rect x="38.5" y="55" width="43" height="17.5" rx="1.5" fill="none" stroke="#8C96A1" strokeOpacity="0.6" strokeWidth="0.6" />
            <Rect x="52" y="63.5" width="16" height="6.5" rx="1.1" fill="#D8DDE2" />
            <Rect x="30.5" y="54.5" width="6" height="17" rx="1.8" fill="#B3192E" />
            <Rect x="83.5" y="54.5" width="6" height="17" rx="1.8" fill="#B3192E" />
            <Path d="M 29 73.5 L 91 73.5 L 91 76.5 Q 91 80.5 87 80.5 L 33 80.5 Q 29 80.5 29 76.5 Z" fill="#0B0C0E" />
          </>
        ) : (
          <>
            <Path d="M 40 54 L 45 38 Q 47 33 53 33 L 67 33 Q 73 33 75 38 L 80 54 Z" fill="url(#saBody)" />
            <Path d="M 44.5 52 L 48 39.5 Q 49 37 52 37 L 68 37 Q 71 37 72 39.5 L 75.5 52 Z" fill="url(#saGlass)" />
            <Path
              d="M 30 58 Q 30 52 37 52 L 83 52 Q 90 52 90 58 L 91 76 Q 91 81 86 81 L 34 81 Q 29 81 29 76 Z"
              fill="url(#saBody)"
            />
            <Rect x="31" y="56.5" width="15" height="7" rx="2.5" fill="#B3192E" />
            <Rect x="74" y="56.5" width="15" height="7" rx="2.5" fill="#B3192E" />
            <Rect x="51" y="65" width="18" height="7" rx="1.2" fill="#D8DDE2" />
          </>
        )}
        {/* Luz de borde: dibuja la silueta contra el fondo */}
        <Path
          d={pickup ? 'M 29 53 Q 29 49.5 33 49.5 L 41 49.5 L 44 37 Q 45.5 32.5 51 32.5 L 69 32.5 Q 74.5 32.5 76 37 L 79 49.5 L 87 49.5 Q 91 49.5 91 53' : 'M 30 58 Q 30 52 37 52 L 40 52 L 45 38 Q 47 33 53 33 L 67 33 Q 73 33 75 38 L 80 52 L 83 52 Q 90 52 90 58'}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.55"
          strokeWidth="0.6"
        />
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0 },
  fadeSide: { position: 'absolute', top: 0, bottom: 0 },
});

export const CarPhoto = memo(CarPhotoBase);
