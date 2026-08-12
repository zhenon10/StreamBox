/**
 * Minimal IvPlayer license API + admin panel — Node built-in http only.
 * Public:  POST /v1/activate | /v1/validate | /v1/deactivate · GET /v1/health
 *          GET /v1/stream-proxy?url=…  (CORS tunnel for TV MSE playback)
 * Admin:   GET /admin (login gate) · POST /admin/login · POST /admin/logout
 *          GET|POST /v1/admin/codes · DELETE /v1/admin/codes/:code
 *          DELETE /v1/admin/activations/:token
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import { URL as NodeURL } from 'node:url';
import net from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'data', 'licenses.json');
const EXAMPLE_PATH = path.join(__dirname, 'data', 'licenses.example.json');
const ADMIN_HTML = path.join(__dirname, 'admin.html');
const LOGIN_HTML = path.join(__dirname, 'login.html');
const WEB_ROOT = process.env.LICENSE_WEB_ROOT?.trim() || path.join(__dirname, '..', 'web');
const PORT = Number(process.env.LICENSE_PORT ?? 8787);
/** Production behind nginx: LICENSE_BIND=127.0.0.1 so other public APIs stay untouched. */
const BIND = process.env.LICENSE_BIND?.trim() || '0.0.0.0';
const ADMIN_KEY = process.env.LICENSE_ADMIN_KEY?.trim() || 'ivplayer-admin';
const DEMO_PLAYLIST_OVERRIDE = process.env.LICENSE_DEMO_PLAYLIST_URL?.trim() || '';

function ensureDataFile() {
  if (fs.existsSync(DATA_PATH)) return;
  if (!fs.existsSync(EXAMPLE_PATH)) {
    throw new Error('Missing license-server/data/licenses.example.json');
  }
  fs.copyFileSync(EXAMPLE_PATH, DATA_PATH);
  console.log('Created license-server/data/licenses.json from example seed');
}

ensureDataFile();

/** @typedef {{ planName: string, playlistUrl: string, maxDevices: number, expiresAt: number }} CodeRecord */
/** @typedef {{ code: string, deviceId: string, deviceLabel?: string, token: string, activatedAt: number }} Activation */
/** @typedef {{ codes: Record<string, CodeRecord>, activations: Record<string, Activation> }} LicenseDb */

function loadDb() {
  /** @type {LicenseDb} */
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  if (DEMO_PLAYLIST_OVERRIDE && raw.codes['DEMO-2026']) {
    raw.codes['DEMO-2026'].playlistUrl = DEMO_PLAYLIST_OVERRIDE;
  }
  return raw;
}

/** @param {LicenseDb} db */
function saveDb(db) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

function normalizeCode(code) {
  return String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...CORS,
  };
  const cookie = res.getHeader('Set-Cookie');
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(status, headers);
  res.end(payload);
}

function sendHtml(res, filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  res.end(html);
}

const WEB_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function sendWebFile(res, filePath, { cache = true } = {}) {
  const body = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': WEB_MIME[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': cache && ext !== '.html' ? 'public, max-age=86400' : 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  res.end(body);
}

/** Serve the browser player at /app/ (same HTTPS host as the license API). */
function tryServeWebApp(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (pathname !== '/app' && !pathname.startsWith('/app/')) return false;
  if (!fs.existsSync(WEB_ROOT)) return false;

  if (pathname === '/app') {
    res.writeHead(302, { Location: '/app/' });
    res.end();
    return true;
  }

  let rel = pathname.slice('/app/'.length);
  try {
    rel = decodeURIComponent(rel);
  } catch {
    json(res, 400, { ok: false, error: 'bad_path' });
    return true;
  }
  if (!rel || rel.endsWith('/')) rel = path.posix.join(rel, 'index.html');
  if (rel.includes('\0') || rel.split('/').includes('..')) {
    json(res, 400, { ok: false, error: 'bad_path' });
    return true;
  }

  const root = path.resolve(WEB_ROOT);
  const filePath = path.resolve(root, rel);
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    json(res, 400, { ok: false, error: 'bad_path' });
    return true;
  }

  const spa = path.join(root, 'index.html');
  const exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  const target = exists ? filePath : spa;
  if (!fs.existsSync(target)) {
    json(res, 404, { ok: false, error: 'web_app_missing' });
    return true;
  }
  if (req.method === 'HEAD') {
    res.writeHead(200, { 'Content-Type': WEB_MIME[path.extname(target).toLowerCase()] || 'application/octet-stream' });
    res.end();
    return true;
  }
  sendWebFile(res, target, { cache: exists && path.extname(target) !== '.html' });
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function newToken() {
  return `tok_${crypto.randomBytes(24).toString('hex')}`;
}

