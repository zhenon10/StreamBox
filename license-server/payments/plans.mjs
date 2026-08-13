/**
 * Server-side catalog. Client cannot set price/currency.
 * Amounts are integer kuruş (1 TL = 100).
 */
export const PLAN_ONE_YEAR = 'ONE_YEAR';
export const PLAN_LIFETIME = 'LIFETIME';

export function catalogFromEnv() {
  const currency = (process.env.IVPLAYER_CURRENCY || 'TRY').trim().toUpperCase();
  return {
    currency: currency === 'TL' ? 'TRY' : currency,
    plans: {
      [PLAN_ONE_YEAR]: {
        id: PLAN_ONE_YEAR,
        title: '1 Yıl',
        productName: 'IvPlayer LG webOS Medya Oynatıcı Lisansı — 1 Yıl',
        amount: parseKurus(process.env.IVPLAYER_ONE_YEAR_PRICE, 29900),
      },
      [PLAN_LIFETIME]: {
        id: PLAN_LIFETIME,
        title: 'Ömür Boyu',
        productName: 'IvPlayer LG webOS Medya Oynatıcı Lisansı — Ömür Boyu',
        amount: parseKurus(process.env.IVPLAYER_LIFETIME_PRICE, 79900),
      },
    },
  };
}

function parseKurus(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 100) return fallback;
  return Math.round(n);
}

export function resolvePlan(planId) {
  const catalog = catalogFromEnv();
  const plan = catalog.plans[String(planId ?? '').trim()];
  if (!plan) return null;
  return { ...plan, currency: catalog.currency };
}

export function formatTry(amountKurus) {
  return `${(amountKurus / 100).toFixed(2)} TL`;
}

export function lifetimeExpiresAt(fromMs = Date.now()) {
  return Date.UTC(2099, 11, 31, 20, 59, 59);
}

export function oneYearExpiresAt(fromMs = Date.now()) {
  const d = new Date(fromMs);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.getTime();
}

export function expiresAtForPlan(planId, fromMs = Date.now()) {
  return planId === PLAN_LIFETIME ? lifetimeExpiresAt(fromMs) : oneYearExpiresAt(fromMs);
}

export function planDisplayName(planId) {
  if (planId === PLAN_LIFETIME) return 'Ömür Boyu';
  return '1 Yıl';
}
