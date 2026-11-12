import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import Svg, { Circle, Path } from 'react-native-svg';

import { TrackPoint } from '@/services/tripEngine';
import { colors, fonts, radius } from '@/theme/theme';
import { LatLng } from '@/utils/geo';

/**
 * Mapa en miniatura para el tablero.
 *
 * Sigue al carro con la cámara inclinada y el rumbo hacia arriba, como un
 * navegador: la flecha queda fija en el tercio inferior y es el mapa el que
 * se mueve y gira debajo. Dibuja el recorrido del viaje en curso.
 *
 * No responde a gestos (un mapa que se arrastra dentro del tablero estorbaría
 * al deslizar entre páginas y al manejar): tocarlo abre la pestaña Mapa, que
 * es donde se explora.
 */

/** La flecha va al 66 % de la altura: se ve más camino por delante que por detrás. */
const ARROW_AT = 0.66;
const PITCH = 52;
const ALTITUDE_M = 520;

type Props = {
  position: LatLng | null;
  /** Rumbo del carro en grados; `null` si todavía no se conoce. */
  heading: number | null;
  path: TrackPoint[];
  /** Precisión del GPS en metros, para las barras de señal. */
  accuracy: number | null;
  /** Color de la ruta y de la flecha. */
  tint?: string;
  /** Color del filo luminoso de la tarjeta. */
  edge?: string;
  onPress?: () => void;
  style?: object;
};

function MiniMapBase({
  position,
  heading,
  path,
  accuracy,
  tint = colors.electric,
  edge = colors.electric,
  onPress,
  style,
}: Props) {
  const mapRef = useRef<MapView | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  // La cámara arranca en la primera posición conocida; después se anima.
  const [initial] = useState(() => ({ position, heading: heading ?? 0 }));
  const [firstFix, setFirstFix] = useState<LatLng | null>(initial.position);
  if (firstFix == null && position != null) setFirstFix(position);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: width, h: height });
  };

  const shownHeading = heading ?? 0;

  useEffect(() => {
    if (!ready || !position || !mapRef.current) return;
    mapRef.current.animateCamera(
      { center: position, heading: shownHeading, pitch: PITCH },
      // Casi un segundo: empalma con la siguiente lectura del GPS y el mapa
      // se desliza sin tirones.
      { duration: 950 }
    );
  }, [position, shownHeading, ready]);

  const route = useMemo(() => path.map((p) => ({ latitude: p.lat, longitude: p.lon })), [path]);

  // El mapa es más alto que la tarjeta y sobresale por abajo (recortado): así
  // su centro, que es donde está el carro, cae en el tercio inferior.
  const mapHeight = box.h * ARROW_AT * 2;
  const bars = accuracy == null ? 0 : accuracy <= 8 ? 3 : accuracy <= 20 ? 2 : 1;
  const signalTint = bars === 3 ? colors.lime : bars === 2 ? colors.amber : bars === 1 ? colors.danger : colors.textFaint;

  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      style={[styles.card, { borderColor: `${edge}55` }, style]}
      accessibilityRole="button"
      accessibilityLabel="Mapa. Toca para abrirlo completo"
    >
      {firstFix && box.h > 0 ? (
        <View style={[styles.mapWrap, { height: mapHeight }]} pointerEvents="none">
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            mapType="mutedStandard"
            userInterfaceStyle="dark"
            initialCamera={{
              center: firstFix,
              heading: initial.heading,
              pitch: PITCH,
              altitude: ALTITUDE_M,
              zoom: 16.5,
            }}
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
            // El aviso legal de Apple sube para que no lo tape el recorte inferior.
            legalLabelInsets={{ top: 0, left: 0, right: 8, bottom: mapHeight - box.h + 6 }}
          >
            {route.length > 1 && (
              <>
                <Polyline coordinates={route} strokeColor={`${tint}55`} strokeWidth={10} lineCap="round" lineJoin="round" />
                <Polyline coordinates={route} strokeColor={tint} strokeWidth={4} lineCap="round" lineJoin="round" />
              </>
            )}
          </MapView>
        </View>
      ) : (
        <View style={styles.waiting}>
          <Ionicons name="navigate-circle-outline" size={22} color={colors.textFaint} />
          <Text style={styles.waitingText}>Buscando tu posición…</Text>
        </View>
      )}

      {/* Viñeta: funde los bordes del mapa con el tablero */}
      <LinearGradient
        colors={[colors.bg, 'rgba(10,10,11,0)']}
        style={styles.fadeTop}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(10,10,11,0)', 'rgba(10,10,11,0.85)']}
        style={styles.fadeBottom}
        pointerEvents="none"
      />
      {/* Filos luminosos a los lados */}
      <LinearGradient
        colors={[`${edge}00`, `${edge}66`, `${edge}00`]}
        style={[styles.edge, { left: 0 }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={[`${edge}00`, `${edge}66`, `${edge}00`]}
        style={[styles.edge, { right: 0 }]}
        pointerEvents="none"
      />

      {/* El carro: flecha fija; el mapa se mueve debajo */}
      {firstFix && box.h > 0 && (
        <View
          pointerEvents="none"
          style={[styles.arrow, { left: box.w / 2 - 22, top: box.h * ARROW_AT - 22 }]}
        >
          <Svg width={44} height={44} viewBox="0 0 44 44">
            <Circle cx="22" cy="22" r="20" fill={tint} fillOpacity={0.14} />
            <Circle cx="22" cy="22" r="13" fill={tint} fillOpacity={0.22} />
            <Path
              d="M 22 8 L 33 34 L 22 28 L 11 34 Z"
              fill={tint}
              stroke="#FFFFFF"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      )}

      {/* Norte: gira al revés que el mapa, así siempre señala el norte real */}
      <View style={styles.north} pointerEvents="none">
        <View style={{ transform: [{ rotate: `${-shownHeading}deg` }] }}>
          <Ionicons name="navigate" size={13} color={colors.text} style={styles.northIcon} />
        </View>
        <Text style={styles.northText}>N</Text>
      </View>

      <View style={styles.chip} pointerEvents="none">
        <Ionicons name="location" size={13} color={tint} />
        <Text style={styles.chipText}>GPS</Text>
      </View>

      {/* Señal: tres barras según la precisión del GPS */}
      <View style={styles.signal} pointerEvents="none">
        {[1, 2, 3].map((n) => (
          <View
            key={n}
            style={[
              styles.bar,
              { height: 4 + n * 4, backgroundColor: n <= bars ? signalTint : colors.textFaint },
            ]}
          />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  mapWrap: { position: 'absolute', left: 0, right: 0, top: 0 },
  waiting: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 6 },
  waitingText: { fontSize: 12, color: colors.textMuted, fontFamily: fonts.medium },
  fadeTop: { position: 'absolute', left: 0, right: 0, top: 0, height: '30%' },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '26%' },
  edge: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  arrow: { position: 'absolute', width: 44, height: 44 },
  north: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,11,0.72)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  // El ícono de Ionicons apunta arriba-derecha: se endereza 45° a la izquierda.
  northIcon: { transform: [{ rotate: '-45deg' }] },
  northText: { fontSize: 9, fontFamily: fonts.semibold, color: colors.text, marginTop: -2 },
  chip: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(10,10,11,0.72)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { fontSize: 12, fontFamily: fonts.medium, color: colors.text },
  signal: { position: 'absolute', right: 12, bottom: 10, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 4, borderRadius: 1.5 },
});

export const MiniMap = memo(MiniMapBase);