function parseCookies(req) {
  const raw = String(req.headers.cookie ?? '');
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

const adminSessions = new Map();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function isAdminSession(req) {
  const token = parseCookies(req).ivp_admin;
  if (!token) return false;
  const exp = adminSessions.get(token);
  if (!exp || Date.now() > exp) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

function setAdminCookie(req, res, token) {
  const secure = String(req.headers['x-forwarded-proto'] ?? '') === 'https';
  const parts = [
    `ivp_admin=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAdminCookie(req, res) {
  const secure = String(req.headers['x-forwarded-proto'] ?? '') === 'https';
  res.setHeader(
    'Set-Cookie',
    `ivp_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`,
  );
}

function requireAdmin(req, res) {
  if (isAdminSession(req)) return true;
  const key = String(req.headers['x-admin-key'] ?? '').trim();
  if (!key || key !== ADMIN_KEY) {
    json(res, 401, { ok: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

/** @param {LicenseDb} db @param {string} code */
function activationsForCode(db, code) {
  return Object.values(db.activations).filter((a) => a.code === code);
}

/**
 * @param {LicenseDb} db
 * @param {{ code: string, deviceId: string, deviceLabel?: string }} input
 */
function activate(db, input) {
  const code = normalizeCode(input.code);
  const deviceId = String(input.deviceId ?? '').trim();
  if (!code || !deviceId) {
    return { status: 400, body: { ok: false, error: 'invalid_code' } };
  }

  const record = db.codes[code];
  if (!record) {
    return { status: 404, body: { ok: false, error: 'invalid_code' } };
  }

  if (Date.now() > record.expiresAt) {
    return { status: 403, body: { ok: false, error: 'expired' } };
  }

  const existing = activationsForCode(db, code);
  const sameDevice = existing.find((a) => a.deviceId === deviceId);
  if (sameDevice) {
    return {
      status: 200,
      body: {
        ok: true,
        token: sameDevice.token,
        expiresAt: record.expiresAt,
        playlistUrl: record.playlistUrl || '',
        planName: record.planName,
      },
    };
  }

  if (existing.length >= record.maxDevices) {
    return { status: 403, body: { ok: false, error: 'device_limit' } };
  }

  const token = newToken();
  db.activations[token] = {
    code,
    deviceId,
    deviceLabel: input.deviceLabel ? String(input.deviceLabel).slice(0, 120) : undefined,
    token,
    activatedAt: Date.now(),
  };
  saveDb(db);

  return {
    status: 200,
    body: {
      ok: true,
      token,
      expiresAt: record.expiresAt,
      playlistUrl: record.playlistUrl || '',
      planName: record.planName,
    },
  };
}

/**
 * @param {LicenseDb} db
 * @param {{ token: string, deviceId: string }} input
 */
function validate(db, input) {
  const token = String(input.token ?? '').trim();
  const deviceId = String(input.deviceId ?? '').trim();
  if (!token || !deviceId) {
    return { status: 400, body: { ok: false, error: 'not_found' } };
  }

  const activation = db.activations[token];
  if (!activation) {
    return { status: 404, body: { ok: false, error: 'not_found' } };
  }

  if (activation.deviceId !== deviceId) {
    return { status: 403, body: { ok: false, error: 'device_mismatch' } };
  }

  const record = db.codes[activation.code];
  if (!record) {
    return { status: 404, body: { ok: false, error: 'not_found' } };
  }

  if (Date.now() > record.expiresAt) {
    return { status: 403, body: { ok: false, error: 'expired' } };
  }

  return {
    status: 200,
    body: {
      ok: true,
      expiresAt: record.expiresAt,
      playlistUrl: record.playlistUrl || '',
      planName: record.planName,
    },
  };
}

/**
 * @param {LicenseDb} db
 * @param {{ token: string, deviceId: string }} input
 */
function deactivate(db, input) {
  const token = String(input.token ?? '').trim();
  const deviceId = String(input.deviceId ?? '').trim();
  const activation = db.activations[token];
  if (!activation) {
    return { status: 404, body: { ok: false, error: 'not_found' } };
  }
  if (activation.deviceId !== deviceId) {
    return { status: 403, body: { ok: false, error: 'device_mismatch' } };
  }
  delete db.activations[token];
  saveDb(db);
  return { status: 200, body: { ok: true } };
}

/** @param {LicenseDb} db */
function listAdminCodes(db) {
  const codes = Object.entries(db.codes).map(([code, record]) => {
    const devices = activationsForCode(db, code).map((a) => ({
      token: a.token,
      deviceId: a.deviceId,
      deviceLabel: a.deviceLabel ?? null,
      activatedAt: a.activatedAt,
    }));
    return {
      code,
      planName: record.planName,
      playlistUrl: record.playlistUrl,
      maxDevices: record.maxDevices,
      expiresAt: record.expiresAt,
      deviceCount: devices.length,
      devices,
    };
  });
  codes.sort((a, b) => a.code.localeCompare(b.code));
  return { ok: true, codes };
}

/**
 * @param {LicenseDb} db
 * @param {Record<string, unknown>} input
 */
function upsertCode(db, input) {
  const code = normalizeCode(input.code);
  if (!code) {
    return { status: 400, body: { ok: false, error: 'invalid_code' } };
  }

  const planName = String(input.planName ?? '').trim() || code;
  // HotPlayer model: player license only — playlist is optional (user supplies M3U).
  const playlistUrl = String(input.playlistUrl ?? '').trim();

  const maxDevices = Math.max(1, Math.min(50, Number(input.maxDevices) || 1));
  let expiresAt = Number(input.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return { status: 400, body: { ok: false, error: 'invalid_expiry' } };
  }

  db.codes[code] = { planName, playlistUrl, maxDevices, expiresAt };
  saveDb(db);
  return { status: 200, body: { ok: true, code, ...db.codes[code] } };
}

/** @param {LicenseDb} db @param {string} code */
function deleteCode(db, code) {
  const normalized = normalizeCode(code);
  if (!db.codes[normalized]) {
    return { status: 404, body: { ok: false, error: 'not_found' } };
  }
  delete db.codes[normalized];
  for (const [token, act] of Object.entries(db.activations)) {
    if (act.code === normalized) delete db.activations[token];
  }
  saveDb(db);
  return { status: 200, body: { ok: true } };
}

/** @param {LicenseDb} db @param {string} token */
function revokeActivation(db, token) {
  const t = String(token ?? '').trim();
  if (!db.activations[t]) {
    return { status: 404, body: { ok: false, error: 'not_found' } };
  }
  delete db.activations[t];
  saveDb(db);
  return { status: 200, body: { ok: true } };
}

/** Proxy remote IPTV media with CORS so webOS MSE (hls.js / mpegts.js) can play. */
async function handleStreamProxy(req, res, requestUrl) {
  const target = requestUrl.searchParams.get('url');
  if (!target) {
    json(res, 400, { ok: false, error: 'missing_url' });
    return;
  }

  try {
    await assertSafeProxyTarget(target);
  } catch (error) {
    json(res, 400, {
      ok: false,
      error: error instanceof Error ? error.message : 'unsafe_url',
    });
    return;
  }

  proxyFetch(req, res, target, 0);
}

/**
 * Block SSRF to localhost / private / link-local / metadata addresses.
 * Re-checked on every redirect hop. Does not log the URL.
 * @param {string} target
 */
async function assertSafeProxyTarget(target) {
  let parsed;
  try {
    parsed = new NodeURL(target);
  } catch {
    throw new Error('invalid_url');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('unsupported_protocol');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1'
  ) {
    throw new Error('blocked_host');
  }

  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error('blocked_ip');
    return;
  }

  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error('dns_failed');
  }
  if (!records.length) throw new Error('dns_failed');
  for (const rec of records) {
    if (isBlockedIp(rec.address)) throw new Error('blocked_ip');
  }
}

/** @param {string} ip */
function isBlockedIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map((n) => Number(n));
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA
    if (normalized.startsWith('fe80')) return true; // link-local
    if (normalized.startsWith('::ffff:')) {
      const v4 = normalized.slice('::ffff:'.length);
      if (net.isIPv4(v4)) return isBlockedIp(v4);
    }
    return false;
  }
  return true;
}

/**
 * Follow redirects (Xtream panels often 302 live URLs) then pipe the media body.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} target
 * @param {number} redirectCount
 */
function proxyFetch(req, res, target, redirectCount) {
  let parsed;
  try {
    parsed = new NodeURL(target);
  } catch {
    if (!res.headersSent) json(res, 400, { ok: false, error: 'invalid_url' });
    return;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    if (!res.headersSent) json(res, 400, { ok: false, error: 'unsupported_protocol' });
    return;
  }

  const headers = {
    'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
    Accept: '*/*',
    Connection: 'keep-alive',
  };
  if (req.headers.range) {
    // Only forward syntactically safe Range values (bytes=…).
    const range = String(req.headers.range);
    if (/^bytes=\d*-\d*(,\d*-\d*)*$/i.test(range) && range.length < 200) {
      headers.Range = range;
    }
  }

  const transport = parsed.protocol === 'https:' ? https : http;
  const upstream = transport.request(
    target,
    {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      timeout: 20_000,
    },
    (up) => {
      const status = up.statusCode ?? 502;
      const location = up.headers.location;

      if (location && status >= 300 && status < 400 && redirectCount < 8) {
        up.resume();
        let next;
        try {
          next = new NodeURL(location, target).toString();
        } catch {
          if (!res.headersSent) json(res, 502, { ok: false, error: 'bad_redirect' });
          return;
        }
        void assertSafeProxyTarget(next)
          .then(() => proxyFetch(req, res, next, redirectCount + 1))
          .catch(() => {
            if (!res.headersSent) json(res, 400, { ok: false, error: 'blocked_redirect' });
          });
        return;
      }

      const isLikelyLive =
        /\/live\//i.test(target) ||
        up.headers['transfer-encoding'] === 'chunked' ||
        !up.headers['content-length'];

      // Allowlist response headers — do not forward Set-Cookie / auth from upstream.
      const outHeaders = {
        ...CORS,
        'Cache-Control': 'no-store',
        'Content-Type':
          up.headers['content-type'] ??
          (/\.m3u8(\?|$)/i.test(target)
            ? 'application/vnd.apple.mpegurl'
            : 'video/mp2t'),
      };

      if (up.headers['content-length'] && !isLikelyLive) {
        outHeaders['Content-Length'] = up.headers['content-length'];
      }
      if (up.headers['content-range']) {
        outHeaders['Content-Range'] = up.headers['content-range'];
      }
      if (up.headers['accept-ranges']) {
        outHeaders['Accept-Ranges'] = up.headers['accept-ranges'];
      }

      res.writeHead(status, outHeaders);
      if (req.method === 'HEAD') {
        res.end();
        up.resume();
        return;
      }

      const contentType = String(outHeaders['Content-Type'] || '').toLowerCase();
      if (status >= 400 || contentType.includes('text/html')) {
        const chunks = [];
        up.on('data', (c) => chunks.push(c));
        up.on('end', () => {
          const body = Buffer.concat(chunks);
          if (!res.writableEnded) {
            res.end(body);
          }
        });
        return;
      }

      up.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      req.on('close', () => {
        up.destroy();
      });
      up.pipe(res);
    },
  );

  upstream.on('timeout', () => {
    upstream.destroy();
    if (!res.headersSent) {
      json(res, 504, { ok: false, error: 'upstream_timeout' });
    }
  });

  upstream.on('error', (error) => {
    if (!res.headersSent) {
      // Do not echo upstream URL or credentials.
      json(res, 502, { ok: false, error: 'proxy_failed' });
    } else if (!res.writableEnded) {
      res.end();
    }
  });

  upstream.setTimeout(0);
  upstream.end();
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;

  if (
    (req.method === 'GET' || req.method === 'HEAD') &&
    pathname === '/v1/stream-proxy'
  ) {
    await handleStreamProxy(req, res, url);
    return;
  }

  if (req.method === 'GET' && (pathname === '/admin' || pathname === '/admin/')) {
    try {
      if (!isAdminSession(req)) {
        sendHtml(res, LOGIN_HTML);
        return;
      }
      sendHtml(res, ADMIN_HTML);
    } catch {
      json(res, 500, { ok: false, error: 'admin_ui_missing' });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/admin/login') {
    let body;
    try {
      body = await readBody(req);
    } catch {
      json(res, 400, { ok: false, error: 'invalid_json' });
      return;
    }
    const key = String(body.key ?? '').trim();
    if (!key || key !== ADMIN_KEY) {
      json(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }
    const token = crypto.randomBytes(24).toString('hex');
    adminSessions.set(token, Date.now() + SESSION_TTL_MS);
    setAdminCookie(req, res, token);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && pathname === '/admin/logout') {
    const token = parseCookies(req).ivp_admin;
    if (token) adminSessions.delete(token);
    clearAdminCookie(req, res);
    json(res, 200, { ok: true });
    return;
  }

  if (tryServeWebApp(req, res, pathname)) return;

  if (req.method === 'GET' && pathname === '/v1/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && pathname === '/v1/admin/codes') {
    if (!requireAdmin(req, res)) return;
    json(res, 200, listAdminCodes(loadDb()));
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/v1/admin/codes/')) {
    if (!requireAdmin(req, res)) return;
    const code = decodeURIComponent(pathname.slice('/v1/admin/codes/'.length));
    const result = deleteCode(loadDb(), code);
    json(res, result.status, result.body);
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/v1/admin/activations/')) {
    if (!requireAdmin(req, res)) return;
    const token = decodeURIComponent(pathname.slice('/v1/admin/activations/'.length));
    const result = revokeActivation(loadDb(), token);
    json(res, result.status, result.body);
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/admin/codes') {
    if (!requireAdmin(req, res)) return;
    let body;
    try {
      body = await readBody(req);
    } catch {
      json(res, 400, { ok: false, error: 'invalid_json' });
      return;
    }
    const result = upsertCode(loadDb(), body);
    json(res, result.status, result.body);
    return;
  }

  if (req.method !== 'POST') {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    json(res, 400, { ok: false, error: 'invalid_code' });
    return;
  }

  const db = loadDb();
  let result;

  if (pathname === '/v1/activate') {
    result = activate(db, body);
  } else if (pathname === '/v1/validate') {
    result = validate(db, body);
  } else if (pathname === '/v1/deactivate') {
    result = deactivate(db, body);
  } else {
    json(res, 404, { ok: false, error: 'not_found' });
    return;
  }

  json(res, result.status, result.body);
});

server.listen(PORT, BIND, () => {
  console.log(`IvPlayer license server listening on http://${BIND}:${PORT}`);
  console.log(`Admin panel: http://127.0.0.1:${PORT}/admin`);
  console.log(`Web player:  http://127.0.0.1:${PORT}/app/`);
  console.log(`Stream proxy: http://127.0.0.1:${PORT}/v1/stream-proxy?url=…`);
  console.log(`Demo code: DEMO-2026  (override playlist: LICENSE_DEMO_PLAYLIST_URL)`);
});
