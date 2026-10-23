"""Genera iconos para Lozkho Stereo:
   - icon-192.png  (PWA Android/Chrome)
   - icon-512.png  (PWA alta resolución)
   - icon-512.ico   (Windows — multi-resolución 16/32/48/64/128/256)

Requisitos: Pillow (pip install pillow).
Uso: python3 scripts/make_icons.py
"""
from PIL import Image, ImageDraw

def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    draw = ImageDraw.Draw(img)
    # Fondo gradiente aproximado (ámbar → marrón)
    for y in range(size):
        ratio = y / size
        r = int(245 - (245 - 124) * ratio)
        g = int(158 - (158 - 45) * ratio)
        b = int(11 - (11 - 18) * ratio)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))
    # Disco vinilo central
    cx, cy = size // 2, size // 2
    r = int(size * 0.38)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(10, 10, 10, 255))
    # Anillos
    for ring in [0.92, 0.78, 0.62, 0.46]:
        rr = int(r * ring)
        draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(255, 255, 255, 30), width=2)
    # Etiqueta central (ámbar)
    r2 = int(r * 0.32)
    draw.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=(245, 158, 11, 255))
    # Agujero
    r3 = int(r * 0.08)
    draw.ellipse([cx - r3, cy - r3, cx + r3, cy + r3], fill=(0, 0, 0, 255))
    return img

PUBLIC = "/home/z/my-project/public"

# PNG para PWA
make_icon(192).save(f"{PUBLIC}/icon-192.png", "PNG")
print(f"OK: {PUBLIC}/icon-192.png (192x192)")

png_512 = make_icon(512)
png_512.save(f"{PUBLIC}/icon-512.png", "PNG")
print(f"OK: {PUBLIC}/icon-512.png (512x512)")

# ICO multi-resolución para Windows (Inno Setup lo requiere)
png_512.save(
    f"{PUBLIC}/icon-512.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print(f"OK: {PUBLIC}/icon-512.ico (multi-resolución 16-256)")

