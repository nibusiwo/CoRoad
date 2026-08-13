<template>
  <view class="order-page">
    <!-- Tab Filter -->
    <view class="tab-bar">
      <scroll-view class="tab-scroll" scroll-x :show-scrollbar="false">
        <view class="tab-list">
          <view
            v-for="tab in tabs"
            :key="tab.value"
            class="tab-item"
            :class="{ active: activeTab === tab.value }"
            @click="onTabChange(tab.value)"
          >
            <text>{{ tab.label }}</text>
            <view v-if="activeTab === tab.value" class="tab-indicator"></view>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- Order List -->
    <scroll-view
      class="order-list"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      :refresher-threshold="80"
      @refresherrefresh="onRefresh"
    >
      <!-- Loading -->
      <view v-if="loading && orders.length === 0" class="loading-state">
        <text>加载中...</text>
      </view>

      <!-- Empty State -->
      <view v-else-if="!loading && orders.length === 0" class="empty-state">
        <text class="empty-icon">📦</text>
        <text class="empty-text">暂无订单</text>
        <text class="empty-hint">去看看团购优惠吧</text>
        <view class="empty-btn" @click="goGroupBuy">
          <text>去团购</text>
        </view>
      </view>

      <!-- Order Cards -->
      <view
        v-for="order in orders"
        :key="order.id"
        class="order-card"
      >
        <!-- Card Header: Order Number -->
        <view class="card-header">
          <text class="order-number">订单号: {{ order.orderNo || order.id }}</text>
          <text class="order-status" :class="'status-' + order.status">{{ statusLabel(order.status) }}</text>
        </view>

        <!-- Card Body -->
        <view class="card-body" @click="goDetail(order)">
          <image
            :src="order.productImage || '/static/default-product.png'"
            class="product-thumb"
            mode="aspectFill"
          />
          <view class="order-info">
            <text class="merchant-name">{{ order.merchantName || '商家' }}</text>
            <text class="product-name">{{ order.productName || '商品名称' }}</text>
            <view class="order-time">
              <text>{{ formatTime(order.createTime) }}</text>
            </view>
          </view>
        </view>

        <!-- Card Footer: Amount + Actions -->
        <view class="card-footer">
          <view class="amount-row">
            <text class="amount-label">实付</text>
            <text class="amount-value">¥{{ order.paidAmount || order.amount || 0 }}</text>
            <text v-if="order.originalAmount && order.originalAmount !== order.paidAmount" class="amount-original">¥{{ order.originalAmount }}</text>
          </view>

          <!-- Action Buttons based on status -->
          <view class="action-buttons">
            <!-- 待支付 -->
            <template v-if="order.status === 'pending' || order.status === 'unpaid'">
              <view class="action-btn btn-secondary" @click="cancelOrder(order)">
                <text>取消</text>
              </view>
              <view class="action-btn btn-primary" @click="goPay(order)">
                <text>去支付</text>
              </view>
            </template>

            <!-- 已支付（未核销） -->
            <template v-if="order.status === 'paid' || order.status === 'unverified'">
              <view class="action-btn btn-secondary" @click="requestRefund(order)">
                <text>申请退款</text>
              </view>
              <view class="action-btn btn-primary" @click="goDetail(order)">
                <text>查看核销码</text>
              </view>
            </template>

            <!-- 已核销 -->
            <template v-if="order.status === 'verified' || order.status === 'used'">
              <view class="action-btn btn-outline" @click="goDetail(order)">
                <text>查看详情</text>
              </view>
            </template>

            <!-- 已退款 -->
            <template v-if="order.status === 'refunded' || order.status === 'cancelled'">
              <view class="action-btn btn-outline" @click="goDetail(order)">
                <text>查看详情</text>
              </view>
            </template>
          </view>
        </view>
      </view>

      <!-- Bottom Placeholder -->
      <view class="bottom-placeholder safe-area-bottom"></view>
    </scroll-view>
  </view>
</template>

<script>
import { order } from '@/utils/api.js';
import { normalizeOrderList } from '@/utils/order.js';

