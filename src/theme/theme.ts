/**
 * Paleta y tokens de diseño.
 *
 * Look de tablero digital: grafito casi negro, paneles opacos con filos finos,
 * blanco para lo que importa y un rojo de acento para el límite, la grabación y
 * las marcas. Los tonos pastel (azul, verde, salmón) se reservan para datos
 * secundarios, como en los tableros de referencia.
 */

export const colors = {
  bg: '#0A0A0B',
  bgElevated: '#111113',
  surface: '#141416',
  surfaceStrong: '#1C1C1F',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.16)',

  text: '#F5F5F7',
  textMuted: '#8E8E93',
  textFaint: '#4A4A50',

  // El color de acento depende del vehículo: se lee con useAccent() (theme/accent.tsx).
  blue: '#8AB4F8',
  // Azul eléctrico: el mapa, la ruta y el tablero en horizontal.
  electric: '#3D8BFF',
  electricSoft: '#7FB2FF',
  electricDim: 'rgba(61,139,255,0.14)',
  electricGlow: 'rgba(61,139,255,0.55)',
  lime: '#8BE3A0', // "bien": marcas logradas, GPS preciso, sensor activo
  amber: '#FFD27F',
  salmon: '#FFA49A',
  danger: '#FF2D46',
  dangerDim: 'rgba(255,45,70,0.16)',

  ascent: '#FFA49A', // subida
  descent: '#8AB4F8', // bajada

  track: 'rgba(255,255,255,0.07)',
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

/**
 * Tipografía técnica para las cifras (Chakra Petch, cargada en app/_layout).
 * Con una familia propia no se combina `fontWeight`: en iOS cada peso es una
 * familia distinta y mezclarlos hace que caiga a la fuente del sistema.
 */
export const fonts = {
  light: 'ChakraPetch_300Light',
  regular: 'ChakraPetch_400Regular',
  medium: 'ChakraPetch_500Medium',
  semibold: 'ChakraPetch_600SemiBold',
  bold: 'ChakraPetch_700Bold',
  // Cursivas: el nombre del carro y la cifra grande del velocímetro.
  semiboldItalic: 'ChakraPetch_600SemiBold_Italic',
  boldItalic: 'ChakraPetch_700Bold_Italic',
} as const;

/** Cifras pequeñas (precisión, presión, coordenadas). */
export const mono = fonts.medium;

export const font = {
  huge: { fontSize: 88, fontFamily: fonts.medium, letterSpacing: -2 },
  display: { fontSize: 40, fontFamily: fonts.medium, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  section: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.4 },
  body: { fontSize: 15, fontWeight: '500' as const },
  small: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.4 },
} as const;

/**
 * Escala de color por velocidad (km/h). Se usa en el velocímetro y en la
 * polilínea del mapa para leer "de un vistazo" dónde ibas rápido:
 * azul suave al rodar despacio, blanco a velocidad de ciudad, salmón y rojo
 * en carretera.
 */
const SPEED_STOPS: [number, string][] = [
  [0, '#8AB4F8'],
  [45, '#F5F5F7'],
  [85, '#FFD27F'],
  [115, '#FFA49A'],
  [150, '#FF2D46'],
];

/** Mismo degradado, listo para un <LinearGradient> de SVG. */
export const SPEED_GRADIENT: [number, string][] = [
  [0, '#8AB4F8'],
  [0.3, '#F5F5F7'],
  [0.55, '#FFD27F'],
  [0.75, '#FFA49A'],
  [1, '#FF2D46'],
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
