/**
 * 订单数据归一化工具
 * 后端字段为 snake_case / 嵌套对象 / 数字状态码,
 * 页面模板按 camelCase / 扁平字段 / 字符串状态消费。
 */

const ORDER_STATUS_MAP = {
  0: 'pending',
  1: 'cancelled',
  2: 'paid',
  3: 'verified',
  4: 'refunding',
  5: 'refunded',
  6: 'refund_failed'
};

/**
 * 归一化订单对象(列表/详情通用)
 * @param {Object} raw 后端订单对象
 * @returns {Object|null}
 */
export function normalizeOrder(raw) {
  if (!raw) return null;

  const product = raw.product || {};
  const merchant = raw.merchant || {};
  const statusCode = raw.status !== undefined ? raw.status : null;

  return {
    id: raw.id,
    orderNo: raw.order_no || raw.orderNo || '',
    productId: raw.product_id || product.id || null,
    activityId: raw.activity_id || raw.activityId || null,
    merchantId: raw.merchant_id || merchant.id || null,

    productName: product.name || raw.product_name || raw.productName || '',
    productImage: product.image || raw.product_image || raw.productImage || '',
    merchantName: merchant.name || raw.merchant_name || raw.merchantName || '',
    merchantLogo: merchant.logo || raw.merchant_logo || raw.merchantLogo || '',
    merchantPhone: merchant.phone || raw.merchant_phone || raw.merchantPhone || '',
    merchantAddress: merchant.address || raw.merchant_address || raw.merchantAddress || '',
    merchantLng: (merchant.location && (merchant.location.lng !== undefined ? merchant.location.lng : merchant.location.longitude)) || raw.merchant_lng || raw.merchantLng || '',
    merchantLat: (merchant.location && (merchant.location.lat !== undefined ? merchant.location.lat : merchant.location.latitude)) || raw.merchant_lat || raw.merchantLat || '',

    originalAmount: raw.original_amount || raw.originalAmount || 0,
    paidAmount: raw.pay_amount || raw.paidAmount || raw.amount || 0,
    couponAmount: raw.coupon_amount || raw.couponAmount || 0,
    couponDiscount: raw.coupon_amount || raw.couponDiscount || 0,
    groupDiscount: raw.group_discount || raw.groupDiscount || 0,

    status: ORDER_STATUS_MAP[statusCode] || (typeof raw.status === 'string' ? raw.status : 'unknown'),
    statusText: raw.status_text || raw.statusText || '',

    verificationCode: raw.verification_code || raw.verificationCode || '',
    payTime: raw.paid_at || raw.payTime || '',
    verifyTime: raw.verified_at || raw.verifyTime || '',
    refundTime: raw.refunded_at || raw.refundTime || '',
    verifyLocation: raw.verified_location || raw.verifyLocation || '',
    createTime: raw.created_at || raw.createTime || '',
    updatedAt: raw.updated_at || '',

    raw
  };
}

/**
 * 归一化订单列表响应(支持 { list, pagination } 或数组)
 * @param {Object|Array} res
 * @returns {Array}
 */
export function normalizeOrderList(res) {
  const list = Array.isArray(res) ? res : (res && (res.list || res.records)) || [];
  return list.map(normalizeOrder).filter(Boolean);
}
