import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SpeedUnit } from '@/utils/format';
import { DEFAULT_VEHICLE_ID, FACTORY_VEHICLES, factoryVehicle } from '@/vehicles';
import { Vehicle } from '@/vehicles/polo';

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
  /** Tablero sin mapa: solo la velocidad (botón "Ocultar mapa"). */
  mapHidden: boolean;
  /** Fichas de todos los vehículos del garaje, por id (con los cambios del usuario). */
  vehicles: Record<string, Vehicle>;
  /** Vehículo con el que se conduce ahora: decide la ficha, la escala y el color. */
  activeVehicleId: string;
  /** Ficha del vehículo activo (derivada de `vehicles` y `activeVehicleId`). */
  vehicle: Vehicle;
};

/** Lo que se guarda: todo menos `vehicle`, que se deriva. */
type Stored = Omit<Settings, 'vehicle'>;

function factoryVehicles(): Record<string, Vehicle> {
  return Object.fromEntries(FACTORY_VEHICLES.map((v) => [v.id, v]));
}

function withActive(s: Stored): Settings {
  const vehicle = s.vehicles[s.activeVehicleId] ?? factoryVehicle(s.activeVehicleId);
  return { ...s, vehicle };
}

const DEFAULTS_STORED: Stored = {
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
  mapHidden: false,
  vehicles: factoryVehicles(),
  activeVehicleId: DEFAULT_VEHICLE_ID,
};

const DEFAULTS: Settings = withActive(DEFAULTS_STORED);

const STORAGE_KEY = 'velocidad.settings.v1';

type Ctx = {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Omit<Settings, 'vehicle' | 'vehicles'>>) => void;
  /** Cambia la ficha del vehículo activo. */
  updateVehicle: (patch: Partial<Vehicle>) => void;
  /** Cambia de vehículo sin animación (la transición vive en VehicleSwitch). */
  setActiveVehicle: (id: string) => void;
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
          setSettings(parseStored(JSON.parse(raw)));
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

  /** Aplica un cambio sobre lo guardado, recalcula el vehículo activo y persiste. */
  const mutate = useCallback((fn: (prev: Stored) => Stored) => {
    setSettings((prev) => {
      const { vehicle: _derived, ...stored } = prev;
      const nextStored = fn(stored);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextStored)).catch(() => {});
      return withActive(nextStored);
    });
  }, []);

  const update = useCallback(
    (patch: Partial<Omit<Settings, 'vehicle' | 'vehicles'>>) => mutate((prev) => ({ ...prev, ...patch })),
    [mutate]
  );

  const updateVehicle = useCallback(
    (patch: Partial<Vehicle>) =>
      mutate((prev) => {
        const id = prev.activeVehicleId;
        const current = prev.vehicles[id] ?? factoryVehicle(id);
        return { ...prev, vehicles: { ...prev.vehicles, [id]: { ...current, ...patch, id } } };
      }),
    [mutate]
  );

  const setActiveVehicle = useCallback(
    (id: string) => mutate((prev) => (prev.vehicles[id] ? { ...prev, activeVehicleId: id } : prev)),
    [mutate]
  );

  /** Restaura los ajustes y las fichas de fábrica, pero sigue en el vehículo elegido. */
  const reset = useCallback(
    () => mutate((prev) => ({ ...DEFAULTS_STORED, activeVehicleId: prev.activeVehicleId })),
    [mutate]
  );

  const value = useMemo<Ctx>(
    () => ({ settings, ready, update, updateVehicle, setActiveVehicle, reset }),
    [settings, ready, update, updateVehicle, setActiveVehicle, reset]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/**
 * Lee lo guardado en cualquier versión anterior. La v1 tenía un solo
 * `vehicle` (el Polo, con los cambios del usuario): se conserva como la ficha
 * del Polo y se añaden los vehículos nuevos con sus valores de fábrica.
 */
function parseStored(raw: unknown): Settings {
  const saved = (raw ?? {}) as Partial<Stored> & { vehicle?: Partial<Vehicle> };
  const { vehicle: legacy, ...rest } = saved;
  const vehicles = factoryVehicles();

  if (legacy) {
    const id = legacy.id && vehicles[legacy.id] ? legacy.id : DEFAULT_VEHICLE_ID;
    vehicles[id] = { ...vehicles[id], ...legacy, id };
  }
  for (const [id, v] of Object.entries(saved.vehicles ?? {})) {
    // Fusiona con la ficha de fábrica para que los campos nuevos no queden vacíos.
    vehicles[id] = { ...(vehicles[id] ?? factoryVehicle(id)), ...v, id };
  }

  const activeVehicleId =
    rest.activeVehicleId && vehicles[rest.activeVehicleId] ? rest.activeVehicleId : DEFAULT_VEHICLE_ID;
  return withActive({ ...DEFAULTS_STORED, ...rest, vehicles, activeVehicleId });
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings debe usarse dentro de <SettingsProvider>');
  return ctx;
}
