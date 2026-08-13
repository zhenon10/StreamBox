/**
 * PaymentProvider contract. Do not put secrets in HTTP responses.
 *
 * @typedef {object} CreatePaymentInput
 * @property {string} orderNo
 * @property {number} amount  kuruş
 * @property {string} currency  TRY
 * @property {string} email
 * @property {string} userIp
 * @property {string} basketTitle
 * @property {string} okUrl
 * @property {string} failUrl
 *
 * @typedef {object} CreatePaymentResult
 * @property {string} paymentUrl
 * @property {string} [iframeToken]
 * @property {string} paymentReference
 *
 * @typedef {object} CallbackResult
 * @property {boolean} ok
 * @property {string} [error]
 * @property {string} [orderNo]
 * @property {string} [status]  success | failed
 * @property {number} [totalAmount]
 * @property {number} [paymentAmount]
 * @property {string} [currency]
 * @property {string} [paymentReference]
 */

export class PaymentProvider {
  get id() {
    return 'unknown';
  }

  isConfigured() {
    return false;
  }

  /**
   * @param {CreatePaymentInput} _order
   * @returns {Promise<CreatePaymentResult>}
   */
  async createPayment(_order) {
    throw new Error('not_implemented');
  }

  /**
   * @param {Record<string, string>} _fields
   * @returns {CallbackResult}
   */
  verifyCallback(_fields) {
    return { ok: false, error: 'not_implemented' };
  }

  async refundPayment() {
    throw new Error('refund_not_wired');
  }

  async cancelPayment() {
    throw new Error('cancel_not_wired');
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor(providerId) {
    super(`payment_provider_not_configured:${providerId}`);
    this.code = 'provider_not_configured';
    this.providerId = providerId;
  }
}
