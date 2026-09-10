/**
 * agendaFilters.ts — ce que l'agenda MASQUE, vue par vue.
 *
 * Même rôle que `themeMode.ts` ou `accent.ts` : faire le pont entre un réglage
 * stocké en base (`settings`) et un écran, ici l'agenda.
 *
 * L'idée : un abonnement (ou une catégorie) peut être utile dans une vue et
 * encombrant dans une autre — l'emploi du temps a sa place dans la vue Jour,
 * pas dans la grille du Mois où il noie les pastilles. Le masquage est donc
 * enregistré SÉPARÉMENT pour chaque vue : une clé de réglage par échelle de
 * temps (`agenda_hidden_jour`, `…_semaine`, `…_mois`), dont la valeur est la
 * liste des sources masquées, séparées par des virgules.
 *
 * Une source est une clé texte rendue par `eventSourceKey()` : `"cal:3"` pour
 * un abonnement, `"cat:7"` pour une catégorie, `"none"` pour les événements
 * perso sans catégorie. Une source qui disparaît (catégorie supprimée) laisse
 * une clé orpheline dans le réglage : sans effet, personne ne la porte plus.
 *
 * Comme les autres réglages, tout ça voyage dans les sauvegardes.
 */

import { SETTING_AGENDA_HIDDEN, getSetting, setSetting } from '@/db/database';

/** Les trois échelles de temps de l'agenda — aussi les libellés du sélecteur. */
export const AGENDA_SCOPES = ['Jour', 'Semaine', 'Mois'] as const;

/** Une échelle de temps : chacune a ses propres sources masquées. */
export type AgendaScope = (typeof AGENDA_SCOPES)[number];

/** La clé de réglage d'une échelle : "agenda_hidden_semaine". */
function settingKey(scope: AgendaScope): string {
  return `${SETTING_AGENDA_HIDDEN}_${scope.toLowerCase()}`;
}

/** Les sources masquées dans une vue (ensemble vide si on n'a jamais rien masqué). */
export function getHiddenSources(scope: AgendaScope): Set<string> {
  const raw = getSetting(settingKey(scope));
  if (raw === null) return new Set();
  return new Set(raw.split(',').filter((key) => key.length > 0));
}

/** Enregistre les sources masquées d'une vue. Un ensemble vide efface le réglage. */
export function saveHiddenSources(scope: AgendaScope, hidden: ReadonlySet<string>): void {
  const list = [...hidden].join(',');
  setSetting(settingKey(scope), list.length > 0 ? list : null);
}

/**
 * Masque / réaffiche une source dans une vue, et renvoie le nouvel ensemble.
 * (On repart de la base plutôt que d'un état local : c'est elle qui fait foi.)
 */
export function toggleHiddenSource(
  scope: AgendaScope,
  key: string,
  hidden: boolean,
): Set<string> {
  const next = getHiddenSources(scope);
  if (hidden) next.add(key);
  else next.delete(key);
  saveHiddenSources(scope, next);
  return next;
}
