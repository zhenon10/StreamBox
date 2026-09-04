#!/usr/bin/env node
/**
 * Play Store Android bundle: Vite --mode play → cap sync → signed AAB.
 * Sideload APK (assembleDebug) is a separate channel: npm run android:build
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(root, 'android');
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
// Bare "gradlew.bat" isn't always resolved from cwd by cmd.exe (depends on
// NoDefaultCurrentDirectoryInExePath) — force the explicit relative path.
const gradleCmd = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';

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

if (!existsSync(join(androidDir, 'keystore.properties'))) {
  console.error('Missing android/keystore.properties');
  console.error('Create the Play upload key first: npm run android:upload-key');
  process.exit(1);
}

await run(npxCmd, ['vite', 'build', '--mode', 'play']);
await run(npxCmd, ['cap', 'sync', 'android']);
await run(gradleCmd, ['bundleRelease'], androidDir);

const aabSrc = join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
if (!existsSync(aabSrc)) {
  console.error(`AAB not found: ${aabSrc}`);
  process.exit(1);
}

const distDir = join(root, 'dist-android');
mkdirSync(distDir, { recursive: true });
const aabDest = join(distDir, 'IvPlayer-1.0.0.aab');
copyFileSync(aabSrc, aabDest);
console.log(`Play AAB: ${aabDest}`);
console.log('Do not copy this file to public-site/downloads (sideload stays debug/release APK).');
