import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import {
  startBackgroundUpdates,
  stopBackgroundUpdates,
  subscribeBackgroundFixes,
  toRawFix,
} from '@/services/backgroundLocation';
import { saveTrip } from '@/services/database';
import { EMPTY_STATS, LiveStats, RawFix, TrackPoint, TripEngine } from '@/services/tripEngine';
import { useSettings } from '@/state/SettingsContext';
import { LatLng, simplify } from '@/utils/geo';

export type TrackingStatus = 'idle' | 'recording' | 'paused';
export type PermissionState = 'unknown' | 'granted' | 'denied' | 'background';

/** Velocidad y tiempo sostenidos para que un viaje automático empiece. */
const AUTO_START_KMH = 12;
const AUTO_START_MS = 6000;

type Ctx = {
  status: TrackingStatus;
  permission: PermissionState;
  gpsActive: boolean;
  /** Lecturas continuas del GPS: alimenta el velocímetro incluso sin grabar. */
  live: LiveStats;
  /** Métricas del viaje en curso; `null` si no hay grabación. */
  trip: LiveStats | null;
  /** Traza del viaje en curso, con velocidad por punto para colorearla. */
  path: TrackPoint[];
  position: LatLng | null;
  overLimit: boolean;
  savingTrip: boolean;
  lastSavedTripId: string | null;

  requestPermission: () => Promise<boolean>;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<string | null>;
  discard: () => void;
  resetSession: () => void;
};

const TrackingContext = createContext<Ctx | null>(null);

