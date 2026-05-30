import { CommonActions } from '@react-navigation/native';
import { navigationRef } from './AppNavigator';
import type { RootStackParamList } from './types';

export function openProfile(params?: RootStackParamList['Profile']) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Profile', params);
}

export function closeProfile() {
  if (!navigationRef.isReady()) return;
  if (navigationRef.canGoBack()) {
    navigationRef.goBack();
    return;
  }
  navigationRef.dispatch(
    CommonActions.navigate({
      name: 'MainTabs',
      params: { screen: 'Home' },
    }),
  );
}
