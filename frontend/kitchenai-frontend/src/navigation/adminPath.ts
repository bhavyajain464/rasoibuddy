import { Platform } from 'react-native';

const DEFAULT_ADMIN_PATH = 'kitchen-ops';

/** Hidden web path segment — navigate directly; not linked in the app shell. */
export function adminPathSegment(): string {
  const fromEnv = process.env.EXPO_PUBLIC_ADMIN_PATH?.trim().replace(/^\/+/, '');
  return fromEnv || DEFAULT_ADMIN_PATH;
}

export function adminWebPath(): string {
  return `/${adminPathSegment()}`;
}

export function isAdminWebPath(pathname?: string): boolean {
  if (Platform.OS !== 'web') return false;
  const path = (pathname ?? window.location.pathname).replace(/\/+$/, '') || '/';
  const admin = adminWebPath();
  return path === admin || path.startsWith(`${admin}/`);
}

export function isAdminWebPlatform(): boolean {
  return Platform.OS === 'web' && isAdminWebPath();
}
