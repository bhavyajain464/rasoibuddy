import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '../theme';

export type FeedbackKind = 'info' | 'success' | 'error';

type FeedbackAPI = {
  show: (message: string, kind?: FeedbackKind) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
};

const AppFeedbackContext = createContext<FeedbackAPI | null>(null);

export const appFeedbackRef: { current: FeedbackAPI | null } = { current: null };

function feedbackBackground(kind: FeedbackKind): string {
  if (kind === 'error') return palette.error;
  if (kind === 'success') return palette.success;
  return palette.surfaceElevated;
}

export function AppFeedbackProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<FeedbackKind>('info');

  const show = useCallback((msg: string, k: FeedbackKind = 'info') => {
    const text = String(msg ?? '').trim();
    if (!text) return;
    setMessage(text);
    setKind(k);
    setVisible(true);
  }, []);

  const api = useMemo<FeedbackAPI>(
    () => ({
      show,
      showSuccess: (msg) => show(msg, 'success'),
      showError: (msg) => show(msg, 'error'),
      showInfo: (msg) => show(msg, 'info'),
    }),
    [show],
  );

  appFeedbackRef.current = api;

  return (
    <AppFeedbackContext.Provider value={api}>
      {children}
      <Snackbar
        visible={visible}
        onDismiss={() => setVisible(false)}
        duration={kind === 'error' ? 5000 : 3500}
        wrapperStyle={[styles.host, { marginBottom: insets.bottom + 72 }]}
        style={[styles.surface, { backgroundColor: feedbackBackground(kind) }]}
        contentStyle={styles.content}
      >
        {message}
      </Snackbar>
    </AppFeedbackContext.Provider>
  );
}

export function useAppFeedback(): FeedbackAPI {
  const ctx = useContext(AppFeedbackContext);
  if (!ctx) {
    throw new Error('useAppFeedback must be used within AppFeedbackProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  surface: {
    alignSelf: 'center',
    maxWidth: 320,
    borderRadius: 10,
  },
  content: {
    flex: 0,
    flexGrow: 0,
    marginHorizontal: 14,
    marginVertical: 10,
  },
});
