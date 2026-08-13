<template>
  <view class="coupons-page">
    <!-- ==================== Total Savings Banner ==================== -->
    <view class="savings-banner">
      <view class="savings-inner">
        <text class="savings-icon">💰</text>
        <view class="savings-info">
          <text class="savings-label">累计节省</text>
          <text class="savings-value">¥{{ totalSavings }}</text>
        </view>
      </view>
    </view>

    <!-- ==================== Tab Filter ==================== -->
    <view class="tab-bar">
      <view
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ active: currentTab === tab.key }"
        @click="switchTab(tab.key)"
      >
        <text class="tab-text">{{ tab.label }}</text>
        <view v-if="currentTab === tab.key" class="tab-indicator"></view>
      </view>
    </view>

    <!-- ==================== Coupon List ==================== -->
    <scroll-view class="coupon-scroll" scroll-y>
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <!-- Coupon Cards -->
      <template v-if="!loading && couponList.length > 0">
        <view
          v-for="coupon in couponList"
          :key="coupon.id"
          class="coupon-card"
          :class="{
            'coupon-platform': coupon.type === 'platform',
            'coupon-merchant': coupon.type === 'merchant',
            'coupon-invite': coupon.type === 'invite',
            'coupon-expired': currentTab === 'expired',
            'coupon-used': currentTab === 'used'
          }"
          @click="handleCouponClick(coupon)"
        >
          <!-- Left: Face Value -->
          <view class="coupon-left">
            <view class="coupon-value-row">
              <text class="coupon-currency">¥</text>
              <text class="coupon-face-value">{{ coupon.faceValue }}</text>
            </view>
            <text class="coupon-condition">{{ coupon.condition || '无门槛' }}</text>
          </view>

          <!-- Divider -->
          <view class="coupon-divider">
            <view class="divider-circle top"></view>
            <view class="divider-dash"></view>
            <view class="divider-circle bottom"></view>
          </view>

          <!-- Right: Info -->
          <view class="coupon-right">
            <text class="coupon-name">{{ coupon.name }}</text>
            <text v-if="coupon.merchantName" class="coupon-merchant">
              {{ coupon.merchantName }}
            </text>
            <text class="coupon-expiry">有效期至 {{ coupon.expiryDate }}</text>

            <!-- Status Actions -->
            <view class="coupon-action">
              <!-- Available: Use Now -->
              <view
                v-if="currentTab === 'available'"
                class="action-btn use-btn"
                @click.stop="useCoupon(coupon)"
              >
                <text>立即使用</text>
              </view>
              <!-- Used: Tag -->
              <view v-else-if="currentTab === 'used'" class="action-tag used-tag">
                <text>✓ 已使用</text>
              </view>
              <!-- Expired: Tag -->
              <view v-else-if="currentTab === 'expired'" class="action-tag expired-tag">
                <text>已过期</text>
              </view>
            </view>
          </view>

          <!-- Expired Overlay -->
          <view v-if="currentTab === 'expired'" class="expired-overlay"></view>
          <view v-if="currentTab === 'used'" class="used-overlay"></view>
        </view>
      </template>

      <!-- Empty State -->
      <view v-if="!loading && couponList.length === 0" class="empty-state">
        <text class="empty-icon">{{ emptyIcon }}</text>
        <text class="empty-title">{{ emptyTitle }}</text>
        <text class="empty-desc">{{ emptyDesc }}</text>
      </view>

      <!-- Bottom Safe Area -->
      <view class="list-bottom"></view>
    </scroll-view>
  </view>
</template>

<script>
import { couponApi } from '@/utils/api.js';

