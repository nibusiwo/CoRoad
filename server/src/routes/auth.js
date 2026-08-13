const router = require('express').Router();
const { auth } = require('../middleware/auth');
const {
  sendCode, wechatLogin, phoneLogin, register, refreshToken,
  passwordLogin, changePhone, changePassword, deactivateAccount
} = require('../controllers/authController');

/**
 * POST /api/auth/send-code
 * 发送短信验证码
 * Body: { phone }
 */
router.post('/send-code', sendCode);

/**
 * POST /api/auth/wechat-login
 * 微信小程序登录
 * Body: { code, nickname?, avatar? }
 */
router.post('/wechat-login', wechatLogin);

/**
 * POST /api/auth/phone-login
 * 手机号+验证码登录
 * Body: { phone, code }
 */
router.post('/phone-login', phoneLogin);

/**
 * POST /api/auth/register
 * 手机号 + 验证码 + 密码 注册
 */
router.post('/register', register);

/**
 * POST /api/auth/password-login
 * 手机号+密码登录
 * Body: { phone, password }
 */
router.post('/password-login', passwordLogin);

/**
 * POST /api/auth/refresh-token
 * 刷新JWT Token（需要携带有效token）
 */
router.post('/refresh-token', auth, refreshToken);

/**
 * 账号安全(需登录)
 */
router.post('/change-phone', auth, changePhone);
router.post('/change-password', auth, changePassword);
router.post('/deactivate', auth, deactivateAccount);

module.exports = router;
