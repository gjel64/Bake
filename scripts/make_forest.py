"""
make_forest.py — génère un fond « sapinière dans la brume », doux et profond.

Principe : on empile des rangées de silhouettes de sapins, de la plus lointaine
(claire + très floue = brouillard) à la plus proche (sombre + nette). On ajoute
des bandes de brume, un léger flou global, une désaturation et un vignettage.
Résultat : une photo-illustration calme et onirique, sans aucun texte.

Sortie : assets/forest.png (portrait, haute résolution).
"""

import math
import os
import random

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

W, H = 1080, 2280
random.seed(11)


def lerp(a, b, t):
    return int(round(a + (b - a) * t))


def vgradient(top, bottom):
    """Image RVB d'un dégradé vertical simple."""
    img = Image.new("RGB", (W, H))
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        col = (lerp(top[0], bottom[0], t), lerp(top[1], bottom[1], t), lerp(top[2], bottom[2], t))
        for x in range(W):
            px[x, y] = col
    return img


def draw_fir(d, x, base_y, h, w, color):
    """Un sapin stylisé : quelques étages triangulaires + un tronc court."""
    tiers = 5
    for i in range(tiers):
        ty = base_y - h * (i / tiers)
        tw = w * (1 - 0.62 * (i / tiers))
        th = (h / tiers) * 1.7
        d.polygon([(x - tw / 2, ty), (x + tw / 2, ty), (x, ty - th)], fill=color)
    # tronc
    trunk_w = max(2, w * 0.05)
    d.rectangle([x - trunk_w / 2, base_y, x + trunk_w / 2, base_y + h * 0.06], fill=color)


def tree_layer(base_yfrac, color, blur, hmin, hmax, spacing):
    """Une rangée de sapins rendue sur un calque transparent, puis floutée."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x = -60
    while x < W + 60:
        base_y = int(H * base_yfrac + random.uniform(-24, 24))
        h = random.uniform(hmin, hmax)
        w = h * random.uniform(0.42, 0.58)
        draw_fir(d, x, base_y, h, w, color + (255,))
        x += spacing * random.uniform(0.7, 1.25)
    if blur > 0:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return layer


def fog_band(y_center, thickness, strength):
    """Une bande de brume horizontale, douce."""
    band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(band)
    d.rectangle([0, y_center - thickness / 2, W, y_center + thickness / 2],
                fill=(214, 226, 219, strength))
    return band.filter(ImageFilter.GaussianBlur(thickness / 2))


# 1. Ciel/brume de fond (clair et légèrement vert en haut, forêt sombre en bas)
base = vgradient((176, 200, 186), (24, 37, 31)).convert("RGBA")

# 1b. Halo de lumière douce dans la brume (soleil diffus derrière les arbres)
bloom = Image.new("RGBA", (W, H), (0, 0, 0, 0))
db = ImageDraw.Draw(bloom)
bx, by, br = W * 0.52, H * 0.30, W * 0.5
db.ellipse([bx - br, by - br, bx + br, by + br], fill=(228, 236, 226, 70))
base.alpha_composite(bloom.filter(ImageFilter.GaussianBlur(120)))

# 2. Rangées de sapins, du lointain (clair/flou/dense) au proche (sombre/net)
layers = [
    # base_yfrac, color,           blur, hmin, hmax, spacing
    (0.50, (150, 172, 161),   9.0, 70, 150, 18),
    (0.60, (120, 146, 133),   6.0, 110, 220, 26),
    (0.70, (85, 110, 98),     3.8, 150, 300, 40),
    (0.81, (50, 71, 62),      2.2, 190, 370, 54),
    (0.92, (24, 37, 31),      1.0, 250, 470, 70),
]
for i, (yf, color, blur, hmin, hmax, spacing) in enumerate(layers):
    # une bande de brume juste avant chaque rangée renforce la profondeur
    base.alpha_composite(fog_band(int(H * yf) - 30, 150, 70 - i * 8))
    base.alpha_composite(tree_layer(yf, color, blur, hmin, hmax, spacing))

# 3. Voile de brume général + rayons doux dans le haut
base.alpha_composite(fog_band(int(H * 0.42), 320, 46))

img = base.convert("RGB")

# 4. Douceur « photo » : léger flou global, désaturation, contraste calme
img = img.filter(ImageFilter.GaussianBlur(1.6))
img = ImageEnhance.Color(img).enhance(1.02)
img = ImageEnhance.Brightness(img).enhance(0.99)
img = ImageEnhance.Contrast(img).enhance(1.04)

# 5. Vignettage doux (coins plus sombres, regard guidé vers le centre)
vig = Image.new("L", (W, H), 0)
dv = ImageDraw.Draw(vig)
cx, cy = W / 2, H * 0.52
maxd = math.hypot(cx, cy)
step = 6
for r in range(0, int(maxd), step):
    val = int(255 * (1 - (r / maxd) ** 2.2))
    dv.ellipse([cx - r, cy - r, cx + r, cy + r], fill=val)
vig = vig.filter(ImageFilter.GaussianBlur(60))
dark = ImageEnhance.Brightness(img).enhance(0.55)
img = Image.composite(img, dark, vig)

out = os.path.join(os.path.dirname(__file__), "..", "assets", "forest.png")
img.save(out, "PNG")
print("écrit:", os.path.abspath(out), img.size)
