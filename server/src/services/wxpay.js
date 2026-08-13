/**
 * 微信支付 V3 服务封装
 *
 * 实现 JSAPI 支付 / 订单查询 / 退款 / 回调验签。
 * 对于 V1 MVP 阶段，实际的微信 API 调用包裹在 try/catch 中，
 * 开发环境下自动降级为 mock 返回，方便无真实凭证时联调。
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { generateOrderNo } = require('../utils/helpers');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const WXPAY_API_BASE = 'https://api.mch.weixin.qq.com';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Check whether real WeChat Pay credentials are available.
 */
function isConfigured() {
  return !!(
    config.wxpay.mchId &&
    config.wxpay.apiV3Key &&
    config.wxpay.appId
  );
}

/**
 * Load private key from file path or inline env variable.
 * Returns Buffer on success, null on failure.
 */
function loadPrivateKey() {
  try {
    const keyPath = config.wxpay.privateKeyPath;
    if (keyPath) {
      const resolved = path.resolve(keyPath);
      if (fs.existsSync(resolved)) {
        return fs.readFileSync(resolved);
      }
    }
    // Fallback: try to read from env as inline key
    if (process.env.WX_PRIVATE_KEY) {
      return Buffer.from(process.env.WX_PRIVATE_KEY.replace(/\\n/g, '\n'));
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Generate a WeChat Pay V3 authorization header.
 * @param {string} method - HTTP method (GET/POST)
 * @param {string} urlPath - The API path (e.g. /v3/pay/transactions/jsapi)
 * @param {string|object} [body] - Request body (for POST)
 * @returns {string} The Authorization header value
 */
function buildAuthHeader(method, urlPath, body) {
  const mchId = config.wxpay.mchId;
  const serialNo = config.wxpay.certSerialNo;
  const privateKey = loadPrivateKey();

  if (!privateKey || !mchId || !serialNo) {
    throw new Error('微信支付私钥或商户号未配置');
  }

  const nonceStr = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);

  // Build the sign message: method\nurl\n timestamp\nnonce_str\nbody\n
  const bodyStr = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
  const signMessage = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${bodyStr}\n`;

  const sign = crypto
    .createSign('RSA-SHA256')
    .update(signMessage)
    .sign(privateKey, 'base64');

  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${sign}"`;
}

/**
 * Build WeChat Pay V3 request headers.
 */
function buildHeaders(method, urlPath, body) {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': buildAuthHeader(method, urlPath, body),
    'User-Agent': 'CoRoad/1.0',
  };
}

// ---------------------------------------------------------------------------
// Signature utilities
// ---------------------------------------------------------------------------

/**
 * Generate a WeChat Pay V3 signature for JSAPI pay parameters.
 * Called on the backend to compute the sign for the mini-program `wx.requestPayment`.
 *
 * @param {object} data - The sign data (appId, timeStamp, nonceStr, package)
 * @returns {object} { signType, paySign }
 */
function generateSign(data) {
  try {
    const privateKey = loadPrivateKey();
    if (!privateKey) {
      throw new Error('私钥未配置');
    }

    // Build the sign string
    const signStr = `${data.appId}\n${data.timeStamp}\n${data.nonceStr}\n${data.package}\n`;

    const paySign = crypto
      .createSign('RSA-SHA256')
      .update(signStr)
      .sign(privateKey, 'base64');

    return {
      signType: 'RSA',
      paySign,
    };
  } catch (err) {
    if (shouldUseMock()) {
      console.warn('[wxpay] generateSign 降级为开发签名:', err.message);
      return {
        signType: 'RSA',
        paySign: 'DEV_MOCK_SIGN_' + Date.now(),
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Mock helpers (development fallback)
// ---------------------------------------------------------------------------

/**
 * Generate a mock prepay_id for development.
 */
function mockPrepayId(outTradeNo) {
  return `prepay_mock_${outTradeNo}_${Date.now()}`;
}

/**
 * Check whether mock mode should be used.
 * In development, falls back to mock when real credentials are unavailable.
 */
function shouldUseMock() {
  return process.env.INTEGRATION_MODE === 'sandbox' && config.env !== 'production';
}

// ---------------------------------------------------------------------------
// API methods
// ---------------------------------------------------------------------------

/**
 * JSAPI unified order — create a payment order.
 *
 * @param {string} outTradeNo    - 商户订单号
 * @param {number} amount        - 支付金额（分）
 * @param {string} openid        - 用户 openid
 * @param {string} description   - 商品描述
 * @param {string} [notifyUrl]   - 回调地址（可选，默认使用配置的地址）
 * @returns {object} { prepayId, payParams } — payParams 直接用于小程序 wx.requestPayment
 */
async function unifiedOrder(outTradeNo, amount, openid, description, notifyUrl) {
  const urlPath = '/v3/pay/transactions/jsapi';
  const body = {
    appid: config.wxpay.appId,
    mchid: config.wxpay.mchId,
    description: description || 'CoRoad 订单',
    out_trade_no: outTradeNo,
    notify_url: notifyUrl || config.wxpay.notifyUrl,
    amount: {
      total: amount,
      currency: 'CNY',
    },
    payer: {
      openid,
    },
  };

  // --- Mock fallback for development ---
  if (shouldUseMock()) {
    console.log('[wxpay][SANDBOX] unifiedOrder:', { outTradeNo, amount, openid });
    const sandboxPrepayId = mockPrepayId(outTradeNo);
    const timeStamp = Math.floor(Date.now() / 1000);
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const pkg = `prepay_id=${sandboxPrepayId}`;

    const payParams = {
      appId: config.wxpay.appId,
      timeStamp: String(timeStamp),
      nonceStr,
      package: pkg,
      signType: 'RSA',
      paySign: 'MOCK_SIGN_' + Date.now(),
    };

    return { prepayId: sandboxPrepayId, payParams, sandbox: true };
  }

  // --- Real API call ---
  try {
    const method = 'POST';
    const headers = buildHeaders(method, urlPath, body);

    const response = await axios.post(`${WXPAY_API_BASE}${urlPath}`, body, {
      headers,
      timeout: 15000,
    });

    const prepayId = response.data.prepay_id;

    // Build JSAPI pay params for mini-program
    const timeStamp = Math.floor(Date.now() / 1000);
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const pkg = `prepay_id=${prepayId}`;
    const appId = config.wxpay.appId;

    const signData = {
      appId,
      timeStamp: String(timeStamp),
      nonceStr,
      package: pkg,
    };
    const { paySign, signType } = generateSign(signData);

    return {
      prepayId,
      payParams: {
        appId,
        timeStamp: String(timeStamp),
        nonceStr,
        package: pkg,
        signType,
        paySign,
      },
    };
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    console.error('[wxpay] unifiedOrder 失败:', status, detail);

    throw new Error(`微信支付下单失败: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Query order status by out_trade_no.
 *
 * @param {string} outTradeNo - 商户订单号
 * @returns {object} Order status from WeChat Pay
 */
async function queryOrder(outTradeNo) {
  const urlPath = `/v3/pay/transactions/out-trade-no/${outTradeNo}`;

  // --- Mock fallback ---
  if (shouldUseMock()) {
    console.log('[wxpay][SANDBOX] queryOrder:', outTradeNo);
    return {
      appid: config.wxpay.appId,
      mchid: config.wxpay.mchId,
      out_trade_no: outTradeNo,
      trade_state: 'SUCCESS',
      trade_state_desc: '支付成功',
      transaction_id: `MOCK_TXN_${outTradeNo}`,
      amount: { total: 100, currency: 'CNY' },
    };
  }

  // --- Real API call ---
  try {
    const method = 'GET';
    const urlWithParams = `${urlPath}?mchid=${config.wxpay.mchId}`;
    const headers = buildHeaders(method, urlWithParams);

    const response = await axios.get(`${WXPAY_API_BASE}${urlWithParams}`, {
      headers,
      timeout: 10000,
    });

    return response.data;
  } catch (err) {
    console.error('[wxpay] queryOrder 失败:', err.response?.status, err.response?.data || err.message);

    throw new Error(`查询订单失败: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Process a refund.
 *
 * @param {string} outTradeNo    - 原商户订单号
 * @param {number} refundAmount  - 退款金额（分）
 * @param {number} totalAmount   - 原订单总金额（分）
 * @param {string} [reason]      - 退款原因
 * @returns {object} Refund result
 */
async function refund(outTradeNo, refundAmount, totalAmount, reason) {
  const refundNo = `RF${generateOrderNo()}`;
  const urlPath = '/v3/refund/domestic/refunds';
  const body = {
    out_trade_no: outTradeNo,
    out_refund_no: refundNo,
    amount: {
      refund: refundAmount,
      total: totalAmount,
      currency: 'CNY',
    },
    reason: reason || '用户退款',
  };

  // --- Mock fallback ---
  if (shouldUseMock()) {
    console.log('[wxpay][SANDBOX] refund:', { outTradeNo, refundAmount, reason });
    return {
      out_refund_no: refundNo,
      refund_id: `MOCK_REFUND_${refundNo}`,
      status: 'SUCCESS',
      amount: { refund: refundAmount, total: totalAmount },
    };
  }

  // --- Real API call ---
  try {
    const method = 'POST';
    const headers = buildHeaders(method, urlPath, body);

    const response = await axios.post(`${WXPAY_API_BASE}${urlPath}`, body, {
      headers,
      timeout: 15000,
    });

    return response.data;
  } catch (err) {
    console.error('[wxpay] refund 失败:', err.response?.status, err.response?.data || err.message);

    throw new Error(`退款失败: ${err.response?.data?.message || err.message}`);
  }
}

/**
 * Verify the signature of a WeChat Pay callback notification.
 *
 * @param {object} headers - HTTP request headers from the callback
 * @param {string} body    - Raw request body string
 * @returns {boolean} Whether the signature is valid
 */
async function verifyNotify(headers, body) {
  if (shouldUseMock()) {
    console.log('[wxpay][SANDBOX] verifyNotify');
    return true;
  }

  try {
    const wechatpaySignature = headers['wechatpay-signature'];
    const wechatpayTimestamp = headers['wechatpay-timestamp'];
    const wechatpayNonce = headers['wechatpay-nonce'];
    const wechatpaySerial = headers['wechatpay-serial'];

    if (!wechatpaySignature || !wechatpayTimestamp || !wechatpayNonce) {
      console.error('[wxpay] 回调缺少签名头');
      return false;
    }

    // Build the sign message
    const signMessage = `${wechatpayTimestamp}\n${wechatpayNonce}\n${body}\n`;

    // Load WeChat Pay platform certificate (V3)
    // In production, you should cache this and refresh periodically
    const platformCert = await fetchWxPlatformCert(wechatpaySerial);
    if (!platformCert) {
      console.error('[wxpay] 无法获取平台证书进行验签');
      return false;
    }

    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(signMessage);
    return verify.verify(platformCert, wechatpaySignature, 'base64');
  } catch (err) {
    console.error('[wxpay] verifyNotify 失败:', err.message);
    return false;
  }
}

/**
 * Fetch the WeChat Pay platform certificate by serial number.
 * This is a simplified implementation; production should cache certs.
 *
 * @param {string} serialNo - Certificate serial number
 * @returns {string|null} PEM-encoded certificate
 */
async function fetchWxPlatformCert(serialNo) {
  try {
    const urlPath = '/v3/certificates';
    const method = 'GET';
    const headers = buildHeaders(method, urlPath);

    const response = await axios.get(`${WXPAY_API_BASE}${urlPath}`, {
      headers,
      timeout: 10000,
    });

    const certs = response.data.data || [];
    const cert = certs.find((c) => c.serial_no === serialNo);
    if (cert && cert.encrypt_certificate) {
      // Decrypt the certificate with API v3 key
      const decrypted = decryptAes256Gcm(
        cert.encrypt_certificate.ciphertext,
        cert.encrypt_certificate.nonce,
        cert.encrypt_certificate.associated_data
      );
      return decrypted;
    }
    return null;
  } catch (err) {
    console.error('[wxpay] 获取平台证书失败:', err.message);
    return null;
  }
}

/**
 * AES-256-GCM decryption for WeChat Pay V3 callback.
 */
function decryptAes256Gcm(ciphertext, nonce, associatedData) {
  const key = Buffer.from(config.wxpay.apiV3Key || '', 'utf-8');
  const authTag = Buffer.from(ciphertext, 'base64').slice(-16);
  const encryptedData = Buffer.from(ciphertext, 'base64').slice(0, -16);

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(nonce, 'base64')
  );
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associatedData || '', 'utf-8'));

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);
  return decrypted.toString('utf-8');
}

module.exports = {
  unifiedOrder,
  queryOrder,
  refund,
  verifyNotify,
  generateSign,
};
