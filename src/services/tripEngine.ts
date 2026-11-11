import {
  BaroAltitudeFusion,
  ElevationAccumulator,
  GradeTracker,
  bearing,
  haversine,
} from '@/utils/geo';
import { MS_TO_KMH } from '@/utils/format';
import { Vehicle, fuelForSegment } from '@/vehicles/polo';
import { EMPTY_ANALYSIS, SpeedAnalysis, SpeedAnalyzer } from './speedStats';

/** Punto almacenado de la traza. Nombres cortos: se serializa a JSON en la BD. */
export type TrackPoint = {
  t: number; // epoch ms
  lat: number;
  lon: number;
  s: number; // velocidad en m/s (filtrada)
  a: number | null; // altitud filtrada, m
  d: number; // distancia acumulada, m
};

export type RawFix = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  altitudeAccuracy: number | null;
  speed: number | null; // m/s, -1 o null si no disponible
  heading: number | null;
  timestamp: number;
  /** Presión del barómetro en el momento de la lectura, si la hay. */
  pressureHpa?: number | null;
  /** El acelerómetro y el giroscopio dicen que el teléfono está en calma total. */
  still?: boolean;
};

export type PerfResults = {
  t0_60: number | null; // 0-60 km/h, s
  t0_100: number | null; // 0-100 km/h, s
  t60_100: number | null; // parcial 60→100 dentro de una arrancada
  t100_0: number | null; // frenada, s
  t201m: number | null; // 1/8 de milla, s
  t402m: number | null; // 1/4 de milla, s
  vTrap: number | null; // velocidad al cruzar los 402 m, km/h
  /** Recuperaciones en marcha: sin salir de parado, como las mide una Dragy. */
  roll60_100: number | null;
  roll80_120: number | null;
};

const EMPTY_PERF: PerfResults = {
  t0_60: null,
  t0_100: null,
  t60_100: null,
  t100_0: null,
  t201m: null,
  t402m: null,
  vTrap: null,
  roll60_100: null,
  roll80_120: null,
};

/**
 * Recuperación en marcha: vas circulando a `fromKmh`, pisas a fondo y se mide
 * lo que tardas en llegar a `toKmh`.
 *
 * Importa más que el 0-100 en el uso real: casi nunca arrancas a fondo desde
 * parado, pero adelantar en carretera es exactamente esto. Y en un motor
 * atmosférico en altura es donde más se nota la falta de aire.
 */
class RollDetector {
  best: number | null = null;
  private startT: number | null = null;

  constructor(
    private readonly fromKmh: number,
    private readonly toKmh: number
  ) {}

  push(prevT: number, prevKmh: number, tMs: number, kmh: number): void {
    if (this.startT == null) {
      if (prevKmh < this.fromKmh && kmh >= this.fromKmh) {
        this.startT = interpTime(prevT, prevKmh, tMs, kmh, this.fromKmh);
      }
      return;
    }
    // Levantó el pie o frenó: la medición deja de ser una tirada limpia.
    if (kmh < this.fromKmh - 3) {
      this.startT = null;
      return;
    }
    if (prevKmh < this.toKmh && kmh >= this.toKmh) {
      const seconds = (interpTime(prevT, prevKmh, tMs, kmh, this.toKmh) - this.startT) / 1000;
      if (this.best == null || seconds < this.best) this.best = seconds;
      this.startT = null;
    }
  }

  reset(): void {
    this.startT = null;
  }
}

/** Umbral por debajo del cual consideramos el carro detenido (m/s ≈ 1,8 km/h). */
const STOPPED_MS = 0.5;
/** Descarta lecturas con error horizontal mayor a esto (m). */
const MAX_ACCURACY_M = 30;
/**
 * Cambio de velocidad imposible para un carro de calle (m/s², ~1,4 g). Una
 * lectura que lo supera es un pico del GPS, no una frenada ni una acelerada.
 */
const MAX_PLAUSIBLE_ACCEL = 14;
/** Con el teléfono en calma total, por debajo de esto (m/s ≈ 5 km/h) es deriva del GPS. */
const STILL_CLAMP_MS = 1.5;

