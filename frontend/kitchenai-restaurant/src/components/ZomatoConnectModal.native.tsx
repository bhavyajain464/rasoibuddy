import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import CookieManager from '@react-native-cookies/cookies';
import { restaurantFetch } from '../services/api';
import { palette } from '../theme';
import type { ConnectSession, ZomatoConnectModalProps } from './zomatoConnectTypes';

const ZOMATO_DIRECT_LOGIN = 'https://www.zomato.com/partners/login';

function isZomatoLoggedIn(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.includes('/partners/login') || path.endsWith('/login')) return false;
    if (path.includes('/static/') || path.endsWith('.js') || path.endsWith('.css')) return false;
    return (
      path.startsWith('/partners/dashboard') ||
      path.startsWith('/partners/home') ||
      path.startsWith('/partners/orders') ||
      path.startsWith('/partners/outlet') ||
      path.startsWith('/partners/order-history') ||
      path.startsWith('/partners/business')
    );
  } catch {
    return false;
  }
}

async function extractZomatoCookies() {
  const all = await CookieManager.getAll(true);
  return Object.values(all)
    .filter((c) => (c.domain ?? '').includes('zomato.com'))
    .map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
    }));
}

export default function ZomatoConnectModal({ visible, kitchenId, onClose, onConnected }: ZomatoConnectModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState<ConnectSession | null>(null);
  const [capturing, setCapturing] = useState(false);
  const capturedRef = useRef(false);

  const finishConnected = useCallback(() => {
    capturedRef.current = true;
    onConnected();
    onClose();
  }, [onClose, onConnected]);

  const completeNative = useCallback(
    async (token: string) => {
      if (capturedRef.current) return;
      setCapturing(true);
      setError('');
      try {
        const cookies = await extractZomatoCookies();
        if (cookies.length === 0) {
          throw new Error('No Zomato session cookies found — finish login in the browser');
        }
        await restaurantFetch(`/restaurant/${kitchenId}/integrations/zomato/connect/${token}/complete`, {
          method: 'POST',
          body: JSON.stringify({ cookies }),
        });
        finishConnected();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save Zomato session');
      } finally {
        setCapturing(false);
      }
    },
    [finishConnected, kitchenId],
  );

  useEffect(() => {
    if (!visible || !kitchenId) return;
    capturedRef.current = false;
    setError('');
    setLoading(true);
    restaurantFetch<ConnectSession>(`/restaurant/${kitchenId}/integrations/zomato/connect/start`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
      .then(setSession)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not start Zomato connect');
      })
      .finally(() => setLoading(false));
  }, [visible, kitchenId]);

  const onWebViewNavigation = useCallback(
    (url: string) => {
      if (!session || capturedRef.current) return;
      if (isZomatoLoggedIn(url)) {
        void completeNative(session.token);
      }
    },
    [completeNative, session],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.title}>Connect Zomato partner</Text>
          <Button onPress={onClose} textColor={palette.textMuted}>
            Close
          </Button>
        </View>
        <Text style={styles.hint}>
          Log in with your Zomato partner phone and OTP below. Session is saved automatically after login.
        </Text>
        {loading ? <ActivityIndicator style={styles.loader} color={palette.primary} /> : null}
        {capturing ? <Text style={styles.meta}>Saving Zomato session…</Text> : null}
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {session && !loading ? (
          <WebView
            source={{ uri: ZOMATO_DIRECT_LOGIN }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            style={styles.webview}
            onNavigationStateChange={(nav) => onWebViewNavigation(nav.url)}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background, paddingTop: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: { color: palette.text },
  hint: { color: palette.textMuted, fontSize: 13, paddingHorizontal: 16, marginBottom: 8 },
  meta: { color: palette.textMuted, paddingHorizontal: 16 },
  err: { color: palette.error, paddingHorizontal: 16, marginBottom: 8 },
  loader: { marginTop: 24 },
  webview: { flex: 1, marginTop: 8 },
});
