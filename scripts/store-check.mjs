/**
 * Pre-flight checks before LG Content Store / Seller Lounge upload.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const webosDir = join(root, 'webos');

let failures = 0;
let warnings = 0;

function fail(msg) {
  console.error(`✗ ${msg}`);
  failures++;
}

function warn(msg) {
  console.warn(`⚠ ${msg}`);
  warnings++;
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function readPngSize(path) {
  const buf = readFileSync(path);
  if (buf.length < 24 || buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('not a PNG');
  }
  // IHDR width/height at bytes 16..23
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height, bytes: buf.length };
}

function checkPng(rel, expectW, expectH) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    fail(`Missing ${rel}`);
    return;
  }
  try {
    const { width, height } = readPngSize(path);
    if (width !== expectW || height !== expectH) {
      fail(`${rel} is ${width}×${height}, expected ${expectW}×${expectH}`);
    } else {
      ok(`${rel} (${width}×${height})`);
    }
  } catch (e) {
    fail(`${rel}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log('\nIvPlayer — LG Content Store check\n');

checkPng('webos/icon.png', 80, 80);
checkPng('webos/icon-large.png', 130, 130);
checkPng('webos/splash.png', 1920, 1080);
checkPng('webos/store/store-icon-400.png', 400, 400);

const appinfoPath = join(webosDir, 'appinfo.json');
if (!existsSync(appinfoPath)) {
  fail('Missing webos/appinfo.json');
} else {
  const appinfo = JSON.parse(readFileSync(appinfoPath, 'utf8'));
  const required = ['id', 'title', 'type', 'main', 'icon', 'version'];
  for (const key of required) {
    if (!appinfo[key]) fail(`appinfo.json missing "${key}"`);
  }
  if (appinfo.type !== 'web') fail('appinfo.json type must be "web"');
  if (appinfo.icon !== 'icon.png') warn(`icon is "${appinfo.icon}" (expected icon.png)`);
  if (appinfo.largeIcon !== 'icon-large.png') {
    warn(`largeIcon is "${appinfo.largeIcon}" (expected icon-large.png)`);
  }
  if (appinfo.splashBackground !== 'splash.png') {
    fail('splashBackground must be "splash.png"');
  }
  if (appinfo.resolution !== '1920x1080') {
    warn(`resolution is "${appinfo.resolution}" (recommended 1920x1080)`);
  }
  const desc = String(appinfo.appDescription ?? '');
  if (!desc) fail('appDescription is required for store listing clarity');
  else if (desc.length > 60) fail(`appDescription is ${desc.length} chars (max 60)`);
  else ok(`appDescription (${desc.length}/60)`);

  if (!/^com\.[a-z0-9.-]+$/.test(String(appinfo.id))) {
    warn('app id should be reverse-DNS lowercase (com.company.app)');
  } else {
    ok(`app id ${appinfo.id}`);
  }
  ok(`version ${appinfo.version}`);
}

const envPath = join(root, '.env.production');
if (!existsSync(envPath)) {
  warn('Missing .env.production');
} else {
  const env = readFileSync(envPath, 'utf8');
  const store = /VITE_STORE_BUILD=(\S+)/.exec(env)?.[1];
  const license = /VITE_LICENSE_API_URL=(\S+)/.exec(env)?.[1] ?? '';
  if (store !== 'true') warn('VITE_STORE_BUILD should be true for Content Store builds');
  else ok('VITE_STORE_BUILD=true');

  if (
    !license ||
    /YOUR-LICENSE|127\.0\.0\.1|localhost|192\.168\.|10\.\d+\./i.test(license)
  ) {
    warn(
      `VITE_LICENSE_API_URL is not production-ready: ${license || '(empty)'} — set public HTTPS before Seller Lounge upload`,
    );
  } else if (!/^https:\/\//i.test(license)) {
    warn(`License API should use HTTPS: ${license}`);
  } else {
    ok(`License API ${license}`);
  }
}

const docs = [
  'docs/lg-content-store/CHECKLIST.md',
  'docs/lg-content-store/UX-SCENARIO.md',
  'docs/lg-content-store/PRIVACY-TEMPLATE.md',
  'docs/lg-content-store/SUPPORT-TEMPLATE.md',
];
for (const d of docs) {
  if (existsSync(join(root, d))) ok(d);
  else warn(`Missing ${d}`);
}

console.log('');
if (failures > 0) {
  console.error(`Result: ${failures} failure(s), ${warnings} warning(s)`);
  process.exit(1);
}
console.log(`Result: OK (${warnings} warning(s))`);
process.exit(0);