/**
 * Detector automático de tiempos de aceleración y frenada.
 *
 * Trabaja sobre el flujo de velocidad e interpola linealmente el instante
 * exacto en que se cruza cada umbral, así el resultado no queda "cuantizado"
 * al 1 Hz del GPS.
 */
export class PerformanceTimer {
  best: PerfResults = { ...EMPTY_PERF };
  private run: PerfResults = { ...EMPTY_PERF };

  private launchT: number | null = null;
  private launchDist = 0;
  private prev: { t: number; v: number; d: number } | null = null;
  /** Primera lectura en movimiento, a la espera de la siguiente para fijar el instante de salida. */
  private pendingLaunch: { t: number; v: number; d: number } | null = null;

  private brakeStartT: number | null = null;
  private brakeMinV = Infinity;

  private roll60_100 = new RollDetector(60, 100);
  private roll80_120 = new RollDetector(80, 120);

  /** Última tanda cerrada, para mostrarla en el HUD justo después de la pasada. */
  lastRun: PerfResults | null = null;

  push(tMs: number, vMs: number, distM: number): void {
    const prev = this.prev;
    this.prev = { t: tMs, v: vMs, d: distM };
    if (!prev) return;

    const dt = (tMs - prev.t) / 1000;
    if (dt <= 0 || dt > 3) {
      // Hueco en la señal: cualquier medición en curso deja de ser válida.
      this.abortRun();
      return;
    }

    // Las recuperaciones en marcha son independientes de las arrancadas: van
    // corriendo todo el tiempo, se pise o no desde parado.
    const prevKmh = prev.v * MS_TO_KMH;
    const kmh = vMs * MS_TO_KMH;
    this.roll60_100.push(prev.t, prevKmh, tMs, kmh);
    this.roll80_120.push(prev.t, prevKmh, tMs, kmh);
    this.best.roll60_100 = this.roll60_100.best;
    this.best.roll80_120 = this.roll80_120.best;

    // ---- Resolución del instante de salida ----
    //
    // La primera lectura en movimiento ya trae velocidad acumulada: si se
    // tomara ese instante como t=0, todos los tiempos saldrían cortos (a 2,6
    // m/s² el carro tarda ~0,19 s solo en llegar al umbral de detección).
    // Con la aceleración medida en el intervalo siguiente se extrapola hacia
    // atrás hasta v = 0, que es donde de verdad empieza la arrancada.
    if (this.pendingLaunch && this.pendingLaunch.t < tMs) {
      const launch = this.pendingLaunch;
      this.pendingLaunch = null;
      const accel = (vMs - launch.v) / ((tMs - launch.t) / 1000);
      if (accel > 0.2) {
        const backSeconds = launch.v / accel;
        this.launchT = launch.t - backSeconds * 1000;
        this.launchDist = launch.d - (launch.v * backSeconds) / 2;
      } else {
        // Arranque muy suave: el error de tomar esta lectura como origen es
        // despreciable frente al ruido del GPS.
        this.launchT = launch.t;
        this.launchDist = launch.d;
      }
      this.run = { ...EMPTY_PERF };
    }

    // ---- Lanzamiento: de parado a en movimiento ----
    if (prev.v < STOPPED_MS && vMs >= STOPPED_MS) {
      this.pendingLaunch = { t: tMs, v: vMs, d: distM };
      this.launchT = null;
      this.run = { ...EMPTY_PERF };
    }

    // Si desacelera hasta parar sin haber logrado nada, cierra la tanda.
    if (vMs < STOPPED_MS && this.launchT != null) {
      this.closeRun();
    }

    // ---- Cruces de aceleración ----
    if (this.launchT != null) {
      const crossUp = (targetKmh: number) => {
        const target = targetKmh / MS_TO_KMH;
        if (prev.v < target && vMs >= target) {
          return (interpTime(prev.t, prev.v, tMs, vMs, target) - this.launchT!) / 1000;
        }
        return null;
      };

      const c60 = crossUp(60);
      if (c60 != null && this.run.t0_60 == null) this.run.t0_60 = c60;

      const c100 = crossUp(100);
      if (c100 != null && this.run.t0_100 == null) {
        this.run.t0_100 = c100;
        if (this.run.t0_60 != null) this.run.t60_100 = c100 - this.run.t0_60;
      }

      // Marcas de distancia desde el lanzamiento: 201 m (1/8 de milla) y
      // 402 m (1/4 de milla).
      const traveled = distM - this.launchDist;
      const prevTraveled = prev.d - this.launchDist;
      const crossDistance = (meters: number) => {
        if (prevTraveled >= meters || traveled < meters) return null;
        const frac = (meters - prevTraveled) / (traveled - prevTraveled);
        return {
          seconds: (prev.t + (tMs - prev.t) * frac - this.launchT!) / 1000,
          kmh: (prev.v + (vMs - prev.v) * frac) * MS_TO_KMH,
        };
      };

      const eighth = crossDistance(201);
      if (eighth && this.run.t201m == null) this.run.t201m = eighth.seconds;

      const quarter = crossDistance(402);
      if (quarter && this.run.t402m == null) {
        this.run.t402m = quarter.seconds;
        this.run.vTrap = quarter.kmh;
      }

      this.commitBest();
    }

    // ---- Frenada 100 → 0 ----
    const hundred = 100 / MS_TO_KMH;
    if (prev.v >= hundred && vMs < hundred) {
      this.brakeStartT = interpTime(prev.t, prev.v, tMs, vMs, hundred);
      this.brakeMinV = vMs;
    } else if (this.brakeStartT != null) {
      if (vMs > this.brakeMinV + 1.0) {
        // Volvió a acelerar: no fue una frenada hasta detenerse.
        this.brakeStartT = null;
        this.brakeMinV = Infinity;
      } else {
        this.brakeMinV = Math.min(this.brakeMinV, vMs);
        if (prev.v >= STOPPED_MS && vMs < STOPPED_MS) {
          const stopT = interpTime(prev.t, prev.v, tMs, vMs, STOPPED_MS);
          const seconds = (stopT - this.brakeStartT) / 1000;
          this.run.t100_0 = seconds;
          if (this.best.t100_0 == null || seconds < this.best.t100_0) {
            this.best.t100_0 = seconds;
          }
          this.brakeStartT = null;
          this.brakeMinV = Infinity;
        }
      }
    }
  }

