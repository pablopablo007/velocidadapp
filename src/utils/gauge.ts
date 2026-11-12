/**
 * Geometría del dial del velocímetro.
 *
 * Va aparte del componente por dos razones: es matemática pura y se puede
 * comprobar sin montar la interfaz, y porque justo aquí se coló un error de
 * 180° que dejaba la aguja apuntando arriba-derecha con el carro parado.
 *
 * Convención de SVG: la y crece hacia abajo, así que 0° apunta a la derecha,
 * 90° hacia abajo, 180° a la izquierda y 270° hacia arriba.
 */

/** Comienzo del barrido: abajo a la izquierda. */
export const GAUGE_START_DEG = 135;
/** Amplitud del barrido, en sentido horario. */
export const GAUGE_SWEEP_DEG = 270;
/**
 * Las figuras que se rotan (aguja, marcadores) se dibujan apuntando hacia
 * arriba. Rotarlas a un ángulo del dial es girarlas `destino - 270`.
 */
export const GAUGE_UP_DEG = 270;

export function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const a = polar(cx, cy, r, startDeg);
  const b = polar(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${largeArc} 1 ${b.x} ${b.y}`;
}

/**
 * Ángulo del dial que corresponde a un valor.
 *
 * Es un "worklet": la aguja la llama desde el hilo de interfaz, donde solo se
 * pueden ejecutar funciones marcadas así. Sin la marca, en el iPhone la app se
 * cierra al dibujar el tablero (en el navegador no falla, porque ahí todo corre
 * en un solo hilo).
 */
export function gaugeDegFor(value: number, max: number): number {
  'worklet';
  if (max <= 0) return GAUGE_START_DEG;
  const acotado = Math.max(0, Math.min(value, max));
  return GAUGE_START_DEG + (acotado / max) * GAUGE_SWEEP_DEG;
}

/** Grados que hay que rotar una figura dibujada apuntando hacia arriba. */
export function gaugeRotation(value: number, max: number): number {
  return gaugeDegFor(value, max) - GAUGE_UP_DEG;
}

/**
 * Vector unitario hacia el que apunta el dial para un valor dado.
 * Existe para poder comprobar la orientación sin renderizar nada.
 */
export function gaugeDirection(value: number, max: number): { x: number; y: number } {
  const rad = (gaugeDegFor(value, max) * Math.PI) / 180;
  return { x: Math.cos(rad), y: Math.sin(rad) };
}

/** Longitud del arco del barrido para un radio dado. */
export function gaugeArcLength(radius: number): number {
  return 2 * Math.PI * radius * (GAUGE_SWEEP_DEG / 360);
}
