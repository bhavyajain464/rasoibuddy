#!/usr/bin/env node
/**
 * Staple thumbnails: Twemoji + per-id accent on cream background → 128×128 WebP.
 * Photo overrides for ingredients with realistic assets in assets/dishes/.
 *
 * Run: npm run generate:staple-images
 * Force all: npm run generate:staple-images -- --force
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.resolve(
  ROOT,
  '../../backend/internal/services/ingredients/catalog.json',
);
const STAPLES_DIR = path.join(ROOT, 'assets/staples');
const CACHE_DIR = path.join(ROOT, 'scripts/.twemoji-cache');
/** Photo WebP exports are much larger than Twemoji tiles (~1 KB). */
const MIN_ILLUSTRATED_BYTES = 8000;
const BG = '#F3F4F2';
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';
const force = process.argv.includes('--force');

/** Realistic photo sources (optional). Filename must match catalog id. */
const PHOTO_SOURCES = {
  wheat_flour: path.join(ROOT, 'assets/dishes/atta-v2.png'),
  basmati_rice: path.join(ROOT, 'assets/dishes/basmati-rice.png'),
};

const CATEGORY_EMOJI = {
  vegetables: '🥬',
  leafy_greens: '🥬',
  fruits: '🍎',
  herbs: '🌿',
  spices: '🧂',
  spice_blends: '🏺',
  grains_cereals: '🌾',
  flours: '🌾',
  pulses_legumes: '🍲',
  dairy: '🥛',
  eggs: '🥚',
  poultry: '🍗',
  meat: '🥩',
  seafood: '🐟',
  nuts: '🥜',
  seeds: '🌰',
  dry_fruits: '🍇',
  oils_fats: '🛢️',
  condiments_sauces: '🏺',
  sweeteners: '🍯',
  baking: '🧁',
  beverages: '☕',
  staples_packaged: '📦',
  other: '🍽️',
};

/** Explicit overrides — onboarding staples and common pantry items. */
const ID_EMOJI = {
  wheat_flour: '🌾',
  basmati_rice: '🍚',
  rice: '🍚',
  rice_flour: '⚪',
  gram_flour: '🥣',
  semolina: '🟡',
  all_purpose_flour: '⚪',
  poha: '🍚',
  toor_dal: '🟡',
  moong_dal: '🟢',
  chana_dal: '🟠',
  masoor_dal: '🔴',
  urad_dal: '⚫',
  rajma: '🍲',
  kabuli_chana: '🍲',
  turmeric_powder: '🟡',
  red_chilli_powder: '🌶️',
  coriander_powder: '🌿',
  cumin_powder: '🟤',
  garam_masala: '🏺',
  sambar_powder: '🫕',
  rasam_powder: '🍲',
  kasuri_methi: '🍃',
  cumin_seeds: '🟤',
  mustard_seeds: '🟡',
  fenugreek_seeds: '🌱',
  fennel_seeds: '🟢',
  carom_seeds: '🌿',
  asafoetida: '🫙',
  black_pepper: '⚫',
  cinnamon: '🟤',
  bay_leaf: '🍃',
  cardamom_green: '💚',
  cloves: '🫚',
  dry_red_chilli: '🌶️',
  dry_mango_powder: '🥭',
  poppy_seeds: '⚪',
  tamarind: '🟤',
  sesame_seeds: '🌰',
  sunflower_oil: '🌻',
  mustard_oil: '🟡',
  coconut_oil: '🥥',
  ghee: '🧀',
  salt: '🧂',
  sugar: '🍬',
  jaggery: '🟫',
  tea: '🍵',
  coffee: '☕',
  milk: '🥛',
  curd: '🥛',
  butter: '🧈',
  paneer: '🧀',
  peanut: '🥜',
  cashew: '🥜',
  coconut: '🥥',
  vermicelli: '🍝',
  onion: '🧅',
  tomato: '🍅',
  potato: '🥔',
  green_chilli: '🌶️',
  ginger: '🫚',
  garlic: '🧄',
  coriander_leaves: '🌿',
  curry_leaves: '🍃',
  lemon: '🍋',
};

