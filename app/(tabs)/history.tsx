import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DailyBars } from '@/components/charts';
import {
  Badge,
  EmptyState,
  GlassCard,
  SectionTitle,
  StatGrid,
  StatTile,
} from '@/components/ui';
import {
  Totals,
  TripSummary,
  deleteTrip,
  getDailyDistance,
  getTotals,
  listTrips,
} from '@/services/database';
import { useSettings } from '@/state/SettingsContext';
import { colors, font, mono, radius, spacing, speedColor, fonts } from '@/theme/theme';
import { useAccent } from '@/theme/accent';
import {
  distanceUnitLabel,
  formatAccel,
  formatDistance,
  formatDuration,
  formatNumber,
  formatTripDate,
  speedUnitLabel,
  toDisplayDistanceKm,
  toDisplaySpeed,
} from '@/utils/format';

const TAB_BAR_SPACE = 78;

export default function HistoryScreen() {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings } = useSettings();

  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [daily, setDaily] = useState<{ day: string; km: number }[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const unit = settings.unit;
  const unitLabel = speedUnitLabel(unit);
  const distLabel = distanceUnitLabel(unit);

  const load = useCallback(async () => {
    const [t, agg, bars] = await Promise.all([listTrips(), getTotals(), getDailyDistance(14)]);
    setTrips(t);
    setTotals(agg);
    setDaily(bars);
    setLoaded(true);
  }, []);

  // Recarga al volver a la pestaña: puede haber un viaje nuevo recién guardado.
  useFocusEffect(
    useCallback(() => {
      load().catch(() => setLoaded(true));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => {});
    setRefreshing(false);
  }, [load]);

  const confirmDelete = useCallback(
    (trip: TripSummary) => {
      Alert.alert('Eliminar viaje', `Se borrará "${routeLabel(trip)}" del historial.`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await deleteTrip(trip.id).catch(() => {});
            load().catch(() => {});
          },
        },
      ]);
    },
    [load]
  );

  const header = (
    <View>
      <Text style={styles.screenTitle}>Historial</Text>

      {totals && totals.trips > 0 && (
        <>
          <SectionTitle right={<Badge label={`${totals.trips} VIAJES`} />}>Resumen</SectionTitle>
          <StatGrid>
            <StatTile
              label="Distancia total"
              value={formatNumber(toDisplayDistanceKm(totals.distanceM / 1000, unit), 1)}
              unit={distLabel}
              icon="trail-sign-outline"
              tint={accent.accent}
            />
            <StatTile
              label="Al volante"
              value={formatDuration(totals.movingMs, true)}
              icon="time-outline"
            />
            <StatTile
              label="Récord de velocidad"
              value={formatNumber(toDisplaySpeed(totals.maxSpeedKmh, unit))}
              unit={unitLabel}
              icon="flash-outline"
              tint={colors.lime}
            />
            <StatTile
              label="Ascenso total"
              value={formatNumber(totals.elevGain)}
              unit="m"
              icon="arrow-up"
              tint={colors.ascent}
            />
            <StatTile
              label="Descenso total"
              value={formatNumber(totals.elevLoss)}
              unit="m"
              icon="arrow-down"
              tint={colors.descent}
            />
          </StatGrid>

          <SectionTitle>Últimos 14 días</SectionTitle>
          <GlassCard>
            <DailyBars
              data={daily.map((d) => ({ ...d, km: toDisplayDistanceKm(d.km, unit) }))}
              unitLabel={distLabel}
            />
          </GlassCard>

          <SectionTitle>Récords</SectionTitle>
          <StatGrid>
            <StatTile
              label="Máxima sostenida"
              value={formatNumber(toDisplaySpeed(totals.bestSustainedKmh, unit))}
              unit={unitLabel}
              icon="shield-checkmark-outline"
              tint={totals.bestSustainedKmh > 0 ? colors.lime : colors.textFaint}
              compact
            />
            <StatTile
              label="0 → 100 km/h"
              value={formatAccel(totals.best0_100)}
              icon="rocket-outline"
              tint={totals.best0_100 != null ? colors.lime : colors.textFaint}
              compact
            />
            <StatTile
              label="0 → 60 km/h"
              value={formatAccel(totals.best0_60)}
              icon="rocket-outline"
              compact
            />
            <StatTile
              label="100 → 0"
              value={formatAccel(totals.best100_0)}
              icon="stop-circle-outline"
              compact
            />
            <StatTile
              label="402 m"
              value={formatAccel(totals.best402m)}
              icon="flag-outline"
              compact
            />
            <StatTile
              label="60 → 100 en marcha"
              value={formatAccel(totals.bestRoll60_100)}
              icon="trending-up-outline"
              tint={totals.bestRoll60_100 != null ? accent.accent : colors.textFaint}
              compact
            />
            <StatTile
              label="80 → 120 en marcha"
              value={formatAccel(totals.bestRoll80_120)}
              icon="trending-up-outline"
              tint={totals.bestRoll80_120 != null ? accent.accent : colors.textFaint}
              compact
            />
            <StatTile
              label="Total sobre el límite"
              value={formatDuration(totals.overLimitMs, true)}
              icon="warning-outline"
              tint={totals.overLimitMs > 0 ? colors.danger : colors.textMuted}
              compact
            />
          </StatGrid>
        </>
      )}

      {trips.length > 0 && <SectionTitle>Viajes</SectionTitle>}
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      data={trips}
      keyExtractor={(t) => t.id}
      ListHeaderComponent={header}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + TAB_BAR_SPACE,
        paddingHorizontal: spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent.accent} />
      }
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      ListEmptyComponent={
        loaded ? (
          <EmptyState
            icon="map-outline"
            title="Todavía no hay viajes"
            message="Pulsa «Iniciar viaje» en la pestaña Velocidad y el recorrido aparecerá aquí al terminar."
          />
        ) : undefined
      }
      renderItem={({ item }) => (
        <TripCard
          trip={item}
          unit={unit}
          onPress={() => router.push(`/trip/${item.id}`)}
          onLongPress={() => confirmDelete(item)}
        />
      )}
    />
  );
}