  private commitBest(): void {
    const keys: (keyof PerfResults)[] = ['t0_60', 't0_100', 't60_100', 't201m', 't402m'];
    for (const k of keys) {
      const v = this.run[k];
      if (v == null) continue;
      const b = this.best[k];
      if (b == null || v < b) {
        this.best[k] = v;
        if (k === 't402m') this.best.vTrap = this.run.vTrap;
      }
    }
  }

  private closeRun(): void {
    if (this.run.t0_60 != null || this.run.t0_100 != null || this.run.t201m != null) {
      this.lastRun = { ...this.run };
    }
    this.launchT = null;
    this.pendingLaunch = null;
    this.run = { ...EMPTY_PERF };
  }

  private abortRun(): void {
    this.launchT = null;
    this.pendingLaunch = null;
    this.run = { ...EMPTY_PERF };
    this.brakeStartT = null;
    this.brakeMinV = Infinity;
    this.roll60_100.reset();
    this.roll80_120.reset();
  }
}

function interpTime(t0: number, v0: number, t1: number, v1: number, target: number): number {
  if (v1 === v0) return t1;
  const frac = (target - v0) / (v1 - v0);
  return t0 + (t1 - t0) * Math.max(0, Math.min(1, frac));
}

export type LiveStats = {
  speedKmh: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number; // sobre el tiempo total
  avgMovingKmh: number; // solo mientras se movía
  distanceM: number;
  durationMs: number;
  movingMs: number;
  stoppedMs: number;
  altitude: number | null;
  elevGain: number;
  elevLoss: number;
  maxAlt: number | null;
  minAlt: number | null;
  grade: number; // %
  heading: number | null;
  accuracy: number | null;
  gForce: number; // aceleración longitudinal en g
  fuelL: number;
  perf: PerfResults;
  lastRun: PerfResults | null;
  pointCount: number;
  analysis: SpeedAnalysis;
};

