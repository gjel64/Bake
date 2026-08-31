/**
 * themeMode.ts — l'apparence choisie par l'utilisateur : système, clair ou sombre.
 *
 * Ce module fait le pont entre le réglage stocké en base (`settings`) et le
 * thème appliqué par `@/theme` — la palette, elle, ne connaît pas la base.
 *
 * Par défaut l'app suit le téléphone (`'system'`). Le réglage voyage dans les
 * sauvegardes comme les autres : après un import, relire `getThemeMode()` pour
 * appliquer l'apparence restaurée (voir `SettingsModal`).
 */

import { SETTING_THEME_MODE, getSetting, setSetting } from '@/db/database';

/** Les trois choix possibles dans les réglages. */
export type ThemeMode = 'system' | 'light' | 'dark';

/** L'apparence choisie ; `'system'` tant que rien n'a été réglé (ou en cas de valeur inconnue). */
export function getThemeMode(): ThemeMode {
  const value = getSetting(SETTING_THEME_MODE);
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** Enregistre l'apparence choisie. `'system'` efface le réglage : on repasse au téléphone. */
export function saveThemeMode(mode: ThemeMode): void {
  setSetting(SETTING_THEME_MODE, mode === 'system' ? null : mode);
}
