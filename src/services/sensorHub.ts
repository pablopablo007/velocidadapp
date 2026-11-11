/**
 * Últimas lecturas de los sensores de movimiento y presión, fuera de React.
 *
 * El GPS llega por un camino (TrackingContext) y los demás sensores por otro
 * (SensorsContext). Este módulo es el punto de encuentro: los sensores dejan
 * aquí lo último que midieron y, al llegar cada lectura del GPS, se le adjunta
 * para que el motor de cálculo trabaje con todo junto.
 */

/** Por debajo de esto (en g, sin gravedad) el teléfono no siente aceleración. */
const STILL_ACCEL_G = 0.02;
/** Por debajo de esto (°/s) el teléfono no está girando. */
const STILL_ROTATION_DPS = 1.5;
/** Tiempo seguido en calma para dar el carro por detenido. */
const STILL_HOLD_MS = 1500;
/** Una lectura más vieja que esto ya no describe el momento actual. */
const FRESH_MS = 3000;

let pressureHpa: number | null = null;
let pressureAt = 0;
let calmSince: number | null = null;
let motionAt = 0;

export function reportPressure(hpa: number, now = Date.now()): void {
  pressureHpa = hpa;
  pressureAt = now;
}

/**
 * @param accelG módulo de la aceleración sin gravedad, en g
 * @param rotationDps módulo de la velocidad de giro, en °/s
 */
export function reportMotion(accelG: number, rotationDps: number, now = Date.now()): void {
  motionAt = now;
  if (accelG < STILL_ACCEL_G && rotationDps < STILL_ROTATION_DPS) {
    if (calmSince == null) calmSince = now;
  } else {
    calmSince = null;
  }
}

/** Presión reciente del barómetro, o `null` si no hay o es vieja. */
export function freshPressureHpa(now = Date.now()): number | null {
  return pressureHpa != null && now - pressureAt < FRESH_MS ? pressureHpa : null;
}

/**
 * `true` si el acelerómetro y el giroscopio llevan un rato sin sentir nada:
 * el carro está detenido de verdad. Con el motor en marcha la vibración suele
 * impedirlo, y entonces simplemente no se afirma nada.
 */
export function isPhoneStill(now = Date.now()): boolean {
  return calmSince != null && now - calmSince >= STILL_HOLD_MS && now - motionAt < 1000;
}