export const EMPTY_STATS: LiveStats = {
  speedKmh: 0,
  maxSpeedKmh: 0,
  avgSpeedKmh: 0,
  avgMovingKmh: 0,
  distanceM: 0,
  durationMs: 0,
  movingMs: 0,
  stoppedMs: 0,
  altitude: null,
  elevGain: 0,
  elevLoss: 0,
  maxAlt: null,
  minAlt: null,
  grade: 0,
  heading: null,
  accuracy: null,
  gForce: 0,
  fuelL: 0,
  perf: { ...EMPTY_PERF },
  lastRun: null,
  pointCount: 0,
  analysis: EMPTY_ANALYSIS,
};

/**
 * Acumula el estado de un viaje a partir del flujo de posiciones del GPS.
 *
 * Es una clase pura (sin React, sin I/O) para poder razonarla y probarla
 * aparte de la interfaz.
 */
export class TripEngine {
  readonly startedAt: number;
  points: TrackPoint[] = [];
  /** Tiempo en pausa (manual o automática); se descuenta de la duración. */
  pausedMs = 0;

  private distance = 0;
  private maxSpeed = 0;
  private movingMs = 0;
  private stoppedMs = 0;
  private speedTimeIntegral = 0; // Σ v·dt, para la media real ponderada por tiempo
  private fuel = 0;

  private altFilter = new BaroAltitudeFusion();
  private elev = new ElevationAccumulator(2.5);
  private grade = new GradeTracker(120);
  private perfTimer = new PerformanceTimer();
  private analyzer = new SpeedAnalyzer();

  private last: TrackPoint | null = null;
  private lastRaw: RawFix | null = null;
  private lastGForce = 0;
  /** La lectura anterior se descartó por pico: la siguiente se acepta sin esa prueba. */
  private spikeRejected = false;
  private currentSpeed = 0;
  private currentHeading: number | null = null;
  private currentAccuracy: number | null = null;

  constructor(readonly vehicle: Vehicle, startedAt = Date.now()) {
    this.startedAt = startedAt;
  }

  /** Límite de velocidad vigente, para contabilizar el tiempo por encima. */
  set speedLimitKmh(limit: number) {
    this.analyzer.limitKmh = limit;
  }

