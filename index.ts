import { registerRootComponent } from 'expo';

import App from './src/App';

// registerRootComponent appelle AppRegistry.registerComponent('main', () => App)
// et configure l'environnement (Expo Go comme build natif).
registerRootComponent(App);
