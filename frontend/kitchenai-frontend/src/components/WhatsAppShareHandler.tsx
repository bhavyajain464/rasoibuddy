import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { useShareIntent } from 'expo-share-intent';
import { clampWhatsAppMessageText } from '../utils/whatsappAction';
import { AIBuddyChatSheet } from './AIBuddyChatSheet';

type WhatsAppShareContextValue = {
  openWithText: (text: string) => void;
  /** Opens AI Buddy chat with an empty composer. */
  openCompose: () => void;
};

const WhatsAppShareContext = createContext<WhatsAppShareContextValue | null>(null);

export function useWhatsAppShare() {
  const ctx = useContext(WhatsAppShareContext);
  if (!ctx) {
    throw new Error('useWhatsAppShare must be used within WhatsAppShareProvider');
  }
  return ctx;
}

export function WhatsAppShareProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<{ visible: boolean; text: string }>({
    visible: false,
    text: '',
  });

  const shareDisabled = Platform.OS === 'web';
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    disabled: shareDisabled,
  });

  useEffect(() => {
    if (shareDisabled || !hasShareIntent) return;
    try {
      const raw =
        (typeof shareIntent?.text === 'string' ? shareIntent.text : '') ||
        (typeof shareIntent?.webUrl === 'string' ? shareIntent.webUrl : '');
      const shared = clampWhatsAppMessageText(raw);
      if (!shared) return;
      setModal({ visible: true, text: shared });
      resetShareIntent();
    } catch (e) {
      console.warn('share intent handling failed:', e);
      resetShareIntent();
    }
  }, [hasShareIntent, shareIntent, resetShareIntent, shareDisabled]);

  const openWithText = useCallback((text: string) => {
    setModal({ visible: true, text: clampWhatsAppMessageText(text) });
  }, []);

  const openCompose = useCallback(() => {
    setModal({ visible: true, text: '' });
  }, []);

  const value = useMemo(() => ({ openWithText, openCompose }), [openWithText, openCompose]);

  return (
    <WhatsAppShareContext.Provider value={value}>
      {children}
      <AIBuddyChatSheet
        visible={modal.visible}
        initialText={modal.text}
        onDismiss={() => setModal({ visible: false, text: '' })}
      />
    </WhatsAppShareContext.Provider>
  );
}
