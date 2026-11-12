import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSettings } from '@/state/SettingsContext';
import { useTracking } from '@/state/TrackingContext';
import { colors, fonts, radius, spacing } from '@/theme/theme';
import { useAccent } from '@/theme/accent';

/*
 * Control del viaje del tablero: sin tarjeta, solo texto y botones con filo fino.
 */

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
        <Ionicons name="play" size={14} color={colors.text} />
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
        style={({ pressed }) => [styles.pill, { borderColor: `${accent.accent}88` }, (pressed || savingTrip) && styles.pressed]}
        hitSlop={8}
      >
        <Ionicons name="stop" size={12} color={accent.accent} />
        <Text style={[styles.pillText, { color: accent.accent }]}>{savingTrip ? '…' : 'Fin'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.55 },

  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  tripRowCompact: { paddingVertical: 0 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  tripHint: { flex: 1, fontSize: 12, color: colors.textMuted, fontFamily: fonts.medium, letterSpacing: 0.2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pillText: { fontSize: 12, fontFamily: fonts.medium, color: colors.text },
  bigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 11,
  },
  bigButtonCompact: { paddingVertical: 7 },
  bigButtonText: { fontSize: 14, fontFamily: fonts.medium, color: colors.text },
});
