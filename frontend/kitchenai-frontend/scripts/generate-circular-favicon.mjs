#!/usr/bin/env node
/** @deprecated Use scripts/generate-app-icons.mjs */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'generate-app-icons.mjs');
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
