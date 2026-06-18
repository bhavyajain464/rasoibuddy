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
const RESTAURANT_ROOT = path.resolve(ROOT, '../kitchenai-restaurant');
const CATALOG_PATH = path.resolve(
  ROOT,
  '../../backend/internal/services/ingredients/catalog.json',
);
const STAPLES_DIR = path.join(ROOT, 'assets/staples');

const APP_TARGETS = [
  {
    name: 'consumer',
    root: ROOT,
    staplesDir: STAPLES_DIR,
    requirePrefix: '../../assets/staples',
  },
  {
    name: 'restaurant',
    root: RESTAURANT_ROOT,
    staplesDir: STAPLES_DIR,
    requirePrefix: '../../../kitchenai-frontend/assets/staples',
  },
];

function writeStapleMaps({ root, staplesDir, requirePrefix }) {
  const outImages = path.join(root, 'src/data/catalogStapleImages.ts');
  const outIndex = path.join(root, 'src/data/ingredientImageIndex.ts');

  if (!fs.existsSync(staplesDir)) {
    console.warn(`Skip ${root}: missing ${staplesDir}`);
    return;
  }
  fs.mkdirSync(path.dirname(outImages), { recursive: true });
  fs.mkdirSync(path.dirname(outIndex), { recursive: true });

  const webpIds = new Set(
    fs
      .readdirSync(staplesDir)
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
    imageLines.push(`  ${keyFmt(id)}: require('${requirePrefix}/${id}.webp'),`);
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

  fs.writeFileSync(outImages, imagesTs);
  fs.writeFileSync(outIndex, indexTs);
  console.log(
    `[${path.basename(root)}] ${imageLines.length} images, ${indexMap.size} name keys (missing webp: ${missingImages})`,
  );
}

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

for (const target of APP_TARGETS) {
  writeStapleMaps(target);
}
