const pool = require('../config/db');
const config = require('../config');
const { ApiResponse, generateOrderNo } = require('../utils/helpers');
const websocket = require('../services/websocket');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

/**
 * Hardcoded admin list for MVP — IDs of users with admin privileges.
 * In production this should check the is_admin column in the users table.
 */
const ADMIN_USER_IDS = process.env.ADMIN_USER_IDS
  ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id))
  : [1];

/**
 * Check if a user is an admin.
 * Returns true/false.
 */
async function checkIsAdmin(userId) {
  // First check hardcoded admin list (MVP)
  if (ADMIN_USER_IDS.includes(userId)) return true;

  // Also check the is_admin flag on the user record
  const [[user]] = await pool.query(
    'SELECT is_admin FROM users WHERE id = ? AND status = 1',
    [userId]
  );
  return user?.is_admin === 1;
}

// ---------------------------------------------------------------------------
// 1. getDashboard — Admin dashboard stats
// ---------------------------------------------------------------------------
const getDashboard = async (req, res, next) => {
  try {
    // Run all queries in parallel
    const [
      [[{ totalUsers }]],
      [[{ newUsersToday }]],
      [[{ totalTrips }]],
      [[{ activeTrips }]],
      [[{ totalMerchants }]],
      [[{ totalOrders }]],
      [[todayRevenue]],
      [[{ totalRevenue }]],
      [[{ pendingCerts }]],
      [[{ pendingMerchants }]],
      [[{ pendingRefunds }]]
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) AS totalUsers FROM users WHERE status = 1'),
      pool.query('SELECT COUNT(*) AS newUsersToday FROM users WHERE status = 1 AND DATE(created_at) = CURDATE()'),
      pool.query('SELECT COUNT(*) AS totalTrips FROM trips WHERE status != 0'),
      pool.query('SELECT COUNT(*) AS activeTrips FROM trips WHERE status IN (1, 2)'),
      pool.query('SELECT COUNT(*) AS totalMerchants FROM merchants WHERE status = 1'),
      pool.query('SELECT COUNT(*) AS totalOrders FROM orders'),
      pool.query('SELECT COALESCE(SUM(amount), 0) AS todayRevenue FROM orders WHERE DATE(created_at) = CURDATE() AND status IN (2, 3, 4)'),
      pool.query('SELECT COALESCE(SUM(amount), 0) AS totalRevenue FROM orders WHERE status IN (2, 3, 4)'),
      pool.query('SELECT COUNT(*) AS pendingCerts FROM users WHERE is_certified = 1'),
      pool.query('SELECT COUNT(*) AS pendingMerchants FROM merchants WHERE status = 0'),
      pool.query("SELECT COUNT(*) AS pendingRefunds FROM orders WHERE status = 5")
    ]);

    // Get today's hourly order count for chart
    const [hourlyOrders] = await pool.query(
      `SELECT HOUR(created_at) AS hour, COUNT(*) AS count
       FROM orders WHERE DATE(created_at) = CURDATE()
       GROUP BY HOUR(created_at)
       ORDER BY hour`
    );

    // Recent 7 days revenue
    const [dailyRevenue] = await pool.query(
      `SELECT DATE(created_at) AS date, COALESCE(SUM(amount), 0) AS revenue, COUNT(*) AS order_count
       FROM orders WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         AND status IN (2, 3, 4)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );

    res.json(ApiResponse.success({
      total_users: totalUsers || 0,
      new_users_today: newUsersToday || 0,
      total_trips: totalTrips || 0,
      active_trips: activeTrips || 0,
      total_merchants: totalMerchants || 0,
      total_orders: totalOrders || 0,
      today_revenue: todayRevenue?.todayRevenue || 0,
      total_revenue: totalRevenue || 0,
      pending_certifications: pendingCerts || 0,
      pending_merchants: pendingMerchants || 0,
      pending_refunds: pendingRefunds || 0,
      hourly_orders_today: hourlyOrders,
      daily_revenue_7days: dailyRevenue
    }, '获取成功'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 2. getUsers — List all users (admin)
// ---------------------------------------------------------------------------
const getUsers = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { keyword, is_certified, level, status, start_date, end_date } = req.query;

    const conditions = [];
    const params = [];

    if (keyword && keyword.trim()) {
      conditions.push('(u.nickname LIKE ? OR u.phone LIKE ?)');
      params.push(`%${keyword.trim()}%`, `%${keyword.trim()}%`);
    }
    if (is_certified !== undefined && is_certified !== '') {
      conditions.push('u.is_certified = ?');
      params.push(parseInt(is_certified));
    }
    if (level !== undefined && level !== '') {
      conditions.push('u.level = ?');
      params.push(parseInt(level));
    }
    if (status !== undefined && status !== '') {
      conditions.push('u.status = ?');
      params.push(parseInt(status));
    }
    if (start_date) {
      conditions.push('u.created_at >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('u.created_at <= ?');
      params.push(end_date + ' 23:59:59');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u ${whereClause}`,
      params
    );

    const [users] = await pool.query(
      `SELECT u.*,
              (SELECT COUNT(*) FROM trip_members WHERE user_id = u.id AND status = 2) AS trip_count,
              (SELECT COUNT(*) FROM orders WHERE user_id = u.id AND status IN (2, 3, 4)) AS order_count,
              (SELECT COUNT(*) FROM group_buy_activities WHERE initiator_id = u.id AND status IN (1, 2, 3)) AS group_buy_count
       FROM users u
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const list = users.map(u => ({
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      phone: u.phone ? u.phone.slice(0, 3) + '****' + u.phone.slice(7) : null,
      gender: u.gender,
      is_certified: u.is_certified,
      level: u.level,
      growth_value: u.growth_value,
      credit_score: u.credit_score,
      status: u.status,
      can_be_discovered: u.can_be_discovered,
      stats: {
        trip_count: u.trip_count || 0,
        order_count: u.order_count || 0,
        group_buy_count: u.group_buy_count || 0
      },
      last_login_at: u.last_login_at,
      created_at: u.created_at,
      updated_at: u.updated_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 3. getUserDetail — Get user detail (admin view)
// ---------------------------------------------------------------------------
const getUserDetail = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id);
    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(422).json(ApiResponse.fail('无效的用户ID'));
    }

    const [[user]] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [targetUserId]
    );
    if (!user) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }

    // Get invite tree (who invited this user and who they invited)
    const [[invitedBy]] = await pool.query(
      `SELECT ui.inviter_id, u.nickname AS inviter_nickname, u.phone AS inviter_phone,
              ui.bind_type, ui.created_at
       FROM user_invites ui
       JOIN users u ON u.id = ui.inviter_id
       WHERE ui.invitee_id = ?`,
      [targetUserId]
    );

    const [invitedList] = await pool.query(
      `SELECT ui.invitee_id, ui.reward_claimed, ui.created_at,
              u.nickname, u.phone, u.created_at AS user_created_at
       FROM user_invites ui
       JOIN users u ON u.id = ui.invitee_id
       WHERE ui.inviter_id = ?
       ORDER BY ui.created_at DESC`,
      [targetUserId]
    );

    // Get recent orders
    const [orders] = await pool.query(
      `SELECT o.*, gbp.name AS product_name, m.name AS merchant_name
       FROM orders o
       LEFT JOIN group_buy_products gbp ON gbp.id = o.product_id
       LEFT JOIN merchants m ON m.id = o.merchant_id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC
       LIMIT 20`,
      [targetUserId]
    );

    // Get recent trips
    const [trips] = await pool.query(
      `SELECT t.*, tm.role, tm.status AS member_status
       FROM trip_members tm
       JOIN trips t ON t.id = tm.trip_id
       WHERE tm.user_id = ?
       ORDER BY t.created_at DESC
       LIMIT 20`,
      [targetUserId]
    );

    // Get operation logs
    const [logs] = await pool.query(
      `SELECT action, target_type, target_id, detail, created_at
       FROM operation_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [targetUserId]
    );

    res.json(ApiResponse.success({
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      phone: user.phone,
      gender: user.gender,
      vehicle_model: user.vehicle_model,
      plate_number: user.plate_number,
      signature: user.signature,
      is_certified: user.is_certified,
      certification_data: user.certification_data ? parseJson(user.certification_data) : null,
      level: user.level,
      growth_value: user.growth_value,
      credit_score: user.credit_score,
      total_distance: user.total_distance,
      total_teams: user.total_teams,
      total_group_buy: user.total_group_buy,
      total_invites: user.total_invites,
      can_be_discovered: user.can_be_discovered,
      status: user.status,
      wx_openid: user.wx_openid ? '***' : null,
      wx_unionid: user.wx_unionid ? '***' : null,
      last_position: user.last_position ? parseJson(user.last_position) : null,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
      updated_at: user.updated_at,
      invite_info: {
        invited_by: invitedBy ? {
          inviter_id: invitedBy.inviter_id,
          inviter_nickname: invitedBy.inviter_nickname,
          inviter_phone: invitedBy.inviter_phone ? invitedBy.inviter_phone.slice(0, 3) + '****' + invitedBy.inviter_phone.slice(7) : null,
          bind_type: invitedBy.bind_type,
          invited_at: invitedBy.created_at
        } : null,
        invited_users: invitedList.map(i => ({
          user_id: i.invitee_id,
          nickname: i.nickname,
          phone: i.phone ? i.phone.slice(0, 3) + '****' + i.phone.slice(7) : null,
          reward_claimed: i.reward_claimed === 1,
          invited_at: i.created_at,
          user_created_at: i.user_created_at
        })),
        total_invited: invitedList.length
      },
      recent_orders: orders.map(o => ({
        id: o.id,
        order_no: o.order_no,
        product_name: o.product_name,
        merchant_name: o.merchant_name,
        amount: o.amount,
        pay_amount: o.pay_amount,
        status: o.status,
        verify_code: o.verify_code,
        created_at: o.created_at
      })),
      recent_trips: trips.map(t => ({
        id: t.id,
        title: t.title,
        role: t.role,
        member_status: t.member_status,
        departure_time: t.departure_time,
        status: t.status,
        created_at: t.created_at
      })),
      operation_logs: logs
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 4. updateUserStatus — Enable/disable user account
// ---------------------------------------------------------------------------
const updateUserStatus = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.id);
    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(422).json(ApiResponse.fail('无效的用户ID'));
    }

    const { status } = req.body;
    if (status === undefined || ![0, 1].includes(status)) {
      return res.status(422).json(ApiResponse.fail('请提供有效的状态值 (0: 禁用, 1: 启用)'));
    }

    const [[user]] = await pool.query('SELECT id, status FROM users WHERE id = ?', [targetUserId]);
    if (!user) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }

    await pool.query('UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?', [status, targetUserId]);

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [req.userId, status === 1 ? 'enable_user' : 'disable_user', 'user', String(targetUserId),
        JSON.stringify({ previous_status: user.status, new_status: status })]
    );

    res.json(ApiResponse.success(null, status === 1 ? '用户已启用' : '用户已禁用'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 5. reviewCertification — Approve or reject vehicle certification
// ---------------------------------------------------------------------------
const reviewCertification = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(422).json(ApiResponse.fail('无效的用户ID'));
    }

    const { approved, reject_reason } = req.body;

    if (approved === undefined) {
      return res.status(422).json(ApiResponse.fail('请提供审核结果 (approved)'));
    }

    const [[user]] = await pool.query(
      'SELECT id, is_certified, certification_data FROM users WHERE id = ?',
      [targetUserId]
    );
    if (!user) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }
    if (user.is_certified !== 1) {
      return res.status(400).json(ApiResponse.fail('该用户没有待审核的认证申请'));
    }

    if (approved) {
      // Approve: set is_certified = 2
      await pool.query(
        'UPDATE users SET is_certified = 2, updated_at = NOW() WHERE id = ?',
        [targetUserId]
      );

      // Award growth value
      const growthAward = config.growth?.factors?.certify_complete || 100;
      await pool.query(
        'UPDATE users SET growth_value = growth_value + ?, updated_at = NOW() WHERE id = ?',
        [growthAward, targetUserId]
      );

      // Log
      await pool.query(
        `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
         VALUES (?, 'certification_approved', 'user', ?, ?, NOW())`,
        [req.userId, String(targetUserId), JSON.stringify({ by_admin: req.userId })]
      );
      // Log for the user too
      await pool.query(
        `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
         VALUES (?, 'certification_approved', 'user', ?, ?, NOW())`,
        [targetUserId, String(targetUserId), JSON.stringify({ growth_award: growthAward })]
      );
    } else {
      // Reject: set is_certified = 0, clear certification_data
      await pool.query(
        'UPDATE users SET is_certified = 0, certification_data = NULL, updated_at = NOW() WHERE id = ?',
        [targetUserId]
      );

      // Log
      await pool.query(
        `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
         VALUES (?, 'certification_rejected', 'user', ?, ?, NOW())`,
        [req.userId, String(targetUserId), JSON.stringify({ by_admin: req.userId, reason: reject_reason || '未通过审核' })]
      );
      await pool.query(
        `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
         VALUES (?, 'certification_rejected', 'user', ?, ?, NOW())`,
        [targetUserId, String(targetUserId), JSON.stringify({ reason: reject_reason || '未通过审核' })]
      );
    }

    res.json(ApiResponse.success(null, approved ? '认证已通过' : '认证已驳回'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 6. getMerchants — List all merchants (admin)
// ---------------------------------------------------------------------------
const getMerchants = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { type, level, status, keyword } = req.query;

    const conditions = [];
    const params = [];

    if (type && type.trim()) {
      conditions.push('m.type = ?');
      params.push(type.trim());
    }
    if (level !== undefined && level !== '') {
      conditions.push('m.level = ?');
      params.push(parseInt(level));
    }
    if (status !== undefined && status !== '') {
      conditions.push('m.status = ?');
      params.push(parseInt(status));
    }
    if (keyword && keyword.trim()) {
      conditions.push('(m.name LIKE ? OR m.phone LIKE ? OR m.address LIKE ?)');
      params.push(`%${keyword.trim()}%`, `%${keyword.trim()}%`, `%${keyword.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM merchants m ${whereClause}`,
      params
    );

    const [merchants] = await pool.query(
      `SELECT m.*, u.nickname AS owner_nickname, u.phone AS owner_phone,
              (SELECT COUNT(*) FROM group_buy_products WHERE merchant_id = m.id) AS product_count,
              (SELECT COUNT(*) FROM orders WHERE merchant_id = m.id) AS order_count
       FROM merchants m
       JOIN users u ON u.id = m.owner_id
       ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const list = merchants.map(m => ({
      id: m.id,
      name: m.name,
      type: m.type,
      logo: m.logo,
      phone: m.phone,
      address: m.address,
      location: parseJson(m.location),
      service_scope: m.service_scope,
      description: m.description,
      rating: m.rating,
      level: m.level,
      score: m.score,
      total_sales: m.total_sales || 0,
      status: m.status,
      status_text: ['待审核', '已通过', '已拒绝'][m.status] || '未知',
      can_provide_invite_coupon: m.can_provide_invite_coupon === 1,
      can_join_reward_pool: m.can_join_reward_pool === 1,
      owner: {
        id: m.owner_id,
        nickname: m.owner_nickname,
        phone: m.owner_phone ? m.owner_phone.slice(0, 3) + '****' + m.owner_phone.slice(7) : null
      },
      stats: {
        product_count: m.product_count || 0,
        order_count: m.order_count || 0
      },
      created_at: m.created_at,
      updated_at: m.updated_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 7. reviewMerchant — Approve or reject merchant application
// ---------------------------------------------------------------------------
const reviewMerchant = async (req, res, next) => {
  try {
    const merchantId = parseInt(req.params.id);
    if (!merchantId || isNaN(merchantId)) {
      return res.status(422).json(ApiResponse.fail('无效的商家ID'));
    }

    const { approved, reject_reason } = req.body;
    if (approved === undefined) {
      return res.status(422).json(ApiResponse.fail('请提供审核结果 (approved)'));
    }

    const [[merchant]] = await pool.query(
      'SELECT * FROM merchants WHERE id = ?',
      [merchantId]
    );
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('商家不存在'));
    }
    if (merchant.status !== 0) {
      return res.status(400).json(ApiResponse.fail('该商家已审核过'));
    }

    const newStatus = approved ? 1 : 2;

    await pool.query(
      'UPDATE merchants SET status = ?, updated_at = NOW() WHERE id = ?',
      [newStatus, merchantId]
    );

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [req.userId, approved ? 'approve_merchant' : 'reject_merchant', 'merchant', String(merchantId),
        JSON.stringify({ reason: reject_reason || null })]
    );

    // Log for the merchant owner
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [merchant.owner_id, approved ? 'merchant_approved' : 'merchant_rejected', 'merchant', String(merchantId),
        JSON.stringify({ reason: reject_reason || null })]
    );

    // 通知商家 owner:入驻审核结果
    try {
      const title = approved ? '✅ 商家入驻审核通过' : '❌ 商家入驻审核未通过';
      const content = approved
        ? `恭喜！「${merchant.name}」已通过审核，现在可以发布拼团商品了。`
        : `很遗憾，「${merchant.name}」未通过审核${reject_reason ? '：' + reject_reason : ''}，可修改资料后重新提交。`;
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, content, payload, read_at, created_at)
         VALUES (?, 'merchant_review', ?, ?, ?, NULL, NOW())`,
        [merchant.owner_id, title, content,
          JSON.stringify({ merchant_id: merchantId, status: newStatus, reason: reject_reason || null })]
      );
      websocket.sendSystemNotification(
        [merchant.owner_id],
        { title, content, type: 'merchant_review', priority: 'normal', data: { merchant_id: merchantId, status: newStatus } },
        global.wsServer
      );
    } catch (notifyErr) {
      console.warn('[Admin] merchant notify failed:', notifyErr.message);
    }

    res.json(ApiResponse.success(null, approved ? '商家已通过审核' : '商家申请已驳回'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 8. updateMerchantLevel — Manually adjust merchant level and score
// ---------------------------------------------------------------------------
const updateMerchantLevel = async (req, res, next) => {
  try {
    const merchantId = parseInt(req.params.id);
    if (!merchantId || isNaN(merchantId)) {
      return res.status(422).json(ApiResponse.fail('无效的商家ID'));
    }

    const { level, score } = req.body;
    if (level === undefined && score === undefined) {
      return res.status(422).json(ApiResponse.fail('请提供等级或分数'));
    }

    const [[merchant]] = await pool.query(
      'SELECT * FROM merchants WHERE id = ?',
      [merchantId]
    );
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('商家不存在'));
    }

    const updates = [];
    const params = [];

    if (level !== undefined) {
      if (level < 1 || level > 5) {
        return res.status(422).json(ApiResponse.fail('等级应在1-5之间'));
      }
      updates.push('level = ?');
      params.push(parseInt(level));
    }
    if (score !== undefined) {
      if (score < 0) {
        return res.status(422).json(ApiResponse.fail('分数不能为负数'));
      }
      updates.push('score = ?');
      params.push(parseInt(score));
    }

    params.push(merchantId);
    await pool.query(
      `UPDATE merchants SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params
    );

    // Log
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'update_merchant_level', 'merchant', ?, ?, NOW())`,
      [req.userId, String(merchantId), JSON.stringify({
        previous_level: merchant.level, previous_score: merchant.score,
        new_level: level !== undefined ? parseInt(level) : merchant.level,
        new_score: score !== undefined ? parseInt(score) : merchant.score
      })]
    );

    res.json(ApiResponse.success(null, '商家等级已更新'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 9. getOrders — List all orders (admin)
// ---------------------------------------------------------------------------
const getOrders = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { status, merchant_id, start_date, end_date, keyword } = req.query;

    const conditions = [];
    const params = [];

    if (status !== undefined && status !== '') {
      conditions.push('o.status = ?');
      params.push(parseInt(status));
    }
    if (merchant_id) {
      conditions.push('o.merchant_id = ?');
      params.push(parseInt(merchant_id));
    }
    if (start_date) {
      conditions.push('o.created_at >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('o.created_at <= ?');
      params.push(end_date + ' 23:59:59');
    }
    if (keyword && keyword.trim()) {
      conditions.push('(o.order_no LIKE ? OR u.nickname LIKE ? OR u.phone LIKE ?)');
      params.push(`%${keyword.trim()}%`, `%${keyword.trim()}%`, `%${keyword.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o ${whereClause}`,
      params
    );

    const [orders] = await pool.query(
      `SELECT o.*,
              u.nickname, u.phone AS user_phone, u.avatar,
              gbp.name AS product_name,
              m.name AS merchant_name, m.type AS merchant_type
       FROM orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN group_buy_products gbp ON gbp.id = o.product_id
       LEFT JOIN merchants m ON m.id = o.merchant_id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const list = orders.map(o => ({
      id: o.id,
      order_no: o.order_no,
      user: {
        id: o.user_id,
        nickname: o.nickname,
        avatar: o.avatar,
        phone: o.user_phone
      },
      product: {
        id: o.product_id,
        name: o.product_name
      },
      merchant: {
        id: o.merchant_id,
        name: o.merchant_name,
        type: o.merchant_type
      },
      activity_id: o.activity_id,
      quantity: o.quantity,
      amount: o.amount,
      pay_amount: o.pay_amount,
      coupon_id: o.coupon_id,
      coupon_discount: o.coupon_discount,
      status: o.status,
      status_text: ['已取消', '待付款', '已付款', '已核销', '已完成', '退款中', '已退款', '退款失败'][o.status] || '未知',
      verify_code: o.verify_code,
      pay_type: o.pay_type,
      transaction_id: o.transaction_id,
      verified_at: o.verified_at,
      pay_at: o.pay_at,
      refund_at: o.refund_at,
      refund_amount: o.refund_amount,
      refund_reason: o.refund_reason,
      created_at: o.created_at,
      updated_at: o.updated_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 10. processRefund — Admin processes a refund request
// ---------------------------------------------------------------------------
const processRefund = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id);
    if (!orderId || isNaN(orderId)) {
      return res.status(422).json(ApiResponse.fail('无效的订单ID'));
    }

    const { approved, reject_reason } = req.body;
    if (approved === undefined) {
      return res.status(422).json(ApiResponse.fail('请提供处理结果 (approved)'));
    }

    const [[order]] = await pool.query(
      'SELECT * FROM orders WHERE id = ?',
      [orderId]
    );
    if (!order) {
      return res.status(404).json(ApiResponse.fail('订单不存在'));
    }
    if (order.status !== 5) {
      return res.status(400).json(ApiResponse.fail('该订单不在退款申请状态'));
    }

    if (approved) {
      // Process refund: update order status to 6 (已退款)
      await pool.query(
        'UPDATE orders SET status = 6, refund_amount = ?, refund_at = NOW(), updated_at = NOW() WHERE id = ?',
        [order.pay_amount || order.amount, orderId]
      );

      // If a coupon was used, restore it
      if (order.coupon_id) {
        await pool.query(
          'UPDATE user_coupons SET status = 0, used_at = NULL, used_order_id = NULL WHERE id = ?',
          [order.coupon_id]
        );
      }

      // Decrement activity count if order was part of a group buy
      if (order.activity_id) {
        await pool.query(
          'UPDATE group_buy_activities SET current_count = GREATEST(current_count - ?, 0), updated_at = NOW() WHERE id = ?',
          [order.quantity || 1, order.activity_id]
        );
      }

      // Log
      await pool.query(
        `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
         VALUES (?, 'refund_approved', 'order', ?, ?, NOW())`,
        [req.userId, String(orderId), JSON.stringify({ refund_amount: order.pay_amount || order.amount })]
      );
    } else {
      // Reject refund: set order back to previous status (4 已完成 or 3 已核销)
      const previousStatus = order.verified_at ? 4 : 2;
      await pool.query(
        'UPDATE orders SET status = ?, refund_reason = NULL, updated_at = NOW() WHERE id = ?',
        [previousStatus, orderId]
      );

      // Log
      await pool.query(
        `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
         VALUES (?, 'refund_rejected', 'order', ?, ?, NOW())`,
        [req.userId, String(orderId), JSON.stringify({ reason: reject_reason || '管理员拒绝' })]
      );
    }

    res.json(ApiResponse.success(null, approved ? '退款已处理' : '退款申请已拒绝'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 11. getGroupBuys — List all group buy activities
// ---------------------------------------------------------------------------
const getGroupBuys = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { status, merchant_id } = req.query;

    const conditions = [];
    const params = [];

    if (status !== undefined && status !== '') {
      conditions.push('gba.status = ?');
      params.push(parseInt(status));
    }
    if (merchant_id) {
      conditions.push('gbp.merchant_id = ?');
      params.push(parseInt(merchant_id));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM group_buy_activities gba
       JOIN group_buy_products gbp ON gbp.id = gba.product_id
       ${whereClause}`,
      params
    );

    const [activities] = await pool.query(
      `SELECT gba.*, gbp.name AS product_name, gbp.original_price, gbp.price_tiers,
              gbp.images AS product_images,
              m.name AS merchant_name, m.id AS merchant_id,
              u.nickname AS initiator_nickname
       FROM group_buy_activities gba
       JOIN group_buy_products gbp ON gbp.id = gba.product_id
       JOIN merchants m ON m.id = gbp.merchant_id
       JOIN users u ON u.id = gba.initiator_id
       ${whereClause}
       ORDER BY gba.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const list = activities.map(a => ({
      id: a.id,
      product: {
        id: a.product_id,
        name: a.product_name,
        original_price: a.original_price,
        price_tiers: parseJson(a.price_tiers),
        images: parseJson(a.product_images)
      },
      merchant: {
        id: a.merchant_id,
        name: a.merchant_name
      },
      initiator: {
        id: a.initiator_id,
        nickname: a.initiator_nickname
      },
      trip_id: a.trip_id,
      target_count: a.target_count,
      current_count: a.current_count,
      status: a.status,
      status_text: ['已取消', '拼团中', '拼团成功', '拼团失败'][a.status] || '未知',
      progress: a.target_count > 0
        ? Math.min(100, Math.round((a.current_count / a.target_count) * 100))
        : 0,
      expire_at: a.expire_at,
      completed_at: a.completed_at,
      created_at: a.created_at,
      updated_at: a.updated_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 12. endGroupBuy — Admin manually ends/intervenes a group buy
// ---------------------------------------------------------------------------
const endGroupBuy = async (req, res, next) => {
  try {
    const activityId = parseInt(req.params.id);
    if (!activityId || isNaN(activityId)) {
      return res.status(422).json(ApiResponse.fail('无效的活动ID'));
    }

    const { action } = req.body; // 'success' or 'fail'
    if (!action || !['success', 'fail'].includes(action)) {
      return res.status(422).json(ApiResponse.fail('请提供操作类型 (success/fail)'));
    }

    const [[activity]] = await pool.query(
      `SELECT gba.*, gbp.name AS product_name
       FROM group_buy_activities gba
       JOIN group_buy_products gbp ON gbp.id = gba.product_id
       WHERE gba.id = ?`,
      [activityId]
    );
    if (!activity) {
      return res.status(404).json(ApiResponse.fail('活动不存在'));
    }
    if (activity.status !== 1) {
      return res.status(400).json(ApiResponse.fail('该活动已结束'));
    }

    if (action === 'success') {
      // Force success: set status = 2
      await pool.query(
        'UPDATE group_buy_activities SET status = 2, completed_at = NOW(), updated_at = NOW() WHERE id = ?',
        [activityId]
      );

      // Update all orders in this activity to mark as ready for verification
      await pool.query(
        'UPDATE orders SET status = 2 WHERE activity_id = ? AND status = 1',
        [activityId]
      );

      // Log
      await pool.query(
        `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
         VALUES (?, 'force_group_buy_success', 'group_buy_activity', ?, ?, NOW())`,
        [req.userId, String(activityId), JSON.stringify({ action: 'force_success' })]
      );
    } else if (action === 'fail') {
      // Force fail: set status = 3, trigger refunds
      await pool.query(
        'UPDATE group_buy_activities SET status = 3, completed_at = NOW(), updated_at = NOW() WHERE id = ?',
        [activityId]
      );

      // Refund all paid orders in this activity
      const [orders] = await pool.query(
        'SELECT * FROM orders WHERE activity_id = ? AND status IN (2, 3, 4)',
        [activityId]
      );

      for (const order of orders) {
        // Update order to refund status
        await pool.query(
          'UPDATE orders SET status = 6, refund_amount = ?, refund_at = NOW(), updated_at = NOW() WHERE id = ?',
          [order.pay_amount || order.amount, order.id]
        );

        // Restore coupon if used
        if (order.coupon_id) {
          await pool.query(
            'UPDATE user_coupons SET status = 0, used_at = NULL, used_order_id = NULL WHERE id = ?',
            [order.coupon_id]
          );
        }

        // Create refund log
        await pool.query(
          `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
           VALUES (?, 'auto_refund_group_buy_fail', 'order', ?, ?, NOW())`,
          [order.user_id, String(order.id), JSON.stringify({ reason: '拼团失败自动退款', activity_id: activityId })]
        );
      }

      // Log
      await pool.query(
        `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
         VALUES (?, 'force_group_buy_fail', 'group_buy_activity', ?, ?, NOW())`,
        [req.userId, String(activityId), JSON.stringify({ action: 'force_fail', refunded_orders: orders.length })]
      );
    }

    res.json(ApiResponse.success(null, action === 'success' ? '拼团已强制成功' : '拼团已强制失败'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 13. getSettlements — Get all settlement records
// ---------------------------------------------------------------------------
const getSettlements = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { status: settleStatus, merchant_id } = req.query;

    const conditions = [];
    const params = [];

    if (settleStatus !== undefined && settleStatus !== '') {
      conditions.push('s.status = ?');
      params.push(parseInt(settleStatus));
    }
    if (merchant_id) {
      conditions.push('s.merchant_id = ?');
      params.push(parseInt(merchant_id));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM settlement_records s ${whereClause}`,
      params
    );

    const [records] = await pool.query(
      `SELECT s.*, o.order_no, o.amount AS order_amount,
              m.name AS merchant_name, m.type AS merchant_type,
              u.nickname AS user_nickname
       FROM settlement_records s
       JOIN orders o ON o.id = s.order_id
       JOIN merchants m ON m.id = s.merchant_id
       JOIN users u ON u.id = o.user_id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const list = records.map(r => ({
      id: r.id,
      order_id: r.order_id,
      order_no: r.order_no,
      order_amount: r.order_amount,
      merchant: {
        id: r.merchant_id,
        name: r.merchant_name,
        type: r.merchant_type
      },
      user: {
        id: r.user_id,
        nickname: r.user_nickname
      },
      commission_rate: r.commission_rate,
      commission_amount: r.commission_amount,
      settlement_amount: r.settlement_amount,
      status: r.status,
      status_text: ['待结算', '已结算', '结算失败'][r.status] || '未知',
      settled_at: r.settled_at,
      remark: r.remark,
      created_at: r.created_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 14. triggerSettlement — Manually trigger settlement for an order
// ---------------------------------------------------------------------------
const triggerSettlement = async (req, res, next) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(422).json(ApiResponse.fail('请提供订单ID'));
    }

    const [[order]] = await pool.query(
      'SELECT * FROM orders WHERE id = ?',
      [order_id]
    );
    if (!order) {
      return res.status(404).json(ApiResponse.fail('订单不存在'));
    }
    if (order.status !== 4) {
      return res.status(400).json(ApiResponse.fail('只有已完成的订单才能结算'));
    }

    // Check if already settled
    const [[existingSettlement]] = await pool.query(
      'SELECT id FROM settlement_records WHERE order_id = ?',
      [order_id]
    );
    if (existingSettlement) {
      return res.status(400).json(ApiResponse.fail('该订单已有结算记录'));
    }

    // Get merchant for commission rate
    const [[merchant]] = await pool.query(
      'SELECT id, level, score, owner_id, name FROM merchants WHERE id = ?',
      [order.merchant_id]
    );
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('商家不存在'));
    }

    const commissionRates = config.commissionRates || {
      1: 0.10, 2: 0.08, 3: 0.06, 4: 0.05, 5: 0.03
    };
    const commissionRate = commissionRates[merchant.level] || 0.10;
    const amount = parseFloat(order.pay_amount || order.amount);
    const commissionAmount = Math.round(amount * commissionRate * 100) / 100;
    const settlementAmount = Math.round((amount - commissionAmount) * 100) / 100;

    // Insert settlement record
    const [result] = await pool.query(
      `INSERT INTO settlement_records
        (order_id, merchant_id, amount, commission_rate, commission_amount,
         settlement_amount, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
      [order_id, order.merchant_id, amount, commissionRate, commissionAmount, settlementAmount]
    );

    // Log
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'trigger_settlement', 'settlement', ?, ?, NOW())`,
      [req.userId, String(result.insertId), JSON.stringify({
        order_id, commission_rate: commissionRate,
        commission_amount: commissionAmount, settlement_amount: settlementAmount
      })]
    );

    // 通知商家:已生成结算单
    try {
      const title = '💳 已生成结算单';
      const content = `订单结算金额 ¥${settlementAmount}(佣金 ¥${commissionAmount})已生成，预计 T+7 到账。`;
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, content, payload, read_at, created_at)
         VALUES (?, 'merchant_settlement', ?, ?, ?, NULL, NOW())`,
        [merchant.owner_id, title, content,
          JSON.stringify({ settlement_id: result.insertId, order_id, amount: settlementAmount })]
      );
      websocket.sendSystemNotification(
        [merchant.owner_id],
        { title, content, type: 'merchant_settlement', priority: 'normal', data: { settlement_id: result.insertId } },
        global.wsServer
      );
    } catch (notifyErr) {
      console.warn('[Admin] settlement notify failed:', notifyErr.message);
    }

    res.json(ApiResponse.success({
      settlement_id: result.insertId,
      order_id,
      amount,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      settlement_amount: settlementAmount
    }, '结算记录已创建'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 15. getCoupons — Get all coupon data
// ---------------------------------------------------------------------------
const getCoupons = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { type, status } = req.query;
    const conditions = [];
    const params = [];

    if (type !== undefined && type !== '') {
      conditions.push('ct.type = ?');
      params.push(parseInt(type));
    }
    if (status !== undefined && status !== '') {
      conditions.push('ct.status = ?');
      params.push(parseInt(status));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM coupon_templates ct ${whereClause}`,
      params
    );

    const [templates] = await pool.query(
      `SELECT ct.*,
              (SELECT COUNT(*) FROM user_coupons WHERE template_id = ct.id) AS issued_count,
              (SELECT COUNT(*) FROM user_coupons WHERE template_id = ct.id AND status = 2) AS used_count
       FROM coupon_templates ct
       ${whereClause}
       ORDER BY ct.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // Overall stats
    const [[overallStats]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM coupon_templates WHERE status = 1) AS active_templates,
         (SELECT COUNT(*) FROM user_coupons) AS total_issued,
         (SELECT COUNT(*) FROM user_coupons WHERE status = 2) AS total_used,
         (SELECT COUNT(*) FROM user_coupons WHERE status = 1 AND expire_at > NOW()) AS available_count,
         (SELECT COUNT(*) FROM user_coupons WHERE status = 3 OR (status = 1 AND expire_at <= NOW())) AS expired_count,
         (SELECT COALESCE(SUM(COALESCE(ct.discount_amount, ct.face_value, 0)), 0)
          FROM user_coupons uc
          JOIN coupon_templates ct ON ct.id = uc.template_id
          WHERE uc.status = 2) AS total_discount_amount
       FROM dual`
    );

    const list = templates.map(ct => ({
      id: ct.id,
      name: ct.name,
      type: ct.type,
      type_text: ['满减券', '折扣券', '商家券', '邀请券'][ct.type] || '未知',
      condition_amount: ct.condition_amount,
      discount_amount: ct.discount_amount,
      discount_percent: ct.discount_percent,
      total_quantity: ct.total_quantity,
      daily_limit: ct.daily_limit,
      used_quantity: ct.used_quantity,
      valid_days: ct.valid_days,
      start_date: ct.start_date,
      end_date: ct.end_date,
      status: ct.status,
      merchant_id: ct.merchant_id,
      description: ct.description,
      stats: {
        issued_count: ct.issued_count || 0,
        used_count: ct.used_count || 0,
        usage_rate: ct.issued_count > 0
          ? Math.round((ct.used_count / ct.issued_count) * 100)
          : 0
      },
      created_at: ct.created_at,
      updated_at: ct.updated_at
    }));

    res.json(ApiResponse.success({
      overview: {
        active_templates: overallStats?.active_templates || 0,
        total_issued: overallStats?.total_issued || 0,
        total_used: overallStats?.total_used || 0,
        available_count: overallStats?.available_count || 0,
        expired_count: overallStats?.expired_count || 0,
        total_discount_amount: overallStats?.total_discount_amount || 0
      },
      list,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      }
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 16. createCouponConfig — Create/update coupon budget configuration
// ---------------------------------------------------------------------------
const createCouponConfig = async (req, res, next) => {
  try {
    const {
      name, type, condition_amount, discount_amount, discount_percent,
      total_quantity, daily_limit, valid_days, start_date, end_date,
      merchant_id, description
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(422).json(ApiResponse.fail('请输入优惠券名称'));
    }
    if (type === undefined || ![0, 1, 2, 3].includes(type)) {
      return res.status(422).json(ApiResponse.fail('请选择有效的优惠券类型'));
    }
    if (type === 0 && (!condition_amount || !discount_amount || parseFloat(discount_amount) <= 0)) {
      return res.status(422).json(ApiResponse.fail('请输入满减金额'));
    }
    if (type === 1 && (!discount_percent || parseFloat(discount_percent) <= 0 || parseFloat(discount_percent) > 100)) {
      return res.status(422).json(ApiResponse.fail('请输入有效的折扣比例 (1-100)'));
    }
    if (!total_quantity || parseInt(total_quantity) <= 0) {
      return res.status(422).json(ApiResponse.fail('请输入发行总量'));
    }
    if (!valid_days || parseInt(valid_days) <= 0) {
      return res.status(422).json(ApiResponse.fail('请输入有效天数'));
    }

    const [result] = await pool.query(
      `INSERT INTO coupon_templates
        (name, type, condition_amount, discount_amount, discount_percent,
         total_quantity, daily_limit, used_quantity, valid_days,
         start_date, end_date, status, merchant_id, description,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1, ?, ?, NOW(), NOW())`,
      [
        name.trim(),
        type,
        type === 0 ? parseFloat(condition_amount) : null,
        type === 0 ? parseFloat(discount_amount) : null,
        type === 1 ? parseFloat(discount_percent) : null,
        parseInt(total_quantity),
        parseInt(daily_limit) || null,
        parseInt(valid_days),
        start_date || null,
        end_date || null,
        merchant_id || null,
        description || null
      ]
    );

    // Log
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'create_coupon_template', 'coupon_template', ?, ?, NOW())`,
      [req.userId, String(result.insertId), JSON.stringify({ name: name.trim(), type, total_quantity })]
    );

    res.json(ApiResponse.success({ template_id: result.insertId }, '优惠券模板已创建'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 17. getInviteStats — Get invite statistics
// ---------------------------------------------------------------------------
const getInviteStats = async (req, res, next) => {
  try {
    // Overall invite stats
    const [[overallStats]] = await pool.query(
      `SELECT
         COUNT(*) AS total_invites,
         COUNT(DISTINCT inviter_id) AS total_inviters,
         SUM(CASE WHEN reward_claimed = 1 THEN 1 ELSE 0 END) AS rewarded_count,
         (SELECT COUNT(*) FROM users WHERE status = 1) AS total_users
       FROM user_invites`
    );

    // Top inviters (top 20)
    const [topInviters] = await pool.query(
      `SELECT ui.inviter_id, u.nickname, u.avatar, u.phone,
              COUNT(*) AS invite_count,
              SUM(CASE WHEN ui.reward_claimed = 1 THEN 1 ELSE 0 END) AS rewarded_count
       FROM user_invites ui
       JOIN users u ON u.id = ui.inviter_id
       GROUP BY ui.inviter_id
       ORDER BY invite_count DESC
       LIMIT 20`
    );

    // Daily invite trend (last 30 days)
    const [dailyInvites] = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM user_invites
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );

    // Invite conversion rate (invited users who became active)
    const [[conversionStats]] = await pool.query(
      `SELECT
         COUNT(*) AS total_invited_users,
         SUM(CASE WHEN u.total_teams > 0 OR u.total_group_buy > 0 THEN 1 ELSE 0 END) AS active_users
       FROM user_invites ui
       JOIN users u ON u.id = ui.invitee_id`
    );

    const totalInvited = parseInt(conversionStats?.total_invited_users || 0);
    const activeInvited = parseInt(conversionStats?.active_users || 0);

    res.json(ApiResponse.success({
      total_invites: overallStats?.total_invites || 0,
      total_inviters: overallStats?.total_inviters || 0,
      rewarded_count: overallStats?.rewarded_count || 0,
      invite_rate: overallStats?.total_users > 0
        ? Math.round((overallStats.total_invites / overallStats.total_users) * 100)
        : 0,
      conversion: {
        total_invited_users: totalInvited,
        active_users: activeInvited,
        conversion_rate: totalInvited > 0
          ? Math.round((activeInvited / totalInvited) * 100)
          : 0
      },
      top_inviters: topInviters.map(t => ({
        user_id: t.inviter_id,
        nickname: t.nickname,
        avatar: t.avatar,
        phone: t.phone ? t.phone.slice(0, 3) + '****' + t.phone.slice(7) : null,
        invite_count: t.invite_count,
        rewarded_count: t.rewarded_count
      })),
      daily_invite_trend: dailyInvites
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 18. getInviteRewards — Get invite reward issuance records
// ---------------------------------------------------------------------------
const getInviteRewards = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { inviter_id, status: rewardStatus } = req.query;

    const conditions = [];
    const params = [];

    if (inviter_id) {
      conditions.push('ui.inviter_id = ?');
      params.push(parseInt(inviter_id));
    }
    if (rewardStatus !== undefined && rewardStatus !== '') {
      conditions.push('ui.reward_claimed = ?');
      params.push(parseInt(rewardStatus));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM user_invites ui ${whereClause}`,
      params
    );

    const [records] = await pool.query(
      `SELECT ui.*,
              inviter.nickname AS inviter_nickname, inviter.phone AS inviter_phone,
              invitee.nickname AS invitee_nickname, invitee.phone AS invitee_phone
       FROM user_invites ui
       JOIN users inviter ON inviter.id = ui.inviter_id
       JOIN users invitee ON invitee.id = ui.invitee_id
       ${whereClause}
       ORDER BY ui.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const list = records.map(r => ({
      id: r.id,
      inviter: {
        id: r.inviter_id,
        nickname: r.inviter_nickname,
        phone: r.inviter_phone ? r.inviter_phone.slice(0, 3) + '****' + r.inviter_phone.slice(7) : null
      },
      invitee: {
        id: r.invitee_id,
        nickname: r.invitee_nickname,
        phone: r.invitee_phone ? r.invitee_phone.slice(0, 3) + '****' + r.invitee_phone.slice(7) : null
      },
      bind_type: r.bind_type,
      bind_type_text: ['微信邀请', '邀请码', '手机号绑定', '商家推广'][r.bind_type] || '未知',
      reward_claimed: r.reward_claimed === 1,
      reward_amount: r.reward_amount,
      created_at: r.created_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 19. getLevelConfig — Get growth level configuration
// ---------------------------------------------------------------------------
const getLevelConfig = async (req, res, next) => {
  try {
    res.json(ApiResponse.success({
      levels: config.growth.levels,
      factors: config.growth.factors,
      invite_rewards: config.inviteRewards,
      current_config: {
        growth_factors: config.growth.factors,
        level_thresholds: config.growth.levels
      }
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 20. updateLevelConfig — Update growth value dimensions and weights
// ---------------------------------------------------------------------------
const updateLevelConfig = async (req, res, next) => {
  try {
    const { factors, levels } = req.body;

    if (factors) {
      // Validate factors
      const validFactorKeys = ['drive_distance', 'trip_complete', 'team_leader',
        'invite_user', 'daily_checkin', 'review_merchant', 'group_buy_count'];

      for (const [key, value] of Object.entries(factors)) {
        if (!validFactorKeys.includes(key)) {
          return res.status(422).json(ApiResponse.fail(`无效的同路值因子: ${key}`));
        }
        if (typeof value !== 'number' || value < 0) {
          return res.status(422).json(ApiResponse.fail(`${key} 的值必须是非负数`));
        }
      }

      // Merge new factors with existing config
      Object.assign(config.growth.factors, factors);
    }

    if (levels && Array.isArray(levels)) {
      for (const level of levels) {
        if (level.level === undefined || level.min === undefined) {
          return res.status(422).json(ApiResponse.fail('等级配置不完整'));
        }
      }
      // Sort levels by min ascending
      levels.sort((a, b) => a.min - b.min);
      config.growth.levels = levels;
    }

    // Log
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'update_growth_config', 'config', 'growth', ?, NOW())`,
      [req.userId, JSON.stringify({ factors, levels })]
    );

    res.json(ApiResponse.success({
      levels: config.growth.levels,
      factors: config.growth.factors
    }, '同路值配置已更新'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 21. getOperationLogs — Get operation logs with filters
// ---------------------------------------------------------------------------
const getOperationLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { user_id, action, target_type, start_date, end_date } = req.query;

    const conditions = [];
    const params = [];

    if (user_id) {
      conditions.push('ol.user_id = ?');
      params.push(parseInt(user_id));
    }
    if (action && action.trim()) {
      conditions.push('ol.action = ?');
      params.push(action.trim());
    }
    if (target_type && target_type.trim()) {
      conditions.push('ol.target_type = ?');
      params.push(target_type.trim());
    }
    if (start_date) {
      conditions.push('ol.created_at >= ?');
      params.push(start_date);
    }
    if (end_date) {
      conditions.push('ol.created_at <= ?');
      params.push(end_date + ' 23:59:59');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM operation_logs ol ${whereClause}`,
      params
    );

    const [logs] = await pool.query(
      `SELECT ol.*, u.nickname AS user_nickname
       FROM operation_logs ol
       LEFT JOIN users u ON u.id = ol.user_id
       ${whereClause}
       ORDER BY ol.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const list = logs.map(l => ({
      id: l.id,
      user: {
        id: l.user_id,
        nickname: l.user_nickname || '系统'
      },
      action: l.action,
      target_type: l.target_type,
      target_id: l.target_id,
      detail: l.detail ? parseJson(l.detail) : null,
      created_at: l.created_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 22. getSupportTickets — List all customer service tickets (admin view)
// ---------------------------------------------------------------------------
const getSupportTickets = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { status } = req.query;
    const conditions = [];
    const params = [];
    if (status !== undefined && status !== '') {
      conditions.push('t.status = ?');
      params.push(parseInt(status));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM customer_service_tickets t ${whereClause}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT t.*, u.nickname AS user_nickname, u.phone AS user_phone
       FROM customer_service_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const list = rows.map((t) => ({
      id: t.id,
      user: {
        id: t.user_id,
        nickname: t.user_nickname || '未知用户',
        phone: t.user_phone ? t.user_phone.slice(0, 3) + '****' + t.user_phone.slice(7) : null
      },
      order_id: t.order_id,
      category: t.category,
      subject: t.subject,
      content: t.content,
      priority: t.priority,
      status: t.status,
      status_text: ['待处理', '处理中', '已解决', '已关闭'][t.status] || '待处理',
      assignee_id: t.assignee_id,
      resolved_at: t.resolved_at,
      created_at: t.created_at,
      updated_at: t.updated_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 23. resolveSupportTicket — Admin updates ticket status
// ---------------------------------------------------------------------------
const resolveSupportTicket = async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { status } = req.body;
    if (!ticketId || isNaN(ticketId)) {
      return res.status(422).json(ApiResponse.fail('无效的工单ID'));
    }
    if (status === undefined || ![0, 1, 2, 3].includes(parseInt(status))) {
      return res.status(422).json(ApiResponse.fail('请提供有效状态 (0待处理/1处理中/2已解决/3已关闭)'));
    }

    await pool.query(
      `UPDATE customer_service_tickets
       SET status = ?, assignee_id = ?,
           resolved_at = CASE WHEN ? = 2 THEN NOW() ELSE resolved_at END,
           updated_at = NOW()
       WHERE id = ?`,
      [parseInt(status), req.userId, parseInt(status), ticketId]
    );

    res.json(ApiResponse.success(null, '工单状态已更新'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 24. getStatistics — Detailed statistics
// ---------------------------------------------------------------------------
const getStatistics = async (req, res, next) => {
  try {
    const { period } = req.query; // 'daily', 'weekly', 'monthly'
    const selectedPeriod = period || 'daily';

    let dateFormat, groupBy, daysBack;
    switch (selectedPeriod) {
      case 'weekly':
        dateFormat = '%Y-%u';
        groupBy = 'YEARWEEK(created_at, 1)';
        daysBack = 12 * 7; // ~12 weeks
        break;
      case 'monthly':
        dateFormat = '%Y-%m';
        groupBy = 'DATE_FORMAT(created_at, \'%Y-%m\')';
        daysBack = 365; // ~12 months
        break;
      default: // daily
        dateFormat = '%Y-%m-%d';
        groupBy = 'DATE(created_at)';
        daysBack = 30;
    }

    // Registrations
    const [registrations] = await pool.query(
      `SELECT DATE(created_at) AS date, COUNT(*) AS count
       FROM users WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY ${groupBy}
       ORDER BY date ASC`,
      [daysBack]
    );

    // Orders
    const [orderStats] = await pool.query(
      `SELECT DATE(created_at) AS date,
              COUNT(*) AS count,
              COALESCE(SUM(amount), 0) AS revenue
       FROM orders WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         AND status IN (2, 3, 4)
       GROUP BY ${groupBy}
       ORDER BY date ASC`,
      [daysBack]
    );

    // Active users (users who logged in per period)
    const [activeUsers] = await pool.query(
      `SELECT DATE(last_login_at) AS date, COUNT(*) AS count
       FROM users WHERE last_login_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY DATE(last_login_at)
       ORDER BY date ASC`,
      [daysBack]
    );

    // Trips
    const [tripStats] = await pool.query(
      `SELECT DATE(created_at) AS date,
              COUNT(*) AS count,
              SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) AS completed_count
       FROM trips WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         AND status != 0
       GROUP BY ${groupBy}
       ORDER BY date ASC`,
      [daysBack]
    );

    // Current summary
    const [[summary]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE status = 1) AS total_users,
         (SELECT COUNT(*) FROM users WHERE status = 1 AND DATE(created_at) = CURDATE()) AS new_users_today,
         (SELECT COUNT(*) FROM users WHERE last_login_at >= CURDATE()) AS active_users_today,
         (SELECT COUNT(*) FROM trips WHERE status IN (1, 2)) AS active_trips,
         (SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURDATE() AND status IN (2, 3, 4)) AS orders_today,
         (SELECT COALESCE(SUM(amount), 0) FROM orders WHERE DATE(created_at) = CURDATE() AND status IN (2, 3, 4)) AS revenue_today
       FROM dual`
    );

    res.json(ApiResponse.success({
      period: selectedPeriod,
      summary: {
        total_users: summary?.total_users || 0,
        new_users_today: summary?.new_users_today || 0,
        active_users_today: summary?.active_users_today || 0,
        active_trips: summary?.active_trips || 0,
        orders_today: summary?.orders_today || 0,
        revenue_today: summary?.revenue_today || 0
      },
      charts: {
        registrations,
        orders: orderStats,
        active_users: activeUsers,
        trips: tripStats
      }
    }));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboard,
  getUsers,
  getUserDetail,
  updateUserStatus,
  reviewCertification,
  getMerchants,
  reviewMerchant,
  updateMerchantLevel,
  getOrders,
  processRefund,
  getGroupBuys,
  endGroupBuy,
  getSettlements,
  triggerSettlement,
  getCoupons,
  createCouponConfig,
  getInviteStats,
  getInviteRewards,
  getLevelConfig,
  updateLevelConfig,
  getOperationLogs,
  getSupportTickets,
  resolveSupportTicket,
  getStatistics
};
