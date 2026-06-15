import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

/** sw600dp — Android ignores orientation locks at this size and above. */
const LARGE_SCREEN_MIN_DP = 600;

/** Lock portrait on phones; allow rotation on tablets/foldables (Android 16+ requirement). */
export function usePhonePortraitOrientation() {
  const { width, height } = useWindowDimensions();
  const minDimension = Math.min(width, height);

  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;

    (async () => {
      try {
        if (minDimension >= LARGE_SCREEN_MIN_DP) {
          await ScreenOrientation.unlockAsync();
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        }
      } catch {
        // Simulators or unsupported environments — ignore.
      }
    })();
  }, [minDimension]);
}
