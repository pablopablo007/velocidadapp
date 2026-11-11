/**
 * Aceleración longitudinal (acelerar / frenar) en tiempo real, combinando el
 * acelerómetro del iPhone con el GPS.
 *
 * El GPS da la aceleración verdadera pero solo una vez por segundo y con
 * retraso; el acelerómetro la da 60 veces por segundo, pero no sabe hacia
 * dónde apunta el carro porque el teléfono puede ir en cualquier posición del
 * soporte. Aquí se resuelven las dos cosas:
 *
 * 1. DIRECCIÓN DE AVANCE (autocalibración). Se quita la gravedad y se proyecta
 *    la aceleración sobre el plano horizontal. Cada segundo se compara el
 *    promedio de ese vector con lo que aceleró el carro según el GPS: la
 *    dirección que mejor coincide es "adelante". Con unas pocas aceleradas y
 *    frenadas normales queda calibrado, sin que el conductor haga nada.
 * 2. FUSIÓN. Una vez calibrado, la lectura rápida es la del acelerómetro
 *    proyectada sobre "adelante", y el GPS corrige despacio su desvío
 *    (pendientes, inclinación del soporte). Antes de calibrar se usa solo el GPS.
 *
 * Clase pura, sin React ni sensores: se prueba con recorridos sintéticos.
 */

type Vec3 = { x: number; y: number; z: number };

const G = 9.80665;
/** Aceleración mínima del GPS (m/s²) para que un segundo sirva de referencia. */
const LEARN_MIN_ACCEL = 0.4;
/** Girando más rápido que esto (°/s) no se aprende: manda la fuerza de la curva. */
const LEARN_MAX_YAW_DPS = 6;
/** Evidencia acumulada (Σ a², en m²/s⁴) para dar la dirección por buena. */
const CALIBRATED_WEIGHT = 5;
/** Si la gravedad se mueve más que esto respecto a la calibración, el teléfono cambió de posición. */
const REMOUNT_COS = Math.cos((25 * Math.PI) / 180);

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });

export class LongitudinalEstimator {
  // Base horizontal fija al teléfono (se elige al calibrar).
  private e1: Vec3 | null = null;
  private e2: Vec3 | null = null;
  private gravityRef: Vec3 | null = null;

  // Evidencia de la dirección de avance en esa base.
  private sx = 0;
  private sy = 0;
  private weight = 0;

  // Acumulado del acelerómetro entre dos lecturas del GPS.
  private sumX = 0;
  private sumY = 0;
  private count = 0;
  private turning = false;

  // Aceleración horizontal suavizada (quita la vibración del motor).
  private hx = 0;
  private hy = 0;

  private prevGps: { t: number; v: number } | null = null;
  private gpsAccel = 0;
  private bias = 0;

  /**
   * @param accel aceleración del teléfono SIN gravedad, en m/s² (ejes del teléfono)
   * @param gravity vector de gravedad en los mismos ejes (cualquier escala)
   * @param yawRateDps giro alrededor de la vertical, en °/s
   */
  pushMotion(accel: Vec3, gravity: Vec3, yawRateDps: number): void {
    const gn = norm(gravity);
    if (gn < 1e-6) return;
    const g = scale(gravity, 1 / gn);

    if (!this.gravityRef || dot(g, this.gravityRef) < REMOUNT_COS) this.rebase(g);

    // Componente horizontal: se quita lo que quede en la dirección de la gravedad.
    const x = dot(accel, this.e1!);
    const y = dot(accel, this.e2!);
    this.hx += (x - this.hx) * 0.18;
    this.hy += (y - this.hy) * 0.18;

    this.sumX += x;
    this.sumY += y;
    this.count++;
    if (Math.abs(yawRateDps) > LEARN_MAX_YAW_DPS) this.turning = true;
  }

  /** Lectura del GPS: instante en ms y velocidad en m/s. */
  pushGps(tMs: number, speedMs: number): void {
    const prev = this.prevGps;
    this.prevGps = { t: tMs, v: speedMs };
    const meanX = this.count ? this.sumX / this.count : 0;
    const meanY = this.count ? this.sumY / this.count : 0;
    const samples = this.count;
    const turned = this.turning;
    this.sumX = this.sumY = 0;
    this.count = 0;
    this.turning = false;

    if (!prev) return;
    const dt = (tMs - prev.t) / 1000;
    if (dt < 0.3 || dt > 2.5) {
      this.gpsAccel = 0;
      return;
    }
    const a = (speedMs - prev.v) / dt;
    // Media con la anterior: la derivada de 1 Hz es ruidosa.
    this.gpsAccel = (this.gpsAccel + a) / 2;

    if (samples < 8) return;

    if (this.calibrated) {
      // El GPS corrige despacio el desvío del acelerómetro (pendiente, soporte).
      const f = this.forward()!;
      const accelMean = meanX * f.x + meanY * f.y;
      this.bias += (a - accelMean - this.bias) * 0.2;
      this.bias = Math.max(-1.5, Math.min(1.5, this.bias));
    }

    if (!turned && Math.abs(a) >= LEARN_MIN_ACCEL) {
      // Olvido lento: si el teléfono se reacomoda un poco, la dirección se adapta.
      this.sx = this.sx * 0.995 + meanX * a;
      this.sy = this.sy * 0.995 + meanY * a;
      this.weight = this.weight * 0.995 + a * a;
    }
  }

  /** Aceleración longitudinal en g. Positiva = acelerando, negativa = frenando. */
  get valueG(): number {
    const f = this.forward();
    const a = f ? this.hx * f.x + this.hy * f.y + this.bias : this.gpsAccel;
    return Math.max(-1.3, Math.min(1.3, a / G));
  }

  /** `true` cuando ya se sabe hacia dónde es "adelante" y manda el acelerómetro. */
  get calibrated(): boolean {
    if (this.weight < CALIBRATED_WEIGHT) return false;
    // Coherencia: lo que mide el acelerómetro hacia adelante debe parecerse en
    // tamaño a lo que dice el GPS. Si no, la evidencia es ruido.
    const gain = Math.hypot(this.sx, this.sy) / this.weight;
    return gain > 0.5 && gain < 1.6;
  }

  /** De 0 a 1: cuánto falta para calibrar (para mostrarlo en pantalla). */
  get progress(): number {
    return Math.max(0, Math.min(1, this.weight / CALIBRATED_WEIGHT));
  }

  reset(): void {
    this.gravityRef = null;
    this.e1 = this.e2 = null;
    this.clearEvidence();
    this.prevGps = null;
    this.gpsAccel = 0;
  }

  private forward(): { x: number; y: number } | null {
    if (!this.calibrated) return null;
    const n = Math.hypot(this.sx, this.sy);
    return { x: this.sx / n, y: this.sy / n };
  }

  /** Fija una base horizontal nueva (primera lectura o teléfono recolocado). */
  private rebase(g: Vec3): void {
    this.gravityRef = g;
    // Eje de referencia: el del teléfono menos alineado con la gravedad.
    const ref: Vec3 = Math.abs(g.z) < 0.8 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    const proj = { x: ref.x - g.x * dot(ref, g), y: ref.y - g.y * dot(ref, g), z: ref.z - g.z * dot(ref, g) };
    this.e1 = scale(proj, 1 / norm(proj));
    this.e2 = cross(g, this.e1);
    this.clearEvidence();
  }

  private clearEvidence(): void {
    this.sx = this.sy = this.weight = 0;
    this.sumX = this.sumY = 0;
    this.count = 0;
    this.turning = false;
    this.hx = this.hy = 0;
    this.bias = 0;
  }
}
