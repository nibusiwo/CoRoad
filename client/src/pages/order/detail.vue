<template>
  <view class="detail-page">
    <scroll-view class="detail-scroll" scroll-y>
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-if="!loading && order">
        <!-- Order Status Header -->
        <view class="status-header" :class="'status-bg-' + orderStatus">
          <view class="status-icon-wrap">
            <text class="status-icon">{{ statusIcon }}</text>
          </view>
          <text class="status-title">{{ statusTitle }}</text>
          <text class="status-desc">{{ statusDesc }}</text>
        </view>

        <!-- Order Info Section -->
        <view class="info-section card">
          <text class="section-title">订单信息</text>
          <view class="info-row">
            <text class="info-label">订单编号</text>
            <view class="info-value-row">
              <text class="info-value">{{ order.orderNo || order.id }}</text>
              <text class="copy-btn" @click="copyOrderNo">复制</text>
            </view>
          </view>
          <view class="info-row">
            <text class="info-label">创建时间</text>
            <text class="info-value">{{ formatTime(order.createTime) }}</text>
          </view>
          <view v-if="order.payTime" class="info-row">
            <text class="info-label">支付时间</text>
            <text class="info-value">{{ formatTime(order.payTime) }}</text>
          </view>
          <view v-if="order.verifyTime" class="info-row">
            <text class="info-label">核销时间</text>
            <text class="info-value">{{ formatTime(order.verifyTime) }}</text>
          </view>
          <view v-if="order.refundTime" class="info-row">
            <text class="info-label">退款时间</text>
            <text class="info-value">{{ formatTime(order.refundTime) }}</text>
          </view>
        </view>

        <!-- Product Info Card -->
        <view class="product-card card">
          <text class="section-title">商品信息</text>
          <view class="product-body" @click="goProduct">
            <image
              :src="resolveAssetUrl(order.productImage) || '/static/default-product.png'"
              class="product-image"
              mode="aspectFill"
            />
            <view class="product-info">
              <text class="product-name">{{ order.productName || '商品名称' }}</text>
              <text class="product-merchant">{{ order.merchantName || '商家名称' }}</text>
            </view>
          </view>
        </view>

        <!-- Price Breakdown -->
        <view class="price-card card">
          <text class="section-title">价格明细</text>
          <view class="price-row">
            <text class="price-label">商品原价</text>
            <text class="price-value">¥{{ order.originalAmount || order.amount || 0 }}</text>
          </view>
          <view v-if="order.couponDiscount" class="price-row">
            <text class="price-label">优惠券</text>
            <text class="price-value discount">-¥{{ order.couponDiscount }}</text>
          </view>
          <view v-if="order.groupDiscount" class="price-row">
            <text class="price-label">团购优惠</text>
            <text class="price-value discount">-¥{{ order.groupDiscount }}</text>
          </view>
          <view class="price-row price-total">
            <text class="price-label">实付金额</text>
            <text class="price-value total-value">¥{{ order.paidAmount || order.amount || 0 }}</text>
          </view>
        </view>

        <!-- Verification QR Code (paid but not verified) -->
        <view v-if="needsVerification" class="qr-section card">
          <text class="section-title">核销码</text>
          <view class="qr-code-area">
            <!-- QR Code placeholder (would use actual QR generation library) -->
            <view class="qr-placeholder">
              <view class="qr-grid">
                <view v-for="i in 25" :key="i" class="qr-cell" :class="{ filled: (i % 3 !== 0) && (i % 5 !== 0) }"></view>
              </view>
              <text class="qr-hint">到店出示此码核销</text>
            </view>
          </view>
          <view class="verification-code-row">
            <text class="verification-label">验证码</text>
            <text class="verification-code">{{ order.verificationCode || '------' }}</text>
            <text class="copy-code-btn" @click="copyCode">复制</text>
          </view>
        </view>

        <!-- Already Verified -->
        <view v-if="order.status === 'verified' || order.status === 'used'" class="verified-section card">
          <view class="verified-icon-row">
            <text class="verified-icon">✓</text>
          </view>
          <text class="verified-text">已核销</text>
          <text class="verified-time" v-if="order.verifyTime">核销时间: {{ formatTime(order.verifyTime) }}</text>
          <text class="verified-location" v-if="order.verifyLocation">
            核销地点: {{ order.verifyLocation }}
          </text>
        </view>

        <!-- Merchant Info -->
        <view class="merchant-card card">
          <text class="section-title">商家信息</text>
          <view class="merchant-body">
            <image
              :src="resolveAssetUrl(order.merchantLogo) || '/static/default-merchant.png'"
              class="merchant-logo"
              mode="aspectFill"
            />
            <view class="merchant-info">
              <text class="merchant-name">{{ order.merchantName || '商家名称' }}</text>
              <view class="merchant-actions">
                <view class="merchant-action-item" @click="callMerchant">
                  <text class="action-icon">📞</text>
                  <text class="action-text">电话</text>
                </view>
                <view class="merchant-action-item" @click="navigateToMerchant">
                  <text class="action-icon">📍</text>
                  <text class="action-text">导航</text>
                </view>
              </view>
              <text class="merchant-addr">{{ order.merchantAddress || '暂无地址信息' }}</text>
            </view>
          </view>
        </view>

        <!-- Bottom Placeholder -->
        <view class="detail-bottom"></view>
      </template>
    </scroll-view>

    <!-- Bottom Action Bar -->
    <view v-if="!loading && order" class="bottom-bar safe-area-bottom">
      <template v-if="order.status === 'pending' || order.status === 'unpaid'">
        <view class="bottom-btn bottom-cancel" @click="handleCancel">
          <text>取消订单</text>
        </view>
        <view class="bottom-btn bottom-pay" @click="handlePay">
          <text>立即支付 ¥{{ order.paidAmount || order.amount || 0 }}</text>
        </view>
      </template>

      <template v-if="order.status === 'paid' || order.status === 'unverified'">
        <view class="bottom-btn bottom-cancel" @click="handleRefund">
          <text>申请退款</text>
        </view>
        <view class="bottom-btn bottom-pay" @click="goMerchant">
          <text>导航到店</text>
        </view>
      </template>

      <template v-if="order.status === 'verified' || order.status === 'used'">
        <view class="bottom-btn-full bottom-outline" @click="goMerchant">
          <text>查看商家</text>
        </view>
      </template>

      <template v-if="order.status === 'refunded' || order.status === 'cancelled'">
        <view class="bottom-btn-full bottom-outline" @click="goProduct">
          <text>再次购买</text>
        </view>
      </template>
    </view>
  </view>
