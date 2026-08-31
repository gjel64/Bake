/**
 * make_icons.mjs — génère les icônes de l'app à partir du logo « La levée ».
 *
 * Générateur HORS RUNTIME, à lancer à la main (comme `make_bell.py`) :
 *
 *     node scripts/make_icons.mjs
 *
 * Le dessin (une miche qui lève / un soleil qui se lève) est décrit une seule
 * fois en SVG ici, puis rasterisé par Chrome en mode headless — aucune
 * dépendance npm à installer. Les fichiers produits atterrissent dans
 * `assets/` et sont déclarés dans `app.json`.
 *
 * Le MÊME tracé est repris en `react-native-svg` dans
 * `src/components/ui/BakeLogo.tsx` : toucher à l'un, c'est toucher à l'autre.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const ASSETS = join(ROOT, 'assets');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// --- Le dessin ------------------------------------------------------------

/** Couleurs du logo (figées : une icône ne suit pas le thème du téléphone). */
const CRUST_TOP = '#16241D'; // fond, haut
const CRUST_BOTTOM = '#0C1712'; // fond, bas
const AMBER_TOP = '#F2C574'; // dôme, haut
const AMBER_BOTTOM = '#DB9F44'; // dôme, bas
const AMBER_FLAT = '#E8B45E'; // socle

/**
 * Le motif, dans un repère 1024 × 1024. Son encadré utile va de (212, 350) à
 * (812, 744) : `scale` l'agrandit autour du centre de la toile, et le recale
 * verticalement pour qu'il soit optiquement centré.
 */
function glyph({ scale = 1, color = null }) {
  const dome = color ?? 'url(#dome)';
  const base = color ?? AMBER_FLAT;
  return `
    <g transform="translate(512 512) scale(${scale}) translate(-512 -547)">
      <path d="M258 604 a254 254 0 0 1 508 0 Z" fill="${dome}"/>
      <rect x="212" y="672" width="600" height="72" rx="36" fill="${base}" opacity="0.72"/>
    </g>`;
}

/** Les dégradés partagés par les variantes. */
const DEFS = `
  <defs>
    <linearGradient id="crust" x1="0" y1="0" x2="0.45" y2="1">
      <stop offset="0" stop-color="${CRUST_TOP}"/>
      <stop offset="1" stop-color="${CRUST_BOTTOM}"/>
    </linearGradient>
    <linearGradient id="dome" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0" stop-color="${AMBER_TOP}"/>
      <stop offset="1" stop-color="${AMBER_BOTTOM}"/>
    </linearGradient>
  </defs>`;

// --- Les quatre variantes -------------------------------------------------

const VARIANTS = [
  {
    file: 'icon.png',
    size: 1024,
    // iOS et le lanceur Android arrondissent eux-mêmes : on livre un carré plein.
    body: `<rect width="1024" height="1024" fill="url(#crust)"/>${glyph({ scale: 1.05 })}`,
  },
  {
    file: 'adaptive-icon.png',
    size: 1024,
    // Icône adaptative : fond donné à part dans app.json, motif dans les 66 %
    // centraux — le lanceur peut rogner tout ce qui dépasse.
    body: glyph({ scale: 0.82 }),
  },
  {
    file: 'splash-icon.png',
    size: 1024,
    // Écran de démarrage : la tuile arrondie, posée sur fond clair OU sombre.
    body: `<rect x="192" y="192" width="640" height="640" rx="143" fill="url(#crust)"/>${glyph({ scale: 0.66 })}`,
  },
  {
    file: 'notification-icon.png',
    size: 96,
    // Android n'affiche que la silhouette, teintée par `color` dans app.json.
    body: glyph({ scale: 1.3, color: '#FFFFFF' }),
  },
];

// --- Rasterisation --------------------------------------------------------

const tmp = mkdtempSync(join(tmpdir(), 'bake-icons-'));

for (const v of VARIANTS) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent}
svg{display:block;width:${v.size}px;height:${v.size}px}</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${DEFS}${v.body}</svg>
</body></html>`;
  const page = join(tmp, `${v.file}.html`);
  writeFileSync(page, html);

  execFileSync(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000', // fond transparent
    `--window-size=${v.size},${v.size}`,
    `--screenshot=${join(ASSETS, v.file)}`,
    page,
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  console.log(`assets/${v.file} — ${v.size} × ${v.size}`);
}
