import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { fetchAppConfig, type AppConfigResponse } from '../services/api';

const ANDROID_PACKAGE = 'com.kitchenai.app';

function envStoreUrl(key: 'EXPO_PUBLIC_PLAY_STORE_URL' | 'EXPO_PUBLIC_APP_STORE_URL'): string {
  const v = process.env[key]?.trim();
  return v ?? '';
}

function parseVersionParts(raw: string): number[] {
  return raw.split('.').map(part => {
    const n = parseInt(part.replace(/[^0-9].*$/, ''), 10);
    return Number.isFinite(n) ? n : 0;
  });
}

export function isVersionAtLeast(current: string, minimum: string): boolean {
  const a = parseVersionParts(current);
  const b = parseVersionParts(minimum);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai > bi) return true;
    if (ai < bi) return false;
  }
  return true;
}

function getMarketingVersion(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';
}

function getNativeBuildNumber(): number {
  const raw = Application.nativeBuildVersion ?? '';
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Sent on every API request so the backend can block legacy native builds. */
export function getAppVersionHeaders(): Record<string, string> {
  const platform = Platform.OS === 'web' ? 'web' : Platform.OS;
  return {
    'X-App-Platform': platform,
    'X-App-Version': getMarketingVersion(),
    'X-App-Build': String(getNativeBuildNumber()),
  };
}

export function isNativeUpdateRequired(config: AppConfigResponse): boolean {
  if (Platform.OS === 'android') {
    if (config.min_android_build > 0) {
      return getNativeBuildNumber() < config.min_android_build;
    }
    if (config.min_android_version) {
      return !isVersionAtLeast(getMarketingVersion(), config.min_android_version);
    }
    return false;
  }
  if (Platform.OS === 'ios') {
    if (config.min_ios_build > 0) {
      return getNativeBuildNumber() < config.min_ios_build;
    }
    if (config.min_ios_version) {
      return !isVersionAtLeast(getMarketingVersion(), config.min_ios_version);
    }
    return false;
  }
  return false;
}

const DEFAULT_UPDATE_MESSAGE =
  'A new version of Kitchmate is required. Please update from the store to continue.';

/** Returns whether the installed native build is below server minimums. Web always passes. */
export async function checkForceUpdate(): Promise<{ required: boolean; message: string }> {
  if (Platform.OS === 'web') {
    return { required: false, message: '' };
  }
  try {
    const config = await fetchAppConfig();
    const required = isNativeUpdateRequired(config);
    const message =
      config.update_message?.trim() ||
      DEFAULT_UPDATE_MESSAGE;
    return { required, message };
  } catch {
    return { required: false, message: '' };
  }
}

/** Human-readable version for Settings (marketing version + native build when available). */
export function getAppVersionLabel(): string {
  const marketing =
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    '1.0.0';
  const build = Application.nativeBuildVersion;
  if (build && Platform.OS !== 'web') {
    return `${marketing} (build ${build})`;
  }
  return marketing;
}

export function isNativeApp(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

/** Opens the platform store listing so the user can install the latest build. */
export async function openAppStoreForUpdate(storeUrls?: {
  playStoreUrl?: string;
  appStoreUrl?: string;
}): Promise<{ ok: boolean; message?: string }> {
  if (Platform.OS === 'android') {
    const web = storeUrls?.playStoreUrl?.trim() ||
      envStoreUrl('EXPO_PUBLIC_PLAY_STORE_URL') ||
      `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
    const market = `market://details?id=${ANDROID_PACKAGE}`;
    try {
      if (await Linking.canOpenURL(market)) {
        await Linking.openURL(market);
        return { ok: true };
      }
      await Linking.openURL(web);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Could not open Google Play. Try searching for Kitchmate in the Play Store.' };
    }
  }

  if (Platform.OS === 'ios') {
    const url = storeUrls?.appStoreUrl?.trim() || envStoreUrl('EXPO_PUBLIC_APP_STORE_URL');
    if (!url) {
      return {
        ok: false,
        message: 'App Store link is not configured yet. Install updates from TestFlight or the App Store when available.',
      };
    }
    try {
      await Linking.openURL(url);
      return { ok: true };
    } catch {
      return { ok: false, message: 'Could not open the App Store.' };
    }
  }

  return {
    ok: false,
    message: 'Install the Android or iOS app from the store to get updates. Refresh this page for the latest web build.',
  };
}
