const pool = require('../config/db');
const redis = require('../config/redis');
const config = require('../config');
const { ApiResponse } = require('../utils/helpers');
const sms = require('../services/sms');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const bcrypt = require('bcryptjs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_LOGIN_ATTEMPTS = 5;            // 最大登录失败次数
const LOGIN_ATTEMPT_WINDOW_SEC = 1800;    // 登录失败窗口 30 分钟
const LOGIN_ATTEMPT_BLOCK_SEC = 3600;     // 超出后封锁 60 分钟

// Redis keys
const LOGIN_ATTEMPTS_KEY = (phone) => `login:attempts:${phone}`;
const LOGIN_BLOCKED_KEY = (phone) => `login:blocked:${phone}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a JWT token for the given user payload.
 */
function generateToken(payload) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
}

/**
 * Check and update login attempt tracking.
 * Returns true if login is allowed, or throws an error if blocked.
 * @param {string} phone
 */
async function checkLoginAttempts(phone) {
  // Check if the phone is currently blocked
  const blocked = await redis.get(LOGIN_BLOCKED_KEY(phone));
  if (blocked) {
    const ttl = await redis.ttl(LOGIN_BLOCKED_KEY(phone));
    const minute = Math.ceil(ttl / 60);
    throw Object.assign(
      new Error(`登录尝试次数过多，请${minute}分钟后再试`),
      { statusCode: 429 }
    );
  }

  // Check current attempt count
  const attemptsStr = await redis.get(LOGIN_ATTEMPTS_KEY(phone));
  const attempts = parseInt(attemptsStr || '0', 10);

  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    // Block the phone number
    await redis.setEx(LOGIN_BLOCKED_KEY(phone), LOGIN_ATTEMPT_BLOCK_SEC, '1');
    // Clean up attempts key
    await redis.del(LOGIN_ATTEMPTS_KEY(phone));
    throw Object.assign(
      new Error(`登录尝试次数过多，请${Math.ceil(LOGIN_ATTEMPT_BLOCK_SEC / 60)}分钟后再试`),
      { statusCode: 429 }
    );
  }

  return true;
}

/**
 * Increment the login attempt counter.
 * @param {string} phone
 */
async function incrementLoginAttempts(phone) {
  const attemptsStr = await redis.get(LOGIN_ATTEMPTS_KEY(phone));
  const attempts = parseInt(attemptsStr || '0', 10);
  await redis.setEx(LOGIN_ATTEMPTS_KEY(phone), LOGIN_ATTEMPT_WINDOW_SEC, String(attempts + 1));
}

/**
 * Clear login attempt tracking on successful login.
 * @param {string} phone
 */
async function clearLoginAttempts(phone) {
  await Promise.all([
    redis.del(LOGIN_ATTEMPTS_KEY(phone)),
    redis.del(LOGIN_BLOCKED_KEY(phone)),
  ]);
}

/**
 * Check SMS rate limit per phone number.
 * Uses Redis-based rate limiting in addition to the express-rate-limit middleware.
 * @param {string} phone
 */
async function checkSmsRateLimit(phone) {
  const lastSent = await redis.get(`sms:limit:${phone}`);
  if (lastSent) {
    throw Object.assign(
      new Error('验证码已发送，请60秒后再试'),
      { statusCode: 429 }
    );
  }
}

/**
 * Look up or create a user by phone. Returns the user row.
 */
async function findOrCreateUserByPhone(phone) {
  const [rows] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);
  if (rows.length > 0) return rows[0];

  const nickname = phone.slice(0, 3) + '****' + phone.slice(7);
  const [result] = await pool.query(
    'INSERT INTO users (phone, nickname, avatar, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
    [phone, nickname, null]
  );
  return { id: result.insertId, phone, nickname, avatar: null };
}

/**
 * Look up or create a user by WeChat openid. Returns the user row.
 */
async function findOrCreateUserByOpenid(openid, unionid, nickname, avatar) {
  const [rows] = await pool.query('SELECT * FROM users WHERE wx_openid = ?', [openid]);
  if (rows.length > 0) {
    const existing = rows[0];
    // Update unionid / nickname / avatar if provided
    const updates = [];
    const params = [];
    if (unionid && existing.wx_unionid !== unionid) {
      updates.push('wx_unionid = ?');
      params.push(unionid);
    }
    if (nickname && existing.nickname !== nickname) {
      updates.push('nickname = ?');
      params.push(nickname);
    }
    if (avatar && existing.avatar !== avatar) {
      updates.push('avatar = ?');
      params.push(avatar);
    }
    if (updates.length > 0) {
      params.push(existing.id);
      await pool.query(`UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
    }
    return {
      ...existing,
      wx_unionid: unionid || existing.wx_unionid,
      nickname: nickname || existing.nickname,
      avatar: avatar || existing.avatar,
    };
  }

  const displayName = nickname || ('微信用户' + Math.random().toString(36).slice(2, 8));
  const [result] = await pool.query(
    'INSERT INTO users (wx_openid, wx_unionid, nickname, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
    [openid, unionid || null, displayName, avatar || null]
  );
  return {
    id: result.insertId,
    wx_openid: openid,
    wx_unionid: unionid,
    nickname: displayName,
    avatar,
    phone: null,
  };
}

