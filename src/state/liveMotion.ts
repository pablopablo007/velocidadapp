import { makeMutable } from 'react-native-reanimated';

/**
 * Lecturas de movimiento compartidas con el hilo de interfaz.
 *
 * Los sensores escriben aquí 60 veces por segundo y los relojes animados
 * (el mini carro y el anillo de aceleración) las leen directamente desde el
 * hilo de interfaz, sin pasar por React. Así se mueven a los cuadros por
 * segundo de la pantalla (120 en ProMotion) y no a los 8 por segundo con los
 * que se refrescan las cifras.
 */

/** Aceleración longitudinal en g. Positiva = acelerando. */
export const liveLongG = makeMutable(0);
/** Aceleración lateral en g. Positiva = curva a la derecha. */
export const liveLatG = makeMutable(0);
/** Velocidad en m/s (del GPS). */
export const liveSpeedMs = makeMutable(0);
