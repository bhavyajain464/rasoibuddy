import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, IconButton, Surface, Text, TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { closeProfile } from '../navigation/rootNavigation';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import ZomatoConnectModal from '../components/ZomatoConnectModal';
import { SettingsSection } from '../components/settings/SettingsSection';
import { restaurantFetch } from '../services/api';
import { palette } from '../theme';

type ZomatoStatus = {
  status: string;
  last_sync_at?: string;
  last_error?: string;
  last_sync_message?: string;
  last_sync_ok?: boolean;
  orders_imported_count?: number;
  poll_interval_minutes?: number;
  next_poll_at?: string;
  session_saved?: boolean;
  outlet_id?: string;
  outlet_name?: string;
  sync_mode?: string;
};

const ZOMATO_FIRST_POLL_MS = 15_000;

function MetaLine({ children }: { children: React.ReactNode }) {
  return <Text style={styles.meta}>{children}</Text>;
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <Surface style={styles.statPill} elevation={0}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Surface>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { kitchen } = useRestaurant();
  const kitchenId = kitchen?.kitchen_id ?? '';
  const [kitchenName, setKitchenName] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState('starter');
  const [msg, setMsg] = useState('');
  const [zomatoOutlet, setZomatoOutlet] = useState('');
  const [zomatoOutletId, setZomatoOutletId] = useState('');
  const [zomatoStatus, setZomatoStatus] = useState<ZomatoStatus | null>(null);
  const [zomatoBusy, setZomatoBusy] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const lastPollMsgRef = useRef('');

  const applyPollFeedback = useCallback((st: ZomatoStatus, notify: boolean) => {
    const line = st.last_sync_message || st.last_error || '';
    if (!line) return;
    if (notify && line !== lastPollMsgRef.current) {
      lastPollMsgRef.current = line;
      setMsg(line);
    }
  }, []);

  const loadZomatoStatus = useCallback(async (notify = false) => {
    if (!kitchenId) return;
    try {
      const st = await restaurantFetch<ZomatoStatus>(`/restaurant/${kitchenId}/integrations/zomato/status`);
      setZomatoStatus(st);
      if (st.outlet_id) setZomatoOutletId(st.outlet_id);
      if (st.outlet_name) setZomatoOutlet(st.outlet_name);
      applyPollFeedback(st, notify);
    } catch {
      setZomatoStatus(null);
    }
  }, [kitchenId, applyPollFeedback]);

  useEffect(() => {
    if (!kitchenId) return;
    restaurantFetch<{ name?: string }>(`/restaurant/${kitchenId}`)
      .then((k) => setKitchenName(k?.name?.trim() || 'Your restaurant'))
      .catch(() => setKitchenName('Your restaurant'));
    restaurantFetch<{ plan_tier: string }>(`/restaurant/${kitchenId}/billing/plan`)
      .then((p) => setPlan(p.plan_tier))
      .catch(() => {});
    loadZomatoStatus();
  }, [kitchenId, loadZomatoStatus]);

  useEffect(() => {
    if (!kitchenId || zomatoStatus?.status !== 'running') return;
    const pollMs = (zomatoStatus.poll_interval_minutes ?? 5) * 60 * 1000;
    const id = setInterval(() => {
      void loadZomatoStatus(true);
    }, pollMs);
    return () => clearInterval(id);
  }, [kitchenId, zomatoStatus?.status, zomatoStatus?.poll_interval_minutes, loadZomatoStatus]);

  const inviteStaff = async () => {
    setMsg('');
    try {
      await restaurantFetch(`/restaurant/${kitchenId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), role: 'staff' }),
      });
      setEmail('');
      setMsg('Staff invited (they must sign in once first)');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Invite failed');
    }
  };

  const startZomato = async () => {
    setZomatoBusy(true);
    setMsg('');
    try {
      const st = await restaurantFetch<ZomatoStatus>(`/restaurant/${kitchenId}/integrations/zomato/start`, {
        method: 'POST',
        body: JSON.stringify({
          outlet_name: zomatoOutlet.trim(),
          outlet_id: zomatoOutletId.trim(),
        }),
      });
      setZomatoStatus(st);
      setMsg('Zomato sync started — polling every 5 minutes');
      lastPollMsgRef.current = '';
      setTimeout(() => void loadZomatoStatus(true), ZOMATO_FIRST_POLL_MS);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Zomato sync failed');
      loadZomatoStatus();
    } finally {
      setZomatoBusy(false);
    }
  };

  const stopZomato = async () => {
    setZomatoBusy(true);
    try {
      const st = await restaurantFetch<ZomatoStatus>(`/restaurant/${kitchenId}/integrations/zomato/stop`, {
        method: 'POST',
      });
      setZomatoStatus(st);
      setMsg('Zomato sync stopped');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Stop failed');
    } finally {
      setZomatoBusy(false);
    }
  };

  const zomatoRunning = zomatoStatus?.status === 'running';
  const needsSession = zomatoStatus?.status === 'login_required' || !zomatoStatus?.session_saved;
  const syncNeedsRetry =
    !zomatoRunning &&
    zomatoStatus?.session_saved &&
    (zomatoStatus?.status === 'error' || zomatoStatus?.status === 'idle');
  const canStart = zomatoOutletId.trim().length > 0 && !needsSession;
  const avatarLabel = user?.name?.charAt(0).toUpperCase() || 'P';

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.profileHeader, { paddingTop: insets.top + 14 }]}>
          <View style={styles.profileHeaderTop}>
            <IconButton
              icon="arrow-left"
              iconColor={palette.text}
              size={22}
              onPress={closeProfile}
              style={styles.backBtn}
            />
            <Text variant="titleMedium" style={styles.profileTitle}>
              Profile
            </Text>
            <View style={styles.backSpacer} />
          </View>
          <View style={styles.profileRow}>
            {user?.picture_url ? (
              <Image source={{ uri: user.picture_url }} style={styles.avatar} />
            ) : (
              <Avatar.Text size={64} label={avatarLabel} style={styles.avatarFallback} labelStyle={styles.avatarLabel} />
            )}
            <View style={styles.profileText}>
              <Text variant="titleLarge" style={styles.userName} numberOfLines={1}>
                {user?.name ?? 'Partner'}
              </Text>
              <Text variant="bodySmall" style={styles.userEmail} numberOfLines={1}>
                {user?.email ?? '—'}
              </Text>
              <Text variant="bodySmall" style={styles.userKitchen} numberOfLines={1}>
                {kitchenName}
                {kitchen?.role ? ` · ${kitchen.role}` : ''}
              </Text>
            </View>
          </View>
          <View style={styles.statRow}>
            <StatPill label="Plan" value={plan} />
            <StatPill label="Zomato" value={zomatoStatus?.orders_imported_count ?? 0} />
            <StatPill label="Sync" value={zomatoRunning ? 'Live' : zomatoStatus?.status ?? '—'} />
          </View>
        </View>

        <View style={styles.content}>
          <SettingsSection title="Account">
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Name</Text>
              <Text style={styles.rowValue}>{user?.name ?? '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Email</Text>
              <Text style={styles.rowValue}>{user?.email ?? '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Kitchen</Text>
              <Text style={styles.rowValue}>{kitchenName}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Role</Text>
              <Text style={styles.rowValue}>{kitchen?.role ?? '—'}</Text>
            </View>
          </SettingsSection>

          <SettingsSection title="Zomato orders">
            <Text style={styles.hint}>
              Polls every {zomatoStatus?.poll_interval_minutes ?? 5} min — only new orders are imported.
            </Text>
            <MetaLine>Status: {zomatoStatus?.status ?? 'idle'}</MetaLine>
            {zomatoStatus?.last_sync_at ? (
              <MetaLine>Last poll: {new Date(zomatoStatus.last_sync_at).toLocaleString()}</MetaLine>
            ) : null}
            {zomatoRunning && zomatoStatus?.next_poll_at ? (
              <MetaLine>Next poll: {new Date(zomatoStatus.next_poll_at).toLocaleString()}</MetaLine>
            ) : null}
            {zomatoStatus?.last_sync_message ? (
              <Text style={zomatoStatus.last_sync_ok ? styles.ok : styles.err}>{zomatoStatus.last_sync_message}</Text>
            ) : null}
            {zomatoStatus?.session_saved ? <MetaLine>Zomato partner connected</MetaLine> : null}
            {zomatoStatus?.last_error ? <Text style={styles.err}>{zomatoStatus.last_error}</Text> : null}
            {syncNeedsRetry ? (
              <Text style={styles.hint}>Connected but sync stopped — confirm outlet and retry.</Text>
            ) : null}

            {!zomatoRunning && (
              <>
                <TextInput
                  label="Outlet name"
                  value={zomatoOutlet}
                  onChangeText={setZomatoOutlet}
                  mode="outlined"
                  placeholder="Choudhary Hotel"
                  style={styles.input}
                  textColor={palette.text}
                />
                <TextInput
                  label="Outlet ID (required)"
                  value={zomatoOutletId}
                  onChangeText={setZomatoOutletId}
                  mode="outlined"
                  placeholder="22267610"
                  keyboardType="number-pad"
                  style={styles.input}
                  textColor={palette.text}
                />
                <Button
                  mode={needsSession ? 'outlined' : 'text'}
                  onPress={() => setConnectOpen(true)}
                  style={styles.btn}
                  textColor={needsSession ? palette.primary : palette.textMuted}
                >
                  {needsSession ? 'Connect Zomato partner account' : 'Reconnect Zomato'}
                </Button>
              </>
            )}

            {zomatoRunning ? (
              <Button mode="outlined" onPress={stopZomato} loading={zomatoBusy} textColor={palette.error} style={styles.btn}>
                Stop Zomato sync
              </Button>
            ) : (
              <Button
                mode="contained"
                onPress={startZomato}
                loading={zomatoBusy}
                disabled={!canStart}
                buttonColor={palette.primary}
                textColor="#0F172A"
                style={styles.btn}
              >
                {syncNeedsRetry
                  ? 'Retry Zomato sync'
                  : zomatoStatus?.session_saved
                    ? 'Start Zomato sync'
                    : 'Start sync (connect first)'}
              </Button>
            )}
          </SettingsSection>

          <SettingsSection title="Invite staff">
            <TextInput
              label="Staff email"
              value={email}
              onChangeText={setEmail}
              mode="outlined"
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
              textColor={palette.text}
            />
            <Button
              mode="contained"
              onPress={inviteStaff}
              disabled={!email.trim()}
              buttonColor={palette.primary}
              textColor="#0F172A"
            >
              Send invite
            </Button>
            {msg ? <Text style={styles.msg}>{msg}</Text> : null}
          </SettingsSection>

          <Button mode="outlined" onPress={signOut} textColor={palette.error} style={styles.signOut}>
            Sign out
          </Button>
        </View>
      </ScrollView>

      <ZomatoConnectModal
        visible={connectOpen}
        kitchenId={kitchenId}
        onClose={() => setConnectOpen(false)}
        onConnected={() => {
          setMsg('Zomato partner connected');
          loadZomatoStatus();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  profileHeader: {
    backgroundColor: palette.surface,
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  profileHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  backBtn: { margin: 0, marginLeft: -8 },
  backSpacer: { width: 40 },
  profileTitle: { flex: 1, textAlign: 'center', color: palette.text, fontWeight: '800' },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  avatarFallback: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  avatarLabel: { color: palette.primary, fontWeight: '800', fontSize: 26 },
  profileText: { flex: 1, minWidth: 0 },
  userName: { color: palette.text, fontWeight: '800' },
  userEmail: { color: palette.textMuted, marginTop: 4 },
  userKitchen: { color: palette.primary, marginTop: 6, fontWeight: '600' },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  statPill: {
    flex: 1,
    backgroundColor: palette.surfaceElevated,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  statValue: { color: palette.primary, fontWeight: '800', fontSize: 16 },
  statLabel: { color: palette.textMuted, fontSize: 11, marginTop: 2 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  rowLabel: { color: palette.textMuted, fontSize: 14 },
  rowValue: { color: palette.text, fontWeight: '600', fontSize: 14, flexShrink: 1, textAlign: 'right' },
  meta: { color: palette.textMuted, fontSize: 13 },
  hint: { color: palette.textMuted, fontSize: 13, lineHeight: 18 },
  err: { color: palette.error, fontSize: 13 },
  ok: { color: palette.success, fontSize: 13 },
  input: { backgroundColor: palette.surface },
  btn: { marginTop: 4 },
  msg: { color: palette.success, marginTop: 4, fontSize: 13 },
  signOut: { marginTop: 8, borderColor: palette.error },
});
