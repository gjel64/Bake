/**
 * accent.ts — la teinte d'accent choisie par l'utilisateur : vert ou orange.
 *
 * Même rôle que `themeMode.ts`, mais pour la COULEUR et non la luminosité :
 * ce module fait le pont entre le réglage stocké en base (`settings`) et la
 * palette appliquée par `@/theme`, qui ne connaît pas la base.
 *
 * Le vert est la teinte d'origine (le défaut) ; l'orange reprend l'ambre du
 * logo. Le réglage voyage dans les sauvegardes : après un import, relire
 * `getAccent()` pour appliquer la teinte restaurée (voir `SettingsModal`).
 */

import { SETTING_ACCENT, getSetting, setSetting } from '@/db/database';

/** Les deux teintes possibles. */
export type Accent = 'green' | 'orange';

/** La teinte choisie ; `'green'` tant que rien n'a été réglé. */
export function getAccent(): Accent {
  return getSetting(SETTING_ACCENT) === 'orange' ? 'orange' : 'green';
}

/** Enregistre la teinte choisie. `'green'` efface le réglage : on revient au défaut. */
export function saveAccent(accent: Accent): void {
  setSetting(SETTING_ACCENT, accent === 'orange' ? 'orange' : null);
}
