import { Platform } from 'react-native';

/** Web deep links persist in the URL bar; reset to home after login/logout. */
export function resetWebAppHomePath() {
  if (Platform.OS !== 'web') return;
  const path = window.location.pathname;
  if (path !== '/' && path !== '') {
    window.history.replaceState({}, '', '/');
  }
}
