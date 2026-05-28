import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  View,
  Pressable,
  Platform,
} from 'react-native';
import { Text, ActivityIndicator, Icon, IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntitlements } from '../context/EntitlementsContext';
import { usePlanUpgrade, planCheckoutKey } from '../hooks/usePlanUpgrade';
import { PlanProduct } from '../types';
import type { UpgradePaywallOptions } from '../context/UpgradePaywallContext';

type PaywallTier = 'pro' | 'elite';
type BillingInterval = 'monthly' | 'yearly';

type FeatureValue = boolean | string;

type ComparisonRow = {
  label: string;
  free: FeatureValue;
  pro: FeatureValue;
  elite: FeatureValue;
};

const COMPARISON: ComparisonRow[] = [
  { label: 'Daily meal ideas', free: true, pro: true, elite: true },
  { label: 'Rescue (use expiring food)', free: false, pro: true, elite: true },
  { label: 'Meal of the Day', free: false, pro: true, elite: true },
  { label: 'Healthy & Tasty modes', free: false, pro: true, elite: true },
  { label: 'Meal Prep mode', free: false, pro: true, elite: true },
  { label: 'Bill scans', free: '2 / day', pro: 'Unlimited', elite: 'Unlimited' },
  { label: 'Nightly diet email', free: false, pro: false, elite: true },
  { label: 'AI nutrition insights', free: false, pro: false, elite: true },
];

const TIER_LABELS: Record<PaywallTier, string> = {
  pro: 'Pro',
  elite: 'Elite',
};

function paywallHeadline(options: UpgradePaywallOptions): string {
  if (options.source === 'bill_scan') return 'Upgrade for unlimited scans';
  if (options.source === 'diet_analysis') return 'Unlock diet analysis';
  if (options.mealCategoryId || options.source === 'locked_meal') return 'Unlock your full kitchen';
  return 'Choose your plan';
}

function paywallDefaults(
  options: UpgradePaywallOptions,
  elitePurchasable: boolean,
): { tier: PaywallTier; interval: BillingInterval } {
  if (options.preferredTier) {
    const tier: PaywallTier =
      options.preferredTier === 'elite' && elitePurchasable
        ? 'elite'
        : options.preferredTier === 'pro'
          ? 'pro'
          : elitePurchasable
            ? 'elite'
            : 'pro';
    return {
      tier,
      interval: options.preferredInterval ?? 'monthly',
    };
  }
  if (options.source === 'diet_analysis') {
    return { tier: elitePurchasable ? 'elite' : 'pro', interval: 'monthly' };
  }
  if (options.source === 'locked_meal' || options.mealCategoryId) {
    return { tier: 'pro', interval: 'monthly' };
  }
  return { tier: elitePurchasable ? 'elite' : 'pro', interval: 'yearly' };
}

function formatPrice(plan: PlanProduct): { amount: string; suffix: string } {
  const label = plan.price_label.trim();
  const amount = label.replace(/\/month/i, '').replace(/\/year/i, '').trim();
  const suffix = plan.interval === 'yearly' ? '/ year' : '/ month';
  return { amount, suffix };
}

