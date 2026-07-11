/**
 * theme.ts — la charte graphique iOS, en CLAIR et SOMBRE (auto).
 *
 * Deux palettes aux MÊMES clés : `lightColors` et `darkColors`. Le hook `useC()`
 * renvoie celle qui correspond au réglage du système (et suit les changements
 * en direct). Les composants lisent leurs couleurs via `useC()` — plus aucune
 * couleur figée dans les écrans.
 *
 * Esthétique : iOS « grouped » — fond gris/noir système, cartes encartées,
 * séparateurs fins, une seule teinte d'accent (vert nature).
 */

import { useColorScheme } from 'react-native';

export type Palette = {
  bg: string; // fond général (systemGroupedBackground)
  bgAlt: string; // second niveau
  surface: string; // carte
  surfaceStrong: string; // carte/état appuyé, pistes
  surfaceAlt: string; // champs de saisie / fills secondaires
  glassBorder: string; // séparateur / hairline
  primary: string; // accent (vert)
  primaryDark: string;
  primarySoft: string; // fond d'accent très léger
  aurora: string; // alias accent (icônes)
  aurora2: string; // accent secondaire (dégradés)
  violet: string;
  amber: string;
  night: string; // fond de l'écran Méditer
  nightAlt: string;
  text: string; // label
  textMuted: string; // secondaryLabel
  textFaint: string; // tertiaryLabel
  textOnDark: string; // texte sur fond principal
  textOnAurora: string; // texte sur bouton d'accent plein
  border: string;
  gold: string;
  danger: string;
  white: string;
};

/** iOS — clair (grouped). */
export const lightColors: Palette = {
  bg: '#F2F2F7',
  bgAlt: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceStrong: '#FFFFFF',
  surfaceAlt: '#EFEFF4',
  glassBorder: 'rgba(60,60,67,0.10)',
  primary: '#2E7D57',
  primaryDark: '#245F42',
  primarySoft: 'rgba(46,125,87,0.12)',
  aurora: '#2E7D57',
  aurora2: '#3B9E76',
  violet: '#6C63D8',
  amber: '#B7791F',
  night: '#F2F2F7',
  nightAlt: '#FFFFFF',
  text: '#1C1C1E',
  textMuted: '#6C6C70',
  textFaint: 'rgba(60,60,67,0.32)',
  textOnDark: '#1C1C1E',
  textOnAurora: '#FFFFFF',
  border: 'rgba(60,60,67,0.10)',
  gold: '#B7791F',
  danger: '#FF3B30',
  white: '#FFFFFF',
};

/** iOS — sombre (grouped). */
export const darkColors: Palette = {
  bg: '#000000',
  bgAlt: '#1C1C1E',
  surface: '#1C1C1E',
  surfaceStrong: '#2C2C2E',
  surfaceAlt: '#2C2C2E',
  glassBorder: 'rgba(84,84,88,0.55)',
  primary: '#34C98A',
  primaryDark: '#1E6B4B',
  primarySoft: 'rgba(52,201,138,0.18)',
  aurora: '#34C98A',
  aurora2: '#46B6C8',
  violet: '#8E85F0',
  amber: '#E0A93E',
  night: '#000000',
  nightAlt: '#1C1C1E',
  text: '#FFFFFF',
  textMuted: '#98989F',
  textFaint: 'rgba(235,235,245,0.30)',
  textOnDark: '#FFFFFF',
  textOnAurora: '#04160E',
  border: 'rgba(84,84,88,0.55)',
  gold: '#E0A93E',
  danger: '#FF453A',
  white: '#FFFFFF',
};

/**
 * Le hook de thème : renvoie la palette active (clair/sombre) selon le système.
 * Se met à jour tout seul quand l'utilisateur change de mode.
 */
export function useC(): Palette {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}

/**
 * Texte/icône SOMBRE posé sur une pastille de couleur pastel (catégories,
 * habitudes) — lisible dans les deux modes puisque les pastilles sont claires.
 */
export const onSwatch = '#152019';

/** Couleurs des pastilles (habitudes & catégories) — communes aux deux modes. */
export const habitPalette: string[] = [
  '#5AB98C', '#4FA6C4', '#E0A93E', '#E38AA0',
  '#8E85F0', '#54B39A', '#6E9BE8', '#E0906A',
];

/** Dégradés d'accent (anneaux, graphiques) — valables clair/sombre. */
export const gradients = {
  aurora: ['#34C98A', '#46B6C8'] as const,
  auroraViolet: ['#34C98A', '#8E85F0'] as const,
  night: ['#0A100D', '#111A16'] as const,
  ember: ['#E0A93E', '#E38A6A'] as const,
};

/** Espacements (échelle de 4). */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

/** Rayons d'arrondi façon iOS. */
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

/** Tailles de police. */
export const font = {
  large: 34, // grand titre iOS
  display: 48, // chronomètre
  title: 28,
  heading: 20,
  body: 16,
  small: 13,
  tiny: 11,
};

/** Ombre douce iOS (portée discrète sous les cartes). */
export const softShadow = {
  shadowColor: '#000000',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

/** Alias : même ombre discrète (plus de lueur néon). */
export const glow = softShadow;
