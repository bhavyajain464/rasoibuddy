import { CATALOG_STAPLE_IMAGES } from './catalogStapleImages';

/**
 * Onboarding pantry tiers:
 *
 * 1. auto (~40) — bulk staples in virtually every Indian kitchen; zero user input.
 * 2. regional — must-have for some households; one toggle step, pre-filled from prefs.
 * 3. perishable — never seeded at setup; add via bill scan (see PERISHABLE_STAPLE_IDS).
 */

export type OnboardingStapleGroup = 'auto' | 'regional';

export interface OnboardingStaple {
  id: string;
  name: string;
  qty: number;
  unit: string;
  group: OnboardingStapleGroup;
  selected: boolean;
}

export interface OnboardingPrefs {
  householdSize: number;
  dietaryTags: string[];
  favCuisines: string[];
}

/** Never auto-seed — perishable / bought often; quantities vary too much. */
export const PERISHABLE_STAPLE_IDS = [
  'onion',
  'tomato',
  'potato',
  'ginger',
  'garlic',
  'green_chilli',
  'milk',
  'curd',
  'paneer',
  'bread',
  'egg',
  'coriander_leaves',
] as const;

type ScaleKind = 'bulk' | 'spice';

interface StapleTemplate {
  id: string;
  name: string;
  baseQty: number;
  unit: string;
  group: OnboardingStapleGroup;
  scaleKind: ScaleKind;
  excludeIfDiet?: string[];
  requireAnyDiet?: string[];
  /** Pre-select regional toggle when user picks these cuisines. */
  cuisineBoost?: string[];
}

/** Tier 1 — auto-add at setup (~40 items). */
const AUTO_STAPLE_TEMPLATES: StapleTemplate[] = [
  // Spices & masala (19)
  { id: 'turmeric_powder', name: 'Turmeric Powder', baseQty: 200, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'red_chilli_powder', name: 'Red Chilli Powder', baseQty: 200, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'coriander_powder', name: 'Coriander Powder', baseQty: 200, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'cumin_powder', name: 'Cumin Powder', baseQty: 100, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'garam_masala', name: 'Garam Masala', baseQty: 100, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'cumin_seeds', name: 'Cumin Seeds (Jeera)', baseQty: 100, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'mustard_seeds', name: 'Mustard Seeds', baseQty: 100, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'black_pepper', name: 'Black Pepper', baseQty: 50, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'asafoetida', name: 'Asafoetida (Hing)', baseQty: 50, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'fenugreek_seeds', name: 'Fenugreek Seeds (Methi)', baseQty: 100, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'fennel_seeds', name: 'Fennel Seeds (Saunf)', baseQty: 100, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'carom_seeds', name: 'Carom Seeds (Ajwain)', baseQty: 100, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'dry_red_chilli', name: 'Dry Red Chilli', baseQty: 100, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'bay_leaf', name: 'Bay Leaf', baseQty: 50, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'cinnamon', name: 'Cinnamon', baseQty: 50, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'cardamom_green', name: 'Green Cardamom', baseQty: 50, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'cloves', name: 'Cloves', baseQty: 50, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'dry_mango_powder', name: 'Dry Mango Powder (Amchur)', baseQty: 100, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'kasuri_methi', name: 'Kasuri Methi', baseQty: 50, unit: 'g', group: 'auto', scaleKind: 'spice' },
  // Oils & fats
  { id: 'sunflower_oil', name: 'Sunflower Oil', baseQty: 2, unit: 'L', group: 'auto', scaleKind: 'bulk' },
  { id: 'ghee', name: 'Ghee', baseQty: 500, unit: 'ml', group: 'auto', scaleKind: 'bulk', excludeIfDiet: ['vegan', 'lactose-free'] },
  // Salt & sugar
  { id: 'salt', name: 'Salt', baseQty: 1, unit: 'kg', group: 'auto', scaleKind: 'bulk' },
  { id: 'sugar', name: 'Sugar', baseQty: 1, unit: 'kg', group: 'auto', scaleKind: 'bulk' },
  { id: 'jaggery', name: 'Jaggery', baseQty: 500, unit: 'g', group: 'auto', scaleKind: 'bulk' },
  // Flours
  { id: 'wheat_flour', name: 'Wheat Flour (Atta)', baseQty: 5, unit: 'kg', group: 'auto', scaleKind: 'bulk', excludeIfDiet: ['gluten-free'] },
  { id: 'all_purpose_flour', name: 'Maida', baseQty: 1, unit: 'kg', group: 'auto', scaleKind: 'bulk', excludeIfDiet: ['gluten-free'] },
  { id: 'gram_flour', name: 'Besan', baseQty: 1, unit: 'kg', group: 'auto', scaleKind: 'bulk' },
  { id: 'rice_flour', name: 'Rice Flour', baseQty: 500, unit: 'g', group: 'auto', scaleKind: 'bulk' },
  { id: 'semolina', name: 'Semolina (Rava)', baseQty: 1, unit: 'kg', group: 'auto', scaleKind: 'bulk', excludeIfDiet: ['gluten-free'] },
  // Grains
  { id: 'rice', name: 'Rice', baseQty: 5, unit: 'kg', group: 'auto', scaleKind: 'bulk' },
  { id: 'basmati_rice', name: 'Basmati Rice', baseQty: 2, unit: 'kg', group: 'auto', scaleKind: 'bulk' },
  { id: 'poha', name: 'Flattened Rice (Poha)', baseQty: 500, unit: 'g', group: 'auto', scaleKind: 'bulk' },
  // Dals
  { id: 'toor_dal', name: 'Toor Dal', baseQty: 1, unit: 'kg', group: 'auto', scaleKind: 'bulk' },
  { id: 'moong_dal', name: 'Moong Dal', baseQty: 500, unit: 'g', group: 'auto', scaleKind: 'bulk' },
  { id: 'urad_dal', name: 'Urad Dal', baseQty: 500, unit: 'g', group: 'auto', scaleKind: 'bulk' },
  { id: 'chana_dal', name: 'Chana Dal', baseQty: 500, unit: 'g', group: 'auto', scaleKind: 'bulk' },
  { id: 'masoor_dal', name: 'Masoor Dal', baseQty: 500, unit: 'g', group: 'auto', scaleKind: 'bulk' },
  // Extras
  { id: 'tamarind', name: 'Tamarind', baseQty: 200, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'tea', name: 'Tea', baseQty: 250, unit: 'g', group: 'auto', scaleKind: 'spice' },
  { id: 'peanut', name: 'Peanuts', baseQty: 500, unit: 'g', group: 'auto', scaleKind: 'bulk' },
  { id: 'cashew', name: 'Cashews', baseQty: 200, unit: 'g', group: 'auto', scaleKind: 'bulk' },
];

