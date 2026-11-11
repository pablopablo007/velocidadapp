import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CarShowcase } from '@/components/CarShowcase';
import { CarSpinner } from '@/components/CarSpinner';
import { colors, radius, spacing } from '@/theme/theme';
import { Vehicle } from '@/vehicles/polo';

function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

type Props = {
  vehicle: Vehicle;
  frames: string[];
  driverName?: string;
  onPressOptions?: () => void;
};

/**
 * Tarjeta del carro. Con fotos propias tomadas alrededor del carro gira en
 * 360° al arrastrarla; sin ellas muestra el Polo Track (foto) o la Pick Up (dibujo) en 3D, que se
 * inclina con el giroscopio.
 */
function CarHeroBase({ vehicle, frames, driverName, onPressOptions }: Props) {
  const saludo = driverName ? `${greeting()}, ${driverName}` : greeting();

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{saludo}</Text>
          <Text style={styles.model} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {vehicle.model}
          </Text>
          <Text style={styles.trim} numberOfLines={1}>
            {vehicle.year} · {vehicle.trim} · {vehicle.powerCv} CV
          </Text>
        </View>
        {onPressOptions && (
          <Pressable
            onPress={onPressOptions}
            hitSlop={10}
            style={({ pressed }) => [styles.optionsButton, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Fotos del carro"
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
          </Pressable>
        )}
      </View>

      {frames.length > 0 ? (
        <View style={styles.stage}>
          <CarSpinner frames={frames} height={200} />
        </View>
      ) : (
        <CarShowcase height={220} bodyType={vehicle.bodyType} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.xl },
  greeting: { fontSize: 13, color: colors.textMuted, fontWeight: '500', letterSpacing: 0.2 },
  model: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.8,
    marginTop: 2,
  },
  trim: { fontSize: 13, color: colors.textMuted, fontWeight: '500', marginTop: 2 },
  optionsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: { marginTop: spacing.md, height: 200 },
});

export const CarHero = memo(CarHeroBase);
