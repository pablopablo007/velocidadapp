import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRouter } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
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
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CarPhoto } from '@/components/CarPhoto';
import { Clock, GpsBars, IconButton, LimitSign, Readout } from '@/components/cockpit';
import { TripControl } from '@/components/dash';
import { MapBackdrop } from '@/components/MapBackdrop';
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
import { altitudeEffect, compare0100, pressureAltitudeM } from '@/utils/altitude';
import {
  formatAccel,
  formatDistance,
  formatDuration,
  formatNumber,
  distanceUnitLabel,
  speedUnitLabel,
  toDisplayDistanceKm,
  toDisplaySpeed,
} from '@/utils/format';
import { getTotals } from '@/services/database';
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

  const { settings, update } = useSettings();
  const sensors = useSensors();
  const { status, permission, gpsActive, live, trip, path, position, overLimit, requestPermission, lastSavedTripId } =
    useTracking();

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

  // Rumbo del mapa: el último rumbo de marcha. Parado se conserva (el GPS no
  // da rumbo sin movimiento y la brújula haría girar el mapa con cada temblor).
  const [course, setCourse] = useState<number | null>(null);
  if (live.speedKmh > 8 && live.heading != null) {
    const diff = course == null ? 999 : Math.abs(((live.heading - course + 540) % 360) - 180);
    if (diff >= 2) setCourse(live.heading);
  }

  // ---- Odómetro del carro: lo recorrido con él en la app (historial + viaje en curso) ----
  const [odometerM, setOdometerM] = useState(0);
  useEffect(() => {
    let alive = true;
    getTotals(settings.activeVehicleId)
      .then((t) => alive && setOdometerM(t.distanceM))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [settings.activeVehicleId, lastSavedTripId]);

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

  // Vertical: barra superior, mapa (se mete bajo el dial), dial, datos y viaje.
  const P = { bar: 30, stats: 46, extra: 18, trip: 40, dots: 8 };
  const innerH = height - insets.top - bottomSpace;
  const portraitDial = Math.max(
    220,
    Math.min(usableW, 360, innerH - P.bar - P.stats - P.extra - P.trip - P.dots - 150)
  );
  // El mapa ocupa lo que sobra arriba y se mete un poco bajo el dial.
  const MAP_UNDER = 0.2;
  const portraitMapH = Math.max(
    150,
    innerH - P.bar - portraitDial * (1 - MAP_UNDER) - P.stats - P.extra - P.trip - P.dots - spacing.sm * 4
  );

  const portraitMapTotal = insets.top + P.bar + portraitMapH + portraitDial * MAP_UNDER;

  // Horizontal: barra arriba, barra abajo; el dial toma todo el alto que queda.
  const L = { bar: 30, bottom: 40 };
  const landscapeMainH = height - spacing.xs - bottomSpace - L.bar - L.bottom - spacing.xs * 2;
  const landscapeDial = Math.max(200, Math.min(landscapeMainH, usableW * 0.46));
  const dialSize = landscape ? landscapeDial : portraitDial;

  const switchCar = (e: GestureResponderEvent) =>
    switchVehicle(nextVehicleId, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });

  // ---------------------------------------------------------------- piezas
  const wordmark = (
    <Pressable
      onPress={switchCar}
      hitSlop={12}
      style={styles.wordmarkBtn}
      accessibilityRole="button"
      accessibilityLabel={`Cambiar de vehículo. Ahora: ${vehicle.model}`}
    >
      <Text style={styles.wordmark} numberOfLines={1}>
        {vehicle.model.toUpperCase()}
      </Text>
      <Ionicons name="swap-horizontal" size={11} color={colors.textFaint} />
    </Pressable>
  );

  const topBar = (
    <View style={[styles.topBar, { height: landscape ? L.bar : P.bar }]}>
      <View style={styles.topSide}>
        <Clock />
        {heading.deg != null && (
          <Text style={styles.topDim}>
            {cardinal(heading.deg)} {Math.round(heading.deg)}°
          </Text>
        )}
      </View>
      {wordmark}
      <View style={[styles.topSide, styles.topRight]}>
        {status !== 'idle' && (
          <View style={styles.recChip}>
            <RecDot paused={status === 'paused'} color={accent.accent} />
            {landscape && <Text style={styles.topDim}>{status === 'paused' ? 'pausa' : 'grabando'}</Text>}
          </View>
        )}
        <GpsBars accuracy={gpsActive ? accuracy : null} />
        <IconButton icon="settings-outline" label="Garaje y ajustes" onPress={() => router.push('/garage')} />
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
      tint={accent.accent}
    >
      <CarPhoto vehicleId={vehicle.id} bodyType={vehicle.bodyType} width={dialSize * 0.6} live />
    </Speedometer>
  );

  const limitSign = (
    <LimitSign
      limitKmh={settings.speedLimit}
      enabled={settings.speedAlertEnabled}
      over={overLimit}
      shownValue={toDisplaySpeed(settings.speedLimit, unit)}
      haptics={settings.hapticsEnabled}
      size={landscape ? 34 : 42}
      showLabel={!landscape}
      onChange={update}
    />
  );

  const odometerKm = toDisplayDistanceKm((odometerM + (trip?.distanceM ?? 0)) / 1000, unit);
  const odometer = (
    <View style={styles.odometer}>
      <Text style={styles.odoValue}>
        {formatNumber(odometerKm, odometerKm < 100 ? 1 : 0)}
        <Text style={styles.odoUnit}> {distanceUnitLabel(unit)}</Text>
      </Text>
      <Text style={styles.odoLabel}>total con este carro</Text>
    </View>
  );

  const readouts = (
    <>
      <Readout label={trip ? 'viaje' : 'sesión'} value={formatDistance(shown.distanceM, unit)} delay={150} />
      <Readout label="tiempo" value={formatDuration(shown.durationMs)} delay={230} />
      <Readout label="media" value={formatNumber(toDisplaySpeed(shown.avgMovingKmh, unit))} unit={unitLabel} delay={310} />
      <Readout label="máxima" value={formatNumber(toDisplaySpeed(shown.maxSpeedKmh, unit))} unit={unitLabel} delay={390} />
    </>
  );

  // Fuerzas medidas, en una línea discreta: el carro de la foto ya las muestra moviéndose.
  const forces = (
    <Text style={styles.forces} numberOfLines={1}>
      {motionOk ? `curva ${Math.abs(lateralG).toFixed(2)} g` : 'curva —'}
      {'   ·   '}
      {`${longG >= 0 ? 'acelera' : 'frena'} ${Math.abs(longG).toFixed(2)} g${longCalibrated || !motionOk ? '' : ' (gps)'}`}
      {'   ·   '}
      {`pendiente ${grade >= 0 ? '+' : ''}${grade.toFixed(1)} %`}
    </Text>
  );

  const map = (style: object, fades: object, arrow: { x: number; y: number }) => (
    <MapBackdrop
      position={position}
      heading={course}
      path={path}
      tint={accent.accent}
      fades={fades}
      arrow={arrow}
      onPress={() => router.push('/map')}
      style={style}
    />
  );

  const cockpit = landscape ? (
    <View style={[styles.page, { width, paddingTop: spacing.xs, paddingBottom: bottomSpace }]}>
      {/* El mapa va de borde a borde por la izquierda y se apaga hacia el dial */}
      {map(
        { position: 'absolute', left: 0, top: 0, bottom: 0, width: width - padH - dialSize * 0.62 },
        { top: 0.24, bottom: 0.3, left: 0.06, right: 0.42 },
        { x: 0.46, y: 0.6 }
      )}
      <View style={{ paddingHorizontal: padH }}>{topBar}</View>

      <View style={[styles.landscapeMain, { paddingRight: padH }]}>
        <Animated.View entering={FadeIn.duration(600)} style={{ width: dialSize, height: dialSize }}>
          {dial}
        </Animated.View>
      </View>

      <View style={[styles.landscapeBottom, { height: L.bottom, paddingHorizontal: padH }]}>
        {odometer}
        <View style={styles.landscapeReadouts}>{readouts}</View>
        {limitSign}
        <View style={{ width: 200 }}>
          <TripControl compact />
        </View>
      </View>
    </View>
  ) : (
    <View style={[styles.page, { width, paddingTop: insets.top, paddingBottom: bottomSpace + spacing.xs }]}>
      {/* El mapa ocupa la parte de arriba de borde a borde y se apaga hacia el dial */}
      {map(
        { position: 'absolute', left: 0, right: 0, top: 0, height: portraitMapTotal },
        { top: 0.22, bottom: 0.4, left: 0.04, right: 0.04 },
        // La flecha, a media altura de la parte que se ve (sobre el dial).
        { x: 0.5, y: (insets.top + P.bar + portraitMapH * 0.52) / portraitMapTotal }
      )}
      <View style={{ paddingHorizontal: padH }}>{topBar}</View>
      <View style={{ height: portraitMapH }} pointerEvents="box-none" />

      <Animated.View
        entering={FadeIn.duration(600)}
        style={[styles.dialWrap, { width: dialSize, height: dialSize, marginTop: -portraitDial * MAP_UNDER }]}
      >
        {dial}
      </Animated.View>

      <View style={[styles.dialFooter, { paddingHorizontal: padH }]}>
        {odometer}
        <View style={{ flex: 1 }} />
        {limitSign}
      </View>

      <View style={[styles.portraitReadouts, { height: P.stats, paddingHorizontal: padH }]}>{readouts}</View>
      <View style={{ height: P.extra, paddingHorizontal: padH }}>{forces}</View>
      <View style={{ height: P.trip, justifyContent: 'center', paddingHorizontal: padH }}>
        <TripControl />
      </View>
      <Pressable onPress={() => goTo(1)} hitSlop={10} style={styles.dots} accessibilityLabel="Ir al análisis">
        <View style={[styles.pageDot, styles.pageDotOn]} />
        <View style={styles.pageDot} />
      </Pressable>
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

      <View style={styles.analysisPhoto}>
        <CarPhoto vehicleId={vehicle.id} bodyType={vehicle.bodyType} width={Math.min(usableW, landscape ? 380 : 420)} />
      </View>
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
          <LinearGradient colors={['rgba(255,45,70,0.14)', 'transparent']} style={styles.alertGlow} pointerEvents="none" />
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

/** Punto de grabación: late despacio mientras se graba, quieto en pausa. */
function RecDot({ paused, color }: { paused: boolean; color: string }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.set(paused ? withTiming(0.5) : withRepeat(withTiming(0.25, { duration: 900 }), -1, true));
  }, [paused, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.recDot, { backgroundColor: paused ? colors.textMuted : color }, style]} />;
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
  // Recortada: los haces de luz sobresalen y no deben asomar en la página de al lado.
  page: { flex: 1, overflow: 'hidden' },

  alertGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
  alertFrame: {
    ...StyleSheet.absoluteFill,
    borderWidth: 2,
    borderColor: 'rgba(255,45,70,0.7)',
    borderRadius: 52, // sigue las esquinas redondeadas de la pantalla del iPhone
  },

  pressed: { opacity: 0.55 },

  // ----- barra superior -----
  topBar: { flexDirection: 'row', alignItems: 'center' },
  topSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  topRight: { justifyContent: 'flex-end', gap: spacing.sm },
  topDim: { fontSize: 11, color: colors.textMuted, fontFamily: fonts.medium, letterSpacing: 0.8 },
  wordmarkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wordmark: { fontFamily: fonts.semibold, fontSize: 12, letterSpacing: 3.2, color: colors.text },
  recChip: { flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 4 },
  recDot: { width: 6, height: 6, borderRadius: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },

  // ----- vertical -----
  dialWrap: { alignSelf: 'center' },
  dialFooter: { flexDirection: 'row', alignItems: 'flex-end', marginTop: -50, height: 56 },
  portraitReadouts: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  forces: { fontSize: 10.5, color: colors.textFaint, fontFamily: fonts.medium, textAlign: 'center', letterSpacing: 0.4 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, height: 8 },
  pageDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textFaint },
  pageDotOn: { width: 12, backgroundColor: colors.textMuted },

  odometer: { minWidth: 92 },
  odoValue: { fontFamily: fonts.regular, fontSize: 14, color: colors.text, letterSpacing: 0.3 },
  odoUnit: { fontSize: 10, color: colors.textMuted },
  odoLabel: { fontSize: 9, color: colors.textMuted, fontFamily: fonts.medium, letterSpacing: 0.4, marginTop: 1 },

  // ----- horizontal -----
  landscapeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  dialCornerRight: { position: 'absolute', right: -6, bottom: 4 },
  landscapeBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  landscapeReadouts: { flex: 1, flexDirection: 'row', alignItems: 'center' },

  floatingTrip: { position: 'absolute' },

  // ----- análisis -----
  analysisPhoto: { alignItems: 'center', marginTop: spacing.sm },
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
