#!/usr/bin/env node
/**
 * Production browser player → dist-web/ (served at https://ivplayer.tr/app/).
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const child = spawn(npxCmd, ['vite', 'build', '--mode', 'web'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
