<template>
  <view class="merchant-manage-page">
    <scroll-view class="page-scroll" scroll-y :refresher-enabled="true" :refresher-triggered="refreshing" @refresherrefresh="onRefresh">
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-if="!loading && merchant">
        <!-- ==================== Header ==================== -->
        <view class="header-section">
          <view class="header-bg">
                        <view class="header-cover">
              <local-image style="width:100%;height:100%;" v-if="merchant.coverImage" :src="merchant.coverImage" mode="aspectFill"  />
              <view v-else class="header-cover-placeholder"></view>
            </view>
          </view>

          <view class="header-info">
    <view class="merchant-logo">
    <local-image style="width:100%;height:100%;" :src="resolveAssetUrl(merchant.logo) || '/static/default-merchant.png'" mode="aspectFill"  />
  </view>
            <view class="merchant-detail">
              <view class="name-row">
                <text class="merchant-name">{{ merchant.name }}</text>
                <view class="level-badge" v-if="merchant.level">
                  <text>{{ merchant.level }}</text>
                </view>
              </view>
              <view class="rating-row">
                <text v-for="i in 5" :key="i" class="star" :class="{ filled: i <= (merchant.rating || 0) }">★</text>
                <text class="rating-text">{{ merchant.rating || '--' }}分</text>
              </view>
              <text class="merchant-type">{{ merchant.type || '商家' }}</text>
            </view>
          </view>
        </view>

        <!-- ==================== Stats Cards ==================== -->
        <view class="stats-section">
          <view class="stat-card" v-for="stat in statsList" :key="stat.key">
            <text class="stat-value">{{ stat.value }}</text>
            <text class="stat-label">{{ stat.label }}</text>
          </view>
        </view>

        <!-- ==================== Quick Actions ==================== -->
        <view class="quick-actions">
          <view class="section-title-row">
            <text class="section-title">快捷功能</text>
            <view class="notification-bell" @click="goNotifications">
              <text class="bell-icon">🔔</text>
              <view v-if="stats.unreadCount" class="unread-badge">
                <text>{{ stats.unreadCount > 99 ? '99+' : stats.unreadCount }}</text>
              </view>
            </view>
          </view>

          <view class="action-grid">
            <view class="action-item" v-for="action in quickActions" :key="action.key" @click="navigateTo(action.path)">
              <view class="action-icon-wrap" :style="{ backgroundColor: action.bgColor }">
                <u-icon :name="action.iconName" size="34" color="#FFFFFF" />
              </view>
              <text class="action-name">{{ action.label }}</text>
            </view>
          </view>
        </view>

        <!-- ==================== Recent Orders ==================== -->
        <view class="orders-section card">
          <view class="section-header">
            <text class="section-title">近期订单</text>
            <text class="section-more" @click="navigateTo('/pages/merchant/orders')">全部 ›</text>
          </view>

          <view v-if="recentOrders.length === 0" class="empty-row">
            <text>暂无订单</text>
          </view>

          <view v-for="order in recentOrders" :key="order.id" class="order-item" @click="goOrderDetail(order)">
    <view class="order-img">
    <local-image style="width:100%;height:100%;" :src="resolveAssetUrl(order.productImage) || '/static/default-product.png'" mode="aspectFill"  />
  </view>
            <view class="order-info">
              <text class="order-product">{{ order.productName }}</text>
              <text class="order-user">{{ order.userNickname }}</text>
              <text class="order-time">{{ formatTime(order.createTime) }}</text>
            </view>
            <view class="order-right">
              <text class="order-amount">¥{{ order.paidAmount || order.amount || 0 }}</text>
              <view class="order-status-tag" :class="'status-' + order.status">
                <text>{{ statusLabel(order.status) }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- ==================== Active Group Buy Products ==================== -->
        <view v-if="activeProducts.length" class="products-section card">
          <view class="section-header">
            <text class="section-title">在售团购</text>
            <text class="section-more" @click="navigateTo('/pages/merchant/products')">管理 ›</text>
          </view>

          <view v-for="product in activeProducts" :key="product.id" class="product-item">
    <view class="product-img">
    <local-image style="width:100%;height:100%;" :src="resolveAssetUrl(product.image) || '/static/default-product.png'" mode="aspectFill"  />
  </view>
            <view class="product-info">
              <text class="product-name">{{ product.name }}</text>
              <view class="product-tiers" v-if="product.tiers && product.tiers.length">
                <text v-for="tier in product.tiers" :key="tier.minCount" class="tier-tag">
                  {{ tier.minCount }}人团 ¥{{ tier.price }}
                </text>
              </view>
              <view class="product-meta">
                <text class="product-sales">已售{{ product.sales || 0 }}份</text>
                <view class="product-status" :class="{ active: product.status === 'on' }">
                  <text>{{ product.status === 'on' ? '上架中' : '已下架' }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view class="bottom-placeholder safe-area-bottom"></view>
      </template>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import api, { resolveAssetUrl as resolveAsset } from '@/utils/api.js';

// 小程序模板只能访问组件内定义的绑定,包一层让模板可用
function resolveAssetUrl(url) {
  return resolveAsset(url);
}

// ---- State ----
const loading = ref(true);
const refreshing = ref(false);
const merchant = ref(null);
const stats = reactive({
  todayOrders: 0,
  todayRevenue: 0,
  totalSales: 0,
  pendingVerify: 0,
  unreadCount: 0
});
const recentOrders = ref([]);
const activeProducts = ref([]);

// ---- Computed ----
const statsList = computed(() => [
  { key: 'todayOrders', label: '今日订单数', value: stats.todayOrders },
  { key: 'todayRevenue', label: '今日收入', value: '¥' + (stats.todayRevenue || 0) },
  { key: 'totalSales', label: '累计销量', value: stats.totalSales },
  { key: 'pendingVerify', label: '待核销数', value: stats.pendingVerify }
]);

const quickActions = [
  { key: 'products', label: '商品管理', iconName: 'bag', path: '/pages/merchant/products', bgColor: '#4A90D9' },
  { key: 'orders', label: '订单管理', iconName: 'order', path: '/pages/merchant/orders', bgColor: '#E74C3C' },
  { key: 'verify', label: '核销扫码', iconName: 'scan', path: '/pages/merchant/orders?scan=1', bgColor: '#07C160' },
  { key: 'settlement', label: '结算记录', iconName: 'rmb-circle', path: '/pages/merchant/settlement', bgColor: '#FF8F00' },
  { key: 'review', label: '考核中心', iconName: 'star', path: '/pages/merchant/review', bgColor: '#9B59B6' },
  { key: 'service', label: '维修救援', iconName: 'car', path: '/pages/merchant/service', bgColor: '#2ECC71' },
  { key: 'promotion', label: '推广码', iconName: 'gift', path: '/pages/merchant/promotion', bgColor: '#FF6B35' }
];

// ---- Methods ----
function formatTime(timeStr) {
  if (!timeStr) return '--';
  const d = new Date(timeStr);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return m + '/' + day + ' ' + h + ':' + min;
}

function statusLabel(status) {
  const map = { pending: '待支付', unpaid: '待支付', paid: '已支付', unverified: '待核销', verified: '已核销', refunded: '已退款', cancelled: '已取消' };
  return map[status] || status;
}

function navigateTo(path) {
  uni.navigateTo({ url: path });
}

function goOrderDetail(order) {
  uni.navigateTo({ url: '/pages/merchant/orders?orderId=' + order.id });
}

function goNotifications() {
  uni.navigateTo({ url: '/pages/notifications/index' });
}

async function fetchDashboard() {
  try {
    const res = await api.merchant.getMyMerchant();
    merchant.value = res.merchant || res;
    Object.assign(stats, {
      todayOrderCount: res.today_order_count || 0,
      todayRevenue: res.today_revenue || 0,
      productCount: res.product_count || 0,
      activeGroupBuyCount: res.active_group_buy_count || 0
    });
    // 商家站内通知未读数(新订单/核销/审核等)
    try {
      const notifyRes = await api.get('/support/notifications', { page: 1, page_size: 1 });
      stats.unreadCount = (notifyRes && notifyRes.pagination && notifyRes.pagination.total) || 0;
    } catch (e) {
      stats.unreadCount = 0;
    }
    recentOrders.value = [];
    activeProducts.value = [];
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

async function onRefresh() {
  refreshing.value = true;
  await fetchDashboard();
  refreshing.value = false;
}

// ---- Lifecycle ----
onShow(async () => {
  loading.value = true;
  await fetchDashboard();
  loading.value = false;
});
</script>

<style lang="scss" scoped>
.merchant-manage-page {
  height: 100vh;
  background-color: #F5F5F5;
  display: flex;
  flex-direction: column;
}

.page-scroll {
  flex: 1;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: 28rpx;
  color: #999;
}

// ===== Header =====
.header-section {
  position: relative;
}

.header-bg {
  .header-cover {
    width: 100%;
    height: 300rpx;
    background-color: #E0E0E0;
  }
  .header-cover-placeholder {
    width: 100%;
    height: 300rpx;
    background: linear-gradient(135deg, #FF6B35, #FF8C5A, #FFA87D);
  }
}

.header-info {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx;
  margin-top: -60rpx;
  position: relative;
  z-index: 2;
}

.merchant-logo {
  width: 120rpx;
  height: 120rpx;
  border-radius: 20rpx;
  border: 4rpx solid #FFFFFF;
  background-color: #F0F0F0;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
    overflow: hidden;
  }

.merchant-detail {
  flex: 1;
  min-width: 0;
  margin-top: 40rpx;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 6rpx;
}

.merchant-name {
  font-size: 34rpx;
  font-weight: 700;
  color: #FFFFFF;
  max-width: 280rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.2);
}

.level-badge {
  padding: 2rpx 12rpx;
  background: rgba(255, 215, 0, 0.2);
  border: 1rpx solid rgba(255, 215, 0, 0.4);
  border-radius: 12rpx;
  text {
    font-size: 20rpx;
    color: #FFD700;
    font-weight: 600;
  }
}

.rating-row {
  display: flex;
  align-items: center;
  gap: 4rpx;
  margin-bottom: 4rpx;
  .star {
    font-size: 22rpx;
    color: rgba(255, 255, 255, 0.35);
    &.filled { color: #FFD700; }
  }
  .rating-text {
    font-size: 22rpx;
    color: rgba(255, 255, 255, 0.8);
    margin-left: 4rpx;
  }
}

.merchant-type {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.7);
}

// ===== Stats =====
.stats-section {
  display: flex;
  margin: 20rpx 24rpx;
  gap: 12rpx;
}

.stat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24rpx 8rpx;
  background-color: #FFFFFF;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.stat-value {
  font-size: 32rpx;
  font-weight: 700;
  color: #1A1A1A;
  margin-bottom: 6rpx;
}

.stat-label {
  font-size: 20rpx;
  color: #999;
  white-space: nowrap;
}

// ===== Quick Actions =====
.quick-actions {
  margin: 0 24rpx 16rpx;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1A1A1A;
}

.notification-bell {
  position: relative;
  padding: 8rpx;
  .bell-icon { font-size: 40rpx; }
}

.unread-badge {
  position: absolute;
  top: 0;
  right: 0;
  min-width: 32rpx;
  height: 32rpx;
  background-color: #E74C3C;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6rpx;
  text {
    font-size: 18rpx;
    color: #FFFFFF;
    font-weight: 600;
  }
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
}

.action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28rpx 16rpx;
  background-color: #FFFFFF;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.03);
  &:active { opacity: 0.8; }
}

.action-icon-wrap {
  width: 80rpx;
  height: 80rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10rpx;
}

.action-icon {
  font-size: 40rpx;
}

.action-name {
  font-size: 24rpx;
  color: #333;
  font-weight: 500;
}

// ===== Card =====
.card {
  margin: 0 24rpx 16rpx;
  background-color: #FFFFFF;
  border-radius: 20rpx;
  padding: 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.section-more {
  font-size: 24rpx;
  color: #FF6B35;
}

// ===== Orders =====
.empty-row {
  text-align: center;
  padding: 32rpx 0;
  font-size: 24rpx;
  color: #bbb;
}

.order-item {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 16rpx 0;
  &:not(:last-child) { border-bottom: 1rpx solid #F5F5F5; }
  &:active { background-color: #FAFAFA; }
}

.order-img {
  width: 96rpx;
  height: 96rpx;
  border-radius: 12rpx;
  background-color: #F5F5F5;
  flex-shrink: 0;
    overflow: hidden;
  }

.order-info {
  flex: 1;
  min-width: 0;
  .order-product {
    font-size: 26rpx;
    font-weight: 500;
    color: #333;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 4rpx;
  }
  .order-user {
    font-size: 22rpx;
    color: #999;
    display: block;
    margin-bottom: 2rpx;
  }
  .order-time {
    font-size: 20rpx;
    color: #bbb;
  }
}

.order-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
  .order-amount {
    font-size: 28rpx;
    font-weight: 700;
    color: #1A1A1A;
  }
}

.order-status-tag {
  padding: 2rpx 12rpx;
  border-radius: 12rpx;
  text { font-size: 20rpx; }
  &.status-unverified { background-color: #FFF8EB; text { color: #F5A623; } }
  &.status-paid { background-color: #E8F8EE; text { color: #07C160; } }
  &.status-verified { background-color: #EBF5FF; text { color: #4A90D9; } }
  &.status-refunded { background-color: #F5F5F5; text { color: #bbb; } }
}

// ===== Products =====
.product-item {
  display: flex;
  gap: 14rpx;
  padding: 16rpx 0;
  &:not(:last-child) { border-bottom: 1rpx solid #F5F5F5; }
}

.product-img {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  background-color: #F5F5F5;
  flex-shrink: 0;
    overflow: hidden;
  }

.product-info {
  flex: 1;
  min-width: 0;
  .product-name {
    font-size: 26rpx;
    font-weight: 500;
    color: #333;
    display: block;
    margin-bottom: 8rpx;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.product-tiers {
  display: flex;
  flex-wrap: wrap;
  gap: 6rpx;
  margin-bottom: 8rpx;
  .tier-tag {
    padding: 2rpx 10rpx;
    background-color: rgba(255, 107, 53, 0.06);
    border-radius: 8rpx;
    font-size: 20rpx;
    color: #FF6B35;
  }
}

.product-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  .product-sales { font-size: 22rpx; color: #999; }
  .product-status {
    padding: 2rpx 10rpx;
    border-radius: 8rpx;
    background-color: #F5F5F5;
    text { font-size: 20rpx; color: #999; }
    &.active { background-color: #E8F8EE; text { color: #07C160; } }
  }
}

// ===== Bottom =====
.bottom-placeholder {
  height: 40rpx;
}
</style>
