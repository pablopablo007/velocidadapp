import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Badge,
  Divider,
  GlassCard,
  SectionTitle,
  StatGrid,
  StatTile,
} from '@/components/ui';
import { useSensors } from '@/state/SensorsContext';
import { useSettings } from '@/state/SettingsContext';
import { useTracking } from '@/state/TrackingContext';
import { colors, font, mono, radius, spacing, fonts } from '@/theme/theme';
import { useAccent } from '@/theme/accent';
import { altitudeEffect, compare0100 } from '@/utils/altitude';
import {
  formatAccel,
  formatDistance,
  formatNumber,
  formatStopwatch,
  speedUnitLabel,
  toDisplaySpeed,
} from '@/utils/format';

const TAB_BAR_SPACE = 78;

export default function ChronoScreen() {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { live, trip } = useTracking();

  const unit = settings.unit;
  const unitLabel = speedUnitLabel(unit);
  const vehicle = settings.vehicle;

  const best = live.perf;
  const lastRun = live.lastRun;

  // El dato de fábrica está medido al nivel del mar. Compararse contra él en
  // altura solo produce frustración, así que el objetivo se corrige primero.
  const { baro } = useSensors();
  const pressureKpa = baro.pressureHpa != null ? Math.round(baro.pressureHpa) / 10 : undefined;
  const effect = useMemo(() => {
    if (live.altitude == null) return null;
    return altitudeEffect(vehicle, Math.round(live.altitude / 50) * 50, settings.airTempC, pressureKpa);
  }, [vehicle, live.altitude, settings.airTempC, pressureKpa]);

  const verdict = useMemo(
    () => (effect ? compare0100(best.t0_100, effect) : null),
    [effect, best.t0_100]
  );

  const armed = live.speedKmh < 2;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: insets.bottom + TAB_BAR_SPACE,
        paddingHorizontal: spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.screenTitle}>Crono automático</Text>

      {/* ------------------ modo arrancada ------------------ */}
      <SectionTitle
        right={
          <Badge
            label={armed ? 'LISTO PARA ARRANCAR' : 'EN MOVIMIENTO'}
            tint={armed ? colors.lime : colors.textFaint}
          />
        }
      >
        Modo arrancada
      </SectionTitle>
      <GlassCard>
        <Text style={styles.dragHint}>
          Detén el carro por completo y acelera a fondo: la app cronometra sola cada umbral usando
          el GPS. No hace falta tocar nada.
        </Text>
        <View style={styles.dragLive}>
          <Text style={[styles.dragLiveValue, { color: accent.accent }]} allowFontScaling={false}>
            {formatNumber(toDisplaySpeed(live.speedKmh, unit))}
          </Text>
          <Text style={styles.dragLiveUnit}>{unitLabel}</Text>
        </View>
      </GlassCard>

      <SectionTitle>Desde parado</SectionTitle>
      <StatGrid>
        <StatTile
          label="0 → 100 km/h"
          value={formatAccel(best.t0_100)}
          icon="rocket-outline"
          tint={best.t0_100 != null ? colors.lime : colors.textFaint}
        />
        <StatTile
          label="0 → 60 km/h"
          value={formatAccel(best.t0_60)}
          icon="rocket-outline"
        />
        <StatTile
          label="100 → 0 frenada"
          value={formatAccel(best.t100_0)}
          icon="stop-circle-outline"
          tint={best.t100_0 != null ? colors.danger : colors.textFaint}
        />
        <StatTile label="201 m (⅛ milla)" value={formatAccel(best.t201m)} icon="flag-outline" />
        <StatTile label="402 m (¼ milla)" value={formatAccel(best.t402m)} icon="flag-outline" />
        <StatTile
          label="Vel. en meta"
          value={
            best.vTrap != null
              ? `${formatNumber(toDisplaySpeed(best.vTrap, unit))} ${unitLabel}`
              : '—'
          }
          icon="speedometer-outline"
        />
      </StatGrid>

      <SectionTitle right={<Badge label="SIN DETENERTE" tint={accent.accent} />}>
        Recuperaciones en marcha
      </SectionTitle>
      <StatGrid>
        <StatTile
          label="60 → 100 km/h"
          value={formatAccel(best.roll60_100)}
          icon="trending-up-outline"
          tint={best.roll60_100 != null ? accent.accent : colors.textFaint}
        />
        <StatTile
          label="80 → 120 km/h"
          value={formatAccel(best.roll80_120)}
          icon="trending-up-outline"
          tint={best.roll80_120 != null ? accent.accent : colors.textFaint}
        />
        <StatTile
          label="60 → 100 en arrancada"
          value={formatAccel(best.t60_100)}
          icon="rocket-outline"
          compact
        />
      </StatGrid>
      <Text style={styles.footnote}>
        Vas circulando, pisas a fondo y el crono corre solo. Es la medida que describe cómo
        adelanta el carro de verdad: casi nunca sales a fondo desde parado, pero sí rebasas en
        carretera.
      </Text>

      {effect && (
        <>
          <SectionTitle right={<Badge label="SAE J1349" tint={colors.amber} />}>
            Objetivo a tu altitud
          </SectionTitle>
          <GlassCard>
            <View style={styles.targetRow}>
              <View>
                <Text style={styles.targetLabel}>0-100 ESPERADO AQUÍ</Text>
                <Text style={styles.targetValue}>
                  {effect.target0100Min.toFixed(1).replace('.', ',')} –{' '}
                  {effect.target0100Max.toFixed(1).replace('.', ',')}
                  <Text style={styles.targetUnit}> s</Text>
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.targetPower}>{Math.round(effect.powerCv)} CV</Text>
                <Text style={styles.targetHint}>
                  a {Math.round(effect.altitudeM)} m · −{effect.lossPct.toFixed(0)} %
                </Text>
              </View>
            </View>
            <Text style={styles.targetNote}>
              Fábrica declara {vehicle.accel0100Factory.toFixed(1).replace('.', ',')} s, pero medido
              al nivel del mar. Tu motor es atmosférico y aquí dispone de{' '}
              {Math.round(effect.powerCv)} de sus {vehicle.powerCv} CV, así que este es el rango
              contra el que tiene sentido compararte.
            </Text>
          </GlassCard>
        </>
      )}

      {verdict && (
        <View
          style={[
            styles.deltaCard,
            { borderColor: verdict.verdict !== 'peor' ? `${colors.lime}55` : `${colors.amber}55` },
          ]}
        >
          <Ionicons
            name={verdict.verdict !== 'peor' ? 'trophy' : 'information-circle'}
            size={18}
            color={verdict.verdict !== 'peor' ? colors.lime : colors.amber}
          />
          <Text style={styles.deltaText}>
            {verdict.verdict === 'mejor' &&
              `Tu ${formatAccel(best.t0_100)} está ${verdict.deltaSeconds.toFixed(2).replace('.', ',')} s por debajo del rango esperado a esta altitud.`}
            {verdict.verdict === 'dentro' &&
              `Tu ${formatAccel(best.t0_100)} cae justo en lo que cabe esperar del carro aquí arriba.`}
            {verdict.verdict === 'peor' &&
              `Tu ${formatAccel(best.t0_100)} está ${verdict.deltaSeconds.toFixed(2).replace('.', ',')} s por encima del rango esperado. Suele ser el peso a bordo, la pendiente del tramo o una salida poco limpia.`}
          </Text>
        </View>
      )}

      {lastRun && (
        <>
          <SectionTitle>Última pasada</SectionTitle>
          <GlassCard padded={false}>
            <PassRow label="0 → 60 km/h" value={formatAccel(lastRun.t0_60)} />
            <Divider />
            <PassRow label="0 → 100 km/h" value={formatAccel(lastRun.t0_100)} />
            <Divider />
            <PassRow label="201 m" value={formatAccel(lastRun.t201m)} />
            <Divider />
            <PassRow label="402 m" value={formatAccel(lastRun.t402m)} />
          </GlassCard>
        </>
      )}

      {/* ------------------ tramo en curso ------------------ */}
      {trip && (
        <>
          <SectionTitle right={<Badge label="EN CURSO" tint={colors.danger} />}>
            Tramo actual
          </SectionTitle>
          <StatGrid>
            <StatTile
              label="Recorrido"
              value={formatDistance(trip.distanceM, unit)}
              icon="trail-sign-outline"
              tint={accent.accent}
              compact
            />
            <StatTile
              label="En marcha"
              value={formatStopwatch(trip.movingMs).split('.')[0]}
              icon="car-outline"
              compact
            />
            <StatTile
              label="Detenido"
              value={formatStopwatch(trip.stoppedMs).split('.')[0]}
              icon="hourglass-outline"
              tint={colors.textMuted}
              compact
            />
          </StatGrid>
        </>
      )}

      <Text style={styles.footnote}>
        El GPS entrega una lectura por segundo; los cruces de umbral se interpolan entre lecturas,
        así que el margen de error típico es de una a dos décimas.
      </Text>
    </ScrollView>
  );
}

function PassRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.passRow}>
      <Text style={styles.passLabel}>{label}</Text>
      <Text style={styles.passValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenTitle: { ...font.title, fontSize: 30, color: colors.text, marginBottom: spacing.lg },

  chronoCard: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl },
  chronoValue: {
    fontSize: 52,
    fontFamily: fonts.medium,
    color: colors.text,
    letterSpacing: -1.5,
  },
  chronoButtons: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },

  lapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
  },
  lapIndex: { width: 42, color: colors.textFaint, fontSize: 13, fontWeight: '700' },
  lapSplit: { flex: 1, color: colors.text, fontFamily: mono, fontSize: 16 },
  lapTotal: { color: colors.textFaint, fontFamily: mono, fontSize: 13 },

  dragHint: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  dragLive: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  dragLiveValue: {
    fontSize: 46,
    fontFamily: fonts.medium,
  },
  dragLiveUnit: { fontSize: 14, color: colors.textMuted, fontWeight: '700' },

  targetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  targetLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: colors.textFaint },
  targetValue: {
    fontSize: 30,
    fontFamily: fonts.medium,
    color: colors.text,
    marginTop: 3,
  },
  targetUnit: { fontSize: 14, color: colors.textMuted, fontWeight: '700' },
  targetPower: { fontSize: 20, fontWeight: '700', color: colors.amber },
  targetHint: { fontSize: 10, color: colors.textFaint, fontFamily: mono, marginTop: 3 },
  targetNote: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginTop: spacing.md },

  deltaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  deltaText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 18 },

  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
  },
  passLabel: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  passValue: { fontSize: 16, color: colors.text, fontFamily: mono },

  footnote: {
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 16,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
});
