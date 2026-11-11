import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SpeedUnit } from '@/utils/format';
import { POLO_TRACK_2026, Vehicle } from '@/vehicles/polo';

export type MapStyle = 'standard' | 'mutedStandard' | 'hybrid';

export type Settings = {
  /** Nombre para el saludo de la tarjeta del garaje. Vacío = sin nombre. */
  driverName: string;
  unit: SpeedUnit;
  /** Límite en km/h a partir del cual avisa (siempre se guarda en km/h). */
  speedLimit: number;
  speedAlertEnabled: boolean;
  hapticsEnabled: boolean;
  keepAwake: boolean;
  /** Pausa el viaje solo cuando el carro lleva rato detenido. */
  autoPause: boolean;
  autoPauseSeconds: number;
  /**
   * Viajes automáticos: el viaje empieza solo al arrancar y se guarda solo
   * tras `autoStopMinutes` detenido. Así no hay que tocar el teléfono al volante.
   */
  autoTrips: boolean;
  autoStopMinutes: number;
  /**
   * Temperatura del aire para la corrección de potencia. El iPhone no tiene
   * termómetro exterior, así que se fija aquí (Cuenca ronda los 15 °C).
   */
  airTempC: number;
  mapStyle: MapStyle;
  followHeading: boolean;
  vehicle: Vehicle;
};

const DEFAULTS: Settings = {
  driverName: '',
  unit: 'kmh',
  speedLimit: 50, // urbano en Ecuador
  speedAlertEnabled: true,
  hapticsEnabled: true,
  keepAwake: true,
  autoPause: true,
  autoPauseSeconds: 90,
  autoTrips: true,
  autoStopMinutes: 10,
  airTempC: 15,
  mapStyle: 'mutedStandard',
  followHeading: true,
  vehicle: POLO_TRACK_2026,
};

const STORAGE_KEY = 'velocidad.settings.v1';

type Ctx = {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
  updateVehicle: (patch: Partial<Vehicle>) => void;
  reset: () => void;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && alive) {
          const saved = JSON.parse(raw) as Partial<Settings>;
          setSettings({
            ...DEFAULTS,
            ...saved,
            // Fusiona la ficha para que al añadir campos nuevos no queden vacíos.
            vehicle: { ...DEFAULTS.vehicle, ...(saved.vehicle ?? {}) },
          });
        }
      } catch {
        // Preferencias ilegibles: arrancamos con los valores por defecto.
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((next: Settings) => {
    setSettings(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    []
  );

  const updateVehicle = useCallback((patch: Partial<Vehicle>) => {
    setSettings((prev) => {
      const next = { ...prev, vehicle: { ...prev.vehicle, ...patch } };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const reset = useCallback(() => persist(DEFAULTS), [persist]);

  const value = useMemo<Ctx>(
    () => ({ settings, ready, update, updateVehicle, reset }),
    [settings, ready, update, updateVehicle, reset]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings debe usarse dentro de <SettingsProvider>');
  return ctx;
}
