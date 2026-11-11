import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRouter } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
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

import { CarShowcase } from '@/components/CarShowcase';
import {
  DashClock,
  DashStat,
  LinearMeter,
  MiniGauge,
  Panel,
  TripControl,
} from '@/components/dash';
import { SpeedRibbon } from '@/components/SpeedRibbon';
import { Speedometer } from '@/components/Speedometer';
import { Badge, EmptyState, GlassCard, PrimaryButton, SectionTitle, StatGrid, StatTile } from '@/components/ui';
import { displayHeading, SensorStatus, useSensors } from '@/state/SensorsContext';
import { useSettings } from '@/state/SettingsContext';
import { useTracking } from '@/state/TrackingContext';
import { useVehicleSwitch } from '@/state/VehicleSwitch';
import { FACTORY_VEHICLES } from '@/vehicles';
import { TAB_BAR_HIDDEN, TAB_BAR_STYLE } from '@/theme/tabBar';
import { colors, font, fonts, gradeColor, mono, radius, spacing } from '@/theme/theme';
import { useAccent } from '@/theme/accent';
import { AccelRing } from '@/components/AccelRing';
import { LiveCar } from '@/components/LiveCar';
import { altitudeEffect, compare0100, pressureAltitudeM } from '@/utils/altitude';
import {
  formatAccel,
  formatDistance,
  formatDuration,
  formatNumber,
  speedUnitLabel,
  toDisplaySpeed,
} from '@/utils/format';
import { cardinal } from '@/utils/geo';

/**
 * Pantalla Velocidad, en dos páginas que se deslizan de lado:
 *
 * 1. CABINA: tablero para mirar manejando, sin scroll. En horizontal (iPhone
 *    en el soporte) ocupa la pantalla entera: se ocultan la barra de pestañas y
 *    la de estado, como un tablero digital.
 * 2. ANÁLISIS: el detalle de la sesión, los sensores y tu carro.
 *
 * Todo lo que se ve es medido: GPS, giroscopio, barómetro y brújula. Lo que
 * se calcula a partir de una medida (la potencia según la presión del aire)
 * dice de qué medida sale.
 */
