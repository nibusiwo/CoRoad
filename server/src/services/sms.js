/**
 * 短信验证码服务
 *
 * 提供短信验证码发送与校验能力。支持阿里云 SMS（默认）和腾讯云 SMS。
 * 开发/测试环境下自动降级为 console 日志输出，无需真实 SMS 凭证。
 */

const redis = require('../config/redis');
const config = require('../config');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CODE_LENGTH = 6;
const CODE_TTL_SECONDS = 300;       // 验证码有效期 5 分钟
const RATE_LIMIT_TTL_SECONDS = 60;  // 同一号码发送间隔 60 秒

// Redis key patterns
const KEY_CODE = (phone) => `sms:code:${phone}`;
const KEY_LIMIT = (phone) => `sms:limit:${phone}`;
const KEY_ATTEMPTS = (phone) => `sms:attempts:${phone}`;

const MAX_VERIFY_ATTEMPTS = 5;  // 最大验证尝试次数

// SMS provider availability
const isAliyunConfigured = () => !!(config.sms.accessKey && config.sms.accessSecret && config.sms.signName && config.sms.templateCode);

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

/**
 * Generate a random numeric verification code.
 * @param {number} [len=6]
 * @returns {string}
 */
function generateCode(len) {
  len = len || CODE_LENGTH;
  const bytes = crypto.randomBytes(len);
  let code = '';
  for (let i = 0; i < len; i++) {
    code += (bytes[i] % 10).toString();
  }
  return code;
}

// ---------------------------------------------------------------------------
// Aliyun SMS provider
// ---------------------------------------------------------------------------

/**
 * Send SMS via Aliyun SMS API.
 * Uses the V2 signature algorithm.
 *
 * @param {string} phone   - Recipient phone number
 * @param {string} code    - Verification code to send
 * @returns {Promise<boolean>}
 */
