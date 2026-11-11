import * as Location from 'expo-location';
import { Barometer, DeviceMotion } from 'expo-sensors';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useTracking } from '@/state/TrackingContext';

/**
 * Sensores del iPhone (pensado para el 15 Pro) además del GPS:
 *
 * - GIROSCOPIO + ACELERÓMETRO (DeviceMotion): la velocidad de giro alrededor
 *   de la vertical, multiplicada por la velocidad del GPS, da la aceleración
 *   lateral real en curva (a = v·ω). Se proyecta sobre la gravedad, así que da
 *   igual cómo esté puesto el teléfono en el soporte.
 * - BARÓMETRO: presión del aire real. Con ella se corrige la potencia del
 *   motor (SAE J1349) en vez de suponer la atmósfera estándar.
 * - BRÚJULA (magnetómetro): rumbo con el carro parado, cuando el GPS no puede
 *   darlo porque necesita movimiento.
 *
 * Todo se publica a ~8 Hz: los sensores van más rápido, pero redibujar la
 * cabina 50 veces por segundo solo gastaría batería.
 */

export type SensorStatus = 'buscando' | 'activo' | 'no-disponible';

export type SensorsState = {
  motion: {
    status: SensorStatus;
    /** Aceleración lateral en g. Positiva = curva a la derecha. */
    lateralG: number;
    /** Giro alrededor de la vertical en °/s. Positivo = horario (a la derecha). */
    yawRateDps: number;
    /** Módulo de la aceleración que siente el teléfono, sin gravedad, en g. */
    accelG: number;
  };
  baro: {
    status: SensorStatus;
    pressureHpa: number | null;
  };
  compass: {
    status: SensorStatus;
    headingDeg: number | null;
    /** Precisión declarada por iOS en grados (menor es mejor). */
    accuracyDeg: number | null;
  };
};

const INITIAL: SensorsState = {
  motion: { status: 'buscando', lateralG: 0, yawRateDps: 0, accelG: 0 },
  baro: { status: 'buscando', pressureHpa: null },
  compass: { status: 'buscando', headingDeg: null, accuracyDeg: null },
};

const G = 9.80665;
const PUBLISH_MS = 120;

const SensorsContext = createContext<SensorsState>(INITIAL);

export function SensorsProvider({ children }: { children: React.ReactNode }) {
  const { live, permission } = useTracking();
  const [state, setState] = useState<SensorsState>(INITIAL);

  // Lo último que dijo cada sensor; se publica junto cada PUBLISH_MS.
  const latest = useRef<SensorsState>(INITIAL);
  const speedMs = useRef(0);
  const yawSmooth = useRef(0);

  useEffect(() => {
    speedMs.current = Math.max(0, live.speedKmh / 3.6);
  }, [live.speedKmh]);

  // ---------------------------------------------------- giroscopio y acelerómetro
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const ok = await DeviceMotion.isAvailableAsync().catch(() => false);
      if (cancelled) return;
      if (!ok) {
        latest.current = { ...latest.current, motion: { ...latest.current.motion, status: 'no-disponible' } };
        return;
      }
      DeviceMotion.setUpdateInterval(50);
      sub = DeviceMotion.addListener((m) => {
        const acc = m.acceleration;
        const inc = m.accelerationIncludingGravity;
        const rr = m.rotationRate;
        if (!acc || !inc || !rr) return;

        // Gravedad en ejes del teléfono (apunta hacia abajo).
        const gx = inc.x - acc.x;
        const gy = inc.y - acc.y;
        const gz = inc.z - acc.z;
        const gn = Math.hypot(gx, gy, gz);
        if (gn < 1) return;

        // En iOS expo-sensors entrega alpha = eje Z, beta = eje Y, gamma = eje X.
        // El giro alrededor de "abajo" es positivo en sentido horario visto
        // desde arriba, igual que el rumbo del GPS.
        const yaw = (rr.gamma * gx + rr.beta * gy + rr.alpha * gz) / gn;
        yawSmooth.current = yawSmooth.current * 0.8 + yaw * 0.2;

        // Por debajo de ~5 km/h el giro no es una curva: es mover el teléfono.
        const v = speedMs.current;
        const lateralG = v > 1.4 ? (v * yawSmooth.current * (Math.PI / 180)) / G : 0;

        latest.current = {
          ...latest.current,
          motion: {
            status: 'activo',
            yawRateDps: yawSmooth.current,
            lateralG: Math.max(-1.5, Math.min(1.5, lateralG)),
            accelG: Math.hypot(acc.x, acc.y, acc.z) / G,
          },
        };
      });
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  // ---------------------------------------------------------------- barómetro
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const ok = await Barometer.isAvailableAsync().catch(() => false);
      if (cancelled) return;
      if (!ok) {
        latest.current = { ...latest.current, baro: { status: 'no-disponible', pressureHpa: null } };
        return;
      }
      Barometer.setUpdateInterval(1000);
      sub = Barometer.addListener(({ pressure }) => {
        if (!Number.isFinite(pressure) || pressure < 300) return;
        latest.current = { ...latest.current, baro: { status: 'activo', pressureHpa: pressure } };
      });
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  // ------------------------------------------------------------------ brújula
  useEffect(() => {
    if (permission !== 'granted' && permission !== 'background') return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    Location.watchHeadingAsync((h) => {
      const heading = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      latest.current = {
        ...latest.current,
        compass: {
          status: 'activo',
          headingDeg: Number.isFinite(heading) ? heading : null,
          accuracyDeg: h.accuracy ?? null,
        },
      };
    })
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => {
        latest.current = {
          ...latest.current,
          compass: { status: 'no-disponible', headingDeg: null, accuracyDeg: null },
        };
      });
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [permission]);

  // ------------------------------------------------------------- publicación
  useEffect(() => {
    const id = setInterval(() => setState(latest.current), PUBLISH_MS);
    return () => clearInterval(id);
  }, []);

  const value = useMemo(() => state, [state]);
  return <SensorsContext.Provider value={value}>{children}</SensorsContext.Provider>;
}

export function useSensors(): SensorsState {
  return useContext(SensorsContext);
}

/**
 * Rumbo a mostrar: el del GPS en marcha (es la dirección del carro) y el de
 * la brújula con el carro parado, cuando el GPS no tiene rumbo.
 */
export function displayHeading(
  speedKmh: number,
  gpsHeading: number | null,
  compassHeading: number | null
): { deg: number | null; source: 'gps' | 'brujula' | null } {
  if (speedKmh >= 6 && gpsHeading != null) return { deg: gpsHeading, source: 'gps' };
  if (compassHeading != null) return { deg: compassHeading, source: 'brujula' };
  if (gpsHeading != null) return { deg: gpsHeading, source: 'gps' };
  return { deg: null, source: null };
}
