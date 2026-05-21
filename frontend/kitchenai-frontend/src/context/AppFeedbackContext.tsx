import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type FeedbackKind = 'info' | 'success' | 'error';

type FeedbackAPI = {
  show: (message: string, kind?: FeedbackKind) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
};

const AppFeedbackContext = createContext<FeedbackAPI | null>(null);

/** Module ref so non-React code can show toasts (e.g. alertMessage.ts). */
export const appFeedbackRef: { current: FeedbackAPI | null } = { current: null };

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

  const bg =
    kind === 'error' ? '#C62828' : kind === 'success' ? '#2E7D32' : '#37474F';

  return (
    <AppFeedbackContext.Provider value={api}>
      {children}
      <Snackbar
        visible={visible}
        onDismiss={() => setVisible(false)}
        duration={kind === 'error' ? 5000 : 3500}
        action={{ label: 'OK', onPress: () => setVisible(false) }}
        style={{ marginBottom: insets.bottom + 8, backgroundColor: bg }}
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
