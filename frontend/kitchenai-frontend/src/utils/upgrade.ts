import { Alert, Platform } from 'react-native';

export function showUpgradeMessage(message: string, onUpgrade?: () => void) {
  const full = `${message}\n\nPro unlocks unlimited bill scans and all meal categories (Rescue, Meal of Day, Healthy, Tasty, Meal Prep).`;
  if (Platform.OS === 'web' && onUpgrade) {
    if (window.confirm(`${full}\n\nOpen checkout now?`)) {
      onUpgrade();
    }
    return;
  }
  if (Platform.OS === 'web') {
    window.alert(full);
  } else {
    Alert.alert('Upgrade to Pro', full);
  }
}
