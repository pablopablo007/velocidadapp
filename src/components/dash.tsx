import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { memo, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { useSettings } from '@/state/SettingsContext';
import { useTracking } from '@/state/TrackingContext';
import { colors, fonts, radius, spacing } from '@/theme/theme';
import { useAccent } from '@/theme/accent';
import { arcPath, polar } from '@/utils/gauge';

/*
 * Instrumentos del tablero. Todos muestran datos medidos: si un dato no está
 * disponible se ve "—", nunca un valor inventado.
 */

// ------------------------------------------------------------------ MiniGauge

const MINI_START = 150;
const MINI_SWEEP = 240;

/** Medidor en arco pequeño, como los laterales de un tablero digital. */
export const MiniGauge = memo(function MiniGauge({
  label,
  value,
  min,
  max,
  unit,
  decimals = 0,
  size = 120,
  tint = colors.text,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  unit: string;
  decimals?: number;
  size?: number;
  tint?: string;
}) {
  const c = size / 2;
  const r = size / 2 - 6;
  const ratio = value == null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const end = MINI_START + ratio * MINI_SWEEP;
  const marcas = 9;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Path d={arcPath(c, c, r, MINI_START, MINI_START + MINI_SWEEP)} stroke={colors.track} strokeWidth={2} fill="none" />
        {Array.from({ length: marcas }, (_, i) => {
          const deg = MINI_START + (i / (marcas - 1)) * MINI_SWEEP;
          const a = polar(c, c, r - 7, deg);
          const b = polar(c, c, r - 13, deg);
          const on = value != null && deg <= end + 0.01;
          return (
            <Line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={on ? tint : colors.textFaint}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          );
        })}
        {value != null && ratio > 0.005 && (
          <Path d={arcPath(c, c, r, MINI_START, end)} stroke={tint} strokeWidth={3} strokeLinecap="round" fill="none" />
        )}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text style={styles.miniLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.miniValue, { fontSize: size * 0.22 }]} numberOfLines={1} adjustsFontSizeToFit>
          {value == null ? '—' : value.toFixed(decimals)}
        </Text>
        <Text style={styles.miniUnit}>{unit}</Text>
      </View>
    </View>
  );
});

// --------------------------------------------------------------------- GMeter

const G_MAX = 0.75;

/**
 * Círculo de fuerzas G: arriba acelerar, abajo frenar, a los lados las curvas.
 * La lateral sale del giroscopio y la longitudinal del GPS, las dos medidas.
 */
export const GMeter = memo(function GMeter({
  lateralG,
  longG,
  size = 120,
  active = true,
}: {
  lateralG: number;
  longG: number;
  size?: number;
  active?: boolean;
}) {
  const accent = useAccent();
  const c = size / 2;
  const R = size / 2 - 12;
  const clampR = (x: number, y: number) => {
    const d = Math.hypot(x, y);
    return d > R ? { x: (x / d) * R, y: (y / d) * R } : { x, y };
  };
  const p = clampR((lateralG / G_MAX) * R, (-longG / G_MAX) * R);

  // Estela de las últimas lecturas. Se actualiza durante el render cuando
  // cambia la lectura (patrón recomendado por React para derivar estado).
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const key = `${lateralG.toFixed(3)}|${longG.toFixed(3)}`;
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setTrail((t) => [...t.slice(-24), p]);
  }

  const total = Math.hypot(lateralG, longG);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {[0.33, 0.66, 1].map((f) => (
          <Circle key={f} cx={c} cy={c} r={R * f} stroke={f === 1 ? colors.borderStrong : colors.track} strokeWidth={1} fill="none" />
        ))}
        <Line x1={c - R} y1={c} x2={c + R} y2={c} stroke={colors.track} strokeWidth={1} />
        <Line x1={c} y1={c - R} x2={c} y2={c + R} stroke={colors.track} strokeWidth={1} />
        {trail.map((t, i, arr) => (
          <Circle key={i} cx={c + t.x} cy={c + t.y} r={1.6} fill={colors.blue} opacity={(i / arr.length) * 0.5} />
        ))}
        <Circle cx={c + p.x} cy={c + p.y} r={5} fill={active ? accent.accent : colors.textFaint} />
        <SvgText x={c} y={9} fill={colors.textMuted} fontSize={8} textAnchor="middle">acel</SvgText>
        <SvgText x={c} y={size - 2} fill={colors.textMuted} fontSize={8} textAnchor="middle">freno</SvgText>
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.gReadout]} pointerEvents="none">
        <Text style={styles.gValue}>{total.toFixed(2)}</Text>
        <Text style={styles.miniUnit}>g</Text>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------- LinearMeter

