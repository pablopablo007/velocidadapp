/**
 * Ficha del vehículo. Precargado con el Volkswagen Polo Track 2026 1.6 MSI
 * (mercado Sudamérica: Ecuador / Colombia / Argentina).
 *
 * Fuentes de las cifras de fábrica y de pruebas independientes:
 *  - Volkswagen Colombia / Ecuador: 1.6 MSI, 110 CV (108 hp) @ 5.750 rpm, 155 Nm @ 4.000 rpm, MT5
 *  - El Carro Colombiano (lanzamiento Polo Track): dimensiones y motorización
 *  - Autoblog Uruguay / prensa AR (test): 0-100 km/h ~10,6 s reales, Vmáx ~185-187 km/h,
 *    peso en orden de marcha 1.080 kg, consumo mixto 6,92 L/100 km
 *
 * Todo es editable desde la pestaña "Garaje". Solo hay cifras publicadas o
 * medidas: no se guardan relaciones de caja ni rpm, porque sin conexión OBD-II
 * la app no puede leerlas del carro y no muestra estimaciones como si fueran
 * datos reales.
 */

export type BodyType = 'hatchback' | 'pickup';

export type Vehicle = {
  id: string;
  /** Carrocería: decide la ilustración y si se habla de baúl o de balde. */
  bodyType: BodyType;
  nickname: string;
  make: string;
  model: string;
  year: number;
  trim: string;

  engine: string;
  engineFamily: string;
  layout: string;
  displacementL: number;
  displacementCc: number;
  cylinders: number;
  valves: number;
  boreMm: number;
  strokeMm: number;
  valvetrain: string;
  injection: string;
  fuel: string;
  aspiration: string;
  powerHp: number;
  powerCv: number;
  powerRpm: number;
  torqueNm: number;
  torqueRpm: number;
  torqueRpmTo: number;

  transmission: string;
  gearCount: number;
  drivetrain: string;

  suspensionFront: string;
  suspensionRear: string;
  brakesFront: string;
  brakesRear: string;
  steering: string;

  airbags: number;
  assists: string[];

  /** Presión de inflado en bar. La real está en la etiqueta del pilar de la puerta. */
  tirePressureFrontBar: number;
  tirePressureRearBar: number;
  /** Intervalo de servicio en km. */
  serviceIntervalKm: number;

  /** 185/65 R15 → ancho 185 mm, perfil 65 %, llanta 15" */
  tire: { widthMm: number; aspect: number; rimIn: number };

  topSpeedKmh: number;
  accel0100Factory: number;
  accel0100Tested: number;

  curbWeightKg: number;
  fuelTankL: number;

  /** L/100 km declarados / medidos */
  consumptionCity: number;
  consumptionHwy: number;
  consumptionMixed: number;

  lengthMm: number;
  widthMm: number;
  heightMm: number;
  wheelbaseMm: number;
  /** Litros de baúl. En una camioneta es 0 y manda `payloadKg`. */
  trunkL: number;
  /** Carga útil en kg (camionetas). */
  payloadKg?: number;

  /** De dónde salen las cifras: se muestra al pie de la ficha. */
  sourceNote: string;
};

