#!/usr/bin/env node
/**
 * Package StreamBox TV for LG webOS Content Store / device install.
 * Output: webos-build/ + .ipk via ares-package (when CLI is available).
 */
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { flattenCssForLegacyTv } from './flatten-css-legacy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const distDir = join(root, 'dist');
const webosDir = join(root, 'webos');
const outputDir = join(root, 'webos-build');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

console.log('');
console.log('╔══════════════════════════════════════════════╗');
console.log('║   StreamBox TV — webOS Package               ║');
console.log('╠══════════════════════════════════════════════╣');
console.log('║  Platform : WebOSPlatform                    ║');
console.log('║  Target   : tv (production)                  ║');
console.log('╚══════════════════════════════════════════════╝');
console.log('');

console.log('→ Type-checking...\n');
execSync(`${npmCmd} exec -- tsc -b`, {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

console.log('\n→ Building production bundle (webOS)...\n');
execSync(`${npxCmd} vite build --mode production`, {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_PLATFORM: 'webos',
    VITE_APP_TARGET: 'tv',
  },
  shell: true,
});

if (existsSync(outputDir)) {
  rmSync(outputDir, { recursive: true });
}
mkdirSync(outputDir, { recursive: true });

cpSync(distDir, outputDir, { recursive: true });
cpSync(join(webosDir, 'appinfo.json'), join(outputDir, 'appinfo.json'));

// Flatten Tailwind @layer/@property for webOS Chromium 79.
const assetsDir = join(outputDir, 'assets');
if (existsSync(assetsDir)) {
  for (const name of readdirSync(assetsDir)) {
    if (!name.endsWith('.css')) continue;
    const cssPath = join(assetsDir, name);
    const flat = flattenCssForLegacyTv(readFileSync(cssPath, 'utf8'));
    writeFileSync(cssPath, flat);
    console.log(`→ Flattened CSS for legacy TV: assets/${name}`);
  }
}

// Defense-in-depth: classic scripts only (file:// cannot load ES module graphs).
const indexPath = join(outputDir, 'index.html');
if (existsSync(indexPath)) {
  let html = readFileSync(indexPath, 'utf8');
  html = html
    .replace(/\s+crossorigin(?:="[^"]*")?/gi, '')
    .replace(
      /<script type="module"([^>]*src="[^"]+"[^>]*)><\/script>/gi,
      '<script defer$1></script>',
    )
    .replace(/<link rel="modulepreload"[^>]*>/gi, '')
    .replace(
      /content="width=1920,\s*height=1080,\s*initial-scale=1\.0"/i,
      'content="width=device-width, initial-scale=1.0"',
    );
  writeFileSync(indexPath, html);
}

for (const icon of ['icon.png', 'icon-large.png', 'splash.png']) {
  const src = join(webosDir, icon);
  const dest = join(outputDir, icon);
  if (!existsSync(src)) {
    console.error(`\n✗ Missing required asset: webos/${icon}`);
    console.error('  Run: npm run tv:icons');
    process.exit(1);
  }
  cpSync(src, dest);
}

const licenseUrl =
  process.env.VITE_LICENSE_API_URL ||
  (() => {
    try {
      const envPath = join(root, '.env.production');
      if (!existsSync(envPath)) return '';
      const match = /(?:^|\n)VITE_LICENSE_API_URL=(.+)/.exec(readFileSync(envPath, 'utf8'));
      return match?.[1]?.trim() ?? '';
    } catch {
      return '';
    }
  })();

if (
  !licenseUrl ||
  /YOUR-LICENSE|127\.0\.0\.1|localhost|192\.168\.|10\.\d+\./i.test(licenseUrl)
) {
  console.warn('\n⚠ License API URL looks like a placeholder or local address:');
  console.warn(`  VITE_LICENSE_API_URL=${licenseUrl || '(empty)'}`);
  console.warn('  Set a public HTTPS URL before LG Content Store upload.\n');
} else {
  console.log(`→ License API: ${licenseUrl}`);
}

console.log('\n→ webOS app folder ready: webos-build/');

const ares = spawnSync('ares-package', ['-n', 'webos-build', '-o', '.'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});

if (ares.error || ares.status !== 0) {
  console.log('\nNote: ares-package skipped (webOS CLI missing or failed).');
  console.log('Install LG webOS TV CLI, then re-run: npm run tv:package');
  process.exitCode = 0;
} else {
  console.log('\n✓ IPK created. Next: npm run tv:install && npm run tv:launch');
}