const KEYWORD_RULES = [
  [/carrot/, '🥕'],
  [/beet|beetroot/, '🟣'],
  [/radish|mooli/, '🔴'],
  [/cauliflower|gobi/, '🥦'],
  [/cabbage/, '🥬'],
  [/broccoli/, '🥦'],
  [/capsicum|bell.?pepper|shimla/, '🌶️'],
  [/brinjal|eggplant|baingan/, '🍆'],
  [/okra|bhindi/, '🥒'],
  [/gourd|lauki|turai|karela|bitter/, '🥒'],
  [/spinach|palak/, '🥬'],
  [/\bkasuri methi\b|\bmethi leaves\b|\bfenugreek leaves\b/, '🍃'],
  [/lettuce/, '🥬'],
  [/cucumber|kakdi/, '🥒'],
  [/mushroom/, '🍄'],
  [/corn|makka|sweet.?corn/, '🌽'],
  [/\bpeas\b|\bmatar\b/, '🟢'],
  [/\bpeanut\b|\bgroundnut\b|\bmungfali\b|\bmoongphali\b/, '🥜'],
  [/\bcashew\b|\bkaju\b/, '🥜'],
  [/\balmond\b|\bbadam\b/, '🥜'],
  [/\bwalnut\b|\bpistachio\b/, '🥜'],
  [/\bcoconut\b|\bnariyal\b/, '🥥'],
  [/\b(toor|moong|urad|masoor|chana)\s*dal\b|\bdal\b|\blentil\b|\brajma\b|\blobia\b/, '🍲'],
  [/\brice\b|\bpoha\b|\bmillet\b|\bragi\b|\bjowar\b|\bbajra\b|\bquinoa\b|\boats\b|\bbarley\b/, '🌾'],
  [/\bflour\b|\batta\b|\bbesan\b|\bmaida\b|\bsooji\b|\brava\b|\bsemolina\b/, '🌾'],
  [/chicken|murgh|poultry/, '🍗'],
  [/mutton|lamb|goat|meat|beef|pork/, '🥩'],
  [/fish|prawn|shrimp|crab|seafood|pomfret|hilsa/, '🐟'],
  [/\begg\b/, '🥚'],
  [/\bmilk\b|\bdoodh\b|\bcurd\b|\byogurt\b|\bbuttermilk\b|\blassi\b/, '🥛'],
  [/\bpaneer\b|\bcheese\b|\bbutter\b|\bghee\b|\bcream\b/, '🧀'],
  [/\boil\b|\bvanaspati\b/, '🛢️'],
  [/\bsalt\b/, '🧂'],
  [/\bsugar\b|\bjaggery\b|\bhoney\b/, '🍯'],
  [/\btea\b|\bchai\b/, '🍵'],
  [/\bcoffee\b/, '☕'],
  [
    /\bspice\b|\bmasala\b|\bpepper\b|\bcumin\b|\bmustard seed\b|\bcardamom\b|\bclove\b|\bnutmeg\b|\bturmeric\b|\bchilli\b|\bchili\b|\bpaprika\b|\bsaffron\b/,
    '🌶️',
  ],
  [/sauce|ketchup|chutney|pickle|vinegar|soy/, '🏺'],
  [/onion|shallot|spring.?onion/, '🧅'],
  [/tomato/, '🍅'],
  [/potato|aloo/, '🥔'],
  [/garlic|lahsun/, '🧄'],
  [/ginger|adrak/, '🫚'],
  [/chilli|chili|mirch/, '🌶️'],
  [/lemon|lime|nimbu/, '🍋'],
  [/banana/, '🍌'],
  [/mango/, '🥭'],
  [/apple/, '🍎'],
  [/orange|mosambi/, '🍊'],
  [/grape/, '🍇'],
  [/watermelon/, '🍉'],
  [/papaya/, '🫐'],
  [/pineapple/, '🍍'],
  [/pomegranate|anaar/, '🍎'],
  [/bread|pav|roti|naan/, '🍞'],
  [/chocolate|cocoa/, '🍫'],
  [/biscuit|cookie/, '🍪'],
  [/noodle|pasta|vermicelli|sevai/, '🍜'],
  [/jam|jelly/, '🏺'],
  [/baking|yeast|baking.?powder/, '🧁'],
  [/\bnut\b/, '🥜'],
];

