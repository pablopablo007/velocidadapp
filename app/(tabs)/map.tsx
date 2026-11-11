import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpeedTrace } from '@/components/SpeedTrace';
import { Badge } from '@/components/ui';
import { MapStyle, useSettings } from '@/state/SettingsContext';
import { useTracking } from '@/state/TrackingContext';
import { colors, fonts, mono, radius, spacing, speedColor } from '@/theme/theme';
import { useAccent } from '@/theme/accent';
import {
  formatDistance,
  formatDuration,
  formatNumber,
  speedUnitLabel,
  toDisplaySpeed,
} from '@/utils/format';
import { regionForPoints } from '@/utils/geo';

const TAB_BAR_SPACE = 78;
const MAP_STYLES: MapStyle[] = ['mutedStandard', 'standard', 'hybrid'];
const MAP_STYLE_ICON: Record<MapStyle, React.ComponentProps<typeof Ionicons>['name']> = {
  mutedStandard: 'moon-outline',
  standard: 'map-outline',
  hybrid: 'globe-outline',
};

export default function MapScreen() {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { settings, update } = useSettings();
  // El viaje se controla solo desde Velocidad: aquí se ve, no se maneja.
  const { status, live, trip, path, position, overLimit } = useTracking();

  const mapRef = useRef<MapView | null>(null);
  const [following, setFollowing] = useState(true);
  const [ready, setReady] = useState(false);

  const unit = settings.unit;
  const unitLabel = speedUnitLabel(unit);
  const shown = trip ?? live;

  // Cámara persiguiendo al carro. Con "rumbo arriba" el mapa gira contigo, que
  // es lo cómodo al conducir; si no, se queda al norte.
  useEffect(() => {
    if (!following || !ready || !position || !mapRef.current) return;
    const heading = settings.followHeading && live.speedKmh > 8 ? (live.heading ?? 0) : 0;
    mapRef.current.animateCamera(
      {
        center: position,
        heading,
        pitch: settings.followHeading && live.speedKmh > 8 ? 45 : 0,
      },
      { duration: 900 }
    );
  }, [position, following, ready, settings.followHeading, live.heading, live.speedKmh]);

  const recenter = useCallback(() => {
    setFollowing(true);
    if (position && mapRef.current) {
      mapRef.current.animateCamera({ center: position, zoom: 16 }, { duration: 500 });
    }
  }, [position]);

  const fitTrip = useCallback(() => {
    if (path.length < 2 || !mapRef.current) return;
    setFollowing(false);
    const region = regionForPoints(
      path.map((p) => ({ latitude: p.lat, longitude: p.lon }))
    );
    if (region) mapRef.current.animateToRegion(region, 700);
  }, [path]);

  const cycleMapStyle = useCallback(() => {
    const i = MAP_STYLES.indexOf(settings.mapStyle);
    update({ mapStyle: MAP_STYLES[(i + 1) % MAP_STYLES.length] });
  }, [settings.mapStyle, update]);

  const startPoint = path.length > 0 ? path[0] : null;
  const speedTint = overLimit ? colors.danger : speedColor(live.speedKmh);

  return (
    <View style={styles.screen}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        mapType={settings.mapStyle}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsTraffic={false}
        userInterfaceStyle="dark"
        pitchEnabled
        rotateEnabled
        onMapReady={() => setReady(true)}
        // Cualquier gesto del usuario suelta la cámara: nada más molesto que un
        // mapa que se recentra solo mientras lo estás moviendo.
        onPanDrag={() => setFollowing(false)}
        initialRegion={
          position
            ? { ...position, latitudeDelta: 0.01, longitudeDelta: 0.01 }
            : undefined
        }
      >
        <SpeedTrace points={path} width={6} />
        {startPoint && (
          <Marker
            coordinate={{ latitude: startPoint.lat, longitude: startPoint.lon }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.startMarker} />
          </Marker>
        )}
      </MapView>

      {/* ------------------- HUD superior ------------------- */}
      <View style={[styles.hud, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <BlurView intensity={40} tint="dark" style={styles.hudCard}>
          <Text style={[styles.hudSpeed, { color: speedTint }]} allowFontScaling={false}>
            {formatNumber(toDisplaySpeed(live.speedKmh, unit))}
          </Text>
          <View>
            <Text style={styles.hudUnit}>{unitLabel}</Text>
            <Text style={styles.hudAlt}>
              {live.altitude != null ? `${Math.round(live.altitude)} m` : '— m'}
            </Text>
          </View>
        </BlurView>

        {status !== 'idle' && (
          <Badge
            label={status === 'recording' ? '● GRABANDO' : '❚❚ PAUSA'}
            tint={status === 'recording' ? colors.danger : colors.amber}
          />
        )}
      </View>

      {/* ------------------- botones flotantes ------------------- */}
      <View
        style={[styles.sideButtons, { bottom: insets.bottom + TAB_BAR_SPACE + 150 }]}
        pointerEvents="box-none"
      >
        <FloatingButton
          icon={following ? 'locate' : 'locate-outline'}
          active={following}
          onPress={recenter}
        />
        <FloatingButton icon={MAP_STYLE_ICON[settings.mapStyle]} onPress={cycleMapStyle} />
        <FloatingButton
          icon="compass"
          active={settings.followHeading}
          onPress={() => update({ followHeading: !settings.followHeading })}
        />
        {path.length > 1 && <FloatingButton icon="scan-outline" onPress={fitTrip} />}
      </View>

      {/* ------------------- panel inferior ------------------- */}
      <BlurView
        intensity={60}
        tint="dark"
        style={[styles.panel, { paddingBottom: insets.bottom + TAB_BAR_SPACE }]}
      >
        <View style={styles.panelStats}>
          <PanelStat label="Distancia" value={formatDistance(shown.distanceM, unit)} />
          <PanelStat label="Tiempo" value={formatDuration(shown.durationMs)} />
          <PanelStat
            label="Máxima"
            value={`${formatNumber(toDisplaySpeed(shown.maxSpeedKmh, unit))}`}
            tint={accent.accent}
          />
          <PanelStat
            label="Desnivel"
            value={`↑${Math.round(shown.elevGain)} ↓${Math.round(shown.elevLoss)}`}
            tint={colors.descent}
          />
        </View>

        <Text style={styles.panelHint}>
          {status !== 'idle'
            ? 'El viaje se pausa y se termina desde la pestaña Velocidad.'
            : settings.autoTrips
              ? 'Viaje automático: empieza solo al arrancar.'
              : 'Inicia el viaje desde la pestaña Velocidad.'}
        </Text>
      </BlurView>
    </View>
  );
}

function FloatingButton({
  icon,
  onPress,
  active = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  active?: boolean;
}) {
  const accent = useAccent();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
      <BlurView intensity={40} tint="dark" style={styles.fab}>
        <Ionicons name={icon} size={20} color={active ? accent.accent : colors.text} />
      </BlurView>
    </Pressable>
  );
}

function PanelStat({ label, value, tint = colors.text }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.panelStat}>
      <Text style={styles.panelStatLabel}>{label.toLowerCase()}</Text>
      <Text style={[styles.panelStatValue, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  hud: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  hudCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(10,10,11,0.55)',
  },
  hudSpeed: { fontSize: 42, fontFamily: fonts.medium, letterSpacing: -1 },
  hudUnit: { fontSize: 11, color: colors.textMuted, fontWeight: '700', letterSpacing: 1 },
  hudAlt: { fontSize: 11, color: colors.textFaint, fontFamily: mono, marginTop: 2 },

  sideButtons: { position: 'absolute', right: spacing.lg, gap: spacing.sm },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(10,10,11,0.6)',
  },

  startMarker: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.lime,
    borderWidth: 2.5,
    borderColor: colors.bg,
  },

  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(10,10,11,0.7)',
    gap: spacing.md,
  },
  panelStats: { flexDirection: 'row', gap: spacing.sm },
  panelStat: { flex: 1 },
  panelStatLabel: { fontSize: 11, fontWeight: '500', color: colors.textMuted },
  panelStatValue: { fontSize: 18, fontFamily: fonts.medium, marginTop: 2 },
  panelHint: { fontSize: 11, color: colors.textMuted, textAlign: 'center' },
});
