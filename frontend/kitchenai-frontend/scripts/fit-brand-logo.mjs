#!/usr/bin/env node
/**
 * Fit full wordmark logo into 1173×912 with even white margins (login, onboarding, web).
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_W = 1173;
const OUT_H = 912;
const MARGIN_RATIO = 0.86; // ~7% padding per side
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const DEFAULT_SRC = resolve(
  process.env.HOME ?? '',
  'Downloads/Gemini_Generated_Image_s1q0lss1q0lss1q0.png',
);
const DEFAULT_OUT = resolve(ROOT, 'assets/logo.png');

function isContent(r, g, b) {
  return !(r >= 250 && g >= 250 && b >= 250);
}

function contentBBox(data, w, h, c) {
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      if (isContent(data[i], data[i + 1], data[i + 2])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

function normalizeMatteWhite(buf, channels) {
  const out = Buffer.from(buf);
  for (let i = 0; i < out.length; i += channels) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (min >= 248 && max - min <= 8) {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

async function fitLogo(srcPath, outPath) {
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const box = contentBBox(data, width, height, channels);
  const cropW = box.maxX - box.minX + 1;
  const cropH = box.maxY - box.minY + 1;

  const maxW = Math.round(OUT_W * MARGIN_RATIO);
  const maxH = Math.round(OUT_H * MARGIN_RATIO);
  const scale = Math.min(maxW / cropW, maxH / cropH);
  const targetW = Math.round(cropW * scale);
  const targetH = Math.round(cropH * scale);

  const cropped = await sharp(srcPath)
    .extract({ left: box.minX, top: box.minY, width: cropW, height: cropH })
    .resize(targetW, targetH)
    .png()
    .toBuffer();

  const pasteX = Math.round((OUT_W - targetW) / 2);
  const pasteY = Math.round((OUT_H - targetH) / 2);

  const composed = await sharp({
    create: { width: OUT_W, height: OUT_H, channels: 4, background: WHITE },
  })
    .composite([{ input: cropped, left: pasteX, top: pasteY }])
    .raw()
    .toBuffer({ resolveWithObject: true });

  const normalized = normalizeMatteWhite(composed.data, composed.info.channels);

  await sharp(normalized, {
    raw: { width: OUT_W, height: OUT_H, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  copyFileSync(outPath, resolve(ROOT, 'public/logo.png'));
  console.log(`Fitted logo: ${outPath} (${OUT_W}×${OUT_H}, content ${targetW}×${targetH})`);
}

const srcPath = resolve(process.argv[2] ?? DEFAULT_SRC);
const outPath = resolve(process.argv[3] ?? DEFAULT_OUT);

if (!existsSync(srcPath)) {
  console.error(`Not found: ${srcPath}`);
  process.exit(1);
}

await fitLogo(srcPath, outPath);
