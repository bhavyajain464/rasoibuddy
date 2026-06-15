#!/usr/bin/env node
/**
 * Generate dish catalog index + bundled card image requires.
 * Run: node scripts/generate-dish-image-maps.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CATALOG = path.resolve(ROOT, '../../backend/internal/services/dishes/catalog.json');
const CARD_DIR = path.join(ROOT, 'assets/dishes/card');
const OUT_INDEX = path.join(ROOT, 'src/data/dishCatalogIndex.ts');
const OUT_IMAGES = path.join(ROOT, 'src/data/dishCardImages.ts');
const OUT_SEARCH = path.join(ROOT, 'src/data/dishCatalogSearch.ts');

function norm(s) {
  return s.trim().toLowerCase();
}

function needsQuotedKey(id) {
  return /[^a-zA-Z0-9_$]/.test(id);
}

function keyFmt(id) {
  return needsQuotedKey(id) ? `'${id}'` : id;
}

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const indexMap = new Map();
const imageLines = [];
const searchLines = [];
let missing = 0;

for (const dish of catalog) {
  const id = dish.id;
  if (!id) continue;
  const name = dish.display_name || dish.name;
  const mealTypes = dish.meal_type ?? [];
  const cuisine = dish.cuisine ?? '';
  const cookTime = dish.cook_time_minutes ?? 0;
  searchLines.push(
    `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)}, mealTypes: ${JSON.stringify(mealTypes)}, cuisine: ${JSON.stringify(cuisine)}, cookTimeMins: ${cookTime} },`,
  );
  const cardPath = path.join(CARD_DIR, `${id}.webp`);
  if (!fs.existsSync(cardPath)) {
    missing++;
    continue;
  }
  const keys = new Set([norm(dish.name)]);
  if (dish.display_name) keys.add(norm(dish.display_name));
  for (const k of keys) {
    if (k) indexMap.set(k, id);
  }
  imageLines.push(`  ${keyFmt(id)}: require('../../assets/dishes/card/${id}.webp'),`);
}

const indexEntries = [...indexMap.entries()].map(
  ([k, id]) => `  ${JSON.stringify(k)}: ${JSON.stringify(id)},`,
);

const indexTs = `/** Auto-generated from dishes/catalog.json — do not edit by hand. */
export function normalizeDishName(name: string): string {
  return name.trim().toLowerCase();
}

/** Normalized dish display name → catalog id. */
export const DISH_NAME_TO_ID: Record<string, string> = {
${indexEntries.join('\n')}
};

export function resolveDishId(name?: string | null, dishId?: string | null): string | null {
  const id = dishId?.trim();
  if (id) return id;
  const key = normalizeDishName(name ?? '');
  return key ? DISH_NAME_TO_ID[key] ?? null : null;
}
`;

const imagesTs = `/** Auto-generated card WebP requires — do not edit by hand. */
export const DISH_CARD_IMAGES: Record<string, number> = {
${imageLines.join('\n')}
};
`;

const searchTs = `/** Auto-generated searchable dish list — do not edit by hand. */
export type CatalogDishSearchItem = {
  id: string;
  name: string;
  mealTypes: string[];
  cuisine: string;
  cookTimeMins: number;
};

export const DISH_CATALOG_SEARCH: CatalogDishSearchItem[] = [
${searchLines.join('\n')}
];
`;

fs.writeFileSync(OUT_INDEX, indexTs);
fs.writeFileSync(OUT_IMAGES, imagesTs);
fs.writeFileSync(OUT_SEARCH, searchTs);
console.log(`Wrote ${catalog.length} dishes → index (${indexMap.size} keys), ${imageLines.length} card images, ${searchLines.length} search rows (${missing} missing files)`);