  /**
   * Procesa una lectura del GPS. Devuelve `true` si el punto se aceptó.
   *
   * Se rechazan lecturas imprecisas y saltos físicamente imposibles: en el
   * carro, un solo punto malo puede inventar kilómetros de distancia.
   */
  ingest(fix: RawFix): boolean {
    const acc = fix.accuracy ?? 999;
    if (acc > MAX_ACCURACY_M) return false;

    const prev = this.last;
    const prevRaw = this.lastRaw;

    // Velocidad: preferimos la del receptor GPS (efecto Doppler, mucho más
    // precisa que derivar la posición). Si no viene, la calculamos.
    let speed = fix.speed != null && fix.speed >= 0 ? fix.speed : NaN;

    let stepDist = 0;
    let dtMs = 0;
    if (prev && prevRaw) {
      dtMs = fix.timestamp - prev.t;
      if (dtMs <= 0) return false;
      const raw = haversine(
        { latitude: prev.lat, longitude: prev.lon },
        { latitude: fix.latitude, longitude: fix.longitude }
      );
      const dtS = dtMs / 1000;

      // Salto imposible (> 80 m/s ≈ 288 km/h): descarta el punto.
      if (raw / dtS > 80) return false;

      // Sin velocidad Doppler se deriva de la posición, pero solo si el
      // desplazamiento supera el error del GPS: si no, es ruido, no movimiento.
      if (!Number.isFinite(speed)) speed = raw >= Math.max(2.5, acc * 0.5) ? raw / dtS : 0;

      // El acelerómetro y el giroscopio no sienten nada: el carro está quieto,
      // y lo poco que marque el GPS es su propia deriva.
      if (fix.still && speed < STILL_CLAMP_MS) speed = 0;
      if (speed < STOPPED_MS) speed = 0;

      // Pico del GPS: ningún carro de calle cambia de velocidad a más de
      // ~1,4 g. Se descarta la lectura; si la siguiente insiste, se acepta
      // (pudo ser real tras un hueco de señal).
      if (dtS <= 3 && !this.spikeRejected && Math.abs(speed - this.currentSpeed) / dtS > MAX_PLAUSIBLE_ACCEL) {
        this.spikeRejected = true;
        return false;
      }
      this.spikeRejected = false;

      // Parado: el GPS "camina" solo. No sumamos esa deriva a la distancia.
      const drifting = speed < STOPPED_MS || raw < Math.max(2.5, acc * 0.5);
      stepDist = drifting ? 0 : raw;

      if (speed >= STOPPED_MS) this.movingMs += dtMs;
      else this.stoppedMs += dtMs;

      this.speedTimeIntegral += speed * dtS;

      // Aceleración longitudinal: media con la lectura anterior, porque la
      // derivada de una señal de 1 Hz amplifica el ruido.
      const dv = speed - this.currentSpeed;
      const g = dtS > 0 && dtS <= 3 ? dv / dtS / 9.80665 : 0;
      this.lastGForce = (this.lastGForce + g) / 2;

      const segKmh = (stepDist / dtS) * MS_TO_KMH;
      const penalty = Math.min(0.45, Math.abs(this.lastGForce) * 1.4);
      this.fuel += fuelForSegment(this.vehicle, stepDist, dtS, segKmh, penalty);
    } else {
      if (!Number.isFinite(speed)) speed = 0;
      if ((fix.still && speed < STILL_CLAMP_MS) || speed < STOPPED_MS) speed = 0;
    }

    this.distance += stepDist;
    this.currentSpeed = speed;
    this.currentAccuracy = fix.accuracy;
    this.maxSpeed = Math.max(this.maxSpeed, speed);

    // Rumbo: el del GPS solo es fiable en movimiento; si no, lo derivamos.
    if (speed >= 1.5 && fix.heading != null && fix.heading >= 0) {
      this.currentHeading = fix.heading;
    } else if (prev && stepDist > 5) {
      this.currentHeading = bearing(
        { latitude: prev.lat, longitude: prev.lon },
        { latitude: fix.latitude, longitude: fix.longitude }
      );
    }

    const alt = this.altFilter.push(fix.altitude, fix.altitudeAccuracy, fix.pressureHpa);
    this.elev.push(alt);
    this.grade.push(stepDist, alt);

    this.perfTimer.push(fix.timestamp, speed, this.distance);
    this.analyzer.push(fix.timestamp, speed * MS_TO_KMH, dtMs, alt);

    const point: TrackPoint = {
      t: fix.timestamp,
      lat: fix.latitude,
      lon: fix.longitude,
      s: speed,
      a: alt,
      d: this.distance,
    };
    this.points.push(point);
    this.last = point;
    this.lastRaw = fix;
    return true;
  }

  stats(now = Date.now()): LiveStats {
    const durationMs = Math.max(0, now - this.startedAt - this.pausedMs);
    const totalS = durationMs / 1000;
    const movingS = this.movingMs / 1000;
    return {
      speedKmh: this.currentSpeed * MS_TO_KMH,
      maxSpeedKmh: this.maxSpeed * MS_TO_KMH,
      avgSpeedKmh: totalS > 0 ? (this.distance / totalS) * MS_TO_KMH : 0,
      avgMovingKmh: movingS > 0 ? (this.distance / movingS) * MS_TO_KMH : 0,
      distanceM: this.distance,
      durationMs,
      movingMs: this.movingMs,
      stoppedMs: this.stoppedMs,
      altitude: this.altFilter.current,
      elevGain: this.elev.gain,
      elevLoss: this.elev.loss,
      maxAlt: this.elev.maxAlt,
      minAlt: this.elev.minAlt,
      grade: this.grade.value,
      heading: this.currentHeading,
      accuracy: this.currentAccuracy,
      gForce: this.lastGForce,
      fuelL: this.fuel,
      perf: { ...this.perfTimer.best },
      lastRun: this.perfTimer.lastRun,
      pointCount: this.points.length,
      analysis: this.analyzer.result(),
    };
  }

  /** Media aritmética de la velocidad ponderada por tiempo (para gráficas). */
  get timeWeightedAvgKmh(): number {
    const totalS = (this.movingMs + this.stoppedMs) / 1000;
    return totalS > 0 ? (this.speedTimeIntegral / totalS) * MS_TO_KMH : 0;
  }

  get lastPoint(): TrackPoint | null {
    return this.last;
  }
}
