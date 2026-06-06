const FOOD_GROUP_LABELS: Record<string, string> = {
  vegetables: 'Vegetables',
  fruits: 'Fruits',
  spices: 'Spices',
  dairy: 'Dairy',
  grains_pulses: 'Grains & Pulses',
  oils_fats: 'Oils & Fats',
  non_veg: 'Non-Veg',
  protein: 'Non-Veg',
  condiments: 'Condiments',
  bakery: 'Bakery',
  beverages: 'Beverages',
  prepared: 'Prepared',
  other: 'Other',
};

export function normalizeFoodGroup(group?: string): string {
  const raw = (group ?? 'other').trim().toLowerCase() || 'other';
  return raw === 'protein' ? 'non_veg' : raw;
}

export function formatFoodGroupLabel(group?: string): string {
  const key = normalizeFoodGroup(group);
  if (FOOD_GROUP_LABELS[key]) return FOOD_GROUP_LABELS[key];
  return key
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatQty(qty: number, unit: string): string {
  const u = unit.trim() || 'pcs';
  const q = qty % 1 === 0 ? String(Math.round(qty)) : qty.toFixed(2).replace(/\.?0+$/, '');
  return `${q} ${u}`;
}
