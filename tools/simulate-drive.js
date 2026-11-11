#!/usr/bin/env node
/**
 * Recorrido sintético para verificar el motor de cálculo sin subirse al carro.
 *
 * Alimenta al `TripEngine` con lecturas de GPS generadas a partir de física
 * conocida (velocidad, aceleración y desnivel exactos) y comprueba que lo que
 * devuelve coincide con el valor teórico. Cubre lo que es difícil de probar
 * conduciendo: deriva del GPS con el carro parado, lecturas basura y tiempos
 * de aceleración con margen de décimas.
 *
 *   npm run test:engine
 */
const path = require('path');
const Module = require('module');
const BUILD = path.join(__dirname, '..', '.sim-build');

// Resuelve los alias "@/..." de los módulos compilados.
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith('@/')) request = path.join(BUILD, request.slice(2));
  return origResolve.call(this, request, ...args);
};

const { TripEngine } = require(path.join(BUILD, 'services/tripEngine.js'));
const { POLO_TRACK_2026 } = require(path.join(BUILD, 'vehicles/polo.js'));
const { simplify } = require(path.join(BUILD, 'utils/geo.js'));
const { altitudeEffect, sae1349Factor, standardPressureKpa } = require(path.join(BUILD, 'utils/altitude.js'));
const { percentileFromHistogram, HIST_BIN_KMH } = require(path.join(BUILD, 'services/speedStats.js'));
const { gaugeDirection, gaugeRotation, gaugeDegFor } = require(path.join(BUILD, 'utils/gauge.js'));

const M_PER_DEG_LAT = 111132;
const T0 = 1700000000000;
let failures = 0;

