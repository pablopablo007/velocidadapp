import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { TrackPoint } from '@/services/tripEngine';
import { colors } from '@/theme/theme';
import { LatLng } from '@/utils/geo';

/**
 * Mapa sin bordes, como en la cabina digital de Volkswagen: no va en una
 * tarjeta, se funde con el negro del tablero por los lados.
 *
 * Sigue al carro con la cámara inclinada y el rumbo hacia arriba. La flecha
 * queda fija y es el mapa el que se mueve debajo; MapKit anima la cámara en
 * nativo, así que se desliza a los cuadros de la pantalla. No responde a
 * gestos (estorbaría al manejar y al deslizar de página): tocarlo abre la
 * pestaña Mapa.
 */

type Fades = { top?: number; bottom?: number; left?: number; right?: number };

type Props = {
  position: LatLng | null;
  /** Rumbo de marcha en grados; `null` mientras no se conoce. */
  heading: number | null;
  path: TrackPoint[];
  /** Dónde va la flecha, en fracción del ancho y del alto. */
  arrow?: { x: number; y: number };
  /** Largo de cada fundido a negro, en fracción del lado correspondiente. */
  fades?: Fades;
  /** Color del anillo de la flecha (el del carro). */
  tint?: string;
  onPress?: () => void;
  style?: object;
};

const PITCH = 55;
const ALTITUDE_M = 480;

function MapBackdropBase({
  position,
  heading,
  path,
  arrow = { x: 0.5, y: 0.66 },
  fades = { top: 0.2, bottom: 0.3, left: 0.12, right: 0.12 },
  tint = colors.text,
  onPress,
  style,
}: Props) {
  const mapRef = useRef<MapView | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const [firstFix, setFirstFix] = useState<LatLng | null>(position);
  if (firstFix == null && position != null) setFirstFix(position);
  const [initialHeading] = useState(heading ?? 0);

  // Aparece con un fundido al estar listo, no de golpe.
  const shown = useSharedValue(0);
  useEffect(() => {
    if (ready) shown.set(withTiming(1, { duration: 700 }));
  }, [ready, shown]);
  const fadeIn = useAnimatedStyle(() => ({ opacity: shown.value }));

  const course = heading ?? 0;
  useEffect(() => {
    if (!ready || !position || !mapRef.current) return;
    // Casi un segundo: empalma con la siguiente lectura del GPS sin tirones.
    mapRef.current.animateCamera({ center: position, heading: course, pitch: PITCH }, { duration: 950 });
  }, [position, course, ready]);

  const route = useMemo(() => path.map((p) => ({ latitude: p.lat, longitude: p.lon })), [path]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  };

  // El centro del mapa es donde está el carro: se agranda y desplaza el mapa
  // para que ese centro caiga donde va la flecha.
  const mapW = box.w * 2 * Math.max(arrow.x, 1 - arrow.x);
  const mapH = box.h * 2 * Math.max(arrow.y, 1 - arrow.y);
  const mapLeft = box.w * arrow.x - mapW / 2;
  const mapTop = box.h * arrow.y - mapH / 2;

  const f = { top: 0, bottom: 0, left: 0, right: 0, ...fades };

  return (
    <Pressable onPress={onPress} onLayout={onLayout} style={[styles.root, style]} accessibilityRole="button" accessibilityLabel="Mapa. Toca para abrirlo completo">
      {firstFix && box.h > 0 && (
        <Animated.View style={[styles.map, { left: mapLeft, top: mapTop, width: mapW, height: mapH }, fadeIn]} pointerEvents="none">
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            mapType="mutedStandard"
            userInterfaceStyle="dark"
            initialCamera={{ center: firstFix, heading: initialHeading, pitch: PITCH, altitude: ALTITUDE_M, zoom: 16.5 }}
            onMapReady={() => setReady(true)}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            showsCompass={false}
            showsScale={false}
            showsTraffic={false}
            showsBuildings={false}
            showsPointsOfInterests={false}
            showsUserLocation={false}
            toolbarEnabled={false}
          >
            {route.length > 1 && (
              <>
                <Polyline coordinates={route} strokeColor="rgba(245,245,247,0.22)" strokeWidth={11} lineCap="round" lineJoin="round" />
                <Polyline coordinates={route} strokeColor="#F5F5F7" strokeWidth={4} lineCap="round" lineJoin="round" />
              </>
            )}
          </MapView>
        </Animated.View>
      )}

      {/* Fundidos a negro: el mapa no tiene bordes, se apaga hacia los lados */}
      {f.top > 0 && <LinearGradient colors={[colors.bg, 'rgba(10,10,11,0)']} style={[styles.edgeH, { top: 0, height: `${f.top * 100}%` }]} pointerEvents="none" />}
      {f.bottom > 0 && <LinearGradient colors={['rgba(10,10,11,0)', colors.bg]} style={[styles.edgeH, { bottom: 0, height: `${f.bottom * 100}%` }]} pointerEvents="none" />}
      {f.left > 0 && (
        <LinearGradient colors={[colors.bg, 'rgba(10,10,11,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.edgeV, { left: 0, width: `${f.left * 100}%` }]} pointerEvents="none" />
      )}
      {f.right > 0 && (
        <LinearGradient colors={['rgba(10,10,11,0)', colors.bg]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.edgeV, { right: 0, width: `${f.right * 100}%` }]} pointerEvents="none" />
      )}

      {/* La flecha del carro: fija; el mapa gira y avanza debajo */}
      {firstFix && box.h > 0 && (
        <View pointerEvents="none" style={[styles.arrow, { left: box.w * arrow.x - 20, top: box.h * arrow.y - 20 }]}>
          <Svg width={40} height={40} viewBox="0 0 40 40">
            <Circle cx="20" cy="20" r="17" fill={tint} fillOpacity={0.12} />
            <Path d="M 20 8 L 29 30 L 20 25 L 11 30 Z" fill="#F5F5F7" stroke={colors.bg} strokeWidth={1.5} strokeLinejoin="round" />
          </Svg>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', backgroundColor: colors.bg },
  map: { position: 'absolute' },
  edgeH: { position: 'absolute', left: 0, right: 0 },
  edgeV: { position: 'absolute', top: 0, bottom: 0 },
  arrow: { position: 'absolute', width: 40, height: 40 },
});

export const MapBackdrop = memo(MapBackdropBase);
