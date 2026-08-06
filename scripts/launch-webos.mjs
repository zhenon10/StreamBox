#!/usr/bin/env node
/**
 * Launch StreamBox TV on a registered LG webOS device / emulator.
 *
 * Usage:
 *   node scripts/launch-webos.mjs [--device <name>]
 *   WEBOS_DEVICE=myTV npm run tv:launch
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const device = getArg('--device') ?? process.env.WEBOS_DEVICE ?? 'emulator';

let appId = 'com.streambox.iptv';
try {
  const appinfo = JSON.parse(
    readFileSync(join(root, 'webos', 'appinfo.json'), 'utf8'),
  );
  if (typeof appinfo.id === 'string') appId = appinfo.id;
} catch {
  // keep default
}

console.log(`→ Launching ${appId} on device "${device}"...\n`);

const result = spawnSync('ares-launch', ['--device', device, appId], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

if (result.error) {
  console.error('\nares-launch failed. Is webOS TV CLI installed and the app installed?');
  console.error('  npm run tv:install -- --device ' + device);
  process.exit(1);
}

process.exit(result.status ?? 1);
