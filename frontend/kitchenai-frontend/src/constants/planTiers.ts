export type PlanTierId = 'free' | 'pro' | 'elite';

export type PlanComparisonRow = {
  label: string;
  free: boolean | string;
  pro: boolean | string;
  elite: boolean | string;
};

/** Feature bullets shown on profile subscription cards and landing pricing. */
export const PLAN_TIER_FEATURES: Record<PlanTierId, readonly string[]> = {
  free: ['Meal suggestions', '2 bill scans per day'],
  pro: ['Unlimited bill scans'],
  elite: ['Everything in Pro', 'Daily nutrition insights'],
};

export const PLAN_TIER_TAGLINES: Record<PlanTierId, string> = {
  free: 'Meal suggestions with limited bill scans.',
  pro: 'Unlimited bill scans.',
  elite: 'Pro plus daily nutrition insights.',
};

/** Paywall tier comparison table (Free / Pro / Elite columns). */
export const PLAN_COMPARISON: PlanComparisonRow[] = [
  { label: 'Meal suggestions', free: true, pro: true, elite: true },
  { label: 'Bill scans', free: '2 / day', pro: 'Unlimited', elite: 'Unlimited' },
  { label: 'Daily nutrition insights', free: false, pro: false, elite: true },
];

/** Short positioning line on the public landing pricing cards. */
export const PLAN_TIER_WHY: Record<PlanTierId, string> = {
  free: 'For getting started',
  pro: 'For everyday home cooks',
  elite: 'For the health-focused',
};

/** INR prices — keep aligned with backend `PlanCatalog()` in services/plans.go */
export const PLAN_PRICING_INR = {
  pro: { monthly: 99, yearlyTotal: 899 },
  elite: { monthly: 199, yearlyTotal: 1999 },
} as const;

export function planYearlyMonthlyEquivalent(yearlyTotal: number): number {
  return Math.round(yearlyTotal / 12);
}

export function planYearlySavingsPercent(monthly: number, yearlyTotal: number): number {
  const fullYear = monthly * 12;
  if (fullYear <= 0 || yearlyTotal <= 0) return 0;
  return Math.round(((fullYear - yearlyTotal) / fullYear) * 100);
}
