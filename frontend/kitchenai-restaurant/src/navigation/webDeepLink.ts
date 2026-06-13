import { Platform } from 'react-native';
import {
  getStateFromPath,
  type LinkingOptions,
  type NavigationContainerRefWithCurrent,
  type NavigationState,
  type ParamListBase,
  type PartialState,
} from '@react-navigation/native';
import type { MainTabParamList, RootStackParamList } from './types';

const mainTabPaths: Record<string, string> = {
  orders: 'Orders',
  menu: 'Menu',
  stock: 'Stock',
  buy: 'Buy',
};

export const mainLinkingScreens = {
  Home: '',
  Orders: 'orders',
  Menu: 'menu',
  Stock: 'stock',
  Buy: 'buy',
};

/** Web deep links persist in the URL bar; reset to home after login/logout only. */
export function resetWebAppHomePath() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const path = window.location.pathname;
  if (path !== '/' && path !== '') {
    window.history.replaceState({}, '', '/');
  }
}

export function getWebPathForLinking(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function getWebNavigationStateFromUrl(
  config: NonNullable<LinkingOptions<ParamListBase>['config']>,
): PartialState<NavigationState> | undefined {
  const path = getWebPathForLinking();
  if (!path) return undefined;
  return getStateFromPath(path, config) ?? undefined;
}

/** Fallback when linking misses the first paint after auth restore. */
export function syncWebPathToNavigation(
  navigationRef: NavigationContainerRefWithCurrent<RootStackParamList>,
) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !navigationRef.isReady()) return;

  const segment = window.location.pathname.replace(/^\//, '').split('/')[0]?.toLowerCase() ?? '';

  if (segment === 'profile') {
    navigationRef.navigate('Profile');
    return;
  }

  const tab = mainTabPaths[segment];
  if (tab) {
    navigationRef.navigate('Main', { screen: tab as keyof MainTabParamList });
  }
}
