# Velocidad

Medidor de velocidad en tiempo real con mapa, historial y cronómetro, hecho a la medida
de un **Volkswagen Polo Track 2026 1.6 MSI** y de un **iPhone 15 Pro**.

React Native + Expo SDK 58. Uso personal.

> **El SDK tiene que coincidir con el de Expo Go.** Expo Go de la App Store solo
> abre proyectos de su misma versión de SDK (hoy, la 58), y en iOS no se puede
> instalar una versión anterior. Si el iPhone dice *"Project is incompatible with
> this version of Expo Go"*, sube el proyecto al SDK que indique el mensaje:
>
> ```bash
> npx expo install expo@~<versión>.0.0
> npx expo install --fix
> ```

---

## Qué hace

**Todo lo que muestra es medido.** Sin conexión al carro (OBD-II) no se pueden leer rpm,
marcha ni consumo, así que la app no los muestra ni los inventa. Lo que se calcula (la
potencia según el aire) dice de qué medida sale.

**Cabina** — En el estilo de la cabina digital de Volkswagen: fondo negro, sin tarjetas ni
bordes, blanco para los datos, gris para las etiquetas y el color del carro (rojo el Polo,
blanco la Pick Up) solo en lo que está vivo. Velocímetro de aro fino con las cifras por fuera,
aguja corta y el tramo recorrido iluminado; en el centro, la foto trasera del carro, que se
recuesta en las curvas, cabecea y enciende las luces de freno con las fuerzas medidas. Al abrir
la app la aguja hace un barrido completo, como al dar contacto. El mapa no va en un recuadro: se
funde con el negro (arriba en vertical, a la izquierda en horizontal). Abajo: kilómetros totales
con ese carro, distancia, tiempo, media y máxima, y la señal de límite, que se toca para pasar
entre los límites de Ecuador (50, 60, 90, 100 o sin aviso). El botón «Ocultar mapa» deja solo la
velocidad: el mapa se apaga como una pantalla de tubo (se aplasta en una línea de luz, la línea se
encoge hasta un punto que destella) y el velocímetro se centra; «Mostrar mapa» lo enciende al
revés. La elección se recuerda y, oculto, el mapa se desmonta para no gastar batería. La aguja, el tramo iluminado y la foto
se mueven en el hilo de interfaz con Reanimated, a los cuadros de la pantalla (120 por segundo en
el iPhone 15 Pro).

**Sensores del iPhone 15 Pro** —
- *GPS L1 + L5*: velocidad Doppler (no restando posiciones), altitud, rumbo y traza.
- *Giroscopio y acelerómetro*: la aceleración lateral real en curva, `a = v · ω`, con el
  giro proyectado sobre la gravedad, así que da igual cómo esté puesto el teléfono.
- *Barómetro*: la presión real del aire, con la que se corrige la potencia.
- *Brújula*: el rumbo con el carro parado, cuando el GPS no puede darlo.

En Análisis hay una lista con el estado de cada sensor en vivo.

**Tu Polo en Cuenca** — El 1.6 MSI es atmosférico. En Cuenca (~2.560 m, ~741 hPa, 15 °C)
la norma **SAE J1349** le deja unos **80 CV de 110** (−27 %) y un 0-100 esperable de
**13,0 a 13,7 s**, no los 10,0 s de fábrica medidos al nivel del mar. Con el barómetro
la cuenta usa la presión de ese momento, no la de una atmósfera estándar.

**Viajes automáticos** — El viaje empieza solo al pasar de 12 km/h durante 6 s y se
guarda solo tras 10 minutos detenido (ajustable). El único control manual está en la
pestaña Velocidad; Mapa y Crono solo lo muestran.

**Límites de Ecuador** — Atajos para el aviso de velocidad: urbano 50, curva 60,
perimetral 90 y carretera 100 km/h (vehículos livianos).

**Análisis de velocidad** — Además de la media y la máxima: *máxima sostenida* (la mayor
que mantuviste 5 segundos, inmune a un pico falso del GPS), *percentil 85*, histograma y
tiempo por encima del límite.

**Altitud y descensos** — Altitud, pendiente instantánea y desnivel acumulado (D+ y D−),
con perfil de elevación en cada viaje.

**Mapa en vivo** — Recorrido coloreado por velocidad (azul despacio, blanco en ciudad,
salmón y rojo en carretera), cámara que te sigue orientada al rumbo y tres estilos.

**Crono automático** — Mide solo, sin botones: 0-60, 0-100, frenada 100-0, 201 m y 402 m
con velocidad en meta, y recuperaciones 60→100 y 80→120.

**Tu carro en 3D** — La foto del Polo Track sin fondo, con foco de luz, reflejo en el piso
y una perspectiva que sigue la inclinación del iPhone (giroscopio); también se gira con el
dedo. Si le pones tus propias fotos alrededor del carro, la tarjeta gira 360°.

