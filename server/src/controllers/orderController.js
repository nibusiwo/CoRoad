const pool = require('../config/db');
const config = require('../config');
const wxpay = require('../services/wxpay');
const websocket = require('../services/websocket');
const { ORDER_STATUS, ORDER_STATUS_NAMES } = require('../constants/statuses');
const {
  ApiResponse,
  generateOrderNo,
  generateVerifyCode
} = require('../utils/helpers');

async function isAdminUser(userId) {
  const adminUserIds = process.env.ADMIN_USER_IDS
    ? process.env.ADMIN_USER_IDS.split(',').map(id => parseInt(id)).filter(Boolean)
    : [1];
  if (adminUserIds.includes(Number(userId))) return true;

  const [[user]] = await pool.query(
    'SELECT is_admin FROM users WHERE id = ? AND status = 1',
    [userId]
  );
  return user?.is_admin === 1;
}

async function resolveMerchantIdForRequest(userId, requestedMerchantId) {
  if (requestedMerchantId !== undefined && requestedMerchantId !== '') {
    const merchantId = parseInt(requestedMerchantId);
    if (!merchantId || isNaN(merchantId)) {
      return { status: 422, message: '无效的商家ID' };
    }

    const [[merchant]] = await pool.query(
      'SELECT id, owner_id FROM merchants WHERE id = ?',
      [merchantId]
    );
    if (!merchant) {
      return { status: 404, message: '商家不存在' };
    }

    const isAdmin = await isAdminUser(userId);
    if (Number(merchant.owner_id) !== Number(userId) && !isAdmin) {
      return { status: 403, message: '无权查看该商家数据' };
    }

    return { merchantId };
  }

  const [[merchant]] = await pool.query(
    'SELECT id FROM merchants WHERE owner_id = ? AND status = 1 ORDER BY id DESC LIMIT 1',
    [userId]
  );
  if (!merchant) {
    return { status: 403, message: '当前账号不是已审核商家' };
  }

  return { merchantId: merchant.id };
}

/**
 * 支付完成统一处理:标记订单已支付、核销优惠券、递增成团人数、
 * 成团成功通知、商家新订单通知、成长值与操作日志。
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 */
async function finalizePaidOrder(db, order, transactionId) {
  await db.query(
    `UPDATE orders SET status = ?, paid_at = NOW(), pay_at = NOW(),
     wx_transaction_id = ?, transaction_id = ?, updated_at = NOW()
     WHERE id = ? AND status = ?`,
    [ORDER_STATUS.PAID, transactionId, transactionId, order.id, ORDER_STATUS.PENDING_PAYMENT]
  );

  // 核销优惠券
  if (order.coupon_id) {
    await db.query(
      `UPDATE user_coupons SET status = 2, used_at = NOW(), used_order_id = ?
       WHERE id = ? AND status = 1`,
      [order.id, order.coupon_id]
    );
  }

  let activityCompleted = false;
  if (order.activity_id) {
    await db.query(
      `UPDATE group_buy_participants
       SET status = 1, paid_at = NOW(), order_id = COALESCE(order_id, ?)
       WHERE activity_id = ? AND user_id = ? AND status = 0`,
      [order.id, order.activity_id, order.user_id]
    );

    const [activityUpdate] = await db.query(
      `UPDATE group_buy_activities
       SET current_count = current_count + ?, updated_at = NOW()
       WHERE id = ? AND status = 1`,
      [order.quantity || 1, order.activity_id]
    );

    if (activityUpdate.affectedRows > 0) {
      const [[activity]] = await db.query(
        'SELECT current_count, target_count FROM group_buy_activities WHERE id = ?',
        [order.activity_id]
      );
      if (activity && activity.current_count >= activity.target_count) {
        await db.query(
          'UPDATE group_buy_activities SET status = 2, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW() WHERE id = ? AND status = 1',
          [order.activity_id]
        );
        activityCompleted = true;
      }
    }
  }

  // 成长值
  const growthAward = config.growth?.factors?.group_buy_count || 50;
  await db.query(
    'UPDATE users SET growth_value = growth_value + ?, updated_at = NOW() WHERE id = ?',
    [growthAward, order.user_id]
  );

  // 操作日志
  await db.query(
    `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
     VALUES (?, 'pay_order', 'order', ?, ?, NOW())`,
    [order.user_id, String(order.id),
     JSON.stringify({ order_no: order.order_no, amount: order.pay_amount, coupon_amount: order.coupon_amount || 0 })]
  );

  // 商家新订单通知(待核销)
  try {
    const [[merchant]] = await db.query(
      'SELECT owner_id, name FROM merchants WHERE id = ?',
      [order.merchant_id]
    );
    if (merchant && merchant.owner_id !== order.user_id) {
      const productName = order.product_name || '拼团商品';
      const title = '💰 新订单待核销';
      const content = `「${productName}」已支付 ¥${order.pay_amount}，请及时核销。`;
      await db.query(
        `INSERT INTO notifications (user_id, type, title, content, payload, read_at, created_at)
         VALUES (?, 'merchant_new_order', ?, ?, ?, NULL, NOW())`,
        [merchant.owner_id, title, content,
          JSON.stringify({ order_id: order.id, order_no: order.order_no, activity_id: order.activity_id })]
      );
      websocket.sendSystemNotification(
        [merchant.owner_id],
        { title, content, type: 'merchant_new_order', priority: 'normal', data: { order_id: order.id } },
        global.wsServer
      );
    }
  } catch (notifyErr) {
    console.warn('[Order] merchant notify failed:', notifyErr.message);
  }

  // 成团成功通知(所有参与者)
  if (activityCompleted) {
    try {
      const [[activityInfo]] = await db.query(
        'SELECT product_id FROM group_buy_activities WHERE id = ?',
        [order.activity_id]
      );
      let productName = '拼团商品';
      if (activityInfo && activityInfo.product_id) {
        const [[prod]] = await db.query(
          'SELECT name FROM group_buy_products WHERE id = ?',
          [activityInfo.product_id]
        );
        productName = prod?.name || productName;
      }
      const [participants] = await db.query(
        'SELECT user_id FROM group_buy_participants WHERE activity_id = ?',
        [order.activity_id]
      );
      for (const p of participants) {
        await db.query(
          `INSERT INTO notifications (user_id, type, title, content, payload, read_at, created_at)
           VALUES (?, 'group_buy_success', '🎉 拼团成功', ?, ?, NULL, NOW())`,
          [p.user_id, `你参与的「${productName}」已成团！凭订单核销码到店核销即可。`,
            JSON.stringify({ activity_id: order.activity_id, product_name: productName })]
        );
      }
      const participantIds = participants.map((p) => p.user_id);
      websocket.sendSystemNotification(
        participantIds,
        {
          title: '🎉 拼团成功',
          content: `你参与的「${productName}」已成团！`,
          type: 'group_buy_success',
          priority: 'high',
          data: { activity_id: order.activity_id, product_name: productName }
        },
        global.wsServer
      );
    } catch (notifyErr) {
      console.warn('[Order] group buy success notify failed:', notifyErr.message);
    }
  }

  return { activityCompleted };
}