/** Barra fina con escala, como las inferiores de un tablero digital. */
export const LinearMeter = memo(function LinearMeter({
  label,
  valueText,
  value,
  min,
  max,
  scale,
  bipolar = false,
  tint = colors.text,
}: {
  label: string;
  valueText: string;
  value: number | null;
  min: number;
  max: number;
  /** Cifras bajo la barra. */
  scale?: (string | number)[];
  /** Si la barra crece desde el centro (valores con signo). */
  bipolar?: boolean;
  tint?: string;
}) {
  const ratio = value == null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const fill = bipolar
    ? { left: `${Math.min(ratio, 0.5) * 100}%` as const, width: `${Math.abs(ratio - 0.5) * 100}%` as const }
    : { left: '0%' as const, width: `${ratio * 100}%` as const };

  return (
    <View style={styles.linear}>
      <View style={styles.linearTrack}>
        {value != null && <View style={[styles.linearFill, fill, { backgroundColor: tint }]} />}
        {bipolar && <View style={styles.linearCenter} />}
      </View>
      {scale && (
        <View style={styles.linearScale}>
          {scale.map((s, i) => (
            <Text key={i} style={styles.linearScaleText}>
              {s}
            </Text>
          ))}
        </View>
      )}
      <View style={styles.linearRow}>
        <Text style={styles.linearLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.linearValue, { color: tint === colors.text ? colors.text : tint }]} numberOfLines={1}>
          {valueText}
        </Text>
      </View>
    </View>
  );
});

// -------------------------------------------------------------------- Reloj

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function DashClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return (
    <View style={styles.clock}>
      <Text style={styles.clockTime}>
        {hh}:{mm}
      </Text>
      <Text style={styles.clockDate}>
        {DIAS[now.getDay()]} {now.getDate()} {MESES[now.getMonth()]}
      </Text>
    </View>
  );
}

// --------------------------------------------------------------- TripControl

/**
 * El único sitio desde el que se controla un viaje. Con los viajes
 * automáticos activos no hace falta tocarlo: empieza al arrancar y se guarda
 * al llevar un rato detenido.
 */
