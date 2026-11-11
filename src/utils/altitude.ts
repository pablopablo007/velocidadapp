import { Vehicle } from '@/vehicles/polo';

/**
 * Corrección de potencia por altitud.
 *
 * Un motor atmosférico aspira aire a la presión que haya. En Quito, a 2.850 m,
 * esa presión es un 30 % menor que al nivel del mar: entra menos oxígeno y el
 * motor entrega menos potencia. Un turbo se salva porque comprime el aire por
 * su cuenta; el 1.6 MSI del Polo Track no lleva turbo, así que lo acusa entero.
 *
 * Se usa el factor de corrección de la norma SAE J1349 para motores
 * atmosféricos de gasolina, el mismo que aplican los bancos de potencia para
 * poder comparar mediciones hechas en sitios distintos.
 */

/** Presión atmosférica de la atmósfera estándar (ISA) en kPa. */
export function standardPressureKpa(altitudeM: number): number {
  const h = Math.max(-500, Math.min(altitudeM, 11000));
  return 101.325 * Math.pow(1 - 2.25577e-5 * h, 5.25588);
}

/**
 * Factor SAE J1349: multiplica la potencia medida para llevarla a condiciones
 * estándar (99 kPa, 25 °C). Un factor de 1,44 significa que en ese sitio el
 * motor entrega 1/1,44 de lo que daría al nivel del mar.
 */
export function sae1349Factor(altitudeM: number, tempC = 20, pressureKpa?: number): number {
  const pressure = pressureKpa ?? standardPressureKpa(altitudeM);
  const kelvin = tempC + 273.15;
  const factor = 1.18 * ((99 / pressure) * Math.sqrt(kelvin / 298)) - 0.18;
  // Acota el resultado: fuera del rango de validez de la norma deja de tener
  // sentido físico y no queremos mostrar cifras absurdas.
  return Math.max(0.85, Math.min(factor, 2.2));
}

export type AltitudeEffect = {
  altitudeM: number;
  tempC: number;
  pressureKpa: number;
  /** De dónde sale la presión: el barómetro del iPhone o la atmósfera estándar. */
  pressureSource: 'barometro' | 'estandar';
  factor: number;
  /** Potencia y par realmente disponibles a esa altitud. */
  powerCv: number;
  powerHp: number;
  torqueNm: number;
  /** Porcentaje de potencia perdida respecto al dato de fábrica. */
  lossPct: number;
  weightPerPowerKg: number;
  /** Rango realista del 0-100 km/h a esa altitud, en segundos. */
  target0100Min: number;
  target0100Max: number;
};

/**
 * @param pressureKpa presión medida (barómetro del iPhone). Es más exacta que
 *   deducirla de la altitud: incluye el tiempo que hace (borrasca, anticiclón).
 */
export function altitudeEffect(
  vehicle: Vehicle,
  altitudeM: number,
  tempC = 20,
  pressureKpa?: number
): AltitudeEffect {
  const medida = pressureKpa != null && pressureKpa > 30 && pressureKpa < 110;
  const pressure = medida ? pressureKpa : standardPressureKpa(altitudeM);
  const factor = sae1349Factor(altitudeM, tempC, pressure);
  const powerCv = vehicle.powerCv / factor;
  const torqueNm = vehicle.torqueNm / factor;

  // El tiempo de aceleración escala aproximadamente con la inversa de la
  // potencia. El aire enrarecido también frena menos, lo que devuelve algo del
  // tiempo perdido, así que se da un rango en vez de un número único.
  const byPowerOnly = vehicle.accel0100Factory * factor;

  return {
    altitudeM,
    tempC,
    pressureKpa: pressure,
    pressureSource: medida ? 'barometro' : 'estandar',
    factor,
    powerCv,
    powerHp: (vehicle.powerHp / factor),
    torqueNm,
    lossPct: (1 - 1 / factor) * 100,
    weightPerPowerKg: vehicle.curbWeightKg / powerCv,
    target0100Min: byPowerOnly * 0.95,
    target0100Max: byPowerOnly,
  };
}

/**
 * Compara un 0-100 medido contra lo que cabe esperar a esa altitud.
 * Devuelve `null` si no hay medición todavía.
 */
export function compare0100(
  measuredSeconds: number | null | undefined,
  effect: AltitudeEffect
): { verdict: 'mejor' | 'dentro' | 'peor'; deltaSeconds: number } | null {
  if (measuredSeconds == null || !Number.isFinite(measuredSeconds)) return null;
  if (measuredSeconds < effect.target0100Min) {
    return { verdict: 'mejor', deltaSeconds: effect.target0100Min - measuredSeconds };
  }
  if (measuredSeconds > effect.target0100Max) {
    return { verdict: 'peor', deltaSeconds: measuredSeconds - effect.target0100Max };
  }
  return { verdict: 'dentro', deltaSeconds: 0 };
}

/** Altitudes de referencia para que se entienda la escala del efecto. */
export const REFERENCE_ALTITUDES: { label: string; altitudeM: number }[] = [
  { label: 'Nivel del mar', altitudeM: 0 },
  { label: 'Guayaquil', altitudeM: 4 },
  { label: 'Santo Domingo', altitudeM: 550 },
  { label: 'Azogues', altitudeM: 2518 },
  { label: 'Cuenca', altitudeM: 2560 },
  { label: 'Ambato', altitudeM: 2577 },
  { label: 'Quito', altitudeM: 2850 },
  { label: 'Papallacta', altitudeM: 3300 },
];

/** Altitud de la presión medida, según la atmósfera estándar (inversa de standardPressureKpa). */
export function pressureAltitudeM(pressureKpa: number): number {
  return (1 - Math.pow(pressureKpa / 101.325, 1 / 5.25588)) / 2.25577e-5;
}

/**
 * Tu ciudad. Cuenca está a unos 2.560 m y su temperatura media ronda los 15 °C;
 * son las condiciones con las que se calcula la ficha "En Cuenca".
 */
export const HOME_CITY = { label: 'Cuenca', altitudeM: 2560, tempC: 15 } as const;

/**
 * Límites de velocidad para vehículos livianos en Ecuador (LOTTTSV). Sirven de
 * atajo para el aviso: la señalización de cada vía manda.
 */
export const ECUADOR_LIMITS: { label: string; kmh: number }[] = [
  { label: 'Urbano', kmh: 50 },
  { label: 'Curva', kmh: 60 },
  { label: 'Perimetral', kmh: 90 },
  { label: 'Carretera', kmh: 100 },
];
