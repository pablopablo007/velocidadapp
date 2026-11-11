import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CarSpinner } from '@/components/CarSpinner';
import { Badge, Divider, GlassCard, PrimaryButton, Row, SectionTitle } from '@/components/ui';
import {
  CarPhotos,
  MIN_FRAMES_FOR_SPIN,
  NO_PHOTOS,
  RECOMMENDED_FRAMES,
  clearCarPhotos,
  loadCarPhotos,
  photosDiskSize,
  saveCarPhotos,
} from '@/services/carPhotos';
import { colors, font, mono, radius, spacing } from '@/theme/theme';

export default function CarPhotosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [photos, setPhotos] = useState<CarPhotos>(NO_PHOTOS);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [diskKb, setDiskKb] = useState(0);

  const refresh = useCallback(async () => {
    const cargadas = await loadCarPhotos();
    setPhotos(cargadas);
    setDiskKb(Math.round(photosDiskSize() / 1024));
  }, []);

  useEffect(() => {
    // refresh es asíncrona: el setState ocurre al terminar de leer el disco,
    // no de forma síncrona como cree la regla.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch(() => {});
  }, [refresh]);

  const importar = useCallback(async () => {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert(
        'Sin acceso a Fotos',
        'Actívalo en Ajustes › Privacidad › Fotos para poder elegir las imágenes de tu carro.'
      );
      return;
    }

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 36,
      // En iOS conserva el orden en que las tocas, que es justo el orden de giro.
      orderedSelection: true,
      quality: 1,
    });
    if (resultado.canceled || resultado.assets.length === 0) return;

    setBusy(true);
    setProgress({ done: 0, total: resultado.assets.length });
    try {
      const guardadas = await saveCarPhotos(
        resultado.assets.map((a) => a.uri),
        (done, total) => setProgress({ done, total })
      );
      setPhotos(guardadas);
      setDiskKb(Math.round(photosDiskSize() / 1024));
    } catch {
      Alert.alert('No se pudieron guardar', 'Inténtalo otra vez con menos fotos.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, []);

  const borrar = useCallback(() => {
    Alert.alert('Quitar las fotos', 'La tarjeta volverá a mostrar la ilustración.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          await clearCarPhotos();
          await refresh();
        },
      },
    ]);
  }, [refresh]);

  const total = photos.frames.length;
  const gira = total >= MIN_FRAMES_FOR_SPIN;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.md,
        paddingBottom: insets.bottom + spacing.xxl,
        paddingHorizontal: spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.screenTitle}>Fotos del carro</Text>
      </View>

      <GlassCard style={styles.preview}>
        <CarSpinner frames={photos.frames} height={180} autoSpin={false} />
      </GlassCard>

      <View style={styles.statusRow}>
        {total === 0 ? (
          <Badge label="ILUSTRACIÓN POR DEFECTO" tint={colors.textMuted} />
        ) : gira ? (
          <Badge label={`GIRO DE 360° · ${total} FOTOS`} tint={colors.lime} />
        ) : (
          <Badge label={`${total} FOTO${total > 1 ? 'S' : ''} · SIN GIRO`} tint={colors.amber} />
        )}
        {diskKb > 0 && <Text style={styles.disk}>{diskKb} KB en el teléfono</Text>}
      </View>

      <SectionTitle>Cómo tomarlas</SectionTitle>
      <GlassCard padded={false}>
        <Step
          n={1}
          text="Parquea en un sitio despejado y parejo. Un parqueadero vacío o una calle sin carros al fondo."
        />
        <Divider />
        <Step
          n={2}
          text={`Da la vuelta al carro tomando ${RECOMMENDED_FRAMES} fotos, una cada 20 pasos cortos. Arranca desde el frente.`}
        />
        <Divider />
        <Step
          n={3}
          text="Mantén siempre la misma distancia y la misma altura, a la altura del capó. Si te acercas y te alejas, el giro sale a saltos."
        />
        <Divider />
        <Step
          n={4}
          text="Con el sol de lado o en un día nublado. A contraluz el carro sale como una silueta negra."
        />
        <Divider />
        <Step
          n={5}
          text="Aquí las importas tocándolas en el mismo orden en que las tomaste: ese es el orden del giro."
        />
      </GlassCard>

      <View style={styles.actions}>
        <PrimaryButton
          label={busy ? 'Procesando…' : total > 0 ? 'Cambiar las fotos' : 'Importar fotos'}
          icon="images"
          onPress={importar}
          disabled={busy}
          style={{ flex: 1 }}
        />
      </View>

      {busy && progress && (
        <View style={styles.progressRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.progressText}>
            {progress.done} de {progress.total}
          </Text>
        </View>
      )}

      {total > 0 && (
        <>
          <SectionTitle>{`Las ${total} fotos, en orden`}</SectionTitle>
          <View style={styles.grid}>
            {photos.frames.map((uri, i) => (
              <View key={uri} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
                <Text style={styles.thumbIndex}>{String(i + 1)}</Text>
              </View>
            ))}
          </View>

          <GlassCard padded={false} style={{ marginTop: spacing.lg }}>
            <Row label="Quitar las fotos" icon="trash-outline" danger onPress={borrar} />
          </GlassCard>
        </>
      )}

      <Text style={styles.footnote}>
        Con {MIN_FRAMES_FOR_SPIN} fotos o más la tarjeta se puede girar arrastrando. Con menos, se
        queda en una imagen fija. Las fotos se reescalan y se guardan solo en tu teléfono: no salen
        a ningún lado.
      </Text>
    </ScrollView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNumber}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: { ...font.title, fontSize: 24, color: colors.text },

  preview: { paddingVertical: spacing.lg, backgroundColor: colors.bgElevated },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  disk: { fontSize: 10, color: colors.textFaint, fontFamily: mono },

  step: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, alignItems: 'flex-start' },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: { fontSize: 11, fontWeight: '800', color: colors.accent },
  stepText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 19 },

  actions: { flexDirection: 'row', marginTop: spacing.lg },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  progressText: { fontSize: 13, color: colors.textMuted, fontFamily: mono },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumbWrap: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  thumb: { width: '100%', height: '100%' },
  thumbIndex: {
    position: 'absolute',
    left: 4,
    top: 3,
    fontSize: 9,
    color: '#FFFFFF',
    fontFamily: mono,
    textShadowColor: '#000',
    textShadowRadius: 3,
  },

  footnote: {
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 16,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
});