export function TrackingProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  const [status, setStatus] = useState<TrackingStatus>('idle');
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [gpsActive, setGpsActive] = useState(false);
  const [live, setLive] = useState<LiveStats>(EMPTY_STATS);
  const [trip, setTrip] = useState<LiveStats | null>(null);
  const [path, setPath] = useState<TrackPoint[]>([]);
  const [position, setPosition] = useState<LatLng | null>(null);
  const [overLimit, setOverLimit] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [lastSavedTripId, setLastSavedTripId] = useState<string | null>(null);

  // El motor "ambiente" nunca se guarda: existe para que el velocímetro, la
  // altitud y los cronos de aceleración funcionen sin tener que grabar nada.
  const ambientRef = useRef<TripEngine>(new TripEngine(settings.vehicle));
  const tripRef = useRef<TripEngine | null>(null);
  const statusRef = useRef<TrackingStatus>('idle');
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  const startLabelRef = useRef<string | null>(null);
  const pauseStartedAtRef = useRef<number | null>(null);
  const slowSinceRef = useRef<number | null>(null);
  const pathBufferRef = useRef<TrackPoint[]>([]);
  const pathTickRef = useRef(0);
  const overLimitRef = useRef(false);
  // Viajes automáticos: desde cuándo vas rápido (para arrancar) y desde
  // cuándo estás quieto (para cerrar), y referencias a start/stop porque se
  // declaran más abajo que handleFix.
  const fastSinceRef = useRef<number | null>(null);
  const stillSinceRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const startRef = useRef<(() => Promise<void>) | null>(null);
  const stopRef = useRef<(() => Promise<string | null>) | null>(null);

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    // El límite alimenta el contador de tiempo en exceso; si lo cambias a
    // media grabación, el viaje en curso lo adopta al vuelo.
    const limit = settings.speedAlertEnabled ? settings.speedLimit : 0;
    ambientRef.current.speedLimitKmh = limit;
    if (tripRef.current) tripRef.current.speedLimitKmh = limit;
  }, [settings]);

  const setStatusBoth = useCallback((next: TrackingStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  // ---------------------------------------------------------------- permisos

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      setPermission('denied');
      return false;
    }
    setPermission('granted');
    // "Siempre" es opcional: sin ella la app funciona con la pantalla encendida.
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status === 'granted') setPermission('background');
    } catch {
      // No disponible en este entorno (p. ej. Expo Go).
    }
    return true;
  }, []);

  useEffect(() => {
    (async () => {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.status !== 'granted') {
        setPermission(fg.canAskAgain ? 'unknown' : 'denied');
        return;
      }
      const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
      setPermission(bg?.status === 'granted' ? 'background' : 'granted');
    })();
  }, []);

  // ------------------------------------------------------------ ingesta GPS

  const handleFix = useCallback((fix: RawFix) => {
    const accepted = ambientRef.current.ingest(fix);
    if (!accepted) return;

    const now = Date.now();
    const ambientStats = ambientRef.current.stats(now);
    setLive(ambientStats);
    setPosition({ latitude: fix.latitude, longitude: fix.longitude });

    // --- aviso de exceso de velocidad (con histéresis para que no parpadee) ---
    const { speedAlertEnabled, speedLimit, hapticsEnabled } = settingsRef.current;
    if (speedAlertEnabled) {
      const kmh = ambientStats.speedKmh;
      if (!overLimitRef.current && kmh > speedLimit) {
        overLimitRef.current = true;
        setOverLimit(true);
        if (hapticsEnabled) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
      } else if (overLimitRef.current && kmh < speedLimit - 3) {
        overLimitRef.current = false;
        setOverLimit(false);
      }
    } else if (overLimitRef.current) {
      overLimitRef.current = false;
      setOverLimit(false);
    }

    // --- viajes automáticos ---
    const { autoTrips, autoStopMinutes } = settingsRef.current;
    const kmhNow = ambientStats.speedKmh;
    if (kmhNow >= 3) stillSinceRef.current = null;
    else if (stillSinceRef.current == null) stillSinceRef.current = now;

    if (autoTrips && !savingRef.current) {
      if (statusRef.current === 'idle') {
        if (kmhNow >= AUTO_START_KMH) {
          if (fastSinceRef.current == null) fastSinceRef.current = now;
          else if (now - fastSinceRef.current >= AUTO_START_MS) {
            fastSinceRef.current = null;
            startRef.current?.().catch(() => {});
            return;
          }
        } else {
          fastSinceRef.current = null;
        }
      } else if (
        stillSinceRef.current != null &&
        now - stillSinceRef.current >= autoStopMinutes * 60_000
      ) {
        // Llegaste: lleva el rato configurado detenido. Se guarda solo.
        stillSinceRef.current = null;
        stopRef.current?.().catch(() => {});
        return;
      }
    }

    const engine = tripRef.current;
    if (!engine) return;

    // --- pausa automática ---
    const { autoPause, autoPauseSeconds } = settingsRef.current;
    const movingNow = ambientStats.speedKmh >= 3;
    if (autoPause) {
      if (movingNow) {
        slowSinceRef.current = null;
        if (statusRef.current === 'paused' && pauseStartedAtRef.current != null) {
          engine.pausedMs += now - pauseStartedAtRef.current;
          pauseStartedAtRef.current = null;
          setStatusBoth('recording');
        }
      } else if (statusRef.current === 'recording') {
        if (slowSinceRef.current == null) slowSinceRef.current = now;
        else if (now - slowSinceRef.current > autoPauseSeconds * 1000) {
          pauseStartedAtRef.current = now;
          setStatusBoth('paused');
        }
      }
    }

    if (statusRef.current !== 'recording') return;

    if (engine.ingest(fix)) {
      setTrip(engine.stats(now));
      const added = engine.lastPoint;
      if (added) pathBufferRef.current.push(added);
      // Redibujar la polilínea completa en cada lectura es caro en viajes
      // largos, así que se refresca cada 3 puntos.
      if (++pathTickRef.current % 3 === 0 || pathBufferRef.current.length < 10) {
        setPath(pathBufferRef.current.slice());
      }
    }
  }, [setStatusBoth]);

  const handleFixRef = useRef(handleFix);
  useEffect(() => {
    handleFixRef.current = handleFix;
  }, [handleFix]);

  // El observador en primer plano vive mientras la app esté abierta: así el
  // velocímetro está listo en cuanto abres la app, sin pulsar nada.
  useEffect(() => {
    if (permission !== 'granted' && permission !== 'background') return;
    let cancelled = false;

    (async () => {
      try {
        const sub = await Location.watchPositionAsync(
          {
            // BestForNavigation activa el GPS a plena potencia: en iOS entrega
            // ~1 lectura por segundo con la velocidad Doppler del receptor.
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 0,
            mayShowUserSettingsDialog: true,
          },
          (loc) => handleFixRef.current(toRawFix(loc))
        );
        if (cancelled) {
          sub.remove();
          return;
        }
        watcherRef.current = sub;
        setGpsActive(true);
      } catch {
        setGpsActive(false);
      }
    })();

    return () => {
      cancelled = true;
      watcherRef.current?.remove();
      watcherRef.current = null;
      setGpsActive(false);
    };
  }, [permission]);

  // Puntos entregados por la tarea de segundo plano mientras la app no está
  // en pantalla.
  useEffect(
    () =>
      subscribeBackgroundFixes((fixes) => {
        for (const fix of fixes) handleFixRef.current(fix);
      }),
    []
  );

  // La duración debe avanzar aunque el GPS no entregue lecturas nuevas
  // (túnel, parqueadero techado).
  useEffect(() => {
    if (status !== 'recording') return;
    const id = setInterval(() => {
      const engine = tripRef.current;
      if (engine) setTrip(engine.stats());
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  // Pantalla siempre encendida mientras se graba (el celular va en el soporte).
  useEffect(() => {
    if (status !== 'idle' && settings.keepAwake) {
      activateKeepAwakeAsync('velocidad-trip').catch(() => {});
      return () => {
        deactivateKeepAwake('velocidad-trip').catch(() => {});
      };
    }
  }, [status, settings.keepAwake]);

  // Al volver del segundo plano, refresca de inmediato para no mostrar datos viejos.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        setLive(ambientRef.current.stats());
        const engine = tripRef.current;
        if (engine) {
          setTrip(engine.stats());
          setPath(pathBufferRef.current.slice());
        }
      }
    });
    return () => sub.remove();
  }, []);

  // ---------------------------------------------------------- ciclo de viaje

  const start = useCallback(async () => {
    if (permission !== 'granted' && permission !== 'background') {
      const ok = await requestPermission();
      if (!ok) return;
    }

    const engine = new TripEngine(settingsRef.current.vehicle);
    engine.speedLimitKmh = settingsRef.current.speedAlertEnabled
      ? settingsRef.current.speedLimit
      : 0;
    tripRef.current = engine;
    pathBufferRef.current = [];
    pathTickRef.current = 0;
    slowSinceRef.current = null;
    pauseStartedAtRef.current = null;
    startLabelRef.current = null;
    setPath([]);
    setTrip(engine.stats());
    setLastSavedTripId(null);
    setStatusBoth('recording');

    if (settingsRef.current.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    startBackgroundUpdates().catch(() => {});

    // El nombre del lugar es un extra: si no hay red, el viaje se guarda igual.
    const here = ambientRef.current.lastPoint;
    if (here) {
      reverseGeocode(here.lat, here.lon)
        .then((label) => {
          startLabelRef.current = label;
        })
        .catch(() => {});
    }
  }, [permission, requestPermission, setStatusBoth]);

  const pause = useCallback(() => {
    if (statusRef.current !== 'recording') return;
    pauseStartedAtRef.current = Date.now();
    setStatusBoth('paused');
    if (settingsRef.current.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [setStatusBoth]);

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return;
    const engine = tripRef.current;
    if (engine && pauseStartedAtRef.current != null) {
      engine.pausedMs += Date.now() - pauseStartedAtRef.current;
    }
    pauseStartedAtRef.current = null;
    slowSinceRef.current = null;
    setStatusBoth('recording');
    if (settingsRef.current.hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, [setStatusBoth]);

  const cleanupTrip = useCallback(() => {
    tripRef.current = null;
    pathBufferRef.current = [];
    pauseStartedAtRef.current = null;
    slowSinceRef.current = null;
    setTrip(null);
    setPath([]);
    setStatusBoth('idle');
    stopBackgroundUpdates().catch(() => {});
  }, [setStatusBoth]);

  const stop = useCallback(async (): Promise<string | null> => {
    const engine = tripRef.current;
    if (!engine) return null;

    if (pauseStartedAtRef.current != null) {
      engine.pausedMs += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }

    const now = Date.now();
    const stats = engine.stats(now);
    const cfg = settingsRef.current;

    // Un viaje de menos de 50 m no aporta nada al historial.
    if (stats.distanceM < 50 || engine.points.length < 5) {
      cleanupTrip();
      return null;
    }

    setSavingTrip(true);
    savingRef.current = true;
    try {
      const last = engine.lastPoint;
      const endLabel = last ? await reverseGeocode(last.lat, last.lon).catch(() => null) : null;
      const id = `${engine.startedAt}-${Math.random().toString(36).slice(2, 8)}`;

      // La traza se simplifica: conserva la forma del recorrido con muchos
      // menos puntos que el flujo crudo a 1 Hz.
      const simplified = simplify(
        engine.points.map((p) => ({ ...p, latitude: p.lat, longitude: p.lon })),
        4
      ).map(({ latitude: _lat, longitude: _lon, ...p }) => p);


      await saveTrip({
        id,
        startedAt: engine.startedAt,
        endedAt: now,
        distanceM: stats.distanceM,
        durationMs: stats.durationMs,
        movingMs: stats.movingMs,
        maxSpeedKmh: stats.maxSpeedKmh,
        avgSpeedKmh: stats.avgSpeedKmh,
        avgMovingKmh: stats.avgMovingKmh,
        elevGain: stats.elevGain,
        elevLoss: stats.elevLoss,
        maxAlt: stats.maxAlt,
        minAlt: stats.minAlt,
        startLabel: startLabelRef.current,
        endLabel,
        // El consumo es un modelo, no una lectura del carro: se guarda por
        // compatibilidad con la base de datos pero la app no lo muestra.
        fuelL: stats.fuelL,
        cost: 0,
        perf: stats.perf,
        note: null,
        analysis: stats.analysis,
        points: simplified,
      });

      if (cfg.hapticsEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setLastSavedTripId(id);
      cleanupTrip();
      return id;
    } catch {
      cleanupTrip();
      return null;
    } finally {
      setSavingTrip(false);
      savingRef.current = false;
    }
  }, [cleanupTrip]);

  useEffect(() => {
    startRef.current = start;
    stopRef.current = stop;
  }, [start, stop]);

  const discard = useCallback(() => {
    cleanupTrip();
  }, [cleanupTrip]);

  const resetSession = useCallback(() => {
    ambientRef.current = new TripEngine(settingsRef.current.vehicle);
    setLive(EMPTY_STATS);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      status,
      permission,
      gpsActive,
      live,
      trip,
      path,
      position,
      overLimit,
      savingTrip,
      lastSavedTripId,
      requestPermission,
      start,
      pause,
      resume,
      stop,
      discard,
      resetSession,
    }),
    [
      status,
      permission,
      gpsActive,
      live,
      trip,
      path,
      position,
      overLimit,
      savingTrip,
      lastSavedTripId,
      requestPermission,
      start,
      pause,
      resume,
      stop,
      discard,
      resetSession,
    ]
  );

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    const r = results[0];
    if (!r) return null;
    const parts = [r.street ?? r.name, r.district ?? r.subregion, r.city].filter(
      (p): p is string => Boolean(p)
    );
    // Quita repetidos ("Quito · Quito") manteniendo el orden.
    const unique = parts.filter((p, i) => parts.indexOf(p) === i);
    return unique.slice(0, 2).join(', ') || null;
  } catch {
    return null;
  }
}

export function useTracking(): Ctx {
  const ctx = useContext(TrackingContext);
  if (!ctx) throw new Error('useTracking debe usarse dentro de <TrackingProvider>');
  return ctx;
}
