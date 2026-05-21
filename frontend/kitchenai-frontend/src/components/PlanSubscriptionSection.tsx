import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { Text, Button, ActivityIndicator, Icon } from 'react-native-paper';
import { Entitlements, PlanProduct, UpgradeQuote } from '../types';

const PRO_FEATURES = [
  'Unlimited bill scans',
  'Rescue & Meal of the Day',
  'Healthy, Tasty & Meal Prep modes',
];
const FREE_FEATURES = ['Daily meal ideas', '5 bill scans per account'];
const ELITE_FEATURES = [
  'Everything in Pro',
  'Nightly diet email from your meal log',
  'AI nutrition insights',
];

type Props = {
  entitlements: Entitlements | null;
  planLabel: () => string;
  onSubscribe: (tier: string, interval: string) => void;
  onSyncPayment: () => void;
  busy: boolean;
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
};

function formatScanUsage(ent: Entitlements | null) {
  if (!ent) return { label: '—', pct: 0, unlimited: false };
  const active = ent.is_pro;
  if (active || ent.bill_scan_limit < 0) {
    return { label: 'Unlimited', pct: 100, unlimited: true };
  }
  const limit = Math.max(1, ent.bill_scan_limit);
  const used = Math.min(ent.bill_scans_used, limit);
  return {
    label: `${used} of ${limit} used`,
    pct: Math.round((used / limit) * 100),
    unlimited: false,
  };
}

function tierTheme(tier: string) {
  if (tier === 'elite') {
    return {
      hero: '#6A1B9A',
      heroSoft: '#F3E5F5',
      accent: '#9C27B0',
      icon: 'crown' as const,
    };
  }
  if (tier === 'pro') {
    return {
      hero: '#2E7D32',
      heroSoft: '#E8F5E9',
      accent: '#4CAF50',
      icon: 'star' as const,
    };
  }
  return {
    hero: '#455A64',
    heroSoft: '#ECEFF1',
    accent: '#607D8B',
    icon: 'account' as const,
  };
}

function PlanPricingCard({
  plan,
  highlighted,
  onSelect,
  busy,
}: {
  plan: PlanProduct;
  highlighted?: boolean;
  onSelect: () => void;
  busy: boolean;
}) {
  const isYearly = plan.interval === 'yearly';
  return (
    <Pressable
      onPress={onSelect}
      disabled={busy}
      style={({ pressed }) => [
        styles.priceCard,
        highlighted && styles.priceCardHighlight,
        pressed && styles.priceCardPressed,
      ]}
    >
      {isYearly ? (
        <View style={styles.saveBadge}>
          <Text style={styles.saveBadgeText}>Best value</Text>
        </View>
      ) : null}
      <Text style={styles.priceTier}>{plan.display_name}</Text>
      <Text style={styles.priceAmount}>
        {plan.price_label.replace('/month', '').replace('/year', '')}
      </Text>
      <Text style={styles.priceInterval}>{isYearly ? 'per year' : 'per month'}</Text>
      <View style={styles.priceFeatureList}>
        {plan.features.slice(0, 2).map((f) => (
          <View key={f} style={styles.priceFeatureRow}>
            <Icon source="check-circle" size={14} color="#4CAF50" />
            <Text style={styles.priceFeatureText}>{f}</Text>
          </View>
        ))}
      </View>
      <Button
        mode="contained"
        onPress={onSelect}
        loading={busy}
        disabled={busy}
        style={styles.priceBtn}
        buttonColor={highlighted ? '#2E7D32' : '#4CAF50'}
        labelStyle={styles.priceBtnLabel}
      >
        Choose {isYearly ? 'Yearly' : 'Monthly'}
      </Button>
    </Pressable>
  );
}

