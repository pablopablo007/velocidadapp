import { requireOptionalNativeModule, type NativeModule } from 'expo';

/**
 * Puente con la pantalla de CarPlay (módulo nativo propio, en ./ios).
 *
 * En Expo Go no existe —no se puede añadir código nativo ahí—, así que todo es
 * opcional: las funciones no hacen nada y la app sigue igual.
 */

export type CarPlayAction = 'start' | 'pause' | 'resume' | 'stop';

export type CarPlayState = {
  limitKmh: number | null;
  unitMph: boolean;
  tripStatus: 'idle' | 'recording' | 'paused';
  distanceM: number;
  durationMs: number;
  maxKmh: number;
  powerCv: number | null;
  factoryPowerCv: number;
};

type Events = {
  onCarPlayAction: (event: { action: CarPlayAction }) => void;
  onCarPlayConnection: (event: { connected: boolean }) => void;
};

declare class CarPlayBridgeModule extends NativeModule<Events> {
  setState(state: CarPlayState): void;
  isConnected(): boolean;
}

const native = requireOptionalNativeModule<CarPlayBridgeModule>('CarPlayBridge');

/** `true` en la app instalada (build nativa); `false` en Expo Go. */
export const carPlaySupported = native != null;

export function setCarPlayState(state: CarPlayState): void {
  native?.setState(state);
}

export function isCarPlayConnected(): boolean {
  return native?.isConnected() ?? false;
}

export function addCarPlayActionListener(listener: (action: CarPlayAction) => void): () => void {
  if (!native) return () => {};
  const sub = native.addListener('onCarPlayAction', (e) => listener(e.action));
  return () => sub.remove();
}

export function addCarPlayConnectionListener(listener: (connected: boolean) => void): () => void {
  if (!native) return () => {};
  const sub = native.addListener('onCarPlayConnection', (e) => listener(e.connected));
  return () => sub.remove();
}