// =============================================================================
// 1. createOrder — 创建订单（拼团支付）
// POST /api/orders
// =============================================================================
const createOrder = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { product_id, activity_id, coupon_id } = req.body;

    if (!product_id) {
      return res.status(422).json(ApiResponse.fail('缺少商品信息'));
    }
    if (!activity_id) {
      return res.status(422).json(ApiResponse.fail('缺少活动信息'));
    }

    // Fetch product info
    const [[product]] = await pool.query(
      `SELECT p.*, m.name AS merchant_name
       FROM group_buy_products p
       JOIN merchants m ON m.id = p.merchant_id
       WHERE p.id = ?`,
      [parseInt(product_id)]
    );
    if (!product) {
      return res.status(404).json(ApiResponse.fail('商品不存在'));
    }

    // Fetch activity info
    const [[activity]] = await pool.query(
      'SELECT * FROM group_buy_activities WHERE id = ?',
      [parseInt(activity_id)]
    );
    if (!activity) {
      return res.status(404).json(ApiResponse.fail('拼团活动不存在'));
    }

    // Get current tier price for the activity
    const [tiers] = await pool.query(
      `SELECT id, target_count, price
       FROM group_buy_price_tiers
       WHERE product_id = ?
       ORDER BY target_count ASC`,
      [parseInt(product_id)]
    );

    let currentPrice = product.original_price;
    for (const tier of tiers) {
      if (tier.target_count <= activity.current_count) {
        currentPrice = tier.price;
      }
    }

    // Calculate pay_amount: current tier price minus coupon value if valid
    let payAmount = currentPrice;
    let couponAmount = 0;
    let usedCouponId = null;

    if (coupon_id) {
      const [[coupon]] = await pool.query(
        `SELECT uc.*, ct.name AS template_name, ct.face_value, ct.min_amount, ct.type, ct.merchant_id AS template_merchant_id
         FROM user_coupons uc
         JOIN coupon_templates ct ON ct.id = uc.template_id
         WHERE uc.id = ? AND uc.user_id = ? AND uc.status = 1 AND uc.expire_at > NOW()`,
        [parseInt(coupon_id), userId]
      );

      if (!coupon) {
        return res.status(400).json(ApiResponse.fail('优惠券不存在、已过期或不可用'));
      }

      // Check if coupon can be used for this merchant (platform coupon or matching merchant)
      if (coupon.template_merchant_id && coupon.template_merchant_id !== product.merchant_id) {
        return res.status(400).json(ApiResponse.fail('该优惠券不适用于此商家'));
      }

      // Check minimum order amount
      if (coupon.min_amount && currentPrice < coupon.min_amount) {
        return res.status(400).json(ApiResponse.fail(`该优惠券需满${coupon.min_amount}元可用`));
      }

      couponAmount = coupon.face_value;
      payAmount = Math.max(0, currentPrice - couponAmount);
      usedCouponId = coupon.id;
    }

    // Generate order_no and verification_code
    const orderNo = generateOrderNo();
    const verifyCode = generateVerifyCode();

    // Insert order
    const [result] = await pool.query(
      `INSERT INTO orders
        (order_no, user_id, product_id, activity_id, merchant_id,
         original_amount, pay_amount, coupon_id, coupon_amount,
         status, verification_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW())`,
      [orderNo, userId, parseInt(product_id), parseInt(activity_id), product.merchant_id,
       product.original_price, payAmount, usedCouponId, couponAmount,
       verifyCode]
    );

    // Fetch the created order
    const [[order]] = await pool.query(
      `SELECT o.*, p.name AS product_name, p.image AS product_image,
              m.name AS merchant_name
       FROM orders o
       JOIN group_buy_products p ON p.id = o.product_id
       JOIN merchants m ON m.id = o.merchant_id
       WHERE o.order_no = ?`,
      [orderNo]
    );

    res.json(ApiResponse.success({
      id: order.id,
      order_no: order.order_no,
      product_name: order.product_name,
      product_image: order.product_image,
      merchant_name: order.merchant_name,
      original_amount: order.original_amount,
      pay_amount: order.pay_amount,
      coupon_amount: order.coupon_amount,
      coupon_id: order.coupon_id,
      status: order.status,
      verification_code: verifyCode,
      created_at: order.created_at
    }));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 2. getOrders — 获取用户订单列表