// ---------------------------------------------------------------------------
// Controller methods
// ---------------------------------------------------------------------------

/**
 * POST /api/auth/send-code
 * Send SMS verification code.
 * Body: { phone }
 */
const sendCode = async (req, res, next) => {
  try {
    const { phone } = req.body;

    // Validate phone number
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(422).json(ApiResponse.fail('请输入正确的手机号'));
    }

    // Check SMS-specific rate limit (Redis-based, per-phone)
    await checkSmsRateLimit(phone);

    // Send verification code via sms service
    const result = await sms.sendVerifyCode(phone);

    res.json(ApiResponse.success(null, result.message || '验证码已发送'));
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json(ApiResponse.fail(err.message));
    }
    next(err);
  }
};

/**
 * POST /api/auth/wechat-login
 * WeChat mini-program login.
 * Body: { code, nickname?, avatar? }
 */
const wechatLogin = async (req, res, next) => {
  try {
    const { code, nickname, avatar } = req.body;
    console.log('[WeChat] login request received:', {
      hasCode: Boolean(code),
      codeLength: code ? code.length : 0,
      appId: config.wxpay.appId,
    });

    if (!code) {
      return res.status(422).json(ApiResponse.fail('缺少登录凭证 code'));
    }

    // Exchange code for openid / session_key via WeChat API
    let openid, unionid;
    try {
      const wxRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
        params: {
          appid: config.wxpay.appId,
          secret: config.wxpay.appSecret,
          js_code: code,
          grant_type: 'authorization_code',
        },
        timeout: 8000,
      });

      const wxData = wxRes.data;

      if (wxData.errcode && wxData.errcode !== 0) {
        const errMsg = wxData.errmsg || '未知错误';
        console.error('[WeChat] jscode2session 返回错误:', wxData);

        // Map common WeChat errors to user-friendly messages
        if (wxData.errcode === 40029) {
          return res.status(400).json(ApiResponse.fail('登录凭证 code 无效或已过期'));
        }
        if (wxData.errcode === 45011) {
          return res.status(429).json(ApiResponse.fail('请求过于频繁，请稍后重试'));
        }
        if (wxData.errcode === -1) {
          return res.status(502).json(ApiResponse.fail('微信服务繁忙，请稍后重试'));
        }

        return res.status(400).json(ApiResponse.fail('微信登录失败: ' + errMsg));
      }

      openid = wxData.openid;
      unionid = wxData.unionid || null;
    } catch (err) {
      console.error('[WeChat] jscode2session 请求失败:', err.message);
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        return res.status(502).json(ApiResponse.fail('微信服务响应超时，请稍后重试'));
      }
      return res.status(502).json(ApiResponse.fail('微信服务暂不可用，请稍后重试'));
    }

    if (!openid) {
      return res.status(502).json(ApiResponse.fail('获取微信用户信息失败'));
    }

    // Find or create user
    const user = await findOrCreateUserByOpenid(openid, unionid, nickname, avatar);

    // Check user status
    if (user.status === 0) {
      return res.status(403).json(ApiResponse.fail('账号已被禁用，请联系客服'));
    }

    // Update last login
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    // Generate token
    const token = generateToken({ userId: user.id, phone: user.phone });

    res.json(
      ApiResponse.success(
        {
          token,
          user: {
            id: user.id,
            nickname: user.nickname,
            avatar: user.avatar,
            phone: user.phone,
            is_certified: user.is_certified,
            is_new: !user.phone, // New unregistered WeChat user (has not bound phone)
          },
        },
        '登录成功'
      )
    );
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/phone-login
 * Phone + verification code login.
 * Body: { phone, code }
 */
