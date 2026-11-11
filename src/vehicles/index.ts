import { GOL_PICKUP_2005 } from '@/vehicles/gol';
import { POLO_TRACK_2026, Vehicle } from '@/vehicles/polo';

/**
 * Color propio de cada vehículo. Al cambiar de carro toda la app toma su
 * acento: el rojo Track del Polo o el blanco de la Pick Up.
 */
export type VehicleTheme = {
  /** Nombre del color, para la transición. */
  name: string;
  accent: string;
  accentDim: string;
  /** Halo detrás del carro y del barrido de la transición. */
  glow: string;
};

export const VEHICLE_THEMES: Record<string, VehicleTheme> = {
  [POLO_TRACK_2026.id]: {
    name: 'Rojo Track',
    accent: '#FF2D46',
    accentDim: 'rgba(255,45,70,0.14)',
    glow: 'rgba(255,45,70,0.55)',
  },
  [GOL_PICKUP_2005.id]: {
    name: 'Blanco Pick Up',
    accent: '#EEF3FA',
    accentDim: 'rgba(238,243,250,0.12)',
    glow: 'rgba(214,232,255,0.55)',
  },
};

/** Vehículos de fábrica, en el orden del selector. */
export const FACTORY_VEHICLES: Vehicle[] = [POLO_TRACK_2026, GOL_PICKUP_2005];

export const DEFAULT_VEHICLE_ID = POLO_TRACK_2026.id;

export function themeFor(id: string): VehicleTheme {
  return VEHICLE_THEMES[id] ?? VEHICLE_THEMES[DEFAULT_VEHICLE_ID];
}

export function factoryVehicle(id: string): Vehicle {
  return FACTORY_VEHICLES.find((v) => v.id === id) ?? POLO_TRACK_2026;
}

/** Nombre corto en mayúsculas para la cabecera del tablero. */
export function brandLabel(v: Vehicle): string {
  return v.model.toUpperCase();
}
