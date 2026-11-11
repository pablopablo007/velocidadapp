import React, { createContext, useContext } from 'react';

import { useSettings } from '@/state/SettingsContext';
import { DEFAULT_VEHICLE_ID, VehicleTheme, themeFor } from '@/vehicles';

const AccentContext = createContext<VehicleTheme>(themeFor(DEFAULT_VEHICLE_ID));

/**
 * Reparte el color del vehículo activo. Cada componente que pinta con el
 * acento lo lee con `useAccent()`, así se vuelve a dibujar al cambiar de carro
 * aunque esté memorizado.
 */
export function AccentProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  return <AccentContext.Provider value={themeFor(settings.activeVehicleId)}>{children}</AccentContext.Provider>;
}

export function useAccent(): VehicleTheme {
  return useContext(AccentContext);
}
