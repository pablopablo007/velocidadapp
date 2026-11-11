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

**Velocímetro** — Dial analógico dibujado en SVG con aguja, arco de color según la
velocidad, zona roja a partir de la velocidad máxima del carro, marca de la velocidad
punta de la sesión y marca del límite que configures. La lectura viene de la velocidad
Doppler del receptor GPS, no de derivar posiciones, así que responde de inmediato.
Encima, una tira de cambio de marcha que pasa de verde a rojo al acercarse al corte;
debajo, el carro corriendo con las ruedas girando a las vueltas que de verdad daría la
rueda a esa velocidad y el morro cabeceando al frenar y acelerar. Y una cinta con la
velocidad del último minuto.

**Potencia real según la altitud** — El 1.6 MSI es atmosférico: respira el aire que haya.
La app aplica el factor de corrección **SAE J1349** a la altitud a la que estás y te dice
cuántos CV tienes de verdad — en Quito son unos 77 de los 110, un 30 % menos. Con eso
calcula el 0-100 que cabe esperar ahí (~14 s, no los 10,0 s de fábrica, medidos al nivel
del mar) y compara tus marcas contra ese objetivo en vez de contra un número imposible.

**Análisis de velocidad** — Además de la media y la máxima:
*máxima sostenida* (la mayor que mantuviste 5 segundos, inmune a un pico falso del GPS),
*percentil 85* (el criterio con el que los ingenieros de tránsito fijan límites: la
velocidad por debajo de la cual circulaste el 85 % del tiempo), *histograma* del reparto
del tiempo por rango de velocidad, y *tiempo por encima del límite*.

**Altitud y descensos** — Altitud sobre el nivel del mar, pendiente instantánea en % con
indicador de subida/bajada, y desnivel acumulado separado en ascenso (D+) y descenso (D−).
En el detalle de cada viaje hay un perfil de elevación completo.

**Mapa en vivo** — El recorrido se traza coloreado por velocidad: de un vistazo ves dónde
ibas rápido y dónde te frenaste. Cámara que te sigue con el mapa orientado al rumbo e
inclinado, tres estilos de mapa y HUD flotante con velocidad y altitud.

**Cronómetro** — Cronómetro manual con vueltas, y un modo arrancada que mide solo, sin
tocar nada: 0-60, 0-100, frenada 100-0, 201 m y 402 m con velocidad en meta. Y
**recuperaciones en marcha** (60→100 y 80→120 sin detenerte), que es lo que de verdad
usas para adelantar y lo que mejor describe al carro en altura.

**Historial y dashboard** — Resumen de todo: kilómetros, horas al volante, récord de
velocidad, desnivel total, combustible y gasto estimado, barras de distancia de los
últimos 14 días y tus mejores marcas. Cada viaje guarda de dónde a dónde fuiste (con
nombre del lugar), tiempo total, tiempo en marcha y detenido, medias, gráfica de
velocidad, perfil de elevación y consumo estimado.

**Tarjeta del carro** — Saludo, nombre y versión sobre una foto de tu carro flotando en un
resplandor. Si le pones varias fotos tomadas caminando alrededor, la tarjeta **gira 360°**
al arrastrarla: es el mismo truco de los visores de las marcas, una secuencia de fotos, no
un modelo 3D. Sin fotos muestra una ilustración. Las imágenes se reescalan y **se quedan en
el teléfono**.

**Garaje** — Ficha técnica completa del Polo Track 1.6 MSI agrupada por motor, transmisión,
chasis y frenos, seguridad y carrocería; toda editable. Incluye la potencia disponible aquí
y ahora, y una tabla de cuánto entregaría el motor desde Guayaquil hasta Papallacta. Más
los ajustes de la app: unidades, límite de velocidad, vibración, pausa automática, precio
del combustible.

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
npm run preview:gauge  # dibuja el velocímetro en un HTML, para verlo sin el teléfono
npm run icons          # regenera los iconos de la app
```

---

## Cómo usarla en el carro

1. Pon el iPhone en el soporte y abre la app. El velocímetro funciona sin pulsar nada.
2. Cuando arranques el viaje, pulsa **Iniciar viaje** (en Velocidad o en Mapa).
3. Conduce. La pantalla se queda encendida sola y, si te detienes más de 90 segundos, el
   viaje se pausa y se reanuda al arrancar de nuevo.
4. Al llegar, **Finalizar** → el viaje queda en el Historial con su mapa y sus gráficas.

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
  arriba-derecha con el carro parado; ahora un test lo impide. `npm run preview:gauge`
  dibuja el dial a varias velocidades en un HTML para revisarlo sin el teléfono.

### Verificación

`npm run test:engine` alimenta el motor con recorridos sintéticos de física conocida y
comprueba el resultado contra el valor teórico: crucero constante, arrancada a
aceleración fija, subida y bajada de 100 m con ruido, cinco minutos parado con deriva de
GPS, lecturas basura, frenada, corrección por altitud, máxima sostenida frente a un pico
falso, percentiles y recuperación en marcha. Las 40 comprobaciones pasan.

---

## Límites honestos

- El **consumo y el gasto son estimados**, no leídos del carro. Salen de un modelo basado
  en el consumo declarado, la velocidad media y las aceleraciones registradas. Sirven para
  comparar viajes entre sí; el computador de a bordo manda.
- Las **rpm y la marcha son estimadas** a partir de la medida de la llanta y unas
  relaciones de caja aproximadas. No hay conexión OBD-II, así que la tira de cambio es una
  guía, no un tacómetro.
- La **corrección por altitud** usa la atmósfera estándar y una temperatura fija de 20 °C.
  Un día muy caluroso resta algo más de potencia; un día frío, algo menos. El orden de
  magnitud sí es correcto y coincide con la regla práctica de 3 % por cada 1.000 pies.
- Los **tiempos de aceleración** son medidos por GPS: el margen típico es de una a dos
  décimas. Valen para comparar tus propias pasadas, no como cifras de banco de pruebas.
- El **seguimiento en segundo plano** funciona mientras iOS mantenga viva la app. Si el
  sistema la cierra del todo, el viaje se corta.
- La app **no sustituye al velocímetro del carro** ni a ninguna señalización. Mira la vía.
