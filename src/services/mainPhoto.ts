import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { ImageSourcePropType } from 'react-native';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Foto principal de cada carro: la que se ve en el centro del velocímetro, en
 * el análisis y en el garaje.
 *
 * De fábrica el Polo trae su foto trasera de estudio. Cualquiera de los dos
 * carros puede llevar una foto elegida desde el teléfono (por ejemplo, la que
 * generes con otra IA): se reescala, se guarda en la app y reemplaza a la de
 * fábrica. Las fotos se ven mejor traseras, centradas y sobre fondo oscuro.
 */

const KEY = 'velocidad.mainPhoto.v1';
const TARGET_WIDTH = 1200;

/** Fotos de fábrica, por vehículo. */
const BUNDLED: Record<string, ImageSourcePropType> = {
  'polo-track-2026-16': require('../../assets/images/cars/polo-rear.png'),
};

/**
 * Dónde están las luces traseras en la foto de fábrica (fracciones del ancho
 * y del alto): ahí se encienden las luces de freno al frenar de verdad.
 */
export type Taillight = { x: number; y: number; rx: number; ry: number };
const BUNDLED_TAILLIGHTS: Record<string, Taillight[]> = {
  'polo-track-2026-16': [
    { x: 0.2, y: 0.545, rx: 0.1, ry: 0.06 },
    { x: 0.785, y: 0.545, rx: 0.1, ry: 0.06 },
    { x: 0.49, y: 0.215, rx: 0.08, ry: 0.018 },
  ],
};

export type MainPhoto = {
  source: ImageSourcePropType | null;
  /** Proporción alto/ancho de la foto. */
  ratio: number;
  /** Solo en la foto de fábrica, donde se sabe dónde están. */
  taillights: Taillight[] | null;
  custom: boolean;
};

type Stored = Record<string, { name: string; ratio: number }>;

let stored: Stored = {};
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) stored = JSON.parse(raw) as Stored;
  } catch {
    stored = {};
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): Stored {
  return stored;
}

export function mainPhotoFor(vehicleId: string, all: Stored = stored): MainPhoto {
  const custom = all[vehicleId];
  if (custom) {
    const file = new File(Paths.document, custom.name);
    if (file.exists) return { source: { uri: file.uri }, ratio: custom.ratio, taillights: null, custom: true };
  }
  const bundled = BUNDLED[vehicleId];
  if (bundled) return { source: bundled, ratio: 623 / 960, taillights: BUNDLED_TAILLIGHTS[vehicleId] ?? null, custom: false };
  return { source: null, ratio: 0.62, taillights: null, custom: false };
}

/** Foto principal del vehículo; se actualiza sola si se cambia desde el garaje. */
export function useMainPhoto(vehicleId: string): MainPhoto {
  useEffect(() => {
    load().catch(() => {});
  }, []);
  const all = useSyncExternalStore(subscribe, snapshot);
  return mainPhotoFor(vehicleId, all);
}

/** Guarda la foto elegida (se reescala y se copia dentro de la app). */
export async function setMainPhoto(vehicleId: string, sourceUri: string): Promise<void> {
  await load();
  const resized = await ImageManipulator.manipulateAsync(sourceUri, [{ resize: { width: TARGET_WIDTH } }], {
    compress: 0.88,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  // Nombre nuevo cada vez: así ninguna caché de imagen muestra la anterior.
  const name = `main-photo-${vehicleId}-${Date.now()}.jpg`;
  new File(resized.uri).copy(new File(Paths.document, name));
  removeFile(stored[vehicleId]?.name);
  stored = { ...stored, [vehicleId]: { name, ratio: resized.height / resized.width } };
  await AsyncStorage.setItem(KEY, JSON.stringify(stored));
  emit();
}

/** Vuelve a la foto de fábrica (o a la ilustración, si el carro no trae foto). */
export async function clearMainPhoto(vehicleId: string): Promise<void> {
  await load();
  removeFile(stored[vehicleId]?.name);
  const { [vehicleId]: _removed, ...rest } = stored;
  stored = rest;
  await AsyncStorage.setItem(KEY, JSON.stringify(stored));
  emit();
}

function removeFile(name: string | undefined) {
  if (!name) return;
  try {
    const f = new File(Paths.document, name);
    if (f.exists) f.delete();
  } catch {
    // Si no se puede borrar, solo ocupa espacio; no rompe nada.
  }
}