export default function SpeedScreen() {
  const accent = useAccent();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const { settings } = useSettings();
  const sensors = useSensors();
  const { status, permission, gpsActive, live, trip, overLimit, requestPermission } = useTracking();

  // En horizontal el tablero va a pantalla completa.
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: landscape ? TAB_BAR_HIDDEN : TAB_BAR_STYLE });
  }, [landscape, navigation]);

  const unit = settings.unit;
  const unitLabel = speedUnitLabel(unit);
  const vehicle = settings.vehicle;
  const { switchVehicle } = useVehicleSwitch();
  /** El otro carro del garaje: tocar el nombre del tablero cambia a él. */
  const nextVehicleId = useMemo(() => {
    const i = FACTORY_VEHICLES.findIndex((fv) => fv.id === settings.activeVehicleId);
    return FACTORY_VEHICLES[(i + 1) % FACTORY_VEHICLES.length].id;
  }, [settings.activeVehicleId]);
  const shown = trip ?? live;

  const gaugeMax = useMemo(() => {
    const top = toDisplaySpeed(vehicle.topSpeedKmh, unit);
    return Math.ceil(top / 20) * 20;
  }, [vehicle.topSpeedKmh, unit]);

  // ---- Potencia disponible: presión real del barómetro si la hay ----
  const pressureHpa = sensors.baro.pressureHpa;
  const pressureKpa = pressureHpa != null ? pressureHpa / 10 : undefined;
  const altitudeForPower =
    live.altitude ?? (pressureKpa != null ? pressureAltitudeM(pressureKpa) : null);
  const effect = useMemo(() => {
    if (altitudeForPower == null) return null;
    // Escalones de 50 m y 1 hPa: no rehace la cuenta con cada temblor.
    return altitudeEffect(
      vehicle,
      Math.round(altitudeForPower / 50) * 50,
      settings.airTempC,
      pressureKpa != null ? Math.round(pressureKpa * 10) / 10 : undefined
    );
  }, [vehicle, altitudeForPower, settings.airTempC, pressureKpa]);

  const heading = displayHeading(live.speedKmh, live.heading, sensors.compass.headingDeg);
  const motionOk = sensors.motion.status === 'activo';
  const lateralG = motionOk ? sensors.motion.lateralG : 0;
  // Aceleración: acelerómetro calibrado contra el GPS; sin sensores, la del GPS.
  const longCalibrated = motionOk && sensors.motion.longCalibrated;
  const longG = motionOk ? sensors.motion.longG : live.gForce;

  // ---- Paginado horizontal ----
  const pager = useRef<ScrollViewInstance>(null);
  const [page, setPage] = useState(0);
  const goTo = (p: number) => {
    pager.current?.scrollTo({ x: p * width, animated: true });
    setPage(p);
  };
  useEffect(() => {
    pager.current?.scrollTo({ x: page * width, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);
  const onPageEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));

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
          tint={colors.text}
          style={{ marginHorizontal: spacing.xl }}
        />
      </View>
    );
  }

  const accuracy = live.accuracy;
  const gps =
    !gpsActive || accuracy == null
      ? { label: 'buscando GPS', tint: colors.textMuted }
      : accuracy <= 8
        ? { label: 'GPS preciso', tint: colors.lime }
        : accuracy <= 20
          ? { label: 'GPS medio', tint: colors.amber }
          : { label: 'GPS débil', tint: colors.danger };

  // ---- Calidad de la medición: qué tan fiable es lo que se muestra ahora ----
  const compassAcc = sensors.compass.accuracyDeg;
  const calItems = [
    accuracy == null
      ? { ok: false, text: 'GPS sin señal todavía: sal a cielo abierto y espera unos segundos.' }
      : accuracy <= 8
        ? { ok: true, text: `GPS con ±${Math.round(accuracy)} m: velocidad y distancia fiables.` }
        : {
            ok: false,
            text: `GPS con ±${Math.round(accuracy)} m: pon el iPhone más cerca del parabrisas, con vista al cielo.`,
          },
    sensors.baro.status === 'activo'
      ? { ok: true, text: 'Barómetro activo: pendiente y desnivel medidos con la presión real.' }
      : { ok: false, text: 'Sin barómetro: la pendiente y el desnivel salen solo del GPS (más ruidosos).' },
    motionOk
      ? { ok: true, text: 'Giroscopio y acelerómetro activos. Mejor con el iPhone fijo en un soporte firme.' }
      : { ok: false, text: 'Sin sensores de movimiento: no hay fuerza g en curva.' },
    compassAcc != null && compassAcc > 0 && compassAcc <= 20
      ? { ok: true, text: `Brújula calibrada (±${Math.round(compassAcc)}°).` }
      : {
          ok: false,
          text: 'Brújula imprecisa: aleja el iPhone de imanes del soporte y muévelo dibujando un 8.',
        },
  ];
  const calOk = calItems.filter((i) => i.ok).length;
  const calibration = {
    items: calItems,
    label: calOk === calItems.length ? 'ÓPTIMA' : calOk >= 2 ? 'BUENA' : 'REVISAR',
    tint: calOk === calItems.length ? colors.lime : calOk >= 2 ? colors.amber : colors.danger,
  };

  const grade = live.grade;
  const limitShown = settings.speedAlertEnabled
    ? Math.round(toDisplaySpeed(settings.speedLimit, unit))
    : null;

  // ---------------------------------------------------------------- medidas
  const padH = landscape ? Math.max(insets.left, insets.right, spacing.lg) : spacing.lg;
  const usableW = width - padH * 2;
  const bottomSpace = landscape ? Math.max(insets.bottom, spacing.sm) : tabBarHeight;
  const usableH = height - (landscape ? spacing.sm : insets.top) - bottomSpace;
  const dialSize = Math.max(
    200,
    landscape
      ? Math.min(usableH - 34 - 56 - spacing.md * 2, usableW * 0.42)
      : Math.min(usableW, usableH - 392)
  );
  const sideGauge = landscape ? Math.min(118, (usableW - dialSize) / 2 - spacing.lg) : 108;

  // ---------------------------------------------------------------- piezas
  const header = (
    <View style={styles.header}>
      <View style={styles.headerSide}>
        <DashClock />
      </View>
      <Pressable
        onPress={(e) => switchVehicle(nextVehicleId, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Cambiar de vehículo. Ahora: ${vehicle.model}`}
      >
        <Text style={styles.brand}>{vehicle.model.toUpperCase()}</Text>
      </Pressable>
      <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
        <View style={styles.gpsChip}>
          <View style={[styles.dot, { backgroundColor: gps.tint }]} />
          <Text style={[styles.gpsText, { color: gps.tint }]}>{gps.label}</Text>
          {accuracy != null && <Text style={styles.gpsDim}>±{Math.round(accuracy)} m</Text>}
        </View>
      </View>
    </View>
  );

  const dial = (
    <Speedometer
      value={toDisplaySpeed(live.speedKmh, unit)}
      max={gaugeMax}
      unitLabel={unitLabel}
      peak={toDisplaySpeed(shown.maxSpeedKmh, unit)}
      limit={limitShown}
      vehicleTop={toDisplaySpeed(vehicle.topSpeedKmh, unit)}
      overLimit={overLimit}
      size={dialSize}
      caption={overLimit && limitShown != null ? `límite ${limitShown}` : 'velocidad'}
    />
  );

  const liveCar = (
    <LiveCar size={sideGauge} bodyType={vehicle.bodyType} lateralG={lateralG} active={motionOk} />
  );
  const powerGauge = (
    <MiniGauge
      label="potencia"
      value={effect ? effect.powerCv : null}
      min={0}
      max={vehicle.powerCv}
      unit={`de ${vehicle.powerCv} CV`}
      size={sideGauge}
      tint={colors.lime}
    />
  );
  const accelRing = <AccelRing size={sideGauge} longG={longG} calibrated={longCalibrated} />;

  const distanceStat = <DashStat label="distancia" value={formatDistance(shown.distanceM, unit)} />;
  const timeStat = <DashStat label={trip ? 'tiempo de viaje' : 'sesión'} value={formatDuration(shown.durationMs)} />;
  const maxStat = (
    <DashStat
      label="máxima"
      value={formatNumber(toDisplaySpeed(shown.maxSpeedKmh, unit))}
      unit={unitLabel}
      tint={accent.accent}
    />
  );

  const gradeBar = (
    <LinearMeter
      label="pendiente"
      valueText={`${grade >= 0 ? '+' : ''}${grade.toFixed(1)} %`}
      value={grade}
      min={-12}
      max={12}
      bipolar
      scale={['-12', '-6', '0', '+6', '+12']}
      tint={gradeColor(grade) === colors.textMuted ? colors.text : gradeColor(grade)}
    />
  );
  const pressureBar = (
    <LinearMeter
      label={sensors.baro.status === 'activo' ? 'presión (barómetro)' : 'presión'}
      valueText={pressureHpa != null ? `${Math.round(pressureHpa)} hPa` : '—'}
      value={pressureHpa}
      min={600}
      max={1013}
      scale={['600', '700', '800', '900', '1013']}
      tint={colors.blue}
    />
  );
  const headingBar = (
    <LinearMeter
      label={heading.source === 'brujula' ? 'rumbo (brújula)' : 'rumbo'}
      valueText={heading.deg != null ? `${Math.round(heading.deg)}° ${cardinal(heading.deg)}` : '—'}
      value={heading.deg}
      min={0}
      max={360}
      scale={['N', 'E', 'S', 'O', 'N']}
      tint={colors.salmon}
    />
  );

  const analysisLink = (
    <Pressable onPress={() => goTo(1)} style={styles.link} hitSlop={8}>
      <Text style={styles.linkText}>análisis, sensores y tu carro</Text>
      <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
    </Pressable>
  );

  const cockpit = landscape ? (
    <View style={[styles.page, { width, paddingTop: spacing.sm, paddingBottom: bottomSpace, paddingHorizontal: padH }]}>
      <View style={styles.landscapeHeader}>
        {header}
      </View>
      <View style={styles.landscapeMain}>
        <View style={styles.sideCol}>
          {liveCar}
          <Panel style={styles.sidePanel}>{distanceStat}</Panel>
        </View>
        <View style={styles.centered}>{dial}</View>
        <View style={styles.sideCol}>
          {accelRing}
          <Panel style={styles.sidePanel}>{timeStat}</Panel>
        </View>
      </View>
      <View style={styles.landscapeBottom}>
        {gradeBar}
        {pressureBar}
        <View style={{ flex: 1.3 }}>
          <TripControl compact />
        </View>
      </View>
    </View>
  ) : (
    <View style={[styles.page, { width, paddingTop: insets.top + spacing.xs, paddingBottom: bottomSpace + spacing.sm, paddingHorizontal: padH }]}>
      {header}
      <View style={[styles.centered, { flex: 1 }]}>{dial}</View>
      <Panel style={styles.instruments}>
        {liveCar}
        {powerGauge}
        {accelRing}
      </Panel>
      <Panel style={styles.statsRow}>
        {distanceStat}
        <View style={styles.vDivider} />
        {timeStat}
        <View style={styles.vDivider} />
        {maxStat}
      </Panel>
      <View style={styles.barsRow}>
        {gradeBar}
        {headingBar}
      </View>
      <TripControl />
      {analysisLink}
    </View>
  );

  // ---------------------------------------------------------------- análisis
  const analysis = (
    <ScrollView
      style={{ width }}
      contentContainerStyle={{
        paddingTop: (landscape ? spacing.md : insets.top + spacing.sm),
        paddingBottom: bottomSpace + spacing.xl,
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

      <CarShowcase height={landscape ? 150 : 190} bodyType={vehicle.bodyType} />
      <Text style={styles.carName}>
        {vehicle.model} {vehicle.year}
      </Text>
      <Text style={styles.carTrim}>
        {vehicle.trim} · {vehicle.powerCv} CV de fábrica
        {effect ? ` · ${Math.round(effect.powerCv)} CV aquí` : ''}
      </Text>

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
        <StatTile label="Distancia" value={formatDistance(shown.distanceM, unit)} icon="trail-sign-outline" />
        <StatTile label={trip ? 'Tiempo' : 'App abierta'} value={formatDuration(shown.durationMs)} icon="time-outline" />
        <StatTile
          label="Máxima"
          value={formatNumber(toDisplaySpeed(shown.maxSpeedKmh, unit))}
          unit={unitLabel}
          icon="flash-outline"
          tint={accent.accent}
        />
        <StatTile
          label="Máxima sostenida"
          value={formatNumber(toDisplaySpeed(shown.analysis.sustainedMaxKmh, unit))}
          unit={unitLabel}
          icon="shield-checkmark-outline"
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
        <StatTile label="Detenido" value={formatDuration(shown.stoppedMs)} icon="hourglass-outline" tint={colors.textMuted} />
        <StatTile
          label="Sobre el límite"
          value={formatDuration(shown.analysis.overLimitMs)}
          icon="warning-outline"
          tint={shown.analysis.overLimitMs > 0 ? colors.danger : colors.textMuted}
        />
      </StatGrid>
      <Text style={styles.footnote}>
        La máxima sostenida es la mayor velocidad que mantuviste 5 segundos seguidos: un pico raro
        del GPS no puede inflarla. El percentil 85 es la velocidad por debajo de la cual circulaste
        el 85 % del tiempo en movimiento.
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
            </View>
          </View>
          <View style={styles.altSide}>
            <Text style={[styles.altSideValue, { color: colors.ascent }]}>↑ {formatNumber(shown.elevGain)} m</Text>
            <Text style={[styles.altSideValue, { color: colors.descent }]}>↓ {formatNumber(shown.elevLoss)} m</Text>
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
          <SectionTitle
            right={
              <Badge
                label={effect.pressureSource === 'barometro' ? 'BARÓMETRO' : 'ATMÓSFERA ESTÁNDAR'}
                tint={effect.pressureSource === 'barometro' ? colors.lime : colors.amber}
              />
            }
          >
            Potencia aquí y ahora
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
                  {(effect.pressureKpa * 10).toFixed(0)} hPa · {settings.airTempC} °C
                </Text>
              </View>
            </View>
            <View style={styles.powerBarTrack}>
              <View style={[styles.powerBarFill, { width: `${Math.max(6, (1 / effect.factor) * 100)}%` }]} />
            </View>
            <Text style={styles.powerNote}>
              Tu {vehicle.displacementL.toFixed(1)} es atmosférico: entrega lo que le deja el aire que respira. Con{' '}
              {(effect.pressureKpa * 10).toFixed(0)} hPa
              {effect.pressureSource === 'barometro' ? ' medidos por el barómetro del iPhone' : ''}{' '}
              y {settings.airTempC} °C (el iPhone no tiene termómetro exterior; se ajusta en Garaje), la
              norma SAE J1349 da {Math.round(effect.powerCv)} CV. Un 0-100 realista aquí es de{' '}
              <Text style={styles.powerNoteStrong}>
                {effect.target0100Min.toFixed(1).replace('.', ',')} a{' '}
                {effect.target0100Max.toFixed(1).replace('.', ',')} s
              </Text>
              , no los {vehicle.accel0100Factory.toFixed(1).replace('.', ',')} s de fábrica, medidos al
              nivel del mar.
            </Text>
          </GlassCard>
        </>
      )}

      <SectionTitle right={<Badge label="AUTOMÁTICO" tint={colors.lime} />}>Prestaciones de la sesión</SectionTitle>
      <StatGrid>
        <StatTile
          label="0 → 100 km/h"
          value={formatAccel(live.perf.t0_100)}
          icon="rocket-outline"
          tint={live.perf.t0_100 != null ? accent.accent : colors.textFaint}
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
        <StatTile label="60 → 100 en marcha" value={formatAccel(live.perf.roll60_100)} icon="trending-up-outline" compact />
        <StatTile label="80 → 120 en marcha" value={formatAccel(live.perf.roll80_120)} icon="trending-up-outline" compact />
      </StatGrid>
      {(() => {
        const veredicto = effect ? compare0100(live.perf.t0_100, effect) : null;
        if (!veredicto) return null;
        const bueno = veredicto.verdict !== 'peor';
        return (
          <View style={[styles.verdictCard, { borderColor: bueno ? `${colors.lime}55` : `${colors.amber}55` }]}>
            <Ionicons name={bueno ? 'trophy' : 'information-circle'} size={17} color={bueno ? colors.lime : colors.amber} />
            <Text style={styles.verdictText}>
              {veredicto.verdict === 'mejor' &&
                `Por debajo de lo esperado a esta altitud, y por ${veredicto.deltaSeconds.toFixed(2).replace('.', ',')} s. Muy buena pasada.`}
              {veredicto.verdict === 'dentro' && 'Justo en lo que cabe esperar del carro a esta altitud.'}
              {veredicto.verdict === 'peor' &&
                `${veredicto.deltaSeconds.toFixed(2).replace('.', ',')} s por encima del rango esperado aquí. Suele ser el peso a bordo, la pendiente o una salida poco limpia.`}
            </Text>
          </View>
        );
      })()}

      <SectionTitle>Dinámica</SectionTitle>
      <StatGrid>
        <StatTile
          label={longCalibrated ? 'Aceleración (acelerómetro)' : 'Aceleración (GPS)'}
          value={`${longG >= 0 ? '+' : ''}${longG.toFixed(2)} g`}
          icon="speedometer-outline"
          tint={longG > 0.05 ? colors.lime : longG < -0.05 ? colors.danger : colors.text}
          compact
        />
        <StatTile
          label="Curva (giroscopio)"
          value={motionOk ? `${Math.abs(lateralG).toFixed(2)} g ${lateralG > 0.03 ? 'der' : lateralG < -0.03 ? 'izq' : ''}` : '—'}
          icon="sync-outline"
          compact
        />
        <StatTile
          label="Rumbo"
          value={heading.deg != null ? `${Math.round(heading.deg)}° ${cardinal(heading.deg)}` : '—'}
          icon="compass-outline"
          compact
        />
      </StatGrid>

      <SectionTitle>Sensores del iPhone</SectionTitle>
      <GlassCard padded={false}>
        <SensorRow
          name="GPS L1 + L5"
          detail={
            accuracy != null
              ? `±${Math.round(accuracy)} m · velocidad Doppler, posición, rumbo en marcha`
              : 'esperando señal (mejor con cielo despejado)'
          }
          status={gpsActive && accuracy != null ? 'activo' : 'buscando'}
        />
        <View style={styles.divider} />
        <SensorRow
          name="Giroscopio y acelerómetro"
          detail={
            motionOk
              ? `giro ${sensors.motion.yawRateDps.toFixed(1)} °/s · curvas en g y detectar que estás parado`
              : 'sin datos de movimiento'
          }
          status={sensors.motion.status}
        />
        <View style={styles.divider} />
        <SensorRow
          name="Barómetro"
          detail={
            pressureHpa != null
              ? `${pressureHpa.toFixed(1)} hPa · pendiente y desnivel finos, potencia con el aire real`
              : 'sin lectura de presión'
          }
          status={sensors.baro.status}
        />
        <View style={styles.divider} />
        <SensorRow
          name="Brújula"
          detail={
            sensors.compass.headingDeg != null
              ? `${Math.round(sensors.compass.headingDeg)}°${
                  sensors.compass.accuracyDeg != null && sensors.compass.accuracyDeg > 0
                    ? ` ±${Math.round(sensors.compass.accuracyDeg)}°`
                    : ''
                } · da el rumbo con el carro parado`
              : 'sin rumbo magnético'
          }
          status={sensors.compass.status}
        />
      </GlassCard>
      <Text style={styles.footnote}>
        La velocidad sale del GPS de doble frecuencia (efecto Doppler, no de restar posiciones): es
        la medida más exacta que puede dar el teléfono, con un error de unas décimas de km/h a cielo
        abierto. Los otros sensores la afinan: el acelerómetro y el giroscopio confirman cuándo el
        carro está detenido de verdad (el GPS solo «camina» un poco), se descartan los picos
        imposibles y el barómetro da la pendiente y el desnivel. La curva sale del giroscopio
        multiplicado por la velocidad, así que funciona con el iPhone en cualquier posición del
        soporte. Sin conexión al carro (OBD-II) no se leen rpm, marcha ni consumo, así que la app no
        los muestra.
      </Text>

      <SectionTitle
        right={<Badge label={calibration.label} tint={calibration.tint} />}
      >
        Calidad de la medición
      </SectionTitle>
      <GlassCard>
        {calibration.items.map((item) => (
          <View key={item.text} style={styles.calRow}>
            <Ionicons
              name={item.ok ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={item.ok ? colors.lime : colors.amber}
            />
            <Text style={styles.calText}>{item.text}</Text>
          </View>
        ))}
        <Text style={styles.calNote}>
          El velocímetro del carro marca de más a propósito (lo exige la norma: nunca de menos, y
          suele ser un 2-5 % arriba). Por eso aquí verás 2 a 5 km/h menos que en el tablero a
          100 km/h: la cifra del GPS es la real.
        </Text>
      </GlassCard>

      <Pressable onPress={() => router.push('/garage')} style={styles.vehicleChip}>
        <Ionicons name="car-sport" size={16} color={colors.text} />
        <Text style={styles.vehicleChipText}>
          {vehicle.make} {vehicle.model} {vehicle.year} · {vehicle.trim}
        </Text>
        <Pressable
          onPress={(e) => switchVehicle(nextVehicleId, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
          hitSlop={10}
          style={styles.swapButton}
          accessibilityRole="button"
          accessibilityLabel="Cambiar de vehículo"
        >
          <Ionicons name="swap-horizontal" size={16} color={accent.accent} />
        </Pressable>
      </Pressable>
    </ScrollView>
  );

  return (
    <View style={styles.screen}>
      <StatusBar hidden={landscape} style="light" />
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
          <LinearGradient colors={['rgba(255,45,70,0.30)', 'transparent']} style={styles.alertGlow} pointerEvents="none" />
          <View style={styles.alertFrame} pointerEvents="none" />
        </>
      )}

      {status !== 'idle' && page === 1 && (
        <View style={[styles.floatingTrip, { bottom: bottomSpace + spacing.sm, left: padH, right: padH }]}>
          <TripControl compact />
        </View>
      )}
    </View>
  );
}

function SensorRow({ name, detail, status }: { name: string; detail: string; status: SensorStatus }) {
  const tint = status === 'activo' ? colors.lime : status === 'buscando' ? colors.amber : colors.textFaint;
  const label = status === 'activo' ? 'activo' : status === 'buscando' ? 'buscando' : 'no disponible';
  return (
    <View style={styles.sensorRow}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.sensorName}>{name}</Text>
        <Text style={styles.sensorDetail}>{detail}</Text>
      </View>
      <Text style={[styles.sensorStatus, { color: tint }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centered: { alignItems: 'center', justifyContent: 'center' },
  page: { flex: 1, gap: spacing.md },

  alertGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
  alertFrame: {
    ...StyleSheet.absoluteFill,
    borderWidth: 3,
    borderColor: colors.danger,
    borderRadius: 52, // sigue las esquinas redondeadas de la pantalla del iPhone
  },

  // ----- cabecera -----
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 28 },
  headerSide: { flex: 1 },
  brand: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 3, color: colors.textMuted },
  gpsChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gpsText: { fontSize: 11, fontWeight: '500' },
  gpsDim: { fontSize: 11, color: colors.textFaint, fontFamily: mono },
  dot: { width: 7, height: 7, borderRadius: 4 },

  // ----- vertical -----
  instruments: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  vDivider: { width: 1, alignSelf: 'stretch', marginVertical: spacing.sm, backgroundColor: colors.border },
  barsRow: { flexDirection: 'row', gap: spacing.lg },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: -spacing.xs },
  linkText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },

  // ----- horizontal -----
  landscapeHeader: { paddingHorizontal: spacing.sm },
  landscapeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sideCol: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  sidePanel: { alignSelf: 'stretch', marginHorizontal: spacing.sm },
  landscapeBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xl, paddingHorizontal: spacing.sm },

  floatingTrip: { position: 'absolute' },

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
  analysisSpeed: { fontSize: 22, fontFamily: fonts.medium, color: colors.text },
  analysisSpeedUnit: { fontSize: 11, color: colors.textMuted, fontFamily: fonts.regular },
  carName: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: -spacing.sm },
  carTrim: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 2, marginBottom: spacing.sm },
  ribbonCard: { marginTop: spacing.sm, paddingVertical: spacing.md },

  powerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  powerValue: { ...font.display, color: colors.text },
  powerUnit: { fontSize: 15, color: colors.textMuted, fontFamily: fonts.regular },
  powerSub: { fontSize: 12, color: colors.textFaint, marginTop: 2, fontFamily: mono },
  powerLossBox: { alignItems: 'flex-end' },
  powerLoss: { fontSize: 22, fontFamily: fonts.medium, color: colors.amber },
  powerLossHint: { fontSize: 10, color: colors.textFaint, fontFamily: mono, marginTop: 3 },
  powerBarTrack: { height: 4, borderRadius: 2, backgroundColor: colors.track, marginTop: spacing.md, overflow: 'hidden' },
  powerBarFill: { height: '100%', borderRadius: 2, backgroundColor: colors.lime },
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
  altValue: { ...font.display, color: colors.text },
  altUnit: { fontSize: 13, color: colors.textMuted, fontFamily: fonts.regular },
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  gradeValue: { fontSize: 16, fontFamily: fonts.medium },
  altSide: { alignItems: 'flex-end', gap: 4 },
  altSideValue: { fontSize: 15, fontFamily: fonts.medium },
  altSideHint: { fontSize: 10, color: colors.textFaint, fontFamily: mono, marginTop: 2 },

  sensorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.lg },
  sensorName: { fontSize: 14, color: colors.text, fontWeight: '600' },
  sensorDetail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sensorStatus: { fontSize: 11, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg },

  footnote: { fontSize: 11, color: colors.textFaint, lineHeight: 16, marginTop: spacing.sm, paddingHorizontal: spacing.xs },

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
  calRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  calText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  calNote: { fontSize: 11, color: colors.textFaint, lineHeight: 16, marginTop: spacing.xs },
  swapButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
  },
  vehicleChipText: { flex: 1, fontSize: 13, color: colors.textMuted, fontWeight: '600' },
});
