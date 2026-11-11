import { useEffect, useRef } from 'react';

import {
  addCarPlayActionListener,
  carPlaySupported,
  setCarPlayState,
} from '../../modules/carplay-bridge';
import { useSensors } from '@/state/SensorsContext';
import { useSettings } from '@/state/SettingsContext';
import { useTracking } from '@/state/TrackingContext';
import { altitudeEffect, pressureAltitudeM } from '@/utils/altitude';

/**
 * Mantiene la pantalla de CarPlay al día (una vez por segundo) y atiende sus
 * botones. CarPlay lee la velocidad del GPS por su cuenta; desde aquí recibe lo
 * que solo sabe la app: el límite, el viaje en curso y la potencia disponible.
 *
 * No dibuja nada. En Expo Go no hace nada: CarPlay necesita la app instalada.
 */
export function CarPlaySync() {
  const { settings } = useSettings();
  const { live, trip, status, start, pause, resume, stop } = useTracking();
  const { baro } = useSensors();

  // Lo último de cada cosa, para que el intervalo no se reinicie a cada lectura.
  const latest = useRef({ settings, live, trip, status, pressureHpa: baro.pressureHpa });
  useEffect(() => {
    latest.current = { settings, live, trip, status, pressureHpa: baro.pressureHpa };
  }, [settings, live, trip, status, baro.pressureHpa]);

  useEffect(() => {
    if (!carPlaySupported) return;
    const push = () => {
      const { settings: s, live: l, trip: t, status: st, pressureHpa } = latest.current;
      const shown = t ?? l;
      const kpa = pressureHpa != null ? pressureHpa / 10 : undefined;
      const alt = l.altitude ?? (kpa != null ? pressureAltitudeM(kpa) : null);
      const effect = alt != null ? altitudeEffect(s.vehicle, alt, s.airTempC, kpa) : null;
      setCarPlayState({
        limitKmh: s.speedAlertEnabled ? s.speedLimit : null,
        unitMph: s.unit === 'mph',
        tripStatus: st,
        distanceM: shown.distanceM,
        durationMs: shown.durationMs,
        maxKmh: shown.maxSpeedKmh,
        powerCv: effect ? effect.powerCv : null,
        factoryPowerCv: s.vehicle.powerCv,
      });
    };
    push();
    const id = setInterval(push, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () =>
      addCarPlayActionListener((action) => {
        // En el carro no hay diálogos: "Terminar viaje" guarda directamente.
        if (action === 'start') start().catch(() => {});
        else if (action === 'pause') pause();
        else if (action === 'resume') resume();
        else if (action === 'stop') stop().catch(() => {});
      }),
    [start, pause, resume, stop]
  );

  return null;
}
