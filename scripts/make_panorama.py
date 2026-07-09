"""
make_panorama.py — un large panorama d'Alaska, pour le fond en parallaxe.

De gauche à droite : montagnes enneigées → forêt d'épinettes → lac → aurore.
En swipant entre les onglets, chaque écran découvre une ambiance différente.

Rendu stylisé (silhouettes + dégradés), volontairement doux : le voile sombre
de l'app le recouvre en partie. Sortie : assets/panorama.jpg
"""

import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

W, H = 4600, 2000
random.seed(21)


def lerp(a, b, t):
    return a + (b - a) * t


# --- 1. Ciel : dégradé bilinéaire (4 coins) dawn (gauche) → nuit (droite) ----
tx = np.linspace(0, 1, W)[None, :]  # variation horizontale
ty = np.linspace(0, 1, H)[:, None]  # variation verticale

# Couleurs des 4 coins (RVB)
TL = np.array([150, 172, 184])  # haut-gauche : brume d'aube claire
TR = np.array([18, 28, 54])     # haut-droite : nuit bleutée
BL = np.array([96, 120, 126])   # bas-gauche
BR = np.array([12, 20, 40])     # bas-droite

sky = np.zeros((H, W, 3), dtype=np.float32)
for c in range(3):
    top = lerp(TL[c], TR[c], tx)      # (1,W)
    bot = lerp(BL[c], BR[c], tx)      # (1,W)
    sky[:, :, c] = lerp(top, bot, ty)  # (H,W)

# --- 2. Aurore : bandes vertes/violettes dans le ciel, surtout à droite ------
xx = np.linspace(0, 1, W)[None, :]
yy = np.linspace(0, 1, H)[:, None]
right = np.clip((xx - 0.45) / 0.55, 0, 1)  # 0 à gauche, 1 tout à droite
for band, (col, cy, amp, freq, ph) in enumerate([
    ((90, 210, 160), 0.20, 0.05, 3.0, 0.0),
    ((120, 200, 220), 0.30, 0.06, 2.3, 1.4),
    ((150, 130, 210), 0.16, 0.045, 3.6, 2.7),
]):
    wave = cy + amp * np.sin(2 * math.pi * (freq * xx + ph))
    dist = np.abs(yy - wave)
    glow = np.exp(-((dist / 0.05) ** 2)) * right  # ruban gaussien, renforcé à droite
    for c in range(3):
        sky[:, :, c] += col[c] * glow * 0.9

sky = np.clip(sky, 0, 255).astype(np.uint8)
img = Image.fromarray(sky, 'RGB').convert('RGBA')
draw = ImageDraw.Draw(img, 'RGBA')


# --- 3. Montagnes enneigées (arrière-plan, plus hautes à gauche) --------------
def ridge(base_y, amp, rough, color, snow=None, snow_line=0.0):
    """Une chaîne de montagnes : ligne brisée remplie jusqu'en bas."""
    pts = [(0, H)]
    x = 0
    prev = base_y
    while x <= W:
        # plus haut à gauche (facteur qui décroît vers la droite)
        left_boost = (1 - x / W) * 260
        y = base_y - left_boost + random.uniform(-amp, amp)
        y = prev * 0.4 + y * 0.6  # lissage
        pts.append((x, y))
        prev = y
        x += rough
    pts.append((W, H))
    draw.polygon(pts, fill=color)
    # neige : on repasse les sommets en clair
    if snow is not None:
        for i in range(1, len(pts) - 1):
            xx0, yy0 = pts[i]
            if yy0 < snow_line:
                r = rough * 0.9
                draw.polygon(
                    [(xx0 - r, yy0 + r * 1.4), (xx0, yy0), (xx0 + r, yy0 + r * 1.4)],
                    fill=snow,
                )


ridge(H * 0.62, 60, 120, (70, 84, 104, 255), snow=(220, 228, 236, 230), snow_line=H * 0.5)
ridge(H * 0.70, 45, 90, (52, 62, 80, 255), snow=(200, 210, 222, 200), snow_line=H * 0.55)

# --- 4. Lac (droite-centre) : bande réfléchissante ---------------------------
lake_x0, lake_x1 = int(W * 0.60), int(W * 0.90)
lake_y0, lake_y1 = int(H * 0.72), int(H * 0.86)
for j in range(lake_y0, lake_y1):
    t = (j - lake_y0) / (lake_y1 - lake_y0)
    col = (
        int(lerp(40, 18, t)),
        int(lerp(70, 40, t)),
        int(lerp(90, 60, t)),
    )
    draw.line([(lake_x0, j), (lake_x1, j)], fill=col)
# quelques reflets horizontaux clairs
for _ in range(40):
    ry = random.randint(lake_y0 + 4, lake_y1 - 4)
    rx = random.randint(lake_x0, lake_x1 - 120)
    draw.line([(rx, ry), (rx + random.randint(40, 140), ry)],
              fill=(170, 200, 210, 60), width=2)

# --- 5. Forêt : rangées de sapins sur toute la largeur (proche = sombre) ------
def fir(d, x, base_y, h, w, color):
    tiers = 5
    for i in range(tiers):
        ty0 = base_y - h * (i / tiers)
        tw = w * (1 - 0.62 * (i / tiers))
        th = (h / tiers) * 1.7
        d.polygon([(x - tw / 2, ty0), (x + tw / 2, ty0), (x, ty0 - th)], fill=color)


def forest_layer(base_yfrac, color, blur, hmin, hmax, spacing, skip=None):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x = -80
    while x < W + 80:
        if not (skip and skip[0] <= x <= skip[1]):
            base_y = int(H * base_yfrac + random.uniform(-30, 30))
            h = random.uniform(hmin, hmax)
            fir(d, x, base_y, h, h * random.uniform(0.42, 0.56), color + (255,))
        x += spacing * random.uniform(0.7, 1.2)
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return layer


# couche lointaine sur toute la largeur ; couches proches évitent le lac
img.alpha_composite(forest_layer(0.66, (60, 78, 74), 6, 90, 200, 34))
img.alpha_composite(forest_layer(0.78, (40, 58, 54), 3, 150, 300, 50, skip=(lake_x0, lake_x1)))
img.alpha_composite(forest_layer(0.9, (20, 32, 30), 1.2, 220, 420, 70, skip=(lake_x0, lake_x1)))

# --- 6. Finitions : douceur, désaturation légère -----------------------------
img = img.convert('RGB')
img = img.filter(ImageFilter.GaussianBlur(1.4))
img = ImageEnhance.Color(img).enhance(0.95)
img = ImageEnhance.Brightness(img).enhance(0.98)

out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'panorama.jpg')
img.save(out, 'JPEG', quality=86)
print('écrit:', os.path.abspath(out), img.size)
