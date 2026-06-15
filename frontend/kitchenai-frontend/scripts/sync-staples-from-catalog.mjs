#!/usr/bin/env node
/**
 * Regenerate onboardingStaples.ts and stapleImages.ts from backend ingredients catalog.
 * Run: node scripts/sync-staples-from-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.resolve(
  ROOT,
  '../../backend/internal/services/ingredients/catalog.json',
);
const STAPLES_DIR = path.join(ROOT, 'assets/staples');
const OUT_STAPLES = path.join(ROOT, 'src/data/onboardingStaples.ts');
const OUT_IMAGES = path.join(ROOT, 'src/data/stapleImages.ts');

/** Old onboarding kebab ids → catalog snake_case ids (for default selection + qty). */
const LEGACY_ID_MAP = {
  'wheat-flour-atta': 'wheat_flour',
  'rice-basmati': 'basmati_rice',
  'rice-flour': 'rice_flour',
  besan: 'gram_flour',
  sooji: 'semolina',
  poha: 'poha',
  'toor-dal': 'toor_dal',
  'moong-dal': 'moong_dal',
  'chana-dal': 'chana_dal',
  'masoor-dal': 'masoor_dal',
  rajma: 'rajma',
  chole: 'kabuli_chana',
  'turmeric-powder': 'turmeric_powder',
  'red-chilli-powder': 'red_chilli_powder',
  'coriander-powder': 'coriander_powder',
  'cumin-powder': 'cumin_powder',
  'garam-masala': 'garam_masala',
  'cumin-seeds': 'cumin_seeds',
  'mustard-seeds': 'mustard_seeds',
  'black-pepper': 'black_pepper',
  'cinnamon-sticks': 'cinnamon',
  'bay-leaves': 'bay_leaf',
  'cooking-oil': 'sunflower_oil',
  ghee: 'ghee',
  salt: 'salt',
  sugar: 'sugar',
  'tea-chai': 'tea',
  'coffee-powder': 'coffee',
  milk: 'milk',
  curd: 'curd',
  butter: 'butter',
  paneer: 'paneer',
  onions: 'onion',
  tomatoes: 'tomato',
  potatoes: 'potato',
  'green-chillies': 'green_chilli',
  ginger: 'ginger',
  garlic: 'garlic',
  'coriander-leaves': 'coriander_leaves',
  'curry-leaves': 'curry_leaves',
  lemons: 'lemon',
};

const CATEGORY_LABELS = {
  vegetables: 'Vegetables',
  leafy_greens: 'Leafy Greens',
  fruits: 'Fruits',
  herbs: 'Herbs',
  spices: 'Spices',
  spice_blends: 'Spice Blends',
  grains_cereals: 'Grains & Cereals',
  flours: 'Flours',
  pulses_legumes: 'Dals & Lentils',
  dairy: 'Dairy',
  eggs: 'Eggs',
  poultry: 'Poultry',
  meat: 'Meat',
  seafood: 'Seafood',
  nuts: 'Nuts',
  seeds: 'Seeds',
  dry_fruits: 'Dry Fruits',
  oils_fats: 'Oils & Fats',
  condiments_sauces: 'Condiments & Sauces',
  sweeteners: 'Sweeteners',
  baking: 'Baking',
  beverages: 'Beverages',
  staples_packaged: 'Packaged Staples',
  other: 'Other',
};

const CATEGORY_ORDER = [
  'grains_cereals',
  'flours',
  'pulses_legumes',
  'spices',
  'spice_blends',
  'oils_fats',
  'sweeteners',
  'beverages',
  'dairy',
  'eggs',
  'vegetables',
  'leafy_greens',
  'fruits',
  'herbs',
  'nuts',
  'seeds',
  'dry_fruits',
  'condiments_sauces',
  'baking',
  'staples_packaged',
  'poultry',
  'meat',
  'seafood',
  'other',
];