// GET /api/orders
// =============================================================================
const getOrders = async (req, res, next) => {
  try {
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const { status } = req.query;

    const conditions = ['o.user_id = ?'];
    const params = [userId];

    const STATUS_ALIAS = {
      pending: 0,
      unpaid: 0,
      cancelled: 1,
      paid: 2,
      unverified: 2,
      verified: 3,
      used: 3,
      refunding: 4,
      refunded: 5,
      refund_failed: 6
    };
    if (status !== undefined && status !== '') {
      const statusValue = STATUS_ALIAS[String(status).toLowerCase()] !== undefined
        ? STATUS_ALIAS[String(status).toLowerCase()]
        : parseInt(status, 10);
      if (statusValue === undefined || isNaN(statusValue)) {
        return res.status(422).json(ApiResponse.fail('无效的订单状态'));
      }
      conditions.push('o.status = ?');
      params.push(statusValue);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count total
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o ${whereClause}`,
      params
    );

    // Fetch list with product and merchant names
    const [rows] = await pool.query(
      `SELECT o.id, o.order_no, o.product_id, o.activity_id, o.merchant_id,
              o.original_amount, o.pay_amount, o.coupon_amount,
              o.status, o.paid_at, o.verified_at, o.refunded_at,
              o.created_at,
              p.name AS product_name, p.image AS product_image,
              m.name AS merchant_name, m.logo AS merchant_logo
       FROM orders o
       JOIN group_buy_products p ON p.id = o.product_id
       JOIN merchants m ON m.id = o.merchant_id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const list = rows.map(row => ({
      id: row.id,
      order_no: row.order_no,
      product: {
        id: row.product_id,
        name: row.product_name,
        image: row.product_image
      },
      merchant: {
        id: row.merchant_id,
        name: row.merchant_name,
        logo: row.merchant_logo
      },
      activity_id: row.activity_id,
      original_amount: row.original_amount,
      pay_amount: row.pay_amount,
      coupon_amount: row.coupon_amount,
      status: row.status,
      status_text: ['待支付', '已取消', '已支付', '已核销', '已退款'][row.status] || '未知',
      paid_at: row.paid_at,
      verified_at: row.verified_at,
      refunded_at: row.refunded_at,
      created_at: row.created_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 3. getOrderDetail — 获取订单详情
// GET /api/orders/:id
// =============================================================================
const getOrderDetail = async (req, res, next) => {
  try {
    const userId = req.userId;
    const orderId = parseInt(req.params.id);
    if (!orderId || isNaN(orderId)) {
      return res.status(422).json(ApiResponse.fail('无效的订单ID'));
    }

    // Fetch order with all related info
    const [[order]] = await pool.query(
      `SELECT o.*,
              p.name AS product_name, p.image AS product_image,
              p.description AS product_description, p.original_price AS product_original_price,
              p.expiry_hours AS product_expiry_hours,
              m.name AS merchant_name, m.logo AS merchant_logo,
              m.phone AS merchant_phone, m.address AS merchant_address,
              m.location AS merchant_location, m.rating AS merchant_rating,
              a.target_count AS activity_target_count,
              a.current_count AS activity_current_count,
              a.status AS activity_status,
              a.expire_at AS activity_expire_at,
              a.initiator_id AS activity_initiator_id
       FROM orders o
       JOIN group_buy_products p ON p.id = o.product_id
       JOIN merchants m ON m.id = o.merchant_id
       LEFT JOIN group_buy_activities a ON a.id = o.activity_id
       WHERE o.id = ? AND o.user_id = ?`,
      [orderId, userId]
    );

    if (!order) {
      return res.status(404).json(ApiResponse.fail('订单不存在'));
    }

    // Fetch coupon info if used
    let couponInfo = null;
    if (order.coupon_id) {
      const [[coupon]] = await pool.query(
        `SELECT uc.*, ct.name AS template_name, ct.face_value, ct.type
         FROM user_coupons uc
         JOIN coupon_templates ct ON ct.id = uc.template_id
         WHERE uc.id = ?`,
        [order.coupon_id]
      );
      if (coupon) {
        couponInfo = {
          id: coupon.id,
          name: coupon.template_name,
          face_value: coupon.face_value,
          type: coupon.type
        };
      }
    }

    // Get commission split info
    let splitInfo = null;
    if (order.commission_amount !== null && order.commission_amount !== undefined) {
      splitInfo = {
        commission_amount: order.commission_amount,
        commission_rate: order.commission_rate,
        merchant_amount: order.pay_amount - (order.commission_amount || 0),
        split_status: order.split_status || 0
      };
    }

    const detail = {
      id: order.id,
      order_no: order.order_no,
      product: {
        id: order.product_id,
        name: order.product_name,
        image: order.product_image,
        description: order.product_description,
        original_price: order.product_original_price,
        expiry_hours: order.product_expiry_hours
      },
      merchant: {
        id: order.merchant_id,
        name: order.merchant_name,
        logo: order.merchant_logo,
        phone: order.merchant_phone,
        address: order.merchant_address,
        location: typeof order.merchant_location === 'string'
          ? JSON.parse(order.merchant_location)
          : order.merchant_location,
        rating: order.merchant_rating
      },
      activity: order.activity_id ? {
        id: order.activity_id,
        target_count: order.activity_target_count,
        current_count: order.activity_current_count,
        status: order.activity_status,
        expire_at: order.activity_expire_at,
        initiator_id: order.activity_initiator_id
      } : null,
      original_amount: order.original_amount,
      pay_amount: order.pay_amount,
      coupon_amount: order.coupon_amount || 0,
      coupon: couponInfo,
      verification_code: order.status === 2 ? order.verification_code : null,
      commission_split: splitInfo,
      status: order.status,
      status_text: ['待支付', '已取消', '已支付', '已核销', '已退款'][order.status] || '未知',
      paid_at: order.paid_at,
      verified_at: order.verified_at,
      refunded_at: order.refunded_at,
      created_at: order.created_at,
      updated_at: order.updated_at
    };

    res.json(ApiResponse.success(detail));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 4. payOrder — 处理支付（模拟微信支付）
// POST /api/orders/:id/pay
// =============================================================================
const payOrder = async (req, res, next) => {
  try {
    const userId = req.userId;
    const orderId = parseInt(req.params.id);
    if (!orderId || isNaN(orderId)) {
      return res.status(422).json(ApiResponse.fail('无效的订单ID'));
    }

    // Fetch order
    const [[order]] = await pool.query(
      `SELECT o.*, p.name AS product_name, p.merchant_id AS m_id,
              a.target_count, a.current_count
       FROM orders o
       JOIN group_buy_products p ON p.id = o.product_id
       LEFT JOIN group_buy_activities a ON a.id = o.activity_id
       WHERE o.id = ? AND o.user_id = ?`,
      [orderId, userId]
    );

    if (!order) {
      return res.status(404).json(ApiResponse.fail('订单不存在'));
    }

    if (order.status !== 0) {
      const statusTexts = ['待支付', '已取消', '已支付', '已核销', '已退款'];
      return res.status(400).json(ApiResponse.fail(`订单状态为${statusTexts[order.status] || '未知'}，无法支付`));
    }

    const [[user]] = await pool.query('SELECT wx_openid FROM users WHERE id = ?', [userId]);
    if (!user?.wx_openid && process.env.INTEGRATION_MODE !== 'sandbox') {
      return res.status(422).json(ApiResponse.fail('当前账号未绑定微信支付身份'));
    }

    const payment = await wxpay.unifiedOrder(
      order.order_no,
      Math.round(Number(order.pay_amount) * 100),
      user?.wx_openid || `sandbox-user-${userId}`,
      order.product_name || 'CoRoad 拼团订单'
    );

    await pool.query(
      `INSERT INTO integration_events (provider, event_id, event_type, payload, result)
       VALUES ('wechat_pay', ?, 'payment_created', ?, ?)
       ON DUPLICATE KEY UPDATE event_id = event_id`,
      [order.order_no, JSON.stringify({ order_id: orderId, amount: order.pay_amount }), payment.sandbox ? 'sandbox' : 'pending']
    );

    // 沙箱模式:无真实微信回调,直接完成支付(券核销/成团计数/通知一并处理)
    if (payment.sandbox) {
      await finalizePaidOrder(pool, order, 'sandbox-' + order.order_no);
      res.json(ApiResponse.success({
        order_id: orderId,
        order_no: order.order_no,
        pay_amount: order.pay_amount,
        coupon_amount: order.coupon_amount || 0,
        status: ORDER_STATUS_NAMES[ORDER_STATUS.PAID],
        status_code: ORDER_STATUS.PAID,
        paid_at: new Date().toISOString(),
        sandbox: true
      }, '沙箱支付成功'));
      return;
    }

    res.json(ApiResponse.success({
      order_id: orderId,
      order_no: order.order_no,
      pay_amount: order.pay_amount,
      status: ORDER_STATUS_NAMES[ORDER_STATUS.PENDING_PAYMENT],
      status_code: ORDER_STATUS.PENDING_PAYMENT,
      pay_params: payment.payParams,
      sandbox: false
    }, '支付参数已生成，请完成支付'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 5. refundOrder — 退款订单
// POST /api/orders/:id/refund
// =============================================================================
const refundOrder = async (req, res, next) => {
  try {
    const userId = req.userId;
    const orderId = parseInt(req.params.id);
    if (!orderId || isNaN(orderId)) {
      return res.status(422).json(ApiResponse.fail('无效的订单ID'));
    }

    // Fetch order with activity info
    const [[order]] = await pool.query(
      `SELECT o.*, a.status AS activity_status
       FROM orders o
       LEFT JOIN group_buy_activities a ON a.id = o.activity_id
       WHERE o.id = ? AND o.user_id = ?`,
      [orderId, userId]
    );

    if (!order) {
      return res.status(404).json(ApiResponse.fail('订单不存在'));
    }

    // Check: order status must be 2 (已支付) and not yet verified
    if (order.status !== 2) {
      const statusTexts = ['待支付', '已取消', '已支付', '已核销', '已退款'];
      return res.status(400).json(ApiResponse.fail(`订单状态为${statusTexts[order.status] || '未知'}，无法退款`));
    }

    if (order.verified_at) {
      return res.status(400).json(ApiResponse.fail('订单已核销，无法退款'));
    }

    // If part of group buy activity that succeeded (status=2), requires admin approval
    if (order.activity_id && order.activity_status === 2) {
      // Create refund request record for admin approval
      await pool.query(
        `INSERT INTO refund_requests
          (order_id, user_id, amount, reason, activity_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, NOW(), NOW())`,
        [orderId, userId, order.pay_amount, req.body.reason || '用户申请退款', order.activity_id]
      );

      return res.json(ApiResponse.success({
        refund_request_id: null,
        need_approval: true,
        message: '该拼团已成功，退款需要管理员审核'
      }, '退款申请已提交，等待审核'));
    }

    // Auto-refund: set order status=4, refunded_at=now
    await pool.query(
      'UPDATE orders SET status = 4, refunded_at = NOW(), updated_at = NOW() WHERE id = ?',
      [orderId]
    );

    // Return coupon if used
    if (order.coupon_id) {
      await pool.query(
        `UPDATE user_coupons
         SET status = 1, used_at = NULL, used_order_id = NULL, expire_at = GREATEST(expire_at, DATE_ADD(NOW(), INTERVAL 7 DAY))
         WHERE id = ? AND status = 2 AND used_order_id = ?`,
        [order.coupon_id, orderId]
      );
    }

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'refund_order', 'order', ?, ?, NOW())`,
      [userId, String(orderId), JSON.stringify({ order_no: order.order_no, amount: order.pay_amount, auto_refund: true })]
    );

    res.json(ApiResponse.success({
      order_id: orderId,
      order_no: order.order_no,
      refund_amount: order.pay_amount,
      refunded_at: new Date().toISOString(),
      status: 4
    }, '退款成功'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 6. getVerificationCode — 获取订单核销码
// GET /api/orders/:id/verify-code
// =============================================================================
const getVerificationCode = async (req, res, next) => {
  try {
    const userId = req.userId;
    const orderId = parseInt(req.params.id);
    if (!orderId || isNaN(orderId)) {
      return res.status(422).json(ApiResponse.fail('无效的订单ID'));
    }

    // Fetch order
    const [[order]] = await pool.query(
      `SELECT o.*, p.name AS product_name, p.image AS product_image,
              m.name AS merchant_name, m.logo AS merchant_logo
       FROM orders o
       JOIN group_buy_products p ON p.id = o.product_id
       JOIN merchants m ON m.id = o.merchant_id
       WHERE o.id = ? AND o.user_id = ?`,
      [orderId, userId]
    );

    if (!order) {
      return res.status(404).json(ApiResponse.fail('订单不存在'));
    }

    // Only show verification code if status=2 (已支付)
    if (order.status !== 2) {
      return res.status(400).json(ApiResponse.fail('订单未支付，无法获取核销码'));
    }

    // Generate QR code data
    const qrData = JSON.stringify({
      type: 'order_verify',
      order_no: order.order_no,
      code: order.verification_code,
      timestamp: Date.now()
    });

    res.json(ApiResponse.success({
      order_id: order.id,
      order_no: order.order_no,
      verification_code: order.verification_code,
      qr_code_data: qrData,
      product_name: order.product_name,
      product_image: order.product_image,
      merchant_name: order.merchant_name,
      merchant_logo: order.merchant_logo,
      pay_amount: order.pay_amount,
      paid_at: order.paid_at
    }));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 7. verifyOrder — 商家/管理员核销订单
// POST /api/orders/verify
// =============================================================================
const verifyOrder = async (req, res, next) => {
  try {
    const userId = req.userId;
    const order_no = req.body.order_no || req.body.orderNo;
    let verification_code =
      req.body.verification_code ||
      req.body.verify_code ||
      req.body.verificationCode ||
      req.body.verifyCode ||
      req.body.code;

    if (!verification_code && typeof req.body.qr_code_data === 'string') {
      try {
        const qrData = JSON.parse(req.body.qr_code_data);
        verification_code = qrData.code || qrData.verification_code || qrData.verify_code;
      } catch (_) {
        verification_code = null;
      }
    }

    if (!order_no && !verification_code) {
      return res.status(422).json(ApiResponse.fail('请提供订单号或核销码'));
    }

    // Find order
    let orderQuery;
    let orderParams;

    if (order_no) {
      orderQuery = `SELECT o.*, p.name AS product_name, p.image AS product_image,
                    m.name AS merchant_name, m.level AS merchant_level
                    FROM orders o
                    JOIN group_buy_products p ON p.id = o.product_id
                    JOIN merchants m ON m.id = o.merchant_id
                    WHERE o.order_no = ?`;
      orderParams = [order_no];
    } else {
      orderQuery = `SELECT o.*, p.name AS product_name, p.image AS product_image,
                    m.name AS merchant_name, m.level AS merchant_level
                    FROM orders o
                    JOIN group_buy_products p ON p.id = o.product_id
                    JOIN merchants m ON m.id = o.merchant_id
                    WHERE o.verification_code = ?`;
      orderParams = [verification_code];
    }

    const [[order]] = await pool.query(orderQuery, orderParams);

    if (!order) {
      return res.status(404).json(ApiResponse.fail('未找到订单或核销码无效'));
    }

    // Check order status=2 (已支付)
    if (order.status !== 2) {
      const statusTexts = ['待支付', '已取消', '已支付', '已核销', '已退款'];
      return res.status(400).json(ApiResponse.fail(`订单状态为${statusTexts[order.status] || '未知'}，无法核销`));
    }

    // Set status=3 (已核销), verified_at=now
    await pool.query(
      'UPDATE orders SET status = 3, verified_at = NOW(), updated_at = NOW() WHERE id = ?',
      [order.id]
    );

    // 商家考核自动加分:每核销一单 +N 分,并按阈值自动升级等级
    try {
      const scorePerVerify = config.merchantScorePerVerify || 5;
      await pool.query(
        'UPDATE merchants SET score = score + ?, updated_at = NOW() WHERE id = ?',
        [scorePerVerify, order.merchant_id]
      );
      const [[merchant]] = await pool.query(
        'SELECT score FROM merchants WHERE id = ?',
        [order.merchant_id]
      );
      if (merchant) {
        // 等级阈值与 merchantController 保持一致
        const levelRules = [
          { level: 1, min: 0 }, { level: 2, min: 200 },
          { level: 3, min: 500 }, { level: 4, min: 1000 }, { level: 5, min: 2000 }
        ];
        let newLevel = 1;
        for (const rule of levelRules) {
          if (merchant.score >= rule.min) newLevel = rule.level;
        }
        await pool.query(
          'UPDATE merchants SET level = ? WHERE id = ? AND level < ?',
          [newLevel, order.merchant_id, newLevel]
        );
      }
    } catch (scoreErr) {
      console.warn('[Order] merchant score award failed:', scoreErr.message);
    }

    // Trigger profit split
    const splitResult = await splitProfitInternal(order);

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'verify_order', 'order', ?, ?, NOW())`,
      [userId, String(order.id), JSON.stringify({
        order_no: order.order_no,
        amount: order.pay_amount,
        merchant: order.merchant_name,
        split: splitResult
      })]
    );

    // 通知用户:核销成功
    try {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, content, payload, read_at, created_at)
         VALUES (?, 'order_verified', '✅ 核销成功', ?, ?, NULL, NOW())`,
        [order.user_id, `「${order.product_name}」已核销，感谢到店使用！`,
          JSON.stringify({ order_id: order.id, order_no: order.order_no, merchant_name: order.merchant_name })]
      );
    } catch (notifyErr) {
      console.warn('[Order] verify notify failed:', notifyErr.message);
    }

    res.json(ApiResponse.success({
      order_id: order.id,
      order_no: order.order_no,
      product_name: order.product_name,
      product_image: order.product_image,
      merchant_name: order.merchant_name,
      pay_amount: order.pay_amount,
      verified_at: new Date().toISOString(),
      status: 3,
      split_info: splitResult
    }, '核销成功'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 8. splitProfit — 内部分润处理
// =============================================================================
async function splitProfitInternal(order) {
  const merchantLevel = order.merchant_level || 1;
  const rate = config.commissionRates?.[merchantLevel] || 0.10;
  const commissionAmount = Math.round(order.pay_amount * rate * 100) / 100;
  const merchantAmount = Math.round((order.pay_amount - commissionAmount) * 100) / 100;

  // Record split info to order
  await pool.query(
    `UPDATE orders
     SET commission_amount = ?, commission_rate = ?, split_status = 1, updated_at = NOW()
     WHERE id = ?`,
    [commissionAmount, rate, order.id]
  );

  // Log split operation
  console.log(`[SplitProfit] Order ${order.order_no}: total=${order.pay_amount}, commission_rate=${(rate * 100).toFixed(0)}%, commission=${commissionAmount}, merchant=${merchantAmount}`);

  return {
    total_amount: order.pay_amount,
    commission_rate: rate,
    commission_amount: commissionAmount,
    merchant_amount: merchantAmount
  };
}

/**
 * splitProfit — 外部接口方法（可被子模块或admin调用）
 */
const splitProfit = async (req, res, next) => {
  try {
    const orderId = parseInt(req.params.id);
    if (!orderId || isNaN(orderId)) {
      return res.status(422).json(ApiResponse.fail('无效的订单ID'));
    }

    const [[order]] = await pool.query(
      `SELECT o.*, m.level AS merchant_level
       FROM orders o
       JOIN merchants m ON m.id = o.merchant_id
       WHERE o.id = ?`,
      [orderId]
    );

    if (!order) {
      return res.status(404).json(ApiResponse.fail('订单不存在'));
    }

    const result = await splitProfitInternal(order);
    res.json(ApiResponse.success(result, '分润完成'));
  } catch (err) {
    next(err);
  }
};

// WeChat Pay callback is the only path allowed to move an order to paid.
const paymentCallback = async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const isSandbox = process.env.INTEGRATION_MODE === 'sandbox';
    const sandboxRequested =
      req.body?.sandbox === true ||
      req.body?.sandbox === 'true' ||
      req.headers['x-coroad-sandbox'] === 'true';
    if (isSandbox && !sandboxRequested) {
      return res.status(400).json({ code: 400, message: 'sandbox payment callback must be explicit' });
    }
    const resource = req.body?.resource || req.body || {};
    const eventId =
      req.headers['wechatpay-nonce'] ||
      req.body?.id ||
      resource.transaction_id ||
      req.body?.transaction_id ||
      (isSandbox && sandboxRequested ? req.body?.order_no || req.body?.out_trade_no : null);
    if (!eventId) return res.status(400).json({ code: 400, message: '缺少支付回调事件标识' });

    const payload = req.rawBody || JSON.stringify(req.body || {});
    if (!isSandbox && !(await wxpay.verifyNotify(req.headers, payload))) {
      return res.status(401).json({ code: 401, message: '支付回调验签失败' });
    }

    const outTradeNo = resource.out_trade_no || req.body?.out_trade_no || (isSandbox && sandboxRequested ? req.body?.order_no : null);
    const transactionId = resource.transaction_id || req.body?.transaction_id || `sandbox-${eventId}`;
    const tradeState = resource.trade_state || req.body?.trade_state || (isSandbox ? 'SUCCESS' : null);
    if (!outTradeNo || tradeState !== 'SUCCESS') {
      return res.json({ code: 0, message: '回调已接收' });
    }

    await connection.beginTransaction();
    const [[existing]] = await connection.query(
      'SELECT id, result FROM integration_events WHERE provider = ? AND event_id = ? FOR UPDATE',
      ['wechat_pay', eventId]
    );
    if (existing?.result === 'processed') {
      await connection.commit();
      return res.json({ code: 0, message: 'SUCCESS' });
    }

    const [[order]] = await connection.query(
      'SELECT * FROM orders WHERE order_no = ? FOR UPDATE',
      [outTradeNo]
    );
    if (!order) {
      await connection.rollback();
      return res.status(404).json({ code: 404, message: '订单不存在' });
    }

    if (order.status === ORDER_STATUS.PENDING_PAYMENT) {
      await finalizePaidOrder(connection, order, transactionId);
    }

    await connection.query(
      `INSERT INTO integration_events (provider, event_id, event_type, payload, processed_at, result)
       VALUES ('wechat_pay', ?, 'payment_callback', ?, NOW(), 'processed')
       ON DUPLICATE KEY UPDATE processed_at = NOW(), result = 'processed', payload = VALUES(payload)`,
      [eventId, payload]
    );
    await connection.commit();
    return res.json({ code: 0, message: 'SUCCESS' });
  } catch (err) {
    await connection.rollback();
    next(err);
  } finally {
    connection.release();
  }
};

// =============================================================================
// 9. getMerchantOrders — 获取商家订单列表（商家后台）
// GET /api/orders/merchant
// =============================================================================
const getMerchantOrders = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { merchant_id, status, start_date, end_date } = req.query;
    const resolved = await resolveMerchantIdForRequest(req.userId, merchant_id);

    if (!resolved.merchantId) {
      return res.status(422).json(ApiResponse.fail('请提供商家ID'));
    }

    const conditions = ['o.merchant_id = ?'];
    const params = [resolved.merchantId];

    if (status !== undefined && status !== '') {
      conditions.push('o.status = ?');
      params.push(parseInt(status));
    }

    if (start_date) {
      conditions.push('o.created_at >= ?');
      params.push(start_date);
    }

    if (end_date) {
      conditions.push('o.created_at <= ?');
      params.push(end_date + ' 23:59:59');
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Count total
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o ${whereClause}`,
      params
    );

    // Fetch list
    const [rows] = await pool.query(
      `SELECT o.id, o.order_no, o.product_id, o.activity_id, o.user_id,
              o.original_amount, o.pay_amount, o.coupon_amount,
              o.commission_amount, o.commission_rate, o.split_status,
              o.status, o.paid_at, o.verified_at, o.refunded_at,
              o.created_at,
              p.name AS product_name, p.image AS product_image,
              u.nickname AS user_nickname, u.avatar AS user_avatar
       FROM orders o
       JOIN group_buy_products p ON p.id = o.product_id
       JOIN users u ON u.id = o.user_id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const list = rows.map(row => ({
      id: row.id,
      order_no: row.order_no,
      product: {
        id: row.product_id,
        name: row.product_name,
        image: row.product_image
      },
      user: {
        id: row.user_id,
        nickname: row.user_nickname,
        avatar: row.user_avatar
      },
      activity_id: row.activity_id,
      original_amount: row.original_amount,
      pay_amount: row.pay_amount,
      coupon_amount: row.coupon_amount,
      commission_amount: row.commission_amount,
      commission_rate: row.commission_rate,
      split_status: row.split_status,
      status: row.status,
      status_text: ['待支付', '已取消', '已支付', '已核销', '已退款'][row.status] || '未知',
      paid_at: row.paid_at,
      verified_at: row.verified_at,
      refunded_at: row.refunded_at,
      created_at: row.created_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 10. getVerificationStats — 获取商家核销统计数据
// GET /api/orders/verification-stats
// =============================================================================
const getVerificationStats = async (req, res, next) => {
  try {
    const { merchant_id } = req.query;
    const resolved = await resolveMerchantIdForRequest(req.userId, merchant_id);

    if (!resolved.merchantId) {
      return res.status(422).json(ApiResponse.fail('请提供商家ID'));
    }

    const merchantId = resolved.merchantId;

    // Total stats
    const [[totalStats]] = await pool.query(
      `SELECT COUNT(*) AS total_orders,
              COALESCE(SUM(pay_amount), 0) AS total_amount,
              COALESCE(SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END), 0) AS verified_count,
              COALESCE(SUM(CASE WHEN status = 3 THEN pay_amount ELSE 0 END), 0) AS verified_amount
       FROM orders
       WHERE merchant_id = ? AND status >= 2`,
      [merchantId]
    );

    // Today's verification stats
    const today = new Date().toISOString().slice(0, 10);
    const [[todayStats]] = await pool.query(
      `SELECT COUNT(*) AS today_verified,
              COALESCE(SUM(pay_amount), 0) AS today_verified_amount
       FROM orders
       WHERE merchant_id = ? AND status = 3 AND DATE(verified_at) = ?`,
      [merchantId, today]
    );

    // This month's stats
    const monthStart = today.slice(0, 7) + '-01';
    const [[monthStats]] = await pool.query(
      `SELECT COUNT(*) AS month_verified,
              COALESCE(SUM(pay_amount), 0) AS month_verified_amount
       FROM orders
       WHERE merchant_id = ? AND status = 3 AND verified_at >= ?`,
      [merchantId, monthStart]
    );

    // Unsettled commission
    const [[unsettledStats]] = await pool.query(
      `SELECT COALESCE(SUM(commission_amount), 0) AS unsettled_commission,
              COUNT(*) AS unsettled_count
       FROM orders
       WHERE merchant_id = ? AND status = 3 AND split_status = 1`,
      [merchantId]
    );

    res.json(ApiResponse.success({
      total_orders: totalStats.total_orders,
      total_amount: totalStats.total_amount,
      verified_count: totalStats.verified_count,
      verified_amount: totalStats.verified_amount,
      today_verified: todayStats.today_verified,
      today_verified_amount: todayStats.today_verified_amount,
      month_verified: monthStats.month_verified,
      month_verified_amount: monthStats.month_verified_amount,
      unsettled_commission: unsettledStats.unsettled_commission,
      unsettled_count: unsettledStats.unsettled_count
    }));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrderDetail,
  payOrder,
  refundOrder,
  getVerificationCode,
  verifyOrder,
  splitProfit,
  getMerchantOrders,
  getVerificationStats
  ,paymentCallback
};
