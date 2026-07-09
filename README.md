# Bake

Application mobile Android — **React Native (Expo) + TypeScript**.
État actuel : un « Hello, World » minimal, prêt à être étendu.

## Prérequis

- **Node 20 LTS** (via `nvm` — Node 26 casse le file-watcher de Metro)
- **VS Code** + **Android Studio** (SDK + émulateur)
- Optionnel : l'app **Expo Go** sur un téléphone Android

## Lancer

```bash
npm install          # dépendances
npm run android      # émulateur Android Studio démarré au préalable
# ou : npm start     # puis scan du QR code avec Expo Go
npm run tsc          # vérification de types (sans build)
eas build -p android --profile preview # installer sur le tel
```

## Structure

```
Bake/
├── index.ts            # entry point : registerRootComponent(App)
├── src/App.tsx         # composant racine 
├── app.json            # config Expo (nom, package Android)
├── package.json        # deps + scripts
├── tsconfig.json       # TS strict + alias "@/" -> src/
├── metro.config.js     # config Metro (bundler) par défaut
└── GUIDE.md            # doc technique + catalogue de composants
```

## Note technique importante

`fsevents` est déclaré en dépendance **directe** (et non optionnelle) : sans
lui, Metro retombe sur un watcher par-répertoire qui sature les descripteurs
de fichiers (`EMFILE`). Ne pas le retirer.