function parseLegacyStaples() {
  const src = fs.readFileSync(OUT_STAPLES, 'utf8');
  const selectedIds = new Set();
  const qtyById = new Map();
  const re =
    /\{ id: '([^']+)', name: '[^']*', qty: (\d+), unit: '[^']*', category: '[^']*', selected: (true|false) \}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const legacyId = m[1];
    const catalogId = LEGACY_ID_MAP[legacyId] ?? legacyId.replace(/-/g, '_');
    if (m[3] === 'true') selectedIds.add(catalogId);
    qtyById.set(catalogId, Number(m[2]));
  }
  return { selectedIds, qtyById };
}

function defaultQty(unit, category) {
  switch (unit) {
    case 'kg':
      if (category === 'vegetables' || category === 'fruits') return 1;
      if (category === 'grains_cereals' || category === 'flours') return 5;
      if (category === 'pulses_legumes') return 1;
      return 1;
    case 'L':
      return 2;
    case 'ml':
      return 500;
    case 'g':
      if (category === 'spices' || category === 'spice_blends') return 100;
      if (category === 'pulses_legumes') return 500;
      if (category === 'vegetables' || category === 'herbs') return 100;
      return 200;
    case 'pcs':
      return 4;
    case 'bunch':
      return 1;
    default:
      return 1;
  }
}

function needsQuotedKey(id) {
  return /[^a-zA-Z0-9_$]/.test(id);
}

function formatIdKey(id) {
  return needsQuotedKey(id) ? `'${id}'` : id;
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const { selectedIds, qtyById } = parseLegacyStaples();
  const ingredients = catalog.ingredients.slice().sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return a.canonical.localeCompare(b.canonical);
  });

  const stapleLines = [];
  const imageLines = [];
  let lastCategory = null;

  for (const ing of ingredients) {
    const category = CATEGORY_LABELS[ing.category] ?? ing.category;
    if (ing.category !== lastCategory) {
      stapleLines.push('');
      stapleLines.push(`  // ${category}`);
      lastCategory = ing.category;
    }
    const unit = ing.units[0] ?? 'g';
    const qty = qtyById.get(ing.id) ?? defaultQty(unit, ing.category);
    const selected = selectedIds.has(ing.id);
    stapleLines.push(
      `  { id: '${ing.id}', name: ${JSON.stringify(ing.canonical)}, qty: ${qty}, unit: '${unit}', category: ${JSON.stringify(category)}, selected: ${selected} },`,
    );
    imageLines.push(
      `  ${formatIdKey(ing.id)}: require('../../assets/staples/${ing.id}.webp'),`,
    );
  }

  const staplesTs = `export interface OnboardingStaple {
  id: string;
  name: string;
  qty: number;
  unit: string;
  category: string;
  selected: boolean;
}

/** Pantry staples for onboarding — synced from backend ingredients catalog. Image: assets/staples/{id}.webp */
export const DEFAULT_ONBOARDING_STAPLES: OnboardingStaple[] = [${stapleLines.join('\n')}
];

export type StapleId = (typeof DEFAULT_ONBOARDING_STAPLES)[number]['id'];
`;

  const imagesTs = `import type { StapleId } from './onboardingStaples';

/** Static requires for onboarding staple thumbnails (assets/staples/{id}.webp). */
export const STAPLE_IMAGES: Record<StapleId, number> = {
${imageLines.join('\n')}
};
`;

  fs.writeFileSync(OUT_STAPLES, staplesTs);
  fs.writeFileSync(OUT_IMAGES, imagesTs);

  const existing = new Set(
    fs
      .readdirSync(STAPLES_DIR)
      .filter(f => f.endsWith('.webp'))
      .map(f => f.replace(/\.webp$/, '')),
  );
  const missing = ingredients.filter(i => !existing.has(i.id)).map(i => i.id);

  console.log(`Wrote ${ingredients.length} staples → ${OUT_STAPLES}`);
  console.log(`Wrote ${ingredients.length} image requires → ${OUT_IMAGES}`);
  console.log(`Default selected: ${selectedIds.size}`);
  console.log(`Missing webp images: ${missing.length}`);
  if (missing.length) {
    const pendingPath = path.join(ROOT, 'scripts/pending-staple-images.json');
    fs.writeFileSync(pendingPath, JSON.stringify(missing, null, 2));
    console.log(`Pending list → ${pendingPath}`);
  }
}

main();
