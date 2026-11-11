import * as SQLite from 'expo-sqlite';
import { SpeedAnalysis } from './speedStats';
import { PerfResults, TrackPoint } from './tripEngine';

/** Versión del esquema. Al subirla hay que añadir su bloque en `migrate`. */
const SCHEMA_VERSION = 3;

export type TripSummary = {
  id: string;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  durationMs: number;
  movingMs: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  avgMovingKmh: number;
  elevGain: number;
  elevLoss: number;
  maxAlt: number | null;
  minAlt: number | null;
  startLabel: string | null;
  endLabel: string | null;
  fuelL: number;
  cost: number;
  perf: PerfResults;
  note: string | null;
  /** Análisis de velocidad; `null` en viajes grabados antes de que existiera. */
  analysis: SpeedAnalysis | null;
  /** Con qué vehículo se hizo; `null` en viajes de antes de haber varios (todos del Polo). */
  vehicleId: string | null;
};

export type Trip = TripSummary & { points: TrackPoint[] };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('velocidad.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS trips (
          id TEXT PRIMARY KEY NOT NULL,
          started_at INTEGER NOT NULL,
          ended_at INTEGER NOT NULL,
          distance_m REAL NOT NULL,
          duration_ms INTEGER NOT NULL,
          moving_ms INTEGER NOT NULL,
          max_speed REAL NOT NULL,
          avg_speed REAL NOT NULL,
          avg_moving REAL NOT NULL,
          elev_gain REAL NOT NULL,
          elev_loss REAL NOT NULL,
          max_alt REAL,
          min_alt REAL,
          start_label TEXT,
          end_label TEXT,
          fuel_l REAL NOT NULL DEFAULT 0,
          cost REAL NOT NULL DEFAULT 0,
          perf TEXT,
          note TEXT,
          points TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_trips_started ON trips (started_at DESC);
      `);
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

/**
 * Migraciones incrementales.
 *
 * `user_version` es un entero que SQLite guarda dentro del propio archivo, así
 * que sobrevive a las actualizaciones de la app y sirve para saber qué cambios
 * ya se aplicaron. Los viajes viejos se conservan: las columnas nuevas quedan
 * en NULL y la interfaz los reconstruye a partir de la traza.
 */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current >= SCHEMA_VERSION) return;

  if (current < 2) {
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(trips)');
    if (!columns.some((c) => c.name === 'analysis')) {
      await db.execAsync('ALTER TABLE trips ADD COLUMN analysis TEXT');
    }
  }

  if (current < 3) {
    const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(trips)');
    if (!columns.some((c) => c.name === 'vehicle_id')) {
      await db.execAsync('ALTER TABLE trips ADD COLUMN vehicle_id TEXT');
    }
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

type Row = {
  id: string;
  started_at: number;
  ended_at: number;
  distance_m: number;
  duration_ms: number;
  moving_ms: number;
  max_speed: number;
  avg_speed: number;
  avg_moving: number;
  elev_gain: number;
  elev_loss: number;
  max_alt: number | null;
  min_alt: number | null;
  start_label: string | null;
  end_label: string | null;
  fuel_l: number;
  cost: number;
  perf: string | null;
  note: string | null;
  analysis?: string | null;
  vehicle_id?: string | null;
  points?: string;
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

function rowToSummary(r: Row): TripSummary {
  let perf: PerfResults = { ...EMPTY_PERF };
  if (r.perf) {
    try {
      perf = { ...EMPTY_PERF, ...JSON.parse(r.perf) };
    } catch {
      // Fila corrupta: seguimos con los valores vacíos en lugar de romper la lista.
    }
  }
  let analysis: SpeedAnalysis | null = null;
  if (r.analysis) {
    try {
      analysis = JSON.parse(r.analysis) as SpeedAnalysis;
    } catch {
      analysis = null;
    }
  }
  return {
    id: r.id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    distanceM: r.distance_m,
    durationMs: r.duration_ms,
    movingMs: r.moving_ms,
    maxSpeedKmh: r.max_speed,
    avgSpeedKmh: r.avg_speed,
    avgMovingKmh: r.avg_moving,
    elevGain: r.elev_gain,
    elevLoss: r.elev_loss,
    maxAlt: r.max_alt,
    minAlt: r.min_alt,
    startLabel: r.start_label,
    endLabel: r.end_label,
    fuelL: r.fuel_l,
    cost: r.cost,
    perf,
    note: r.note,
    analysis,
    vehicleId: r.vehicle_id ?? null,
  };
}

export async function saveTrip(trip: Trip): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO trips (
       id, started_at, ended_at, distance_m, duration_ms, moving_ms,
       max_speed, avg_speed, avg_moving, elev_gain, elev_loss, max_alt, min_alt,
       start_label, end_label, fuel_l, cost, perf, note, analysis, vehicle_id, points
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      trip.id,
      trip.startedAt,
      trip.endedAt,
      trip.distanceM,
      trip.durationMs,
      trip.movingMs,
      trip.maxSpeedKmh,
      trip.avgSpeedKmh,
      trip.avgMovingKmh,
      trip.elevGain,
      trip.elevLoss,
      trip.maxAlt,
      trip.minAlt,
      trip.startLabel,
      trip.endLabel,
      trip.fuelL,
      trip.cost,
      JSON.stringify(trip.perf),
      trip.note,
      trip.analysis ? JSON.stringify(trip.analysis) : null,
      trip.vehicleId ?? null,
      JSON.stringify(trip.points),
    ]
  );
}

/** Lista de viajes sin la traza: la columna `points` pesa demasiado para una lista. */
export async function listTrips(limit = 200): Promise<TripSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<Row>(
    `SELECT id, started_at, ended_at, distance_m, duration_ms, moving_ms,
            max_speed, avg_speed, avg_moving, elev_gain, elev_loss, max_alt, min_alt,
            start_label, end_label, fuel_l, cost, perf, note, analysis, vehicle_id
     FROM trips ORDER BY started_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map(rowToSummary);
}

