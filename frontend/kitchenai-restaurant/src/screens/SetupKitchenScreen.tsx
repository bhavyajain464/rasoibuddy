import React, { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { restaurantFetch } from '../services/api';
import { palette } from '../theme';

const ZOMATO_LOGIN_URL = 'https://www.zomato.com/partners/login';

type Mode = 'join' | 'create';

export default function SetupKitchenScreen() {
  const { user, signOut } = useAuth();
  const { setKitchen, refreshKitchen } = useRestaurant();
  const [mode, setMode] = useState<Mode>('create');
  const [outletId, setOutletId] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [cookieHeader, setCookieHeader] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openZomatoLogin = useCallback(() => {
    if (typeof window === 'undefined') return;
    const popup = window.open(ZOMATO_LOGIN_URL, 'zomato-connect', 'width=520,height=760');
    if (!popup) {
      setError('Popup blocked — allow popups, or open zomato.com/partners/login manually.');
    }
  }, []);

  const finishWithKitchen = async (kitchenId: string, role: string) => {
    setKitchen({ kitchen_id: kitchenId, role });
    await refreshKitchen();
  };

  const joinRestaurant = async () => {
    const id = outletId.trim();
    if (!id) {
      setError('Enter your Zomato outlet ID');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const k = await restaurantFetch<{ kitchen_id: string }>('/restaurant/join-by-outlet', {
        method: 'POST',
        body: JSON.stringify({ outlet_id: id }),
      });
      await finishWithKitchen(k.kitchen_id, 'staff');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join restaurant');
    } finally {
      setBusy(false);
    }
  };

  const createRestaurant = async () => {
    const id = outletId.trim();
    const cookies = cookieHeader.trim();
    if (!id) {
      setError('Enter your Zomato outlet ID');
      return;
    }
    if (!cookies) {
      setError('Paste the Cookie header from Zomato after partner login');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await restaurantFetch<{
        kitchen_id: string;
        sync_started?: boolean;
        sync_error?: string;
      }>('/restaurant/provision-zomato', {
        method: 'POST',
        body: JSON.stringify({
          name: restaurantName.trim() || undefined,
          outlet_id: id,
          outlet_name: restaurantName.trim() || undefined,
          cookie_header: cookies,
        }),
      });
      await finishWithKitchen(res.kitchen_id, 'owner');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create restaurant');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text variant="headlineSmall" style={styles.title}>
        Welcome, {user?.name?.split(' ')[0] ?? 'Partner'}
      </Text>
      <Text variant="bodyMedium" style={styles.sub}>
        Set up your restaurant workspace. Create links your Zomato outlet and starts importing orders. Join an
        existing workspace with an outlet ID the owner already registered.
      </Text>

      <SegmentedButtons
        value={mode}
        onValueChange={(v) => {
          if (v === 'join' || v === 'create') {
            setMode(v);
            setError('');
          }
        }}
        buttons={[
          { value: 'create', label: 'Create' },
          { value: 'join', label: 'Join' },
        ]}
        style={styles.segment}
      />

      <TextInput
        label="Zomato outlet ID"
        value={outletId}
        onChangeText={setOutletId}
        mode="outlined"
        keyboardType="number-pad"
        placeholder="e.g. 22267610"
        style={styles.input}
        outlineColor={palette.border}
        textColor={palette.text}
      />

      {mode === 'join' ? (
        <>
          <Text style={styles.hint}>
            The outlet must already be registered by the owner (Create flow). Staff use the same outlet ID to join.
          </Text>
          <Button
            mode="contained"
            onPress={joinRestaurant}
            loading={busy}
            disabled={!outletId.trim() || busy}
            buttonColor={palette.primary}
            textColor="#0F172A"
            style={styles.btn}
          >
            Join restaurant
          </Button>
        </>
      ) : (
        <>
          <TextInput
            label="Restaurant name (optional)"
            value={restaurantName}
            onChangeText={setRestaurantName}
            mode="outlined"
            placeholder="Choudhary Hotel"
            style={styles.input}
            outlineColor={palette.border}
            textColor={palette.text}
          />

          {Platform.OS === 'web' ? (
            <>
              <Text style={styles.hint}>
                1. Open Zomato partner login and sign in{'\n'}
                2. DevTools → Network → copy the cookie header from an api.zomato.com request{'\n'}
                3. Paste below — we validate the session and outlet, then create your workspace and start syncing orders (retry from Settings if sync does not start)
              </Text>
              <Button mode="outlined" onPress={openZomatoLogin} textColor={palette.primary} style={styles.btn}>
                Open Zomato partner login
              </Button>
            </>
          ) : (
            <Text style={styles.hint}>
              Sign in at zomato.com/partners on a browser, copy the cookie header from DevTools, and paste it below.
            </Text>
          )}

          <TextInput
            label="Cookie header (from Network tab)"
            value={cookieHeader}
            onChangeText={setCookieHeader}
            mode="outlined"
            multiline
            numberOfLines={4}
            placeholder="session_id=...; other_cookie=..."
            style={styles.input}
            outlineColor={palette.border}
            textColor={palette.text}
          />

          <Button
            mode="contained"
            onPress={createRestaurant}
            loading={busy}
            disabled={!outletId.trim() || !cookieHeader.trim() || busy}
            buttonColor={palette.primary}
            textColor="#0F172A"
            style={styles.btn}
          >
            Create restaurant & sync orders
          </Button>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button mode="text" onPress={signOut} textColor={palette.textMuted} style={styles.signOut}>
        Sign out
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: palette.background,
    padding: 24,
    justifyContent: 'center',
  },
  title: { color: palette.text, marginBottom: 8 },
  sub: { color: palette.textMuted, marginBottom: 20, lineHeight: 22 },
  segment: { marginBottom: 16 },
  hint: { color: palette.textMuted, fontSize: 13, marginBottom: 12, lineHeight: 20 },
  btn: { marginBottom: 12 },
  input: { marginBottom: 12, backgroundColor: palette.surface },
  error: { color: palette.error, marginTop: 8 },
  signOut: { marginTop: 24 },
});