export function TripControl({ compact = false }: { compact?: boolean }) {
  const accent = useAccent();
  const router = useRouter();
  const { settings } = useSettings();
  const { status, savingTrip, start, pause, resume, stop, discard } = useTracking();

  const finish = () => {
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

  if (status === 'idle') {
    if (settings.autoTrips) {
      return (
        <View style={[styles.tripRow, compact && styles.tripRowCompact]}>
          <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
          <Text style={styles.tripHint} numberOfLines={1}>
            {compact ? 'Viaje automático' : 'Viaje automático: empieza al arrancar'}
          </Text>
          <Pressable onPress={start} style={({ pressed }) => [styles.pill, pressed && styles.pressed]} hitSlop={8}>
            <Ionicons name="play" size={12} color={colors.text} />
            <Text style={styles.pillText}>Ahora</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <Pressable onPress={start} style={({ pressed }) => [styles.bigButton, compact && styles.bigButtonCompact, pressed && styles.pressed]}>
        <Ionicons name="play" size={16} color={colors.bg} />
        <Text style={styles.bigButtonText}>Iniciar viaje</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.tripRow, compact && styles.tripRowCompact]}>
      <View style={[styles.dot, { backgroundColor: status === 'recording' ? accent.accent : colors.amber }]} />
      <Text style={[styles.tripHint, { color: colors.text }]} numberOfLines={1}>
        {status === 'recording' ? 'Grabando viaje' : 'En pausa'}
      </Text>
      <Pressable
        onPress={status === 'paused' ? resume : pause}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
        hitSlop={8}
      >
        <Ionicons name={status === 'paused' ? 'play' : 'pause'} size={12} color={colors.text} />
        {!compact && <Text style={styles.pillText}>{status === 'paused' ? 'Seguir' : 'Pausa'}</Text>}
      </Pressable>
      <Pressable
        onPress={finish}
        disabled={savingTrip}
        style={({ pressed }) => [styles.pill, { backgroundColor: accent.accentDim }, (pressed || savingTrip) && styles.pressed]}
        hitSlop={8}
      >
        <Ionicons name="stop" size={12} color={accent.accent} />
        <Text style={[styles.pillText, { color: accent.accent }]}>{savingTrip ? '…' : 'Fin'}</Text>
      </Pressable>
    </View>
  );
}

// ------------------------------------------------------------------- Panel

/** Panel opaco con filo fino: la superficie base del tablero. */
export function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function DashStat({
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
    <View style={styles.stat}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
        {!!unit && <Text style={styles.statUnit}> {unit}</Text>}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------- StatCard

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Tarjeta de un dato del viaje: ícono, nombre y cifra, con un resplandor del
 * color indicado en el borde derecho.
 */
export const StatCard = memo(function StatCard({
  icon,
  label,
  value,
  unit,
  tint = colors.text,
  glow,
  large = false,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  /** Color del ícono y, si se quiere destacar, de la cifra. */
  tint?: string;
  /** Color del resplandor del borde; por defecto, el del ícono. */
  glow?: string;
  /** Más alta y con la cifra más grande (tablero en horizontal). */
  large?: boolean;
}) {
  const edge = glow ?? tint;
  return (
    <View style={[styles.statCard, large && styles.statCardLarge]}>
      <LinearGradient
        colors={[`${edge}00`, `${edge}26`]}
        start={{ x: 0.45, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.statCardEdge, { backgroundColor: edge }]} />
      <Ionicons name={icon} size={large ? 24 : 19} color={tint} style={styles.statCardIcon} />
      <View style={styles.statCardBody}>
        <Text style={[styles.statCardLabel, large && styles.statCardLabelLarge]} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={[styles.statCardValue, large && styles.statCardValueLarge, { color: tint === colors.textMuted ? colors.text : tint }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.65}
        >
          {value}
          {!!unit && <Text style={styles.statCardUnit}> {unit}</Text>}
        </Text>
      </View>
    </View>
  );
});

/** Celda de la fila inferior del tablero: algo a la izquierda, nombre y cifra. */
export function InfoCell({
  lead,
  label,
  value,
  tint = colors.text,
}: {
  /** Ícono o mini instrumento a la izquierda. */
  lead: React.ReactNode;
  label: string;
  value: string;
  tint?: string;
}) {
  return (
    <View style={styles.infoCell}>
      {lead}
      <View style={styles.infoBody}>
        <Text style={styles.infoLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.infoValue, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.55 },

  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  statCardLarge: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  statCardEdge: { position: 'absolute', right: 0, top: '30%', bottom: '30%', width: 1.5, opacity: 0.55 },
  statCardIcon: { width: 26, textAlign: 'center' },
  statCardBody: { flex: 1 },
  statCardLabel: { fontSize: 10, color: colors.textMuted, fontFamily: fonts.medium, letterSpacing: 0.2 },
  statCardLabelLarge: { fontSize: 12 },
  statCardValue: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 21, letterSpacing: -0.2 },
  statCardValueLarge: { fontSize: 26, lineHeight: 31 },
  statCardUnit: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted },

  infoCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm },
  infoBody: { flex: 1 },
  infoLabel: { fontSize: 9.5, color: colors.textMuted, fontFamily: fonts.medium, letterSpacing: 0.2 },
  infoValue: { fontSize: 15, lineHeight: 19, fontFamily: fonts.medium },

  miniLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '500', marginTop: 4 },
  miniValue: { fontFamily: fonts.medium, color: colors.text, marginVertical: -2 },
  miniUnit: { fontSize: 10, color: colors.textMuted, fontWeight: '500' },

  gReadout: { alignItems: 'flex-end', justifyContent: 'flex-end', paddingRight: 2, paddingBottom: 12 },
  gValue: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },

  linear: { flex: 1, gap: 4 },
  linearTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  linearFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 2 },
  linearCenter: {
    position: 'absolute',
    left: '50%',
    top: -2,
    bottom: -2,
    width: 1,
    backgroundColor: colors.textMuted,
  },
  linearScale: { flexDirection: 'row', justifyContent: 'space-between' },
  linearScaleText: { fontSize: 8, color: colors.textFaint, fontFamily: fonts.regular },
  linearRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 },
  linearLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '500', flexShrink: 1 },
  linearValue: { fontSize: 13, fontFamily: fonts.medium, color: colors.text },

  clock: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  clockTime: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  clockDate: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },

  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingLeft: spacing.md,
    paddingRight: 6,
  },
  tripRowCompact: { paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  tripHint: { flex: 1, fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceStrong,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  pillText: { fontSize: 12, fontWeight: '600', color: colors.text },
  bigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.text,
    borderRadius: radius.pill,
    paddingVertical: 14,
  },
  bigButtonCompact: { paddingVertical: 9 },
  bigButtonText: { fontSize: 15, fontWeight: '700', color: colors.bg },

  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: { flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '500', marginBottom: 2 },
  statValue: { fontFamily: fonts.medium, fontSize: 22, letterSpacing: -0.3 },
  statUnit: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted },
});
