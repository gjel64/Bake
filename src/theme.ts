/**
 * theme.ts — la charte graphique, centralisée.
 *
 * Ambiance : NUIT POLAIRE d'Alaska. Fond sombre profond, cartes en « verre
 * givré », aurores boréales comme couleur d'accent, anneaux et graphiques
 * lumineux. Sobre et contemplatif, mais spectaculaire.
 *
 * Tout part d'ici : aucune couleur en dur dans les écrans. Comme le fond est
 * sombre, `text` est clair, `surface` est un verre sombre translucide, etc.
 */

export const colors = {
  // Fonds
  bg: '#0A100D', // vert-nuit profond (fallback derrière la photo)
  bgAlt: '#0E1512',
  // Verre SOMBRE translucide : reste lisible posé sur la forêt.
  surface: 'rgba(15,24,20,0.55)',
  surfaceStrong: 'rgba(15,24,20,0.72)', // éléments actifs / pistes
  surfaceAlt: 'rgba(255,255,255,0.07)', // champs de saisie (léger)
  glassBorder: 'rgba(233,240,233,0.14)', // liseré discret des cartes

  // Accents NATURELS et mats (plus de néon)
  primary: '#9FC3AD', // sauge douce : anneaux, états actifs
  primaryDark: '#20362D', // vert profond : texte sur pastille claire
  primarySoft: 'rgba(159,195,173,0.16)', // tuile sauge translucide
  aurora: '#A7C6B4', // sauge-menthe brumeuse
  aurora2: '#9FBAC4', // glacier doux
  violet: '#B3A9D6', // lavande brumeuse (accent discret)
  amber: '#D9BE86', // sable chaud

  // Nuit (fallbacks / dégradés sombres)
  night: '#0A100D',
  nightAlt: '#111A16',

  // Texte (clair, lisible sur la forêt)
  text: '#EFF3EE',
  textMuted: '#C0CCC4',
  textFaint: 'rgba(239,243,238,0.5)',
  textOnDark: '#EFF3EE',
  textOnAurora: '#16241E', // texte sombre sur une surface claire

  // Divers
  border: 'rgba(255,255,255,0.12)',
  gold: '#D9BE86',
  danger: '#E0917C', // terracotta doux (supprimer)
  white: '#FFFFFF',
};

/**
 * Palette de couleurs assignées aux habitudes — versions lumineuses qui
 * ressortent sur le fond sombre.
 */
export const habitPalette: string[] = [
  '#9FC3AD', // sauge
  '#9FBAC4', // glacier
  '#D9BE86', // sable
  '#D9A7B0', // rose poudré
  '#B3A9D6', // lavande brumeuse
  '#8FB6A2', // menthe douce
  '#A7B8D0', // bleu brume
  '#D6A98E', // terre douce
];

/** Dégradés réutilisables (2 couleurs, haut → bas ou gauche → droite). */
export const gradients = {
  aurora: ['#A7C6B4', '#9FBAC4'] as const, // sauge → glacier
  auroraViolet: ['#A7C6B4', '#B3A9D6'] as const, // sauge → lavande
  night: ['#0A100D', '#111A16'] as const,
  ember: ['#D9BE86', '#E0917C'] as const, // sable → terracotta
};

/** Espacements (échelle de 4). */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

/** Rayons d'arrondi (plus généreux = plus moderne). */
export const radius = { sm: 12, md: 20, lg: 28, pill: 999 };

/** Tailles de police. */
export const font = {
  display: 44, // très grand : chronomètre, gros chiffres de stats
  title: 28,
  heading: 20,
  body: 16,
  small: 13,
  tiny: 11,
};

/**
 * Ombre portée douce sous les cartes de verre (neutre, sans lueur néon).
 * iOS = shadow*, Android = elevation.
 */
export const glow = {
  shadowColor: '#000000',
  shadowOpacity: 0.28,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 8 },
  elevation: 5,
};
