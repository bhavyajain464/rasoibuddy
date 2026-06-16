/** User-facing app name — also set `expo.name` in app.json to match. */
export const BRAND_DISPLAY_NAME = 'Rasoi Buddy';
/** @deprecated Use BRAND_DISPLAY_NAME */
export const BRAND_NAME = BRAND_DISPLAY_NAME;
export const BRAND_MOTTO = 'Less waste. Smarter meals. Calmer evenings.';

/** Stacked lines for hero / onboarding motto display. */
export const BRAND_MOTTO_LINES = BRAND_MOTTO.split('. ')
  .filter(Boolean)
  .map((part, index, parts) => (index < parts.length - 1 ? `${part}.` : part));

/** Login / logo header — must match pure white matte in `assets/logo.png`. */
export const BRAND_HEADER_BG = '#FFFFFF';

/** `assets/logo.png` width ÷ height (1173×912 transparent PNG). */
export const BRAND_LOGO_ASPECT = 1173 / 912;

export const ANDROID_PACKAGE = 'com.kitchenai.app';

/** https://play.google.com/store/apps/details?id=com.kitchenai.app */
export const PLAY_STORE_URL =
  process.env.EXPO_PUBLIC_PLAY_STORE_URL?.trim() ||
  'https://play.google.com/store/apps/details?id=com.kitchenai.app';

/** Static privacy page (also aliased as /privacy on Vercel and in local dev). */
export const PRIVACY_URL = '/privacy.html';

export const brandLogo = require('../../assets/logo.png');
/** Tight-crop nav mark — matches landing header `icon-mark.png`. */
export const brandIconMark = require('../../assets/icon-mark.png');
