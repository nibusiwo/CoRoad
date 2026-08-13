const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * JWT认证中间件
 */
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ code: 401, message: '请先登录' });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.userId = decoded.userId;
    req.userPhone = decoded.phone;
    next();
  } catch (err) {
    return res.status(401).json({ code: 401, message: '登录已过期，请重新登录' });
  }
};

/**
 * 可选认证（有token就解析，没有也放行）
 */
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      req.userId = decoded.userId;
      req.userPhone = decoded.phone;
    } catch (err) {
      // token无效也放行
    }
  }
  next();
};

/**
 * 车主认证检查中间件
 */
const requireCertified = (req, res, next) => {
  const pool = require('../config/db');
  pool.query('SELECT is_certified FROM users WHERE id = ?', [req.userId])
    .then(([rows]) => {
      if (rows.length === 0) {
        return res.status(404).json({ code: 404, message: '用户不存在' });
      }
      if (rows[0].is_certified !== 2) {
        return res.status(403).json({ code: 403, message: '请先完成车主认证' });
      }
      next();
    })
    .catch(next);
};

module.exports = { auth, optionalAuth, requireCertified };
