# Bake

Application mobile perso — **React Native (Expo) + TypeScript**, données 100 %
locales (SQLite). Aucun compte, aucun serveur.

Cinq onglets :

| Onglet | Ce qu'il fait |
|---|---|
| **Habitudes** | les habitudes restant à valider aujourd'hui (création limitée à une tous les 30 jours) |
| **To-do** | tâches groupées par priorité ou par catégorie, rappels, planification dans l'agenda |
| **Agenda** | vues jour / semaine / mois, événements liés à un ou plusieurs to-dos |
| **Méditer** | chronomètre basé sur l'horloge réelle, objectif optionnel, cloche de fin |
| **Stats** | séries, heatmap, totaux — et les réglages (sauvegarde, catégories) |

Thème clair / sombre automatique (suit le système).

## Prérequis

- **Node 20 LTS** (via `nvm` — au-delà, le file-watcher de Metro casse)
- **Android Studio** (SDK + émulateur)
- Optionnel : l'app **Expo Go** sur un téléphone Android — attention, les
  notifications locales n'y fonctionnent pas (il faut un build dev/preview)

## Lancer

```bash
npm install          # dépendances
npm run android      # émulateur Android Studio démarré au préalable
# ou : npm start     # puis scan du QR code avec Expo Go
npm run tsc          # vérification de types (sans build)
npx expo start -c    # vider le cache Metro (après un changement Babel)
eas build -p android --profile preview   # APK installable sur le téléphone
```

## Structure

```
Bake/
├── index.ts                  # entry point : registerRootComponent(App)
├── src/App.tsx               # racine : init base + notifs, tab bar flottante
├── src/theme.ts              # palettes clair/sombre + tokens (spacing, radius, font)
├── src/db/database.ts        # TOUTE la persistance (schéma + requêtes)
├── src/lib/                  # dates, notifications, sauvegarde, son
├── src/screens/              # un écran par onglet
├── src/components/           # modales et widgets métier
├── src/components/ui/        # briques visuelles (anneau, heatmap, carte…)
├── scripts/make_bell.py      # génère assets/bell.wav (hors runtime)
├── app.json                  # config Expo (nom, package Android, notifs)
├── tsconfig.json             # TS strict + alias "@/" -> src/
├── CLAUDE.md                 # conventions du projet (pour Claude Code)
└── GUIDE.md                  # doc technique React Native (écrite pour un profil C++)
```

## Sauvegarde

Onglet **Stats** → ⚙️ → *Exporter* écrit un `bake-AAAA-MM-JJ.json` contenant
toute la base, puis ouvre le partage (Drive, mail…). *Importer* restaure ce
fichier — l'opération **remplace** toutes les données existantes, en une seule
transaction. Les sauvegardes des versions précédentes restent lisibles.

## Notes techniques

- `fsevents` est déclaré explicitement (macOS) : sans lui, Metro retombe sur un
  watcher par-répertoire qui sature les descripteurs de fichiers (`EMFILE`).
  Ne pas le retirer.
- Le plugin `react-native-reanimated/plugin` doit rester **le dernier** de
  `babel.config.js`.