function emojiToCodepoint(emoji) {
  return [...emoji]
    .map(char => char.codePointAt(0).toString(16))
    .filter(cp => cp !== 'fe0f')
    .join('-');
}

function idAccentColor(id) {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  const sat = 45 + ((h >> 9) % 20);
  const light = 84 + ((h >> 17) % 8);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function pickEmoji(ing) {
  if (ID_EMOJI[ing.id]) return ID_EMOJI[ing.id];
  const hay = [
    ing.id.replace(/_/g, ' '),
    ing.canonical,
    ...(ing.synonyms ?? []).slice(0, 6),
  ]
    .join(' ')
    .toLowerCase();
  for (const [re, emoji] of KEYWORD_RULES) {
    if (re.test(hay)) return emoji;
  }
  return CATEGORY_EMOJI[ing.category] ?? '🍽️';
}

async function fetchEmojiPng(emoji) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cp = emojiToCodepoint(emoji);
  const cachePath = path.join(CACHE_DIR, `${cp}.png`);
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath);
  }
  const url = `${TWEMOJI_BASE}/${cp}.png`;
  const res = await fetch(url);
  if (!res.ok) {
    const fallback = '🍽️';
    const fbCp = emojiToCodepoint(fallback);
    const fbPath = path.join(CACHE_DIR, `${fbCp}.png`);
    if (fs.existsSync(fbPath)) return fs.readFileSync(fbPath);
    const fbRes = await fetch(`${TWEMOJI_BASE}/${fbCp}.png`);
    if (!fbRes.ok) throw new Error(`Twemoji fetch failed ${url} (${res.status})`);
    const buf = Buffer.from(await fbRes.arrayBuffer());
    fs.writeFileSync(fbPath, buf);
    return buf;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(cachePath, buf);
  return buf;
}

async function renderPhotoStaple(sourcePath) {
  return sharp(sourcePath)
    .resize(128, 128, { fit: 'cover', position: 'centre' })
    .webp({ quality: 85 })
    .toBuffer();
}

async function renderStaple(emoji, id) {
  const accent = idAccentColor(id);
  const accentSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">
      <rect width="128" height="128" fill="${BG}"/>
      <circle cx="64" cy="58" r="46" fill="${accent}"/>
    </svg>`,
  );
  const icon = await fetchEmojiPng(emoji);
  const base = await sharp(accentSvg).png().toBuffer();
  const resized = await sharp(icon).resize(72, 72).png().toBuffer();
  return sharp(base)
    .composite([{ input: resized, top: 22, left: 28 }])
    .webp({ quality: 85 })
    .toBuffer();
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  let created = 0;
  let photos = 0;
  let skipped = 0;

  for (const ing of catalog.ingredients) {
    const dest = path.join(STAPLES_DIR, `${ing.id}.webp`);
    const photoSrc = PHOTO_SOURCES[ing.id];
    const hasPhoto = photoSrc && fs.existsSync(photoSrc);

    if (!force && fs.existsSync(dest) && fs.statSync(dest).size >= MIN_ILLUSTRATED_BYTES) {
      skipped++;
      continue;
    }

    let webp;
    if (hasPhoto) {
      webp = await renderPhotoStaple(photoSrc);
      photos++;
    } else {
      const emoji = pickEmoji(ing);
      webp = await renderStaple(emoji, ing.id);
    }
    fs.writeFileSync(dest, webp);
    created++;
  }

  console.log(
    `Staple icons: ${created} generated (${photos} photos), ${skipped} illustrated kept`,
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
