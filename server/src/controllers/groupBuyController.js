const pool = require('../config/db');
const config = require('../config');
const {
  ApiResponse,
  generateOrderNo,
  generateVerifyCode,
  calcDistance
} = require('../utils/helpers');
const websocket = require('../services/websocket');

/**
 * 写入站内通知并尝试 WebSocket 推送。
 */
async function notifyUser(userId, type, title, content, payload) {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, content, payload, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, NOW())`,
      [userId, type, title, content, payload ? JSON.stringify(payload) : null]
    );
    websocket.sendSystemNotification([userId], { title, content, type, priority: 'normal', data: payload || {} }, global.wsServer);
  } catch (err) {
    console.warn('[GroupBuy] notify failed:', err.message);
  }
}

// =============================================================================
// 1. getProducts — 获取拼团商品列表
// GET /api/group-buy/products
// =============================================================================
const getProducts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const { merchant_id, keyword, lng, lat, sort } = req.query;
    // E2: sort 参数 - 'distance'(默认,前端内存排序) | 'hot'(参团人数 DESC) | 'price'(最低价 ASC)
    const sortMode = ['distance', 'hot', 'price'].includes(sort) ? sort : 'distance';

    const conditions = ['p.status = 1'];
    const params = [];

    if (merchant_id) {
      conditions.push('p.merchant_id = ?');
      params.push(parseInt(merchant_id));
    }

    if (keyword && keyword.trim()) {
      conditions.push('p.name LIKE ?');
      params.push(`%${keyword.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // E2: 根据 sortMode 选择 SQL ORDER BY
    // - hot: 按 current_count(当前参团人数) DESC
    // - price: 按 price_tiers[0].price ASC(约定 price_tiers 按 price ASC 存储)
    // - distance: 保持默认 SQL,前端内存排序
    let orderClause = 'ORDER BY p.sort_order ASC, p.created_at DESC';
    if (sortMode === 'hot') {
      orderClause = 'ORDER BY p.current_count DESC, p.sold_count DESC, p.created_at DESC';
    } else if (sortMode === 'price') {
      orderClause = "ORDER BY CAST(JSON_EXTRACT(p.price_tiers, '$[0].price') AS DECIMAL(10,2)) ASC";
    }

    // Count total
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM group_buy_products p ${whereClause}`,
      params
    );

    // Fetch list with merchant info
    const [rows] = await pool.query(
      `SELECT p.*,
              m.name AS merchant_name,
              m.rating AS merchant_rating,
              m.logo AS merchant_logo,
              m.location AS merchant_location
       FROM group_buy_products p
       JOIN merchants m ON m.id = p.merchant_id
       ${whereClause}
       ${orderClause}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    // Process rows
    let list = rows.map(row => {
      const item = {
        id: row.id,
        merchant_id: row.merchant_id,
        merchant_name: row.merchant_name,
        merchant_rating: row.merchant_rating,
        merchant_logo: row.merchant_logo,
        name: row.name,
        image: row.image,
        description: row.description,
        original_price: row.original_price,
        expiry_hours: row.expiry_hours,
        sold_count: row.sold_count || 0,
        current_count: row.current_count || 0,
        sort_order: row.sort_order,
        status: row.status,
        created_at: row.created_at
      };

      // Parse price_tiers (用于前端展示阶梯价)
      if (row.price_tiers) {
        try {
          item.price_tiers = typeof row.price_tiers === 'string'
            ? JSON.parse(row.price_tiers)
            : row.price_tiers;
        } catch {
          item.price_tiers = [];
        }
      }

      // Parse merchant location
      if (row.merchant_location) {
        item.merchant_location = typeof row.merchant_location === 'string'
          ? JSON.parse(row.merchant_location)
          : row.merchant_location;
      }

      // Calculate distance if lng/lat provided
      if (lng != null && lat != null && item.merchant_location) {
        const dist = calcDistance(
          parseFloat(lng), parseFloat(lat),
          item.merchant_location.lng, item.merchant_location.lat
        );
        item.distance_km = Math.round(dist * 10) / 10;
      }

      return item;
    });

    // E2: sort='distance' 时在前端内存排序(SQL 保持默认排序)
    if (sortMode === 'distance' && lng != null && lat != null) {
      list.sort((a, b) => (a.distance_km || 9999) - (b.distance_km || 9999));
    }

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 2. getProductDetail — 获取商品详情
// GET /api/group-buy/products/:id
// =============================================================================
const getProductDetail = async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id);
    if (!productId || isNaN(productId)) {
      return res.status(422).json(ApiResponse.fail('无效的商品ID'));
    }

    // Fetch product with merchant info
    const [[product]] = await pool.query(
      `SELECT p.*,
              m.name AS merchant_name,
              m.rating AS merchant_rating,
              m.logo AS merchant_logo,
              m.phone AS merchant_phone,
              m.address AS merchant_address,
              m.location AS merchant_location,
              m.description AS merchant_description,
              m.level AS merchant_level
       FROM group_buy_products p
       JOIN merchants m ON m.id = p.merchant_id
       WHERE p.id = ? AND p.status = 1`,
      [productId]
    );

    if (!product) {
      return res.status(404).json(ApiResponse.fail('商品不存在或已下架'));
    }

    // Fetch price tiers
    const [tiers] = await pool.query(
      `SELECT id, product_id, target_count, price, created_at
       FROM group_buy_price_tiers
       WHERE product_id = ?
       ORDER BY target_count ASC`,
      [productId]
    );

    // Count current active activities for this product
    const [[{ active_count }]] = await pool.query(
      `SELECT COUNT(*) AS active_count
       FROM group_buy_activities
       WHERE product_id = ? AND status = 1 AND expire_at > NOW()`,
      [productId]
    );

    // Build response
    const detail = {
      id: product.id,
      merchant_id: product.merchant_id,
      merchant_name: product.merchant_name,
      merchant_rating: product.merchant_rating,
      merchant_logo: product.merchant_logo,
      merchant_phone: product.merchant_phone,
      merchant_address: product.merchant_address,
      merchant_location: typeof product.merchant_location === 'string'
        ? JSON.parse(product.merchant_location)
        : product.merchant_location,
      merchant_description: product.merchant_description,
      merchant_level: product.merchant_level,
      name: product.name,
      image: product.image,
      images: product.images
        ? (typeof product.images === 'string' ? JSON.parse(product.images) : product.images)
        : [],
      description: product.description,
      original_price: product.original_price,
      expiry_hours: product.expiry_hours,
      sold_count: product.sold_count || 0,
      sort_order: product.sort_order,
      price_tiers: tiers.map(t => ({
        id: t.id,
        target_count: t.target_count,
        price: t.price,
        savings: product.original_price - t.price
      })),
      active_activities_count: active_count,
      created_at: product.created_at
    };

    res.json(ApiResponse.success(detail));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 3. createActivity — 发起拼团活动
