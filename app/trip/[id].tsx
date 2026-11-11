import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ElevationChart, SpeedChart, SpeedHistogram } from '@/components/charts';
import { SpeedTrace } from '@/components/SpeedTrace';
import {
  Badge,
  EmptyState,
  GlassCard,
  SectionTitle,
  StatGrid,
  StatTile,
} from '@/components/ui';
import { Trip, deleteTrip, getTrip } from '@/services/database';
import { HIST_BIN_KMH, analyzePoints } from '@/services/speedStats';
import { useSettings } from '@/state/SettingsContext';
import { colors, font, spacing, fonts } from '@/theme/theme';
import { useAccent } from '@/theme/accent';
import { DEFAULT_VEHICLE_ID } from '@/vehicles';
import { altitudeEffect } from '@/utils/altitude';
import {
  formatAccel,
  formatDistance,
  formatDuration,
  formatNumber,
  formatTripDate,
  speedUnitLabel,
  toDisplaySpeed,
} from '@/utils/format';
import { regionForPoints } from '@/utils/geo';

export default function TripDetailScreen() {
  const accent = useAccent();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);

  const unit = settings.unit;
  // El análisis usa la ficha del carro con el que se hizo el viaje, no la del
  // que esté activo ahora. Los viajes sin vehículo son anteriores al Gol: del Polo.
  const tripVehicle =
    settings.vehicles[trip?.vehicleId ?? DEFAULT_VEHICLE_ID] ?? settings.vehicles[DEFAULT_VEHICLE_ID];
  const unitLabel = speedUnitLabel(unit);

  useEffect(() => {
    let alive = true;
    (async () => {
      const t = id ? await getTrip(id).catch(() => null) : null;
      if (alive) {
        setTrip(t);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const region = useMemo(() => {
    if (!trip || trip.points.length === 0) return null;
    return regionForPoints(trip.points.map((p) => ({ latitude: p.lat, longitude: p.lon })));
  }, [trip]);

  // Los viajes grabados antes de que existiera este análisis no lo tienen
  // guardado, así que se reconstruye desde la traza.
  const analysis = useMemo(() => {
    if (!trip) return null;
    if (trip.analysis) return trip.analysis;
    if (trip.points.length < 2) return null;
    return analyzePoints(trip.points, settings.speedLimit);
  }, [trip, settings.speedLimit]);

  const effect = useMemo(() => {
    const alt = analysis?.medianAltitude ?? trip?.maxAlt ?? null;
    if (alt == null) return null;
    return altitudeEffect(tripVehicle, Math.round(alt / 50) * 50);
  }, [analysis, trip, tripVehicle]);

  const confirmDelete = () => {
    if (!trip) return;
    Alert.alert('Eliminar viaje', 'Se borrará del historial. No se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteTrip(trip.id).catch(() => {});
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={accent.accent} />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <EmptyState
          icon="alert-circle-outline"
          title="Viaje no encontrado"
          message="Puede que se haya eliminado del historial."
        />
      </View>
    );
  }

  const first = trip.points[0];
  const last = trip.points[trip.points.length - 1];
  const stoppedMs = Math.max(0, trip.durationMs - trip.movingMs);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* ------------------- mapa del recorrido ------------------- */}
        <View style={styles.mapWrap}>
          {region && (
            <MapView
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              mapType={settings.mapStyle}
              userInterfaceStyle="dark"
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <SpeedTrace points={trip.points} width={5} />
              {first && (
                <Marker
                  coordinate={{ latitude: first.lat, longitude: first.lon }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                >
                  <View style={[styles.marker, { backgroundColor: colors.lime }]} />
                </Marker>
              )}
              {last && (
                <Marker
                  coordinate={{ latitude: last.lat, longitude: last.lon }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                >
                  <View style={[styles.marker, { backgroundColor: colors.danger }]} />
                </Marker>
              )}
            </MapView>
          )}

          <Pressable
            onPress={() => router.back()}
            style={[styles.backButton, { top: insets.top + spacing.sm }]}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>

          <Pressable
            onPress={confirmDelete}
            style={[styles.deleteButton, { top: insets.top + spacing.sm }]}
            hitSlop={10}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>

        <View style={styles.body}>
          {/* ------------------- ruta ------------------- */}
          <Text style={styles.date}>{formatTripDate(trip.startedAt)}</Text>
          <View style={styles.routeBlock}>
            <RoutePoint
              tint={colors.lime}
              label={trip.startLabel ?? 'Punto de partida'}
              time={new Date(trip.startedAt).toLocaleTimeString('es', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            />
            <View style={styles.routeLine} />
            <RoutePoint
              tint={colors.danger}
              label={trip.endLabel ?? 'Punto de llegada'}
              time={new Date(trip.endedAt).toLocaleTimeString('es', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            />
          </View>

          {/* ------------------- resumen ------------------- */}
          <SectionTitle>Resumen</SectionTitle>
          <StatGrid>
            <StatTile
              label="Distancia"
              value={formatDistance(trip.distanceM, unit)}
              icon="trail-sign-outline"
              tint={accent.accent}
            />
            <StatTile
              label="Duración"
              value={formatDuration(trip.durationMs)}
              icon="time-outline"
            />
            <StatTile
              label="Velocidad máxima"
              value={formatNumber(toDisplaySpeed(trip.maxSpeedKmh, unit))}
              unit={unitLabel}
              icon="flash-outline"
              tint={colors.lime}
            />
            <StatTile
              label="Media total"
              value={formatNumber(toDisplaySpeed(trip.avgSpeedKmh, unit))}
              unit={unitLabel}
              icon="analytics-outline"
            />
            <StatTile
              label="Media en marcha"
              value={formatNumber(toDisplaySpeed(trip.avgMovingKmh, unit))}
              unit={unitLabel}
              icon="car-outline"
            />
            <StatTile
              label="Detenido"
              value={formatDuration(stoppedMs)}
              icon="hourglass-outline"
              tint={colors.textMuted}
            />
          </StatGrid>

          {/* ------------------- velocidad ------------------- */}
          <SectionTitle>Velocidad a lo largo del viaje</SectionTitle>
          <GlassCard>
            <SpeedChart points={trip.points} height={160} />
          </GlassCard>

          {analysis && (
            <>
              <SectionTitle right={<Badge label={`P85 ${Math.round(analysis.p85Kmh)}`} />}>
                A qué velocidad fuiste de verdad
              </SectionTitle>
              <GlassCard>
                <SpeedHistogram
                  histogram={analysis.histogram}
                  binKmh={HIST_BIN_KMH}
                  p85={analysis.p85Kmh}
                  height={160}
                />
              </GlassCard>
              <StatGrid>
                <StatTile
                  label="Máxima sostenida"
                  value={formatNumber(toDisplaySpeed(analysis.sustainedMaxKmh, unit))}
                  unit={unitLabel}
                  icon="shield-checkmark-outline"
                  tint={colors.lime}
                  compact
                />
                <StatTile
                  label="Percentil 85"
                  value={formatNumber(toDisplaySpeed(analysis.p85Kmh, unit))}
                  unit={unitLabel}
                  icon="stats-chart-outline"
                  tint={accent.accent}
                  compact
                />
                <StatTile
                  label="Mediana"
                  value={formatNumber(toDisplaySpeed(analysis.p50Kmh, unit))}
                  unit={unitLabel}
                  icon="git-commit-outline"
                  compact
                />
                <StatTile
                  label="Sobre el límite"
                  value={formatDuration(analysis.overLimitMs)}
                  icon="warning-outline"
                  tint={analysis.overLimitMs > 0 ? colors.danger : colors.textMuted}
                  compact
                />
              </StatGrid>
              <Text style={styles.footnote}>
                La máxima que aparece arriba ({formatNumber(toDisplaySpeed(trip.maxSpeedKmh, unit))}{' '}
                {unitLabel}) es el pico de una sola lectura del GPS. La sostenida es la mayor que
                mantuviste 5 segundos seguidos, y es la cifra en la que se puede confiar.
              </Text>
            </>
          )}

          {/* ------------------- altimetría ------------------- */}
          <SectionTitle
            right={
              <View style={styles.elevBadges}>
                <Text style={[styles.elevBadge, { color: colors.ascent }]}>
                  ↑ {Math.round(trip.elevGain)} m
                </Text>
                <Text style={[styles.elevBadge, { color: colors.descent }]}>
                  ↓ {Math.round(trip.elevLoss)} m
                </Text>
              </View>
            }
          >
            Perfil de elevación
          </SectionTitle>
          <GlassCard>
            <ElevationChart points={trip.points} height={160} />
            <View style={styles.elevSummary}>
              <ElevStat label="Mínima" value={trip.minAlt != null ? `${Math.round(trip.minAlt)} m` : '—'} />
              <ElevStat label="Máxima" value={trip.maxAlt != null ? `${Math.round(trip.maxAlt)} m` : '—'} />
              <ElevStat
                label="Desnivel neto"
                value={`${trip.elevGain - trip.elevLoss >= 0 ? '+' : ''}${Math.round(
                  trip.elevGain - trip.elevLoss
                )} m`}
              />
            </View>
          </GlassCard>

          {/* ------------------- prestaciones ------------------- */}
          {(trip.perf.t0_100 != null ||
            trip.perf.t0_60 != null ||
            trip.perf.t100_0 != null ||
            trip.perf.t402m != null) && (
            <>
              <SectionTitle right={<Badge label="MEDIDO POR GPS" tint={colors.lime} />}>
                Prestaciones del viaje
              </SectionTitle>
              <StatGrid>
                <StatTile
                  label="0 → 100 km/h"
                  value={formatAccel(trip.perf.t0_100)}
                  icon="rocket-outline"
                  tint={colors.lime}
                  compact
                />
                <StatTile
                  label="0 → 60 km/h"
                  value={formatAccel(trip.perf.t0_60)}
                  icon="rocket-outline"
                  compact
                />
                <StatTile
                  label="100 → 0"
                  value={formatAccel(trip.perf.t100_0)}
                  icon="stop-circle-outline"
                  compact
                />
                <StatTile
                  label="402 m"
                  value={formatAccel(trip.perf.t402m)}
                  icon="flag-outline"
                  compact
                />
                <StatTile
                  label="60 → 100 en marcha"
                  value={formatAccel(trip.perf.roll60_100)}
                  icon="trending-up-outline"
                  tint={trip.perf.roll60_100 != null ? accent.accent : colors.textFaint}
                  compact
                />
                <StatTile
                  label="80 → 120 en marcha"
                  value={formatAccel(trip.perf.roll80_120)}
                  icon="trending-up-outline"
                  tint={trip.perf.roll80_120 != null ? accent.accent : colors.textFaint}
                  compact
                />
              </StatGrid>
              {effect && (
                <Text style={styles.footnote}>
                  A los {Math.round(effect.altitudeM)} m de este viaje el motor dispuso de unos{' '}
                  {Math.round(effect.powerCv)} CV de sus {tripVehicle.powerCv}, así que el
                  0-100 esperable rondaba los{' '}
                  {effect.target0100Min.toFixed(1).replace('.', ',')}–
                  {effect.target0100Max.toFixed(1).replace('.', ',')} s.
                </Text>
              )}
            </>
          )}

        </View>
      </ScrollView>
    </View>
  );
}

function RoutePoint({ tint, label, time }: { tint: string; label: string; time: string }) {
  return (
    <View style={styles.routePoint}>
      <View style={[styles.routeDot, { backgroundColor: tint }]} />
      <Text style={styles.routeLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.routeTime}>{time}</Text>
    </View>
  );
}

function ElevStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.elevStatLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.elevStatValue}>{value}</Text>
    </View>
  );
}


const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },

  mapWrap: { height: 300, backgroundColor: colors.bgElevated },
  marker: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: colors.bg },
  backButton: {
    position: 'absolute',
    left: spacing.lg,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(5,7,11,0.7)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    position: 'absolute',
    right: spacing.lg,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(5,7,11,0.7)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  date: { fontSize: 12, color: colors.textFaint, fontWeight: '700', letterSpacing: 0.5 },

  routeBlock: { marginTop: spacing.md, marginBottom: spacing.sm },
  routePoint: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLabel: { flex: 1, ...font.body, color: colors.text },
  routeTime: { fontSize: 13, color: colors.textFaint },
  routeLine: {
    width: 1.5,
    height: 20,
    backgroundColor: colors.borderStrong,
    marginLeft: 4.5,
    marginVertical: 3,
  },

  elevBadges: { flexDirection: 'row', gap: spacing.md },
  elevBadge: { fontSize: 12, fontFamily: fonts.medium },
  elevSummary: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.sm },
  elevStatLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7, color: colors.textFaint },
  elevStatValue: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
    marginTop: 3,
  },

  fuelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
  },
  fuelLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  fuelValue: { fontSize: 15, fontFamily: fonts.medium },

  footnote: {
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 16,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
});
