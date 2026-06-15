#!/usr/bin/env node
/**
 * Export 128×128 WebP thumbnails from vector PNG masters.
 *
 *   assets/staples/masters/{id}.png  — full-res archive
 *   assets/staples/{id}.webp         — app thumbnail
 *
 * Usage:
 *   node scripts/optimize-staple-images.mjs
 *   node scripts/optimize-staple-images.mjs --id turmeric_powder
 *   node scripts/optimize-staple-images.mjs --force
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CATALOG_PATH } from './staple-image-prompts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STAPLES_DIR = path.join(ROOT, 'assets/staples');
const MASTERS = path.join(STAPLES_DIR, 'masters');
const SIZE = 128;

const args = process.argv.slice(2);
const force = args.includes('--force');
const idFlag = args.indexOf('--id');
const onlyId = idFlag >= 0 ? args[idFlag + 1] : null;

async function exportThumb(masterPath, id) {
  const out = path.join(STAPLES_DIR, `${id}.webp`);
  await sharp(masterPath)
    .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: 85, effort: 4 })
    .toFile(out);
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const ids = onlyId ? [onlyId] : (catalog.ingredients ?? []).map((ing) => ing.id);

  fs.mkdirSync(MASTERS, { recursive: true });

  let done = 0;
  let skipped = 0;
  let missing = 0;

  for (const id of ids) {
    const master = path.join(MASTERS, `${id}.png`);
    const out = path.join(STAPLES_DIR, `${id}.webp`);
    if (!fs.existsSync(master)) {
      missing++;
      continue;
    }
    if (!force && fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(master).mtimeMs) {
      skipped++;
      continue;
    }
    await exportThumb(master, id);
    done++;
    if (done % 25 === 0) console.log(`… ${done} exported`);
  }

  const masterCount = fs.readdirSync(MASTERS).filter((f) => f.endsWith('.png')).length;
  const webpCount = fs.readdirSync(STAPLES_DIR).filter((f) => f.endsWith('.webp')).length;
  console.log(`Exported: ${done}, skipped: ${skipped}, missing master: ${missing}`);
  console.log(`masters: ${masterCount} | webp: ${webpCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
