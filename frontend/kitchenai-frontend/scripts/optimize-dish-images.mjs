#!/usr/bin/env node
/**
 * Export app-ready WebP variants from PNG masters.
 *
 * Reads catalog ids from backend/internal/services/dishes/catalog.json.
 * For each dish:
 *   masters/{id}.png     — full-res archive (moved from dishes/ if needed)
 *   {id}.webp            — 1024×683 hero (primary CDN / detail)
 *   card/{id}.webp       — 512×341 card banners
 *   thumb/{id}.webp      — 256×171 list thumbnails
 *
 * Usage:
 *   node scripts/optimize-dish-images.mjs
 *   node scripts/optimize-dish-images.mjs --id moong-dal-khichdi
 *   node scripts/optimize-dish-images.mjs --force
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..', '..');
const CATALOG = path.join(REPO, 'backend/internal/services/dishes/catalog.json');
const DISHES = path.join(ROOT, 'assets/dishes');
const MASTERS = path.join(DISHES, 'masters');
const CARD = path.join(DISHES, 'card');
const THUMB = path.join(DISHES, 'thumb');

const VARIANTS = [
  { name: 'hero', dir: DISHES, w: 1024, h: 683, suffix: '.webp' },
  { name: 'card', dir: CARD, w: 512, h: 341, suffix: '.webp' },
  { name: 'thumb', dir: THUMB, w: 256, h: 171, suffix: '.webp' },
];

const args = process.argv.slice(2);
const force = args.includes('--force');
const idFlag = args.indexOf('--id');
const onlyId = idFlag >= 0 ? args[idFlag + 1] : null;

function allVariantsExist(id) {
  return VARIANTS.every((v) => {
    const out = path.join(v.dir, v.name === 'hero' ? `${id}.webp` : `${id}.webp`);
    return fs.existsSync(out);
  });
}

async function exportVariants(masterPath, id) {
  for (const v of VARIANTS) {
    const out = path.join(v.dir, `${id}.webp`);
    await sharp(masterPath)
      .resize(v.w, v.h, { fit: 'cover', position: 'centre' })
      .webp({ quality: 85, effort: 4 })
      .toFile(out);
  }
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const ids = onlyId ? [onlyId] : catalog.map((d) => d.id);

  fs.mkdirSync(MASTERS, { recursive: true });
  fs.mkdirSync(CARD, { recursive: true });
  fs.mkdirSync(THUMB, { recursive: true });

  let done = 0;
  let skipped = 0;
  let missing = 0;

  for (const id of ids) {
    const masterInMasters = path.join(MASTERS, `${id}.png`);
    const masterInRoot = path.join(DISHES, `${id}.png`);

    if (!force && allVariantsExist(id) && fs.existsSync(masterInMasters)) {
      skipped++;
      continue;
    }

    let masterPath = masterInMasters;
    if (fs.existsSync(masterInRoot)) {
      if (!fs.existsSync(masterInMasters)) {
        fs.renameSync(masterInRoot, masterInMasters);
      }
      masterPath = masterInMasters;
    } else if (!fs.existsSync(masterInMasters)) {
      console.warn(`skip (no master): ${id}`);
      missing++;
      continue;
    }

    await exportVariants(masterPath, id);
    done++;
    if (done % 25 === 0) console.log(`… ${done} exported`);
  }

  const heroCount = fs.readdirSync(DISHES).filter((f) => f.endsWith('.webp')).length;
  const cardCount = fs.readdirSync(CARD).filter((f) => f.endsWith('.webp')).length;
  const thumbCount = fs.readdirSync(THUMB).filter((f) => f.endsWith('.webp')).length;
  const masterCount = fs.readdirSync(MASTERS).filter((f) => f.endsWith('.png')).length;

  console.log(`Exported: ${done}, skipped: ${skipped}, missing master: ${missing}`);
  console.log(`masters: ${masterCount} | hero: ${heroCount} | card: ${cardCount} | thumb: ${thumbCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
