#!/usr/bin/env node
/**
 * Production Android web bundle → dist-android/, Capacitor sync, debug APK.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const gradleCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited ${code ?? 1}`));
    });
    child.on('error', reject);
  });
}

await run(npxCmd, ['vite', 'build', '--mode', 'android']);
await run(npxCmd, ['cap', 'sync', 'android']);
await run(gradleCmd, ['assembleDebug'], join(root, 'android'));

const apkSrc = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const distDir = join(root, 'dist-android');
const siteDir = join(root, 'public-site', 'downloads');
mkdirSync(distDir, { recursive: true });
mkdirSync(siteDir, { recursive: true });
copyFileSync(apkSrc, join(distDir, 'IvPlayer-1.0.0-debug.apk'));
copyFileSync(apkSrc, join(siteDir, 'IvPlayer-1.0.0.apk'));
console.log('Copied APK to dist-android/ and public-site/downloads/');
