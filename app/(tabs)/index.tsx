import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CarShowcase } from '@/components/CarShowcase';
import { DashClock, InfoCell, Panel, StatCard, TripControl } from '@/components/dash';
import { MiniMap } from '@/components/MiniMap';
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
  const { status, permission, gpsActive, live, trip, path, position, overLimit, requestPermission } = useTracking();

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
  const GAP = spacing.sm;

  // Vertical: todo lo que no es dial ni mapa tiene alto fijo; el dial toma lo
  // que queda después de reservarle un mínimo al mapa.
  const P = { clock: 18, title: 36, cards: 126, info: 46, trip: 44, dots: 6, mapMin: 118 };
  const innerH = height - (insets.top + spacing.xs) - (bottomSpace + spacing.sm);
  const portraitFixed = P.clock + P.title + P.cards + P.info + P.trip + P.dots + GAP * 7;
  // El aro deja libre el 12 % inferior del cuadro: la fila siguiente se mete ahí.
  const DIAL_VISIBLE = 0.88;
  const portraitDial = Math.max(
    200,
    Math.min(usableW - 24, 330, (innerH - portraitFixed - P.mapMin) / DIAL_VISIBLE)
  );

  // Horizontal: cabecera arriba, fila de datos abajo y el dial ocupa el alto que queda.
  const L = { header: 30, bottom: 46 };
  const landscapeMainH = height - spacing.sm - bottomSpace - L.header - L.bottom - GAP * 2;
  const landscapeDial = Math.max(180, Math.min(landscapeMainH, usableW * 0.4));

  const dialSize = landscape ? landscapeDial : portraitDial;
  // En horizontal el tablero es azul; en vertical lleva el color del carro.
  const dialTint = landscape ? colors.electric : accent.accent;

  const switchCar = (e: GestureResponderEvent) =>
    switchVehicle(nextVehicleId, { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });

  // ---------------------------------------------------------------- piezas
  const gpsChip = (
    <View style={styles.gpsChip}>
      <View style={[styles.dot, { backgroundColor: gps.tint }]} />
      <Text style={[styles.gpsText, { color: gps.tint }]}>{gps.label}</Text>
      {accuracy != null && <Text style={styles.gpsDim}>±{Math.round(accuracy)} m</Text>}
    </View>
  );

  // Nombre del carro: la primera palabra en blanco y el resto en su color.
  const [modelHead, ...modelRest] = vehicle.model.split(' ');
  const title = (compact: boolean) => (
    <Text
      style={[styles.title, compact && styles.titleCompact]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
    >
      {modelHead}
      {modelRest.length > 0 && <Text style={{ color: accent.accent }}> {modelRest.join(' ')}</Text>}
    </Text>
  );
  const steerButton = (
    <Pressable
      onPress={switchCar}
      hitSlop={10}
      style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Cambiar de vehículo. Ahora: ${vehicle.model}`}
    >
      <MaterialCommunityIcons name="steering" size={20} color={colors.textMuted} />
    </Pressable>
  );
  const gearButton = (
    <Pressable
      onPress={() => router.push('/garage')}
      hitSlop={10}
      style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Garaje y ajustes"
    >
      <Ionicons name="settings-outline" size={18} color={colors.textMuted} />
    </Pressable>
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
      tint={dialTint}
      // En horizontal el carro va en el hueco de abajo: la cifra sube un poco.
      centerShift={landscape ? -0.075 : -0.02}
      caption={
        overLimit && limitShown != null
          ? `límite ${limitShown}`
          : landscape && heading.deg != null
            ? `${cardinal(heading.deg)} · ${Math.round(heading.deg)}°`
            : 'velocidad'
      }
    />
  );

  const curveText = motionOk
    ? `${lateralG < -0.03 ? '‹ ' : ''}${Math.abs(lateralG).toFixed(2)}${lateralG > 0.03 ? ' ›' : ''}`
    : '—';

  // Tarjeta del carro en vivo: se inclina, cabecea y enciende los frenos de verdad.
  const carCard = (
    <Pressable
      onPress={() => goTo(1)}
      style={[styles.carCard, { borderColor: `${accent.accent}40` }]}
      accessibilityRole="button"
      accessibilityLabel="Tu carro en vivo. Toca para ver el análisis"
    >
      <LinearGradient
        colors={[accent.accentDim, 'rgba(10,10,11,0)']}
        start={{ x: 0, y: 1 }}
        end={{ x: 0.9, y: 0 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Haces de luz en diagonal, del color del carro */}
      <View style={[styles.beam, { backgroundColor: accent.accent, left: '-8%', transform: [{ rotate: '-52deg' }] }]} />
      <View style={[styles.beam, { backgroundColor: accent.accent, right: '-8%', transform: [{ rotate: '52deg' }] }]} />
      <View style={styles.carStage} pointerEvents="none">
        <LiveCar size={P.cards + 50} bodyType={vehicle.bodyType} lateralG={lateralG} active={motionOk} bare />
      </View>
      <View style={styles.carReadout} pointerEvents="none">
        <Text style={styles.carLabel}>Curva</Text>
        <Text style={styles.carValue}>
          {curveText}
          <Text style={styles.carUnit}> g</Text>
        </Text>
      </View>
    </Pressable>
  );

  const statCards = (large: boolean) => (
    <>
      <StatCard
        icon="location"
        label="Distancia"
        value={formatDistance(shown.distanceM, unit)}
        tint={colors.electricSoft}
        glow={landscape ? colors.electric : accent.accent}
        large={large}
      />
      <StatCard
        icon="time-outline"
        label={trip ? 'Tiempo de viaje' : 'Sesión'}
        value={formatDuration(shown.durationMs)}
        tint={colors.textMuted}
        glow={landscape ? colors.electric : accent.accent}
        large={large}
      />
      <StatCard
        icon="speedometer"
        label="Máxima"
        value={formatNumber(toDisplaySpeed(shown.maxSpeedKmh, unit))}
        unit={unitLabel}
        tint={accent.accent}
        large={large}
      />
    </>
  );

  const miniMap = (
    <MiniMap
      position={position}
      heading={course}
      path={path}
      accuracy={gpsActive ? accuracy : null}
      tint={colors.electric}
      edge={landscape ? colors.electric : accent.accent}
      onPress={() => router.push('/map')}
      style={landscape ? styles.mapLandscape : styles.mapPortrait}
    />
  );

  const accelState = longG > 0.03 ? 'acelera' : longG < -0.03 ? 'frena' : null;
  const infoRow = (
    <Panel style={[styles.infoRow, { height: landscape ? L.bottom : P.info }]}>
      <InfoCell
        lead={<AccelRing size={30} longG={longG} calibrated={longCalibrated} compact />}
        label={accelState ? `Aceleración · ${accelState}` : 'Aceleración'}
        value={`${longG >= 0 ? '+' : '−'}${Math.abs(longG).toFixed(2)} g`}
        tint={accelState === 'acelera' ? dialTint : accelState === 'frena' ? colors.danger : colors.text}
      />
      <View style={styles.vDivider} />
      <InfoCell
        lead={
          <Ionicons
            name={grade > 0.8 ? 'trending-up' : grade < -0.8 ? 'trending-down' : 'remove'}
            size={18}
            color={gradeColor(grade)}
          />
        }
        label="Pendiente"
        value={`${grade >= 0 ? '+' : ''}${grade.toFixed(1)} %`}
        tint={gradeColor(grade) === colors.textMuted ? colors.text : gradeColor(grade)}
      />
      <View style={styles.vDivider} />
      <InfoCell
        lead={<Ionicons name="cloud-outline" size={18} color={colors.electricSoft} />}
        label={sensors.baro.status === 'activo' ? 'Presión (barómetro)' : 'Presión'}
        value={pressureHpa != null ? `${Math.round(pressureHpa)} hPa` : '—'}
        tint={colors.electricSoft}
      />
    </Panel>
  );

  // Dos puntos: esta página y la de análisis (se desliza de lado).
  const pageDots = (
    <Pressable onPress={() => goTo(1)} hitSlop={10} style={styles.dots} accessibilityLabel="Ir al análisis">
      <View style={[styles.pageDot, { backgroundColor: accent.accent, width: 14 }]} />
      <View style={styles.pageDot} />
    </Pressable>
  );

  const cockpit = landscape ? (
    <View style={[styles.page, { width, gap: GAP, paddingTop: spacing.sm, paddingBottom: bottomSpace, paddingHorizontal: padH }]}>
      {/* Ambiente azul: luz que baja desde arriba y dos haces hacia el dial */}
      <LinearGradient
        colors={['rgba(61,139,255,0.20)', 'rgba(61,139,255,0)']}
        style={[styles.ambient, { height: height * 0.55 }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(61,139,255,0)', colors.electric, 'rgba(61,139,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.ambientLine, { top: spacing.sm + L.header + GAP / 2 }]}
        pointerEvents="none"
      />
      <View style={[styles.headerRow, { height: L.header }]}>
        {steerButton}
        <DashClock />
        <View style={styles.headerFill}>{title(true)}</View>
        {gpsChip}
        {gearButton}
      </View>

      <View style={styles.landscapeMain}>
        {miniMap}
        <View style={{ width: dialSize, height: dialSize }}>
          {/* Resplandor azul detrás del dial */}
          <View style={[styles.dialGlow, { shadowColor: colors.electric, backgroundColor: colors.electricDim }]} />
          {dial}
          {/* El carro, en el hueco inferior del aro */}
          <View style={[styles.dialCar, { bottom: -dialSize * 0.035 }]} pointerEvents="none">
            <LiveCar
              size={dialSize * 0.44}
              bodyType={vehicle.bodyType}
              lateralG={lateralG}
              active={motionOk}
              tint={colors.electric}
              bare
            />
          </View>
        </View>
        <View style={styles.landscapeStats}>{statCards(true)}</View>
      </View>

      <View style={[styles.landscapeBottom, { height: L.bottom }]}>
        <View style={{ flex: 1.55 }}>{infoRow}</View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <TripControl compact />
        </View>
      </View>
    </View>
  ) : (
    <View
      style={[
        styles.page,
        { width, gap: GAP, paddingTop: insets.top + spacing.xs, paddingBottom: bottomSpace + spacing.sm, paddingHorizontal: padH },
      ]}
    >
      {/* Ambiente del color del carro: luz desde arriba y dos haces a los lados del dial */}
      <LinearGradient
        colors={[`${accent.accent}2E`, `${accent.accent}00`]}
        style={[styles.ambient, { height: insets.top + P.clock + P.title + dialSize * 0.6 }]}
        pointerEvents="none"
      />
      {[-1, 1].map((side) => (
        <LinearGradient
          key={side}
          colors={[`${accent.accent}00`, `${accent.accent}B0`, `${accent.accent}00`]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          pointerEvents="none"
          style={[
            styles.streak,
            {
              top: insets.top + P.clock + P.title + GAP * 2 + dialSize * 0.72,
              width: width * 0.5,
              [side < 0 ? 'left' : 'right']: -width * 0.2,
              transform: [{ rotate: `${side * 34}deg` }],
            },
          ]}
        />
      ))}
      <View style={[styles.headerRow, { height: P.clock }]}>
        <DashClock />
        <View style={styles.headerFill} />
        {gpsChip}
      </View>

      <View style={[styles.headerRow, { height: P.title }]}>
        {steerButton}
        <View style={styles.titleBlock}>
          {title(false)}
          <LinearGradient
            colors={[accent.accent, `${accent.accent}00`]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.titleLine}
          />
        </View>
        {gearButton}
      </View>

      <View style={[styles.centered, { height: dialSize * DIAL_VISIBLE }]}>
        <View style={{ width: dialSize, height: dialSize, marginTop: dialSize * (1 - DIAL_VISIBLE) }}>{dial}</View>
      </View>

      <View style={[styles.cardsRow, { height: P.cards }]}>
        {carCard}
        <View style={styles.statsCol}>{statCards(false)}</View>
      </View>

      {miniMap}
      {infoRow}
      <View style={{ height: P.trip, justifyContent: 'center' }}>
        <TripControl />
      </View>
      {pageDots}
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
  // Recortada: los haces de luz sobresalen y no deben asomar en la página de al lado.
  page: { flex: 1, gap: spacing.md, overflow: 'hidden' },

  alertGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 180 },
  alertFrame: {
    ...StyleSheet.absoluteFill,
    borderWidth: 3,
    borderColor: colors.danger,
    borderRadius: 52, // sigue las esquinas redondeadas de la pantalla del iPhone
  },

  // ----- ambiente -----
  ambient: { position: 'absolute', left: 0, right: 0, top: 0 },
  ambientLine: { position: 'absolute', left: '18%', right: '18%', height: 1, opacity: 0.55 },
  streak: { position: 'absolute', height: 1.5, opacity: 0.5 },

  // ----- cabecera -----
  pressed: { opacity: 0.55 },

  // ----- cabecera -----
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gpsChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gpsText: { fontSize: 11, fontFamily: fonts.medium },
  gpsDim: { fontSize: 11, color: colors.textFaint, fontFamily: mono },
  dot: { width: 7, height: 7, borderRadius: 4 },
  roundButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  titleBlock: { flex: 1, justifyContent: 'center' },
  title: { fontFamily: fonts.boldItalic, fontSize: 25, lineHeight: 29, color: colors.text, letterSpacing: 0.3 },
  titleCompact: { fontSize: 18, lineHeight: 22, textAlign: 'center' },
  titleLine: { height: 2, borderRadius: 1, marginTop: 1 },

  // ----- vertical -----
  cardsRow: { flexDirection: 'row', gap: spacing.sm },
  carCard: {
    flex: 1.12,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  beam: { position: 'absolute', top: '18%', width: '62%', height: 1.5, opacity: 0.35 },
  carStage: { position: 'absolute', left: 0, right: 0, top: -38, alignItems: 'center' },
  carReadout: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 5,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
  },
  carLabel: { fontSize: 11, color: colors.textMuted, fontFamily: fonts.medium, letterSpacing: 0.3 },
  carValue: { fontSize: 18, lineHeight: 22, fontFamily: fonts.medium, color: colors.text },
  carUnit: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted },
  statsCol: { flex: 1, gap: 6 },
  mapPortrait: { flex: 1, minHeight: 90 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs },
  vDivider: { width: 1, alignSelf: 'stretch', marginVertical: spacing.sm, backgroundColor: colors.border },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, height: 6 },
  pageDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textFaint },

  // ----- horizontal -----
  landscapeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  mapLandscape: { flex: 1, alignSelf: 'stretch' },
  landscapeStats: { flex: 1, alignSelf: 'stretch', gap: spacing.sm },
  dialGlow: {
    position: 'absolute',
    left: '18%',
    right: '18%',
    top: '18%',
    bottom: '18%',
    borderRadius: 999,
    shadowOpacity: 0.9,
    shadowRadius: 46,
    shadowOffset: { width: 0, height: 0 },
  },
  dialCar: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  landscapeBottom: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md },

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
