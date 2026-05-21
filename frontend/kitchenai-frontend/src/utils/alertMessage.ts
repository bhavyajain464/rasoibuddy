import { Alert, Platform } from 'react-native';

/** Shows an error or info message on web (alert) and native (Alert.alert). */
export function showAppAlert(title: string, message: string) {
  const body = message ? `${title}\n\n${message}` : title;
  if (Platform.OS === 'web') {
    window.alert(body);
    return;
  }
  Alert.alert(title, message);
}