export const POLO_TRACK_2026: Vehicle = {
  id: 'polo-track-2026-16',
  bodyType: 'hatchback',
  nickname: 'Mi Polo Track',
  make: 'Volkswagen',
  model: 'Polo Track',
  year: 2026,
  trim: '1.6 MSI MT5',

  engine: 'EA211 1.6 MSI',
  engineFamily: 'EA211',
  layout: 'Delantero transversal',
  displacementL: 1.6,
  displacementCc: 1598,
  cylinders: 4,
  valves: 16,
  boreMm: 76.5,
  strokeMm: 86.9,
  valvetrain: 'DOHC 16v con distribución variable',
  injection: 'Multipunto (MSI)',
  fuel: 'Gasolina',
  aspiration: 'Atmosférico',
  powerHp: 108,
  powerCv: 110,
  powerRpm: 5750,
  torqueNm: 155,
  torqueRpm: 3800,
  torqueRpmTo: 4000,

  transmission: 'Manual',
  gearCount: 5,
  drivetrain: 'Delantera (FWD)',

  suspensionFront: 'Independiente McPherson',
  suspensionRear: 'Eje de brazos longitudinales',
  brakesFront: 'Discos ventilados',
  brakesRear: 'Tambor',
  steering: 'Asistencia eléctrica (EPS)',

  airbags: 4,
  assists: [
    'ABS con EBD',
    'ESC control de estabilidad',
    'ASR control de tracción',
    'HHC arranque en pendiente',
    'Anclajes ISOFIX',
  ],

  tirePressureFrontBar: 2.2,
  tirePressureRearBar: 2.1,
  serviceIntervalKm: 10000,

  tire: { widthMm: 185, aspect: 65, rimIn: 15 },

  topSpeedKmh: 187,
  accel0100Factory: 10.0,
  accel0100Tested: 10.6,

  curbWeightKg: 1080,
  fuelTankL: 52,

  consumptionCity: 8.3,
  consumptionHwy: 5.6,
  consumptionMixed: 6.92,

  lengthMm: 4079,
  widthMm: 1751,
  heightMm: 1471,
  wheelbaseMm: 2566,
  trunkL: 300,

  sourceNote:
    'Cifras del Polo Track 1.6 MSI para Sudamérica según Volkswagen y pruebas de prensa independiente. Puedes ajustarlas abajo si tu unidad difiere.',
};

/** Relación peso/potencia en kg por CV. */
export function powerToWeight(v: Vehicle): number {
  return v.curbWeightKg / v.powerCv;
}

/** Potencia específica en CV por litro: cuánto exprime el motor su cilindrada. */
export function specificPower(v: Vehicle): number {
  return v.powerCv / v.displacementL;
}

/**
 * Relación carrera/diámetro. Por encima de 1 el motor es "supercuadrado" a la
 * inversa: carrera larga, que favorece el par abajo antes que las vueltas.
 */
export function strokeToBore(v: Vehicle): number {
  return v.strokeMm / v.boreMm;
}

/** Circunferencia de rodadura en metros a partir de la medida de la llanta. */
export function rollingCircumferenceM(v: Vehicle): number {
  const sidewallMm = v.tire.widthMm * (v.tire.aspect / 100);
  const diameterMm = v.tire.rimIn * 25.4 + sidewallMm * 2;
  // ~2 % de deformación bajo carga respecto al diámetro geométrico.
  return (Math.PI * diameterMm * 0.98) / 1000;
}

/**
 * Modelo de consumo estimado (L) para un tramo.
 *
 * No hay OBD-II conectado, así que se modela a partir de física simple:
 *   - consumo en ralentí (~0,7 L/h) cuando el carro está parado
 *   - una curva en U respecto a la velocidad, calibrada para que a ~90 km/h
 *     dé el consumo mixto declarado del vehículo
 *   - penalización por aceleraciones fuertes
 * Sirve para comparar viajes entre sí, no como medidor legal.
 */
export function fuelForSegment(
  v: Vehicle,
  distanceM: number,
  seconds: number,
  avgKmh: number,
  accelPenalty = 0
): number {
  const IDLE_L_PER_H = 0.7;
  if (avgKmh < 3) return (IDLE_L_PER_H * seconds) / 3600;

  // Curva en U: mínimo alrededor de 75-85 km/h, sube en ciudad y a alta velocidad.
  const optimum = 80;
  const base = v.consumptionMixed;
  const lowSpeedFactor = avgKmh < optimum ? 1 + Math.pow((optimum - avgKmh) / optimum, 1.7) * 0.85 : 1;
  const highSpeedFactor = avgKmh > optimum ? 1 + Math.pow((avgKmh - optimum) / 60, 2) * 0.9 : 1;

  const lPer100 = base * lowSpeedFactor * highSpeedFactor * (1 + accelPenalty);
  return (lPer100 * (distanceM / 1000)) / 100;
}

/** Autonomía restante estimada (km) con X litros y el consumo real del viaje. */
export function rangeKm(litres: number, lPer100: number): number {
  if (lPer100 <= 0) return 0;
  return (litres / lPer100) * 100;
}