const phoneLogin = async (req, res, next) => {
  try {
    const { phone, code } = req.body;

    // Validate inputs
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(422).json(ApiResponse.fail('请输入正确的手机号'));
    }
    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(422).json(ApiResponse.fail('请输入6位数字验证码'));
    }

    // Check login attempt rate limiting (anti-brute-force)
    await checkLoginAttempts(phone);

    // Verify the code via sms service
    try {
      await sms.verifyCode(phone, code);
    } catch (err) {
      // Increment failed attempt counter
      await incrementLoginAttempts(phone);

      if (err.statusCode) {
        return res.status(err.statusCode).json(ApiResponse.fail(err.message));
      }
      throw err;
    }

    // Find or create user
    const user = await findOrCreateUserByPhone(phone);

    // Check user status
    if (user.status === 0) {
      return res.status(403).json(ApiResponse.fail('账号已被禁用，请联系客服'));
    }

    // Update last login
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    // Clear login attempt tracking on successful login
    await clearLoginAttempts(phone);

    // Generate token
    const token = generateToken({ userId: user.id, phone: user.phone });

    res.json(
      ApiResponse.success(
        {
          token,
          user: {
            id: user.id,
            nickname: user.nickname,
            avatar: user.avatar,
            phone: user.phone,
            is_certified: user.is_certified,
            wx_openid: !!user.wx_openid,
          },
        },
        '登录成功'
      )
    );
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json(ApiResponse.fail(err.message));
    }
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 手机号 + 密码登录
// ---------------------------------------------------------------------------
const passwordLogin = async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    if (!/^1[3-9]\d{9}$/.test(phone || '')) {
      return res.status(422).json(ApiResponse.fail('请输入正确的手机号'));
    }
    if (!password) {
      return res.status(422).json(ApiResponse.fail('请输入密码'));
    }

    const [[user]] = await pool.query(
      'SELECT id, phone, password_hash, status FROM users WHERE phone = ?',
      [phone]
    );
    if (!user || user.status === 0) {
      return res.status(404).json(ApiResponse.fail('用户不存在或已注销'));
    }
    if (!user.password_hash) {
      return res.status(400).json(ApiResponse.fail('该账号未设置密码，请使用验证码登录后在「设置-修改密码」中设置'));
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json(ApiResponse.fail('手机号或密码错误'));
    }

    const token = generateToken({ userId: user.id, phone: user.phone });
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    res.json(ApiResponse.success({ token, user_id: user.id }, '登录成功'));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/refresh-token
 * Refresh JWT token using a valid (but perhaps expiring) token.
 * Must be called with a valid Bearer token — the auth middleware parses it.
 */