**Historial y Garaje** — Kilómetros, horas, récords y desnivel; ficha técnica completa del
Polo Track 1.6 MSI, editable; temperatura del aire (el iPhone no tiene termómetro
exterior) y el resto de ajustes.

---

## Arrancar el proyecto

```bash
npm install
npx expo start
```

Escanea el QR con la cámara del iPhone. Para probar rápido basta **Expo Go**, que hay que
tener actualizado a la última versión de la App Store.

En Expo Go funciona todo menos el seguimiento en segundo plano: la grabación se detiene si
bloqueas el iPhone o cambias de app. Para el uso real en el carro conviene una **build de
desarrollo**, que sí lo permite (y requiere macOS con Xcode, o EAS Build con cuenta de
Apple Developer):

```bash
npx expo prebuild            # genera el proyecto iOS
npx expo run:ios --device    # instala en el iPhone conectado
```

Otros comandos:

```bash
npm run typecheck      # comprueba tipos
npm run test:engine    # simulación de conducción contra el motor de cálculo
python tools/recortar-foto.py foto.jpg assets/images/polo-track.png  # quita el fondo blanco a otra foto
npm run icons          # regenera los iconos de la app
```

---

## Cómo usarla en el carro

1. Pon el iPhone en el soporte y abre la app. El velocímetro funciona sin pulsar nada;
   en horizontal se ve a pantalla completa.
2. Arranca. Con los viajes automáticos el viaje empieza solo; si los desactivas en el
   Garaje, pulsa **Iniciar viaje** en Velocidad.
3. Conduce. La pantalla se queda encendida y, si te detienes más de 90 segundos, el viaje
   se pausa y se reanuda al arrancar.
4. Al llegar, el viaje se guarda solo tras 10 minutos parado, o al pulsar **Fin**.

Concede el permiso de ubicación **«Siempre»** cuando lo pida: sin él la grabación se corta
al bloquear el iPhone. Puedes cambiarlo luego en Garaje › Permisos.

---

## Tu Polo Track 2026 1.6 MSI

La ficha viene precargada y es editable desde el Garaje:

| | |
|---|---|
| Motor | EA211 1.6 MSI · 1.598 cc · 4 cil. · DOHC 16v con VVT · atmosférico |
| Diámetro × carrera | 76,5 × 86,9 mm |
| Potencia | 110 CV (108 hp) @ 5.750 rpm — **~77 CV a 2.850 m** |
| Par máximo | 155 Nm @ 3.800-4.000 rpm |
| Transmisión | Manual de 5 velocidades, tracción delantera |
| Suspensión | McPherson delante · eje de brazos longitudinales detrás |
| Frenos | Discos ventilados delante · tambor detrás |
| Seguridad | 4 airbags · ABS+EBD · ESC · ASR · HHC · ISOFIX |
| 0-100 km/h | 10,0 s de fábrica · ~10,6 s medidos por prensa · **~14 s en Quito** |
| Velocidad máxima | 187 km/h |
| Peso en orden de marcha | 1.080 kg (9,8 kg/CV) |
| Tanque | 52 L |
| Consumo mixto | 6,92 L/100 km |
| Dimensiones | 4.079 × 1.751 × 1.471 mm · ejes 2.566 mm |
| Baúl | 300 L |
| Llantas | 185/65 R15 |

