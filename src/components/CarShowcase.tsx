import { LinearGradient } from 'expo-linear-gradient';
import { DeviceMotion } from 'expo-sensors';
import React, { memo, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Image, LayoutChangeEvent, PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { GOL_ART_RATIO, GolPickupArt } from '@/components/GolPickupArt';
import { colors } from '@/theme/theme';
import type { BodyType } from '@/vehicles/polo';
import { useAccent } from '@/theme/accent';

const CAR = require('../../assets/images/polo-track.png');
/** Proporción de la foto recortada (alto / ancho). */
const CAR_RATIO = 751 / 1400;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Foto del Polo con efecto 3D:
 * - perspectiva que sigue la inclinación del iPhone (giroscopio), como una
 *   ventana: al moverlo, el carro gira levemente y "tiene fondo";
 * - se puede girar arrastrando con el dedo y vuelve con un resorte;
 * - foco de luz detrás (un carro negro sobre fondo negro se perdería),
 *   reflejo en el piso y una flotación muy lenta.
 */
function CarShowcaseBase({ height = 200, bodyType = 'hatchback' }: { height?: number; bodyType?: BodyType }) {
  const accent = useAccent();
  const [width, setWidth] = useState(0);
  // Valores animados estables: useState con inicializador (no useRef().current,
  // que las reglas de React marcan por leer un ref durante el render).
  const [tiltX] = useState(() => new Animated.Value(0));
  const [tiltY] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  const [float] = useState(() => new Animated.Value(0));

  // Flotación lenta (va por el hilo nativo: no cuesta nada al JS).
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [float]);

  // Paralaje con la inclinación real del teléfono. La referencia se re-centra
  // despacio, así que la posición en la que lo sostienes cuenta como "recto".
  useEffect(() => {
    let base: { b: number; g: number } | null = null;
    let sub: { remove: () => void } | null = null;
    DeviceMotion.isAvailableAsync()
      .then((ok) => {
        if (!ok) return;
        sub = DeviceMotion.addListener((m) => {
          const r = m.rotation;
          if (!r) return;
          if (!base) base = { b: r.beta, g: r.gamma };
          base.b += (r.beta - base.b) * 0.015;
          base.g += (r.gamma - base.g) * 0.015;
          tiltX.setValue(clamp((r.gamma - base.g) / 0.35, -1, 1));
          tiltY.setValue(clamp((r.beta - base.b) / 0.35, -1, 1));
        });
      })
      .catch(() => {});
    return () => sub?.remove();
  }, [tiltX, tiltY]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => drag.setValue(clamp(g.dx / 140, -1, 1)),
        onPanResponderRelease: () =>
          Animated.spring(drag, { toValue: 0, friction: 5, tension: 60, useNativeDriver: false }).start(),
        onPanResponderTerminate: () =>
          Animated.spring(drag, { toValue: 0, friction: 5, useNativeDriver: false }).start(),
      }),
    [drag]
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // El Polo es una foto recortada; la Pick Up, un dibujo vectorial de perfil.
  const pickup = bodyType === 'pickup';
  const ratio = pickup ? GOL_ART_RATIO : CAR_RATIO;
  const carH = height * 0.74;
  const carW = Math.min(width * 0.94, carH / ratio);
  const realH = carW * ratio;
  const car = (style?: object) =>
    pickup ? (
      <View style={[{ width: carW, height: realH }, style]}>
        <GolPickupArt width={carW} height={realH} />
      </View>
    ) : (
      <Image source={CAR} style={[{ width: carW, height: realH }, style]} resizeMode="contain" />
    );
  const turn = Animated.add(tiltX, drag);

  return (
    <View style={{ height }} onLayout={onLayout} {...pan.panHandlers}>
      {/* Foco y piso */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id="spot" cx="50%" cy="46%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.05" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="floor" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={accent.accent} stopOpacity="0.22" />
            <Stop offset="1" stopColor={accent.accent} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="46%" rx="48%" ry="48%" fill="url(#spot)" />
        <Ellipse cx="50%" cy="84%" rx="38%" ry="7%" fill="url(#floor)" />
      </Svg>

      {width > 0 && (
        <Animated.View
          style={[
            styles.stage,
            { transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] },
          ]}
          pointerEvents="none"
        >
          <Animated.View
            style={{
              alignItems: 'center',
              transform: [
                { perspective: 900 },
                { rotateY: turn.interpolate({ inputRange: [-2, 2], outputRange: ['-24deg', '24deg'] }) },
                { rotateX: tiltY.interpolate({ inputRange: [-1, 1], outputRange: ['7deg', '-7deg'] }) },
                { translateX: turn.interpolate({ inputRange: [-2, 2], outputRange: [-14, 14] }) },
              ],
            }}
          >
            {car()}
            {/* Reflejo en el piso */}
            <View style={{ width: carW, height: realH * 0.32, overflow: 'hidden', marginTop: -realH * 0.06 }}>
              {/* Volteado, la parte de abajo del carro (ruedas) queda arriba de
                  la caja: el reflejo arranca justo bajo los neumáticos. */}
              {car({ opacity: 0.16, transform: [{ scaleY: -1 }] })}
              <LinearGradient
                colors={['rgba(10,10,11,0)', colors.bg]}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
});

export const CarShowcase = memo(CarShowcaseBase);
