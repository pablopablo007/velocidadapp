import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts } from '@/theme/theme';
import { ECUADOR_LIMITS } from '@/utils/altitude';

/*
 * Piezas de la cabina. Todo va directo sobre el negro, sin tarjetas ni
 * bordes: blanco para lo que importa, gris para las etiquetas y el color del
 * carro solo en lo que está vivo.
 */

// ------------------------------------------------------------------ LimitSign

/** Opciones de la señal: los límites de Ecuador y "sin aviso". */
const LIMIT_CYCLE: (number | null)[] = [...ECUADOR_LIMITS.map((l) => l.kmh), null];

/**
 * Señal de límite, como la de la vía: círculo blanco con anillo rojo.
 * Tocarla pasa al siguiente límite de Ecuador (50 → 60 → 90 → 100 → sin aviso),
 * para cambiarlo sin salir del tablero. Late cuando vas por encima.
 */
export const LimitSign = memo(function LimitSign({
  limitKmh,
  enabled,
  over,
  shownValue,
  size = 44,
  haptics = true,
  showLabel = true,
  onChange,
}: {
  limitKmh: number;
  enabled: boolean;
  over: boolean;
  /** Cifra a mostrar (en la unidad elegida). */
  shownValue: number;
  size?: number;
  haptics?: boolean;
  showLabel?: boolean;
  onChange: (next: { speedLimit?: number; speedAlertEnabled: boolean }) => void;
}) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (over) {
      pulse.set(
        withRepeat(
          withSequence(
            withTiming(1.12, { duration: 380, easing: Easing.out(Easing.quad) }),
            withTiming(1, { duration: 380, easing: Easing.in(Easing.quad) })
          ),
          -1
        )
      );
    } else {
      cancelAnimation(pulse);
      pulse.set(withTiming(1, { duration: 200 }));
    }
  }, [over, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const next = () => {
    const i = enabled ? LIMIT_CYCLE.indexOf(limitKmh) : LIMIT_CYCLE.length - 1;
    const n = LIMIT_CYCLE[(i + 1) % LIMIT_CYCLE.length];
    if (haptics) Haptics.selectionAsync().catch(() => {});
    onChange(n == null ? { speedAlertEnabled: false } : { speedLimit: n, speedAlertEnabled: true });
  };

  const label = ECUADOR_LIMITS.find((l) => l.kmh === limitKmh)?.label;

  return (
    <Pressable
      onPress={next}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={enabled ? `Límite ${limitKmh} kilómetros por hora. Toca para cambiarlo` : 'Sin aviso de límite. Toca para activarlo'}
      style={styles.limitWrap}
    >
      <Animated.View
        style={[
          styles.sign,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: size * 0.12,
            borderColor: enabled ? colors.danger : colors.textFaint,
            backgroundColor: enabled ? '#F5F5F7' : 'transparent',
          },
          style,
        ]}
      >
        <Text style={[styles.signText, { fontSize: size * 0.36, color: enabled ? '#0A0A0B' : colors.textMuted }]} allowFontScaling={false}>
          {enabled ? Math.round(shownValue) : '—'}
        </Text>
      </Animated.View>
      {showLabel && (
        <Text style={styles.signLabel} numberOfLines={1}>
          {enabled ? (label ?? 'límite').toLowerCase() : 'sin aviso'}
        </Text>
      )}
    </Pressable>
  );
});

// --------------------------------------------------------------------- Clock

export function Clock({ size = 15 }: { size?: number }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  return (
    <Text style={[styles.clock, { fontSize: size }]}>
      {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
    </Text>
  );
}

// ------------------------------------------------------------------- Readout

/** Dato del tablero: cifra arriba, etiqueta abajo. Entra con un fundido. */
export const Readout = memo(function Readout({
  label,
  value,
  unit,
  align = 'center',
  big = false,
  tint = colors.text,
  delay = 0,
}: {
  label: string;
  value: string;
  unit?: string;
  align?: 'left' | 'center' | 'right';
  big?: boolean;
  tint?: string;
  /** Retraso de la entrada, para que los datos aparezcan uno tras otro. */
  delay?: number;
}) {
  const alignItems = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  return (
    <Animated.View entering={FadeIn.delay(delay).duration(500)} style={[styles.readout, { alignItems }]}>
      <Text style={[styles.readoutValue, big && styles.readoutValueBig, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
        {!!unit && <Text style={styles.readoutUnit}> {unit}</Text>}
      </Text>
      <Text style={styles.readoutLabel} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  );
});

// --------------------------------------------------------------- GpsStatus

/** Señal del GPS: tres barras finas, blancas si la precisión es buena. */
export function GpsBars({ accuracy }: { accuracy: number | null }) {
  const bars = accuracy == null ? 0 : accuracy <= 8 ? 3 : accuracy <= 20 ? 2 : 1;
  const tint = bars === 1 ? colors.danger : colors.text;
  return (
    <View style={styles.bars} accessibilityLabel={accuracy == null ? 'Buscando GPS' : `GPS con precisión de ${Math.round(accuracy)} metros`}>
      {[1, 2, 3].map((n) => (
        <View key={n} style={[styles.bar, { height: 3 + n * 3, backgroundColor: n <= bars ? tint : colors.textFaint }]} />
      ))}
    </View>
  );
}

// --------------------------------------------------------------- IconButton

export function IconButton({
  icon,
  onPress,
  label,
  tint = colors.textMuted,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  label: string;
  tint?: string;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]}>
      <Ionicons name={icon} size={18} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  limitWrap: { alignItems: 'center', gap: 3 },
  sign: { alignItems: 'center', justifyContent: 'center' },
  signText: { fontFamily: fonts.bold, letterSpacing: -0.5, includeFontPadding: false },
  signLabel: { fontSize: 9, color: colors.textMuted, fontFamily: fonts.medium, letterSpacing: 0.4 },

  clock: { fontFamily: fonts.regular, color: colors.text, letterSpacing: 0.5 },

  readout: { flex: 1, minWidth: 0 },
  readoutValue: { fontFamily: fonts.regular, fontSize: 19, lineHeight: 23, letterSpacing: 0.2 },
  readoutValueBig: { fontSize: 24, lineHeight: 28 },
  readoutUnit: { fontSize: 11, color: colors.textMuted, fontFamily: fonts.regular },
  readoutLabel: { fontSize: 10, color: colors.textMuted, fontFamily: fonts.medium, letterSpacing: 0.6, marginTop: 1, textTransform: 'lowercase' },

  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 },
  bar: { width: 3, borderRadius: 1 },

  iconBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});
