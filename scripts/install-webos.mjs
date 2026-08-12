#!/usr/bin/env node
/**
 * Install IvPlayer IPK onto a registered LG webOS device / emulator.
 *
 * Usage:
 *   node scripts/install-webos.mjs [--device <name>]
 *   WEBOS_DEVICE=myTV npm run tv:install
 */
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const device = getArg('--device') ?? process.env.WEBOS_DEVICE ?? 'emulator';

const ipks = readdirSync(root).filter(
  (f) => f.startsWith('com.ivplayer.iptv') && f.endsWith('.ipk'),
);

if (ipks.length === 0) {
  console.error('No IPK found. Run npm run tv:package first.');
  process.exit(1);
}

const ipk = ipks.sort().at(-1);
if (!ipk) {
  console.error('No IPK found.');
  process.exit(1);
}

console.log(`→ Installing ${ipk} on device "${device}"...\n`);

const result = spawnSync('ares-install', ['--device', device, ipk], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

if (result.error) {
  console.error('\nares-install failed. Is webOS TV CLI installed and device registered?');
  console.error('  ares-setup-device');
  console.error('  ares-device-info --device ' + device);
  process.exit(1);
}

process.exit(result.status ?? 1);
