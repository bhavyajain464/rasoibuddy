import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { useRestaurant } from '../../context/RestaurantContext';
import { restaurantFetch } from '../../services/api';
import { palette } from '../../theme';

type Mode = 'join' | 'create';
type JoinMethod = 'outlet_id' | 'invite_code';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = {
  onSuccess?: (outletName?: string) => void;
  /** Hide segmented mode switcher and show create only */
  createOnly?: boolean;
};

export function OutletSetupForm({ onSuccess, createOnly = false }: Props) {
  const { setKitchen, refreshKitchen, switchKitchen } = useRestaurant();
  const [mode, setMode] = useState<Mode>('create');
  const [joinMethod, setJoinMethod] = useState<JoinMethod>('outlet_id');
  const [joinValue, setJoinValue] = useState('');
  const [outletName, setOutletName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const effectiveMode = createOnly ? 'create' : mode;

  const finishWithOutlet = async (outletKey: string, role: string, name?: string) => {
    setKitchen({ outlet_id: outletKey, kitchen_id: outletKey, role, name });
    await refreshKitchen({ silent: true });
    await switchKitchen(outletKey);
    onSuccess?.(name);
  };

  const joinOutlet = async () => {
    const raw = joinValue.trim();
    if (!raw) {
      setError(joinMethod === 'outlet_id' ? 'Enter the outlet ID from your owner' : 'Enter the invite code');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (joinMethod === 'outlet_id' || UUID_RE.test(raw)) {
        const k = await restaurantFetch<{ kitchen_id: string; outlet_id?: string; name?: string; role?: string }>(
          '/restaurant/join-by-outlet',
          {
            method: 'POST',
            body: JSON.stringify({ outlet_id: raw }),
          },
        );
        const outletKey = k.outlet_id ?? k.kitchen_id;
        await finishWithOutlet(outletKey, k.role ?? 'staff', k.name);
        return;
      }
      const k = await restaurantFetch<{ kitchen_id: string; outlet_id?: string; name?: string; role?: string }>(
        '/restaurant/join',
        {
          method: 'POST',
          body: JSON.stringify({ invite_code: raw.toUpperCase() }),
        },
      );
      const outletKey = k.outlet_id ?? k.kitchen_id;
      await finishWithOutlet(outletKey, k.role ?? 'staff', k.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join outlet');
    } finally {
      setBusy(false);
    }
  };

  const createOutlet = async () => {
    const name = outletName.trim();
    if (!name) {
      setError('Enter a name for your outlet');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await restaurantFetch<{
        kitchen_id: string;
        outlet_id?: string;
        name?: string;
        role?: string;
      }>('/restaurant/kitchen', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      const outletKey = res.outlet_id ?? res.kitchen_id;
      await finishWithOutlet(outletKey, res.role ?? 'owner', res.name ?? name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create outlet');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      {!createOnly ? (
        <SegmentedButtons
          value={effectiveMode}
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
      ) : null}

      {effectiveMode === 'join' ? (
        <>
          <SegmentedButtons
            value={joinMethod}
            onValueChange={(v) => {
              if (v === 'outlet_id' || v === 'invite_code') {
                setJoinMethod(v);
                setError('');
              }
            }}
            buttons={[
              { value: 'outlet_id', label: 'Outlet ID' },
              { value: 'invite_code', label: 'Invite code' },
            ]}
            style={styles.segment}
          />
          <TextInput
            label={joinMethod === 'outlet_id' ? 'Outlet ID (from owner)' : 'Invite code'}
            value={joinValue}
            onChangeText={setJoinValue}
            mode="outlined"
            placeholder={joinMethod === 'outlet_id' ? 'e.g. 12ca918f-2297-4ff0-9da8-50466d2bf767' : 'AB12CD34'}
            autoCapitalize="characters"
            style={styles.input}
            outlineColor={palette.border}
            textColor={palette.text}
          />
          <Text style={styles.hint}>
            {joinMethod === 'outlet_id'
              ? 'Ask your owner for the KitchenAI outlet ID (Profile → Switch outlet). Not the Zomato store ID.'
              : 'Owners can share the invite code from Profile. Staff email invites apply automatically when you sign in.'}
          </Text>
          <Button
            mode="contained"
            onPress={joinOutlet}
            loading={busy}
            disabled={!joinValue.trim() || busy}
            buttonColor={palette.primary}
            textColor="#0F172A"
            style={styles.btn}
          >
            Join outlet
          </Button>
        </>
      ) : (
        <>
          <TextInput
            label="Outlet name"
            value={outletName}
            onChangeText={setOutletName}
            mode="outlined"
            placeholder="Choudhary Hotel"
            style={styles.input}
            outlineColor={palette.border}
            textColor={palette.text}
          />
          <Text style={styles.hint}>
            Creates a new outlet (menu, stock, orders). Link partners later from Profile → Partners.
          </Text>
          <Button
            mode="contained"
            onPress={createOutlet}
            loading={busy}
            disabled={!outletName.trim() || busy}
            buttonColor={palette.primary}
            textColor="#0F172A"
            style={styles.btn}
          >
            Create outlet
          </Button>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { marginBottom: 12 },
  hint: { color: palette.textMuted, fontSize: 13, marginBottom: 12, lineHeight: 20 },
  btn: { marginBottom: 4 },
  input: { marginBottom: 12, backgroundColor: palette.surface },
  error: { color: palette.error, marginTop: 8, fontSize: 13 },
});
