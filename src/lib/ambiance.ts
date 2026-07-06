/**
 * ambiance.ts — la « lumière d'Alaska ».
 *
 * Une seule fonction : selon l'heure réelle du téléphone, renvoie le dégradé
 * de l'en-tête. L'app respire ainsi au rythme du jour polaire — aube brumeuse,
 * jour forêt, crépuscule ambre, nuit profonde.
 *
 * Fonction PURE (hormis la lecture de l'heure) : facile à lire et à ajuster.
 */

import { colors } from '@/theme';

export type Moment = 'aube' | 'jour' | 'crepuscule' | 'nuit';

/** Le moment de la journée à partir d'une heure (0–23). */
export function momentOfDay(hour: number): Moment {
  if (hour >= 5 && hour < 9) return 'aube';
  if (hour >= 9 && hour < 17) return 'jour';
  if (hour >= 17 && hour < 21) return 'crepuscule';
  return 'nuit';
}

/**
 * Le dégradé (2 couleurs, du haut vers le bas) de l'en-tête pour le moment
 * courant. On garde toujours une base verte : l'identité « forêt » reste là,
 * seule l'atmosphère change.
 */
export function skyGradient(date: Date = new Date()): readonly [string, string] {
  switch (momentOfDay(date.getHours())) {
    case 'aube':
      return ['#123536', '#1E5150']; // brume glacier bleu-vert
    case 'jour':
      return ['#0F3B30', '#1C6E52']; // forêt d'épinettes profonde
    case 'crepuscule':
      return ['#173A30', '#4A3B22']; // forêt → lanterne ambrée
    case 'nuit':
      return [colors.night, colors.nightAlt]; // nuit polaire
  }
}

/**
 * Deux teintes d'« aurore » d'accent pour le moment courant : servent aux
 * halos lumineux du fond et aux liserés. Toujours dans les verts/bleus/violets
 * boréaux.
 */
export function auroraAccent(date: Date = new Date()): readonly [string, string] {
  switch (momentOfDay(date.getHours())) {
    case 'aube':
      return [colors.aurora2, colors.aurora]; // glacier → menthe
    case 'jour':
      return [colors.aurora, colors.aurora2]; // vert → glacier
    case 'crepuscule':
      return [colors.amber, colors.aurora]; // ambre → vert
    case 'nuit':
      return [colors.aurora, colors.violet]; // vert → violet
  }
}
