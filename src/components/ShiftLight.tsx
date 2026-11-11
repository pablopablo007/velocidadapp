import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, mono } from '@/theme/theme';
import { formatNumber } from '@/utils/format';

const SEGMENTS = 14;
/** Fracción del corte a partir de la cual empieza a encenderse la tira. */
const START_RATIO = 0.45;

type Props = {
  rpm: number | null;
  redlineRpm: number;
  gear: number | null;
  /** Oculta la marcha cuando la pantalla ya la muestra en grande. */
  showGear?: boolean;
};

/**
 * Tira de cambio de marcha, como la del volante de un carro de carreras.
 *
 * Las rpm son estimadas a partir de la velocidad, la medida de la llanta y las
 * relaciones de caja, así que sirve de guía de cuándo cambiar, no de tacómetro.
 */
function ShiftLightBase({ rpm, redlineRpm, gear, showGear = true }: Props) {
  const ratio = rpm != null ? Math.min(1, Math.max(0, rpm / redlineRpm)) : 0;
  const encendidos =
    ratio <= START_RATIO
      ? 0
      : Math.round(((ratio - START_RATIO) / (1 - START_RATIO)) * SEGMENTS);
  const enCorte = ratio >= 0.97;

  return (
    <View style={styles.wrap}>
      <View style={styles.strip}>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const activo = i < encendidos;
          const color =
            i >= SEGMENTS - 3 ? colors.danger : i >= SEGMENTS - 6 ? colors.amber : colors.lime;
          return (
            <View
              key={i}
              style={[
                styles.segment,
                { backgroundColor: activo ? color : colors.track },
                activo && { shadowColor: color, shadowOpacity: 0.8, shadowRadius: 4 },
                enCorte && { backgroundColor: colors.danger },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.meta}>
        {showGear && <Text style={styles.gear}>{gear != null ? `${gear}ª` : '—'}</Text>}
        <Text style={[styles.rpm, enCorte && { color: colors.danger }]}>
          {rpm != null ? `${formatNumber(Math.round(rpm / 50) * 50)} rpm` : 'sin marcha'}
        </Text>
        <Text style={styles.redline}>corte {formatNumber(redlineRpm)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 5 },
  strip: { flexDirection: 'row', gap: 3, height: 10 },
  segment: {
    flex: 1,
    borderRadius: 1,
    transform: [{ skewX: '-12deg' }], // segmentos inclinados, estilo tablero deportivo
    shadowOffset: { width: 0, height: 0 },
  },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gear: { fontSize: 13, fontWeight: '900', fontStyle: 'italic', color: colors.accent, minWidth: 26 },
  rpm: { fontSize: 11, color: colors.textMuted, fontFamily: mono },
  redline: { fontSize: 9, color: colors.textFaint, fontFamily: mono, minWidth: 74, textAlign: 'right' },
});

export const ShiftLight = memo(ShiftLightBase);
