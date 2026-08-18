# Bake — notes pour Claude Code

App mobile perso (Android d'abord, iOS compatible) : **Expo SDK 51 + React Native 0.74 + TypeScript strict**.
Cinq onglets — Habitudes, To-do, Agenda, Méditer, Stats — sur une base **SQLite locale**. Aucun serveur, aucun compte.

Le code, les commentaires et l'UI sont **en français**. Garde cette langue partout.

## Interdits absolus

- **Ne jamais interagir avec git ni GitHub.** Pas de `git commit`, pas de `git push`, pas de `git checkout`/`reset`/`stash`, pas de branche, pas de PR, aucune commande `gh`. Les modifications restent dans le répertoire de travail : c'est l'utilisateur qui commite, quand il veut. Lire l'état (`git status`, `git diff`) est autorisé.

## Commandes

```bash
npm run android   # Metro + déploiement émulateur/appareil (garder ouvert)
npm start         # QR code (attention : notifs KO dans Expo Go, voir plus bas)
npm run tsc       # tsc --noEmit — SEULE vérification automatisée du projet
npx expo start -c # vider le cache Metro (obligatoire après un changement Babel)
eas build -p android --profile preview  # APK installable
```

Pas de tests, pas de linter. **Après toute modif : `npm run tsc` doit passer**, puis vérifier à l'œil dans l'app.
Node 20 requis (Node ≥ 22 casse le file-watcher de Metro).

## Architecture

```
index.ts                → registerRootComponent(App)
src/App.tsx             → initDatabase() + initNotifications(), tab bar flottante, thème navigation
src/theme.ts            → palettes clair/sombre + tokens (spacing, radius, font, softShadow)
src/db/database.ts      → 100 % de la persistance (schéma + toutes les requêtes)
src/lib/               → dates, notifications, backup, sound  (fonctions pures ou I/O isolées)
src/screens/           → un écran par onglet, porte l'ÉTAT
src/components/        → modales et widgets métier
src/components/ui/     → briques visuelles réutilisables (GlassCard, ProgressRing, Heatmap, …)
```

Alias TypeScript : `@/*` → `src/*`. Toujours importer via `@/`, jamais en chemins relatifs (`../../`).

## Règles non négociables

1. **Aucun SQL hors de `src/db/database.ts`.** Les écrans appellent uniquement les fonctions exportées.
   Nouveau besoin de données → nouvelle fonction exportée là-bas, avec sa JSDoc.
2. **Dates = chaînes.** Un jour est `"YYYY-MM-DD"`, une heure `"HH:MM"`, toujours en **heure locale**.
   Passer par `@/lib/dates` (`todayKey`, `addDays`, `weekDays`, `monthGrid`, `labelDayLong`…). Jamais d'UTC, jamais de `Date` stocké en base.
3. **Aucune couleur en dur.** `const c = useC()` dans le composant, puis `const styles = makeStyles(c)` —
   `makeStyles` est une fonction `(c: Palette) => StyleSheet.create({...})` définie en bas de fichier.
   Espacements/rayons/tailles viennent de `spacing`, `radius`, `font`. Le mode clair/sombre suit le système et doit rester lisible dans les deux.
4. **Rechargement des écrans** : `useFocusEffect(useCallback(() => refresh(), [refresh]))`.
   Il n'y a ni store global ni cache — chaque onglet relit la base quand il redevient visible. Ne pas introduire de Context/Zustand sans raison forte.
5. **Chaque fichier commence par un bloc JSDoc** qui explique son rôle en français, et chaque fonction exportée a sa ligne de doc. C'est la convention dominante du projet, la respecter.
6. **SQLite en mode synchrone** (`getAllSync` / `runSync` / `withTransactionSync`). Volumes minuscules, aucune promesse à gérer. Ne pas migrer vers l'API async.

## Pièges connus

- **Migrations** : pas de framework. `initDatabase()` fait `CREATE TABLE IF NOT EXISTS` puis `ensureColumn(...)` pour les colonnes ajoutées après coup. Donc : on **ajoute** des colonnes, on n'en renomme ni supprime jamais (les bases installées ne seraient pas migrées). Une migration de données doit être **idempotente** : elle tourne à chaque démarrage. Exemple à copier — `migrateEventTodoLinks()` recopie `events.todo_id` dans `event_todos` **puis vide la colonne**, sinon un lien supprimé par l'utilisateur réapparaîtrait au lancement suivant.
- **Événements ↔ to-dos** : relation N..N via la table `event_todos`. Un événement est « fait » quand il a au moins un to-do lié et qu'ils sont **tous** cochés (`mapEvent()`). Supprimer/déplanifier un to-do supprime l'événement seulement s'il ne reste plus aucun to-do rattaché.
- **Événements sur plusieurs jours** : la plage est `events.day` → `events.end_day` (jamais NULL après `migrateEventEndDay()`). `start` est l'heure du **premier** jour, `end` celle du **dernier**, les jours du milieu sont occupés en entier. `getEventsForDay()` renvoie donc un événement long **à chaque** jour de sa plage, et `getEventCountsInRange()` déplie la plage en JS (impossible en SQL simple). Côté écran, `spanFor()` dit où on en est dans la plage.
- **Rappel quotidien des habitudes** : un seul rappel global, heure stockée dans `settings` (`habits_reminder_time`), notification répétitive `{ hour, minute, repeats: true }`. Son texte est **figé** — une notif répétée ne peut pas être personnalisée à l'instant où elle sonne. On ne garde aucun identifiant : les notifs portent le marqueur `data.kind = 'habits-daily'`, ce qui permet de les retrouver même après un import. Rejouer `syncHabitsReminder()` après tout ce qui peut changer le réglage dans le dos de l'app.
- **Sauvegarde** : toute nouvelle table doit être ajoutée dans `exportData()` **et** `importData()` de `database.ts`, et `BACKUP_VERSION` incrémenté si le format change. `importData()` termine par les migrations, pour qu'une vieille sauvegarde soit convertie au format courant.
- **Notifications locales** : ne fonctionnent **pas dans Expo Go** — tester avec un build dev/preview. Les fonctions de `lib/notifications.ts` échouent en silence (try/catch) pour ne jamais casser l'app ; garder ce comportement.
- **Reanimated** : son plugin doit rester **le dernier** de `babel.config.js`, et tout changement de Babel impose `npx expo start -c`.
- **LayoutAnimation sur Android** : nécessite `UIManager.setLayoutAnimationEnabledExperimental?.(true)` au niveau module (voir `HabitsScreen`/`TodoScreen`).
- **Tab bar flottante** (`position: 'absolute'`) : elle recouvre le bas des écrans. Prévoir ~150 px de `paddingBottom` sur les listes et remonter les FAB en conséquence.
- **Méditation** : le temps est calculé sur l'horloge réelle (timestamp de départ + `AppState`), pas par incréments de `setInterval` — l'app doit continuer à compter écran éteint. Ne pas « simplifier » cette logique.
- **`fsevents`** est déclaré explicitement (macOS) : sans lui Metro sature les descripteurs de fichiers (`EMFILE`). Ne pas le retirer.
- **Props tableau passées à une modale** : les effets des modales ont les props en dépendances. Un tableau construit à la volée (`presetTodoIds={[t.id]}`) change d'identité à chaque rendu et provoque une boucle de re-rendus. Le mémoriser avec `useMemo` côté appelant (voir `TodoScreen`).

## Divers

- `scripts/make_bell.py` est un générateur d'asset hors runtime (`assets/bell.wav`), lancé à la main.
- `GUIDE.md` est un cours de React Native écrit pour un profil C++ : c'est de la doc d'apprentissage, pas une spec du projet. Il décrit l'app telle qu'elle était à ses débuts — ne pas s'y fier pour l'état actuel du code.
