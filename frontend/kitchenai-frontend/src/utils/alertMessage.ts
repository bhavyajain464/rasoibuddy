import { Alert, Platform } from 'react-native';
import { appFeedbackRef } from '../context/AppFeedbackContext';

function viaToast(
  message: string,
  kind: 'info' | 'success' | 'error',
  title?: string,
) {
  const body = title && message ? `${title}: ${message}` : message || title || '';
  if (appFeedbackRef.current) {
    appFeedbackRef.current.show(body, kind);
    return;
  }
  if (Platform.OS === 'web') {
    return;
  }
  Alert.alert(title || 'Notice', message || title || '');
}

/** @deprecated Prefer showAppError / showAppSuccess / showAppInfo */
export function showAppAlert(title: string, message?: string) {
  viaToast(message ?? '', 'error', message ? title : undefined);
}

export function showAppError(message: string, title?: string) {
  viaToast(message, 'error', title);
}

export function showAppSuccess(message: string, title?: string) {
  viaToast(message, 'success', title);
}

export function showAppInfo(message: string, title?: string) {
  viaToast(message, 'info', title);
}
