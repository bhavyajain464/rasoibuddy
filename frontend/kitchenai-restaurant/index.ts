import 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';

if (Platform.OS !== 'web' && __DEV__) {
  require('expo-dev-client');
}

import App from './App';

registerRootComponent(App);
