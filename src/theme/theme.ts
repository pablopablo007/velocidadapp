/**
 * Paleta y tokens de diseño.
 * Look "racing": negro profundo, blanco puro y rojo de competición, como un
 * tablero deportivo. El rojo es la marca; el exceso de velocidad se distingue
 * porque tiñe toda la pantalla y enciende el marco, no solo un detalle.
 */

export const colors = {
  bg: '#070708',
  bgElevated: '#0E0E10',
  surface: 'rgba(255,255,255,0.05)',
  surfaceStrong: 'rgba(255,255,255,0.09)',
  border: 'rgba(255,255,255,0.09)',
  borderStrong: 'rgba(255,255,255,0.20)',

  text: '#FFFFFF',
  textMuted: '#A1A1AA',
  textFaint: '#5C5C66',

  accent: '#FF1E2D', // rojo de competición
  accentDim: 'rgba(255,30,45,0.16)',
  lime: '#32D74B', // "bien": marcas logradas, GPS preciso
  amber: '#FFC21A',
  danger: '#FF2D3A',
  dangerDim: 'rgba(255,45,58,0.18)',

  ascent: '#FF8A1F', // subida
  descent: '#5AC8FA', // bajada

  track: 'rgba(255,255,255,0.08)',
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Fuente monoespaciada para números: evita que el ancho "baile" al cambiar de dígito. */
export const mono = 'Menlo';

export const font = {
  huge: { fontSize: 88, fontWeight: '800' as const, fontStyle: 'italic' as const, letterSpacing: -3 },
  display: { fontSize: 40, fontWeight: '700' as const, fontStyle: 'italic' as const, letterSpacing: -1 },
  title: { fontSize: 22, fontWeight: '800' as const, fontStyle: 'italic' as const, letterSpacing: -0.4 },
  section: { fontSize: 13, fontWeight: '700' as const, letterSpacing: 1.2 },
  body: { fontSize: 15, fontWeight: '500' as const },
  small: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.4 },
} as const;

/**
 * Escala de color por velocidad (km/h). Se usa en el velocímetro y en la
 * polilínea del mapa para leer "de un vistazo" dónde ibas rápido.
 */
const SPEED_STOPS: [number, string][] = [
  [0, '#F4F4F5'],
  [50, '#FFE14D'],
  [90, '#FFA51F'],
  [130, '#FF5A2A'],
  [170, '#FF1E2D'],
];

/** Mismo degradado, listo para un <LinearGradient> de SVG (blanco → amarillo → rojo). */
export const SPEED_GRADIENT: [number, string][] = [
  [0, '#F4F4F5'],
  [0.35, '#FFE14D'],
  [0.6, '#FFA51F'],
  [0.8, '#FF5A2A'],
  [1, '#FF1E2D'],
];

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function speedColor(kmh: number): string {
  const v = Math.max(0, kmh);
  if (v <= SPEED_STOPS[0][0]) return SPEED_STOPS[0][1];
  for (let i = 0; i < SPEED_STOPS.length - 1; i++) {
    const [v0, c0] = SPEED_STOPS[i];
    const [v1, c1] = SPEED_STOPS[i + 1];
    if (v <= v1) {
      const t = (v - v0) / (v1 - v0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      const mix = a.map((x, k) => Math.round(x + (b[k] - x) * t));
      // En hex, no rgb(): varias pantallas le pegan opacidad al final (`${c}22`).
      return `#${mix.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    }
  }
  return SPEED_STOPS[SPEED_STOPS.length - 1][1];
}

/** Color según la pendiente en % (negativo = descenso). */
export function gradeColor(grade: number): string {
  if (grade > 1.5) return colors.ascent;
  if (grade < -1.5) return colors.descent;
  return colors.textMuted;
}