function UpgradeOptionCard({
  opt,
  onSelect,
  busy,
}: {
  opt: UpgradeQuote;
  onSelect: () => void;
  busy: boolean;
}) {
  const isYearly = opt.target.interval === 'yearly';
  return (
    <View style={styles.upgradeCard}>
      <View style={styles.upgradeCardHeader}>
        <View>
          <Text style={styles.upgradeTitle}>
            {opt.target.display_name} {isYearly ? 'Yearly' : 'Monthly'}
          </Text>
          <Text style={styles.upgradeListPrice}>{opt.target.price_label}</Text>
        </View>
        <View style={styles.upgradePricePill}>
          <Text style={styles.upgradePriceNow}>
            ₹{(opt.amount_paise / 100).toFixed(0)}
          </Text>
          <Text style={styles.upgradePriceSub}>due today</Text>
        </View>
      </View>
      {opt.credit_paise > 0 ? (
        <View style={styles.creditBanner}>
          <Icon source="tag" size={16} color="#1B5E20" />
          <Text style={styles.creditBannerText}>{opt.credit_summary}</Text>
        </View>
      ) : null}
      <Button
        mode="contained"
        icon="arrow-up-bold"
        onPress={onSelect}
        loading={busy}
        disabled={busy}
        buttonColor="#2E7D32"
        style={styles.upgradeBtn}
      >
        Upgrade now
      </Button>
    </View>
  );
}

