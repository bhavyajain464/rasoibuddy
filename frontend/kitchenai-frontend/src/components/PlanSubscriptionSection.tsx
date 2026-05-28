import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Text, Button, ActivityIndicator, Icon } from 'react-native-paper';
import { Entitlements, PlanProduct, UpgradeQuote } from '../types';

type TierKey = 'free' | 'pro' | 'elite';

const PRO_FEATURES = [
  'Unlimited bill scans',
  'Rescue & Meal of the Day',
  'Healthy, Tasty & Meal Prep modes',
];
const FREE_FEATURES = ['Daily meal ideas', '2 bill scans per day'];
const ELITE_FEATURES = [
  'Everything in Pro',
  'Nightly diet email from your meal log',
  'AI nutrition insights',
];

const TIER_ORDER: TierKey[] = ['free', 'pro', 'elite'];

const TIER_META: Record<
  TierKey,
  { label: string; icon: 'account' | 'star' | 'crown'; features: string[]; tagline: string }
> = {
  free: {
    label: 'Free',
    icon: 'account',
    features: FREE_FEATURES,
    tagline: 'Get started with daily meal ideas and limited scans.',
  },
  pro: {
    label: 'Pro',
    icon: 'star',
    features: PRO_FEATURES,
    tagline: 'Unlimited scans and every smart meal mode.',
  },
  elite: {
    label: 'Elite',
    icon: 'crown',
    features: ELITE_FEATURES,
    tagline: 'Pro plus diet digest and nutrition insights.',
  },
};

type Props = {
  entitlements: Entitlements | null;
  planLabel: () => string;
  onSubscribe: (tier: string, interval: string) => void;
  onSyncPayment: () => void;
  busy: boolean;
  busyPlanKey: string | null;
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
    label: `${used} of ${limit} used today`,
    pct: Math.round((used / limit) * 100),
    unlimited: false,
  };
}

function tierTheme(tier: TierKey | string) {
  if (tier === 'elite') {
    return {
      hero: '#6A1B9A',
      heroSoft: '#F3E5F5',
      accent: '#9C27B0',
      icon: 'crown' as const,
      cardBg: '#F3E5F5',
      cardBorder: '#E1BEE7',
      labelColor: '#6A1B9A',
    };
  }
  if (tier === 'pro') {
    return {
      hero: '#2E7D32',
      heroSoft: '#E8F5E9',
      accent: '#4CAF50',
      icon: 'star' as const,
      cardBg: '#E8F5E9',
      cardBorder: '#C8E6C9',
      labelColor: '#2E7D32',
    };
  }
  return {
    hero: '#455A64',
    heroSoft: '#ECEFF1',
    accent: '#607D8B',
    icon: 'account' as const,
    cardBg: '#F8F9FA',
    cardBorder: '#E0E0E0',
    labelColor: '#455A64',
  };
}

function PlanPricingCard({
  plan,
  highlighted,
  onSelect,
  checkoutBusy,
  loading,
  accentColor,
}: {
  plan: PlanProduct;
  highlighted?: boolean;
  onSelect: () => void;
  checkoutBusy: boolean;
  loading: boolean;
  accentColor: string;
}) {
  const isYearly = plan.interval === 'yearly';
  return (
    <Pressable
      onPress={onSelect}
      disabled={checkoutBusy}
      style={({ pressed }) => [
        styles.priceCard,
        highlighted && { borderColor: accentColor, borderWidth: 2, backgroundColor: '#FAFFFA' },
        pressed && styles.priceCardPressed,
      ]}
    >
      {isYearly ? (
        <View style={[styles.saveBadge, { backgroundColor: accentColor }]}>
          <Text style={styles.saveBadgeText}>Best value</Text>
        </View>
      ) : null}
      <Text style={styles.priceTier}>{plan.display_name}</Text>
      <Text style={styles.priceAmount}>
        {plan.price_label.replace('/month', '').replace('/year', '')}
      </Text>
      <Text style={styles.priceInterval}>{isYearly ? 'per year' : 'per month'}</Text>
      <Button
        mode="contained"
        onPress={onSelect}
        loading={loading}
        disabled={checkoutBusy}
        style={styles.priceBtn}
        buttonColor={accentColor}
        labelStyle={styles.priceBtnLabel}
      >
        Pay {isYearly ? 'yearly' : 'monthly'}
      </Button>
    </Pressable>
  );
}

