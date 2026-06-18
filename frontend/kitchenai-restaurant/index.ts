import 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';
import { bootPublicPrivacyPageIfNeeded } from './src/utils/privacy';

function registerApp() {
  if (Platform.OS !== 'web' && __DEV__) {
    require('expo-dev-client');
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  registerRootComponent(require('./App').default);
}

if (!bootPublicPrivacyPageIfNeeded(registerApp)) {
  registerApp();
}