export default {
  data() {
    return {
      currentTab: 'available',
      tabs: [
        { key: 'available', label: '可用' },
        { key: 'used', label: '已使用' },
        { key: 'expired', label: '已过期' }
      ],
      couponList: [],
      loading: false,
      totalSavings: 0
    };
  },

  computed: {
    emptyIcon() {
      const icons = {
        available: '🎫',
        used: '✅',
        expired: '⏰'
      };
      return icons[this.currentTab] || '🎫';
    },
    emptyTitle() {
      const titles = {
        available: '暂无可用优惠券',
        used: '暂无使用记录',
        expired: '暂无过期优惠券'
      };
      return titles[this.currentTab] || '暂无数据';
    },
    emptyDesc() {
      const descs = {
        available: '参与拼团活动可获得优惠券',
        used: '使用优惠券下单更优惠',
        expired: '优惠券过期后将自动清除'
      };
      return descs[this.currentTab] || '';
    }
  },

  onShow() {
    this.fetchCoupons();
  },

  methods: {
    /** Switch tab */
    switchTab(key) {
      if (this.currentTab === key) return;
      this.currentTab = key;
      this.fetchCoupons();
    },

    /** Fetch coupons by status */
    async fetchCoupons() {
      this.loading = true;
      try {
        const statusMap = {
          available: 'available',
          used: 'used',
          expired: 'expired'
        };
        const res = await couponApi.getMyCoupons(statusMap[this.currentTab]);
        this.couponList = res.records || res || [];
        this.totalSavings = res.totalSavings || this.calculateTotalSavings();
      } catch (err) {
        console.warn('Failed to load coupons:', err);
        this.couponList = [];
      } finally {
        this.loading = false;
      }
    },

    /** Calculate total savings from used coupons */
    calculateTotalSavings() {
      return this.couponList.reduce((sum, c) => sum + (c.faceValue || 0), 0);
    },

    /** Handle coupon card click */
    handleCouponClick(coupon) {
      if (this.currentTab === 'available') {
        this.useCoupon(coupon);
      }
    },

    /** Use coupon - navigate to applicable products */
    useCoupon(coupon) {
      if (coupon.type === 'merchant' && coupon.merchantId) {
        uni.navigateTo({
          url: '/pages/merchant/detail?merchantId=' + coupon.merchantId
        });
      } else {
        uni.navigateTo({
          url: '/pages/group-buy/index'
        });
        uni.showToast({ title: '正在跳转到可用商品', icon: 'none' });
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.coupons-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-bg);
}

// ==================== Savings Banner ====================
.savings-banner {
  margin: 20rpx 24rpx;
  padding: 28rpx 32rpx;
  background: linear-gradient(135deg, #FF6B35 0%, #FF8C5A 50%, #FFA87D 100%);
  border-radius: 20rpx;
  box-shadow: 0 6rpx 20rpx rgba(255, 107, 53, 0.25);
}

.savings-inner {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.savings-icon {
  font-size: 48rpx;
}

.savings-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.savings-label {
  font-size: var(--font-xs);
  color: rgba(255, 255, 255, 0.75);
}

.savings-value {
  font-size: 44rpx;
  font-weight: 800;
  color: #FFFFFF;
  line-height: 1.1;
}

// ==================== Tab Bar ====================
.tab-bar {
  display: flex;
  background-color: var(--color-bg-white);
  margin: 0 24rpx;
  border-radius: 16rpx;
  padding: 6rpx;
  box-shadow: var(--shadow-sm);
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 72rpx;
  position: relative;
  border-radius: 12rpx;
  transition: background 0.2s;

  &.active {
    background-color: rgba(7, 193, 96, 0.06);
  }

  .tab-text {
    font-size: var(--font-sm);
    color: var(--color-text-secondary);
    font-weight: 500;

    .active & {
      color: var(--color-primary);
      font-weight: 600;
    }
  }

  .tab-indicator {
    position: absolute;
    bottom: 4rpx;
    width: 40rpx;
    height: 4rpx;
    border-radius: 2rpx;
    background-color: var(--color-primary);
  }
}

// ==================== Scroll ====================
.coupon-scroll {
  flex: 1;
  padding: 20rpx 24rpx 0;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: var(--font-sm);
  color: var(--color-text-hint);
}

// ==================== Coupon Card ====================
.coupon-card {
  position: relative;
  display: flex;
  margin-bottom: 20rpx;
  border-radius: 16rpx;
  overflow: hidden;
  background-color: var(--color-bg-white);
  box-shadow: var(--shadow-sm);
  min-height: 160rpx;

  &.coupon-platform {
    .coupon-left {
      background: linear-gradient(160deg, #4A90D9 0%, #5BA0E9 50%, #6DB0F9 100%);
    }
    .coupon-face-value,
    .coupon-currency,
    .coupon-condition {
      color: #FFFFFF;
    }
    .action-btn.use-btn {
      background-color: #4A90D9;
      color: #FFFFFF;
    }
  }

  &.coupon-merchant {
    .coupon-left {
      background: linear-gradient(160deg, #FF6B35 0%, #FF8C5A 50%, #FFA87D 100%);
    }
    .coupon-face-value,
    .coupon-currency,
    .coupon-condition {
      color: #FFFFFF;
    }
    .action-btn.use-btn {
      background-color: #FF6B35;
      color: #FFFFFF;
    }
  }

  &.coupon-invite {
    .coupon-left {
      background: linear-gradient(160deg, #07C160 0%, #10D46A 50%, #20E67A 100%);
    }
    .coupon-face-value,
    .coupon-currency,
    .coupon-condition {
      color: #FFFFFF;
    }
    .action-btn.use-btn {
      background-color: var(--color-primary);
      color: #FFFFFF;
    }
  }
}

// Left: Face Value
.coupon-left {
  width: 180rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24rpx 16rpx;
  flex-shrink: 0;
}

.coupon-value-row {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
}

.coupon-currency {
  font-size: 28rpx;
  font-weight: 700;
}

.coupon-face-value {
  font-size: 56rpx;
  font-weight: 800;
  line-height: 1;
}

.coupon-condition {
  font-size: 20rpx;
  margin-top: 8rpx;
  opacity: 0.8;
}

// Divider
.coupon-divider {
  width: 2rpx;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  .divider-dash {
    width: 2rpx;
    flex: 1;
    background: repeating-linear-gradient(
      0deg,
      transparent 0,
      transparent 6rpx,
      #E0E0E0 6rpx,
      #E0E0E0 10rpx
    );
  }

  .divider-circle {
    width: 16rpx;
    height: 16rpx;
    border-radius: 50%;
    background-color: var(--color-bg);
    position: absolute;

    &.top {
      top: -8rpx;
    }

    &.bottom {
      bottom: -8rpx;
    }
  }
}

// Right: Info
.coupon-right {
  flex: 1;
  padding: 20rpx 20rpx 20rpx 24rpx;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.coupon-name {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 6rpx;
}

.coupon-merchant {
  font-size: var(--font-xs);
  color: var(--color-text-hint);
  margin-bottom: 4rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coupon-expiry {
  font-size: 20rpx;
  color: var(--color-text-hint);
  margin-bottom: 12rpx;
}

.coupon-action {
  margin-top: auto;
}

.action-btn {
  align-self: flex-end;
  padding: 8rpx 24rpx;
  border-radius: 28rpx;
  font-size: var(--font-xs);
  font-weight: 500;

  &.use-btn {
    &:active {
      opacity: 0.85;
    }
  }
}

.action-tag {
  align-self: flex-end;
  padding: 8rpx 20rpx;
  border-radius: 28rpx;
  font-size: 20rpx;
  font-weight: 500;

  &.used-tag {
    background-color: rgba(7, 193, 96, 0.08);
    color: var(--color-primary);
  }

  &.expired-tag {
    background-color: rgba(153, 153, 153, 0.1);
    color: var(--color-text-hint);
  }
}

// Overlays
.expired-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.55);
  pointer-events: none;
}

.used-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.35);
  pointer-events: none;
}

// ==================== Empty State ====================
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
}

.empty-icon {
  font-size: 80rpx;
  margin-bottom: 24rpx;
}

.empty-title {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  font-weight: 500;
  margin-bottom: 8rpx;
}

.empty-desc {
  font-size: var(--font-xs);
  color: var(--color-text-hint);
}

// ==================== Bottom ====================
.list-bottom {
  height: 40rpx;
}
</style>
