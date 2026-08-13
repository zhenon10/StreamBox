import crypto from 'node:crypto';
import {
  PLAN_LIFETIME,
  PLAN_ONE_YEAR,
  expiresAtForPlan,
  formatTry,
  planDisplayName,
  resolvePlan,
} from './plans.mjs';

export const PAYMENT = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
};

export const LICENSE = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
};

const PENDING_TTL_MS = 35 * 60 * 1000;

export function newOrderNo(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const rand = crypto.randomBytes(5).toString('hex').toUpperCase();
  return `IVP${y}${m}${d}${rand}`;
}

export function formatDeviceCode(code) {
  const c = String(code || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  if (c.length !== 12) return c;
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

export function parseDeviceCode(raw) {
  const code = String(raw ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  if (code.length !== 12) {
    return { ok: false, error: 'invalid_device_code' };
  }
  return { ok: true, deviceCode: code };
}

export function isValidEmail(raw) {
  const email = String(raw ?? '').trim().toLowerCase();
  if (email.length < 6 || email.length > 120) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function ensureOrders(db) {
  if (!Array.isArray(db.orders)) db.orders = [];
  return db;
}

export function findOrder(db, orderNo) {
  ensureOrders(db);
  return db.orders.find((o) => o.orderNo === String(orderNo ?? '').trim()) || null;
}

export function hasActiveDeviceLicense(db, deviceCode) {
  const rec = db.deviceLicenses?.[deviceCode];
  if (!rec) return false;
  return Date.now() <= Number(rec.expiresAt);
}

export function publicOrderView(order) {
  if (!order) return null;
  return {
    ok: true,
    orderNo: order.orderNo,
    plan: order.plan,
    planTitle: planDisplayName(order.plan),
    amount: order.amount,
    currency: order.currency,
    amountLabel: formatTry(order.amount),
    deviceCode: formatDeviceCode(order.deviceCode),
    paymentStatus: order.paymentStatus,
    licenseStatus: order.licenseStatus,
    createdAt: order.createdAt,
  };
}

export function adminOrderView(order) {
  if (!order) return null;
  return {
    ...publicOrderView(order),
    paymentProvider: order.paymentProvider,
    paymentReference: order.paymentReference || null,
    callbackStatus: order.callbackStatus || null,
    customerEmail: order.customerEmail || null,
    paidAt: order.paidAt || null,
    activatedAt: order.activatedAt || null,
    failedAt: order.failedAt || null,
    cancelledAt: order.cancelledAt || null,
    reviewReason: order.reviewReason || null,
    callbacks: (order.callbacks || []).map((c) => ({
      at: c.at,
      status: c.status,
      totalAmount: c.totalAmount,
      paymentAmount: c.paymentAmount,
      currency: c.currency,
    })),
  };
}

/**
 * Client may send only deviceCode + plan (+ email for PayTR).
 * amount / currency / paymentStatus from the client are ignored.
 */
export function createPendingOrder(db, input) {
  ensureOrders(db);
  const parsed = parseDeviceCode(input.deviceCode);
  if (!parsed.ok) {
    return { status: 400, body: { ok: false, error: parsed.error } };
  }
  const plan = resolvePlan(input.plan);
  if (!plan) {
    return { status: 400, body: { ok: false, error: 'invalid_plan' } };
  }
  const email = String(input.email ?? '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { status: 400, body: { ok: false, error: 'email_required' } };
  }
  if (hasActiveDeviceLicense(db, parsed.deviceCode)) {
    return { status: 409, body: { ok: false, error: 'already_licensed' } };
  }

  const now = Date.now();
  const existing = db.orders.find(
    (o) =>
      o.deviceCode === parsed.deviceCode &&
      o.paymentStatus === PAYMENT.PENDING &&
      now - o.createdAt < PENDING_TTL_MS,
  );
  if (existing) {
    return { status: 200, body: { ok: true, reused: true, order: existing } };
  }

  for (const o of db.orders) {
    if (
      o.deviceCode === parsed.deviceCode &&
      o.paymentStatus === PAYMENT.PENDING &&
      now - o.createdAt >= PENDING_TTL_MS
    ) {
      o.paymentStatus = PAYMENT.CANCELLED;
      o.licenseStatus = LICENSE.CANCELLED;
      o.cancelledAt = now;
    }
  }

  const order = {
    id: crypto.randomUUID(),
    orderNo: newOrderNo(),
    deviceCode: parsed.deviceCode,
    plan: plan.id,
    amount: plan.amount,
    currency: plan.currency,
    paymentProvider: 'paytr',
    paymentReference: '',
    paymentStatus: PAYMENT.PENDING,
    licenseStatus: LICENSE.PENDING,
    customerEmail: email,
    createdAt: now,
    paidAt: null,
    activatedAt: null,
    failedAt: null,
    cancelledAt: null,
    callbackStatus: null,
    reviewReason: null,
    callbacks: [],
  };
  db.orders.push(order);
  return { status: 201, body: { ok: true, reused: false, order } };
}

export function activateLicenseForOrder(db, order, upsertDeviceLicense) {
  if (order.licenseStatus === LICENSE.ACTIVE) {
    return { applied: false, reason: 'already_active' };
  }
  if (hasActiveDeviceLicense(db, order.deviceCode)) {
    order.licenseStatus = LICENSE.REVIEW_REQUIRED;
    order.reviewReason = 'existing_active_license';
    return { applied: false, reason: 'existing_active_license' };
  }
  const expiresAt = expiresAtForPlan(order.plan, Date.now());
  const result = upsertDeviceLicense(db, {
    deviceCode: order.deviceCode,
    planName: planDisplayName(order.plan),
    playlistUrl: '',
    expiresAt,
  });
  if (result.status !== 200) {
    order.licenseStatus = LICENSE.REVIEW_REQUIRED;
    order.reviewReason = result.body?.error || 'activate_failed';
    return { applied: false, reason: order.reviewReason };
  }
  order.licenseStatus = LICENSE.ACTIVE;
  order.activatedAt = Date.now();
  order.reviewReason = null;
  return { applied: true };
}

/**
 * After PayTR hash verification only.
 * @param {import('./PayTRPaymentProvider.mjs').PayTRPaymentProvider extends never ? object : object} verified
 */
export function applyVerifiedCallback(db, verified, upsertDeviceLicense) {
  ensureOrders(db);
  const order = findOrder(db, verified.orderNo);
  if (!order) {
    return { handled: false, error: 'order_not_found', paytrOk: true };
  }

  pushCallbackMeta(order, verified);

  if (order.paymentStatus === PAYMENT.PAID) {
    return { handled: true, idempotent: true, order, paytrOk: true };
  }

  if (verified.status !== 'success') {
    order.paymentStatus = PAYMENT.FAILED;
    order.licenseStatus = LICENSE.REJECTED;
    order.failedAt = Date.now();
    order.callbackStatus = 'FAILED';
    return { handled: true, order, paytrOk: true };
  }

  const expected = Number(order.amount);
  const paid = Number(verified.paymentAmount);
  const collected = Number(verified.totalAmount);
  const currency = String(verified.currency || '').toUpperCase().replace('TRY', 'TL');
  const orderCurrency = String(order.currency || 'TRY').toUpperCase().replace('TRY', 'TL');

  if (!Number.isFinite(paid) || paid !== expected) {
    order.paymentStatus = PAYMENT.FAILED;
    order.licenseStatus = LICENSE.REJECTED;
    order.failedAt = Date.now();
    order.callbackStatus = 'AMOUNT_MISMATCH';
    order.reviewReason = 'amount_mismatch';
    return { handled: true, order, paytrOk: true, error: 'amount_mismatch' };
  }
  if (!Number.isFinite(collected) || collected < expected) {
    order.paymentStatus = PAYMENT.FAILED;
    order.licenseStatus = LICENSE.REJECTED;
    order.failedAt = Date.now();
    order.callbackStatus = 'AMOUNT_MISMATCH';
    order.reviewReason = 'amount_mismatch';
    return { handled: true, order, paytrOk: true, error: 'amount_mismatch' };
  }
  if (currency && currency !== orderCurrency) {
    order.paymentStatus = PAYMENT.FAILED;
    order.licenseStatus = LICENSE.REJECTED;
    order.failedAt = Date.now();
    order.callbackStatus = 'CURRENCY_MISMATCH';
    order.reviewReason = 'currency_mismatch';
    return { handled: true, order, paytrOk: true, error: 'currency_mismatch' };
  }

  order.paymentStatus = PAYMENT.PAID;
  order.paidAt = Date.now();
  order.callbackStatus = 'PAID';
  if (verified.paymentReference) {
    order.callbackReference = String(verified.paymentReference);
  }
  activateLicenseForOrder(db, order, upsertDeviceLicense);
  return { handled: true, order, paytrOk: true };
}

function pushCallbackMeta(order, verified) {
  if (!Array.isArray(order.callbacks)) order.callbacks = [];
  order.callbacks.push({
    at: Date.now(),
    status: verified.status,
    totalAmount: verified.totalAmount,
    paymentAmount: verified.paymentAmount,
    currency: verified.currency,
  });
  if (order.callbacks.length > 20) order.callbacks = order.callbacks.slice(-20);
}

export { PLAN_ONE_YEAR, PLAN_LIFETIME };