function check(name, actual, expected, tol) {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  const a = typeof actual === 'number' ? actual.toFixed(2) : actual;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name.padEnd(40)} = ${String(a).padStart(9)}  (esperado ${expected} ±${tol})`);
}

/** Genera lecturas moviéndose hacia el norte desde una latitud base. */
function makeFix(tSec, northM, speedMs, altitude, accuracy = 5) {
  return {
    latitude: -0.18 + northM / M_PER_DEG_LAT,
    longitude: -78.47,
    altitude,
    accuracy,
    altitudeAccuracy: 3,
    speed: speedMs,
    heading: 0,
    timestamp: T0 + tSec * 1000,
  };
}

// ---------------------------------------------------------------- 1. crucero
{
  console.log('\n— Crucero constante a 100 km/h durante 60 s —');
  const e = new TripEngine(POLO_TRACK_2026, T0);
  const v = 100 / 3.6;
  for (let t = 0; t <= 60; t++) e.ingest(makeFix(t, v * t, v, 2800));
  const s = e.stats(T0 + 60000);
  check('distancia (m)', s.distanceM, v * 60, 5);
  check('velocidad actual (km/h)', s.speedKmh, 100, 0.1);
  check('velocidad máxima (km/h)', s.maxSpeedKmh, 100, 0.1);
  check('media total (km/h)', s.avgSpeedKmh, 100, 1);
  check('tiempo detenido (ms)', s.stoppedMs, 0, 1);
  check('desnivel acumulado (m)', s.elevGain + s.elevLoss, 0, 0.5);
}

// ---------------------------------------------------------------- 2. arrancada
{
  console.log('\n— Arrancada: parado 5 s, luego 2.60 m/s² constante —');
  const e = new TripEngine(POLO_TRACK_2026, T0);
  const a = 2.6;
  let dist = 0;
  for (let t = 0; t < 5; t++) e.ingest(makeFix(t, 0, 0, 2800));
  for (let i = 0; i <= 130; i++) {
    const t = 5 + i * 0.5;
    const dt = i === 0 ? 0 : 0.5;
    const v = a * (t - 5);
    dist += (a * (t - 5) - a * 0.5) * dt > 0 ? (v - (a * dt) / 2) * dt : 0;
    e.ingest(makeFix(t, dist, v, 2800));
  }
  const s = e.stats(T0 + 70000);
  const teorico0_100 = 100 / 3.6 / a;
  const teorico0_60 = 60 / 3.6 / a;
  check('0-100 km/h (s)', s.perf.t0_100, teorico0_100, 0.15);
  check('0-60 km/h (s)', s.perf.t0_60, teorico0_60, 0.15);
  check('60-100 km/h (s)', s.perf.t60_100, teorico0_100 - teorico0_60, 0.2);
}

// ---------------------------------------------------------------- 3. desnivel
{
  console.log('\n— Subida de 100 m y bajada de 100 m (con ruido de ±1,5 m) —');
  const e = new TripEngine(POLO_TRACK_2026, T0);
  const v = 60 / 3.6;
  let t = 0;
  const noise = (i) => Math.sin(i * 2.3) * 1.5;
  for (let i = 0; i <= 100; i++, t++) e.ingest(makeFix(t, v * t, v, 2800 + i + noise(i)));
  for (let i = 0; i <= 100; i++, t++) e.ingest(makeFix(t, v * t, v, 2900 - i + noise(i)));
  const s = e.stats(T0 + t * 1000);
  check('ascenso acumulado (m)', s.elevGain, 100, 12);
  check('descenso acumulado (m)', s.elevLoss, 100, 12);
  check('altitud mínima (m)', s.minAlt, 2800, 3);
  check('altitud máxima (m)', s.maxAlt, 2900, 3);
}

// ---------------------------------------------------------------- 4. deriva
{
  console.log('\n— Carro detenido 5 min con deriva de GPS —');
  const e = new TripEngine(POLO_TRACK_2026, T0);
  for (let t = 0; t <= 300; t++) {
    const drift = Math.sin(t * 0.7) * 4 + Math.cos(t * 1.9) * 3; // ±7 m
    e.ingest(makeFix(t, drift, 0, 2800 + Math.sin(t) * 2, 8));
  }
  const s = e.stats(T0 + 300000);
  check('distancia acumulada (m)', s.distanceM, 0, 1);
  check('desnivel falso (m)', s.elevGain + s.elevLoss, 0, 1);
  check('tiempo detenido (s)', s.stoppedMs / 1000, 300, 1);
}

// ---------------------------------------------------------------- 5. saltos
{
  console.log('\n— Rechazo de lecturas basura —');
  const e = new TripEngine(POLO_TRACK_2026, T0);
  const v = 80 / 3.6;
  e.ingest(makeFix(0, 0, v, 2800));
  const impreciso = e.ingest(makeFix(1, v, v, 2800, 120));       // precisión 120 m
  const salto = e.ingest(makeFix(2, 100000, v, 2800, 5));        // teletransporte
  const bueno = e.ingest(makeFix(2, v * 2, v, 2800, 5));
  check('lectura imprecisa rechazada', impreciso ? 1 : 0, 0, 0);
  check('salto imposible rechazado', salto ? 1 : 0, 0, 0);
  check('lectura válida aceptada', bueno ? 1 : 0, 1, 0);
}

// ---------------------------------------------------------------- 6. frenada
{
  console.log('\n— Frenada de 120 km/h hasta 0 a 8 m/s² —');
  const e = new TripEngine(POLO_TRACK_2026, T0);
  const v0 = 120 / 3.6;
  const dec = 8;
  let dist = 0;
  for (let i = 0; i <= 20; i++) e.ingest(makeFix(i * 0.5, (dist += v0 * 0.5), v0, 2800));
  const tFrenada = v0 / dec;
  for (let i = 1; i * 0.2 <= tFrenada + 1; i++) {
    const dt = i * 0.2;
    const v = Math.max(0, v0 - dec * dt);
    dist += v * 0.2;
    e.ingest(makeFix(10 + dt, dist, v, 2800));
  }
  const s = e.stats(T0 + 25000);
  check('100-0 km/h (s)', s.perf.t100_0, 100 / 3.6 / dec, 0.25);
}

// ---------------------------------------------------------------- 7. varios
{
  console.log('\n— Utilidades —');
  const pts = [];
  for (let i = 0; i < 500; i++) {
    pts.push({ latitude: -0.18 + i * 0.00001, longitude: -78.47 + Math.sin(i / 40) * 0.0002 });
  }
  const reduced = simplify(pts, 4);
  check('simplify reduce puntos', reduced.length < pts.length ? 1 : 0, 1, 0);
  check('simplify conserva extremos', reduced[0] === pts[0] && reduced[reduced.length - 1] === pts[pts.length - 1] ? 1 : 0, 1, 0);

}

// ---------------------------------------------------------------- 8. altitud
{
  console.log('\n— Corrección de potencia por altitud (SAE J1349) —');
  // Al nivel del mar y a 25 °C el factor debe quedar pegado a 1: son las
  // condiciones de referencia de la norma.
  check('presión al nivel del mar (kPa)', standardPressureKpa(0), 101.3, 0.1);
  check('presión en Quito (kPa)', standardPressureKpa(2850), 71.5, 0.5);
  check('factor al nivel del mar', sae1349Factor(0, 25), 0.973, 0.01);

  const quito = altitudeEffect(POLO_TRACK_2026, 2850, 18);
  check('potencia en Quito (CV)', quito.powerCv, 77, 2);
  check('par en Quito (Nm)', quito.torqueNm, 108, 3);
  // La regla práctica del oficio (3 % por cada 1.000 pies) da 24-30 % en este
  // rango: sirve de contraste independiente de la fórmula.
  check('pérdida en Quito (%)', quito.lossPct, 30, 3);
  check('peso/potencia en Quito (kg/CV)', quito.weightPerPowerKg, 14.1, 0.5);
  check('0-100 esperado en Quito (s)', (quito.target0100Min + quito.target0100Max) / 2, 14.0, 0.8);

  const mar = altitudeEffect(POLO_TRACK_2026, 0, 25);
  check('al nivel del mar no pierde', mar.lossPct, -2.8, 1);
  check('más altura, menos potencia',
    altitudeEffect(POLO_TRACK_2026, 3500, 15).powerCv < quito.powerCv ? 1 : 0, 1, 0);

  // Cuenca: 2.560 m y unos 15 °C de media.
  const cuenca = altitudeEffect(POLO_TRACK_2026, 2560, 15);
  check('presión en Cuenca (kPa)', cuenca.pressureKpa, 74.1, 0.5);
  check('potencia en Cuenca (CV)', cuenca.powerCv, 80, 2);
  check('0-100 esperado en Cuenca (s)', (cuenca.target0100Min + cuenca.target0100Max) / 2, 13.4, 0.7);
  check('sin barómetro usa la atmósfera estándar', cuenca.pressureSource === 'estandar' ? 1 : 0, 1, 0);

  // Con barómetro manda la presión medida: un día de presión baja (borrasca)
  // resta potencia aunque la altitud sea la misma.
  const borrasca = altitudeEffect(POLO_TRACK_2026, 2560, 15, 72.0);
  check('usa la presión del barómetro', borrasca.pressureSource === 'barometro' ? 1 : 0, 1, 0);
  check('presión baja, menos potencia', borrasca.powerCv < cuenca.powerCv ? 1 : 0, 1, 0);
  check('presión absurda se ignora', altitudeEffect(POLO_TRACK_2026, 2560, 15, 5).pressureSource === 'estandar' ? 1 : 0, 1, 0);
}

// ---------------------------------------------------------------- 9. análisis
{
  console.log('\n— Máxima sostenida, percentiles y tiempo en exceso —');
  const e = new TripEngine(POLO_TRACK_2026, T0);
  e.speedLimitKmh = 90;

  // 100 s a 100 km/h, con UN pico falso de 160 km/h en medio: el pico no debe
  // contaminar la máxima sostenida.
  const v = 100 / 3.6;
  let dist = 0;
  for (let t = 0; t <= 100; t++) {
    const esPico = t === 50;
    const vel = esPico ? 160 / 3.6 : v;
    dist += vel;
    e.ingest(makeFix(t, dist, vel, 2850));
  }
  const s = e.stats(T0 + 100000);
  check('máxima pico (km/h)', s.maxSpeedKmh, 160, 0.5);
  check('máxima sostenida ignora el pico', s.analysis.sustainedMaxKmh, 100, 1.5);
  check('percentil 85 (km/h)', s.analysis.p85Kmh, 100, HIST_BIN_KMH);
  check('tiempo sobre 90 km/h (s)', s.analysis.overLimitMs / 1000, 100, 2);

  // Histograma repartido: mitad a 40, mitad a 120 → el P85 debe caer arriba.
  const hist = new Array(24).fill(0);
  hist[4] = 50000;  // 40-50 km/h
  hist[12] = 50000; // 120-130 km/h
  check('P50 en el tramo lento', percentileFromHistogram(hist, 0.5), 50, 12);
  check('P85 en el tramo rápido', percentileFromHistogram(hist, 0.85), 128, 12);
}

// ---------------------------------------------------------------- 10. en marcha
{
  console.log('\n— Recuperación 60 → 100 km/h sin detenerse —');
  const e = new TripEngine(POLO_TRACK_2026, T0);
  const a = 1.9; // m/s², plausible en 3ª/4ª en altura
  let dist = 0;
  let vel = 50 / 3.6;

  // Rueda a 50, luego acelera a fondo hasta 115 km/h.
  for (let i = 0; i <= 10; i++) {
    dist += vel;
    e.ingest(makeFix(i, dist, vel, 2850));
  }
  const tInicio = 10;
  for (let i = 1; i <= 60; i++) {
    const t = tInicio + i * 0.5;
    vel = Math.min(115 / 3.6, 50 / 3.6 + a * (i * 0.5));
    dist += vel * 0.5;
    e.ingest(makeFix(t, dist, vel, 2850));
  }
  const s = e.stats(T0 + 60000);
  const teorico = (100 - 60) / 3.6 / a;
  check('60 → 100 en marcha (s)', s.perf.roll60_100, teorico, 0.3);
  check('no inventa un 0-100', s.perf.t0_100 == null ? 1 : 0, 1, 0);
}

// ---------------------------------------------------------------- 11. dial
{
  console.log('\n— Orientación del velocímetro —');
  // En SVG la y crece hacia abajo: y negativa es arriba de la pantalla.
  const parado = gaugeDirection(0, 200);
  check('en 0 apunta a la izquierda', parado.x, -0.707, 0.02);
  check('en 0 apunta hacia abajo', parado.y, +0.707, 0.02);

  const mitad = gaugeDirection(100, 200);
  check('a media escala apunta arriba', mitad.y, -1, 0.02);
  check('a media escala está centrado', mitad.x, 0, 0.02);

  const tope = gaugeDirection(200, 200);
  check('al tope apunta a la derecha', tope.x, +0.707, 0.02);
  check('al tope apunta hacia abajo', tope.y, +0.707, 0.02);

  // La aguja se dibuja apuntando arriba, así que en 0 hay que girarla 135°
  // en contra del reloj. Aquí estaba el error de 180°.
  check('rotación de la aguja en 0', gaugeRotation(0, 200), -135, 0.01);
  check('rotación de la aguja al tope', gaugeRotation(200, 200), 135, 0.01);
  check('el barrido crece con la velocidad',
    gaugeDegFor(150, 200) > gaugeDegFor(50, 200) ? 1 : 0, 1, 0);
  check('se acota por encima del máximo', gaugeDegFor(500, 200), gaugeDegFor(200, 200), 0.01);
  check('se acota por debajo de cero', gaugeDegFor(-30, 200), gaugeDegFor(0, 200), 0.01);
}

console.log(failures === 0 ? '\nTodas las comprobaciones pasaron.' : `\n${failures} comprobaciones fallaron.`);
process.exit(failures === 0 ? 0 : 1);
