const pool = require('../config/db');
const config = require('../config');
const { ApiResponse } = require('../utils/helpers');
const { v4: uuidv4 } = require('uuid');

// =============================================================================
// 1. getMyCoupons — 获取我的优惠券
// GET /api/coupons/my
// =============================================================================
const getMyCoupons = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { status } = req.query;

    // Auto-expire coupons where expire_at < now and status is still 1
    await pool.query(
      `UPDATE user_coupons
       SET status = 3, updated_at = NOW()
       WHERE user_id = ? AND status = 1 AND expire_at < NOW()`,
      [userId]
    );

    const conditions = ['uc.user_id = ?'];
    const params = [userId];

    if (status !== undefined && status !== '') {
      conditions.push('uc.status = ?');
      params.push(parseInt(status));
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT uc.id AS coupon_id, uc.template_id, uc.coupon_code, uc.status,
              uc.expire_at, uc.used_at, uc.used_order_id, uc.created_at,
              ct.name AS template_name, ct.type, ct.face_value, ct.min_amount,
              ct.description, ct.merchant_id
       FROM user_coupons uc
       JOIN coupon_templates ct ON ct.id = uc.template_id
       ${whereClause}
       ORDER BY uc.status ASC, uc.expire_at ASC`,
      params
    );

    const list = rows.map(row => ({
      id: row.coupon_id,
      template_id: row.template_id,
      coupon_code: row.coupon_code,
      status: row.status,
      status_text: ['不可用', '可用', '已使用', '已过期'][row.status] || '未知',
      template: {
        name: row.template_name,
        type: row.type,
        face_value: row.face_value,
        min_amount: row.min_amount,
        description: row.description,
        merchant_id: row.merchant_id
      },
      expire_at: row.expire_at,
      used_at: row.used_at,
      used_order_id: row.used_order_id,
      created_at: row.created_at
    }));

    res.json(ApiResponse.success({ list }));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 2. getAvailableCoupons — 获取支付时可用的优惠券
// GET /api/coupons/available
// =============================================================================
const getAvailableCoupons = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { merchant_id } = req.query;

    // Auto-expire first
    await pool.query(
      `UPDATE user_coupons
       SET status = 3, updated_at = NOW()
       WHERE user_id = ? AND status = 1 AND expire_at < NOW()`,
      [userId]
    );

    // Get available coupons (status=1, not expired)
    let query;
    let params;

    if (merchant_id) {
      // Show platform coupons (merchant_id IS NULL) + that merchant's coupons
      query = `SELECT uc.id AS coupon_id, uc.template_id, uc.coupon_code, uc.status,
                      uc.expire_at, uc.created_at,
                      ct.name AS template_name, ct.type, ct.face_value, ct.min_amount,
                      ct.description, ct.merchant_id
               FROM user_coupons uc
               JOIN coupon_templates ct ON ct.id = uc.template_id
               WHERE uc.user_id = ?
                 AND uc.status = 1
                 AND uc.expire_at > NOW()
                 AND (ct.merchant_id IS NULL OR ct.merchant_id = ?)
               ORDER BY ct.face_value DESC, uc.expire_at ASC`;
      params = [userId, parseInt(merchant_id)];
    } else {
      query = `SELECT uc.id AS coupon_id, uc.template_id, uc.coupon_code, uc.status,
                      uc.expire_at, uc.created_at,
                      ct.name AS template_name, ct.type, ct.face_value, ct.min_amount,
                      ct.description, ct.merchant_id
               FROM user_coupons uc
               JOIN coupon_templates ct ON ct.id = uc.template_id
               WHERE uc.user_id = ?
                 AND uc.status = 1
                 AND uc.expire_at > NOW()
               ORDER BY ct.face_value DESC, uc.expire_at ASC`;
      params = [userId];
    }

    const [rows] = await pool.query(query, params);

    const list = rows.map(row => ({
      id: row.coupon_id,
      template_id: row.template_id,
      coupon_code: row.coupon_code,
      template: {
        name: row.template_name,
        type: row.type,
        face_value: row.face_value,
        min_amount: row.min_amount,
        description: row.description,
        merchant_id: row.merchant_id
      },
      expire_at: row.expire_at,
      created_at: row.created_at
    }));

    res.json(ApiResponse.success({ list }));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 3. useCoupon — 使用优惠券进行支付
// POST /api/coupons/use
// =============================================================================
const useCoupon = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { coupon_id, order_amount, order_id } = req.body;

    if (!coupon_id) {
      return res.status(422).json(ApiResponse.fail('请选择优惠券'));
    }
    if (order_amount === undefined || order_amount === null) {
      return res.status(422).json(ApiResponse.fail('缺少订单金额'));
    }

    // Fetch coupon
    const [[coupon]] = await pool.query(
      `SELECT uc.*, ct.name, ct.face_value, ct.min_amount, ct.type
       FROM user_coupons uc
       JOIN coupon_templates ct ON ct.id = uc.template_id
       WHERE uc.id = ? AND uc.user_id = ?`,
      [parseInt(coupon_id), userId]
    );

    if (!coupon) {
      return res.status(404).json(ApiResponse.fail('优惠券不存在'));
    }

    // Validate: coupon belongs to user, status=1, not expired
    if (coupon.status !== 1) {
      return res.status(400).json(ApiResponse.fail('优惠券不可用'));
    }

    if (new Date(coupon.expire_at) < new Date()) {
      // Auto-expire
      await pool.query(
        'UPDATE user_coupons SET status = 3, updated_at = NOW() WHERE id = ?',
        [coupon.id]
      );
      return res.status(400).json(ApiResponse.fail('优惠券已过期'));
    }

    // Check: order amount >= min_amount
    if (coupon.min_amount && order_amount < coupon.min_amount) {
      return res.status(400).json(ApiResponse.fail(`该优惠券需订单满${coupon.min_amount}元可用`));
    }

    // Mark coupon status=2, used_at=now, used_order_id
    await pool.query(
      `UPDATE user_coupons
       SET status = 2, used_at = NOW(), used_order_id = ?, updated_at = NOW()
       WHERE id = ? AND status = 1`,
      [order_id || null, coupon.id]
    );

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'use_coupon', 'user_coupon', ?, ?, NOW())`,
      [userId, String(coupon.id), JSON.stringify({
        coupon_code: coupon.coupon_code,
        face_value: coupon.face_value,
        order_amount: order_amount,
        order_id: order_id || null
      })]
    );

    res.json(ApiResponse.success({
      coupon_id: coupon.id,
      face_value: coupon.face_value,
      order_amount: order_amount,
      final_amount: Math.max(0, order_amount - coupon.face_value),
      saved: Math.min(coupon.face_value, order_amount)
    }, '优惠券已使用'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 4. returnCoupon — 退还优惠券（退款时）
// POST /api/coupons/return
// =============================================================================
const returnCoupon = async (req, res, next) => {
  try {
    const { coupon_id, order_id } = req.body;

    if (!coupon_id) {
      return res.status(422).json(ApiResponse.fail('缺少优惠券ID'));
    }

    // Verify coupon was used on this order
    const [[coupon]] = await pool.query(
      'SELECT * FROM user_coupons WHERE id = ? AND used_order_id = ? AND status = 2',
      [parseInt(coupon_id), order_id || null]
    );

    if (!coupon) {
      return res.status(404).json(ApiResponse.fail('未找到该优惠券使用记录'));
    }

    // Reset status back to 1, clear used_at and used_order_id
    // Extend expire_at by 7 days if needed
    await pool.query(
      `UPDATE user_coupons
       SET status = 1, used_at = NULL, used_order_id = NULL,
           expire_at = GREATEST(expire_at, DATE_ADD(NOW(), INTERVAL 7 DAY)),
           updated_at = NOW()
       WHERE id = ?`,
      [coupon.id]
    );

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'return_coupon', 'user_coupon', ?, ?, NOW())`,
      [coupon.user_id, String(coupon.id), JSON.stringify({
        coupon_code: coupon.coupon_code,
        order_id: order_id,
        extended_expiry: true
      })]
    );

    res.json(ApiResponse.success({
      coupon_id: coupon.id,
      coupon_code: coupon.coupon_code,
      status: 1
    }, '优惠券已退还'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 5. issueCoupon — 发放优惠券给用户
// POST /api/coupons/issue
// =============================================================================
const issueCoupon = async (req, res, next) => {
  try {
    const { template_id, user_ids } = req.body;

    if (!template_id) {
      return res.status(422).json(ApiResponse.fail('请选择优惠券模板'));
    }
    if (!user_ids || (Array.isArray(user_ids) && user_ids.length === 0)) {
      return res.status(422).json(ApiResponse.fail('请选择发放用户'));
    }

    const userIds = Array.isArray(user_ids) ? user_ids : [user_ids];

    // Check template availability
    const [[template]] = await pool.query(
      'SELECT * FROM coupon_templates WHERE id = ?',
      [parseInt(template_id)]
    );

    if (!template) {
      return res.status(404).json(ApiResponse.fail('优惠券模板不存在'));
    }

    // Check total_quantity vs issued_quantity
    if (template.total_quantity !== null && template.total_quantity !== -1) {
      const remaining = template.total_quantity - (template.issued_quantity || 0);
      if (remaining < userIds.length) {
        return res.status(400).json(ApiResponse.fail(`优惠券库存不足，剩余${remaining}张`));
      }
    }

    const results = [];
    let issuedCount = 0;

    for (const userId of userIds) {
      // Generate unique coupon_code (template_prefix + uuid snippet)
      const prefix = template.prefix || 'CO';
      const couponCode = `${prefix}${uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase()}`;

      // Calculate expire_at
      const validDays = template.valid_days || 30;
      const expireAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

      try {
        await pool.query(
          `INSERT INTO user_coupons
            (user_id, template_id, coupon_code, status, expire_at, created_at, updated_at)
           VALUES (?, ?, ?, 1, ?, NOW(), NOW())`,
          [parseInt(userId), parseInt(template_id), couponCode, expireAt]
        );
        issuedCount++;
        results.push({ user_id: parseInt(userId), coupon_code: couponCode, success: true });
      } catch (err) {
        console.error(`[Coupon] Failed to issue coupon to user ${userId}:`, err.message);
        results.push({ user_id: parseInt(userId), success: false, error: err.message });
      }
    }

    // Increment template.issued_quantity
    if (issuedCount > 0) {
      await pool.query(
        `UPDATE coupon_templates
         SET issued_quantity = COALESCE(issued_quantity, 0) + ?, updated_at = NOW()
         WHERE id = ?`,
        [issuedCount, parseInt(template_id)]
      );
    }

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'issue_coupon', 'coupon_template', ?, ?, NOW())`,
      [req.userId, String(template_id), JSON.stringify({
        template_name: template.name,
        user_ids: userIds,
        issued_count: issuedCount,
        failed_count: userIds.length - issuedCount
      })]
    );

    res.json(ApiResponse.success({
      template_id: parseInt(template_id),
      template_name: template.name,
      total_sent: userIds.length,
      issued_count: issuedCount,
      failed_count: userIds.length - issuedCount,
      details: results
    }, `成功发放${issuedCount}张优惠券`));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 6. issueInviteCoupon — 发放邀请奖励优惠券
// =============================================================================
const issueInviteCoupon = async (req, res, next) => {
  try {
    const userId = req.userId;

    // Get user's current invite count
    const [[inviteStats]] = await pool.query(
      'SELECT COUNT(*) AS total_invited FROM user_invites WHERE inviter_id = ?',
      [userId]
    );

    const inviteCount = inviteStats?.total_invited || 0;

    // Determine coupon value based on invite count (config.inviteRewards tiers)
    const rewards = config.inviteRewards || [];
    let matchedTier = null;

    for (let i = rewards.length - 1; i >= 0; i--) {
      if (inviteCount >= rewards[i].count) {
        matchedTier = rewards[i];
        break;
      }
    }

    if (!matchedTier) {
      return res.status(400).json(ApiResponse.fail('邀请人数尚未达到奖励门槛'));
    }

    // Check if this tier reward was already claimed
    const [[existingClaim]] = await pool.query(
      `SELECT id FROM operation_logs
       WHERE user_id = ? AND action = 'invite_reward' AND
             JSON_EXTRACT(detail, '$.tier_count') = ?`,
      [userId, String(matchedTier.count)]
    );

    if (existingClaim) {
      return res.status(400).json(ApiResponse.fail('该档位奖励已领取'));
    }

    // Find or create coupon template for this reward tier
    const templateName = `邀请奖励${matchedTier.count}人`;
    const [existingTemplates] = await pool.query(
      'SELECT * FROM coupon_templates WHERE name = ? AND status = 1',
      [templateName]
    );

    let templateId;
    if (existingTemplates.length > 0) {
      templateId = existingTemplates[0].id;
    } else {
      // Create a new template
      const [result] = await pool.query(
        `INSERT INTO coupon_templates
          (name, type, face_value, min_amount, valid_days, total_quantity,
           description, status, created_at, updated_at)
         VALUES (?, 'discount', ?, 0, 30, -1, ?, 1, NOW(), NOW())`,
        [templateName, matchedTier.couponValue, matchedTier.description]
      );
      templateId = result.insertId;
    }

    // Generate coupon code
    const couponCode = `RV${uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    const validDays = 30;
    const expireAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);

    // Issue coupon to user
    await pool.query(
      `INSERT INTO user_coupons
        (user_id, template_id, coupon_code, status, expire_at, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, NOW(), NOW())`,
      [userId, templateId, couponCode, expireAt]
    );

    // Increment template issued count
    await pool.query(
      `UPDATE coupon_templates
       SET issued_quantity = COALESCE(issued_quantity, 0) + 1, updated_at = NOW()
       WHERE id = ?`,
      [templateId]
    );

    // Mark reward as claimed
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'invite_reward', 'coupon_template', ?, ?, NOW())`,
      [userId, String(templateId), JSON.stringify({
        tier_count: matchedTier.count,
        coupon_value: matchedTier.couponValue,
        coupon_code: couponCode,
        total_invited: inviteCount
      })]
    );

    // Update user_invites to mark reward claimed for this tier
    await pool.query(
      `UPDATE user_invites
       SET reward_claimed = 1
       WHERE inviter_id = ? AND reward_claimed = 0
       LIMIT ?`,
      [userId, matchedTier.count]
    );

    res.json(ApiResponse.success({
      coupon_code: couponCode,
      face_value: matchedTier.couponValue,
      tier_count: matchedTier.count,
      expire_at: expireAt.toISOString(),
      total_invited: inviteCount,
      template_id: templateId
    }, `恭喜！邀请${matchedTier.count}人奖励${matchedTier.couponValue}元优惠券已发放`));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 7. getTemplates — 获取优惠券模板列表（管理端）
// GET /api/coupons/templates
// =============================================================================
const getTemplates = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { type, merchant_id, status } = req.query;

    const conditions = [];
    const params = [];

    if (type) {
      conditions.push('ct.type = ?');
      params.push(type);
    }

    if (merchant_id !== undefined) {
      if (merchant_id === '0' || merchant_id === '') {
        conditions.push('ct.merchant_id IS NULL');
      } else {
        conditions.push('ct.merchant_id = ?');
        params.push(parseInt(merchant_id));
      }
    }

    if (status !== undefined && status !== '') {
      conditions.push('ct.status = ?');
      params.push(parseInt(status));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM coupon_templates ct ${whereClause}`,
      params
    );

    // Fetch list
    const [rows] = await pool.query(
      `SELECT ct.*,
              COALESCE(m.name, '平台') AS merchant_name
       FROM coupon_templates ct
       LEFT JOIN merchants m ON m.id = ct.merchant_id
       ${whereClause}
       ORDER BY ct.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const list = rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      face_value: row.face_value,
      min_amount: row.min_amount,
      total_quantity: row.total_quantity,
      issued_quantity: row.issued_quantity || 0,
      used_quantity: row.used_quantity || 0,
      valid_days: row.valid_days,
      prefix: row.prefix,
      description: row.description,
      merchant_id: row.merchant_id,
      merchant_name: row.merchant_name,
      status: row.status,
      start_time: row.start_time,
      end_time: row.end_time,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 8. createTemplate — 创建优惠券模板（管理端）
// POST /api/coupons/templates
// =============================================================================
const createTemplate = async (req, res, next) => {
  try {
    const userId = req.userId;
    const {
      name, type, face_value, min_amount, total_quantity,
      valid_days, prefix, description, merchant_id,
      start_time, end_time
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      return res.status(422).json(ApiResponse.fail('请输入模板名称'));
    }
    if (!type) {
      return res.status(422).json(ApiResponse.fail('请选择优惠券类型'));
    }
    if (!face_value || parseFloat(face_value) <= 0) {
      return res.status(422).json(ApiResponse.fail('请输入有效的面值'));
    }

    const validTypes = ['discount', 'full_reduction', 'free_shipping', 'cash'];
    if (!validTypes.includes(type)) {
      return res.status(422).json(ApiResponse.fail('优惠券类型无效'));
    }

    const [result] = await pool.query(
      `INSERT INTO coupon_templates
        (name, type, face_value, min_amount, total_quantity, issued_quantity,
         valid_days, prefix, description, merchant_id,
         start_time, end_time, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [
        name.trim(),
        type,
        parseFloat(face_value),
        min_amount ? parseFloat(min_amount) : 0,
        total_quantity ? parseInt(total_quantity) : -1,
        valid_days ? parseInt(valid_days) : 30,
        prefix || 'CO',
        description || null,
        merchant_id || null,
        start_time || null,
        end_time || null
      ]
    );

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'create_coupon_template', 'coupon_template', ?, ?, NOW())`,
      [userId, String(result.insertId), JSON.stringify({ name: name.trim(), type, face_value })]
    );

    res.json(ApiResponse.success({
      id: result.insertId,
      name: name.trim(),
      type: type,
      face_value: parseFloat(face_value)
    }, '优惠券模板创建成功'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 9. updateTemplate — 更新优惠券模板（管理端）
// PUT /api/coupons/templates/:id
// =============================================================================
const updateTemplate = async (req, res, next) => {
  try {
    const userId = req.userId;
    const templateId = parseInt(req.params.id);
    if (!templateId || isNaN(templateId)) {
      return res.status(422).json(ApiResponse.fail('无效的模板ID'));
    }

    // Check template exists
    const [[template]] = await pool.query(
      'SELECT * FROM coupon_templates WHERE id = ?',
      [templateId]
    );

    if (!template) {
      return res.status(404).json(ApiResponse.fail('优惠券模板不存在'));
    }

    // Editable fields
    const editableFields = [
      'name', 'type', 'face_value', 'min_amount', 'total_quantity',
      'valid_days', 'prefix', 'description', 'merchant_id',
      'start_time', 'end_time', 'status'
    ];

    const updates = [];
    const params = [];

    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        switch (field) {
          case 'name':
            if (!req.body[field] || !req.body[field].trim()) {
              return res.status(422).json(ApiResponse.fail('模板名称不能为空'));
            }
            updates.push('name = ?');
            params.push(req.body[field].trim());
            break;
          case 'type':
            const validTypes = ['discount', 'full_reduction', 'free_shipping', 'cash'];
            if (!validTypes.includes(req.body[field])) {
              return res.status(422).json(ApiResponse.fail('优惠券类型无效'));
            }
            updates.push('type = ?');
            params.push(req.body[field]);
            break;
          case 'face_value':
            updates.push('face_value = ?');
            params.push(parseFloat(req.body[field]));
            break;
          case 'min_amount':
            updates.push('min_amount = ?');
            params.push(parseFloat(req.body[field]) || 0);
            break;
          case 'total_quantity':
            updates.push('total_quantity = ?');
            params.push(parseInt(req.body[field]) || -1);
            break;
          case 'valid_days':
            updates.push('valid_days = ?');
            params.push(parseInt(req.body[field]) || 30);
            break;
          case 'prefix':
            updates.push('prefix = ?');
            params.push(req.body[field]);
            break;
          case 'description':
            updates.push('description = ?');
            params.push(req.body[field] || null);
            break;
          case 'merchant_id':
            updates.push('merchant_id = ?');
            params.push(req.body[field] || null);
            break;
          case 'start_time':
            updates.push('start_time = ?');
            params.push(req.body[field] || null);
            break;
          case 'end_time':
            updates.push('end_time = ?');
            params.push(req.body[field] || null);
            break;
          case 'status':
            updates.push('status = ?');
            params.push(parseInt(req.body[field]));
            break;
        }
      }
    }

    if (updates.length === 0) {
      return res.status(422).json(ApiResponse.fail('没有需要更新的字段'));
    }

    params.push(templateId);
    await pool.query(
      `UPDATE coupon_templates SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params
    );

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'update_coupon_template', 'coupon_template', ?, ?, NOW())`,
      [userId, String(templateId), JSON.stringify({ updated_fields: updates.map(u => u.split(' ')[0]) })]
    );

    // Fetch updated template
    const [[updated]] = await pool.query(
      'SELECT * FROM coupon_templates WHERE id = ?',
      [templateId]
    );

    res.json(ApiResponse.success(updated, '优惠券模板已更新'));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMyCoupons,
  getAvailableCoupons,
  useCoupon,
  returnCoupon,
  issueCoupon,
  issueInviteCoupon,
  getTemplates,
  createTemplate,
  updateTemplate
};