function routeLabel(trip: TripSummary): string {
  if (trip.startLabel && trip.endLabel && trip.startLabel !== trip.endLabel) {
    return `${trip.startLabel} → ${trip.endLabel}`;
  }
  return trip.startLabel ?? trip.endLabel ?? 'Viaje sin nombre';
}

function TripCard({
  trip,
  unit,
  onPress,
  onLongPress,
}: {
  trip: TripSummary;
  unit: 'kmh' | 'mph';
  onPress: () => void;
  onLongPress: () => void;
}) {
  const unitLabel = speedUnitLabel(unit);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.tripCard, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.tripHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.tripRoute} numberOfLines={1}>
            {routeLabel(trip)}
          </Text>
          <Text style={styles.tripDate}>{formatTripDate(trip.startedAt)}</Text>
        </View>
        <View
          style={[
            styles.tripSpeedChip,
            { backgroundColor: `${speedColor(trip.maxSpeedKmh)}22` },
          ]}
        >
          <Text style={[styles.tripSpeedValue, { color: speedColor(trip.maxSpeedKmh) }]}>
            {formatNumber(toDisplaySpeed(trip.maxSpeedKmh, unit))}
          </Text>
          <Text style={styles.tripSpeedUnit}>{unitLabel} máx</Text>
        </View>
      </View>

      <View style={styles.tripStats}>
        <TripStat icon="trail-sign-outline" value={formatDistance(trip.distanceM, unit)} />
        <TripStat icon="time-outline" value={formatDuration(trip.durationMs)} />
        <TripStat
          icon="analytics-outline"
          value={`${formatNumber(toDisplaySpeed(trip.avgMovingKmh, unit))} ${unitLabel}`}
        />
        <TripStat
          icon="swap-vertical-outline"
          value={`↑${Math.round(trip.elevGain)} ↓${Math.round(trip.elevLoss)} m`}
        />
      </View>

      {trip.perf.t0_100 != null && (
        <View style={styles.tripBadgeRow}>
          <Badge label={`0-100 en ${formatAccel(trip.perf.t0_100)}`} tint={colors.lime} />
        </View>
      )}
    </Pressable>
  );
}

function TripStat({
  icon,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: string;
}) {
  return (
    <View style={styles.tripStat}>
      <Ionicons name={icon} size={12} color={colors.textFaint} />
      <Text style={styles.tripStatValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenTitle: { ...font.title, fontSize: 30, color: colors.text },

  costCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  costLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: colors.textFaint },
  costValue: {
    fontSize: 30,
    fontFamily: fonts.medium,
    color: colors.text,
    marginTop: 4,
  },
  costSide: { alignItems: 'flex-end' },
  costSideLabel: { fontSize: 13, color: colors.amber, fontWeight: '700' },
  costSideHint: { fontSize: 11, color: colors.textFaint, fontFamily: mono, marginTop: 3 },

  tripCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  tripHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  tripRoute: { fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  tripDate: { fontSize: 12, color: colors.textFaint, marginTop: 3 },
  tripSpeedChip: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    minWidth: 66,
  },
  tripSpeedValue: { fontSize: 20, fontFamily: fonts.medium },
  tripSpeedUnit: { fontSize: 9, color: colors.textFaint, fontWeight: '700' },

  tripStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tripStat: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  tripStatValue: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },

  tripBadgeRow: { flexDirection: 'row', gap: spacing.sm },
});
