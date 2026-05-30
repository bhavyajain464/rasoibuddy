import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';

const ANDROID_PACKAGE = 'com.kitchenai.app';

function envStoreUrl(key: 'EXPO_PUBLIC_PLAY_STORE_URL' | 'EXPO_PUBLIC_APP_STORE_URL'): string {
  const v = process.env[key]?.trim();
  return v ?? '';
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
export async function openAppStoreForUpdate(): Promise<{ ok: boolean; message?: string }> {
  if (Platform.OS === 'android') {
    const web = envStoreUrl('EXPO_PUBLIC_PLAY_STORE_URL') ||
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
      return { ok: false, message: 'Could not open Google Play. Try searching for Kitchen AI in the Play Store.' };
    }
  }

  if (Platform.OS === 'ios') {
    const url = envStoreUrl('EXPO_PUBLIC_APP_STORE_URL');
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
