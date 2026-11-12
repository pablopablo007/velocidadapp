import { makeMutable } from 'react-native-reanimated';

/**
 * Lecturas de movimiento compartidas con el hilo de interfaz.
 *
 * Los sensores escriben aquí 60 veces por segundo y la foto del carro del
 * velocímetro las lee directamente desde el hilo de interfaz, sin pasar por
 * React. Así se mueven a los cuadros por
 * segundo de la pantalla (120 en ProMotion) y no a los 8 por segundo con los
 * que se refrescan las cifras.
 */

/** Aceleración longitudinal en g. Positiva = acelerando. */
export const liveLongG = makeMutable(0);
/** Aceleración lateral en g. Positiva = curva a la derecha. */
export const liveLatG = makeMutable(0);
