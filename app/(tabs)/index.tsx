import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  ScrollViewInstance,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RunningCar } from '@/components/RunningCar';
import { ShiftLight } from '@/components/ShiftLight';
import { SpeedRibbon } from '@/components/SpeedRibbon';
import { Speedometer } from '@/components/Speedometer';
import {
  Badge,
  EmptyState,
  GlassCard,
  PrimaryButton,
  SectionTitle,
  StatGrid,
  StatTile,
} from '@/components/ui';
import { useSettings } from '@/state/SettingsContext';
import { useTracking } from '@/state/TrackingContext';
import { colors, font, gradeColor, mono, radius, spacing } from '@/theme/theme';
import { altitudeEffect, compare0100 } from '@/utils/altitude';
import {
  formatAccel,
  formatDistance,
  formatDuration,
  formatNumber,
  speedUnitLabel,
  toDisplaySpeed,
} from '@/utils/format';
import { cardinal } from '@/utils/geo';
import { estimateGearAndRpm, rollingCircumferenceM } from '@/vehicles/polo';

/**
 * Pantalla Velocidad, en dos páginas que se deslizan de lado:
 *
 * 1. CABINA: lo que se mira manejando. Cabe entera sin scroll, con la velocidad
 *    enorme, la marcha y tres datos. En horizontal (iPhone en el soporte) el
 *    dial va a la izquierda y los datos a la derecha.
 * 2. ANÁLISIS: todo el detalle de la sesión (estadística, altitud, potencia,
 *    prestaciones, dinámica). Es para mirar detenido, no en marcha.
 */
