module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Le plugin Reanimated DOIT être le dernier de la liste.
    // (Après l'avoir ajouté, redémarre Metro avec le cache vidé : npx expo start -c)
    plugins: ['react-native-reanimated/plugin'],
  };
};