function FeatureCell({
  value,
  highlight,
  muted,
}: {
  value: FeatureValue;
  highlight?: boolean;
  muted?: boolean;
}) {
  if (value === true) {
    return (
      <View style={[styles.cell, highlight && styles.cellHighlight, muted && styles.cellMuted]}>
        <Icon source="check-circle" size={18} color={muted ? '#6b7a6e' : '#66BB6A'} />
      </View>
    );
  }
  if (value === false) {
    return (
      <View style={[styles.cell, highlight && styles.cellHighlight, muted && styles.cellMuted]}>
        <Icon source="close-circle-outline" size={18} color="#5c6370" />
      </View>
    );
  }
  return (
    <View style={[styles.cell, highlight && styles.cellHighlight, muted && styles.cellMuted]}>
      <Text style={[styles.cellText, muted && styles.cellTextMuted]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function IntervalToggle({
  value,
  onChange,
  yearlySavings,
}: {
  value: BillingInterval;
  onChange: (v: BillingInterval) => void;
  yearlySavings?: string | null;
}) {
  const options: { id: BillingInterval; label: string; hint?: string }[] = [
    { id: 'monthly', label: 'Monthly' },
    { id: 'yearly', label: 'Yearly', hint: yearlySavings ?? 'Best value' },
  ];
  return (
    <View style={styles.intervalRow}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={[styles.intervalPill, active && styles.intervalPillActive]}
          >
            <View style={styles.intervalPillInner}>
              {active ? <Icon source="check-circle" size={16} color="#7CB9FF" /> : null}
              <Text style={[styles.intervalText, active && styles.intervalTextActive]}>{opt.label}</Text>
            </View>
            {opt.hint && active ? (
              <Text style={styles.intervalHint}>{opt.hint}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function PlanPickCard({
  tier,
  plan,
  selected,
  disabled,
  onSelect,
}: {
  tier: PaywallTier;
  plan?: PlanProduct;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const isElite = tier === 'elite';
  const accent = isElite ? '#CE93D8' : '#81C784';
  const borderColor = selected ? accent : '#2a3140';

  if (!plan && disabled) {
    return (
      <View style={[styles.planCard, { borderColor: '#2a3140', opacity: 0.55 }]}>
        <Text style={[styles.planName, { color: '#888' }]}>Elite</Text>
        <Text style={styles.planComingSoon}>Coming soon</Text>
      </View>
    );
  }
  if (!plan) return null;

  const { amount, suffix } = formatPrice(plan);

  return (
    <Pressable
      onPress={onSelect}
      disabled={disabled}
      style={({ pressed }) => [
        styles.planCard,
        { borderColor, borderWidth: selected ? 2 : 1 },
        selected && isElite && styles.planCardEliteGlow,
        selected && !isElite && styles.planCardProGlow,
        pressed && { opacity: 0.9 },
      ]}
    >
      {selected ? (
        <View style={[styles.planCheck, { backgroundColor: accent }]}>
          <Icon source="check" size={14} color="#0f1218" />
        </View>
      ) : null}
      {isElite ? (
        <View style={styles.recommendedRibbon}>
          <Text style={styles.recommendedText}>Recommended</Text>
        </View>
      ) : null}
      <Text style={[styles.planName, isElite && styles.planNameElite]}>{TIER_LABELS[tier]}</Text>
      <Text style={styles.planPrice}>{amount}</Text>
      <Text style={styles.planSuffix}>{suffix}</Text>
    </Pressable>
  );
}

export function UpgradePaywallModal({
  visible,
  options,
  onClose,
}: {
  visible: boolean;
  options: UpgradePaywallOptions;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { entitlements, loading, refresh } = useEntitlements();
  const { subscribe, syncLastPayment, busy, busyPlanKey } = usePlanUpgrade();

  const purchasable = useMemo(
    () => (entitlements?.available_plans ?? []).filter((p) => p.available_for_purchase),
    [entitlements],
  );

  const elitePurchasable = purchasable.some((p) => p.tier === 'elite');
  const onFreePlan = !entitlements?.is_pro;

  const [selectedTier, setSelectedTier] = useState<PaywallTier>('elite');
  const [interval, setInterval] = useState<BillingInterval>('yearly');

  useEffect(() => {
    if (!visible) return;
    const { tier, interval: iv } = paywallDefaults(options, elitePurchasable);
    setSelectedTier(tier);
    setInterval(iv);
  }, [visible, elitePurchasable, options]);

  useEffect(() => {
    if (visible && entitlements?.is_elite) {
      onClose();
    }
  }, [visible, entitlements?.is_elite, onClose]);

  const planFor = (tier: PaywallTier, iv: BillingInterval) =>
    purchasable.find((p) => p.tier === tier && p.interval === iv);

  const proPlan = planFor('pro', interval);
  const elitePlan = planFor('elite', interval);

  const activePlan = selectedTier === 'elite' ? elitePlan : proPlan;

  const yearlySavings = useMemo(() => {
    const pm = purchasable.find((p) => p.tier === 'pro' && p.interval === 'monthly');
    const py = purchasable.find((p) => p.tier === 'pro' && p.interval === 'yearly');
    if (!pm || !py || pm.amount_paise <= 0) return null;
    const fullYear = pm.amount_paise * 12;
    if (fullYear <= py.amount_paise) return null;
    const pct = Math.round(((fullYear - py.amount_paise) / fullYear) * 100);
    return pct > 0 ? `Save ~${pct}%` : null;
  }, [purchasable]);

  const handleContinue = async () => {
    if (!activePlan) return;
    await subscribe(activePlan.tier, activePlan.interval);
    await refresh();
    onClose();
  };

  const ctaLabel = activePlan
    ? `Continue with ${TIER_LABELS[selectedTier]}`
    : 'Choose a plan';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>{paywallHeadline(options)}</Text>
          <IconButton icon="close" size={22} iconColor="#b0b8c4" onPress={onClose} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {loading && !entitlements ? (
            <ActivityIndicator color="#81C784" style={{ marginTop: 48 }} />
          ) : (
            <>
              <View style={styles.compareCard}>
                <View style={styles.compareHeader}>
                  <View style={styles.featureColHead}>
                    <Text style={styles.colHeadMuted}>Features</Text>
                  </View>
                  <View style={styles.tierColHead}>
                    <Text style={[styles.tierHead, styles.tierHeadFree]}>Free</Text>
                    {onFreePlan ? <Text style={styles.currentPlanTag}>Current</Text> : null}
                  </View>
                  <Pressable
                    style={[styles.tierColHead, selectedTier === 'pro' && styles.tierColHeadActive]}
                    onPress={() => setSelectedTier('pro')}
                  >
                    <Text style={[styles.tierHead, selectedTier === 'pro' && styles.tierHeadActive]}>Pro</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.tierColHead, selectedTier === 'elite' && styles.tierColHeadActiveElite]}
                    onPress={() => elitePurchasable && setSelectedTier('elite')}
                  >
                    <Text style={[styles.tierHead, selectedTier === 'elite' && styles.tierHeadActiveElite]}>Elite</Text>
                  </Pressable>
                </View>

                {COMPARISON.map((row) => (
                  <View key={row.label} style={styles.compareRow}>
                    <View style={styles.featureLabelWrap}>
                      <Text style={styles.featureLabel}>{row.label}</Text>
                    </View>
                    <FeatureCell value={row.free} muted />
                    <FeatureCell value={row.pro} highlight={selectedTier === 'pro'} />
                    <FeatureCell value={row.elite} highlight={selectedTier === 'elite'} />
                  </View>
                ))}
              </View>

              <IntervalToggle value={interval} onChange={setInterval} yearlySavings={yearlySavings} />

              <View style={styles.planRow}>
                <PlanPickCard
                  tier="pro"
                  plan={proPlan}
                  selected={selectedTier === 'pro'}
                  onSelect={() => setSelectedTier('pro')}
                />
                <PlanPickCard
                  tier="elite"
                  plan={elitePlan}
                  selected={selectedTier === 'elite'}
                  disabled={!elitePurchasable}
                  onSelect={() => elitePurchasable && setSelectedTier('elite')}
                />
              </View>

              <Pressable onPress={() => void syncLastPayment()} disabled={busy} style={styles.syncRow}>
                {busyPlanKey === 'sync' ? (
                  <ActivityIndicator size="small" color="#7CB9FF" />
                ) : (
                  <Text style={styles.syncText}>Already paid? Activate your plan</Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            onPress={() => void handleContinue()}
            disabled={busy || !activePlan}
            style={({ pressed }) => [
              styles.cta,
              selectedTier === 'elite' ? styles.ctaElite : styles.ctaPro,
              (busy || !activePlan) && styles.ctaDisabled,
              pressed && { opacity: 0.92 },
            ]}
          >
            {busy && activePlan && busyPlanKey === planCheckoutKey(activePlan.tier, activePlan.interval) ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.ctaInner}>
                <Text style={styles.ctaText}>{ctaLabel}</Text>
                <Icon source="chevron-right" size={22} color="#fff" />
              </View>
            )}
          </Pressable>
          <Pressable onPress={onClose} style={styles.laterWrap}>
            <Text style={styles.laterText}>Maybe later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const COL_FEATURE = 1.35;
const COL_TIER = 0.55;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1218' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  topTitle: { flex: 1, color: '#eef1f5', fontSize: 17, fontWeight: '700', marginLeft: 8 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  compareCard: {
    backgroundColor: '#181d27',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252b38',
    overflow: 'hidden',
    marginBottom: 20,
  },
  compareHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#252b38',
    backgroundColor: '#1c222d',
  },
  featureColHead: { flex: COL_FEATURE, paddingVertical: 12, paddingLeft: 14 },
  colHeadMuted: { color: '#6b7380', fontSize: 12, fontWeight: '600' },
  tierColHead: {
    flex: COL_TIER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  tierColHeadActive: { backgroundColor: 'rgba(129, 199, 132, 0.12)' },
  tierColHeadActiveElite: { backgroundColor: 'rgba(206, 147, 216, 0.15)' },
  tierHead: { color: '#8b939f', fontSize: 13, fontWeight: '700' },
  tierHeadFree: { color: '#9aa3b0' },
  tierHeadActive: { color: '#A5D6A7' },
  tierHeadActiveElite: { color: '#E1BEE7' },
  currentPlanTag: { color: '#6b7380', fontSize: 9, fontWeight: '600', marginTop: 2 },

  compareRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#252b38',
    minHeight: 48,
  },
  featureLabelWrap: {
    flex: COL_FEATURE,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 6,
  },
  featureLabel: { color: '#c8cdd4', fontSize: 12, lineHeight: 17 },
  cell: {
    flex: COL_TIER,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  cellHighlight: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cellMuted: {
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  cellText: { color: '#e8eaed', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  cellTextMuted: { color: '#8b939f' },

  intervalRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  intervalPill: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a3140',
    backgroundColor: '#181d27',
    alignItems: 'center',
  },
  intervalPillActive: {
    borderColor: '#4a7bb7',
    backgroundColor: '#1a2740',
  },
  intervalPillInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  intervalText: { color: '#8b939f', fontSize: 14, fontWeight: '600' },
  intervalTextActive: { color: '#e8f0ff', fontWeight: '700' },
  intervalHint: { color: '#7CB9FF', fontSize: 11, marginTop: 4, fontWeight: '600' },

  planRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  planCard: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    paddingTop: 20,
    backgroundColor: '#181d27',
    position: 'relative',
    minHeight: 120,
  },
  planCardProGlow: {
    backgroundColor: '#1a2420',
    ...Platform.select({
      web: { boxShadow: '0 0 0 1px rgba(129,199,132,0.35)' } as object,
      default: { elevation: 4 },
    }),
  },
  planCardEliteGlow: {
    backgroundColor: '#221a28',
    ...Platform.select({
      web: { boxShadow: '0 0 0 1px rgba(206,147,216,0.4)' } as object,
      default: { elevation: 4 },
    }),
  },
  planCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendedRibbon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#6A1B9A',
    paddingVertical: 3,
    alignItems: 'center',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  recommendedText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  planName: { color: '#b0b8c4', fontSize: 13, fontWeight: '700', marginTop: 8, textTransform: 'uppercase' },
  planNameElite: { color: '#E1BEE7' },
  planPrice: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 8 },
  planSuffix: { color: '#8b939f', fontSize: 12, marginTop: 2 },
  planComingSoon: { color: '#888', fontSize: 14, marginTop: 16 },

  syncRow: { alignItems: 'center', paddingVertical: 8 },
  syncText: { color: '#7CB9FF', fontSize: 13, fontWeight: '600' },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#0f1218',
    borderTopWidth: 1,
    borderTopColor: '#252b38',
  },
  cta: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPro: { backgroundColor: '#2E7D32' },
  ctaElite: { backgroundColor: '#7B1FA2' },
  ctaDisabled: { opacity: 0.5 },
  ctaInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  laterWrap: { alignItems: 'center', paddingTop: 10 },
  laterText: { color: '#6b7380', fontSize: 14 },
});