export default function SpeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const { settings } = useSettings();
  const {
    status,
    permission,
    gpsActive,
    live,
    trip,
    overLimit,
    savingTrip,
    requestPermission,
    start,
    pause,
    resume,
    stop,
    discard,
  } = useTracking();

  const unit = settings.unit;
  const unitLabel = speedUnitLabel(unit);
  const vehicle = settings.vehicle;

  // Escala del dial: la máxima del vehículo redondeada a la veintena de arriba.
  const gaugeMax = useMemo(() => {
    const top = toDisplaySpeed(vehicle.topSpeedKmh, unit);
    return Math.ceil(top / 20) * 20;
  }, [vehicle.topSpeedKmh, unit]);

  const shown = trip ?? live;
  const gear = useMemo(() => estimateGearAndRpm(vehicle, live.speedKmh), [vehicle, live.speedKmh]);

  // Potencia según la altitud, recalculada en escalones de 50 m.
  const altitude = live.altitude;
  const effect = useMemo(() => {
    if (altitude == null) return null;
    return altitudeEffect(vehicle, Math.round(altitude / 50) * 50);
  }, [vehicle, altitude]);

  const circumference = useMemo(() => rollingCircumferenceM(vehicle), [vehicle]);

  // ---- Paginado horizontal ----
  const pager = useRef<ScrollViewInstance>(null);
  const [page, setPage] = useState(0);
  const goTo = (p: number) => {
    pager.current?.scrollTo({ x: p * width, animated: true });
    setPage(p);
  };
  // Al girar el teléfono cambia el ancho de página: se recoloca en la que estaba.
  useEffect(() => {
    pager.current?.scrollTo({ x: page * width, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);
  const onPageEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));

  const handleStop = () => {
    Alert.alert('Finalizar viaje', '¿Guardar este viaje en el historial?', [
      { text: 'Seguir grabando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: discard },
      {
        text: 'Guardar',
        onPress: async () => {
          const id = await stop();
          if (id) router.push(`/trip/${id}`);
          else Alert.alert('Viaje descartado', 'El recorrido fue demasiado corto para guardarlo.');
        },
      },
    ]);
  };

  if (permission === 'denied') {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState
          icon="location-outline"
          title="Sin acceso al GPS"
          message="Activa la ubicación para Velocidad en Ajustes › Privacidad › Localización. Sin GPS no se puede medir la velocidad."
        />
      </View>
    );
  }

  if (permission === 'unknown') {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <EmptyState
          icon="navigate-circle-outline"
          title="Listo para arrancar"
          message="Velocidad necesita el GPS para medir tu velocidad, altitud y trazar el recorrido."
        />
        <PrimaryButton
          label="Permitir ubicación"
          icon="navigate"
          onPress={requestPermission}
          style={{ marginHorizontal: spacing.xl }}
        />
      </View>
    );
  }

  const accuracy = live.accuracy;
  const gpsQuality =
    !gpsActive || accuracy == null
      ? { label: 'BUSCANDO GPS', tint: colors.textFaint }
      : accuracy <= 8
        ? { label: 'GPS PRECISO', tint: colors.lime }
        : accuracy <= 20
          ? { label: 'GPS MEDIO', tint: colors.amber }
          : { label: 'GPS DÉBIL', tint: colors.danger };

  const grade = live.grade;
  const gradeLabel = grade > 0.8 ? 'SUBIDA' : grade < -0.8 ? 'BAJADA' : 'LLANO';

  // ---- Medidas de la cabina: todo tiene que caber sin scroll ----
  const padH = spacing.lg + (landscape ? Math.max(insets.left, insets.right) : 0);
  const usableH = height - insets.top - tabBarHeight;
  const usableW = width - padH * 2;
  // Reservas en vertical: cabecera 34, tira de cambio 30, datos 76, botones 54, márgenes ~56.
  const dialSize = landscape
    ? Math.min(usableH - spacing.md, usableW * 0.5)
    : Math.min(usableW, usableH - 250);

  // ---------------- Página 1: CABINA ----------------
  const header = (
    <View style={styles.header}>
      <View style={styles.statusLeft}>
        <View style={[styles.dot, { backgroundColor: gpsQuality.tint }]} />
        <Text style={[styles.statusText, { color: gpsQuality.tint }]}>{gpsQuality.label}</Text>
        {accuracy != null && <Text style={styles.statusDim}>±{Math.round(accuracy)} m</Text>}
      </View>
      {status === 'recording' && <Badge label="● GRABANDO" tint={colors.danger} />}
      {status === 'paused' && <Badge label="❚❚ EN PAUSA" tint={colors.amber} />}
      {status === 'idle' && (
        <Text style={styles.brand} numberOfLines={1}>
          {vehicle.nickname.toUpperCase()}
        </Text>
      )}
    </View>
  );

  const gearBlock = (
    <View style={styles.gearBox}>
      <Text style={styles.gearLabel}>MARCHA</Text>
      <Text style={styles.gearValue}>{gear?.gear ?? 'N'}</Text>
    </View>
  );

  const keyStats = (
    <View style={styles.keyRow}>
      <KeyStat label="DISTANCIA" value={formatDistance(shown.distanceM, unit)} />
      <KeyStat label={trip ? 'TIEMPO' : 'SESIÓN'} value={formatDuration(shown.durationMs)} />
      <KeyStat
        label="MÁXIMA"
        value={formatNumber(toDisplaySpeed(shown.maxSpeedKmh, unit))}
        unit={unitLabel}
        tint={colors.accent}
      />
    </View>
  );

  const controls = (
    <View style={styles.controls}>
      {status === 'idle' ? (
        <PrimaryButton
          label="Iniciar viaje"
          icon="play"
          onPress={start}
          tint={colors.accent}
          style={{ flex: 1 }}
        />
      ) : (
        <>
          <PrimaryButton
            label={status === 'paused' ? 'Reanudar' : 'Pausar'}
            icon={status === 'paused' ? 'play' : 'pause'}
            onPress={status === 'paused' ? resume : pause}
            tint={colors.text}
            variant="outline"
            style={{ flex: 1 }}
          />
          <PrimaryButton
            label={savingTrip ? 'Guardando…' : 'Finalizar'}
            icon="stop"
            onPress={handleStop}
            tint={colors.accent}
            disabled={savingTrip}
            style={{ flex: 1 }}
          />
        </>
      )}
    </View>
  );

  const dial = (
    <Speedometer
      value={toDisplaySpeed(live.speedKmh, unit)}
      max={gaugeMax}
      unitLabel={unitLabel}
      peak={toDisplaySpeed(shown.maxSpeedKmh, unit)}
      limit={settings.speedAlertEnabled ? toDisplaySpeed(settings.speedLimit, unit) : null}
      vehicleTop={toDisplaySpeed(vehicle.topSpeedKmh, unit)}
      overLimit={overLimit}
      size={Math.max(200, dialSize)}
      caption={overLimit ? `LÍMITE ${Math.round(toDisplaySpeed(settings.speedLimit, unit))}` : undefined}
    />
  );

  const analysisLink = (
    <Pressable onPress={() => goTo(1)} style={styles.swipeHint} hitSlop={8}>
      <Text style={styles.swipeHintText}>Desliza o toca para ver el análisis</Text>
      <Ionicons name="chevron-forward" size={12} color={colors.textFaint} />
    </Pressable>
  );

  const cockpit = (
    <View
      style={[
        styles.page,
        { width, paddingTop: insets.top + spacing.xs, paddingBottom: tabBarHeight + spacing.sm, paddingHorizontal: padH },
      ]}
    >
      {landscape ? (
        <View style={styles.landscapeRow}>
          <View style={[styles.centered, { width: dialSize }]}>{dial}</View>
          <View style={styles.landscapeSide}>
            {header}
            <View style={styles.shiftRow}>
              {gearBlock}
              <View style={{ flex: 1 }}>
                <ShiftLight rpm={gear?.rpm ?? null} redlineRpm={vehicle.redlineRpm} gear={gear?.gear ?? null} showGear={false} />
              </View>
            </View>
            {keyStats}
            {controls}
            {analysisLink}
          </View>
        </View>
      ) : (
        <View style={styles.portraitCol}>
          {header}
          <View style={styles.shiftRow}>
            {gearBlock}
            <View style={{ flex: 1 }}>
              <ShiftLight rpm={gear?.rpm ?? null} redlineRpm={vehicle.redlineRpm} gear={gear?.gear ?? null} showGear={false} />
            </View>
          </View>
          <View style={[styles.centered, { flex: 1 }]}>{dial}</View>
          {keyStats}
          {controls}
          {analysisLink}
        </View>
      )}
    </View>
  );

  // ---------------- Página 2: ANÁLISIS ----------------
  const analysis = (
    <ScrollView
      style={{ width }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: tabBarHeight + spacing.xl,
        paddingHorizontal: padH,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.analysisHeader}>
        <Pressable onPress={() => goTo(0)} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </Pressable>
        <Text style={styles.analysisTitle}>Análisis</Text>
        <Text style={styles.analysisSpeed}>
          {Math.round(toDisplaySpeed(live.speedKmh, unit))}
          <Text style={styles.analysisSpeedUnit}> {unitLabel}</Text>
        </Text>
      </View>

      {/* El carro corriendo: ruedas a las vueltas reales, morro que cabecea */}
      <RunningCar
        speedKmh={live.speedKmh}
        gForce={live.gForce}
        tireCircumferenceM={circumference}
        maxKmh={vehicle.topSpeedKmh}
        height={96}
      />

      <GlassCard style={styles.ribbonCard}>
        <SpeedRibbon
          speedKmh={live.speedKmh}
          maxKmh={vehicle.topSpeedKmh}
          limitKmh={settings.speedAlertEnabled ? settings.speedLimit : null}
          seconds={60}
          height={52}
        />
      </GlassCard>

      <SectionTitle>{trip ? 'Viaje en curso' : 'Sesión actual'}</SectionTitle>
      <StatGrid>
        <StatTile
          label="Máxima sostenida"
          value={formatNumber(toDisplaySpeed(shown.analysis.sustainedMaxKmh, unit))}
          unit={unitLabel}
          icon="shield-checkmark-outline"
          tint={colors.accent}
        />
        <StatTile
          label="Percentil 85"
          value={formatNumber(toDisplaySpeed(shown.analysis.p85Kmh, unit))}
          unit={unitLabel}
          icon="stats-chart-outline"
        />
        <StatTile
          label="Media en marcha"
          value={formatNumber(toDisplaySpeed(shown.avgMovingKmh, unit))}
          unit={unitLabel}
          icon="car-outline"
        />
        <StatTile
          label="Detenido"
          value={formatDuration(shown.stoppedMs)}
          icon="hourglass-outline"
          tint={colors.textMuted}
        />
        <StatTile
          label="Sobre el límite"
          value={formatDuration(shown.analysis.overLimitMs)}
          icon="warning-outline"
          tint={shown.analysis.overLimitMs > 0 ? colors.danger : colors.textMuted}
        />
        <StatTile
          label="Combustible est."
          value={`${shown.fuelL.toFixed(2)} L`}
          icon="water-outline"
          tint={colors.amber}
        />
      </StatGrid>
      <Text style={styles.footnote}>
        La máxima sostenida es la mayor velocidad que mantuviste 5 segundos seguidos: un solo pico
        raro del GPS no puede inflarla. El percentil 85 es la velocidad por debajo de la cual
        circulaste el 85 % del tiempo en movimiento.
      </Text>

      <SectionTitle>Altitud y desnivel</SectionTitle>
      <GlassCard>
        <View style={styles.altRow}>
          <View style={styles.altMain}>
            <Text style={styles.altValue}>
              {live.altitude != null ? formatNumber(live.altitude) : '—'}
              <Text style={styles.altUnit}> m s. n. m.</Text>
            </Text>
            <View style={styles.gradeRow}>
              <Ionicons
                name={grade > 0.8 ? 'trending-up' : grade < -0.8 ? 'trending-down' : 'remove'}
                size={16}
                color={gradeColor(grade)}
              />
              <Text style={[styles.gradeValue, { color: gradeColor(grade) }]}>
                {grade >= 0 ? '+' : ''}
                {grade.toFixed(1)} %
              </Text>
              <Text style={styles.gradeLabel}>{gradeLabel}</Text>
            </View>
          </View>
          <View style={styles.altSide}>
            <View style={styles.altSideRow}>
              <Ionicons name="arrow-up" size={13} color={colors.ascent} />
              <Text style={[styles.altSideValue, { color: colors.ascent }]}>
                {formatNumber(shown.elevGain)} m
              </Text>
            </View>
            <View style={styles.altSideRow}>
              <Ionicons name="arrow-down" size={13} color={colors.descent} />
              <Text style={[styles.altSideValue, { color: colors.descent }]}>
                {formatNumber(shown.elevLoss)} m
              </Text>
            </View>
            <Text style={styles.altSideHint}>
              {shown.minAlt != null && shown.maxAlt != null
                ? `${formatNumber(shown.minAlt)} – ${formatNumber(shown.maxAlt)} m`
                : 'sin rango'}
            </Text>
          </View>
        </View>
      </GlassCard>

      {effect && (
        <>
          <SectionTitle right={<Badge label="SAE J1349" tint={colors.amber} />}>
            Potencia a esta altitud
          </SectionTitle>
          <GlassCard>
            <View style={styles.powerRow}>
              <View>
                <Text style={styles.powerValue}>
                  {Math.round(effect.powerCv)}
                  <Text style={styles.powerUnit}> CV</Text>
                </Text>
                <Text style={styles.powerSub}>
                  de {vehicle.powerCv} CV · {Math.round(effect.torqueNm)} Nm
                </Text>
              </View>
              <View style={styles.powerLossBox}>
                <Text style={styles.powerLoss}>−{effect.lossPct.toFixed(0)} %</Text>
                <Text style={styles.powerLossHint}>
                  {Math.round(effect.altitudeM)} m · {effect.pressureKpa.toFixed(0)} kPa
                </Text>
              </View>
            </View>
            <View style={styles.powerBarTrack}>
              <View
                style={[styles.powerBarFill, { width: `${Math.max(6, (1 / effect.factor) * 100)}%` }]}
              />
            </View>
            <Text style={styles.powerNote}>
              Tu 1.6 es atmosférico: aspira el aire que haya. Aquí arriba entra menos oxígeno y el
              motor entrega {Math.round(effect.powerCv)} CV en vez de {vehicle.powerCv}. Un 0-100
              realista en este punto es de{' '}
              <Text style={styles.powerNoteStrong}>
                {effect.target0100Min.toFixed(1).replace('.', ',')} a{' '}
                {effect.target0100Max.toFixed(1).replace('.', ',')} s
              </Text>
              , no los {vehicle.accel0100Factory.toFixed(1).replace('.', ',')} s de fábrica, que
              están medidos al nivel del mar.
            </Text>
          </GlassCard>
        </>
      )}

      <SectionTitle right={<Badge label="AUTOMÁTICO" tint={colors.lime} />}>
        Prestaciones de la sesión
      </SectionTitle>
      <StatGrid>
        <StatTile
          label="0 → 100 km/h"
          value={formatAccel(live.perf.t0_100)}
          icon="rocket-outline"
          tint={live.perf.t0_100 != null ? colors.accent : colors.textFaint}
          compact
        />
        <StatTile label="0 → 60 km/h" value={formatAccel(live.perf.t0_60)} icon="rocket-outline" compact />
        <StatTile
          label="100 → 0 frenada"
          value={formatAccel(live.perf.t100_0)}
          icon="stop-circle-outline"
          tint={live.perf.t100_0 != null ? colors.danger : colors.textFaint}
          compact
        />
        <StatTile label="402 m (¼ milla)" value={formatAccel(live.perf.t402m)} icon="flag-outline" compact />
        <StatTile
          label="60 → 100 en marcha"
          value={formatAccel(live.perf.roll60_100)}
          icon="trending-up-outline"
          tint={live.perf.roll60_100 != null ? colors.text : colors.textFaint}
          compact
        />
        <StatTile
          label="80 → 120 en marcha"
          value={formatAccel(live.perf.roll80_120)}
          icon="trending-up-outline"
          tint={live.perf.roll80_120 != null ? colors.text : colors.textFaint}
          compact
        />
      </StatGrid>

      {(() => {
        const veredicto = effect ? compare0100(live.perf.t0_100, effect) : null;
        if (!veredicto) return null;
        const bueno = veredicto.verdict !== 'peor';
        return (
          <View
            style={[styles.verdictCard, { borderColor: bueno ? `${colors.lime}55` : `${colors.amber}55` }]}
          >
            <Ionicons
              name={bueno ? 'trophy' : 'information-circle'}
              size={17}
              color={bueno ? colors.lime : colors.amber}
            />
            <Text style={styles.verdictText}>
              {veredicto.verdict === 'mejor' &&
                `Por debajo de lo esperado a esta altitud, y por ${veredicto.deltaSeconds
                  .toFixed(2)
                  .replace('.', ',')} s. Muy buena pasada.`}
              {veredicto.verdict === 'dentro' && 'Justo en lo que cabe esperar del carro a esta altitud.'}
              {veredicto.verdict === 'peor' &&
                `${veredicto.deltaSeconds.toFixed(2).replace('.', ',')} s por encima del rango esperado aquí. Suele ser el peso a bordo, la pendiente o una salida poco limpia.`}
            </Text>
          </View>
        );
      })()}

      <Text style={styles.footnote}>
        Las arrancadas se detectan solas al salir desde parado. Las recuperaciones en marcha (60 →
        100 y 80 → 120) se miden sin detenerte: es lo que de verdad usas para adelantar, y en un
        motor atmosférico en altura es donde más se nota la falta de aire.
      </Text>

      <SectionTitle>Dinámica</SectionTitle>
      <StatGrid>
        <StatTile
          label="Aceleración"
          value={`${live.gForce >= 0 ? '+' : ''}${live.gForce.toFixed(2)} g`}
          icon="speedometer-outline"
          tint={live.gForce > 0.05 ? colors.lime : live.gForce < -0.05 ? colors.danger : colors.text}
          compact
        />
        <StatTile
          label="Rumbo"
          value={live.heading != null ? `${Math.round(live.heading)}° ${cardinal(live.heading)}` : '—'}
          icon="compass-outline"
          compact
        />
        <StatTile
          label="Rpm estimadas"
          value={gear ? formatNumber(Math.round(gear.rpm / 50) * 50) : '—'}
          icon="pulse-outline"
          compact
        />
      </StatGrid>

      <Pressable onPress={() => router.push('/garage')} style={styles.vehicleChip}>
        <Ionicons name="car-sport" size={16} color={colors.accent} />
        <Text style={styles.vehicleChipText}>
          {vehicle.make} {vehicle.model} {vehicle.year} · {vehicle.trim}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
      </Pressable>
    </ScrollView>
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onPageEnd}
      >
        {cockpit}
        {analysis}
      </ScrollView>

      {/* Exceso de velocidad: marco rojo y resplandor arriba, visibles de reojo */}
      {overLimit && (
        <>
          <LinearGradient
            colors={['rgba(255,45,58,0.40)', 'transparent']}
            style={styles.alertGlow}
            pointerEvents="none"
          />
          <View style={styles.alertFrame} pointerEvents="none" />
        </>
      )}

    </View>
  );
}

