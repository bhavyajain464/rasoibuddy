import { Linking, Platform } from 'react-native';
import { PRIVACY_URL } from '../constants/brand';

const PRIVACY_STATIC_PATH = '/privacy.html';

const PARTNER_WEB_ORIGIN =
  process.env.EXPO_PUBLIC_WEB_REDIRECT_URI?.replace(/\/$/, '') ?? 'https://kitchmate-partner.vercel.app';

export function isPrivacyWebPath(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return path === PRIVACY_URL || path === `${PRIVACY_URL}/` || path === PRIVACY_STATIC_PATH;
}

/** When the web SPA bundle loads on a privacy URL, serve the static page instead of the auth gate. */
export function bootPublicPrivacyPageIfNeeded(registerApp: () => void): boolean {
  if (!isPrivacyWebPath()) return false;

  const { pathname, search, hash } = window.location;

  if (pathname !== PRIVACY_STATIC_PATH) {
    window.location.replace(`${PRIVACY_STATIC_PATH}${search}${hash}`);
    return true;
  }

  void (async () => {
    try {
      const res = await fetch(`${PRIVACY_STATIC_PATH}${search}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const html = await res.text();
      if (!html.includes('<h1>Privacy Policy</h1>')) throw new Error('not privacy html');
      document.open();
      document.write(html);
      document.close();
    } catch {
      registerApp();
    }
  })();

  return true;
}

export function openPrivacyPolicy() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(PRIVACY_URL);
    return;
  }
  void Linking.openURL(`${PARTNER_WEB_ORIGIN}${PRIVACY_URL}`);
}
