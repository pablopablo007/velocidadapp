import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { RawFix } from './tripEngine';

export const BACKGROUND_TASK = 'velocidad-background-location';

type Listener = (fixes: RawFix[]) => void;
const listeners = new Set<Listener>();

/** Puntos recibidos en segundo plano antes de que la UI se suscriba. */
const pending: RawFix[] = [];

export function subscribeBackgroundFixes(listener: Listener): () => void {
  listeners.add(listener);
  if (pending.length) {
    listener(pending.splice(0, pending.length));
  }
  return () => {
    listeners.delete(listener);
  };
}

export function toRawFix(loc: Location.LocationObject): RawFix {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    altitude: loc.coords.altitude ?? null,
    accuracy: loc.coords.accuracy ?? null,
    altitudeAccuracy: loc.coords.altitudeAccuracy ?? null,
    speed: loc.coords.speed ?? null,
    heading: loc.coords.heading ?? null,
    timestamp: loc.timestamp,
  };
}

// Debe definirse en el ámbito del módulo (requisito de expo-task-manager) y el
// módulo debe importarse desde el layout raíz para que quede registrada al
// arrancar la app.
TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations?: Location.LocationObject[] };
  if (!locations?.length) return;

  const fixes = locations.map(toRawFix);
  if (listeners.size === 0) {
    pending.push(...fixes);
    // Evita que el buffer crezca sin límite si la app queda sin UI mucho tiempo.
    if (pending.length > 5000) pending.splice(0, pending.length - 5000);
    return;
  }
  for (const listener of listeners) listener(fixes);
});

export async function startBackgroundUpdates(): Promise<boolean> {
  try {
    const { status } = await Location.getBackgroundPermissionsAsync();
    if (status !== 'granted') return false;
    const already = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK);
    if (already) return true;

    await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      activityType: Location.ActivityType.AutomotiveNavigation,
      timeInterval: 1000,
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Velocidad · viaje en curso',
        notificationBody: 'Registrando velocidad y recorrido.',
        notificationColor: '#FF1E2D',
      },
    });
    return true;
  } catch {
    // Expo Go y algunos entornos no permiten seguimiento en segundo plano.
    return false;
  }
}

export async function stopBackgroundUpdates(): Promise<void> {
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK);
    if (running) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK);
  } catch {
    // Nada que detener.
  }
}
