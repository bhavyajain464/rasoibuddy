import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  Button,
  Text,
  ActivityIndicator,
  Divider,
  Surface,
  IconButton,
} from 'react-native-paper';
import { useShareIntent } from 'expo-share-intent';
import * as api from '../services/api';
import { WhatsAppParsedAction } from '../types';
import {
  clampWhatsAppMessageText,
  formatConfidence,
  logImportError,
  toUserFacingMessage,
} from '../utils/whatsappAction';
import { BottomSheet, bottomSheetPrimaryBtn } from './BottomSheet';
import { MessageComposer } from './MessageComposer';
import { useAppRefresh } from '../context/AppRefreshContext';
import { palette } from '../theme';

type WhatsAppShareContextValue = {
  openWithText: (text: string) => void;
  /** Opens Review suggestion sheet with an empty message to type in the sheet. */
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

const INTENT_LABELS: Record<string, string> = {
  add_to_shopping_list: 'Add to shopping list',
  mark_out_of_stock: 'Mark out of stock',
  add_inventory: 'Add to inventory',
  note_dislike: 'Save food preference',
  report_cooked_dish: 'Log dish cooked',
  unknown: 'Not understood',
};

function WhatsAppShareModal({
  visible,
  initialText,
  onDismiss,
}: {
  visible: boolean;
  initialText: string;
  onDismiss: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [action, setAction] = useState<WhatsAppParsedAction | null>(null);
  const [error, setError] = useState('');
  const [doneMsg, setDoneMsg] = useState('');
  const { bump } = useAppRefresh();

  useEffect(() => {
    if (visible) {
      setText(initialText);
      setAction(null);
      setError('');
      setDoneMsg('');
    }
  }, [visible, initialText]);

  useEffect(() => {
    const trimmed = clampWhatsAppMessageText(initialText);
    if (!visible || !trimmed) return;
    let cancelled = false;
    (async () => {
      setParsing(true);
      setError('');
      try {
        const res = await api.parseWhatsAppMessage(trimmed);
        if (!cancelled) setAction(res.action);
      } catch (e: unknown) {
        if (!cancelled) {
          const raw = e instanceof Error ? e.message : String(e);
          logImportError('parse', { rawMessage: raw, cause: e });
          setError(toUserFacingMessage(raw));
          setAction(null);
        }
      } finally {
        if (!cancelled) setParsing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, initialText]);

  const handleReparse = async () => {
    const trimmed = clampWhatsAppMessageText(text);
    if (!trimmed) return;
    setParsing(true);
    setError('');
    setAction(null);
    try {
      const res = await api.parseWhatsAppMessage(trimmed);
      setAction(res.action);
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      logImportError('parse', { rawMessage: raw, cause: e });
      setError(toUserFacingMessage(raw));
    } finally {
      setParsing(false);
    }
  };

  const handleApply = async () => {
    if (!action) return;
    setApplying(true);
    setError('');
    try {
      const res = await api.applyWhatsAppAction(action);
      setDoneMsg(res.message || 'Done');
      bump();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      logImportError('apply', { rawMessage: raw, cause: e });
      setError(toUserFacingMessage(raw));
    } finally {
      setApplying(false);
    }
  };

  const canApply =
    action &&
    action.intent !== 'unknown' &&
    action.confidence >= 0.5 &&
    !doneMsg;

  const confidence = action?.confidence ?? 0;
  const entities = action?.entities;
  const lowConfidence = action && confidence > 0 && confidence < 0.75;
  const busy = parsing || applying;

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      dismissDisabled={busy}
      title="Review suggestion"
      scrollable
      maxHeightRatio={0.92}
      footer={(
        <View style={styles.footerRow}>
          <Button
            mode="outlined"
            onPress={onDismiss}
            disabled={busy}
            style={styles.footerBtn}
            textColor={palette.textSecondary}
          >
            {doneMsg ? 'Done' : 'Cancel'}
          </Button>
          {!doneMsg ? (
            <Button
              mode="contained"
              onPress={() => void handleApply()}
              loading={applying}
              disabled={!canApply || busy}
              buttonColor={palette.primary}
              style={[styles.footerBtn, styles.footerBtnPrimary]}
              contentStyle={bottomSheetPrimaryBtn.content}
              labelStyle={bottomSheetPrimaryBtn.label}
            >
              Apply
            </Button>
          ) : null}
        </View>
      )}
    >
      <View style={styles.messageHeader}>
        <Text variant="labelMedium" style={styles.sectionLabel}>Your message</Text>
        {!doneMsg ? (
          <IconButton
            icon="refresh"
            size={22}
            iconColor={palette.primary}
            onPress={() => void handleReparse()}
            disabled={parsing || !text.trim() || busy}
            accessibilityLabel="Re-analyze message"
            style={styles.refreshBtn}
          />
        ) : null}
      </View>

      {!doneMsg ? (
        <MessageComposer
          value={text}
          onChangeText={setText}
          onSubmit={() => void handleReparse()}
          placeholder='e.g. "milk khatam ho gaya"'
          disabled={busy}
          loading={parsing}
          accessibilityLabel="Review suggestion"
        />
      ) : (
        <View style={styles.messageBox}>
          <Text variant="bodyMedium" style={styles.messageText}>
            {text.trim() || '—'}
          </Text>
        </View>
      )}

      {parsing ? (
        <View style={styles.center}>
          <ActivityIndicator color={palette.primary} />
          <Text variant="bodySmall" style={styles.muted}>Understanding message…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {doneMsg ? (
        <Surface style={styles.successBox} elevation={0}>
          <Text style={styles.success}>{doneMsg}</Text>
        </Surface>
      ) : null}

      {action && !parsing && !doneMsg ? (
        <>
          <Divider style={styles.divider} />
          <Text variant="labelMedium" style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
            Proposed action
          </Text>

          {lowConfidence ? (
            <Surface style={styles.warnBox} elevation={0}>
              <Text variant="bodySmall" style={styles.warnText}>
                Low confidence ({formatConfidence(confidence)}%) — please verify this matches what was said.
              </Text>
            </Surface>
          ) : null}

          <Surface style={styles.preview} elevation={0}>
            <View style={styles.intentPill}>
              <Text style={styles.intentPillText}>
                {INTENT_LABELS[action.intent] || action.intent}
              </Text>
            </View>
            <Text variant="bodyMedium" style={styles.summary}>
              {action.summary || '—'}
            </Text>
            {entities?.item_name ? (
              <Text variant="bodySmall" style={styles.muted}>
                Item: {entities.item_name}
                {entities.qty ? ` · ${entities.qty} ${entities.unit || 'pcs'}` : ''}
              </Text>
            ) : null}
            {entities?.dish_name ? (
              <Text variant="bodySmall" style={styles.muted}>
                Dish: {entities.dish_name}
              </Text>
            ) : null}
          </Surface>

          {action.intent === 'unknown' || action.confidence < 0.5 ? (
            <Text variant="bodySmall" style={styles.error}>
              We could not understand this message well enough to act. Edit the text and tap refresh, or cancel.
            </Text>
          ) : null}
        </>
      ) : null}
    </BottomSheet>
  );
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
      <WhatsAppShareModal
        visible={modal.visible}
        initialText={modal.text}
        onDismiss={() => setModal({ visible: false, text: '' })}
      />
    </WhatsAppShareContext.Provider>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: palette.textSecondary,
    fontWeight: '600',
    marginBottom: 0,
  },
  sectionLabelSpaced: {
    marginBottom: 8,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  refreshBtn: {
    margin: 0,
  },
  messageBox: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  messageText: {
    color: palette.text,
    lineHeight: 22,
  },
  divider: {
    marginVertical: 16,
    backgroundColor: palette.borderLight,
  },
  warnBox: {
    backgroundColor: palette.warningBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: palette.warningBorder,
  },
  warnText: {
    color: palette.warning,
    lineHeight: 18,
  },
  preview: {
    gap: 10,
    padding: 14,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.borderLight,
  },
  intentPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: palette.primaryDark,
  },
  intentPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  summary: {
    fontWeight: '600',
    color: palette.text,
    lineHeight: 22,
  },
  center: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  muted: {
    color: palette.textMuted,
    lineHeight: 18,
  },
  error: {
    color: palette.error,
    marginTop: 10,
    lineHeight: 20,
  },
  successBox: {
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: palette.primaryContainer,
    borderWidth: 1,
    borderColor: palette.primaryContainerDark,
  },
  success: {
    color: palette.primaryDark,
    fontWeight: '600',
    lineHeight: 20,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footerBtn: {
    flex: 1,
    borderRadius: 12,
  },
  footerBtnPrimary: {
    flex: 1.4,
  },
});