function UpgradeOptionCard({
  opt,
  onSelect,
  checkoutBusy,
  loading,
}: {
  opt: UpgradeQuote;
  onSelect: () => void;
  checkoutBusy: boolean;
  loading: boolean;
}) {
  const isYearly = opt.target.interval === 'yearly';
  const accent = tierTheme(opt.target.tier).accent;
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
          <Text style={[styles.upgradePriceNow, { color: accent }]}>
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
        loading={loading}
        disabled={checkoutBusy}
        buttonColor={accent}
        style={styles.upgradeBtn}
      >
        Upgrade now
      </Button>
    </View>
  );
}

function FeatureChecklist({
  items,
  muted,
  accentColor,
}: {
  items: string[];
  muted?: boolean;
  accentColor?: string;
}) {
  const checkColor = muted ? '#9E9E9E' : accentColor ?? '#4CAF50';
  return (
    <View style={styles.checkList}>
      {items.map((item) => (
        <View key={item} style={styles.checkRow}>
          <Icon source="check" size={16} color={checkColor} />
          <Text style={[styles.checkText, muted && styles.checkTextMuted]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function TierFeaturePanel({
  tier,
  selected,
  width,
  onPress,
}: {
  tier: TierKey;
  selected: boolean;
  width: number;
  onPress: () => void;
}) {
  const meta = TIER_META[tier];
  const theme = tierTheme(tier);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tierPanel,
        { width, backgroundColor: theme.cardBg, borderColor: selected ? theme.accent : theme.cardBorder },
        selected && styles.tierPanelSelected,
      ]}
    >
      <View style={styles.tierPanelHeader}>
        <View style={[styles.tierIconCircle, { backgroundColor: theme.hero }]}>
          <Icon source={meta.icon} size={20} color="#fff" />
        </View>
        <Text style={[styles.tierPanelLabel, { color: theme.labelColor }]}>{meta.label}</Text>
        {selected ? (
          <View style={[styles.selectedDot, { backgroundColor: theme.accent }]}>
            <Icon source="check" size={12} color="#fff" />
          </View>
        ) : null}
      </View>
      <Text style={styles.tierTagline}>{meta.tagline}</Text>
      <FeatureChecklist items={meta.features} muted={!selected} accentColor={theme.accent} />
    </Pressable>
  );
}

function PlanTierPicker({
  selectedTier,
  onSelectTier,
  eliteAvailable,
}: {
  selectedTier: TierKey;
  onSelectTier: (tier: TierKey, index: number) => void;
  eliteAvailable: boolean;
}) {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const isCompact = Platform.OS !== 'web' || width < 720;
  const horizontalPadding = 16;
  const gap = 10;
  const panelWidth = isCompact ? width - horizontalPadding * 2 : (width - horizontalPadding * 2 - gap * 2) / 3;
  const snapInterval = panelWidth + gap;

  const scrollToIndex = useCallback(
    (index: number) => {
      scrollRef.current?.scrollTo({ x: index * snapInterval, animated: true });
    },
    [snapInterval],
  );

  const visibleTiers = TIER_ORDER.filter((t) => t !== 'elite' || eliteAvailable);

  // Carousel starts at x=0 (Free) while selectedTier may be Pro — align scroll on load.
  useEffect(() => {
    if (!isCompact) return;
    const idx = visibleTiers.indexOf(selectedTier);
    if (idx < 0) return;
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: idx * snapInterval, animated: false });
    }, 0);
    return () => clearTimeout(id);
  }, [isCompact, selectedTier, snapInterval, eliteAvailable]);

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / snapInterval);
    const tier = visibleTiers[Math.min(Math.max(0, idx), visibleTiers.length - 1)];
    if (tier && tier !== selectedTier) onSelectTier(tier, idx);
  };

  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.compareTitle}>What you get</Text>
      <Text style={styles.pickerHint}>
        {isCompact ? 'Swipe or tap a plan to compare' : 'Tap a plan to see pricing'}
      </Text>

      {isCompact ? (
        <>
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={snapInterval}
            snapToAlignment="start"
            contentContainerStyle={{ paddingHorizontal: horizontalPadding, gap }}
            onMomentumScrollEnd={handleScrollEnd}
          >
            {visibleTiers.map((tier, index) => (
              <TierFeaturePanel
                key={tier}
                tier={tier}
                selected={selectedTier === tier}
                width={panelWidth}
                onPress={() => {
                  onSelectTier(tier, index);
                  scrollToIndex(index);
                }}
              />
            ))}
          </ScrollView>
          <View style={styles.dotRow}>
            {visibleTiers.map((tier, index) => {
              const dotTheme = tierTheme(tier);
              return (
                <Pressable
                  key={tier}
                  onPress={() => {
                    onSelectTier(tier, index);
                    scrollToIndex(index);
                  }}
                  style={[
                    styles.dot,
                    selectedTier === tier && { backgroundColor: dotTheme.accent, width: 20 },
                  ]}
                />
              );
            })}
          </View>
        </>
      ) : (
        <View style={[styles.tierRowWeb, { paddingHorizontal: horizontalPadding }]}>
          {visibleTiers.map((tier, index) => (
            <TierFeaturePanel
              key={tier}
              tier={tier}
              selected={selectedTier === tier}
              width={panelWidth}
              onPress={() => onSelectTier(tier, index)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

export function PlanSubscriptionSection({
  entitlements,
  planLabel,
  onSubscribe,
  onSyncPayment,
  busy,
  busyPlanKey,
  loading = false,
  loadError = null,
  onRetry,
}: Props) {
  const [selectedTier, setSelectedTier] = useState<TierKey>('pro');
  const purchasableEarly = (entitlements?.available_plans ?? []).filter((p) => p.available_for_purchase);
  const eliteAvailableEarly =
    purchasableEarly.some((p) => p.tier === 'elite') ||
    (entitlements?.available_plans ?? []).some((p) => p.tier === 'elite');

  useEffect(() => {
    if (!eliteAvailableEarly && selectedTier === 'elite') {
      setSelectedTier('pro');
    }
  }, [eliteAvailableEarly, selectedTier]);

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
  const plansForTier = purchasable.filter((p) => p.tier === selectedTier);
  const eliteAvailable =
    purchasable.some((p) => p.tier === 'elite') ||
    (entitlements?.available_plans ?? []).some((p) => p.tier === 'elite');
  const eliteComingSoon =
    !purchasable.some((p) => p.tier === 'elite') &&
    (entitlements?.available_plans ?? []).some((p) => p.tier === 'elite' && !p.available_for_purchase);
  const upgrades = entitlements?.upgrade_options ?? [];
  const selectedTheme = tierTheme(selectedTier);

  const handleSelectTier = (tier: TierKey) => {
    setSelectedTier(tier);
  };

  return (
    <View style={styles.wrap}>
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
                  {
                    width: `${Math.min(100, scan.pct)}%` as `${number}%`,
                    backgroundColor: scan.pct >= 90 ? '#FF9800' : '#A5D6A7',
                  },
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

      {!isActivePro ? (
        <>
          <PlanTierPicker
            selectedTier={selectedTier}
            onSelectTier={(tier) => handleSelectTier(tier)}
            eliteAvailable={eliteAvailable || eliteComingSoon}
          />

          <Text style={styles.sectionHeading}>
            {selectedTier === 'free'
              ? 'Free plan'
              : `${TIER_META[selectedTier].label} pricing`}
          </Text>

          {selectedTier === 'free' ? (
            <View style={styles.freePricingNote}>
              <Text style={styles.freePricingText}>
                You are on Free. Tap Pro or Elite above to see monthly and yearly pay options.
              </Text>
            </View>
          ) : eliteComingSoon && selectedTier === 'elite' ? (
            <View style={styles.freePricingNote}>
              <Text style={styles.freePricingText}>Elite is coming soon. Pro is available now.</Text>
            </View>
          ) : plansForTier.length > 0 ? (
            <View style={styles.priceRow}>
              {plansForTier
                .sort((a, b) => (a.interval === 'monthly' ? -1 : 1) - (b.interval === 'monthly' ? -1 : 1))
                .map((p) => (
                  <PlanPricingCard
                    key={`${p.tier}-${p.interval}`}
                    plan={p}
                    highlighted={p.interval === 'yearly'}
                    onSelect={() => onSubscribe(p.tier, p.interval)}
                    checkoutBusy={busy}
                    loading={busyPlanKey === `${p.tier}-${p.interval}`}
                    accentColor={selectedTheme.accent}
                  />
                ))}
            </View>
          ) : (
            <View style={styles.freePricingNote}>
              <Text style={styles.freePricingText}>No checkout options for this plan right now.</Text>
            </View>
          )}

          <Pressable onPress={onSyncPayment} disabled={busy} style={styles.syncLink}>
            {busyPlanKey === 'sync' ? (
              <ActivityIndicator size="small" color="#607D8B" />
            ) : (
              <Text style={styles.syncLinkText}>Already paid? Activate your plan</Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <View style={[styles.activeBenefits, { backgroundColor: theme.heroSoft }]}>
            <Text style={[styles.activeBenefitsTitle, { color: theme.labelColor }]}>
              Included in your plan
            </Text>
            <FeatureChecklist
              items={
                entitlements?.is_elite
                  ? [...PRO_FEATURES, 'Nightly diet email', 'AI nutrition insights']
                  : PRO_FEATURES
              }
              accentColor={theme.accent}
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
                  checkoutBusy={busy}
                  loading={busyPlanKey === `${opt.target.tier}-${opt.target.interval}`}
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

  pickerWrap: { marginBottom: 8 },
  compareTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 4, paddingHorizontal: 16 },
  pickerHint: { fontSize: 12, color: '#888', marginBottom: 12, paddingHorizontal: 16 },
  tierRowWeb: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  tierPanel: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 2,
    minHeight: 200,
  },
  tierPanelSelected: {
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } as object,
      default: { elevation: 3 },
    }),
  },
  tierPanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  tierIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierPanelLabel: { fontSize: 18, fontWeight: '800', flex: 1 },
  selectedDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierTagline: { fontSize: 12, color: '#666', lineHeight: 17, marginBottom: 12 },
  dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12, marginBottom: 4 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D0D0D0',
  },

  sectionHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1B1F',
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  sectionSub: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 16, paddingHorizontal: 16 },

  priceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    paddingHorizontal: 16,
    alignItems: 'stretch',
  },
  priceCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    position: 'relative',
    overflow: 'hidden',
  },
  priceCardPressed: { opacity: 0.92 },
  saveBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 10,
  },
  saveBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  priceTier: { fontSize: 13, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  priceAmount: { fontSize: 22, fontWeight: '800', color: '#1C1B1F', marginTop: 4 },
  priceInterval: { fontSize: 13, color: '#888', marginBottom: 14 },
  priceBtn: { borderRadius: 12 },
  priceBtnLabel: { fontSize: 12, fontWeight: '700' },

  freePricingNote: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
  },
  freePricingText: { fontSize: 14, color: '#555', lineHeight: 20 },

  checkList: { gap: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkText: { fontSize: 13, color: '#333', flex: 1, lineHeight: 18 },
  checkTextMuted: { color: '#777' },

  syncLink: { alignItems: 'center', paddingVertical: 14 },
  syncLinkText: { color: '#607D8B', fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },

  activeBenefits: { borderRadius: 16, padding: 16, marginBottom: 16, marginHorizontal: 16 },
  activeBenefitsTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10 },

  upgradeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  upgradeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  upgradeTitle: { fontSize: 16, fontWeight: '800', color: '#1C1B1F' },
  upgradeListPrice: { fontSize: 13, color: '#888', marginTop: 2, textDecorationLine: 'line-through' },
  upgradePricePill: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'flex-end',
  },
  upgradePriceNow: { fontSize: 20, fontWeight: '800' },
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
