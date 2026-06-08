import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Avatar, Button, IconButton, Surface, Text, TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { closeProfile } from '../navigation/rootNavigation';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import ZomatoConnectModal from '../components/ZomatoConnectModal';
import { OutletSetupForm } from '../components/outlet/OutletSetupForm';
import { SettingsSection } from '../components/settings/SettingsSection';
import { restaurantFetch } from '../services/api';
import {
  integrationWorkers,
  OutletIntegrationsStatus,
  OutletMember,
  PartnerWorkerStatus,
  workerLabel,
  workerStoreId,
} from '../types';
import { palette } from '../theme';

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
  const { outlet, outlets, switchKitchen } = useRestaurant();
  const outletId = outlet?.outlet_id ?? outlet?.kitchen_id ?? '';
  const canManageTeam = outlet?.role === 'owner' || outlet?.role === 'manager';
  const [outletName, setOutletName] = useState('');
  const [outletShareId, setOutletShareId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [teamMembers, setTeamMembers] = useState<OutletMember[]>([]);
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamMsg, setTeamMsg] = useState('');
  const [outletMsg, setOutletMsg] = useState('');
  const [plan, setPlan] = useState('starter');
  const [zomatoMsg, setZomatoMsg] = useState('');
  const [zomatoStoreName, setZomatoStoreName] = useState('');
  const [zomatoStoreId, setZomatoStoreId] = useState('');
  const [integrations, setIntegrations] = useState<OutletIntegrationsStatus | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [zomatoBusy, setZomatoBusy] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const lastPollMsgRef = useRef('');

  const applyPollFeedback = useCallback((st: OutletIntegrationsStatus, notify: boolean) => {
    const running = integrationWorkers(st).find((o) => o.status === 'running');
    const line = running?.last_sync_message || running?.last_error || '';
    if (!line) return;
    if (notify && line !== lastPollMsgRef.current) {
      lastPollMsgRef.current = line;
      setZomatoMsg(line);
    }
  }, []);

  const loadZomatoStatus = useCallback(async (notify = false) => {
    if (!outletId) return;
    try {
      const st = await restaurantFetch<OutletIntegrationsStatus>(
        `/restaurant/${outletId}/integrations/zomato/status`,
      );
      setIntegrations(st);
      const workers = integrationWorkers(st);
      setSelectedWorkerId((prev) => {
        if (prev && workers.some((o) => workerStoreId(o) === prev)) return prev;
        return workers[0] ? workerStoreId(workers[0]) : prev;
      });
      applyPollFeedback(st, notify);
    } catch {
      setIntegrations(null);
    }
  }, [outletId, applyPollFeedback]);

  const loadTeamMembers = useCallback(async () => {
    if (!outletId || !canManageTeam) return;
    try {
      const list = await restaurantFetch<OutletMember[]>(`/restaurant/${outletId}/members`);
      setTeamMembers(list ?? []);
    } catch {
      setTeamMembers([]);
    }
  }, [outletId, canManageTeam]);

  useEffect(() => {
    if (!outletId) return;
    restaurantFetch<{ name?: string; outlet_id?: string; invite_code?: string }>(`/restaurant/${outletId}`)
      .then((k) => {
        setOutletName(k?.name?.trim() || 'Your outlet');
        setOutletShareId(k?.outlet_id?.trim() || outletId);
        setInviteCode(k?.invite_code?.trim() || '');
      })
      .catch(() => {
        setOutletName('Your outlet');
        setOutletShareId(outletId);
      });
    restaurantFetch<{ plan_tier: string }>(`/restaurant/${outletId}/billing/plan`)
      .then((p) => setPlan(p.plan_tier))
      .catch(() => {});
    loadZomatoStatus();
    void loadTeamMembers();
  }, [outletId, loadZomatoStatus, loadTeamMembers]);

  useEffect(() => {
    const running = integrationWorkers(integrations).some((o) => o.status === 'running');
    if (!outletId || !running) return;
    const pollMs = (integrations?.poll_interval_minutes ?? 5) * 60 * 1000;
    const id = setInterval(() => {
      void loadZomatoStatus(true);
    }, pollMs);
    return () => clearInterval(id);
  }, [outletId, integrations, loadZomatoStatus]);

  const selectWorker = (worker: PartnerWorkerStatus) => {
    const id = workerStoreId(worker);
    setSelectedWorkerId(id);
    setZomatoStoreId(id);
    setZomatoStoreName(worker.partner_outlet_name ?? worker.partner_store_name ?? worker.outlet_name ?? '');
  };

  const startZomatoWorker = async (partnerStoreId: string, partnerStoreName: string) => {
    const id = partnerStoreId.trim();
    if (!id) return;
    setZomatoBusy(true);
    setZomatoMsg('');
    try {
      const st = await restaurantFetch<OutletIntegrationsStatus>(
        `/restaurant/${outletId}/integrations/zomato/start`,
        {
          method: 'POST',
          body: JSON.stringify({
            partner: 'zomato',
            partner_outlet_id: id,
            partner_outlet_name: partnerStoreName.trim(),
          }),
        },
      );
      setIntegrations(st);
      setSelectedWorkerId(id);
      setZomatoMsg(`Worker started (store ${id})`);
      lastPollMsgRef.current = '';
      setTimeout(() => void loadZomatoStatus(true), ZOMATO_FIRST_POLL_MS);
    } catch (e) {
      setZomatoMsg(e instanceof Error ? e.message : 'Failed to start worker');
      loadZomatoStatus();
    } finally {
      setZomatoBusy(false);
    }
  };

  const stopZomatoWorker = async (partnerStoreId: string) => {
    const id = partnerStoreId.trim();
    if (!id) return;
    setZomatoBusy(true);
    try {
      const st = await restaurantFetch<OutletIntegrationsStatus>(
        `/restaurant/${outletId}/integrations/zomato/stop`,
        {
          method: 'POST',
          body: JSON.stringify({ partner_outlet_id: id }),
        },
      );
      setIntegrations(st);
      setZomatoMsg('Worker stopped');
    } catch (e) {
      setZomatoMsg(e instanceof Error ? e.message : 'Stop failed');
    } finally {
      setZomatoBusy(false);
    }
  };

  const workers = integrationWorkers(integrations);
  const runningCount = workers.filter((o) => o.status === 'running').length;
  const totalImported = workers.reduce((sum, o) => sum + (o.orders_imported_count ?? 0), 0);
  const needsSession = !integrations?.session_saved;
  const trimmedStoreId = zomatoStoreId.trim();
  const canStartNew = trimmedStoreId.length > 0 && !needsSession;
  const selectedWorker = workers.find((o) => workerStoreId(o) === selectedWorkerId);
  const avatarLabel = user?.name?.charAt(0).toUpperCase() || 'P';

  const inviteStaff = async () => {
    const addr = staffEmail.trim().toLowerCase();
    if (!addr) return;
    setTeamBusy(true);
    setTeamMsg('');
    try {
      const res = await restaurantFetch<{ pending?: boolean; email?: string }>(
        `/restaurant/${outletId}/members`,
        {
          method: 'POST',
          body: JSON.stringify({ email: addr, role: 'staff' }),
        },
      );
      setStaffEmail('');
      setTeamMsg(
        res.pending
          ? `Invite sent to ${addr} — they can sign in with that Google account to access this outlet`
          : `${addr} added — they can switch to this outlet in Profile`,
      );
      await loadTeamMembers();
    } catch (e) {
      setTeamMsg(e instanceof Error ? e.message : 'Invite failed');
    } finally {
      setTeamBusy(false);
    }
  };

  const removeStaffMember = async (member: OutletMember) => {
    if (member.pending) {
      const email = member.email?.trim().toLowerCase();
      if (!email) return;
      setTeamBusy(true);
      setTeamMsg('');
      try {
        await restaurantFetch(`/restaurant/${outletId}/members/invite`, {
          method: 'DELETE',
          body: JSON.stringify({ email }),
        });
        setTeamMsg(`Invite cancelled for ${email}`);
        await loadTeamMembers();
      } catch (e) {
        setTeamMsg(e instanceof Error ? e.message : 'Remove failed');
      } finally {
        setTeamBusy(false);
      }
      return;
    }
    const memberId = member.user_id?.trim();
    if (!memberId || member.role === 'owner') return;
    setTeamBusy(true);
    setTeamMsg('');
    try {
      await restaurantFetch(`/restaurant/${outletId}/members/${memberId}`, { method: 'DELETE' });
      setTeamMsg(`${member.name?.trim() || member.email || 'Staff member'} removed — they can no longer access this outlet until re-invited`);
      await loadTeamMembers();
    } catch (e) {
      setTeamMsg(e instanceof Error ? e.message : 'Remove failed');
    } finally {
      setTeamBusy(false);
    }
  };

  const canRemoveMember = (member: OutletMember) => {
    if (!canManageTeam) return false;
    if (member.pending) return Boolean(member.email?.trim());
    if (member.role === 'owner') return false;
    if (member.user_id && user?.user_id && member.user_id === user.user_id) return false;
    return Boolean(member.user_id?.trim());
  };

  const handleSwitchOutlet = async (id: string) => {
    await switchKitchen(id);
    setTeamMsg('');
  };

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
                {outletName}
                {outlet?.role ? ` · ${outlet.role}` : ''}
              </Text>
            </View>
          </View>
          <View style={styles.statRow}>
            <StatPill label="Plan" value={plan} />
            <StatPill label="Imported" value={totalImported} />
            <StatPill label="Workers" value={runningCount > 0 ? `${runningCount} live` : workers.length ? 'Idle' : '—'} />
          </View>
        </View>

        <View style={styles.content}>
          <SettingsSection title="Switch outlet">
            <Text style={styles.hint}>
              Menu, stock, and orders follow the active outlet. Switch between your locations or add another below.
            </Text>
            {outlets.length === 0 ? (
              <MetaLine>No outlets linked to your account yet.</MetaLine>
            ) : (
              outlets.map((o) => {
                const id = o.outlet_id || o.kitchen_id;
                const active = id === outletId;
                return (
                  <Pressable
                    key={id}
                    onPress={() => void handleSwitchOutlet(id)}
                    style={[styles.outletRow, active && styles.outletRowSelected]}
                  >
                    <View style={styles.outletRowText}>
                      <Text style={styles.outletTitle}>{o.name?.trim() || 'Outlet'}</Text>
                      <Text style={styles.meta}>
                        {o.role}
                        {active ? ' · active' : ''}
                      </Text>
                    </View>
                    {active ? (
                      <Text style={styles.ok}>Active</Text>
                    ) : (
                      <Button mode="outlined" compact onPress={() => void handleSwitchOutlet(id)}>
                        Switch
                      </Button>
                    )}
                  </Pressable>
                );
              })
            )}
          </SettingsSection>

          <SettingsSection title="Add outlet">
            <Text style={styles.hint}>
              Create a new location or join another outlet with an outlet ID or invite code from the owner.
            </Text>
            <OutletSetupForm
              onSuccess={(name) => {
                setOutletMsg(name ? `Switched to ${name}` : 'Outlet added — you are now working in it');
                setTeamMsg('');
              }}
            />
            {outletMsg ? <Text style={styles.msg}>{outletMsg}</Text> : null}
          </SettingsSection>

          {canManageTeam ? (
            <SettingsSection title="Team · this outlet">
              <Text style={styles.hint}>
                Share the outlet ID or invite code so staff can join. Or add their email — they sign in with Google
                using that address.
              </Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Outlet ID</Text>
                <Text style={styles.rowValue} selectable>
                  {outletShareId || outletId}
                </Text>
              </View>
              {inviteCode ? (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Invite code</Text>
                  <Text style={styles.rowValue} selectable>
                    {inviteCode}
                  </Text>
                </View>
              ) : null}
              {teamMembers.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>Members</Text>
                  {teamMembers.map((m) => (
                    <View key={`${m.email ?? m.user_id}-${m.pending ? 'pending' : 'active'}`} style={styles.memberRow}>
                      <View style={styles.outletRowText}>
                        <Text style={styles.outletTitle}>{m.name?.trim() || m.email || 'Member'}</Text>
                        <Text style={styles.meta}>
                          {m.role}
                          {m.pending ? ' · invite pending' : ''}
                          {m.email && m.name ? ` · ${m.email}` : ''}
                        </Text>
                      </View>
                      {canRemoveMember(m) ? (
                        <Button
                          mode="text"
                          compact
                          onPress={() => void removeStaffMember(m)}
                          disabled={teamBusy}
                          textColor={palette.error}
                        >
                          {m.pending ? 'Cancel' : 'Remove'}
                        </Button>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : (
                <MetaLine>No team members yet.</MetaLine>
              )}
              <TextInput
                label="Staff email"
                value={staffEmail}
                onChangeText={setStaffEmail}
                mode="outlined"
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
                textColor={palette.text}
              />
              <Button
                mode="contained"
                onPress={inviteStaff}
                loading={teamBusy}
                disabled={!staffEmail.trim() || teamBusy}
                buttonColor={palette.primary}
                textColor="#0F172A"
              >
                Add staff
              </Button>
              {teamMsg ? <Text style={styles.msg}>{teamMsg}</Text> : null}
            </SettingsSection>
          ) : null}

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
              <Text style={styles.rowLabel}>Outlet</Text>
              <Text style={styles.rowValue}>{outletName}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Role</Text>
              <Text style={styles.rowValue}>{outlet?.role ?? '—'}</Text>
            </View>
          </SettingsSection>

          <SettingsSection title="Partners">
            <Text style={styles.hint}>
              Each partner (Zomato, Swiggy, …) has one background worker per outlet. Start or stop workers to pull
              orders into this outlet&apos;s menu and stock.
            </Text>
            {integrations?.session_saved ? <MetaLine>Partner session saved</MetaLine> : null}
            {needsSession ? (
              <Text style={styles.hint}>Connect a partner account before starting a worker (Zomato supported today).</Text>
            ) : null}

            {workers.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>Workers</Text>
                {workers.map((worker) => {
                  const storeId = workerStoreId(worker);
                  const running = worker.status === 'running';
                  const selected = storeId === selectedWorkerId;
                  return (
                    <Pressable
                      key={storeId}
                      onPress={() => selectWorker(worker)}
                      style={[styles.outletRow, selected && styles.outletRowSelected]}
                    >
                      <View style={styles.outletRowText}>
                        <Text style={styles.outletTitle}>{workerLabel(worker)}</Text>
                        <Text style={running ? styles.ok : styles.meta}>
                          {running ? 'Running' : worker.status}
                          {worker.orders_imported_count ? ` · ${worker.orders_imported_count} imported` : ''}
                        </Text>
                        {worker.last_sync_message ? (
                          <Text style={worker.last_sync_ok ? styles.ok : styles.err} numberOfLines={2}>
                            {worker.last_sync_message}
                          </Text>
                        ) : worker.last_error ? (
                          <Text style={styles.err} numberOfLines={2}>
                            {worker.last_error}
                          </Text>
                        ) : null}
                      </View>
                      {running ? (
                        <Button
                          mode="outlined"
                          compact
                          onPress={() => void stopZomatoWorker(storeId)}
                          loading={zomatoBusy}
                          textColor={palette.error}
                        >
                          Stop
                        </Button>
                      ) : (
                        <Button
                          mode="contained"
                          compact
                          onPress={() =>
                            void startZomatoWorker(
                              storeId,
                              worker.partner_store_name ?? worker.outlet_name ?? '',
                            )
                          }
                          loading={zomatoBusy}
                          disabled={needsSession}
                          buttonColor={palette.primary}
                          textColor="#0F172A"
                        >
                          Start
                        </Button>
                      )}
                    </Pressable>
                  );
                })}
              </>
            ) : (
              <MetaLine>No partner workers yet — add one below.</MetaLine>
            )}

            <Text style={styles.sectionLabel}>Add worker</Text>
            <TextInput
              label="Store name"
              value={zomatoStoreName}
              onChangeText={setZomatoStoreName}
              mode="outlined"
              placeholder="Choudhary Hotel"
              style={styles.input}
              textColor={palette.text}
            />
            <TextInput
              label="Partner store ID"
              value={zomatoStoreId}
              onChangeText={setZomatoStoreId}
              mode="outlined"
              placeholder="e.g. Zomato res_id 22267610"
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
              {needsSession ? 'Connect partner account' : 'Reconnect partner session'}
            </Button>
            <Button
              mode="contained"
              onPress={() => void startZomatoWorker(trimmedStoreId, zomatoStoreName)}
              loading={zomatoBusy}
              disabled={
                !canStartNew ||
                (selectedWorker?.status === 'running' && workerStoreId(selectedWorker) === trimmedStoreId)
              }
              buttonColor={palette.primary}
              textColor="#0F172A"
              style={styles.btn}
            >
              {selectedWorker?.status === 'running' && workerStoreId(selectedWorker) === trimmedStoreId
                ? 'Worker already running'
                : 'Start worker'}
            </Button>
            {selectedWorker &&
            selectedWorker.status === 'running' &&
            workerStoreId(selectedWorker) === trimmedStoreId ? (
              <Button
                mode="outlined"
                onPress={() => void stopZomatoWorker(trimmedStoreId)}
                loading={zomatoBusy}
                textColor={palette.error}
                style={styles.btn}
              >
                Stop worker
              </Button>
            ) : null}
            {zomatoMsg ? <Text style={styles.msg}>{zomatoMsg}</Text> : null}
          </SettingsSection>

          <Button mode="outlined" onPress={signOut} textColor={palette.error} style={styles.signOut}>
            Sign out
          </Button>
        </View>
      </ScrollView>

      <ZomatoConnectModal
        visible={connectOpen}
        kitchenId={outletId}
        onClose={() => setConnectOpen(false)}
        onConnected={() => {
          setZomatoMsg('Partner connected');
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
  sectionLabel: { color: palette.text, fontWeight: '700', fontSize: 14, marginTop: 8, marginBottom: 6 },
  outletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 8,
    backgroundColor: palette.surfaceElevated,
  },
  outletRowSelected: { borderColor: palette.primary },
  outletRowText: { flex: 1, minWidth: 0 },
  outletTitle: { color: palette.text, fontWeight: '700', fontSize: 14 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 8,
    backgroundColor: palette.surfaceElevated,
  },
  signOut: { marginTop: 8, borderColor: palette.error },
});