export default {
  data() {
    return {
      // Tabs
      tabs: [
        { label: '全部', value: 'all' },
        { label: '待支付', value: 'pending' },
        { label: '已支付', value: 'paid' },
        { label: '已核销', value: 'verified' },
        { label: '已退款', value: 'refunded' }
      ],
      activeTab: 'all',

      // Orders
      orders: [],
      loading: false,
      refreshing: false
    };
  },

  onShow() {
    this.fetchOrders();
  },

  methods: {
    /** Fetch orders */
    async fetchOrders() {
      this.loading = true;
      try {
        const params = {};
        if (this.activeTab !== 'all') {
          params.status = this.activeTab;
        }
        const res = await order.getOrders(params);
        this.orders = normalizeOrderList(res);
      } catch (err) {
        console.error('Failed to fetch orders:', err);
        this.orders = [];
      } finally {
        this.loading = false;
        this.refreshing = false;
      }
    },

    /** Tab change */
    onTabChange(value) {
      if (this.activeTab === value) return;
      this.activeTab = value;
      this.orders = [];
      this.fetchOrders();
    },

    /** Pull-down refresh */
    async onRefresh() {
      this.refreshing = true;
      await this.fetchOrders();
    },

    /** Navigate to order detail */
    goDetail(order) {
      uni.navigateTo({
        url: '/pages/order/detail?id=' + order.id
      });
    },

    /** Go to payment */
    goPay(order) {
      uni.navigateTo({
        url: '/pages/order/detail?id=' + order.id + '&action=pay'
      });
    },

    /** Cancel order */
    cancelOrder(order) {
      uni.showModal({
        title: '取消订单',
        content: '确定要取消该订单吗？',
        confirmText: '确定取消',
        confirmColor: '#E74C3C',
        success: async (res) => {
          if (res.confirm) {
            try {
              // Call refund API to cancel (same endpoint since unpaid)
              await order.refundOrder(order.id);
              uni.showToast({ title: '订单已取消', icon: 'success' });
              this.fetchOrders();
            } catch (err) {
              uni.showToast({ title: '取消失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** Request refund */
    requestRefund(order) {
      uni.showModal({
        title: '申请退款',
        content: '确定要申请退款吗？退款将退回原支付方式。',
        confirmText: '确认退款',
        confirmColor: '#E74C3C',
        success: async (res) => {
          if (res.confirm) {
            try {
              await order.refundOrder(order.id);
              uni.showToast({ title: '退款申请已提交', icon: 'success' });
              this.fetchOrders();
            } catch (err) {
              uni.showToast({ title: '申请失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** Go to group buy */
    goGroupBuy() {
      uni.navigateTo({
        url: '/pages/group-buy/index'
      });
    },

    /** Status label */
    statusLabel(status) {
      const map = {
        pending: '待支付',
        unpaid: '待支付',
        paid: '已支付',
        unverified: '待核销',
        verified: '已核销',
        used: '已核销',
        refunded: '已退款',
        cancelled: '已取消'
      };
      return map[status] || status;
    },

    /** Format time */
    formatTime(timeStr) {
      if (!timeStr) return '--';
      const date = new Date(timeStr);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return month + '/' + day + ' ' + hours + ':' + minutes;
    }
  }
};
</script>

<style lang="scss" scoped>
.order-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F5F5F5;
}

// ===== Tab Bar =====
.tab-bar {
  background-color: #FFFFFF;
  border-bottom: 1rpx solid #F0F0F0;
}

.tab-scroll {
  white-space: nowrap;
}

.tab-list {
  display: inline-flex;
  padding: 0 12rpx;
}

.tab-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 24rpx 28rpx;
  position: relative;
  flex-shrink: 0;

  text {
    font-size: 28rpx;
    color: #666;
  }

  &.active {
    text {
      color: #e74c3c;
      font-weight: 600;
    }
  }
}

.tab-indicator {
  position: absolute;
  bottom: 0;
  width: 48rpx;
  height: 6rpx;
  background: linear-gradient(90deg, #e74c3c, #ff6b35);
  border-radius: 3rpx;
}

// ===== Order List =====
.order-list {
  flex: 1;
}

// Loading & Empty
.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: 28rpx;
  color: #999;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;

  .empty-icon {
    font-size: 80rpx;
    margin-bottom: 16rpx;
  }

  .empty-text {
    font-size: 30rpx;
    color: #666;
    margin-bottom: 8rpx;
  }

  .empty-hint {
    font-size: 24rpx;
    color: #bbb;
    margin-bottom: 24rpx;
  }

  .empty-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 240rpx;
    height: 72rpx;
    background: linear-gradient(135deg, #e74c3c, #ff6b35);
    border-radius: 36rpx;

    text {
      font-size: 28rpx;
      color: #FFFFFF;
      font-weight: 600;
    }
  }
}

// ===== Order Card =====
.order-card {
  margin: 16rpx 24rpx;
  background-color: #FFFFFF;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx 12rpx;
  border-bottom: 1rpx solid #F5F5F5;

  .order-number {
    font-size: 24rpx;
    color: #999;
  }

  .order-status {
    font-size: 24rpx;
    font-weight: 600;

    &.status-pending,
    &.status-unpaid {
      color: #f5a623;
    }

    &.status-paid,
    &.status-unverified {
      color: #07C160;
    }

    &.status-verified,
    &.status-used {
      color: #4A90D9;
    }

    &.status-refunded,
    &.status-cancelled {
      color: #bbb;
    }
  }
}

.card-body {
  display: flex;
  padding: 20rpx 24rpx;
  gap: 16rpx;

  .product-thumb {
    width: 140rpx;
    height: 140rpx;
    border-radius: 12rpx;
    background-color: #F5F5F5;
    flex-shrink: 0;
  }

  .order-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6rpx;

    .merchant-name {
      font-size: 24rpx;
      color: #999;
    }

    .product-name {
      font-size: 28rpx;
      font-weight: 500;
      color: #1A1A1A;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }

    .order-time {
      margin-top: auto;

      text {
        font-size: 22rpx;
        color: #bbb;
      }
    }
  }
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 24rpx 20rpx;
}

.amount-row {
  display: flex;
  align-items: baseline;
  gap: 8rpx;

  .amount-label {
    font-size: 24rpx;
    color: #999;
  }

  .amount-value {
    font-size: 32rpx;
    font-weight: 700;
    color: #1A1A1A;
  }

  .amount-original {
    font-size: 22rpx;
    color: #bbb;
    text-decoration: line-through;
  }
}

.action-buttons {
  display: flex;
  gap: 12rpx;
}

.action-btn {
  height: 56rpx;
  padding: 0 24rpx;
  border-radius: 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  transition: opacity 0.15s;

  &:active {
    opacity: 0.8;
  }

  &.btn-primary {
    background: linear-gradient(135deg, #e74c3c, #ff6b35);
    color: #FFFFFF;
    font-weight: 600;
  }

  &.btn-secondary {
    background-color: #F5F5F5;
    color: #666;
    border: 1rpx solid #E0E0E0;
  }

  &.btn-outline {
    background-color: transparent;
    color: #e74c3c;
    border: 1rpx solid #e74c3c;
  }
}

// ===== Bottom =====
.bottom-placeholder {
  height: 40rpx;
}
</style>
