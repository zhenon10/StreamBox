import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PayTRPaymentProvider } from './PayTRPaymentProvider.mjs';
import {
  PAYMENT,
  LICENSE,
  applyVerifiedCallback,
  createPendingOrder,
  parseDeviceCode,
  publicOrderView,
  activateLicenseForOrder,
  hasActiveDeviceLicense,
} from './orderService.mjs';
import { catalogFromEnv, resolvePlan, PLAN_ONE_YEAR, PLAN_LIFETIME } from './plans.mjs';

function emptyDb() {
  return { codes: {}, activations: {}, deviceLicenses: {}, orders: [] };
}

function mockUpsert(db, input) {
  const key = String(input.deviceCode).slice(-12);
  db.deviceLicenses[key] = {
    planName: input.planName,
    playlistUrl: '',
    expiresAt: input.expiresAt,
    createdAt: Date.now(),
  };
  return { status: 200, body: { ok: true, deviceCode: key } };
}

const DEVICE = 'A1B2C3D4E5F6';

test('TEST 1 valid device code → order created', () => {
  const r = createPendingOrder(emptyDb(), {
    deviceCode: 'A1B2-C3D4-E5F6',
    plan: PLAN_ONE_YEAR,
    email: 'a@b.co',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.deviceCode, DEVICE);
  assert.equal(r.body.order.paymentStatus, PAYMENT.PENDING);
  assert.match(r.body.order.orderNo, /^IVP\d{8}[A-F0-9]+$/);
});

test('TEST 2 invalid device code → rejected', () => {
  const r = createPendingOrder(emptyDb(), {
    deviceCode: 'ABC',
    plan: PLAN_ONE_YEAR,
    email: 'a@b.co',
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'invalid_device_code');
});

test('TEST 3 ONE_YEAR uses server amount', () => {
  const plan = resolvePlan(PLAN_ONE_YEAR);
  const r = createPendingOrder(emptyDb(), {
    deviceCode: DEVICE,
    plan: PLAN_ONE_YEAR,
    email: 'a@b.co',
    amount: 1,
  });
  assert.equal(r.body.order.amount, plan.amount);
  assert.equal(r.body.order.plan, PLAN_ONE_YEAR);
});

test('TEST 4 LIFETIME uses server amount', () => {
  const plan = resolvePlan(PLAN_LIFETIME);
  const r = createPendingOrder(emptyDb(), {
    deviceCode: DEVICE,
    plan: PLAN_LIFETIME,
    email: 'a@b.co',
  });
  assert.equal(r.body.order.amount, plan.amount);
  assert.notEqual(r.body.order.amount, resolvePlan(PLAN_ONE_YEAR).amount);
});

test('TEST 5 amount manipulation ignored', () => {
  const expected = catalogFromEnv().plans.ONE_YEAR.amount;
  const r = createPendingOrder(emptyDb(), {
    deviceCode: DEVICE,
    plan: PLAN_ONE_YEAR,
    email: 'a@b.co',
    amount: 1,
    currency: 'USD',
    paymentStatus: 'PAID',
    licenseStatus: 'ACTIVE',
  });
  assert.equal(r.body.order.amount, expected);
  assert.equal(r.body.order.currency, 'TRY');
  assert.equal(r.body.order.paymentStatus, PAYMENT.PENDING);
  assert.equal(r.body.order.licenseStatus, LICENSE.PENDING);
});

test('TEST 6 valid callback hash → PAID + ACTIVE', () => {
  const db = emptyDb();
  const created = createPendingOrder(db, {
    deviceCode: DEVICE,
    plan: PLAN_ONE_YEAR,
    email: 'a@b.co',
  });
  const order = created.body.order;
  const verified = {
    ok: true,
    orderNo: order.orderNo,
    status: 'success',
    totalAmount: order.amount,
    paymentAmount: order.amount,
    currency: 'TL',
    paymentReference: order.orderNo,
  };
  const out = applyVerifiedCallback(db, verified, mockUpsert);
  assert.equal(out.order.paymentStatus, PAYMENT.PAID);
  assert.equal(out.order.licenseStatus, LICENSE.ACTIVE);
  assert.ok(db.deviceLicenses[DEVICE]);
});

test('TEST 7 invalid callback signature rejected', () => {
  const p = new PayTRPaymentProvider({
    PAYTR_MERCHANT_ID: '123',
    PAYTR_MERCHANT_KEY: 'keykeykeykeykeykey',
    PAYTR_MERCHANT_SALT: 'saltsaltsaltsalt',
  });
  const hash = p.buildCallbackHash('OID1', 'success', '29900');
  const bad = p.verifyCallback({
    merchant_oid: 'OID1',
    status: 'success',
    total_amount: '29900',
    hash: hash + 'x',
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'bad_hash');
  const good = p.verifyCallback({
    merchant_oid: 'OID1',
    status: 'success',
    total_amount: '29900',
    hash,
  });
  assert.equal(good.ok, true);
});

test('TEST 8 duplicate callback does not duplicate license', () => {
  const db = emptyDb();
  const created = createPendingOrder(db, {
    deviceCode: DEVICE,
    plan: PLAN_ONE_YEAR,
    email: 'a@b.co',
  });
  const order = created.body.order;
  const verified = {
    ok: true,
    orderNo: order.orderNo,
    status: 'success',
    totalAmount: order.amount,
    paymentAmount: order.amount,
    currency: 'TL',
  };
  applyVerifiedCallback(db, verified, mockUpsert);
  const firstExpiry = db.deviceLicenses[DEVICE].expiresAt;
  db.deviceLicenses[DEVICE].expiresAt = firstExpiry + 999999;
  applyVerifiedCallback(db, verified, mockUpsert);
  assert.equal(db.deviceLicenses[DEVICE].expiresAt, firstExpiry + 999999);
  assert.equal(db.orders.filter((o) => o.licenseStatus === LICENSE.ACTIVE).length, 1);
});

test('TEST 9 wrong amount callback → no license', () => {
  const db = emptyDb();
  const created = createPendingOrder(db, {
    deviceCode: DEVICE,
    plan: PLAN_ONE_YEAR,
    email: 'a@b.co',
  });
  const order = created.body.order;
  const out = applyVerifiedCallback(
    db,
    {
      ok: true,
      orderNo: order.orderNo,
      status: 'success',
      totalAmount: 100,
      paymentAmount: 100,
      currency: 'TL',
    },
    mockUpsert,
  );
  assert.equal(out.error, 'amount_mismatch');
  assert.equal(order.paymentStatus, PAYMENT.FAILED);
  assert.equal(order.licenseStatus, LICENSE.REJECTED);
  assert.equal(db.deviceLicenses[DEVICE], undefined);
});

test('TEST 10 wrong order reference → no license', () => {
  const db = emptyDb();
  createPendingOrder(db, { deviceCode: DEVICE, plan: PLAN_ONE_YEAR, email: 'a@b.co' });
  const out = applyVerifiedCallback(
    db,
    {
      ok: true,
      orderNo: 'IVP99999999DEADBEEF',
      status: 'success',
      totalAmount: 29900,
      paymentAmount: 29900,
      currency: 'TL',
    },
    mockUpsert,
  );
  assert.equal(out.error, 'order_not_found');
  assert.equal(Object.keys(db.deviceLicenses).length, 0);
});

test('TEST 11 existing active license → REVIEW_REQUIRED', () => {
  const db = emptyDb();
  db.deviceLicenses[DEVICE] = {
    planName: '1 Yıl',
    playlistUrl: '',
    expiresAt: Date.now() + 86400000,
    createdAt: Date.now(),
  };
  const created = createPendingOrder(db, {
    deviceCode: DEVICE,
    plan: PLAN_ONE_YEAR,
    email: 'a@b.co',
  });
  assert.equal(created.status, 409);
  assert.equal(created.body.error, 'already_licensed');
  assert.equal(hasActiveDeviceLicense(db, DEVICE), true);
});

test('TEST 11b paid callback with concurrent license → REVIEW_REQUIRED', () => {
  const db = emptyDb();
  const created = createPendingOrder(db, {
    deviceCode: DEVICE,
    plan: PLAN_ONE_YEAR,
    email: 'a@b.co',
  });
  const order = created.body.order;
  db.deviceLicenses[DEVICE] = {
    planName: '1 Yıl',
    playlistUrl: '',
    expiresAt: Date.now() + 86400000,
    createdAt: Date.now(),
  };
  applyVerifiedCallback(
    db,
    {
      ok: true,
      orderNo: order.orderNo,
      status: 'success',
      totalAmount: order.amount,
      paymentAmount: order.amount,
      currency: 'TL',
    },
    mockUpsert,
  );
  assert.equal(order.paymentStatus, PAYMENT.PAID);
  assert.equal(order.licenseStatus, LICENSE.REVIEW_REQUIRED);
});

test('public order view hides secrets', () => {
  const r = createPendingOrder(emptyDb(), {
    deviceCode: DEVICE,
    plan: PLAN_ONE_YEAR,
    email: 'secret@example.com',
  });
  const view = publicOrderView(r.body.order);
  assert.equal(view.customerEmail, undefined);
  assert.equal(view.paymentReference, undefined);
  assert.ok(!JSON.stringify(view).includes('secret@'));
});

test('PayTR token hash matches official formula', () => {
  const p = new PayTRPaymentProvider({
    PAYTR_MERCHANT_ID: '123456',
    PAYTR_MERCHANT_KEY: 'merchantkeymerchant',
    PAYTR_MERCHANT_SALT: 'merchantsaltvalue1',
  });
  const user_basket = Buffer.from(JSON.stringify([['item', '10.00', 1]])).toString('base64');
  const token = p.buildPaytrToken({
    merchant_id: '123456',
    user_ip: '1.2.3.4',
    merchant_oid: 'OID1',
    email: 'a@b.co',
    payment_amount: '1000',
    user_basket,
    no_installment: '1',
    max_installment: '0',
    currency: 'TL',
    test_mode: '1',
  });
  const hashStr =
    '123456' +
    '1.2.3.4' +
    'OID1' +
    'a@b.co' +
    '1000' +
    user_basket +
    '1' +
    '0' +
    'TL' +
    '1';
  const expected = crypto
    .createHmac('sha256', 'merchantkeymerchant')
    .update(hashStr + 'merchantsaltvalue1')
    .digest('base64');
  assert.equal(token, expected);
});

test('parseDeviceCode normalizes dashes', () => {
  assert.deepEqual(parseDeviceCode('a1b2-c3d4-e5f6'), { ok: true, deviceCode: DEVICE });
});

test('TEST 12 public payload cannot set PAID / no admin secrets', () => {
  const r = createPendingOrder(emptyDb(), {
    deviceCode: DEVICE,
    plan: PLAN_ONE_YEAR,
    email: 'a@b.co',
    paymentStatus: PAYMENT.PAID,
  });
  const view = publicOrderView(r.body.order);
  assert.equal(r.body.order.paymentStatus, PAYMENT.PENDING);
  assert.equal(view.paymentStatus, PAYMENT.PENDING);
  assert.equal(view.paymentProvider, undefined);
});

test('TEST 13 production frontend has no payment secrets', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public-site');
  for (const name of ['activation.html', 'pay.html', 'order-status.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    assert.equal(html.includes('PAYTR_MERCHANT_KEY'), false);
    assert.equal(html.includes('PAYTR_MERCHANT_SALT'), false);
    assert.equal(html.includes('merchant_salt'), false);
    assert.equal(html.includes('LICENSE_ADMIN_KEY'), false);
  }
});

test('active trial does not block a paid order', () => {
  const db = emptyDb();
  db.deviceLicenses[DEVICE] = {
    planName: 'Deneme (7 gün)',
    playlistUrl: '',
    expiresAt: Date.now() + 86400000,
    createdAt: Date.now(),
    kind: 'trial',
  };
  const created = createPendingOrder(db, {
    deviceCode: DEVICE,
    plan: PLAN_ONE_YEAR,
    email: 'a@b.co',
  });
  assert.equal(created.status, 201);
  assert.equal(hasActiveDeviceLicense(db, DEVICE), false);
});

test('activateLicenseForOrder is idempotent', () => {
  const db = emptyDb();
  const order = {
    deviceCode: DEVICE,
    plan: PLAN_ONE_YEAR,
    licenseStatus: LICENSE.PENDING,
  };
  activateLicenseForOrder(db, order, mockUpsert);
  const exp = db.deviceLicenses[DEVICE].expiresAt;
  order.licenseStatus = LICENSE.ACTIVE;
  activateLicenseForOrder(db, order, mockUpsert);
  assert.equal(db.deviceLicenses[DEVICE].expiresAt, exp);
});
