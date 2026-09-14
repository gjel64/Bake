/**
 * BakeLogo — le logo de l'app, « La levée » : une pâte qui lève (ou un soleil
 * qui se lève) posée sur sa ligne.
 *
 * Le même tracé que les icônes de `assets/`, redessiné en `react-native-svg`
 * pour pouvoir l'afficher dans l'app à n'importe quelle taille. La source de
 * vérité des icônes reste `scripts/make_icons.mjs` : modifier l'un, c'est
 * modifier l'autre.
 *
 * Les couleurs sont FIGÉES (un logo ne change pas avec le thème), sauf si on
 * passe `color` : le motif est alors tracé d'un seul ton, sur fond transparent.
 */

import { Defs, G, LinearGradient, Path, Rect, Stop, Svg } from 'react-native-svg';

/** Couleurs du logo — identiques à celles de `scripts/make_icons.mjs`. */
const CRUST_TOP = '#161616';
const CRUST_BOTTOM = '#000000';
const AMBER_TOP = '#F2C574';
const AMBER_BOTTOM = '#DB9F44';
const AMBER_FLAT = '#E8B45E';

type Props = {
  size?: number; // côté du carré, en px
  tile?: boolean; // avec sa tuile arrondie sombre (défaut) ou motif seul
  color?: string; // force un ton unique (filigrane, icône monochrome)
};

export function BakeLogo({ size = 64, tile = true, color }: Props) {
  // Motif seul : il occupe plus de place, la tuile ne l'entoure plus.
  const scale = tile ? 0.66 : 1.05;
  const dome = color ?? 'url(#bakeDome)';
  const base = color ?? AMBER_FLAT;

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="bakeCrust" x1="0" y1="0" x2="0.45" y2="1">
          <Stop offset="0" stopColor={CRUST_TOP} />
          <Stop offset="1" stopColor={CRUST_BOTTOM} />
        </LinearGradient>
        <LinearGradient id="bakeDome" x1="0" y1="0" x2="0.2" y2="1">
          <Stop offset="0" stopColor={AMBER_TOP} />
          <Stop offset="1" stopColor={AMBER_BOTTOM} />
        </LinearGradient>
      </Defs>

      {tile && <Rect width="1024" height="1024" rx="230" fill="url(#bakeCrust)" />}

      {/* L'encadré utile du motif va de (212, 350) à (812, 744) : on le recentre. */}
      <G transform={`translate(512 512) scale(${scale}) translate(-512 -547)`}>
        <Path d="M258 604 a254 254 0 0 1 508 0 Z" fill={dome} />
        <Rect x="212" y="672" width="600" height="72" rx="36" fill={base} opacity={0.72} />
      </G>
    </Svg>
  );
}