</template>

<script>
import { order, resolveAssetUrl as resolveAsset } from '@/utils/api.js';
import { normalizeOrder } from '@/utils/order.js';

export default {
  data() {
    return {
      orderId: '',
      order: null,
      loading: true
    };
  },

  computed: {
    orderStatus() {
      if (!this.order) return '';
      return this.order.status || '';
    },

    statusIcon() {
      const icons = {
        pending: '⏳',
        unpaid: '⏳',
        paid: '✅',
        unverified: '📋',
        verified: '✅',
        used: '✅',
        refunded: '↩️',
        cancelled: '❌'
      };
      return icons[this.orderStatus] || '📦';
    },

    statusTitle() {
      const titles = {
        pending: '待支付',
        unpaid: '待支付',
        paid: '已支付',
        unverified: '待核销',
        verified: '已核销',
        used: '已核销',
        refunded: '已退款',
        cancelled: '已取消'
      };
      return titles[this.orderStatus] || '订单';
    },

    statusDesc() {
      const descs = {
        pending: '请在有效期内完成支付',
        unpaid: '请在有效期内完成支付',
        paid: '到店出示核销码即可使用',
        unverified: '到店出示核销码即可使用',
        verified: '感谢您的惠顾',
        used: '感谢您的惠顾',
        refunded: '退款已返回原支付方式',
        cancelled: '订单已取消'
      };
      return descs[this.orderStatus] || '';
    },

    needsVerification() {
      return this.order && (
        this.order.status === 'paid' ||
        this.order.status === 'unverified'
      );
    }
  },

  onLoad(options) {
    this.orderId = options.id || '';
    if (this.orderId) {
      this.loadDetail();
    }
    // If navigated with action=pay, trigger payment directly
    if (options.action === 'pay') {
      this.pendingPay = true;
    }
  },

  methods: {
    /** 解析相对资源路径为绝对 URL(小程序必需) */
    resolveAssetUrl(url) {
      return resolveAsset(url);
    },

    /** Load order detail */
    async loadDetail() {
      this.loading = true;
      try {
        this.order = normalizeOrder(await order.getOrderDetail(this.orderId));

        // If needs verification code
        if (this.needsVerification) {
          try {
            const codeData = await order.getVerificationCode(this.orderId);
            this.order.verificationCode = codeData.code || codeData.verificationCode || '';
          } catch (e) {
            // Code might not be available yet
          }
        }

        // Auto-trigger payment if requested
        if (this.pendingPay && this.order) {
          this.pendingPay = false;
          setTimeout(() => {
            this.handlePay();
          }, 500);
        }
      } catch (err) {
        console.error('Failed to load order detail:', err);
        uni.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },

    /** Handle payment */
    async handlePay() {
      uni.showLoading({ title: '支付中...' });
      try {
        const result = await order.payOrder(this.orderId);

        // 沙箱/模拟支付:后端已直接完成支付,无需拉起微信
        if (result.sandbox || result.status_code === 2 || result.status === 'paid') {
          uni.showToast({ title: '支付成功', icon: 'success' });
          this.order.status = 'paid';
          this.loadDetail();
          return;
        }

        // Uni-App payment flow
        const payParams = result.pay_params || result.payParams;
        if (payParams) {
          uni.requestPayment({
            provider: 'wxpay',
            timeStamp: payParams.timeStamp,
            nonceStr: payParams.nonceStr,
            package: payParams.package,
            signType: payParams.signType || 'MD5',
            paySign: payParams.paySign,
            success: () => {
              uni.showToast({ title: '支付成功', icon: 'success' });
              this.order.status = 'paid';
              this.loadDetail();
            },
            fail: (err) => {
              uni.showToast({ title: '支付取消或失败', icon: 'none' });
            }
          });
        } else {
          // A missing signed payload is an integration error, not a payment.
          uni.showToast({ title: '支付服务暂不可用，请稍后重试', icon: 'none' });
        }
      } catch (err) {
        uni.showToast({ title: '支付失败', icon: 'none' });
      } finally {
        uni.hideLoading();
      }
    },

    /** Handle cancel */
    handleCancel() {
      uni.showModal({
        title: '取消订单',
        content: '确定要取消该订单吗？',
        confirmText: '确定',
        confirmColor: '#E74C3C',
        success: async (res) => {
          if (res.confirm) {
            try {
              await order.refundOrder(this.orderId);
              uni.showToast({ title: '订单已取消', icon: 'success' });
              this.order.status = 'cancelled';
              this.loadDetail();
            } catch (err) {
              uni.showToast({ title: '取消失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** Handle refund */
    handleRefund() {
      uni.showModal({
        title: '申请退款',
        content: '退款将退回原支付方式，确定要申请退款吗？',
        confirmText: '确认退款',
        confirmColor: '#E74C3C',
        success: async (res) => {
          if (res.confirm) {
            uni.showLoading({ title: '处理中...' });
            try {
              await order.refundOrder(this.orderId);
              uni.hideLoading();
              uni.showToast({ title: '退款申请已提交', icon: 'success' });
              this.loadDetail();
            } catch (err) {
              uni.hideLoading();
              uni.showToast({ title: '申请失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** Copy order number */
    copyOrderNo() {
      const no = this.order.orderNo || this.order.id || '';
      uni.setClipboardData({
        data: no,
        success: () => {
          uni.showToast({ title: '已复制', icon: 'none' });
        }
      });
    },

    /** Copy verification code */
    copyCode() {
      const code = this.order.verificationCode || '';
      if (!code) return;
      uni.setClipboardData({
        data: code,
        success: () => {
          uni.showToast({ title: '验证码已复制', icon: 'none' });
        }
      });
    },

    /** Call merchant */
    callMerchant() {
      const phone = this.order.merchantPhone || '';
      if (!phone) {
        uni.showToast({ title: '暂无联系电话', icon: 'none' });
        return;
      }
      uni.makePhoneCall({ phoneNumber: phone });
    },

    /** Navigate to merchant */
    navigateToMerchant() {
      const address = this.order.merchantAddress || '';
      if (this.order.merchantLng && this.order.merchantLat) {
        uni.openLocation({
          latitude: this.order.merchantLat,
          longitude: this.order.merchantLng,
          name: this.order.merchantName || '商家',
          address: address
        });
      } else if (address) {
        uni.openLocation({
          latitude: 0,
          longitude: 0,
          name: this.order.merchantName || '商家',
          address: address
        });
      } else {
        uni.showToast({ title: '暂无位置信息', icon: 'none' });
      }
    },

    /** Go to merchant page */
    goMerchant() {
      if (this.order && this.order.merchantId) {
        uni.navigateTo({
          url: '/pages/merchant/detail?id=' + this.order.merchantId
        });
      }
    },

    /** Go to product page */
    goProduct() {
      if (this.order && this.order.productId) {
        uni.navigateTo({
          url: '/pages/group-buy/detail?id=' + this.order.productId
        });
      }
    },

    /** Format time */
    formatTime(timeStr) {
      if (!timeStr) return '--';
      const date = new Date(timeStr);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
    }
  }
};
</script>

<style lang="scss" scoped>
.detail-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F5F5F5;
}

.detail-scroll {
  flex: 1;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: 28rpx;
  color: #999;
}

// ===== Status Header =====
.status-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48rpx 24rpx 40rpx;

  &.status-bg-pending,
  &.status-bg-unpaid {
    background: linear-gradient(135deg, #f5a623, #ff8c00);
  }

  &.status-bg-paid,
  &.status-bg-unverified {
    background: linear-gradient(135deg, #07C160, #4cd964);
  }

  &.status-bg-verified,
  &.status-bg-used {
    background: linear-gradient(135deg, #4A90D9, #5ba0e8);
  }

  &.status-bg-refunded,
  &.status-bg-cancelled {
    background: linear-gradient(135deg, #bbb, #999);
  }
}

.status-icon-wrap {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16rpx;
}

.status-icon {
  font-size: 48rpx;
}

.status-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #FFFFFF;
  margin-bottom: 8rpx;
}

.status-desc {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.85);
}

// ===== Info Sections =====
.info-section,
.product-card,
.price-card,
.qr-section,
.verified-section,
.merchant-card {
  margin: 16rpx 24rpx;
  background-color: #FFFFFF;
  border-radius: 20rpx;
  padding: 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1A1A1A;
  display: block;
  margin-bottom: 20rpx;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #F5F5F5;

  &:last-child {
    border-bottom: none;
  }
}

.info-label {
  font-size: 26rpx;
  color: #999;
}

.info-value {
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
}

.info-value-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.copy-btn {
  font-size: 22rpx;
  color: #4A90D9;
  padding: 4rpx 12rpx;
  background-color: rgba(74, 144, 217, 0.06);
  border-radius: 12rpx;
}

// ===== Product Card =====
.product-body {
  display: flex;
  gap: 16rpx;
}

.product-image {
  width: 140rpx;
  height: 140rpx;
  border-radius: 12rpx;
  background-color: #F5F5F5;
  flex-shrink: 0;
}

.product-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;

  .product-name {
    font-size: 28rpx;
    font-weight: 500;
    color: #1A1A1A;
  }

  .product-merchant {
    font-size: 24rpx;
    color: #999;
  }
}

// ===== Price Card =====
.price-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #F5F5F5;

  &:last-child {
    border-bottom: none;
  }

  .price-label {
    font-size: 26rpx;
    color: #666;
  }

  .price-value {
    font-size: 26rpx;
    color: #333;
    font-weight: 500;

    &.discount {
      color: #07C160;
    }
  }

  &.price-total {
    padding-top: 16rpx;
    margin-top: 8rpx;
    border-top: 1rpx solid #F0F0F0;
    border-bottom: none;

    .price-label {
      font-weight: 600;
      color: #1A1A1A;
    }

    .total-value {
      font-size: 36rpx;
      font-weight: 800;
      color: #e74c3c;
    }
  }
}

// ===== QR Code Section =====
.qr-code-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24rpx;
}

.qr-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32rpx;
}

.qr-grid {
  display: grid;
  grid-template-columns: repeat(5, 28rpx);
  grid-template-rows: repeat(5, 28rpx);
  gap: 4rpx;
  background-color: #FFFFFF;
  padding: 16rpx;
  border: 4rpx solid #1A1A1A;
  border-radius: 12rpx;
  margin-bottom: 20rpx;
}

.qr-cell {
  width: 28rpx;
  height: 28rpx;
  border-radius: 4rpx;
  background-color: #FFFFFF;

  &.filled {
    background-color: #1A1A1A;
  }
}

.qr-hint {
  font-size: 24rpx;
  color: #999;
}

.verification-code-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  padding: 16rpx;
  background-color: #F9F9F9;
  border-radius: 12rpx;
}

.verification-label {
  font-size: 26rpx;
  color: #999;
}

.verification-code {
  font-size: 40rpx;
  font-weight: 800;
  color: #1A1A1A;
  letter-spacing: 8rpx;
  font-family: 'Courier New', monospace;
}

.copy-code-btn {
  font-size: 24rpx;
  color: #4A90D9;
  padding: 6rpx 16rpx;
  background-color: rgba(74, 144, 217, 0.06);
  border-radius: 12rpx;
}

// ===== Verified Section =====
.verified-section {
  text-align: center;
}

.verified-icon-row {
  margin-bottom: 12rpx;
}

.verified-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background-color: #07C160;
  color: #FFFFFF;
  font-size: 36rpx;
  font-weight: 700;
}

.verified-text {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #07C160;
  margin-bottom: 8rpx;
}

.verified-time,
.verified-location {
  display: block;
  font-size: 24rpx;
  color: #999;
  margin-bottom: 4rpx;
}

// ===== Merchant Card =====
.merchant-body {
  display: flex;
  gap: 16rpx;
}

.merchant-logo {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background-color: #F0F0F0;
  flex-shrink: 0;
}

.merchant-info {
  flex: 1;
  min-width: 0;

  .merchant-name {
    font-size: 28rpx;
    font-weight: 600;
    color: #333;
    display: block;
    margin-bottom: 8rpx;
  }
}

.merchant-actions {
  display: flex;
  gap: 24rpx;
  margin-bottom: 8rpx;
}

.merchant-action-item {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 6rpx 14rpx;
  background-color: #F5F5F5;
  border-radius: 16rpx;

  .action-icon {
    font-size: 24rpx;
  }

  .action-text {
    font-size: 24rpx;
    color: #666;
  }
}

.merchant-addr {
  font-size: 24rpx;
  color: #999;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// ===== Bottom Bar =====
.detail-bottom {
  height: 140rpx;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  background-color: #FFFFFF;
  border-top: 1rpx solid #F0F0F0;
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.04);
  gap: 16rpx;
}

.bottom-btn {
  flex: 1;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 44rpx;
  font-size: 28rpx;
  font-weight: 600;
  transition: opacity 0.15s;

  &:active {
    opacity: 0.85;
  }

  &.bottom-cancel {
    background-color: #F5F5F5;
    color: #666;
    border: 1rpx solid #E0E0E0;
    flex: 0.4;
  }

  &.bottom-pay {
    flex: 0.6;
    background: linear-gradient(135deg, #e74c3c, #ff6b35);
    color: #FFFFFF;
    box-shadow: 0 4rpx 16rpx rgba(231, 76, 60, 0.3);
  }
}

.bottom-btn-full {
  flex: 1;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 44rpx;
  font-size: 28rpx;
  font-weight: 600;
  transition: opacity 0.15s;

  &:active {
    opacity: 0.85;
  }

  &.bottom-outline {
    background-color: #FFFFFF;
    color: #e74c3c;
    border: 2rpx solid #e74c3c;
  }
}
</style>
