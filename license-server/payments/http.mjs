import { PayTRPaymentProvider } from './PayTRPaymentProvider.mjs';
import { ProviderNotConfiguredError } from './PaymentProvider.mjs';
import { catalogFromEnv, formatTry } from './plans.mjs';
import {
  PAYMENT,
  LICENSE,
  adminOrderView,
  applyVerifiedCallback,
  createPendingOrder,
  ensureOrders,
  findOrder,
  publicOrderView,
  activateLicenseForOrder,
} from './orderService.mjs';
import { clientIp, rateLimit } from './rateLimit.mjs';

export function getPaymentProvider(env = process.env) {
  const name = String(env.PAYMENT_PROVIDER || 'paytr').trim().toLowerCase();
  if (name === 'paytr') return new PayTRPaymentProvider(env);
  return new PayTRPaymentProvider(env);
}

export function publicSiteUrl(env = process.env) {
  return String(env.PUBLIC_SITE_URL || 'https://ivplayer.tr').replace(/\/$/, '');
}

export async function readRawBody(req, maxBytes = 200_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > maxBytes) {
        reject(new Error('too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function parseCallbackFields(raw, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('application/json')) {
    try {
      const obj = JSON.parse(raw || '{}');
      const out = {};
      for (const [k, v] of Object.entries(obj)) out[k] = String(v ?? '');
      return out;
    } catch {
      return {};
    }
  }
  const out = {};
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}

function plain(res, status, text) {
  const body = String(text);
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * @returns {Promise<boolean>} true if request was handled
 */
export async function handlePaymentHttp(req, res, url, deps) {
  const { json, loadDb, saveDb, upsertDeviceLicense, requireAdmin } = deps;
  const { pathname } = url;
  const provider = getPaymentProvider();
  const ip = clientIp(req);

  if (req.method === 'GET' && pathname === '/v1/plans') {
    const catalog = catalogFromEnv();
    json(res, 200, {
      ok: true,
      currency: catalog.currency,
      productName: 'IvPlayer LG webOS Medya Oynatıcı Lisansı',
      disclaimer:
        'IvPlayer herhangi bir TV kanalı, yayın listesi veya medya içeriği sağlamaz. Kullanıcı kendi yetkili olduğu M3U/playlist kaynaklarını kullanır.',
      plans: Object.values(catalog.plans).map((p) => ({
        id: p.id,
        title: p.title,
        productName: p.productName,
        amount: p.amount,
        amountLabel: formatTry(p.amount),
        currency: catalog.currency,
      })),
      paymentReady: provider.isConfigured(),
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/v1/health') {
    return false;
  }

  const orderMatch = pathname.match(/^\/v1\/orders\/([A-Za-z0-9]+)(?:\/(pay-session))?$/);
  if (req.method === 'GET' && orderMatch) {
    const orderNo = orderMatch[1];
    const db = loadDb();
    const order = findOrder(db, orderNo);
    if (!order) {
      json(res, 404, { ok: false, error: 'not_found' });
      return true;
    }
    if (orderMatch[2] === 'pay-session') {
      if (order.paymentStatus !== PAYMENT.PENDING || !order.paymentUrl) {
        json(res, 409, { ok: false, error: 'payment_unavailable' });
        return true;
      }
      json(res, 200, { ok: true, orderNo: order.orderNo, paymentUrl: order.paymentUrl });
      return true;
    }
    json(res, 200, publicOrderView(order));
    return true;
  }

  if (req.method === 'GET' && pathname === '/v1/admin/orders') {
    if (!requireAdmin(req, res)) return true;
    const db = loadDb();
    ensureOrders(db);
    const orders = [...db.orders]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(adminOrderView);
    json(res, 200, { ok: true, orders });
    return true;
  }

  if (req.method === 'POST' && pathname.match(/^\/v1\/admin\/orders\/([A-Za-z0-9]+)\/retry-license$/)) {
    if (!requireAdmin(req, res)) return true;
    try {
      await readRawBody(req);
    } catch {
      /* ignore */
    }
    const orderNo = pathname.split('/')[4];
    const db = loadDb();
    const order = findOrder(db, orderNo);
    if (!order) {
      json(res, 404, { ok: false, error: 'not_found' });
      return true;
    }
    if (order.paymentStatus !== PAYMENT.PAID) {
      json(res, 409, { ok: false, error: 'not_paid' });
      return true;
    }
    const result = activateLicenseForOrder(db, order, upsertDeviceLicense);
    saveDb(db);
    json(res, 200, { ok: true, applied: result.applied, reason: result.reason || null, order: adminOrderView(order) });
    return true;
  }

  if (req.method === 'POST' && pathname === '/v1/orders') {
    if (!rateLimit(`orders:${ip}`, 8, 10 * 60 * 1000)) {
      json(res, 429, { ok: false, error: 'rate_limited' });
      return true;
    }
    if (!rateLimit(`orders-burst:${ip}`, 3, 60 * 1000)) {
      json(res, 429, { ok: false, error: 'rate_limited' });
      return true;
    }
    let body;
    try {
      const raw = await readRawBody(req);
      body = JSON.parse(raw || '{}');
    } catch {
      json(res, 400, { ok: false, error: 'invalid_json' });
      return true;
    }
    if (!rateLimit(`device:${String(body.deviceCode || '').slice(0, 32)}`, 6, 10 * 60 * 1000)) {
      json(res, 429, { ok: false, error: 'rate_limited' });
      return true;
    }

    const db = loadDb();
    const created = createPendingOrder(db, body);
    if (created.status >= 400) {
      json(res, created.status, created.body);
      return true;
    }

    if (!provider.isConfigured()) {
      json(res, 503, {
        ok: false,
        error: 'provider_not_configured',
        message: 'PayTR merchant bilgileri ENV bekleniyor (PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT). Sahte ödeme üretilmez.',
      });
      return true;
    }

    const order = created.body.order;
    const site = publicSiteUrl();
    const okUrl = `${site}/order-status.html?orderNo=${encodeURIComponent(order.orderNo)}`;
    try {
      const pay = await provider.createPayment({
        orderNo: order.orderNo,
        amount: order.amount,
        currency: order.currency,
        email: order.customerEmail,
        userIp: normalizeIp(ip),
        basketTitle: 'IvPlayer LG webOS Medya Oynatici Lisansi',
        okUrl,
        failUrl: okUrl,
        userName: 'IvPlayer Musteri',
        userAddress: `Cihaz ${order.deviceCode.slice(-4)}`,
        userPhone: String(process.env.PAYTR_PLACEHOLDER_PHONE || '5000000000'),
      });
      order.paymentStatus = PAYMENT.PROCESSING;
      order.paymentReference = pay.paymentReference;
      order.paymentUrl = pay.paymentUrl;
      saveDb(db);
      json(res, 200, {
        ok: true,
        orderNo: order.orderNo,
        paymentUrl: pay.paymentUrl,
      });
    } catch (err) {
      order.paymentStatus = PAYMENT.FAILED;
      order.licenseStatus = LICENSE.REJECTED;
      order.failedAt = Date.now();
      order.reviewReason = err instanceof ProviderNotConfiguredError ? 'provider_not_configured' : 'paytr_token_failed';
      saveDb(db);
      json(res, 502, { ok: false, error: order.reviewReason, orderNo: order.orderNo });
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/v1/payments/paytr/callback') {
    if (!rateLimit(`cb:${ip}`, 60, 60 * 1000)) {
      plain(res, 429, 'FAIL');
      return true;
    }
    let fields = {};
    try {
      const raw = await readRawBody(req);
      fields = parseCallbackFields(raw, req.headers['content-type']);
    } catch {
      plain(res, 400, 'FAIL');
      return true;
    }

    const verified = provider.verifyCallback(fields);
    if (!verified.ok) {
      plain(res, 400, 'FAIL');
      return true;
    }

    const db = loadDb();
    applyVerifiedCallback(db, verified, upsertDeviceLicense);
    saveDb(db);
    plain(res, 200, 'OK');
    return true;
  }

  return false;
}

function normalizeIp(ip) {
  let v = String(ip || '').replace(/^::ffff:/, '');
  if (v === '::1') v = '127.0.0.1';
  if (!v || v === '0.0.0.0') v = '127.0.0.1';
  return v;
}