async function sendViaAliyun(phone, code) {
  const axios = require('axios');
  const accessKeyId = config.sms.accessKey;
  const accessSecret = config.sms.accessSecret;

  if (!accessKeyId || !accessSecret) {
    throw new Error('阿里云 SMS 未配置');
  }

  const params = {
    AccessKeyId: accessKeyId,
    Action: 'SendSms',
    Format: 'JSON',
    PhoneNumbers: phone,
    SignName: config.sms.signName,
    TemplateCode: config.sms.templateCode,
    TemplateParam: JSON.stringify({ code }),
    RegionId: 'cn-hangzhou',
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomBytes(16).toString('hex'),
    Timestamp: new Date().toISOString().replace(/\.\d{3}/, ''),
    Version: '2017-05-25',
  };

  // Build canonical query string
  const sortedKeys = Object.keys(params).sort();
  const canonicalQuery = sortedKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  // Sign string
  const stringToSign = `GET&${encodeURIComponent('/')}&${encodeURIComponent(canonicalQuery)}`;
  const hmac = crypto.createHmac('sha1', accessSecret + '&');
  hmac.update(stringToSign);
  const signature = hmac.digest('base64');

  const response = await axios.get('https://dysmsapi.aliyuncs.com/', {
    params: {
      ...params,
      Signature: signature,
    },
    timeout: 10000,
  });

  const data = response.data;
  if (data.Code !== 'OK') {
    throw new Error(`阿里云短信发送失败: [${data.Code}] ${data.Message}`);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Tencent Cloud SMS provider (placeholder)
// ---------------------------------------------------------------------------

/**
 * Send SMS via Tencent Cloud SMS API.
 * Placeholder — not implemented in V1.
 *
 * @param {string} phone
 * @param {string} code
 * @returns {Promise<boolean>}
 */
async function sendViaTencentCloud(phone, code) {
  // Tencent Cloud SMS implementation would go here
  throw new Error('腾讯云短信暂未实现，请使用阿里云短信');
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Send a verification code SMS to the given phone number.
 *
 * - Checks rate limit (60s cooldown per phone).
 * - Stores the code in Redis with a 5-minute TTL.
 * - In production: sends via Aliyun SMS.
 * - In development: logs the code to the console.
 *
 * @param {string} phone - The recipient phone number (format: 1xxxxxxxxxx)
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function sendVerifyCode(phone) {
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    throw Object.assign(new Error('请输入正确的手机号'), { statusCode: 422 });
  }

  // Rate limit check
  const lastSent = await redis.get(KEY_LIMIT(phone));
  if (lastSent) {
    throw Object.assign(new Error('验证码已发送，请60秒后重试'), { statusCode: 429 });
  }

  // Generate code
  const code = generateCode();

  // Store in Redis
  await redis.setEx(KEY_CODE(phone), CODE_TTL_SECONDS, code);
  await redis.setEx(KEY_LIMIT(phone), RATE_LIMIT_TTL_SECONDS, '1');
  // Reset verification attempt counter
  await redis.setEx(KEY_ATTEMPTS(phone), CODE_TTL_SECONDS, '0');

  // Send SMS
  const isDev = config.env === 'development';

  try {
    if (isAliyunConfigured()) {
      await sendViaAliyun(phone, code);
      console.log(`[SMS] 验证码已通过阿里云发送至 ${phone}`);
    } else if (isDev) {
      // Development fallback
      console.log('='.repeat(50));
      console.log(`[SMS-DEV] 验证码: ${code}`);
      console.log(`[SMS-DEV] 手机号: ${phone}`);
      console.log(`[SMS-DEV] 有效期: ${CODE_TTL_SECONDS}秒`);
      console.log('='.repeat(50));
    } else {
      // Production without SMS config — should not happen
      console.error(`[SMS] 短信服务未配置，无法发送验证码至 ${phone}`);
      throw new Error('短信服务暂不可用');
    }

    return { success: true, message: '验证码已发送' };
  } catch (err) {
    // If SMS sending fails but we are in development, still allow the code to be used
    // (the code is already stored in Redis)
    if (isDev) {
      console.warn(`[SMS] 短信发送失败，但本地验证码已存储: ${err.message}`);
      console.log('='.repeat(50));
      console.log(`[SMS-DEV] 验证码: ${code}`);
      console.log(`[SMS-DEV] 手机号: ${phone}`);
      console.log(`[SMS-DEV] 有效期: ${CODE_TTL_SECONDS}秒`);
      console.log('='.repeat(50));
      return { success: true, message: '验证码已发送(开发模式)' };
    }
    throw err;
  }
}

/**
 * Verify an SMS verification code.
 *
 * - Retrieves the stored code from Redis.
 * - Compares the provided code.
 * - Deletes the code on success.
 * - Tracks verification attempts; locks out after MAX_VERIFY_ATTEMPTS failures.
 *
 * @param {string} phone - The phone number
 * @param {string} code  - The verification code to check
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function verifyCode(phone, code) {
  if (!phone || !code) {
    throw Object.assign(new Error('手机号和验证码不能为空'), { statusCode: 422 });
  }

  // Check attempt limit
  const attemptsStr = await redis.get(KEY_ATTEMPTS(phone));
  const attempts = parseInt(attemptsStr || '0', 10);

  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    // Delete the code to force re-send
    await redis.del(KEY_CODE(phone));
    await redis.del(KEY_ATTEMPTS(phone));
    throw Object.assign(
      new Error('验证码尝试次数过多，请重新获取验证码'),
      { statusCode: 429 }
    );
  }

  // Retrieve stored code
  const storedCode = await redis.get(KEY_CODE(phone));

  if (!storedCode) {
    throw Object.assign(
      new Error('验证码已过期，请重新获取'),
      { statusCode: 400 }
    );
  }

  if (storedCode !== String(code)) {
    // Increment attempt counter
    await redis.setEx(KEY_ATTEMPTS(phone), CODE_TTL_SECONDS, String(attempts + 1));
    const remaining = MAX_VERIFY_ATTEMPTS - attempts - 1;
    throw Object.assign(
      new Error(`验证码错误${remaining > 0 ? '，还有' + remaining + '次机会' : ''}`),
      { statusCode: 400, remaining }
    );
  }

  // Success — delete code and related keys
  await Promise.all([
    redis.del(KEY_CODE(phone)),
    redis.del(KEY_LIMIT(phone)),
    redis.del(KEY_ATTEMPTS(phone)),
  ]);

  return { success: true, message: '验证通过' };
}

/**
 * Check if a verification code exists for the given phone (without consuming it).
 * Useful to check whether a code is still valid before the user submits it.
 *
 * @param {string} phone
 * @returns {Promise<boolean>}
 */
async function hasActiveCode(phone) {
  const code = await redis.get(KEY_CODE(phone));
  return !!code;
}

module.exports = {
  sendVerifyCode,
  verifyCode,
  hasActiveCode,
  generateCode,
};
