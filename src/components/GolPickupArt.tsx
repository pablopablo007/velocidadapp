import React, { memo } from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

/** Proporción del dibujo (alto / ancho). */
export const GOL_ART_RATIO = 430 / 1000;

/**
 * Gol Pick Up de cabina simple, de perfil y mirando a la izquierda.
 *
 * Es un dibujo vectorial (no una foto): carrocería blanca con volumen,
 * parachoques negros de la G3, llantas de aleación de cinco rayos y el balde
 * de carga. Así la tarjeta se ve completa aunque no haya fotos propias, y se
 * ve nítido a cualquier tamaño.
 */
function GolPickupArtBase({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 1000 430">
      <Defs>
        <LinearGradient id="golBody" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.38" stopColor="#F1F4F8" />
          <Stop offset="0.62" stopColor="#D5DBE3" />
          <Stop offset="1" stopColor="#8C96A3" />
        </LinearGradient>
        <LinearGradient id="golGlass" x1="0" y1="0" x2="0.5" y2="1">
          <Stop offset="0" stopColor="#5C6B7A" />
          <Stop offset="0.55" stopColor="#1E252D" />
          <Stop offset="1" stopColor="#0E1216" />
        </LinearGradient>
        <LinearGradient id="golShine" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.9" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="golBumper" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#2A2D31" />
          <Stop offset="1" stopColor="#0B0C0E" />
        </LinearGradient>
        <RadialGradient id="golRim" cx="50%" cy="45%" rx="55%" ry="55%">
          <Stop offset="0" stopColor="#F4F6F8" />
          <Stop offset="0.7" stopColor="#A9B1BA" />
          <Stop offset="1" stopColor="#5D646C" />
        </RadialGradient>
        <LinearGradient id="golLamp" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#9FB4C8" />
        </LinearGradient>
      </Defs>

      {/* Sombra de contacto */}
      <Rect x="80" y="398" width="860" height="10" rx="5" fill="#000" opacity="0.55" />

      {/* Carrocería: capó, parabrisas, techo de cabina simple y balde */}
      <Path
        d="M 42 338 L 34 300 L 40 268 Q 46 250 70 246 L 318 214 Q 336 212 348 204 L 438 146
           Q 446 141 458 141 L 566 139 Q 584 139 588 156 L 594 222 L 962 220 Q 974 220 975 232
           L 978 336 Q 978 346 968 347 L 848 347 A 78 78 0 0 0 692 347 L 298 347
           A 78 78 0 0 0 142 347 L 52 347 Q 44 346 42 338 Z"
        fill="url(#golBody)"
        stroke="#7E8894"
        strokeWidth="2"
      />

      {/* Brillo del hombro */}
      <Path d="M 80 252 L 330 222 L 600 232 L 960 230" stroke="url(#golShine)" strokeWidth="5" fill="none" />

      {/* Ventana lateral y parabrisas */}
      <Path
        d="M 356 216 L 444 156 Q 450 152 458 152 L 560 151 Q 572 151 574 162 L 578 216 Z"
        fill="url(#golGlass)"
      />
      <Path d="M 470 158 L 420 214" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="10" />
      {/* Parante B */}
      <Rect x="574" y="150" width="14" height="70" fill="#15191D" />

      {/* Puerta y manija */}
      <Path d="M 342 222 L 352 340 M 588 222 L 590 340" stroke="#8E98A4" strokeWidth="2.5" fill="none" />
      <Rect x="548" y="248" width="30" height="7" rx="3.5" fill="#2A2F35" />

      {/* Espejo */}
      <Path
        d="M 362 200 L 392 196 Q 400 196 400 204 L 398 216 L 366 218 Q 358 214 362 200 Z"
        fill="#1A1E22"
      />

      {/* Moldura lateral negra */}
      <Path d="M 70 292 L 958 292" stroke="#2C3136" strokeWidth="9" strokeLinecap="round" />

      {/* Balde: borde superior y portón */}
      <Path d="M 598 222 L 962 222" stroke="#6F7985" strokeWidth="4" />
      <Path d="M 948 228 L 950 340" stroke="#8E98A4" strokeWidth="2.5" />

      {/* Parachoques G3 negros */}
      <Path d="M 34 292 L 42 340 Q 44 348 56 348 L 150 348 L 152 296 Z" fill="url(#golBumper)" />
      <Path
        d="M 952 296 L 978 296 L 978 340 Q 978 348 968 348 L 852 348 L 856 300 Z"
        fill="url(#golBumper)"
      />
      {/* Antiniebla */}
      <Circle cx="78" cy="320" r="11" fill="#3B4148" stroke="#5B636C" strokeWidth="2" />

      {/* Faro delantero y luz trasera */}
      <Path
        d="M 44 266 Q 50 252 72 250 L 150 241 L 146 270 L 52 280 Q 42 278 44 266 Z"
        fill="url(#golLamp)"
      />
      <Path d="M 60 258 L 136 250" stroke="#FFFFFF" strokeWidth="3" strokeOpacity="0.9" />
      <Rect x="958" y="234" width="16" height="50" rx="4" fill="#C8102E" />
      <Rect x="960" y="240" width="5" height="38" rx="2" fill="#FF6070" />

      {/* Ruedas */}
      <Wheel cx={220} />
      <Wheel cx={770} />
    </Svg>
  );
}

/** Neumático con llanta de aleación de cinco rayos. */
function Wheel({ cx }: { cx: number }) {
  const cy = 340;
  const spokes = [0, 72, 144, 216, 288];
  return (
    <G>
      <Circle cx={cx} cy={cy} r={64} fill="#0C0D0F" />
      <Circle cx={cx} cy={cy} r={60} fill="none" stroke="#24272B" strokeWidth="3" />
      <Circle cx={cx} cy={cy} r={42} fill="url(#golRim)" />
      {spokes.map((deg) => {
        const a = ((deg - 90) * Math.PI) / 180;
        return (
          <Line
            key={deg}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(a) * 40}
            y2={cy + Math.sin(a) * 40}
            stroke="#E8ECF0"
            strokeWidth="11"
            strokeLinecap="round"
          />
        );
      })}
      {spokes.map((deg) => {
        const a = ((deg - 54) * Math.PI) / 180;
        return (
          <Circle
            key={`h${deg}`}
            cx={cx + Math.cos(a) * 26}
            cy={cy + Math.sin(a) * 26}
            r={9}
            fill="#2B3036"
          />
        );
      })}
      <Circle cx={cx} cy={cy} r={11} fill="#3A4047" stroke="#C9D0D7" strokeWidth="2" />
    </G>
  );
}

export const GolPickupArt = memo(GolPickupArtBase);
