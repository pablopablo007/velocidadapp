"""Quita el fondo blanco de la foto del Polo y deja la sombra del piso como
sombra negra semitransparente (técnica de 'tinta': alpha = oscuridad)."""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
rgb = np.asarray(im).astype(np.float32)
lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]

# 1) Región de fondo: lo claro conectado al borde de la imagen.
# .copy(): en Pillow 12 la imagen creada desde numpy comparte un búfer de solo lectura.
claro = Image.fromarray(np.where(lum > 150, 255, 0).astype(np.uint8)).copy()
w, h = claro.size
for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
    if claro.getpixel((x, y)) == 255:
        ImageDraw.floodfill(claro, (x, y), 128)
fondo = np.asarray(claro) == 128
# El hueco claro bajo el carro (entre ruedas y paragolpes) queda encerrado por
# la sombra de contacto y el relleno no llega. Bajo el paragolpes solo hay piso,
# así que esa franja se trata como fondo directamente.
filas = np.arange(h)[:, None]
fondo |= (lum > 150) & (filas > 0.665 * h)

# 2) Banda de 2 px alrededor para limpiar el borde antialiasado.
banda = np.asarray(Image.fromarray((fondo * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0

# 3) En el fondo y la banda: color negro, alpha = cuánto oscurece al blanco.
alpha = np.full(lum.shape, 255.0)
tinta = np.clip(255.0 - lum, 0, 255)
alpha[banda] = tinta[banda]
# El fondo casi blanco se vuelve totalmente transparente (quita ruido de compresión).
alpha[(banda) & (lum > 246)] = 0

out = rgb.copy()
out[banda] = 0
# 4) Levanta un poco los negros del carro para que se lea sobre fondo oscuro.
carro = ~banda
out[carro] = 255.0 * np.power(out[carro] / 255.0, 0.82)

rgba = np.dstack([out, alpha]).clip(0, 255).astype(np.uint8)
img = Image.fromarray(rgba, 'RGBA')
bbox = Image.fromarray((alpha > 10).astype(np.uint8) * 255).getbbox()
x0, y0, x1, y1 = bbox
pad = 12
img = img.crop((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)))
img.thumbnail((1400, 1400), Image.LANCZOS)
img.save(dst, optimize=True)
print('ok', img.size)
