import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, Button, ActivityIndicator, Icon, Surface } from 'react-native-paper';
import { Entitlements } from '../../types';

type Props = {
  entitlements: Entitlements | null;
  planLabel: string;
  loading?: boolean;
  loadError?: string | null;
  busy?: boolean;
  busyPlanKey?: string | null;
  onOpenUpgrade: () => void;
  onSyncPayment: () => void;
  onRetry?: () => void;
};

function scanUsage(ent: Entitlements | null) {
  if (!ent || ent.is_pro || ent.bill_scan_limit < 0) return null;
  const limit = Math.max(1, ent.bill_scan_limit);
  const used = Math.min(ent.bill_scans_used, limit);
  const pct = Math.round((used / limit) * 100);
  return { used, limit, pct, remaining: ent.bill_scans_remaining };
}

export function ProfilePlanSettingsSection({
  entitlements,
  planLabel,
  loading,
  loadError,
  busy,
  busyPlanKey,
  onOpenUpgrade,
  onSyncPayment,
  onRetry,
}: Props) {
  if (loading && !entitlements) {
    return (
      <Surface style={styles.card} elevation={1}>
        <ActivityIndicator size="small" color="#2E7D32" />
        <Text style={styles.muted}>Loading plan…</Text>
      </Surface>
    );
  }

  if (!entitlements && loadError) {
    return (
      <Surface style={styles.card} elevation={1}>
        <Text style={styles.title}>Plan & billing</Text>
        <Text style={styles.muted}>{loadError}</Text>
        {onRetry ? (
          <Button mode="outlined" onPress={onRetry} style={{ marginTop: 8 }}>
            Retry
          </Button>
        ) : null}
      </Surface>
    );
  }

  const scan = scanUsage(entitlements);
  const isPro = Boolean(entitlements?.is_pro);
  const isElite = Boolean(entitlements?.is_elite);
  const tierColor = isElite ? '#1B5E20' : isPro ? '#2E7D32' : '#388E3C';
  const tierIcon = isElite ? 'crown' : isPro ? 'star' : 'account';

  return (
    <Surface style={styles.card} elevation={1}>
      <Text style={styles.title}>Plan & billing</Text>

      <View style={styles.planRow}>
        <View style={[styles.planIcon, { backgroundColor: `${tierColor}18` }]}>
          <Icon source={tierIcon} size={22} color={tierColor} />
        </View>
        <View style={styles.planInfo}>
          <Text style={styles.planName}>{planLabel}</Text>
          {entitlements?.plan_expires_at ? (
            <Text style={styles.muted}>
              Renews {new Date(entitlements.plan_expires_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          ) : !isPro ? (
            <Text style={styles.muted}>Upgrade for unlimited bill scans</Text>
          ) : null}
        </View>
      </View>

      {scan ? (
        <View style={styles.usageBlock}>
          <View style={styles.usageHead}>
            <Text style={styles.usageLabel}>Bill scans today</Text>
            <Text style={styles.usageVal}>
              {scan.used} / {scan.limit}
            </Text>
          </View>
          <View style={styles.usageTrack}>
            <View
              style={[
                styles.usageFill,
                {
                  width: `${Math.min(100, scan.pct)}%`,
                  backgroundColor: scan.pct >= 100 ? '#F44336' : scan.pct >= 90 ? '#FF9800' : '#388E3C',
                },
              ]}
            />
          </View>
          <Text style={styles.usageHint}>{scan.remaining} remaining today</Text>
        </View>
      ) : isPro ? (
        <View style={styles.unlimitedRow}>
          <Icon source="infinity" size={18} color="#388E3C" />
          <Text style={styles.unlimitedText}>Unlimited bill scans</Text>
        </View>
      ) : null}

      {!isElite ? (
        <Button mode="contained" onPress={onOpenUpgrade} style={styles.primaryBtn} buttonColor={tierColor}>
          {isPro ? 'Upgrade to Elite' : 'View plans'}
        </Button>
      ) : null}

      <Pressable onPress={onSyncPayment} disabled={busy} style={styles.syncRow}>
        {busyPlanKey === 'sync' ? (
          <ActivityIndicator size="small" color="#388E3C" />
        ) : (
          <Text style={styles.syncText}>Already paid? Activate your plan</Text>
        )}
      </Pressable>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  title: { fontWeight: '700', color: '#333', marginBottom: 14 },
  muted: { color: '#888', fontSize: 13, marginTop: 4 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  planIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planInfo: { flex: 1 },
  planName: { fontSize: 16, fontWeight: '700', color: '#333' },
  usageBlock: { marginBottom: 14 },
  usageHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  usageLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  usageVal: { fontSize: 13, color: '#333', fontWeight: '700' },
  usageTrack: {
    height: 6,
    backgroundColor: '#EEEEEE',
    borderRadius: 3,
    overflow: 'hidden',
  },
  usageFill: { height: '100%', borderRadius: 3 },
  usageHint: { fontSize: 11, color: '#999', marginTop: 4 },
  unlimitedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  unlimitedText: { color: '#2E7D32', fontWeight: '600', fontSize: 13 },
  primaryBtn: { borderRadius: 12, marginBottom: 8 },
  syncRow: { alignItems: 'center', paddingVertical: 8 },
  syncText: { color: '#388E3C', fontSize: 13, fontWeight: '600' },
});
