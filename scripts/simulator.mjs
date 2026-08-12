#!/usr/bin/env node
/**
 * IvPlayer — Browser / TV Simulator entry.
 * Starts Vite with Hot Reload, HMR, Fast Refresh and source maps.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const command = process.argv[2] ?? 'dev';

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

/** @type {Record<string, string[]>} */
const scripts = {
  dev: ['vite', '--mode', 'simulator'],
  build: ['vite', 'build', '--mode', 'simulator'],
  run: ['vite', 'preview', '--mode', 'simulator', '--outDir', 'dist-simulator'],
};

const args = scripts[command];
if (!args) {
  console.error(`Unknown simulator command: ${command}`);
  console.error('Usage: node scripts/simulator.mjs [dev|build|run]');
  process.exit(1);
}

console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║   IvPlayer — Simulator (Browser)         ║');
console.log('╠══════════════════════════════════════════════╣');
console.log('║  Platform : BrowserPlatform                  ║');
console.log('║  Target   : simulator                        ║');
console.log('║  HMR      : enabled                          ║');
console.log('║  Fast Refresh / Source Maps : enabled         ║');
console.log('╠══════════════════════════════════════════════╣');
console.log('║  Remote keys: ↑ ↓ ← →  Enter  Esc/Backspace  ║');
console.log('║  Dev overlay: ↑ ↑ ↓ ↓ ← → Enter              ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');

const child = spawn(npxCmd, args, {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_PLATFORM: 'browser',
    VITE_APP_TARGET: 'simulator',
  },
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
