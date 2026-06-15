#!/usr/bin/env node
/** Flatten logo.png off-white paper texture to #FFFFFF for login/onboarding headers. */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT = resolve(ROOT, 'assets/logo.png');
const WHITE = { r: 255, g: 255, b: 255 };

function isBackground(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  if (min >= 200 && sat <= 36) return true;
  if (min >= 175 && sat <= 18) return true;
  return false;
}

async function flattenLogo(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const out = Buffer.from(data);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      if (isBackground(out[i], out[i + 1], out[i + 2])) {
        out[i] = WHITE.r;
        out[i + 1] = WHITE.g;
        out[i + 2] = WHITE.b;
        out[i + 3] = 255;
      }
    }
  }

  await sharp(out, { raw: { width: w, height: h, channels: c } }).png().toFile(path);
  copyFileSync(path, resolve(ROOT, 'public/logo.png'));
  console.log(`Flattened logo background: ${path} (${w}×${h})`);
}

const target = resolve(process.argv[2] ?? DEFAULT);
if (!existsSync(target)) {
  console.error(`Not found: ${target}`);
  process.exit(1);
}

await flattenLogo(target);
