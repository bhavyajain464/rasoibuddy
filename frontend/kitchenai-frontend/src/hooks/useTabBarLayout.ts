import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '../theme';

/** Tab icons + labels only (excludes system bottom inset). */
export const TAB_BAR_CONTENT_HEIGHT = 58;

/**
 * Bottom inset for the tab bar. With Android edge-to-edge, `insets.bottom` is
 * usually the nav bar height; use a small floor when it reads 0 on odd devices.
 */
function tabBarBottomInset(insetsBottom: number): number {
  if (insetsBottom > 0) return insetsBottom;
  return Platform.OS === 'android' ? 24 : 0;
}

export function useTabBarLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = tabBarBottomInset(insets.bottom);
  const totalHeight = TAB_BAR_CONTENT_HEIGHT + bottomInset;

  const tabBarStyle: ViewStyle = {
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.borderLight,
    elevation: 0,
    shadowOpacity: 0,
    paddingTop: 8,
    paddingBottom: bottomInset,
    height: totalHeight,
  };

  /** Bottom padding for scroll content above the tab bar. */
  const contentPaddingBottom = (extra = 24) => totalHeight + extra;

  return {
    bottomInset,
    totalHeight,
    tabBarStyle,
    contentPaddingBottom,
  };
}
