const pool = require('../config/db');
const config = require('../config');
const { ApiResponse, calcDistance, generateOrderNo, generateVerifyCode } = require('../utils/helpers');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSON column that may already be an object.
 */
function parseJson(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

/**
 * Check that the current user owns the merchant with the given id.
 * Returns the merchant row or null.
 */
async function getOwnedMerchant(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM merchants WHERE owner_id = ?',
    [userId]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Compute merchant level info from score.
 */
function computeMerchantLevelInfo(score, level) {
  const levels = [
    { level: 1, name: '初级商家', min: 0, max: 200 },
    { level: 2, name: '银牌商家', min: 200, max: 500 },
    { level: 3, name: '金牌商家', min: 500, max: 1000 },
    { level: 4, name: '钻石商家', min: 1000, max: 2000 },
    { level: 5, name: '战略伙伴', min: 2000, max: Infinity }
  ];

  const current = levels.find(l => l.level === (level || 1)) || levels[0];
  const next = levels.find(l => l.level === current.level + 1) || null;

  const rangeMin = current.min;
  const rangeMax = current.max;
  const progress = Math.min(100, Math.round(((score - rangeMin) / (rangeMax - rangeMin)) * 100));

  return {
    current_level: current.level,
    current_level_name: current.name,
    score,
    progress,
    next_level: next ? next.level : null,
    next_level_name: next ? next.name : null,
    next_level_threshold: next ? next.min : null,
    score_to_next: next ? Math.max(0, next.min - score) : 0
  };
}

// ---------------------------------------------------------------------------
// 1. apply — Submit merchant application
// ---------------------------------------------------------------------------
const apply = async (req, res, next) => {
  try {
    const userId = req.userId;
    const {
      name, type, phone, address, location, description,
      qualifications, service_scope
    } = req.body;

    // --- Validation ---
    if (!name || !name.trim()) {
      return res.status(422).json(ApiResponse.fail('请输入商家名称'));
    }
    const validTypes = ['hotel', 'restaurant', 'gas', 'repair', 'camping', 'shop'];
    if (!type || !validTypes.includes(type)) {
      return res.status(422).json(ApiResponse.fail('请选择有效的商家类型'));
    }
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(422).json(ApiResponse.fail('请输入正确的联系电话'));
    }
    if (!address || !address.trim()) {
      return res.status(422).json(ApiResponse.fail('请输入商家地址'));
    }
    if (!location || location.lng == null || location.lat == null) {
      return res.status(422).json(ApiResponse.fail('请提供商家位置坐标'));
    }
    if (!description || !description.trim()) {
      return res.status(422).json(ApiResponse.fail('请输入商家描述'));
    }
    if (!qualifications || !Array.isArray(qualifications) || qualifications.length === 0) {
      return res.status(422).json(ApiResponse.fail('请上传营业执照等资质证明'));
    }

    if ((type === 'repair' || type === 'gas') && (!service_scope || !service_scope.trim())) {
      return res.status(422).json(ApiResponse.fail('维修/救援类商家请填写服务范围'));
    }

    // Check if user already has a merchant
    const [existingMerchant] = await pool.query(
      'SELECT id FROM merchants WHERE owner_id = ?',
      [userId]
    );
    if (existingMerchant.length > 0) {
      return res.status(400).json(ApiResponse.fail('您已经提交过商家申请'));
    }

    // Check if user already has a pending application
    const [pendingApp] = await pool.query(
      'SELECT id FROM merchants WHERE owner_id = ? AND status = 0',
      [userId]
    );
    if (pendingApp.length > 0) {
      return res.status(400).json(ApiResponse.fail('您有待审核的申请，请耐心等待'));
    }

    // Insert merchant
    const [result] = await pool.query(
      `INSERT INTO merchants
        (name, type, owner_id, phone, address, location, description,
         qualifications, service_scope, status, score, level, rating,
         total_sales, can_provide_invite_coupon, can_join_reward_pool,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, 5.0, 0, 0, 0, NOW(), NOW())`,
      [
        name.trim(),
        type,
        userId,
        phone,
        address.trim(),
        JSON.stringify(location),
        description.trim(),
        JSON.stringify(qualifications),
        service_scope ? service_scope.trim() : null
      ]
    );

    const merchantId = result.insertId;

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'apply_merchant', 'merchant', ?, ?, NOW())`,
      [userId, String(merchantId), JSON.stringify({ name: name.trim(), type })]
    );

    res.json(ApiResponse.success({ merchant_id: merchantId }, '申请已提交，请等待审核'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 2. getMyMerchant — Get the merchant owned by current user
// ---------------------------------------------------------------------------
const getMyMerchant = async (req, res, next) => {
  try {
    const userId = req.userId;

    const merchant = await getOwnedMerchant(userId);
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('您还没有入驻商家'));
    }

    // Get product count
    const [[{ product_count }]] = await pool.query(
      'SELECT COUNT(*) AS product_count FROM group_buy_products WHERE merchant_id = ?',
      [merchant.id]
    );

    // Get active group buy count
    const [[{ active_group_buy_count }]] = await pool.query(
      `SELECT COUNT(*) AS active_group_buy_count FROM group_buy_activities gba
       JOIN group_buy_products gbp ON gbp.id = gba.product_id
       WHERE gbp.merchant_id = ? AND gba.status = 1`,
      [merchant.id]
    );

    // Get today's order count and revenue
    const [[todayStats]] = await pool.query(
      `SELECT COUNT(*) AS order_count, COALESCE(SUM(amount), 0) AS revenue
       FROM orders
       WHERE merchant_id = ? AND DATE(created_at) = CURDATE() AND status IN (1, 2, 3, 4)`,
      [merchant.id]
    );

    const levelInfo = computeMerchantLevelInfo(merchant.score || 0, merchant.level || 1);

    res.json(ApiResponse.success({
      id: merchant.id,
      name: merchant.name,
      type: merchant.type,
      logo: merchant.logo,
      images: merchant.images ? parseJson(merchant.images) : [],
      phone: merchant.phone,
      address: merchant.address,
      location: parseJson(merchant.location),
      business_hours: merchant.business_hours,
      description: merchant.description,
      qualifications: merchant.qualifications ? parseJson(merchant.qualifications) : [],
      service_scope: merchant.service_scope,
      status: merchant.status,
      score: merchant.score,
      level: levelInfo.current_level,
      level_name: levelInfo.current_level_name,
      rating: merchant.rating,
      total_sales: merchant.total_sales || 0,
      can_provide_invite_coupon: merchant.can_provide_invite_coupon === 1,
      can_join_reward_pool: merchant.can_join_reward_pool === 1,
      product_count,
      active_group_buy_count,
      today_order_count: todayStats?.order_count || 0,
      today_revenue: todayStats?.revenue || 0,
      created_at: merchant.created_at,
      updated_at: merchant.updated_at
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 3. updateMerchant — Update merchant info
// ---------------------------------------------------------------------------
const updateMerchant = async (req, res, next) => {
  try {
    const userId = req.userId;

    const merchant = await getOwnedMerchant(userId);
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('您还没有入驻商家'));
    }
    if (merchant.status !== 1) {
      return res.status(400).json(ApiResponse.fail('商家审核通过后才能修改信息'));
    }

    const editableFields = ['name', 'logo', 'images', 'phone', 'address', 'location',
      'business_hours', 'description', 'service_scope'];
    const updates = [];
    const params = [];

    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        const val = req.body[field];
        switch (field) {
          case 'name':
            if (!val || !val.trim()) return res.status(422).json(ApiResponse.fail('商家名称不能为空'));
            if (val.length > 100) return res.status(422).json(ApiResponse.fail('商家名称不能超过100个字符'));
            updates.push('name = ?');
            params.push(val.trim());
            break;
          case 'phone':
            if (val && !/^1[3-9]\d{9}$/.test(val)) return res.status(422).json(ApiResponse.fail('请输入正确的联系电话'));
            updates.push('phone = ?');
            params.push(val);
            break;
          case 'address':
            updates.push('address = ?');
            params.push(val ? val.trim() : null);
            break;
          case 'location':
            if (val && (val.lng == null || val.lat == null)) return res.status(422).json(ApiResponse.fail('请提供完整的位置坐标'));
            updates.push('location = ?');
            params.push(val ? JSON.stringify(val) : null);
            break;
          case 'images':
            updates.push('images = ?');
            params.push(val ? JSON.stringify(val) : null);
            break;
          case 'business_hours':
            updates.push('business_hours = ?');
            params.push(val || null);
            break;
          case 'description':
            updates.push('description = ?');
            params.push(val ? val.trim() : null);
            break;
          case 'service_scope':
            updates.push('service_scope = ?');
            params.push(val ? val.trim() : null);
            break;
          default:
            updates.push(`${field} = ?`);
            params.push(val);
        }
      }
    }

    if (updates.length === 0) {
      return res.status(422).json(ApiResponse.fail('没有需要更新的字段'));
    }

    params.push(merchant.id);
    await pool.query(
      `UPDATE merchants SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params
    );

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'update_merchant', 'merchant', ?, ?, NOW())`,
      [userId, String(merchant.id), JSON.stringify({ updated_fields: updates.map(u => u.split(' ')[0]) })]
    );

    res.json(ApiResponse.success(null, '商家信息已更新'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 4. getMerchantDetail — Get merchant public detail
// ---------------------------------------------------------------------------
const getMerchantDetail = async (req, res, next) => {
  try {
    const merchantId = parseInt(req.params.id);
    if (!merchantId || isNaN(merchantId)) {
      return res.status(422).json(ApiResponse.fail('无效的商家ID'));
    }

    const [[merchant]] = await pool.query(
      'SELECT * FROM merchants WHERE id = ? AND status = 1',
      [merchantId]
    );
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('商家不存在或未通过审核'));
    }

    // Get active group buy products
    const [activeProducts] = await pool.query(
      `SELECT gbp.id, gbp.name, gbp.original_price, gbp.price_tiers,
              gbp.images, gbp.description, gbp.min_count, gbp.max_quantity,
              gbp.expiry_hours, gbp.sales_count,
              (SELECT COUNT(*) FROM group_buy_activities gba
               WHERE gba.product_id = gbp.id AND gba.status = 1 AND gba.expire_at > NOW()) AS active_activities
       FROM group_buy_products gbp
       WHERE gbp.merchant_id = ? AND gbp.status = 1
       ORDER BY gbp.sales_count DESC
       LIMIT 20`,
      [merchantId]
    );

    // Get rating distribution
    const [ratingDist] = await pool.query(
      `SELECT rating, COUNT(*) AS count
       FROM order_reviews
       WHERE merchant_id = ?
       GROUP BY rating
       ORDER BY rating DESC`,
      [merchantId]
    );

    const levelInfo = computeMerchantLevelInfo(merchant.score || 0, merchant.level || 1);

    res.json(ApiResponse.success({
      id: merchant.id,
      name: merchant.name,
      type: merchant.type,
      logo: merchant.logo,
      images: merchant.images ? parseJson(merchant.images) : [],
      phone: merchant.phone,
      address: merchant.address,
      location: parseJson(merchant.location),
      business_hours: merchant.business_hours,
      description: merchant.description,
      service_scope: merchant.service_scope,
      rating: merchant.rating,
      level: levelInfo.current_level,
      level_name: levelInfo.current_level_name,
      total_sales: merchant.total_sales || 0,
      can_provide_invite_coupon: merchant.can_provide_invite_coupon === 1,
      can_join_reward_pool: merchant.can_join_reward_pool === 1,
      rating_distribution: ratingDist,
      active_products: activeProducts.map(p => ({
        id: p.id,
        name: p.name,
        original_price: p.original_price,
        price_tiers: parseJson(p.price_tiers),
        images: parseJson(p.images),
        description: p.description,
        min_count: p.min_count,
        max_quantity: p.max_quantity,
        expiry_hours: p.expiry_hours,
        sales_count: p.sales_count,
        active_activities: p.active_activities
      })),
      created_at: merchant.created_at
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 5. getProducts — Get merchant's own products list
// ---------------------------------------------------------------------------
const getProducts = async (req, res, next) => {
  try {
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const merchant = await getOwnedMerchant(userId);
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('您还没有入驻商家'));
    }

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM group_buy_products WHERE merchant_id = ?',
      [merchant.id]
    );

    const [products] = await pool.query(
      `SELECT gbp.*,
              (SELECT COUNT(*) FROM group_buy_activities gba
               WHERE gba.product_id = gbp.id AND gba.status = 1) AS active_activities
       FROM group_buy_products gbp
       WHERE gbp.merchant_id = ?
       ORDER BY gbp.created_at DESC
       LIMIT ? OFFSET ?`,
      [merchant.id, pageSize, offset]
    );

    const list = products.map(p => ({
      id: p.id,
      name: p.name,
      original_price: p.original_price,
      price_tiers: parseJson(p.price_tiers),
      images: parseJson(p.images),
      description: p.description,
      min_count: p.min_count,
      max_quantity: p.max_quantity,
      expiry_hours: p.expiry_hours,
      sales_count: p.sales_count || 0,
      status: p.status,
      active_activities: p.active_activities || 0,
      created_at: p.created_at,
      updated_at: p.updated_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 6. createProduct — Create a new group buy product
// ---------------------------------------------------------------------------
const createProduct = async (req, res, next) => {
  try {
    const userId = req.userId;
    const {
      name, original_price, price_tiers, description,
      images, max_quantity, expiry_hours, min_count
    } = req.body;

    const merchant = await getOwnedMerchant(userId);
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('您还没有入驻商家'));
    }
    if (merchant.status !== 1) {
      return res.status(400).json(ApiResponse.fail('商家审核通过后才能创建商品'));
    }

    // --- Validation ---
    if (!name || !name.trim()) {
      return res.status(422).json(ApiResponse.fail('请输入商品名称'));
    }
    if (original_price === undefined || original_price === null || parseFloat(original_price) <= 0) {
      return res.status(422).json(ApiResponse.fail('请输入有效的原价'));
    }
    if (!price_tiers || !Array.isArray(price_tiers) || price_tiers.length === 0) {
      return res.status(422).json(ApiResponse.fail('请设置至少一个拼团价格阶梯'));
    }
    for (const tier of price_tiers) {
      if (!tier.count || !tier.price || tier.price <= 0) {
        return res.status(422).json(ApiResponse.fail('价格阶梯设置不完整'));
      }
    }
    if (!description || !description.trim()) {
      return res.status(422).json(ApiResponse.fail('请输入商品描述'));
    }

    // Sort price tiers by count ascending
    const sortedTiers = [...price_tiers].sort((a, b) => a.count - b.count);

    const [result] = await pool.query(
      `INSERT INTO group_buy_products
        (merchant_id, name, original_price, price_tiers, description,
         images, min_count, max_quantity, expiry_hours, sales_count, status,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NOW(), NOW())`,
      [
        merchant.id,
        name.trim(),
        parseFloat(original_price),
        JSON.stringify(sortedTiers),
        description.trim(),
        images ? JSON.stringify(images) : null,
        parseInt(min_count) || sortedTiers[0]?.count || 2,
        parseInt(max_quantity) || null,
        parseInt(expiry_hours) || config.groupBuyExpiry || 24
      ]
    );

    for (const tier of sortedTiers) {
      await pool.query(
        `INSERT INTO group_buy_price_tiers (product_id, target_count, price)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE price = VALUES(price)`,
        [result.insertId, parseInt(tier.count), parseFloat(tier.price)]
      );
    }

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'create_product', 'group_buy_product', ?, ?, NOW())`,
      [userId, String(result.insertId), JSON.stringify({ name: name.trim(), price: parseFloat(original_price) })]
    );

    res.json(ApiResponse.success({ product_id: result.insertId }, '商品创建成功'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 7. updateProduct — Update product info
// ---------------------------------------------------------------------------
const updateProduct = async (req, res, next) => {
  try {
    const userId = req.userId;
    const productId = parseInt(req.params.id);
    if (!productId || isNaN(productId)) {
      return res.status(422).json(ApiResponse.fail('无效的商品ID'));
    }

    const merchant = await getOwnedMerchant(userId);
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('您还没有入驻商家'));
    }

    // Check product belongs to this merchant
    const [[product]] = await pool.query(
      'SELECT * FROM group_buy_products WHERE id = ? AND merchant_id = ?',
      [productId, merchant.id]
    );
    if (!product) {
      return res.status(404).json(ApiResponse.fail('商品不存在'));
    }

    // Check no active activities using this product
    const [[{ activeCount }]] = await pool.query(
      `SELECT COUNT(*) AS activeCount FROM group_buy_activities
       WHERE product_id = ? AND status = 1 AND expire_at > NOW()`,
      [productId]
    );
    if (activeCount > 0) {
      return res.status(400).json(ApiResponse.fail('该商品有进行中的拼团活动，无法修改'));
    }

    const editableFields = ['name', 'original_price', 'price_tiers', 'description',
      'images', 'max_quantity', 'expiry_hours', 'min_count'];
    const updates = [];
    const params = [];

    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        const val = req.body[field];
        switch (field) {
          case 'name':
            if (!val || !val.trim()) return res.status(422).json(ApiResponse.fail('商品名称不能为空'));
            updates.push('name = ?');
            params.push(val.trim());
            break;
          case 'original_price':
            if (parseFloat(val) <= 0) return res.status(422).json(ApiResponse.fail('请输入有效的原价'));
            updates.push('original_price = ?');
            params.push(parseFloat(val));
            break;
          case 'price_tiers':
            if (!Array.isArray(val) || val.length === 0) return res.status(422).json(ApiResponse.fail('请设置至少一个价格阶梯'));
            const sorted = [...val].sort((a, b) => a.count - b.count);
            updates.push('price_tiers = ?');
            params.push(JSON.stringify(sorted));
            await pool.query('DELETE FROM group_buy_price_tiers WHERE product_id = ?', [productId]);
            for (const tier of sorted) {
              await pool.query(
                `INSERT INTO group_buy_price_tiers (product_id, target_count, price)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE price = VALUES(price)`,
                [productId, parseInt(tier.count), parseFloat(tier.price)]
              );
            }
            break;
          case 'description':
            updates.push('description = ?');
            params.push(val ? val.trim() : null);
            break;
          case 'images':
            updates.push('images = ?');
            params.push(val ? JSON.stringify(val) : null);
            break;
          case 'max_quantity':
            updates.push('max_quantity = ?');
            params.push(val ? parseInt(val) : null);
            break;
          case 'expiry_hours':
            updates.push('expiry_hours = ?');
            params.push(parseInt(val) || 24);
            break;
          case 'min_count':
            updates.push('min_count = ?');
            params.push(parseInt(val) || 2);
            break;
        }
      }
    }

    if (updates.length === 0) {
      return res.status(422).json(ApiResponse.fail('没有需要更新的字段'));
    }

    params.push(productId);
    await pool.query(
      `UPDATE group_buy_products SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params
    );

    res.json(ApiResponse.success(null, '商品已更新'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 8. toggleProduct — Toggle product status (上架/下架)
// ---------------------------------------------------------------------------
const toggleProduct = async (req, res, next) => {
  try {
    const userId = req.userId;
    const productId = parseInt(req.params.id);
    if (!productId || isNaN(productId)) {
      return res.status(422).json(ApiResponse.fail('无效的商品ID'));
    }

    const merchant = await getOwnedMerchant(userId);
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('您还没有入驻商家'));
    }

    const [[product]] = await pool.query(
      'SELECT * FROM group_buy_products WHERE id = ? AND merchant_id = ?',
      [productId, merchant.id]
    );
    if (!product) {
      return res.status(404).json(ApiResponse.fail('商品不存在'));
    }

    const newStatus = product.status === 1 ? 0 : 1;
    await pool.query(
      'UPDATE group_buy_products SET status = ?, updated_at = NOW() WHERE id = ?',
      [newStatus, productId]
    );

    res.json(ApiResponse.success(
      { status: newStatus },
      newStatus === 1 ? '商品已上架' : '商品已下架'
    ));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 9. getMerchantOrders — Get orders for this merchant
// ---------------------------------------------------------------------------
const getMerchantOrders = async (req, res, next) => {
  try {
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const merchant = await getOwnedMerchant(userId);
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('您还没有入驻商家'));
    }

    const { status, start_date, end_date } = req.query;

    const conditions = ['o.merchant_id = ?'];
    const params = [merchant.id];

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

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM orders o ${whereClause}`,
      params
    );

    const [orders] = await pool.query(
      `SELECT o.*, u.nickname, u.avatar, u.phone AS user_phone,
              gbp.name AS product_name, gbp.images AS product_images
       FROM orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN group_buy_products gbp ON gbp.id = o.product_id
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
        phone: o.user_phone ? o.user_phone.slice(0, 3) + '****' + o.user_phone.slice(7) : null
      },
      product: {
        id: o.product_id,
        name: o.product_name,
        images: o.product_images ? parseJson(o.product_images) : null
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
      verified_at: o.verified_at,
      pay_at: o.pay_at,
      refund_at: o.refund_at,
      refund_amount: o.refund_amount,
      refund_reason: o.refund_reason,
      created_at: o.created_at
    }));

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 10. getSettlementRecords — Get profit split / settlement records
// ---------------------------------------------------------------------------
const getSettlementRecords = async (req, res, next) => {
  try {
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const merchant = await getOwnedMerchant(userId);
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('您还没有入驻商家'));
    }

    const { status: settleStatus } = req.query;
    const conditions = ['s.merchant_id = ?'];
    const params = [merchant.id];
    if (settleStatus !== undefined && settleStatus !== '') {
      conditions.push('s.status = ?');
      params.push(parseInt(settleStatus));
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM settlement_records s ${whereClause}`,
      params
    );

    const [records] = await pool.query(
      `SELECT s.*, o.order_no, o.amount AS order_amount,
              o.user_id, u.nickname AS user_nickname
       FROM settlement_records s
       JOIN orders o ON o.id = s.order_id
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
      user: {
        id: r.user_id,
        nickname: r.user_nickname
      },
      order_amount: r.order_amount,
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
// 11. getLevelInfo — Get merchant level and score info
// ---------------------------------------------------------------------------
const getLevelInfo = async (req, res, next) => {
  try {
    const userId = req.userId;

    const merchant = await getOwnedMerchant(userId);
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('您还没有入驻商家'));
    }

    const levelInfo = computeMerchantLevelInfo(merchant.score || 0, merchant.level || 1);

    // Get dimension scores
    const [[dimScores]] = await pool.query(
      `SELECT
         COALESCE(AVG(response_time_minutes), 0) AS avg_response_time,
         (SELECT COUNT(*) FROM order_reviews WHERE merchant_id = ? AND rating >= 4) AS good_review_count,
         (SELECT COUNT(*) FROM order_reviews WHERE merchant_id = ?) AS total_review_count,
         COALESCE(SUM(total_sales), 0) AS total_sales
       FROM merchants WHERE id = ?`,
      [merchant.id, merchant.id, merchant.id]
    );

    // Compute dimension scores (normalized to 0-100)
    const responseSpeed = merchant.avg_response_time
      ? Math.max(0, Math.round(100 - (merchant.avg_response_time / 60) * 10))
      : 80;
    const serviceQuality = dimScores?.total_review_count > 0
      ? Math.round((dimScores.good_review_count / dimScores.total_review_count) * 100)
      : 80;
    const salesVolume = Math.min(100, Math.round((merchant.total_sales || 0) / 100));
    const ratingScore = Math.round(((merchant.rating || 5) / 5) * 100);

    // Commission rate based on level
    const commissionRates = config.commissionRates || {
      1: 0.10, 2: 0.08, 3: 0.06, 4: 0.05, 5: 0.03
    };

    res.json(ApiResponse.success({
      ...levelInfo,
      dimensions: {
        response_speed: {
          score: responseSpeed,
          label: '响应速度',
          detail: merchant.avg_response_time
            ? `平均响应时间 ${merchant.avg_response_time}分钟`
            : '暂无数据'
        },
        service_quality: {
          score: serviceQuality,
          label: '服务质量',
          detail: `${dimScores?.good_review_count || 0}/${dimScores?.total_review_count || 0} 好评`
        },
        sales_volume: {
          score: salesVolume,
          label: '销售额',
          detail: `累计销售额 ¥${(merchant.total_sales || 0).toFixed(2)}`
        },
        rating: {
          score: ratingScore,
          label: '用户评分',
          detail: `${merchant.rating || 5.0} 分`
        }
      },
      commission_rate: commissionRates[levelInfo.current_level] || 0.10,
      commission_rate_text: `${((commissionRates[levelInfo.current_level] || 0.10) * 100).toFixed(0)}%`
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 12. toggleInviteCoupon — Toggle whether merchant provides invite coupons
// ---------------------------------------------------------------------------
const toggleInviteCoupon = async (req, res, next) => {
  try {
    const userId = req.userId;

    const merchant = await getOwnedMerchant(userId);
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('您还没有入驻商家'));
    }
    if (merchant.status !== 1) {
      return res.status(400).json(ApiResponse.fail('商家审核通过后才能操作'));
    }

    const newValue = merchant.can_provide_invite_coupon === 1 ? 0 : 1;

    await pool.query(
      'UPDATE merchants SET can_provide_invite_coupon = ?, updated_at = NOW() WHERE id = ?',
      [newValue, merchant.id]
    );

    res.json(ApiResponse.success(
      { can_provide_invite_coupon: newValue === 1 },
      newValue === 1 ? '已开启邀请优惠券' : '已关闭邀请优惠券'
    ));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 13. toggleRewardPool — Toggle whether merchant joins reward pool
// ---------------------------------------------------------------------------
const toggleRewardPool = async (req, res, next) => {
  try {
    const userId = req.userId;

    const merchant = await getOwnedMerchant(userId);
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('您还没有入驻商家'));
    }
    if (merchant.status !== 1) {
      return res.status(400).json(ApiResponse.fail('商家审核通过后才能操作'));
    }

    const newValue = merchant.can_join_reward_pool === 1 ? 0 : 1;

    await pool.query(
      'UPDATE merchants SET can_join_reward_pool = ?, updated_at = NOW() WHERE id = ?',
      [newValue, merchant.id]
    );

    res.json(ApiResponse.success(
      { can_join_reward_pool: newValue === 1 },
      newValue === 1 ? '已加入奖励池' : '已退出奖励池'
    ));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 14. getPromotionCode — Get merchant's promotion code and invite stats
// ---------------------------------------------------------------------------
const getPromotionCode = async (req, res, next) => {
  try {
    const userId = req.userId;

    const merchant = await getOwnedMerchant(userId);
    if (!merchant) {
      return res.status(404).json(ApiResponse.fail('您还没有入驻商家'));
    }

    // Generate deterministic promotion code from merchant ID
    const promoCode = `M${String(merchant.id).padStart(6, '0')}`;

    // Count users who came through this merchant's promotion code
    const [[stats]] = await pool.query(
      `SELECT COUNT(*) AS total_invited_users,
              COALESCE(SUM(CASE WHEN ui.reward_claimed = 1 THEN 1 ELSE 0 END), 0) AS rewarded_count
       FROM user_invites ui
       WHERE ui.inviter_type = 'merchant' AND ui.inviter_id = ?`,
      [merchant.id]
    );

    // Get invited users list
    const [invitedUsers] = await pool.query(
      `SELECT ui.id, ui.invitee_id, ui.reward_claimed, ui.created_at,
              u.nickname, u.avatar
       FROM user_invites ui
       JOIN users u ON u.id = ui.invitee_id
       WHERE ui.inviter_type = 'merchant' AND ui.inviter_id = ?
       ORDER BY ui.created_at DESC
       LIMIT 50`,
      [merchant.id]
    );

    // Get order count generated via this promotion
    const [[orderStats]] = await pool.query(
      `SELECT COUNT(*) AS promo_orders, COALESCE(SUM(o.amount), 0) AS promo_revenue
       FROM orders o
       JOIN user_invites ui ON ui.invitee_id = o.user_id
       WHERE ui.inviter_type = 'merchant' AND ui.inviter_id = ? AND o.status IN (2, 3, 4)`,
      [merchant.id]
    );

    res.json(ApiResponse.success({
      promo_code: promoCode,
      total_invited_users: stats?.total_invited_users || 0,
      rewarded_count: stats?.rewarded_count || 0,
      promo_orders: orderStats?.promo_orders || 0,
      promo_revenue: orderStats?.promo_revenue || 0,
      invited_users: invitedUsers.map(u => ({
        invite_id: u.id,
        user_id: u.invitee_id,
        nickname: u.nickname,
        avatar: u.avatar,
        reward_claimed: u.reward_claimed === 1,
        created_at: u.created_at
      }))
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 15. getRepairServices — Get nearby repair/rescue services
// ---------------------------------------------------------------------------
const getRepairServices = async (req, res, next) => {
  try {
    const { lng, lat, radius: radiusStr } = req.query;

    if (lng == null || lat == null) {
      return res.status(422).json(ApiResponse.fail('请提供经纬度坐标'));
    }

    const centerLng = parseFloat(lng);
    const centerLat = parseFloat(lat);
    const searchRadius = parseInt(radiusStr) || 50; // default 50km

    // Get repair type merchants that are approved
    const [merchants] = await pool.query(
      `SELECT * FROM merchants
       WHERE type IN ('repair', 'gas') AND status = 1
       ORDER BY rating DESC, score DESC
       LIMIT 200`,
    );

    const nearbyList = [];

    for (const m of merchants) {
      const loc = parseJson(m.location);
      if (!loc || loc.lng == null || loc.lat == null) continue;

      const dist = calcDistance(centerLng, centerLat, loc.lng, loc.lat);
      if (dist <= searchRadius) {
        const levelInfo = computeMerchantLevelInfo(m.score || 0, m.level || 1);

        nearbyList.push({
          id: m.id,
          name: m.name,
          type: m.type,
          type_text: m.type === 'repair' ? '维修救援' : m.type === 'gas' ? '加油站' : '其他',
          logo: m.logo,
          phone: m.phone,
          address: m.address,
          location: loc,
          service_scope: m.service_scope,
          rating: m.rating,
          level: levelInfo.current_level,
          level_name: levelInfo.current_level_name,
          business_hours: m.business_hours,
          distance_km: Math.round(dist * 100) / 100,
          distance_text: dist < 1
            ? Math.round(dist * 1000) + 'm'
            : dist.toFixed(1) + 'km'
        });
      }
    }

    // Sort by distance
    nearbyList.sort((a, b) => a.distance_km - b.distance_km);

    res.json(ApiResponse.success({
      list: nearbyList,
      total: nearbyList.length,
      search_radius_km: searchRadius
    }));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  apply,
  getMyMerchant,
  updateMerchant,
  getMerchantDetail,
  getProducts,
  createProduct,
  updateProduct,
  toggleProduct,
  getMerchantOrders,
  getSettlementRecords,
  getLevelInfo,
  toggleInviteCoupon,
  toggleRewardPool,
  getPromotionCode,
  getRepairServices
};
