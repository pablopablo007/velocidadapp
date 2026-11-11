import type { Vehicle } from '@/vehicles/polo';

/**
 * Volkswagen Gol Pick Up 1.8 2005, la camioneta de cabina simple.
 *
 * En Brasil se vende como Saveiro (tercera generación, G3) y llega a Ecuador
 * importada desde allí con el nombre de Gol Pick Up. Lleva el AP-1800 de 8
 * válvulas a gasolina, con el motor montado en sentido longitudinal como todos
 * los Gol hasta la G4.
 *
 * Fuentes: fichas de la Saveiro 1.8 Mi G3 en catálogos brasileños (iCarros,
 * Mobiauto, Ficha Completa) y la matrícula del vehículo (1.800 cc, 0,75 t,
 * gasolina, origen Brasil). Las fichas no coinciden del todo entre sí: el peso
 * va de 1.005 a 1.025 kg, el largo de 4.377 a 4.441 mm y el tanque de 51 a
 * 53 L. Aquí se toma el valor del medio o el más citado.
 */
export const GOL_PICKUP_2005: Vehicle = {
  id: 'gol-pickup-2005-18',
  bodyType: 'pickup',
  nickname: 'Mi Gol',
  make: 'Volkswagen',
  model: 'Gol Pick Up',
  year: 2005,
  trim: '1.8 Mi MT5',

  engine: 'AP-1800 Mi',
  engineFamily: 'EA827 (AP)',
  layout: 'Delantero longitudinal',
  displacementL: 1.8,
  displacementCc: 1781,
  cylinders: 4,
  valves: 8,
  boreMm: 81,
  strokeMm: 86.4,
  valvetrain: 'SOHC 8v con correa dentada',
  injection: 'Multipunto (Mi)',
  fuel: 'Gasolina',
  aspiration: 'Atmosférico',
  powerHp: 98,
  powerCv: 99,
  powerRpm: 5250,
  torqueNm: 152,
  torqueRpm: 3000,
  torqueRpmTo: 3000,

  transmission: 'Manual',
  gearCount: 5,
  drivetrain: 'Delantera (FWD)',

  suspensionFront: 'Independiente McPherson',
  suspensionRear: 'Eje de torsión con resortes helicoidales',
  brakesFront: 'Discos',
  brakesRear: 'Tambor',
  steering: 'Asistencia hidráulica',

  airbags: 0,
  assists: [],

  tirePressureFrontBar: 2.0,
  tirePressureRearBar: 2.1,
  serviceIntervalKm: 5000,

  tire: { widthMm: 185, aspect: 60, rimIn: 14 },

  topSpeedKmh: 162,
  accel0100Factory: 11.9,
  // No hay una prueba de prensa de esta versión: se repite el dato de fábrica.
  accel0100Tested: 11.9,

  curbWeightKg: 1015,
  fuelTankL: 51,

  consumptionCity: 10.5,
  consumptionHwy: 7.8,
  consumptionMixed: 9.0,

  lengthMm: 4377,
  widthMm: 1638,
  heightMm: 1440,
  wheelbaseMm: 2470,
  trunkL: 0,
  payloadKg: 750,

  sourceNote:
    'Cifras de la Saveiro 1.8 Mi G3 (la Gol Pick Up de Brasil) según catálogos brasileños, y carga útil según la matrícula. Las fichas varían un poco entre fuentes; ajústalas abajo si tu unidad difiere.',
};
