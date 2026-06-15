#!/usr/bin/env node
/**
 * Generate bundled staple WebP requires + ingredient name → id index.
 * Run: node scripts/generate-staple-image-maps.mjs
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
const OUT_IMAGES = path.join(ROOT, 'src/data/catalogStapleImages.ts');
const OUT_INDEX = path.join(ROOT, 'src/data/ingredientImageIndex.ts');

function norm(s) {
  return s.trim().toLowerCase();
}

function needsQuotedKey(id) {
  return /[^a-zA-Z0-9_$]/.test(id);
}

function keyFmt(id) {
  return needsQuotedKey(id) ? `'${id}'` : id;
}

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const ingredients = catalog.ingredients ?? [];
const webpIds = new Set(
  fs
    .readdirSync(STAPLES_DIR)
    .filter((f) => f.endsWith('.webp'))
    .map((f) => f.replace(/\.webp$/, '')),
);

const imageLines = [];
const indexMap = new Map();
let missingImages = 0;

for (const ing of ingredients) {
  const id = ing.id;
  if (!id) continue;

  const keys = new Set([norm(ing.canonical)]);
  for (const syn of ing.synonyms ?? []) {
    const k = norm(syn);
    if (k) keys.add(k);
  }
  for (const k of keys) {
    if (k && !indexMap.has(k)) indexMap.set(k, id);
  }

  if (!webpIds.has(id)) {
    missingImages++;
    continue;
  }
  imageLines.push(`  ${keyFmt(id)}: require('../../assets/staples/${id}.webp'),`);
}

const imagesTs = `/** Auto-generated staple WebP requires — do not edit by hand. */
export const CATALOG_STAPLE_IMAGES: Record<string, number> = {
${imageLines.join('\n')}
};
`;

const indexEntries = [...indexMap.entries()].map(
  ([k, id]) => `  ${JSON.stringify(k)}: ${JSON.stringify(id)},`,
);

const indexTs = `/** Auto-generated from ingredients/catalog.json — do not edit by hand. */
export function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase();
}

/** Normalized ingredient name/synonym → catalog id. */
export const INGREDIENT_NAME_TO_ID: Record<string, string> = {
${indexEntries.join('\n')}
};

export function resolveIngredientImageId(
  name?: string | null,
  ingredientId?: string | null,
): string | null {
  const id = ingredientId?.trim();
  if (id) return id;
  const key = normalizeIngredientName(name ?? '');
  return key ? INGREDIENT_NAME_TO_ID[key] ?? null : null;
}
`;

fs.writeFileSync(OUT_IMAGES, imagesTs);
fs.writeFileSync(OUT_INDEX, indexTs);

console.log(`Wrote ${imageLines.length} image requires → ${OUT_IMAGES}`);
console.log(`Wrote ${indexMap.size} name keys → ${OUT_INDEX}`);
console.log(`Catalog ingredients missing webp: ${missingImages}`);
