const router = require('express').Router();
const { auth } = require('../middleware/auth');
const pool = require('../config/db');
const adminController = require('../controllers/adminController');
const { getHealth } = require('../controllers/healthController');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { ApiResponse } = require('../utils/helpers');

// ---------------------------------------------------------------------------
// Admin auth middleware
// Checks if the authenticated user is an admin.
// Uses both a hardcoded admin list (MVP) and the is_admin flag on the user record.
// ---------------------------------------------------------------------------
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS
  ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id))
  : [1];

// ---------------------------------------------------------------------------
// POST /api/admin/login — Admin password login (development)
// Body: { phone, password }
// ---------------------------------------------------------------------------
router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(422).json(ApiResponse.fail('请输入手机号和密码'));
    }

    // Check admin password from env (default: admin123)
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (password !== adminPassword) {
      return res.status(401).json(ApiResponse.fail('密码错误'));
    }

    // Find user by phone
    const [[user]] = await pool.query('SELECT * FROM users WHERE phone = ? AND status = 1', [phone]);
    if (!user) {
      return res.status(404).json(ApiResponse.fail('用户不存在或已被禁用'));
    }

    // Check if user is admin
    const isAdmin = ADMIN_USER_IDS.includes(user.id) || user.is_admin === 1;
    if (!isAdmin) {
      return res.status(403).json(ApiResponse.fail('该用户不是管理员'));
    }

    // Update last login
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    // Generate token
    const token = jwt.sign({ userId: user.id, phone: user.phone }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });

    res.json(ApiResponse.success({
      token,
      user: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        phone: user.phone,
        is_admin: user.is_admin,
      },
    }, '登录成功'));
  } catch (err) {
    next(err);
  }
});

async function adminAuth(req, res, next) {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ code: 401, message: '请先登录' });
    }

    // Check hardcoded admin list first (MVP)
    if (ADMIN_USER_IDS.includes(userId)) {
      return next();
    }

    // Check database is_admin flag
    const [[user]] = await pool.query(
      `SELECT u.is_admin, GROUP_CONCAT(r.role) AS roles
       FROM users u
       LEFT JOIN admin_user_roles r ON r.user_id = u.id
       WHERE u.id = ? AND u.status = 1
       GROUP BY u.id`,
      [userId]
    );

    const roles = user?.roles ? user.roles.split(',') : [];
    if (!user || (user.is_admin !== 1 && !ADMIN_USER_IDS.includes(userId) && roles.length === 0)) {
      return res.status(403).json({ code: 403, message: '无权限访问，仅限管理员' });
    }

    req.adminRoles = ADMIN_USER_IDS.includes(userId) ? ['super_admin'] : roles;
    next();
  } catch (err) {
    next(err);
  }
}

// All admin routes require auth + adminAuth
router.use(auth, adminAuth);

router.get('/health', getHealth);

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard — Admin dashboard stats
// ---------------------------------------------------------------------------
router.get('/dashboard', adminController.getDashboard);

// ---------------------------------------------------------------------------
// GET /api/admin/users — List all users
// ---------------------------------------------------------------------------
router.get('/users', adminController.getUsers);

// ---------------------------------------------------------------------------
// GET /api/admin/users/:id — Get user detail (admin view)
// ---------------------------------------------------------------------------
router.get('/users/:id', adminController.getUserDetail);

// ---------------------------------------------------------------------------
// PUT /api/admin/users/:id/status — Enable/disable user
// ---------------------------------------------------------------------------
router.put('/users/:id/status', adminController.updateUserStatus);

// ---------------------------------------------------------------------------
// POST /api/admin/certifications/:userId/review — Review vehicle cert
// ---------------------------------------------------------------------------
router.post('/certifications/:userId/review', adminController.reviewCertification);

// ---------------------------------------------------------------------------
// GET /api/admin/merchants — List all merchants
// ---------------------------------------------------------------------------
router.get('/merchants', adminController.getMerchants);

// ---------------------------------------------------------------------------
// POST /api/admin/merchants/:id/review — Review merchant application
// ---------------------------------------------------------------------------
router.post('/merchants/:id/review', adminController.reviewMerchant);

// ---------------------------------------------------------------------------
// PUT /api/admin/merchants/:id/level — Adjust merchant level
// ---------------------------------------------------------------------------
router.put('/merchants/:id/level', adminController.updateMerchantLevel);

// ---------------------------------------------------------------------------
// GET /api/admin/orders — List all orders
// ---------------------------------------------------------------------------
router.get('/orders', adminController.getOrders);

// ---------------------------------------------------------------------------
// POST /api/admin/orders/:id/refund — Process refund
// ---------------------------------------------------------------------------
router.post('/orders/:id/refund', adminController.processRefund);

// ---------------------------------------------------------------------------
// GET /api/admin/group-buys — List all group buy activities
// ---------------------------------------------------------------------------
router.get('/group-buys', adminController.getGroupBuys);

// ---------------------------------------------------------------------------
// POST /api/admin/group-buys/:id/end — End/intervene group buy
// ---------------------------------------------------------------------------
router.post('/group-buys/:id/end', adminController.endGroupBuy);

// ---------------------------------------------------------------------------
// GET /api/admin/settlements — Get all settlement records
// ---------------------------------------------------------------------------
router.get('/settlements', adminController.getSettlements);

// ---------------------------------------------------------------------------
// POST /api/admin/settlements/trigger — Trigger settlement for order
// ---------------------------------------------------------------------------
router.post('/settlements/trigger', adminController.triggerSettlement);

// ---------------------------------------------------------------------------
// GET /api/admin/coupons — Get all coupon data
// ---------------------------------------------------------------------------
router.get('/coupons', adminController.getCoupons);

// ---------------------------------------------------------------------------
// POST /api/admin/coupons/config — Create/update coupon config
// ---------------------------------------------------------------------------
router.post('/coupons/config', adminController.createCouponConfig);

// ---------------------------------------------------------------------------
// GET /api/admin/invites — Get invite statistics
// ---------------------------------------------------------------------------
router.get('/invites', adminController.getInviteStats);

// ---------------------------------------------------------------------------
// GET /api/admin/invites/rewards — Get invite reward records
// ---------------------------------------------------------------------------
router.get('/invites/rewards', adminController.getInviteRewards);

// ---------------------------------------------------------------------------
// GET /api/admin/growth/config — Get growth level config
// ---------------------------------------------------------------------------
router.get('/growth/config', adminController.getLevelConfig);

// ---------------------------------------------------------------------------
// PUT /api/admin/growth/config — Update growth level config
// ---------------------------------------------------------------------------
router.put('/growth/config', adminController.updateLevelConfig);

// ---------------------------------------------------------------------------
// GET /api/admin/logs — Get operation logs
// ---------------------------------------------------------------------------
router.get('/logs', adminController.getOperationLogs);

// ---------------------------------------------------------------------------
// GET /api/admin/support-tickets — List customer service tickets
// ---------------------------------------------------------------------------
router.get('/support-tickets', adminController.getSupportTickets);

// ---------------------------------------------------------------------------
// POST /api/admin/support-tickets/:id/resolve — Update ticket status
// ---------------------------------------------------------------------------
router.post('/support-tickets/:id/resolve', adminController.resolveSupportTicket);

// ---------------------------------------------------------------------------
// GET /api/admin/statistics — Get detailed statistics
// ---------------------------------------------------------------------------
router.get('/statistics', adminController.getStatistics);

module.exports = router;
