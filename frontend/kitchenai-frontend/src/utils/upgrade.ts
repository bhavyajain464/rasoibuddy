import { Alert, Platform } from 'react-native';
import { showAppInfo } from './alertMessage';

export function showUpgradeMessage(message: string, _onUpgrade?: () => void) {
  const full = `${message} Pro unlocks unlimited bill scans and all meal categories.`;
  if (Platform.OS === 'web') {
    showAppInfo(full);
    return;
  }
  Alert.alert('Upgrade to Pro', full);
}