function FeatureChecklist({ items, muted }: { items: string[]; muted?: boolean }) {
  return (
    <View style={styles.checkList}>
      {items.map((item) => (
        <View key={item} style={styles.checkRow}>
          <Icon source="check" size={16} color={muted ? '#9E9E9E' : '#4CAF50'} />
          <Text style={[styles.checkText, muted && styles.checkTextMuted]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function PlanSubscriptionSection({
  entitlements,
  planLabel,
  onSubscribe,
  onSyncPayment,
  busy,
  loading = false,
  loadError = null,
  onRetry,
}: Props) {
  if (loading && !entitlements) {
    return (
      <View style={[styles.wrap, styles.statusBox]}>
        <ActivityIndicator size="small" color="#4CAF50" />
        <Text style={styles.statusText}>Loading your plan…</Text>
      </View>
    );
  }

  if (!entitlements && loadError) {
    return (
      <View style={[styles.wrap, styles.statusBox]}>
        <Text style={styles.statusTitle}>Could not load plan status</Text>
        <Text style={styles.statusText}>{loadError}</Text>
        <Text style={styles.statusHint}>
          Make sure the backend is running on port 8080, then retry. Your account may already be Pro in the database.
        </Text>
        {onRetry ? (
          <Button mode="contained" onPress={onRetry} style={{ marginTop: 12 }}>
            Retry
          </Button>
        ) : null}
      </View>
    );
  }

  const isActivePro = Boolean(entitlements?.is_pro);
  const isActiveElite = Boolean(entitlements?.is_elite);
  const theme = tierTheme(isActiveElite ? 'elite' : isActivePro ? 'pro' : 'free');
  const scan = formatScanUsage(entitlements);
  const purchasable = (entitlements?.available_plans ?? []).filter((p) => p.available_for_purchase);
  const proPlans = purchasable.filter((p) => p.tier === 'pro');
  const elitePlans = purchasable.filter((p) => p.tier === 'elite');
  const comingSoon = (entitlements?.available_plans ?? []).filter((p) => !p.available_for_purchase);
  const upgrades = entitlements?.upgrade_options ?? [];

  return (
    <View style={styles.wrap}>
      {/* Current plan hero */}
      <View style={[styles.hero, { backgroundColor: theme.hero }]}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroEyebrow}>Your plan</Text>
            <Text style={styles.heroTitle}>{planLabel()}</Text>
            {entitlements?.plan_expires_at ? (
              <Text style={styles.heroMeta}>
                Active until {new Date(entitlements.plan_expires_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            ) : isActivePro ? null : (
              <Text style={styles.heroMeta}>Upgrade to unlock the full kitchen</Text>
            )}
          </View>
          <View style={[styles.heroIconCircle, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Icon source={theme.icon} size={28} color="#fff" />
          </View>
        </View>

        {!scan.unlimited ? (
          <View style={styles.usageBlock}>
            <View style={styles.usageLabelRow}>
              <Text style={styles.usageLabel}>Bill scans</Text>
              <Text style={styles.usageValue}>{scan.label}</Text>
            </View>
            <View style={styles.usageTrack}>
              <View
                style={[
                  styles.usageFill,
                  { width: `${Math.min(100, scan.pct)}%` as `${number}%`, backgroundColor: scan.pct >= 90 ? '#FF9800' : '#A5D6A7' },
                ]}
              />
            </View>
          </View>
        ) : (
          <View style={styles.unlimitedPill}>
            <Icon source="infinity" size={18} color="#C8E6C9" />
            <Text style={styles.unlimitedText}>Unlimited bill scans</Text>
          </View>
        )}
      </View>

      {/* Free user: pick a plan */}
      {!isActivePro ? (
        <>
          <Text style={styles.sectionHeading}>Choose Pro</Text>
          <Text style={styles.sectionSub}>
            Smarter meals, every mode, and scans without limits.
          </Text>
          <View style={styles.priceRow}>
            {proPlans.map((p) => (
              <PlanPricingCard
                key={`${p.tier}-${p.interval}`}
                plan={p}
                highlighted={p.interval === 'yearly'}
                onSelect={() => onSubscribe(p.tier, p.interval)}
                busy={busy}
              />
            ))}
          </View>

          {elitePlans.length > 0 ? (
            <>
              <Text style={[styles.sectionHeading, { marginTop: 8 }]}>Or go Elite</Text>
              <Text style={styles.sectionSub}>
                Adds nightly diet digest and nutrition insights on top of Pro.
              </Text>
              <View style={styles.priceRow}>
                {elitePlans.map((p) => (
                  <PlanPricingCard
                    key={`${p.tier}-${p.interval}`}
                    plan={p}
                    highlighted={p.interval === 'yearly'}
                    onSelect={() => onSubscribe(p.tier, p.interval)}
                    busy={busy}
                  />
                ))}
              </View>
            </>
          ) : null}

          <View style={styles.compareCard}>
            <Text style={styles.compareTitle}>What you get</Text>
            <View style={styles.compareColumns}>
              <View style={styles.compareCol}>
                <Text style={styles.compareColLabel}>Free</Text>
                <FeatureChecklist items={FREE_FEATURES} muted />
              </View>
              <View style={[styles.compareCol, styles.compareColPro]}>
                <Text style={[styles.compareColLabel, { color: '#2E7D32' }]}>Pro</Text>
                <FeatureChecklist items={PRO_FEATURES} />
              </View>
            </View>
          </View>

          {comingSoon.length > 0 ? (
            <View style={styles.eliteTeaser}>
              <View style={styles.eliteTeaserHeader}>
                <Icon source="crown" size={22} color="#7B1FA2" />
                <View style={styles.eliteTeaserText}>
                  <Text style={styles.eliteTeaserTitle}>Elite</Text>
                  <Text style={styles.eliteTeaserBadge}>Coming soon</Text>
                </View>
              </View>
              <FeatureChecklist items={ELITE_FEATURES} muted />
            </View>
          ) : null}

          <Pressable onPress={onSyncPayment} disabled={busy} style={styles.syncLink}>
            {busy ? (
              <ActivityIndicator size="small" color="#607D8B" />
            ) : (
              <Text style={styles.syncLinkText}>Already paid? Activate your plan</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <View style={[styles.activeBenefits, { backgroundColor: theme.heroSoft }]}>
            <Text style={styles.activeBenefitsTitle}>Included in your plan</Text>
            <FeatureChecklist
              items={
                entitlements?.is_elite
                  ? [...PRO_FEATURES, 'Nightly diet email', 'AI nutrition insights']
                  : PRO_FEATURES
              }
            />
          </View>

          {upgrades.length > 0 ? (
            <>
              <Text style={styles.sectionHeading}>Upgrade</Text>
              <Text style={styles.sectionSub}>
                Unused days on your current plan are credited automatically.
              </Text>
              {upgrades.map((opt) => (
                <UpgradeOptionCard
                  key={`${opt.target.tier}-${opt.target.interval}`}
                  opt={opt}
                  onSelect={() => onSubscribe(opt.target.tier, opt.target.interval)}
                  busy={busy}
                />
              ))}
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  statusBox: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    marginBottom: 12,
  },
  statusTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 8 },
  statusText: { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 18 },
  statusHint: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 8, lineHeight: 16 },

  hero: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(46, 125, 50, 0.25)' } as object,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
      },
    }),
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroEyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 4 },
  heroMeta: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6 },
  heroIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },

  usageBlock: { marginTop: 18 },
  usageLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  usageLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  usageValue: { color: '#fff', fontSize: 12, fontWeight: '700' },
  usageTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  usageFill: { height: '100%', borderRadius: 4 },
  unlimitedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  unlimitedText: { color: '#E8F5E9', fontWeight: '600', fontSize: 13 },

  sectionHeading: { fontSize: 18, fontWeight: '800', color: '#1C1B1F', marginBottom: 4 },
  sectionSub: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 16 },

  priceRow: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    gap: 12,
    marginBottom: 16,
  },
  priceCard: {
    flex: Platform.OS === 'web' ? 1 : undefined,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    position: 'relative',
    overflow: 'hidden',
  },
  priceCardHighlight: {
    borderColor: '#4CAF50',
    borderWidth: 2,
    backgroundColor: '#FAFFF9',
  },
  priceCardPressed: { opacity: 0.92 },
  saveBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF9800',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 10,
  },
  saveBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  priceTier: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  priceAmount: { fontSize: 28, fontWeight: '800', color: '#1C1B1F', marginTop: 4 },
  priceInterval: { fontSize: 13, color: '#888', marginBottom: 12 },
  priceFeatureList: { gap: 6, marginBottom: 14 },
  priceFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceFeatureText: { fontSize: 12, color: '#555', flex: 1 },
  priceBtn: { borderRadius: 12 },
  priceBtnLabel: { fontSize: 13, fontWeight: '700' },

  compareCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    marginBottom: 14,
  },
  compareTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 12 },
  compareColumns: { flexDirection: 'row', gap: 12 },
  compareCol: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#F8F9FA' },
  compareColPro: { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#C8E6C9' },
  compareColLabel: { fontSize: 12, fontWeight: '800', color: '#888', marginBottom: 8, textTransform: 'uppercase' },

  checkList: { gap: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { fontSize: 13, color: '#333', flex: 1, lineHeight: 18 },
  checkTextMuted: { color: '#777' },

  eliteTeaser: {
    backgroundColor: '#FAF5FC',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E1BEE7',
    marginBottom: 12,
  },
  eliteTeaserHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  eliteTeaserText: { flex: 1 },
  eliteTeaserTitle: { fontSize: 17, fontWeight: '800', color: '#6A1B9A' },
  eliteTeaserBadge: { fontSize: 11, color: '#9C27B0', fontWeight: '700', marginTop: 2 },

  syncLink: { alignItems: 'center', paddingVertical: 14 },
  syncLinkText: { color: '#607D8B', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },

  activeBenefits: { borderRadius: 16, padding: 16, marginBottom: 16 },
  activeBenefitsTitle: { fontSize: 14, fontWeight: '700', color: '#2E7D32', marginBottom: 10 },

  upgradeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  upgradeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  upgradeTitle: { fontSize: 16, fontWeight: '800', color: '#1C1B1F' },
  upgradeListPrice: { fontSize: 13, color: '#888', marginTop: 2, textDecorationLine: 'line-through' },
  upgradePricePill: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'flex-end',
  },
  upgradePriceNow: { fontSize: 20, fontWeight: '800', color: '#2E7D32' },
  upgradePriceSub: { fontSize: 10, color: '#558B2F', fontWeight: '600' },
  creditBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F5E9',
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  creditBannerText: { flex: 1, fontSize: 12, color: '#1B5E20', lineHeight: 16 },
  upgradeBtn: { marginTop: 12, borderRadius: 12 },
});
