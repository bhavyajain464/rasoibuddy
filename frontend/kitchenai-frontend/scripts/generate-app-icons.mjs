#!/usr/bin/env node
/**
 * Generate app icons from the icon-only source PNG:
 *   favicon.png          — 1173×1173, circular (web tab)
 *   icon.png             — 1024×1024, square white
 *   splash-icon.png      — 1024×1024, square white
 *   adaptive-icon.png    — 1024×1024, square white
 *   notification-icon.png — 1024×1024, square white
 */
import { existsSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = resolve(ROOT, 'assets');
/** Padding around detected artwork inside the square crop. */
const PAD_PX = 48;
/** How much of the canvas the artwork fills (square icons). */
const FILL_SQUARE = 0.83;
/** Smaller than square fill so the circular favicon mask does not clip corners. */
const FILL_FAVICON = 0.72;
const VISUAL_SHIFT_X = 10;
const APP_ICON_BG = { r: 255, g: 255, b: 255, alpha: 1 };
const DEFAULT_SRC = resolve(
  process.env.HOME ?? '',
  'Downloads/Gemini_Generated_Image_ouj1qsouj1qsouj1.png',
);

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

function contentCentroid(data, w, h, c) {
  let sumX = 0;
  let sumY = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      if (isContent(data[i], data[i + 1], data[i + 2])) {
        sumX += x;
        sumY += y;
        n++;
      }
    }
  }
  return { cx: sumX / n, cy: sumY / n };
}

function flattenBackground(buf, w, h, c, bg) {
  const out = Buffer.from(buf);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      if (!isContent(out[i], out[i + 1], out[i + 2])) {
        out[i] = bg.r;
        out[i + 1] = bg.g;
        out[i + 2] = bg.b;
        out[i + 3] = 255;
      }
    }
  }
  return out;
}

async function buildIconSquare(srcPath, side, bg, fill, padPx = PAD_PX, shiftX = VISUAL_SHIFT_X) {
  const { data, info } = await sharp(srcPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const box = contentBBox(data, width, height, channels);

  const contentW = box.maxX - box.minX + 1;
  const contentH = box.maxY - box.minY + 1;
  const cropSide = Math.max(contentW, contentH) + padPx * 2;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const left = Math.round(cx - cropSide / 2);
  const top = Math.round(cy - cropSide / 2);

  const pasteLeft = Math.max(0, -left);
  const pasteTop = Math.max(0, -top);
  const srcLeft = Math.max(0, left);
  const srcTop = Math.max(0, top);
  const srcW = Math.min(width - srcLeft, cropSide - pasteLeft);
  const srcH = Math.min(height - srcTop, cropSide - pasteTop);

  const pieceRaw = await sharp(srcPath)
    .extract({ left: srcLeft, top: srcTop, width: srcW, height: srcH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const flatPiece = flattenBackground(pieceRaw.data, srcW, srcH, channels, bg);

  const cropSquare = await sharp({
    create: { width: cropSide, height: cropSide, channels: 4, background: bg },
  })
    .composite([
      {
        input: await sharp(flatPiece, {
          raw: { width: srcW, height: srcH, channels },
        })
          .png()
          .toBuffer(),
        left: pasteLeft,
        top: pasteTop,
      },
    ])
    .raw()
    .toBuffer({ resolveWithObject: true });

  const flatSquare = flattenBackground(cropSquare.data, cropSide, cropSide, 4, bg);
  const target = Math.round(side * fill);
  const scale = target / cropSide;
  const { cx: massX, cy: massY } = contentCentroid(flatSquare, cropSide, cropSide, 4);

  const icon = await sharp(flatSquare, { raw: { width: cropSide, height: cropSide, channels: 4 } })
    .resize(target, target)
    .png()
    .toBuffer();

  const pasteX = Math.round(side / 2 - massX * scale + shiftX);
  const pasteY = Math.round(side / 2 - massY * scale);

  return sharp({
    create: { width: side, height: side, channels: 4, background: bg },
  })
    .composite([{ input: icon, left: pasteX, top: pasteY }])
    .png()
    .toBuffer();
}

async function buildFavicon(srcPath, outPath, side) {
  const square = await buildIconSquare(srcPath, side, APP_ICON_BG, FILL_FAVICON);
  const circle = Buffer.from(
    `<svg width="${side}" height="${side}"><circle cx="${side / 2}" cy="${side / 2}" r="${side / 2}" fill="white"/></svg>`,
  );
  await sharp(square).composite([{ input: circle, blend: 'dest-in' }]).png().toFile(outPath);
  console.log(`  ${outPath} (${side}×${side}, circular, fill ${FILL_FAVICON})`);
}

async function buildSquareIcon(srcPath, outPath, side) {
  const square = await buildIconSquare(srcPath, side, APP_ICON_BG, FILL_SQUARE);
  await sharp(square).png().toFile(outPath);
  console.log(`  ${outPath} (${side}×${side}, fill ${FILL_SQUARE})`);
}

async function buildNavMark(srcPath) {
  const side = 320;
  const square = await buildIconSquare(srcPath, side, APP_ICON_BG, 0.98);
  const outPath = resolve(ASSETS, 'icon-mark.png');
  await sharp(square).png().toFile(outPath);
  copyFileSync(outPath, resolve(ROOT, 'public/icon-mark.png'));
  console.log(`  ${outPath} (${side}×${side}, tight crop for nav)`);
}

async function main(srcPath) {
  console.log(`Source: ${srcPath}`);
  await buildFavicon(srcPath, resolve(ASSETS, 'favicon.png'), 1173);
  for (const name of ['icon', 'splash-icon', 'adaptive-icon', 'notification-icon']) {
    await buildSquareIcon(srcPath, resolve(ASSETS, `${name}.png`), 1024);
  }
  copyFileSync(resolve(ASSETS, 'icon.png'), resolve(ROOT, 'public/icon.png'));
  await buildNavMark(srcPath);
}

const srcPath = resolve(process.argv[2] ?? DEFAULT_SRC);
if (!existsSync(srcPath)) {
  console.error(`Not found: ${srcPath}`);
  process.exit(1);
}

await main(srcPath);
