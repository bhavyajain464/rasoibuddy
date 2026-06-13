import React, { useCallback, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, TextInput } from 'react-native-paper';
import { restaurantFetch } from '../services/api';
import { palette } from '../theme';
import type { ZomatoConnectModalProps } from './zomatoConnectTypes';

const ZOMATO_LOGIN_URL = 'https://www.zomato.com/partners/login';

export default function ZomatoConnectModal({ visible, kitchenId, onClose, onConnected }: ZomatoConnectModalProps) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cookieHeader, setCookieHeader] = useState('');

  const openZomatoLogin = useCallback(() => {
    if (typeof window === 'undefined') return;
    const popup = window.open(ZOMATO_LOGIN_URL, 'zomato-connect', 'width=520,height=760');
    if (!popup) {
      setError('Popup blocked — allow popups for this site, or open partners.zomato.com manually.');
    }
  }, []);

  const saveSession = async () => {
    const raw = cookieHeader.trim();
    if (!raw) {
      setError('Paste the Cookie header from a Zomato network request after login.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await restaurantFetch(`/restaurant/${kitchenId}/integrations/zomato/import-auth`, {
        method: 'POST',
        body: JSON.stringify({ cookie_header: raw }),
      });
      onConnected();
      onClose();
      setCookieHeader('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save Zomato session');
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.title}>Connect Zomato partner</Text>
          <Button onPress={onClose} textColor={palette.textMuted}>
            Close
          </Button>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.hint}>
            On web, Zomato must open on their real site (not through our server). Phone + OTP login works there; Firebase/Google errors in the proxy are avoided.
          </Text>
          <Button mode="contained" onPress={openZomatoLogin} buttonColor={palette.primary} textColor="#0F172A">
            Open Zomato partner login
          </Button>
          <Text style={[styles.hint, { marginTop: 16 }]}>
            After you reach the partner dashboard:{'\n'}
            1. In the Zomato tab, open DevTools (F12) → Network{'\n'}
            2. Click any request to api.zomato.com{'\n'}
            3. Copy the full Request header value for cookie{'\n'}
            4. Paste it below and tap Save session
          </Text>
          <TextInput
            label="Cookie header (from Network tab)"
            value={cookieHeader}
            onChangeText={setCookieHeader}
            mode="outlined"
            multiline
            numberOfLines={4}
            placeholder="session_id=...; other_cookie=..."
            style={styles.input}
            textColor={palette.text}
          />
          {error ? <Text style={styles.err}>{error}</Text> : null}
          <Button
            mode="contained"
            onPress={saveSession}
            loading={busy}
            disabled={!cookieHeader.trim() || busy}
            buttonColor={palette.primary}
            textColor="#0F172A"
            style={styles.save}
          >
            Save session
          </Button>
          {busy ? <ActivityIndicator color={palette.primary} style={{ marginTop: 12 }} /> : null}
        </ScrollView>
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
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  hint: { color: palette.textMuted, fontSize: 13, marginBottom: 12, lineHeight: 20 },
  input: { marginVertical: 8, backgroundColor: palette.surface },
  err: { color: palette.error, marginBottom: 8, fontSize: 13 },
  save: { marginTop: 8 },
});