/** Tier 2 — regional / diet-dependent; user confirms once at onboarding. */
const REGIONAL_STAPLE_TEMPLATES: StapleTemplate[] = [
  { id: 'mustard_oil', name: 'Mustard Oil', baseQty: 1, unit: 'L', group: 'regional', scaleKind: 'bulk', cuisineBoost: ['Bengali', 'North Indian'] },
  { id: 'coconut_oil', name: 'Coconut Oil', baseQty: 1, unit: 'L', group: 'regional', scaleKind: 'bulk', cuisineBoost: ['South Indian'] },
  { id: 'coconut', name: 'Coconut', baseQty: 1, unit: 'pcs', group: 'regional', scaleKind: 'bulk', cuisineBoost: ['South Indian', 'Bengali'] },
  { id: 'curry_leaves', name: 'Curry Leaves', baseQty: 50, unit: 'g', group: 'regional', scaleKind: 'spice', cuisineBoost: ['South Indian'] },
  { id: 'sambar_powder', name: 'Sambar Powder', baseQty: 200, unit: 'g', group: 'regional', scaleKind: 'spice', cuisineBoost: ['South Indian'] },
  { id: 'rasam_powder', name: 'Rasam Powder', baseQty: 200, unit: 'g', group: 'regional', scaleKind: 'spice', cuisineBoost: ['South Indian'] },
  { id: 'poppy_seeds', name: 'Poppy Seeds', baseQty: 100, unit: 'g', group: 'regional', scaleKind: 'spice', cuisineBoost: ['Bengali'] },
  { id: 'sesame_seeds', name: 'Sesame Seeds', baseQty: 200, unit: 'g', group: 'regional', scaleKind: 'spice', cuisineBoost: ['Gujarati', 'South Indian'] },
  { id: 'vermicelli', name: 'Vermicelli', baseQty: 500, unit: 'g', group: 'regional', scaleKind: 'bulk', cuisineBoost: ['North Indian', 'Chinese'] },
];

