"""Genera los íconos de la app con el diseño de tablero: grafito, banda oscura,
marcas que se encienden, arco blanco de progreso y muesca roja de límite.

    python tools/generar-iconos.py

Escribe assets/images/icon.png (iOS, sin transparencia: Apple no la admite),
adaptive-icon.png (Android, con transparencia) y splash-icon.png.
Se dibuja a 4x y se reduce, para bordes suaves.
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.join(os.path.dirname(__file__), '..', 'assets', 'images')
FUENTE = os.path.join(os.path.dirname(__file__), '..', 'node_modules', '@expo-google-fonts', 'chakra-petch',
                      '500Medium', 'ChakraPetch_500Medium.ttf')
S = 1024
K = 4  # sobremuestreo

FONDO_ARRIBA = (24, 24, 27)
FONDO_ABAJO = (10, 10, 11)
BANDA = (31, 31, 35)
APAGADO = (78, 78, 84)
BLANCO = (245, 245, 247)
ROJO = (255, 45, 70)

INICIO = 135  # grados, igual que el velocímetro
BARRIDO = 270
PROGRESO = 0.58
LIMITE = 0.66


def polar(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def arco(d, cx, cy, r_medio, ancho, desde, hasta, color):
    """PIL dibuja el grosor hacia adentro de la caja: se compensa para que el
    trazo quede centrado en r_medio."""
    r = r_medio + ancho / 2
    d.arc([cx - r, cy - r, cx + r, cy + r], desde, hasta, fill=color, width=int(ancho))


def dial(size, fondo=True):
    n = size * K
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if fondo:
        for y in range(n):
            t = y / (n - 1)
            c = tuple(round(FONDO_ARRIBA[i] + (FONDO_ABAJO[i] - FONDO_ARRIBA[i]) * t) for i in range(3))
            d.line([(0, y), (n, y)], fill=c + (255,))

    cx = cy = n / 2
    banda = n * 0.085
    r = n * 0.34  # radio medio de la banda
    arco(d, cx, cy, r, banda, INICIO, INICIO + BARRIDO, BANDA + (255,))

    # Marcas dentro de la banda.
    marcas = 28
    for i in range(marcas + 1):
        f = i / marcas
        deg = INICIO + f * BARRIDO
        mayor = i % 4 == 0
        largo = banda * (0.6 if mayor else 0.34)
        r_ext = r + banda / 2 - banda * 0.2
        a = polar(cx, cy, r_ext, deg)
        b = polar(cx, cy, r_ext - largo, deg)
        color = BLANCO if f <= PROGRESO + 1e-6 else APAGADO
        d.line([a, b], fill=color + (255,), width=int(n * (0.009 if mayor else 0.005)))

    # Arco de progreso en el borde interior.
    grosor = int(n * 0.022)
    r_in = r - banda / 2 + grosor / 2
    arco(d, cx, cy, r_in, grosor, INICIO, INICIO + PROGRESO * BARRIDO, BLANCO + (255,))
    for deg in (INICIO, INICIO + PROGRESO * BARRIDO):
        x, y = polar(cx, cy, r_in, deg)
        d.ellipse([x - grosor / 2, y - grosor / 2, x + grosor / 2, y + grosor / 2], fill=BLANCO + (255,))

    # Muesca roja del límite, cruzando la banda.
    deg = INICIO + LIMITE * BARRIDO
    a = polar(cx, cy, r + banda / 2 + n * 0.012, deg)
    b = polar(cx, cy, r - banda / 2 - n * 0.012, deg)
    d.line([a, b], fill=ROJO + (255,), width=int(n * 0.016))

    # Centro: la cifra, como en la cabina, con una raya roja debajo.
    fuente = ImageFont.truetype(FUENTE, int(n * 0.21))
    d.text((cx, cy + n * 0.005), '50', font=fuente, fill=BLANCO + (255,), anchor='mm')
    h = n * 0.018
    w = n * 0.11
    y = cy + n * 0.12
    d.rounded_rectangle([cx - w / 2, y - h / 2, cx + w / 2, y + h / 2], radius=h / 2, fill=ROJO + (255,))

    return img.resize((size, size), Image.LANCZOS)


def main():
    icon = dial(S).convert('RGB')  # iOS: sin canal alfa
    icon.save(os.path.join(RAIZ, 'icon.png'), optimize=True)
    dial(S, fondo=False).save(os.path.join(RAIZ, 'adaptive-icon.png'), optimize=True)
    dial(S, fondo=False).resize((512, 512), Image.LANCZOS).save(os.path.join(RAIZ, 'splash-icon.png'), optimize=True)
    fav = dial(48).convert('RGB')
    fav.save(os.path.join(RAIZ, 'favicon.png'), optimize=True)
    print('íconos generados en', os.path.abspath(RAIZ))


if __name__ == '__main__':
    main()
