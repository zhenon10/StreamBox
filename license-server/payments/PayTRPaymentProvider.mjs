/**
 * PayTR iFrame API — official endpoints only.
 * Docs: https://dev.paytr.com/iframe-api/iframe-api-1-adim
 *       https://dev.paytr.com/iframe-api/iframe-api-2-adim
 *
 * Token: POST https://www.paytr.com/odeme/api/get-token
 * Pay form: https://www.paytr.com/odeme/guvenli/{iframe_token}
 * Callback: merchant panel “Bildirim URL” → POST application/x-www-form-urlencoded
 * Callback response must be plain text: OK
 */
import crypto from 'node:crypto';
import https from 'node:https';
import { PaymentProvider, ProviderNotConfiguredError } from './PaymentProvider.mjs';

const GET_TOKEN_URL = 'https://www.paytr.com/odeme/api/get-token';
const IFRAME_BASE = 'https://www.paytr.com/odeme/guvenli/';

export class PayTRPaymentProvider extends PaymentProvider {
  constructor(env = process.env) {
    super();
    this.merchantId = String(env.PAYTR_MERCHANT_ID ?? '').trim();
    this.merchantKey = String(env.PAYTR_MERCHANT_KEY ?? '').trim();
    this.merchantSalt = String(env.PAYTR_MERCHANT_SALT ?? '').trim();
    this.testMode = String(env.PAYTR_TEST_MODE ?? '1') === '1' ? '1' : '0';
    this.debugOn = String(env.PAYTR_DEBUG_ON ?? '1') === '1' ? 1 : 0;
  }

  get id() {
    return 'paytr';
  }

  isConfigured() {
    return Boolean(this.merchantId && this.merchantKey && this.merchantSalt);
  }

  /**
   * paytr_token = base64(hmac_sha256(hash_str + merchant_salt, merchant_key))
   * hash_str = merchant_id + user_ip + merchant_oid + email + payment_amount +
   *            user_basket + no_installment + max_installment + currency + test_mode
   */
  buildPaytrToken(params) {
    const hashStr =
      params.merchant_id +
      params.user_ip +
      params.merchant_oid +
      params.email +
      params.payment_amount +
      params.user_basket +
      params.no_installment +
      params.max_installment +
      params.currency +
      params.test_mode;
    return crypto
      .createHmac('sha256', this.merchantKey)
      .update(hashStr + this.merchantSalt)
      .digest('base64');
  }

  /** Callback: hmac_sha256(merchant_oid + merchant_salt + status + total_amount, merchant_key) */
  buildCallbackHash(merchantOid, status, totalAmount) {
    return crypto
      .createHmac('sha256', this.merchantKey)
      .update(String(merchantOid) + this.merchantSalt + String(status) + String(totalAmount))
      .digest('base64');
  }

  async createPayment(order) {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError(this.id);
    }

    const noInstallment = '1';
    const maxInstallment = '0';
    const currency = 'TL';
    const paymentAmount = String(order.amount);
    const userBasket = Buffer.from(
      JSON.stringify([[order.basketTitle, (order.amount / 100).toFixed(2), 1]]),
    ).toString('base64');

    const tokenParams = {
      merchant_id: this.merchantId,
      user_ip: order.userIp,
      merchant_oid: order.orderNo,
      email: order.email,
      payment_amount: paymentAmount,
      user_basket: userBasket,
      no_installment: noInstallment,
      max_installment: maxInstallment,
      currency,
      test_mode: this.testMode,
    };

    const paytrToken = this.buildPaytrToken(tokenParams);
    const body = {
      ...tokenParams,
      merchant_key: this.merchantKey,
      merchant_salt: this.merchantSalt,
      paytr_token: paytrToken,
      user_name: order.userName || 'IvPlayer Musteri',
      user_address: order.userAddress || 'Dijital lisans',
      user_phone: order.userPhone || '5000000000',
      merchant_ok_url: order.okUrl,
      merchant_fail_url: order.failUrl,
      timeout_limit: '30',
      debug_on: String(this.debugOn),
      lang: 'tr',
    };

    const json = await postForm(GET_TOKEN_URL, body);
    if (json.status !== 'success' || !json.token) {
      const reason = json.reason || json.status || 'get_token_failed';
      const err = new Error(String(reason));
      err.code = 'paytr_token_failed';
      throw err;
    }

    return {
      paymentUrl: IFRAME_BASE + json.token,
      iframeToken: String(json.token),
      paymentReference: String(json.token),
    };
  }

  verifyCallback(fields) {
    if (!this.isConfigured()) {
      return { ok: false, error: 'provider_not_configured' };
    }
    const merchantOid = String(fields.merchant_oid ?? '');
    const status = String(fields.status ?? '');
    const totalAmount = String(fields.total_amount ?? '');
    const hash = String(fields.hash ?? '');
    if (!merchantOid || !status || !totalAmount || !hash) {
      return { ok: false, error: 'incomplete_callback' };
    }
    const expected = this.buildCallbackHash(merchantOid, status, totalAmount);
    if (!timingSafeEqualB64(expected, hash)) {
      return { ok: false, error: 'bad_hash' };
    }
    return {
      ok: true,
      orderNo: merchantOid,
      status,
      totalAmount: Number(totalAmount),
      paymentAmount: fields.payment_amount ? Number(fields.payment_amount) : Number(totalAmount),
      currency: String(fields.currency || 'TL'),
      paymentReference: merchantOid,
    };
  }
}

function timingSafeEqualB64(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function postForm(urlString, fields) {
  const url = new URL(urlString);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    body.set(k, String(v ?? ''));
  }
  const payload = body.toString();
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error('paytr_invalid_json'));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(20_000, () => {
      req.destroy(new Error('paytr_timeout'));
    });
    req.write(payload);
    req.end();
  });
}