function householdMultiplier(size: number, kind: ScaleKind): number {
  const n = Math.max(1, size);
  if (kind === 'spice') {
    if (n <= 2) return 1;
    if (n <= 4) return 1.25;
    return 1.5;
  }
  if (n <= 1) return 0.75;
  if (n <= 2) return 1;
  if (n <= 4) return 1.5;
  return 2;
}

function roundQty(qty: number, unit: string): number {
  if (unit === 'kg' || unit === 'L') {
    return Math.max(0.5, Math.round(qty * 2) / 2);
  }
  if (unit === 'g' || unit === 'ml') {
    return Math.max(50, Math.round(qty / 50) * 50);
  }
  return Math.max(1, Math.round(qty));
}

function scaledQty(template: StapleTemplate, householdSize: number): number {
  const raw = template.baseQty * householdMultiplier(householdSize, template.scaleKind);
  return roundQty(raw, template.unit);
}

function passesDietFilter(template: StapleTemplate, dietaryTags: string[]): boolean {
  if (template.requireAnyDiet?.length) {
    if (!template.requireAnyDiet.some(tag => dietaryTags.includes(tag))) return false;
  }
  if (template.excludeIfDiet?.some(tag => dietaryTags.includes(tag))) return false;
  return true;
}

function defaultRegionalSelected(template: StapleTemplate, prefs: OnboardingPrefs): boolean {
  if (!template.cuisineBoost?.length || !prefs.favCuisines.length) return false;
  return template.cuisineBoost.some(c => prefs.favCuisines.includes(c));
}

function toStaple(template: StapleTemplate, prefs: OnboardingPrefs, selected: boolean): OnboardingStaple {
  return {
    id: template.id,
    name: template.name,
    qty: scaledQty(template, prefs.householdSize),
    unit: template.unit,
    group: template.group,
    selected,
  };
}

/** ~40 bulk staples — always added on setup. */
export function buildAutoStaples(prefs: OnboardingPrefs): OnboardingStaple[] {
  return AUTO_STAPLE_TEMPLATES
    .filter(t => passesDietFilter(t, prefs.dietaryTags))
    .map(t => toStaple(t, prefs, true));
}

/** Regional staples — pre-selected from cuisine prefs, user toggles once. */
export function buildRegionalStaples(
  prefs: OnboardingPrefs,
  previousSelections?: Record<string, boolean>,
): OnboardingStaple[] {
  return REGIONAL_STAPLE_TEMPLATES
    .filter(t => passesDietFilter(t, prefs.dietaryTags))
    .map(t => {
      const selected = previousSelections
        ? (previousSelections[t.id] ?? defaultRegionalSelected(t, prefs))
        : defaultRegionalSelected(t, prefs);
      return toStaple(t, prefs, selected);
    });
}

export function buildOnboardingInventoryItems(
  autoStaples: OnboardingStaple[],
  regionalStaples: OnboardingStaple[],
): { name: string; qty: number; unit: string }[] {
  return [...autoStaples, ...regionalStaples.filter(s => s.selected)].map(s => ({
    name: s.name,
    qty: s.qty,
    unit: s.unit,
  }));
}

export function getOnboardingStapleImage(id: string): number | undefined {
  return CATALOG_STAPLE_IMAGES[id];
}

export function summarizeAutoStaples(autoStaples: OnboardingStaple[]): string {
  if (autoStaples.length === 0) return '';
  return 'Masalas, atta, rice, dals, oil & more';
}

/** Category chips for the onboarding kitchen summary banner. */
export function getAutoStapleCategoryPills(autoStaples: OnboardingStaple[]): string[] {
  const ids = new Set(autoStaples.map((s) => s.id));
  const spiceCount = AUTO_STAPLE_TEMPLATES.filter(
    (t) => t.scaleKind === 'spice' && ids.has(t.id),
  ).length;
  const dalCount = autoStaples.filter((s) => s.id.endsWith('_dal')).length;
  const flourCount = autoStaples.filter(
    (s) => s.id.includes('flour') || s.id === 'semolina',
  ).length;
  const pills: string[] = [];
  if (spiceCount > 0) pills.push(`${spiceCount} spices`);
  if (dalCount > 0) pills.push(`${dalCount} dals`);
  if (flourCount > 0) pills.push(`${flourCount} flours`);
  if (autoStaples.some((s) => s.id.includes('oil') || s.id === 'ghee')) {
    pills.push('oil & ghee');
  }
  if (autoStaples.some((s) => s.id.includes('rice'))) pills.push('rice');
  if (ids.has('tea')) pills.push('tea');
  return pills;
}
