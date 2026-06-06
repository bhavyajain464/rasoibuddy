import { CommonActions } from '@react-navigation/native';
import { navigationRef } from './AppNavigator';
import type { RootStackParamList } from './types';

export function openProfile() {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Profile');
}

export function closeProfile() {
  if (!navigationRef.isReady()) return;
  if (navigationRef.canGoBack()) {
    navigationRef.goBack();
    return;
  }
  navigationRef.dispatch(
    CommonActions.navigate({
      name: 'Main',
      params: { screen: 'Home' },
    } satisfies { name: keyof RootStackParamList; params: RootStackParamList['Main'] }),
  );
}