// POST /api/group-buy/activities
// =============================================================================
const createActivity = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { product_id, trip_id, target_count } = req.body;

    if (!product_id) {
      return res.status(422).json(ApiResponse.fail('请选择拼团商品'));
    }
    if (!target_count) {
      return res.status(422).json(ApiResponse.fail('请选择拼团目标人数'));
    }

    // Validate product exists and is active
    const [[product]] = await pool.query(
      `SELECT p.*, m.name AS merchant_name, m.id AS merchant_id
       FROM group_buy_products p
       JOIN merchants m ON m.id = p.merchant_id
       WHERE p.id = ? AND p.status = 1`,
      [parseInt(product_id)]
    );

    if (!product) {
      return res.status(404).json(ApiResponse.fail('商品不存在或已下架'));
    }

    // Validate target_count matches one of the product's price_tiers
    const [tiers] = await pool.query(
      `SELECT id, product_id, target_count, price
       FROM group_buy_price_tiers
       WHERE product_id = ?
       ORDER BY target_count ASC`,
      [product.id]
    );

    if (tiers.length === 0) {
      return res.status(400).json(ApiResponse.fail('该商品暂未配置拼团阶梯'));
    }

    const matchedTier = tiers.find(t => t.target_count === parseInt(target_count));
    if (!matchedTier) {
      return res.status(400).json(ApiResponse.fail('拼团目标人数不匹配，可选：' + tiers.map(t => t.target_count + '人').join('、')));
    }

    // Calculate expire_at
    const expiryHours = product.expiry_hours || config.groupBuyExpiry || 24;
    const expireAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    // Insert activity
    const [result] = await pool.query(
      `INSERT INTO group_buy_activities
        (product_id, initiator_id, trip_id, target_count, current_count, status, expire_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 1, ?, NOW(), NOW())`,
      [product.id, userId, trip_id || null, parseInt(target_count), expireAt]
    );

    const activityId = result.insertId;

    // Auto-join initiator as participant
    await pool.query(
      `INSERT INTO group_buy_participants
        (activity_id, user_id, product_id, join_price, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [activityId, userId, product.id, matchedTier.price]
    );

    // Get user info for share
    const [[userRow]] = await pool.query(
      'SELECT nickname, avatar FROM users WHERE id = ?',
      [userId]
    );

    res.json(ApiResponse.success({
      activity_id: activityId,
      product_id: product.id,
      product_name: product.name,
      merchant_name: product.merchant_name,
      target_count: parseInt(target_count),
      current_count: 1,
      current_price: matchedTier.price,
      original_price: product.original_price,
      savings: product.original_price - matchedTier.price,
      expire_at: expireAt.toISOString(),
      status: 1,
      share_info: {
        title: `${userRow?.nickname || '车友'}发起了一个拼团！${product.merchant_name}的${product.name}，${matchedTier.price}元起`,
        image: product.image,
        link: `/pages/group-buy/activity?id=${activityId}`
      }
    }, '拼团已发起'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 4. getActivityDetail — 获取活动详情
// GET /api/group-buy/activities/:id
// =============================================================================
const getActivityDetail = async (req, res, next) => {
  try {
    const userId = req.userId || null;
    const activityId = parseInt(req.params.id);
    if (!activityId || isNaN(activityId)) {
      return res.status(422).json(ApiResponse.fail('无效的活动ID'));
    }

    // Fetch activity with product and merchant info
    const [[activity]] = await pool.query(
      `SELECT a.*,
              p.name AS product_name,
              p.image AS product_image,
              p.description AS product_description,
              p.original_price AS product_original_price,
              p.expiry_hours AS product_expiry_hours,
              p.merchant_id,
              m.name AS merchant_name,
              m.rating AS merchant_rating,
              m.logo AS merchant_logo,
              m.phone AS merchant_phone,
              m.address AS merchant_address,
              m.location AS merchant_location
       FROM group_buy_activities a
       JOIN group_buy_products p ON p.id = a.product_id
       JOIN merchants m ON m.id = p.merchant_id
       WHERE a.id = ?`,
      [activityId]
    );

    if (!activity) {
      return res.status(404).json(ApiResponse.fail('活动不存在'));
    }

    // Fetch price tiers for the product
    const [tiers] = await pool.query(
      `SELECT id, target_count, price
       FROM group_buy_price_tiers
       WHERE product_id = ?
       ORDER BY target_count ASC`,
      [activity.product_id]
    );

    // Determine current price tier based on current_count
    let currentTier = null;
    for (const tier of tiers) {
      if (tier.target_count <= activity.current_count) {
        currentTier = tier;
      }
    }
    if (!currentTier && tiers.length > 0) {
      currentTier = tiers[0];
    }

    // Determine next tier
    const nextTier = tiers.find(t => t.target_count > activity.current_count) || null;

    // Fetch participants with avatars
    const [participants] = await pool.query(
      `SELECT gp.id AS participant_id, gp.user_id, gp.join_price, gp.created_at AS joined_at,
              u.nickname, u.avatar
       FROM group_buy_participants gp
       JOIN users u ON u.id = gp.user_id
       WHERE gp.activity_id = ?
       ORDER BY gp.created_at ASC`,
      [activityId]
    );

    // Check if current user is a participant
    let isParticipant = false;
    if (userId) {
      const [[myRow]] = await pool.query(
        'SELECT id FROM group_buy_participants WHERE activity_id = ? AND user_id = ?',
        [activityId, userId]
      );
      isParticipant = !!myRow;
    }

    // Build response
    const detail = {
      id: activity.id,
      product: {
        id: activity.product_id,
        name: activity.product_name,
        image: activity.product_image,
        description: activity.product_description,
        original_price: activity.product_original_price,
        expiry_hours: activity.product_expiry_hours
      },
      merchant: {
        id: activity.merchant_id,
        name: activity.merchant_name,
        rating: activity.merchant_rating,
        logo: activity.merchant_logo,
        phone: activity.merchant_phone,
        address: activity.merchant_address,
        location: typeof activity.merchant_location === 'string'
          ? JSON.parse(activity.merchant_location)
          : activity.merchant_location
      },
      initiator_id: activity.initiator_id,
      trip_id: activity.trip_id,
      target_count: activity.target_count,
      current_count: activity.current_count,
      progress: Math.min(100, Math.round((activity.current_count / activity.target_count) * 100)),
      status: activity.status,
      expire_at: activity.expire_at,
      current_price_tier: currentTier ? {
        target_count: currentTier.target_count,
        price: currentTier.price,
        savings: activity.product_original_price - currentTier.price
      } : null,
      next_price_tier: nextTier ? {
        target_count: nextTier.target_count,
        price: nextTier.price,
        need_more: nextTier.target_count - activity.current_count
      } : null,
      all_price_tiers: tiers.map(t => ({
        target_count: t.target_count,
        price: t.price,
        savings: activity.product_original_price - t.price,
        reached: t.target_count <= activity.current_count
      })),
      participants: participants.map(p => ({
        participant_id: p.participant_id,
        user_id: p.user_id,
        nickname: p.nickname,
        avatar: p.avatar,
        join_price: p.join_price,
        joined_at: p.joined_at
      })),
      is_participant: isParticipant,
      remaining_seconds: Math.max(0, Math.floor((new Date(activity.expire_at).getTime() - Date.now()) / 1000)),
      created_at: activity.created_at
    };

    res.json(ApiResponse.success(detail));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 5. joinActivity — 参与拼团
// POST /api/group-buy/activities/:id/join
// =============================================================================
const joinActivity = async (req, res, next) => {
  try {
    const userId = req.userId;
    const activityId = parseInt(req.params.id);
    const { coupon_id } = req.body;
    if (!activityId || isNaN(activityId)) {
      return res.status(422).json(ApiResponse.fail('无效的活动ID'));
    }

    // Fetch activity with product info
    const [[activity]] = await pool.query(
      `SELECT a.*, p.original_price, p.name AS product_name, p.image AS product_image,
              p.merchant_id, m.name AS merchant_name
       FROM group_buy_activities a
       JOIN group_buy_products p ON p.id = a.product_id
       JOIN merchants m ON m.id = p.merchant_id
       WHERE a.id = ?`,
      [activityId]
    );

    if (!activity) {
      return res.status(404).json(ApiResponse.fail('活动不存在'));
    }

    // Check activity is active (status=1)
    if (activity.status !== 1) {
      return res.status(400).json(ApiResponse.fail(activity.status === 2 ? '该拼团已成功' : '该拼团已结束'));
    }

    // Check not expired
    if (new Date(activity.expire_at) < new Date()) {
      return res.status(400).json(ApiResponse.fail('该拼团已过期'));
    }

    // Check user not already participant
    const [[existing]] = await pool.query(
      'SELECT id FROM group_buy_participants WHERE activity_id = ? AND user_id = ?',
      [activityId, userId]
    );
    if (existing) {
      return res.status(400).json(ApiResponse.fail('你已参与该拼团'));
    }

    // Get current price tier
    const [tiers] = await pool.query(
      `SELECT id, target_count, price
       FROM group_buy_price_tiers
       WHERE product_id = ?
       ORDER BY target_count ASC`,
      [activity.product_id]
    );

    let currentPrice = activity.original_price;
    for (const tier of tiers) {
      if (tier.target_count <= activity.current_count + 1) {
        currentPrice = tier.price;
      }
    }

    // 优惠券抵扣(可选):校验归属/商家/满减,计算实际应付
    let payAmount = currentPrice;
    let couponAmount = 0;
    let usedCouponId = null;
    if (coupon_id) {
      const [[coupon]] = await pool.query(
        `SELECT uc.*, ct.name AS template_name, ct.face_value, ct.min_amount, ct.type,
                ct.merchant_id AS template_merchant_id
         FROM user_coupons uc
         JOIN coupon_templates ct ON ct.id = uc.template_id
         WHERE uc.id = ? AND uc.user_id = ? AND uc.status = 1 AND uc.expire_at > NOW()`,
        [parseInt(coupon_id), userId]
      );
      if (!coupon) {
        return res.status(400).json(ApiResponse.fail('优惠券不存在、已过期或不可用'));
      }
      if (coupon.template_merchant_id && coupon.template_merchant_id !== activity.merchant_id) {
        return res.status(400).json(ApiResponse.fail('该优惠券不适用于此商家'));
      }
      if (coupon.min_amount && currentPrice < coupon.min_amount) {
        return res.status(400).json(ApiResponse.fail(`该优惠券需满${coupon.min_amount}元可用`));
      }
      couponAmount = coupon.face_value;
      payAmount = Math.max(0, currentPrice - couponAmount);
      usedCouponId = coupon.id;
    }

    // Insert participant
    const [participantResult] = await pool.query(
      `INSERT INTO group_buy_participants
        (activity_id, user_id, product_id, join_price, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [activityId, userId, activity.product_id, currentPrice]
    );

    // 复核活动仍有效(计数由支付成功时递增,避免未支付占位)
    const [[freshActivity]] = await pool.query(
      'SELECT id FROM group_buy_activities WHERE id = ? AND status = 1 AND expire_at > NOW()',
      [activityId]
    );

    if (!freshActivity) {
      // Rollback: participant was inserted but activity is no longer valid
      await pool.query('DELETE FROM group_buy_participants WHERE id = ?', [participantResult.insertId]);
      return res.status(400).json(ApiResponse.fail('该拼团已失效，无法参与'));
    }

    // Create order for the joiner
    const orderNo = generateOrderNo();
    const verifyCode = generateVerifyCode();

    const [orderResult] = await pool.query(
      `INSERT INTO orders
        (order_no, user_id, product_id, activity_id, merchant_id,
         original_amount, pay_amount, coupon_id, coupon_amount,
         status, verification_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW())`,
      [orderNo, userId, activity.product_id, activityId, activity.merchant_id,
       activity.original_price, payAmount, usedCouponId, couponAmount, verifyCode]
    );

    await pool.query(
      `UPDATE group_buy_participants
       SET order_id = ?, status = 0
       WHERE id = ?`,
      [orderResult.insertId, participantResult.insertId]
    );

    // Get inserted order
    const [[order]] = await pool.query(
      'SELECT * FROM orders WHERE order_no = ?',
      [orderNo]
    );

    // Award growth value for participating in group buy
    const growthAward = config.growth?.factors?.group_buy_count || 50;
    await pool.query(
      'UPDATE users SET growth_value = growth_value + ?, updated_at = NOW() WHERE id = ?',
      [growthAward, userId]
    );

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'join_group_buy', 'group_buy_activity', ?, ?, NOW())`,
      [userId, String(activityId), JSON.stringify({ growth_award: growthAward, order_no: orderNo })]
    );

    res.json(ApiResponse.success({
      participant_id: participantResult.insertId,
      activity_id: activityId,
      order: {
        id: order.id,
        order_no: order.order_no,
        pay_amount: payAmount,
        original_amount: activity.original_price,
        savings: activity.original_price - payAmount,
        coupon_id: usedCouponId,
        coupon_amount: couponAmount,
        status: order.status,
        verification_code: verifyCode,
        created_at: order.created_at
      },
      activity_status: activity.status,
      is_success: false,
      payment_required: true
    }, '参与拼团成功'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 6. getUserActivities — 获取用户参与的拼团活动
// GET /api/group-buy/activities/my
// =============================================================================
const getUserActivities = async (req, res, next) => {
  try {
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    // Count total
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM group_buy_participants gp
       JOIN group_buy_activities a ON a.id = gp.activity_id
       WHERE gp.user_id = ?`,
      [userId]
    );

    // Fetch list
    const [rows] = await pool.query(
      `SELECT gp.id AS participant_id, gp.activity_id, gp.join_price, gp.created_at AS joined_at,
              a.product_id, a.initiator_id, a.target_count, a.current_count,
              a.status AS activity_status, a.expire_at, a.created_at AS activity_created_at,
              p.name AS product_name, p.image AS product_image,
              p.original_price AS product_original_price,
              m.name AS merchant_name, m.logo AS merchant_logo
       FROM group_buy_participants gp
       JOIN group_buy_activities a ON a.id = gp.activity_id
       JOIN group_buy_products p ON p.id = a.product_id
       JOIN merchants m ON m.id = p.merchant_id
       WHERE gp.user_id = ?
       ORDER BY gp.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    );

    const list = rows.map(row => ({
      participant_id: row.participant_id,
      activity_id: row.activity_id,
      product: {
        id: row.product_id,
        name: row.product_name,
        image: row.product_image,
        original_price: row.product_original_price
      },
      merchant: {
        name: row.merchant_name,
        logo: row.merchant_logo
      },
      initiator_id: row.initiator_id,
      is_initiator: row.initiator_id === userId,
      target_count: row.target_count,
      current_count: row.current_count,
      progress: Math.min(100, Math.round((row.current_count / row.target_count) * 100)),
      join_price: row.join_price,
      status: row.activity_status,
      status_text: row.activity_status === 1 ? '进行中' : (row.activity_status === 2 ? '已成团' : '已失败'),
      expire_at: row.expire_at,
      joined_at: row.joined_at,
      remaining_seconds: row.activity_status === 1
        ? Math.max(0, Math.floor((new Date(row.expire_at).getTime() - Date.now()) / 1000))
        : 0
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 7. shareActivity — 生成活动分享数据
// GET /api/group-buy/activities/:id/share
// =============================================================================
const shareActivity = async (req, res, next) => {
  try {
    const activityId = parseInt(req.params.id);
    if (!activityId || isNaN(activityId)) {
      return res.status(422).json(ApiResponse.fail('无效的活动ID'));
    }

    // Fetch activity with product and merchant info
    const [[activity]] = await pool.query(
      `SELECT a.*, p.name AS product_name, p.image AS product_image,
              p.original_price, m.name AS merchant_name, m.logo AS merchant_logo
       FROM group_buy_activities a
       JOIN group_buy_products p ON p.id = a.product_id
       JOIN merchants m ON m.id = p.merchant_id
       WHERE a.id = ?`,
      [activityId]
    );

    if (!activity) {
      return res.status(404).json(ApiResponse.fail('活动不存在'));
    }

    // Get current price
    const [tiers] = await pool.query(
      `SELECT target_count, price FROM group_buy_price_tiers
       WHERE product_id = ? ORDER BY target_count ASC`,
      [activity.product_id]
    );

    let currentPrice = activity.original_price;
    for (const tier of tiers) {
      if (tier.target_count <= activity.current_count) {
        currentPrice = tier.price;
      }
    }

    const needMore = activity.target_count - activity.current_count;

    const shareData = {
      activity_id: activityId,
      title: `还差${needMore}人就成团！${activity.merchant_name}的${activity.product_name}，仅需${currentPrice}元`,
      image: activity.product_image,
      description: `原价${activity.original_price}元，拼团价${currentPrice}元，已有${activity.current_count}人参与`,
      path: `/pages/group-buy/activity?id=${activityId}`,
      query: `id=${activityId}`,
      expire_at: activity.expire_at,
      merchant_name: activity.merchant_name,
      product_name: activity.product_name,
      current_price: currentPrice,
      original_price: activity.original_price,
      savings: activity.original_price - currentPrice,
      target_count: activity.target_count,
      current_count: activity.current_count,
      need_more: Math.max(0, needMore)
    };

    res.json(ApiResponse.success(shareData));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 8. checkExpiredActivities — 定时任务：检查过期活动并处理退款
// =============================================================================
const checkExpiredActivities = async (req, res, next) => {
  try {
    // Find activities where status=1 and expire_at < now
    const [expiredActivities] = await pool.query(
      `SELECT a.id, a.product_id, a.current_count, a.target_count,
              p.name AS product_name, p.merchant_id
       FROM group_buy_activities a
       JOIN group_buy_products p ON p.id = a.product_id
       WHERE a.status = 1 AND a.expire_at < NOW()`,
      []
    );

    const results = [];
    let totalRefunded = 0;

    for (const activity of expiredActivities) {
      // Update activity status=3 (失败)
      await pool.query(
        'UPDATE group_buy_activities SET status = 3, updated_at = NOW() WHERE id = ?',
        [activity.id]
      );

      // Find all paid orders (status=2,未核销) for this activity's participants
      const [paidOrders] = await pool.query(
        `SELECT o.id, o.order_no, o.user_id, o.pay_amount, o.coupon_id, o.coupon_amount
         FROM orders o
         JOIN group_buy_participants gp ON gp.user_id = o.user_id AND gp.activity_id = o.activity_id
         WHERE o.activity_id = ? AND o.status = 2`,
        [activity.id]
      );

      let refundedCount = 0;
      for (const order of paidOrders) {
        // Refund: set order status=4, refunded_at=now
        await pool.query(
          'UPDATE orders SET status = 4, refunded_at = NOW(), updated_at = NOW() WHERE id = ?',
          [order.id]
        );

        // Return coupon if used
        if (order.coupon_id) {
          await pool.query(
            `UPDATE user_coupons
             SET status = 1, used_at = NULL, used_order_id = NULL
             WHERE id = ? AND status = 2 AND used_order_id = ?`,
            [order.coupon_id, order.id]
          );
        }

        // Log refund operation
        await pool.query(
          `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
           VALUES (?, 'auto_refund', 'order', ?, ?, NOW())`,
          [order.user_id, String(order.id),
           JSON.stringify({ reason: 'activity_expired', activity_id: activity.id, order_no: order.order_no, amount: order.pay_amount })]
        );

        refundedCount++;
      }

      // 成团失败通知:告知所有参与者已自动退款
      const [participants] = await pool.query(
        'SELECT user_id FROM group_buy_participants WHERE activity_id = ?',
        [activity.id]
      );
      for (const p of participants) {
        await notifyUser(
          p.user_id,
          'group_buy_failed',
          '⚠️ 拼团失败',
          `「${activity.product_name || '拼团商品'}」未在有效期内成团，已自动原路退款。`,
          { activity_id: activity.id, product_name: activity.product_name || '' }
        );
      }

      console.log(`[GroupBuy] Activity ${activity.id} expired. Refunded ${refundedCount} orders.`);
      totalRefunded += refundedCount;

      results.push({
        activity_id: activity.id,
        product_name: activity.product_name,
        refunded_orders: refundedCount
      });
    }

    // Handle the case where this is called from a scheduled job (no req/res)
    if (res) {
      res.json(ApiResponse.success({
        expired_count: expiredActivities.length,
        total_refunded: totalRefunded,
        details: results
      }, `处理了${expiredActivities.length}个过期活动，共退款${totalRefunded}笔订单`));
    } else {
      return { expired_count: expiredActivities.length, total_refunded: totalRefunded, details: results };
    }
  } catch (err) {
    if (res) {
      next(err);
    } else {
      console.error('[GroupBuy] checkExpiredActivities error:', err.message);
      throw err;
    }
  }
};

module.exports = {
  getProducts,
  getProductDetail,
  createActivity,
  getActivityDetail,
  joinActivity,
  getUserActivities,
  shareActivity,
  checkExpiredActivities
};
