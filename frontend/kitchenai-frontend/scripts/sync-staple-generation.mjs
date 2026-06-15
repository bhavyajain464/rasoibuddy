#!/usr/bin/env node
/**
 * Sync Cursor-generated PNGs from ~/.cursor/.../assets into staples/masters,
 * export WebP thumbnails, and refresh progress + bundled maps.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CATALOG_PATH, ROOT } from './staple-image-prompts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CURSOR_ASSETS =
  process.env.CURSOR_ASSETS ??
  path.join(
    process.env.HOME ?? '',
    '.cursor/projects/Users-bhavyajain-Downloads-Projects-Kitchenai/assets',
  );
const MASTERS = path.join(ROOT, 'assets/staples/masters');
const PROGRESS = path.join(ROOT, 'assets/staples/.generation-progress.json');

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')).ingredients ?? [];
}

function sync() {
  const catalog = loadCatalog();
  const validIds = new Set(catalog.map((ing) => ing.id));
  fs.mkdirSync(MASTERS, { recursive: true });

  let copied = 0;
  if (fs.existsSync(CURSOR_ASSETS)) {
    for (const file of fs.readdirSync(CURSOR_ASSETS)) {
      if (!file.endsWith('.png')) continue;
      const id = file.replace(/\.png$/, '');
      if (!validIds.has(id)) continue;
      const src = path.join(CURSOR_ASSETS, file);
      const dest = path.join(MASTERS, file);
      const srcStat = fs.statSync(src);
      if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= srcStat.mtimeMs) continue;
      fs.copyFileSync(src, dest);
      copied++;
    }
  }

  spawnSync('node', [path.join(__dirname, 'optimize-staple-images.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  spawnSync('node', [path.join(__dirname, 'generate-staple-image-maps.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const have = new Set(
    fs.readdirSync(MASTERS).filter((f) => f.endsWith('.png')).map((f) => f.replace('.png', '')),
  );
  const pending = catalog.filter((ing) => !have.has(ing.id)).length;
  const payload = {
    ok: [...have].sort(),
    pending,
    total: catalog.length,
    updated: new Date().toISOString(),
  };
  fs.writeFileSync(PROGRESS, JSON.stringify(payload, null, 2) + '\n');

  console.log(`Synced ${copied} new masters | ${have.size}/${catalog.length} done | ${pending} pending`);
  return { copied, done: have.size, pending, total: catalog.length };
}

sync();
