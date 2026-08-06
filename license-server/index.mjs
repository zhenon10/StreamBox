/**
 * Minimal StreamBox license API + admin panel — Node built-in http only.
 * Public:  POST /v1/activate | /v1/validate | /v1/deactivate · GET /v1/health
 * Admin:   GET /admin · GET|POST /v1/admin/codes · DELETE /v1/admin/codes/:code
 *          DELETE /v1/admin/activations/:token
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'data', 'licenses.json');
const EXAMPLE_PATH = path.join(__dirname, 'data', 'licenses.example.json');
const ADMIN_HTML = path.join(__dirname, 'admin.html');
const PORT = Number(process.env.LICENSE_PORT ?? 8787);
const ADMIN_KEY = process.env.LICENSE_ADMIN_KEY?.trim() || 'streambox-admin';
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
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...CORS,
  });
  res.end(payload);
}

function sendHtml(res, filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
    'Cache-Control': 'no-store',
  });
  res.end(html);
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

function requireAdmin(req, res) {
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
        playlistUrl: record.playlistUrl,
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
      playlistUrl: record.playlistUrl,
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
      playlistUrl: record.playlistUrl,
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
  const playlistUrl = String(input.playlistUrl ?? '').trim();
  if (!playlistUrl) {
    return { status: 400, body: { ok: false, error: 'invalid_url' } };
  }

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

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const { pathname } = url;

  if (req.method === 'GET' && (pathname === '/admin' || pathname === '/admin/')) {
    try {
      sendHtml(res, ADMIN_HTML);
    } catch {
      json(res, 500, { ok: false, error: 'admin_ui_missing' });
    }
    return;
  }

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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`StreamBox license server listening on http://0.0.0.0:${PORT}`);
  console.log(`Admin panel: http://127.0.0.1:${PORT}/admin`);
  console.log(`Admin key:   ${ADMIN_KEY}  (env LICENSE_ADMIN_KEY)`);
  console.log(`Demo code: DEMO-2026  (override playlist: LICENSE_DEMO_PLAYLIST_URL)`);
});