export async function getTrip(id: string): Promise<Trip | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>('SELECT * FROM trips WHERE id = ?', [id]);
  if (!row) return null;
  let points: TrackPoint[] = [];
  try {
    points = JSON.parse(row.points ?? '[]');
  } catch {
    points = [];
  }
  return { ...rowToSummary(row), points };
}

export async function deleteTrip(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM trips WHERE id = ?', [id]);
}

export async function deleteAllTrips(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM trips');
}

export async function updateTripNote(id: string, note: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE trips SET note = ? WHERE id = ?', [note, id]);
}

export type Totals = {
  trips: number;
  distanceM: number;
  durationMs: number;
  movingMs: number;
  maxSpeedKmh: number;
  elevGain: number;
  elevLoss: number;
  fuelL: number;
  cost: number;
  best0_60: number | null;
  best0_100: number | null;
  best100_0: number | null;
  best402m: number | null;
  bestRoll60_100: number | null;
  bestRoll80_120: number | null;
  /** Máxima sostenida más alta del historial: el récord honesto. */
  bestSustainedKmh: number;
  overLimitMs: number;
};

/** Agregados de todo el historial, calculados en SQL para no cargar los viajes. */
export async function getTotals(): Promise<Totals> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    trips: number;
    distance_m: number | null;
    duration_ms: number | null;
    moving_ms: number | null;
    max_speed: number | null;
    elev_gain: number | null;
    elev_loss: number | null;
    fuel_l: number | null;
    cost: number | null;
  }>(
    `SELECT COUNT(*) AS trips, SUM(distance_m) AS distance_m, SUM(duration_ms) AS duration_ms,
            SUM(moving_ms) AS moving_ms, MAX(max_speed) AS max_speed,
            SUM(elev_gain) AS elev_gain, SUM(elev_loss) AS elev_loss,
            SUM(fuel_l) AS fuel_l, SUM(cost) AS cost
     FROM trips`
  );

  // Los récords viven dentro de los JSON de `perf` y `analysis`; se resuelven en JS.
  const detailRows = await db.getAllAsync<{ perf: string | null; analysis: string | null }>(
    'SELECT perf, analysis FROM trips'
  );
  let best0_60: number | null = null;
  let best0_100: number | null = null;
  let best100_0: number | null = null;
  let best402m: number | null = null;
  let bestRoll60_100: number | null = null;
  let bestRoll80_120: number | null = null;
  let bestSustainedKmh = 0;
  let overLimitMs = 0;

  const min = (a: number | null, b: number | null | undefined) =>
    b == null ? a : a == null ? b : Math.min(a, b);

  for (const rowDetail of detailRows) {
    if (rowDetail.perf) {
      try {
        const perf = JSON.parse(rowDetail.perf) as PerfResults;
        best0_60 = min(best0_60, perf.t0_60);
        best0_100 = min(best0_100, perf.t0_100);
        best100_0 = min(best100_0, perf.t100_0);
        best402m = min(best402m, perf.t402m);
        bestRoll60_100 = min(bestRoll60_100, perf.roll60_100);
        bestRoll80_120 = min(bestRoll80_120, perf.roll80_120);
      } catch {
        // Ignora filas ilegibles.
      }
    }
    if (rowDetail.analysis) {
      try {
        const analysis = JSON.parse(rowDetail.analysis) as SpeedAnalysis;
        bestSustainedKmh = Math.max(bestSustainedKmh, analysis.sustainedMaxKmh ?? 0);
        overLimitMs += analysis.overLimitMs ?? 0;
      } catch {
        // Ignora filas ilegibles.
      }
    }
  }

  return {
    trips: row?.trips ?? 0,
    distanceM: row?.distance_m ?? 0,
    durationMs: row?.duration_ms ?? 0,
    movingMs: row?.moving_ms ?? 0,
    maxSpeedKmh: row?.max_speed ?? 0,
    elevGain: row?.elev_gain ?? 0,
    elevLoss: row?.elev_loss ?? 0,
    fuelL: row?.fuel_l ?? 0,
    cost: row?.cost ?? 0,
    best0_60,
    best0_100,
    best100_0,
    best402m,
    bestRoll60_100,
    bestRoll80_120,
    bestSustainedKmh,
    overLimitMs,
  };
}

/** Distancia por día de los últimos `days` días, para el gráfico de barras. */
export async function getDailyDistance(days = 14): Promise<{ day: string; km: number }[]> {
  const db = await getDb();
  const since = Date.now() - days * 86400000;
  const rows = await db.getAllAsync<{ started_at: number; distance_m: number }>(
    'SELECT started_at, distance_m FROM trips WHERE started_at >= ?',
    [since]
  );
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    buckets.set(dayKey(d), 0);
  }
  for (const r of rows) {
    const key = dayKey(new Date(r.started_at));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + r.distance_m / 1000);
  }
  return Array.from(buckets, ([day, km]) => ({ day, km }));
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}
