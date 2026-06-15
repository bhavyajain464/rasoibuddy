#!/usr/bin/env node
/**
 * Build vector illustration prompts for ingredient catalog entries.
 * Used by Cursor batch generation and optimize-staple-images.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const CATALOG_PATH = path.resolve(
  ROOT,
  '../../backend/internal/services/ingredients/catalog.json',
);

const PRESENTATION = {
  vegetables: 'a small woven basket of fresh',
  leafy_greens: 'a neat bunch of fresh',
  fruits: 'two ripe',
  herbs: 'a small sprig of fresh',
  spices: 'a small brass bowl of',
  spice_blends: 'a small spice tin of',
  grains_cereals: 'a small gunny sack of',
  flours: 'a small cloth bag of',
  pulses_legumes: 'a small steel bowl of',
  dairy: 'a small ceramic dish of',
  eggs: 'a small basket of',
  poultry: 'a small plate of raw',
  meat: 'a small butcher tray of',
  seafood: 'a small ice tray of fresh',
  nuts: 'a small wooden bowl of',
  seeds: 'a small spice bowl of',
  dry_fruits: 'a small bowl of dried',
  oils_fats: 'a clear glass bottle of',
  condiments_sauces: 'a small glass jar of',
  sweeteners: 'a small glass jar of',
  baking: 'a small pantry packet of',
  beverages: 'a small canister of',
  staples_packaged: 'a labeled pantry package of',
  other: 'a small bowl of',
};

function visualDescription(ing) {
  const name = ing.canonical;
  const id = ing.id;
  const lower = name.toLowerCase();
  const cat = ing.category;

  if (id.includes('powder') || lower.includes(' powder')) {
    return `finely ground ${name} in warm natural spice colors, heaped in a bowl`;
  }
  if (id.endsWith('_seeds') || id.endsWith('_seed') || lower.includes(' seeds')) {
    return `whole dried ${name} with accurate seed shape, size, and natural color`;
  }
  if (id.includes('_oil') || lower.endsWith(' oil')) {
    return `${name} in a clear bottle showing the oil's true golden tone`;
  }
  if (cat === 'pulses_legumes') {
    return `split ${name} with accurate lentil color and texture, ready for cooking`;
  }
  if (cat === 'flours') {
    return `fine ${name} with soft powdery texture and natural off-white or golden tone`;
  }
  if (cat === 'grains_cereals') {
    return `${name} grains with accurate shape, size, and natural color`;
  }
  if (cat === 'dairy') {
    return `${name} with realistic Indian kitchen presentation and natural color`;
  }
  if (cat === 'spice_blends') {
    return `aromatic ${name} blend with warm masala tones in a small tin`;
  }
  if (cat === 'leafy_greens' || cat === 'herbs') {
    return `fresh ${name} leaves with vibrant natural green tones`;
  }
  if (cat === 'vegetables' || cat === 'fruits') {
    return `fresh ${name} with accurate shape, skin color, and natural detail`;
  }
  if (cat === 'nuts' || cat === 'seeds') {
    return `${name} with accurate shell or seed form and natural brown tones`;
  }
  return `${name} with accurate color, shape, and recognizable Indian pantry form`;
}

function garnishHint(ing) {
  const cat = ing.category;
  if (cat === 'spices' || cat === 'spice_blends') return 'a few whole spice accents nearby';
  if (cat === 'vegetables' || cat === 'leafy_greens') return 'a few water droplets for freshness';
  if (cat === 'pulses_legumes' || cat === 'grains_cereals' || cat === 'flours') {
    return 'a small wooden scoop resting beside it';
  }
  if (cat === 'oils_fats') return 'a few drops on the counter for shine';
  return 'a subtle kitchen accent nearby';
}

function contextHint(ing) {
  const cat = ing.category;
  if (['spices', 'spice_blends', 'seeds'].includes(cat)) {
    return 'a small masala dabba and folded checkered dish towel';
  }
  if (['pulses_legumes', 'grains_cereals', 'flours'].includes(cat)) {
    return 'a steel dabba and folded checkered dish towel';
  }
  return 'a hint of a stovetop, a folded checkered dish towel, and a small steel bowl';
}

/** Vector pantry icon prompt adapted from the dish photography template. */
export function buildStapleImagePrompt(ing) {
  const name = ing.canonical;
  const presentation = PRESENTATION[ing.category] ?? PRESENTATION.other;
  const visual = visualDescription(ing);
  const garnish = garnishHint(ing);
  const context = contextHint(ing);

  return (
    `A clean flat vector illustration icon of ${presentation} ${name} resting on a soft cream (#F3F4F2) background in a cozy Indian home kitchen pantry style. ` +
    `The ingredient features ${visual}. It is styled with ${garnish}. ` +
    `In the softly simplified background, there is a warm inviting kitchen setting with ${context}. ` +
    `Soft warm morning light, flat vector art with crisp outlines and subtle gradients — no photorealism, no photography, no text, no labels, no watermark. ` +
    `Square composition, centered, high contrast, recognizable at small mobile app thumbnail size, appetizing and friendly.`
  );
}

export function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')).ingredients ?? [];
}

export function getIngredient(id) {
  return loadCatalog().find((ing) => ing.id === id) ?? null;
}

function parseArgs(argv) {
  const args = { ids: [], limit: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--id' && argv[i + 1]) args.ids.push(argv[++i]);
    else if (argv[i] === '--limit' && argv[i + 1]) args.limit = Number(argv[++i]);
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

if (process.argv[1]?.endsWith('staple-image-prompts.mjs')) {
  const args = parseArgs(process.argv.slice(2));
  let items = loadCatalog();
  if (args.ids.length) items = items.filter((ing) => args.ids.includes(ing.id));
  if (args.limit) items = items.slice(0, args.limit);
  for (const ing of items) {
    if (args.dryRun) {
      console.log(`\n# ${ing.id} — ${ing.canonical}`);
      console.log(buildStapleImagePrompt(ing));
    } else {
      console.log(JSON.stringify({ id: ing.id, name: ing.canonical, prompt: buildStapleImagePrompt(ing) }));
    }
  }
}