const refreshToken = async (req, res, next) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json(ApiResponse.fail('请先登录'));
    }

    // Verify user still exists and is active
    const [rows] = await pool.query('SELECT id, phone, status FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }
    if (rows[0].status === 0) {
      return res.status(403).json(ApiResponse.fail('账号已被禁用，请联系客服'));
    }

    const newToken = generateToken({ userId: rows[0].id, phone: rows[0].phone });

    res.json(ApiResponse.success({ token: newToken }, 'Token 已刷新'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 修改手机号(需短信验证码)
// ---------------------------------------------------------------------------
const changePhone = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { phone, code } = req.body;

    if (!/^1[3-9]\d{9}$/.test(phone || '')) {
      return res.status(422).json(ApiResponse.fail('请输入正确的手机号'));
    }
    if (!code) {
      return res.status(422).json(ApiResponse.fail('请输入短信验证码'));
    }

    const [[exists]] = await pool.query(
      'SELECT id FROM users WHERE phone = ? AND id != ?',
      [phone, userId]
    );
    if (exists) {
      return res.status(400).json(ApiResponse.fail('该手机号已被其他账号使用'));
    }

    await sms.verifyCode(phone, code);

    await pool.query(
      'UPDATE users SET phone = ?, updated_at = NOW() WHERE id = ?',
      [phone, userId]
    );

    const newToken = generateToken({ userId, phone });
    res.json(ApiResponse.success({ token: newToken }, '手机号已修改'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 修改密码(首次设置无需旧密码,已有密码则需验证旧密码)
// ---------------------------------------------------------------------------
const changePassword = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { old_password, new_password } = req.body;

    if (!new_password || String(new_password).length < 6) {
      return res.status(422).json(ApiResponse.fail('新密码长度至少6位'));
    }
    if (old_password && old_password === new_password) {
      return res.status(400).json(ApiResponse.fail('新密码不能与旧密码相同'));
    }

    const [[user]] = await pool.query(
      'SELECT id, password_hash FROM users WHERE id = ?',
      [userId]
    );
    if (!user) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }

    if (user.password_hash) {
      if (!old_password) {
        return res.status(422).json(ApiResponse.fail('请输入当前密码'));
      }
      const ok = await bcrypt.compare(old_password, user.password_hash);
      if (!ok) {
        return res.status(400).json(ApiResponse.fail('当前密码不正确'));
      }
    }

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query(
      'UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?',
      [hash, userId]
    );

    res.json(ApiResponse.success(null, '密码已修改'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 账号注销(软删除 + 手机号匿名化,不可再登录)
// ---------------------------------------------------------------------------
const deactivateAccount = async (req, res, next) => {
  try {
    const userId = req.userId;

    const [[user]] = await pool.query(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );
    if (!user) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }

    await pool.query(
      `UPDATE users
       SET status = 0,
           phone = CONCAT('del_', id),
           wx_openid = NULL,
           wx_unionid = NULL,
           last_position = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [userId]
    );

    await pool.query(
      `UPDATE trip_members
       SET status = 4, left_at = NOW(), left_reason = 'account_deleted'
       WHERE user_id = ? AND status IN (1, 2)`,
      [userId]
    );
    await pool.query(
      `UPDATE chat_session_members SET left_at = NOW()
       WHERE user_id = ? AND left_at IS NULL`,
      [userId]
    );

    res.json(ApiResponse.success(null, '账号已注销'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 手机号 + 验证码 + 密码 注册
// ---------------------------------------------------------------------------
const register = async (req, res, next) => {
  try {
    const { phone, code, password, nickname } = req.body;

    // Validate inputs
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(422).json(ApiResponse.fail('请输入正确的手机号'));
    }
    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(422).json(ApiResponse.fail('请输入6位数字验证码'));
    }
    if (!password || password.length < 6 || password.length > 20) {
      return res.status(422).json(ApiResponse.fail('密码长度需为6-20位'));
    }

    // 先检查手机号是否已注册,避免用户先获取验证码后才知道已注册
    const [existing] = await pool.query(
      'SELECT id, status FROM users WHERE phone = ?',
      [phone]
    );
    if (existing.length > 0) {
      return res.status(409).json(ApiResponse.fail('该手机号已注册，请直接登录'));
    }

    // Check login attempt rate limiting (anti-brute-force)
    await checkLoginAttempts(phone);

    // Verify the code via sms service
    try {
      await sms.verifyCode(phone, code);
    } catch (err) {
      await incrementLoginAttempts(phone);
      if (err.statusCode) {
        return res.status(err.statusCode).json(ApiResponse.fail(err.message));
      }
      throw err;
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);
    const displayName = nickname && nickname.trim()
      ? nickname.trim().slice(0, 50)
      : phone.slice(0, 3) + '****' + phone.slice(7);

    const [result] = await pool.query(
      `INSERT INTO users (phone, nickname, password_hash, avatar, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NOW(), NOW())`,
      [phone, displayName, passwordHash]
    );

    const userId = result.insertId;

    // Clear login attempt tracking on successful registration
    await clearLoginAttempts(phone);

    // Generate token and auto-login
    const token = generateToken({ userId, phone });
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [userId]);

    res.json(
      ApiResponse.success(
        {
          token,
          user: {
            id: userId,
            nickname: displayName,
            avatar: null,
            phone,
            is_certified: 0,
            wx_openid: false,
          },
        },
        '注册成功'
      )
    );
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json(ApiResponse.fail(err.message));
    }
    next(err);
  }
};

module.exports = {
  sendCode,
  wechatLogin,
  phoneLogin,
  passwordLogin,
  register,
  refreshToken,
  changePhone,
  changePassword,
  deactivateAccount,
};