function KeyStat({
  label,
  value,
  unit,
  tint = colors.text,
}: {
  label: string;
  value: string;
  unit?: string;
  tint?: string;
}) {
  return (
    <View style={styles.keyStat}>
      <Text style={styles.keyLabel}>{label}</Text>
      <Text style={[styles.keyValue, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
        {!!unit && <Text style={styles.keyUnit}> {unit}</Text>}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  page: { flex: 1 },

  alertGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 200 },
  alertFrame: {
    ...StyleSheet.absoluteFill,
    borderWidth: 4,
    borderColor: colors.danger,
    borderRadius: 48, // sigue las esquinas redondeadas de la pantalla del iPhone
  },

  // ----- cabina -----
  portraitCol: { flex: 1, gap: spacing.md },
  landscapeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  landscapeSide: { flex: 1, justifyContent: 'center', gap: spacing.md },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 26,
  },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  statusDim: { fontSize: 10, color: colors.textFaint, fontFamily: mono },
  brand: {
    fontSize: 13,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 2,
    color: colors.text,
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
    maxWidth: '55%',
  },

  shiftRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gearBox: {
    width: 54,
    height: 54,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearLabel: { fontSize: 7, fontWeight: '800', letterSpacing: 1, color: colors.textMuted, marginTop: 2 },
  gearValue: {
    fontSize: 30,
    lineHeight: 32,
    fontWeight: '900',
    fontStyle: 'italic',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },

  keyRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  keyStat: { flex: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  keyLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, color: colors.textFaint, marginBottom: 4 },
  keyValue: {
    fontSize: 22,
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  keyUnit: { fontSize: 11, fontWeight: '700', fontStyle: 'normal', color: colors.textFaint },

  controls: { flexDirection: 'row', gap: spacing.sm },
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginTop: -spacing.xs,
  },
  swipeHintText: { fontSize: 11, color: colors.textFaint, fontWeight: '600' },

  // ----- análisis -----
  analysisHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisTitle: { ...font.title, color: colors.text, flex: 1 },
  analysisSpeed: {
    fontSize: 22,
    fontWeight: '800',
    fontStyle: 'italic',
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  analysisSpeedUnit: { fontSize: 11, color: colors.textFaint, fontStyle: 'normal' },
  ribbonCard: { marginTop: spacing.sm, paddingVertical: spacing.md },

  powerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  powerValue: { ...font.display, color: colors.text, fontVariant: ['tabular-nums'] },
  powerUnit: { fontSize: 15, color: colors.textMuted, fontWeight: '700', fontStyle: 'normal' },
  powerSub: { fontSize: 12, color: colors.textFaint, marginTop: 2, fontFamily: mono },
  powerLossBox: { alignItems: 'flex-end' },
  powerLoss: {
    fontSize: 22,
    fontWeight: '800',
    fontStyle: 'italic',
    color: colors.amber,
    fontVariant: ['tabular-nums'],
  },
  powerLossHint: { fontSize: 10, color: colors.textFaint, fontFamily: mono, marginTop: 3 },
  powerBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  powerBarFill: { height: '100%', borderRadius: 3, backgroundColor: colors.amber },
  powerNote: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginTop: spacing.md },
  powerNoteStrong: { color: colors.text, fontWeight: '700' },

  verdictCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  verdictText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 18 },

  altRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  altMain: { flex: 1 },
  altValue: { ...font.display, color: colors.text, fontVariant: ['tabular-nums'] },
  altUnit: { fontSize: 13, color: colors.textMuted, fontWeight: '600', fontStyle: 'normal' },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  gradeValue: { fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  gradeLabel: { fontSize: 10, color: colors.textFaint, fontWeight: '800', letterSpacing: 1 },
  altSide: { alignItems: 'flex-end', gap: 4 },
  altSideRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  altSideValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  altSideHint: { fontSize: 10, color: colors.textFaint, fontFamily: mono, marginTop: 2 },

  footnote: {
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 16,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },

  vehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: spacing.lg,
  },
  vehicleChipText: { flex: 1, fontSize: 13, color: colors.textMuted, fontWeight: '600' },
});
