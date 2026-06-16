import { Platform } from 'react-native';
import { isAdminWebPath } from './adminPath';

const APP_HOME_PATH = '/app';
const PUBLIC_HOME_PATH = '/';
const LOGIN_PATH = '/login';

const PROTECTED_PREFIXES = ['/app', '/inventory', '/meals', '/cook', '/shopping', '/profile'];

function replacePath(path: string) {
  if (Platform.OS !== 'web') return;
  if (window.location.pathname !== path) {
    window.history.replaceState({}, '', path);
  }
}

/** After sign-in on web — open the in-app dashboard. */
export function navigateWebToAppHome() {
  replacePath(APP_HOME_PATH);
}

/** After sign-out on web — return to the marketing home. */
export function navigateWebToPublicHome() {
  replacePath(PUBLIC_HOME_PATH);
}

export function navigateWebToLogin() {
  replacePath(LOGIN_PATH);
}

/** @deprecated Use navigateWebToAppHome */
export function resetWebAppHomePath() {
  navigateWebToAppHome();
}

/** @deprecated Use navigateWebToPublicHome */
export function resetWebPublicPath() {
  navigateWebToPublicHome();
}

export function syncWebPathForAuthState(hasSession: boolean) {
  if (Platform.OS !== 'web') return;
  const path = window.location.pathname;
  if (isAdminWebPath(path)) {
    return;
  }
  if (hasSession) {
    if (path === PUBLIC_HOME_PATH || path === LOGIN_PATH) {
      navigateWebToAppHome();
    }
    return;
  }
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  if (isProtected) {
    navigateWebToLogin();
  }
}
