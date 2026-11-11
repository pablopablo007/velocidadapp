export type LatLng = { latitude: number; longitude: number };

const R_EARTH = 6371008.8; // radio medio, m
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Distancia en metros entre dos coordenadas (haversine). */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo inicial en grados (0 = norte) de a hacia b. */
export function bearing(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export function cardinal(deg: number): string {
  return CARDINALS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

/** Región que encuadra todos los puntos, con un margen proporcional. */
export function regionForPoints(points: LatLng[], padRatio = 0.35) {
  if (points.length === 0) return null;
  let minLat = points[0].latitude;
  let maxLat = points[0].latitude;
  let minLon = points[0].longitude;
  let maxLon = points[0].longitude;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude);
    maxLon = Math.max(maxLon, p.longitude);
  }
  const latDelta = Math.max((maxLat - minLat) * (1 + padRatio), 0.004);
  const lonDelta = Math.max((maxLon - minLon) * (1 + padRatio), 0.004);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  };
}

/**
 * Filtro exponencial adaptativo para la altitud del GPS.
 *
 * La altitud GPS es ~3x más ruidosa que la posición horizontal: sin filtrar,
 * un carro parado "acumula" cientos de metros de desnivel falso. Se pondera
 * cada lectura según su precisión vertical declarada.
 */
export class AltitudeFilter {
  private value: number | null = null;

  push(alt: number | null | undefined, accuracy: number | null | undefined): number | null {
    if (alt == null || !Number.isFinite(alt)) return this.value;
    const acc = accuracy != null && accuracy > 0 ? accuracy : 10;
    // Precisión buena (<5 m) → confía más en la lectura nueva.
    const alpha = Math.min(0.45, Math.max(0.06, 3 / (acc + 6)));
    this.value = this.value == null ? alt : this.value + (alt - this.value) * alpha;
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }
}

/** Altitud de una presión según la atmósfera estándar, en metros. */
function pressureAltitude(hpa: number): number {
  return 44330.77 * (1 - Math.pow(hpa / 1013.25, 0.190263));
}

/**
 * Altitud combinando GPS y barómetro.
 *
 * Cada uno falla donde el otro acierta: el GPS da la altitud absoluta pero
 * salta varios metros de una lectura a otra; el barómetro nota cambios de
 * decímetros, pero su valor absoluto depende del clima del día. Aquí el
 * barómetro pone la forma (subidas y bajadas) y el GPS lo ancla despacio a la
 * altitud real: `altitud = altitud_barométrica + corrección`, donde la
 * corrección sigue al GPS con una constante de tiempo de ~1,5 minutos.
 *
 * Sin barómetro se comporta como el filtro de altitud GPS de siempre.
 */
export class BaroAltitudeFusion {
  private gps = new AltitudeFilter();
  private offset: number | null = null;
  private samples = 0;
  private value: number | null = null;

  push(
    gpsAlt: number | null | undefined,
    gpsAccuracy: number | null | undefined,
    pressureHpa: number | null | undefined
  ): number | null {
    const filtered = this.gps.push(gpsAlt, gpsAccuracy);
    if (pressureHpa == null || !Number.isFinite(pressureHpa) || pressureHpa < 300) {
      // Sin presión: se vuelve al GPS filtrado y la corrección se recalcula
      // cuando el barómetro regrese.
      this.offset = null;
      this.samples = 0;
      this.value = filtered;
      return this.value;
    }

    const baro = pressureAltitude(pressureHpa);
    if (gpsAlt != null && Number.isFinite(gpsAlt)) {
      const target = gpsAlt - baro;
      this.samples++;
      if (this.offset == null) {
        this.offset = target;
      } else {
        const acc = gpsAccuracy != null && gpsAccuracy > 0 ? gpsAccuracy : 10;
        // Las primeras lecturas se promedian (converge rápido); después la
        // corrección se mueve muy despacio para no heredar el ruido del GPS.
        const slow = Math.min(0.02, Math.max(0.004, 0.1 / (acc + 6)));
        const alpha = Math.max(slow, 1 / this.samples);
        this.offset += (target - this.offset) * alpha;
      }
    }
    this.value = this.offset != null ? baro + this.offset : filtered;
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }
}

/**
 * Acumulador de desnivel con histéresis.
 *
 * Solo cuenta un tramo cuando la altitud filtrada se ha movido más de
 * `threshold` metros desde el último punto de referencia. Así el ruido
 * residual no se convierte en desnivel.
 */
export class ElevationAccumulator {
  gain = 0;
  loss = 0;
  maxAlt: number | null = null;
  minAlt: number | null = null;
  private reference: number | null = null;

  constructor(private threshold = 2.5) {}

  push(alt: number | null): void {
    if (alt == null) return;
    this.maxAlt = this.maxAlt == null ? alt : Math.max(this.maxAlt, alt);
    this.minAlt = this.minAlt == null ? alt : Math.min(this.minAlt, alt);
    if (this.reference == null) {
      this.reference = alt;
      return;
    }
    const delta = alt - this.reference;
    if (delta > this.threshold) {
      this.gain += delta;
      this.reference = alt;
    } else if (delta < -this.threshold) {
      this.loss += -delta;
      this.reference = alt;
    }
  }
}

/**
 * Pendiente instantánea en % sobre una ventana móvil de distancia.
 * Necesita varios cientos de metros para dar un número estable.
 */
export class GradeTracker {
  private buf: { dist: number; alt: number }[] = [];
  private cumulative = 0;

  constructor(private windowM = 120) {}

  push(deltaDistM: number, alt: number | null): number {
    if (alt == null) return this.value;
    this.cumulative += deltaDistM;
    this.buf.push({ dist: this.cumulative, alt });
    while (this.buf.length > 2 && this.cumulative - this.buf[0].dist > this.windowM) {
      this.buf.shift();
    }
    return this.value;
  }

  get value(): number {
    if (this.buf.length < 2) return 0;
    const first = this.buf[0];
    const last = this.buf[this.buf.length - 1];
    const run = last.dist - first.dist;
    if (run < 25) return 0;
    return ((last.alt - first.alt) / run) * 100;
  }
}

/**
 * Reduce una polilínea conservando su forma (Ramer-Douglas-Peucker).
 * Se usa para guardar viajes largos sin llenar la base de datos de puntos
 * redundantes en tramos rectos.
 */
export function simplify<T extends LatLng>(points: T[], toleranceM = 4): T[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > toleranceM) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

function perpendicularDistance(p: LatLng, a: LatLng, b: LatLng): number {
  // Proyección local plana: exacta de sobra a escala de decenas de metros.
  const mPerDegLat = 111132;
  const mPerDegLon = 111320 * Math.cos(toRad(a.latitude));
  const px = (p.longitude - a.longitude) * mPerDegLon;
  const py = (p.latitude - a.latitude) * mPerDegLat;
  const bx = (b.longitude - a.longitude) * mPerDegLon;
  const by = (b.latitude - a.latitude) * mPerDegLat;
  const lenSq = bx * bx + by * by;
  if (lenSq === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  return Math.hypot(px - bx * t, py - by * t);
}