Cifras de Volkswagen para Sudamérica y de pruebas de prensa independiente
([El Carro Colombiano](https://www.elcarrocolombiano.com/lanzamientos/volkswagen-polo-track-colombia-precio-y-datos-reemplazo-del-gol/),
[Autoblog Uruguay](https://www.autoblog.com.uy/2024/10/contacto-volkswagen-polo-track-16-msi.html),
[Volkswagen Ecuador](https://www.volkswagen.com.ec/es/modelos/polo-hatchback.html)).

Las **relaciones de caja son aproximadas**: Volkswagen no publica el escalonamiento del
Track, así que solo alimentan el tacómetro estimado y puedes ajustarlas en el Garaje si
quieres afinarlo.

---

## Cómo está hecho

```
app/                       rutas (expo-router)
  (tabs)/index.tsx         velocímetro
  (tabs)/map.tsx           mapa en vivo
  (tabs)/chrono.tsx        cronómetro y modo arrancada
  (tabs)/history.tsx       dashboard + historial
  (tabs)/garage.tsx        vehículo y ajustes
  trip/[id].tsx            detalle de un viaje

src/
  services/tripEngine.ts   motor de cálculo (clase pura, sin React)
  services/database.ts     persistencia en SQLite
  services/backgroundLocation.ts  seguimiento en segundo plano
  state/                   contextos de seguimiento y preferencias
  components/              velocímetro, gráficas, traza del mapa, UI
  utils/geo.ts             haversine, filtros de altitud, simplificación
  vehicles/polo.ts         ficha del vehículo y modelo de consumo
```

Decisiones que importan:

- **El GPS miente y hay que filtrarlo.** Se descartan lecturas con más de 30 m de error y
  saltos de más de 288 km/h. Con el carro parado el GPS "camina" solo, así que esa deriva
  no se suma a la distancia: sin eso, cinco minutos en un semáforo inventan varios cientos
  de metros.
- **La altitud es tres veces más ruidosa que la posición.** Pasa por un filtro exponencial
  ponderado por la precisión declarada, y el desnivel solo se acumula tras superar 2,5 m
  de histéresis. Sin eso, un carro quieto acumula cientos de metros de desnivel falso.
- **Los tiempos de aceleración se interpolan.** El GPS entrega una lectura por segundo; el
  instante exacto en que cruzas 60 o 100 km/h se calcula entre lecturas. El momento de
  salida se extrapola hacia atrás hasta v = 0 usando la aceleración medida — si no, todos
  los tiempos salen unas dos décimas cortos.
- **Animación sin Reanimated en el velocímetro.** Como el GPS va a 1 Hz, un interpolador
  propio a 60 fps que se detiene solo al llegar es más simple y más predecible que
  worklets, y la aguja no da tirones.
- **La traza se simplifica al guardar** (Ramer-Douglas-Peucker, 4 m): conserva la forma del
  recorrido con una fracción de los puntos.
- **La geometría del dial vive aparte del componente** (`src/utils/gauge.ts`) y tiene sus
  propias comprobaciones. Ahí se coló un error de 180° que dejaba la aguja apuntando
  arriba-derecha con el carro parado; ahora un test lo impide.
- **Lo que corre en el hilo de interfaz solo puede llamar a "worklets".** Los callbacks de
  `useAnimatedStyle`, `useAnimatedProps`, `useDerivedValue`, etc. corren en el hilo de interfaz;
  si llaman a una función normal, en el iPhone la app se cierra al dibujar esa pantalla (así se
  cerraba la 1.6.0 al aparecer el tablero). En el navegador no falla, por eso existe
  `npm run check:worklets`, que lo busca y corre en cada compilación.
- **Red de seguridad** (`src/components/CrashGuard.tsx`): en la versión final, un error de
  JavaScript que se escape muestra qué falló y deja reintentar, en lugar de cerrar la app.
- **Vista previa en el navegador** (`tools/preview/`). Para ver la pantalla real sin el
  teléfono, con un GPS simulado a la velocidad que se quiera:

  ```bash
  npm install --no-save react-native-web@~0.21.4
  cp tools/preview/metro.config.js metro.config.js      # temporal: no se sube
  npx expo export -p web --output-dir .preview/dist
  # vertical (área útil de un iPhone 15 Pro) y horizontal; SPEED en km/h
  DIST=$PWD/.preview/dist SPEED=44 node tools/preview/shot.js vertical.png 393 759 "/?wid=1" 4500
  DIST=$PWD/.preview/dist SPEED=44 node tools/preview/shot.js horizontal.png 766 380 "/?wid=1" 4500
  rm metro.config.js
  ```

  Necesita Playwright. El mapa y la base de datos se sustituyen por maquetas (el mapa de
  Apple y SQLite solo existen en el teléfono) y los sensores de movimiento no están, así
  que sirve para revisar el diseño, no las medidas.

### Verificación

`npm run test:engine` alimenta el motor con recorridos sintéticos de física conocida y
comprueba el resultado contra el valor teórico: crucero constante, arrancada a
aceleración fija, subida y bajada de 100 m con ruido, cinco minutos parado con deriva de
GPS, lecturas basura, frenada, corrección por altitud, máxima sostenida frente a un pico
falso, percentiles y recuperación en marcha. Las 40 comprobaciones pasan.

---

## Límites honestos

- **No hay rpm, marcha ni consumo.** Sin conexión OBD-II al carro no se pueden leer, y
  la app prefiere no mostrarlos a mostrar una estimación como si fuera un dato.
- La **corrección de potencia** usa la presión real del barómetro (o la atmósfera
  estándar si no hay lectura) y la temperatura que pongas en el Garaje (15 °C por
  defecto, la media de Cuenca): el iPhone no tiene termómetro exterior.
- La **curva en g** necesita velocidad: por debajo de ~5 km/h se muestra 0, porque ahí el
  giro del teléfono no es una curva del carro.
- La **brújula** da el rumbo hacia donde apunta el iPhone; con el carro parado sirve de
  referencia, en marcha manda el rumbo del GPS.
- Los **tiempos de aceleración** son medidos por GPS: el margen típico es de una a dos
  décimas. Valen para comparar tus propias pasadas, no como cifras de banco de pruebas.
- El **seguimiento en segundo plano** funciona mientras iOS mantenga viva la app. Si el
  sistema la cierra del todo, el viaje se corta.
- La app **no sustituye al velocímetro del carro** ni a ninguna señalización. Mira la vía.
