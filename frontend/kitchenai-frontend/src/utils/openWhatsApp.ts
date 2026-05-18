import { Linking, Platform } from 'react-native';

/** Build the same https://wa.me/…?text=… link as the backend. */
export function buildWaMeUrl(phone: string, message: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const text = message.trim();
  if (!text) return null;
  const params = new URLSearchParams({ text });
  return `https://wa.me/${digits}?${params.toString()}`;
}

function isWebIOS(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandaloneWebApp(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)')?.matches === true
  );
}

function waMeToWhatsAppDeepLink(waMeUrl: string): string | null {
  try {
    const u = new URL(waMeUrl);
    if (!u.hostname.endsWith('wa.me')) return null;
    const phone = u.pathname.replace(/\//g, '').replace(/\D/g, '');
    if (phone.length < 10) return null;
    const text = u.searchParams.get('text') ?? '';
    const q = new URLSearchParams();
    q.set('phone', phone);
    if (text) q.set('text', text);
    return `whatsapp://send?${q.toString()}`;
  } catch {
    return null;
  }
}

function openOnWeb(url: string): void {
  if (typeof document === 'undefined') return;

  if (isWebIOS() && isStandaloneWebApp()) {
    const deep = waMeToWhatsAppDeepLink(url);
    if (deep) {
      window.location.assign(deep);
      return;
    }
  }

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/** Open WhatsApp compose. Call synchronously from a user tap when possible. */
export function openWhatsAppUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) return;

  if (Platform.OS === 'web') {
    openOnWeb(trimmed);
    return;
  }

  Linking.openURL(trimmed).catch(() => {
    Linking.openURL(trimmed).catch(() => {});
  });
}

export function isIosHomeScreenWeb(): boolean {
  return Platform.OS === 'web' && isWebIOS() && isStandaloneWebApp();
}
