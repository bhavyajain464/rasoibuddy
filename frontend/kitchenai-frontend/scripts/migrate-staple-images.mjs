#!/usr/bin/env node
/**
 * Copy legacy kebab-case staple webps to catalog snake_case ids.
 * Run: node scripts/migrate-staple-images.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAPLES_DIR = path.resolve(__dirname, '../assets/staples');

const LEGACY_TO_CATALOG = {
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

let copied = 0;
let skipped = 0;

for (const [legacy, catalogId] of Object.entries(LEGACY_TO_CATALOG)) {
  const src = path.join(STAPLES_DIR, `${legacy}.webp`);
  const dest = path.join(STAPLES_DIR, `${catalogId}.webp`);
  if (!fs.existsSync(src)) {
    console.warn(`skip (missing source): ${legacy}.webp`);
    skipped++;
    continue;
  }
  if (fs.existsSync(dest)) {
    console.log(`skip (exists): ${catalogId}.webp`);
    skipped++;
    continue;
  }
  fs.copyFileSync(src, dest);
  console.log(`copied ${legacy}.webp → ${catalogId}.webp`);
  copied++;
}

console.log(`Done: ${copied} copied, ${skipped} skipped`);
