<template>
  <view class="orders-page">
    <!-- ==================== Top Bar ==================== -->
    <view class="top-bar">
      <text class="top-title">订单管理</text>
      <view class="scan-btn" @click="openScanner">
        <text class="scan-icon">📷</text>
        <text class="scan-text">扫码核销</text>
      </view>
    </view>

    <!-- ==================== Tab Filter ==================== -->
    <view class="tab-bar">
      <scroll-view class="tab-scroll" scroll-x :show-scrollbar="false">
        <view class="tab-list">
          <view
            v-for="tab in tabs"
            :key="tab.value"
            class="tab-item"
            :class="{ active: activeTab === tab.value }"
            @click="switchTab(tab.value)"
          >
            <text>{{ tab.label }}</text>
            <view v-if="activeTab === tab.value" class="tab-indicator"></view>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- ==================== Order List ==================== -->
    <scroll-view
      class="order-list"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
    >
      <!-- Loading -->
      <view v-if="loading && orders.length === 0" class="loading-state">
        <text>加载中...</text>
      </view>

      <!-- Empty -->
      <view v-else-if="!loading && orders.length === 0" class="empty-state-wrap">
        <EmptyState
          icon="📋"
          title="暂无订单"
          :description="activeTab === 'all' ? '还没有订单记录' : '该分类下暂无订单'"
        />
      </view>

      <!-- Order Cards -->
      <view v-for="order in orders" :key="order.id" class="order-card" @click="goDetail(order)">
        <view class="card-header">
          <text class="order-no">{{ order.orderNo || order.id }}</text>
          <text class="order-time">{{ formatTime(order.createTime) }}</text>
        </view>

        <view class="card-body">
                    <view class="product-thumb">
            <local-image style="width:100%;height:100%;"
            :src="resolveAssetUrl(order.productImage) || '/static/default-product.png'"
           
            mode="aspectFill"
           />
          </view>
          <view class="order-info">
            <text class="product-name">{{ order.productName || '商品名称' }}</text>
            <view class="user-row">
                            <view class="user-avatar">
                <local-image style="width:100%;height:100%;"
            :src="resolveAssetUrl(order.userAvatar) || '/static/default-avatar.png'"
               
                mode="aspectFill"
               />
              </view>
              <text class="user-nickname">{{ order.userNickname || '用户' }}</text>
            </view>
            <view class="amount-row">
              <text class="amount-label">实付</text>
              <text class="amount-value">¥{{ order.paidAmount || order.amount || 0 }}</text>
              <text v-if="order.refunded" class="refund-tag">已退</text>
            </view>
          </view>
        </view>

        <view class="card-footer">
          <view class="status-badge" :class="'status-' + order.status">
            <text>{{ statusLabel(order.status) }}</text>
          </view>
          <view v-if="order.status === 'paid' || order.status === 'unverified'" class="verify-btn" @click.stop="verifyOrder(order)">
            <text>核销</text>
          </view>
        </view>
      </view>

      <view class="bottom-placeholder safe-area-bottom"></view>
    </scroll-view>

    <!-- ==================== Order Detail Popup ==================== -->
    <view v-if="detailVisible && currentOrder" class="detail-overlay" @click.self="detailVisible = false">
      <view class="detail-popup">
        <view class="popup-header">
          <text class="popup-title">订单详情</text>
          <text class="popup-close" @click="detailVisible = false">✕</text>
        </view>

        <scroll-view class="popup-body" scroll-y>
          <view class="detail-section">
            <text class="detail-label">订单编号</text>
            <view class="detail-value-row">
              <text class="detail-value">{{ currentOrder.orderNo || currentOrder.id }}</text>
              <text class="copy-link" @click="copyOrderNo">复制</text>
            </view>
          </view>

          <view class="detail-section">
            <text class="detail-label">用户信息</text>
            <view class="user-detail">
    <view class="ud-avatar">
    <local-image style="width:100%;height:100%;" :src="resolveAssetUrl(currentOrder.userAvatar) || '/static/default-avatar.png'" mode="aspectFill"  />
  </view>
              <text class="ud-name">{{ currentOrder.userNickname || '用户' }}</text>
            </view>
          </view>

          <view class="detail-section">
            <text class="detail-label">商品信息</text>
            <text class="detail-value">{{ currentOrder.productName }}</text>
          </view>

          <view class="detail-section">
            <text class="detail-label">支付金额</text>
            <text class="detail-value amount">¥{{ currentOrder.paidAmount || currentOrder.amount || 0 }}</text>
          </view>

          <view class="detail-section" v-if="currentOrder.tierInfo">
            <text class="detail-label">团购阶梯</text>
            <text class="detail-value">{{ currentOrder.tierInfo }}</text>
          </view>

          <view class="detail-section">
            <text class="detail-label">下单时间</text>
            <text class="detail-value">{{ formatFullTime(currentOrder.createTime) }}</text>
          </view>

          <view class="detail-section" v-if="currentOrder.payTime">
            <text class="detail-label">支付时间</text>
            <text class="detail-value">{{ formatFullTime(currentOrder.payTime) }}</text>
          </view>

          <view class="detail-section" v-if="currentOrder.verifyTime">
            <text class="detail-label">核销时间</text>
            <text class="detail-value">{{ formatFullTime(currentOrder.verifyTime) }}</text>
          </view>

          <view class="detail-section" v-if="currentOrder.refundTime">
            <text class="detail-label">退款时间</text>
            <text class="detail-value">{{ formatFullTime(currentOrder.refundTime) }}</text>
          </view>

          <view class="detail-section" v-if="currentOrder.refundReason">
            <text class="detail-label">退款原因</text>
            <text class="detail-value">{{ currentOrder.refundReason }}</text>
          </view>

          <!-- Verification Code -->
          <view v-if="currentOrder.status === 'paid' || currentOrder.status === 'unverified'" class="detail-section">
            <text class="detail-label">核销码</text>
            <text class="verification-code">{{ currentOrder.verificationCode || '------' }}</text>
          </view>
        </scroll-view>

        <view class="popup-footer">
          <template v-if="currentOrder.status === 'paid' || currentOrder.status === 'unverified'">
            <view class="popup-btn primary-btn" @click="verifyOrder(currentOrder)">
              <text>确认核销</text>
            </view>
          </template>
          <template v-if="currentOrder.status === 'verified'">
            <view class="popup-btn outline-btn" @click="detailVisible = false">
              <text>已核销</text>
            </view>
          </template>
          <template v-if="currentOrder.status === 'pending' || currentOrder.status === 'unpaid'">
            <view class="popup-btn outline-btn" @click="detailVisible = false">
              <text>等待支付</text>
            </view>
          </template>
        </view>
      </view>
    </view>

    <!-- ==================== Manual Input Modal ==================== -->
    <view v-if="manualInputVisible" class="modal-overlay" @click.self="manualInputVisible = false">
      <view class="manual-modal">
        <text class="modal-title">手动输入核销码</text>
        <input
          v-model="manualCode"
          class="modal-input"
          placeholder="请输入核销码"
          maxlength="32"
          focus
        />
        <view class="modal-actions">
          <view class="modal-btn cancel" @click="manualInputVisible = false">
            <text>取消</text>
          </view>
          <view class="modal-btn confirm" @click="verifyByCode">
            <text>确认核销</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import api, { resolveAssetUrl as resolveAsset } from '@/utils/api.js';
import EmptyState from '@/components/EmptyState.vue';

// 小程序模板只能访问组件内定义的绑定,包一层让模板可用
function resolveAssetUrl(url) {
  return resolveAsset(url);
}

// ---- State ----
const tabs = [
  { label: '全部', value: 'all' },
  { label: '待核销', value: 'unverified' },
  { label: '已核销', value: 'verified' },
  { label: '已退款', value: 'refunded' }
];
const activeTab = ref('all');
const loading = ref(true);
const refreshing = ref(false);
const orders = ref([]);

// Detail popup
const detailVisible = ref(false);
const currentOrder = ref(null);

// Manual input
const manualInputVisible = ref(false);
const manualCode = ref('');

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

function formatFullTime(timeStr) {
  if (!timeStr) return '--';
  const d = new Date(timeStr);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return Y + '-' + M + '-' + D + ' ' + h + ':' + min;
}

function statusLabel(status) {
  const map = {
    pending: '待支付', unpaid: '待支付',
    paid: '已支付', unverified: '待核销',
    verified: '已核销', used: '已核销',
    refunded: '已退款', cancelled: '已取消'
  };
  return map[status] || status;
}

async function fetchOrders() {
  try {
    const params = {};
    if (activeTab.value !== 'all') {
      if (activeTab.value === 'unverified') {
        params.status = 'paid,unverified';
      } else {
        params.status = activeTab.value;
      }
    }
    const res = await api.merchant.getOrders(params);
    orders.value = res.list || res.records || res || [];
  } catch (err) {
    console.error('Failed to fetch orders:', err);
    orders.value = [];
  }
}

function switchTab(value) {
  if (activeTab.value === value) return;
  activeTab.value = value;
  fetchOrders();
}

async function onRefresh() {
  refreshing.value = true;
  await fetchOrders();
  refreshing.value = false;
}

// Scanner
function openScanner() {
  // #ifdef MP-WEIXIN
  uni.scanCode({
    onlyFromCamera: true,
    scanType: ['qrCode', 'barCode'],
    success: (res) => {
      verifyByCodeResult(res.result);
    },
    fail: (err) => {
      if (err.errMsg.indexOf('cancel') === -1) {
        // Not cancelled by user, show manual input fallback
        manualInputVisible.value = true;
      }
    }
  });
  // #endif

  // #ifndef MP-WEIXIN
  // H5 / APP fallback: show manual input
  manualInputVisible.value = true;
  // #endif
}

function verifyByCodeResult(code) {
  if (!code) {
    uni.showToast({ title: '无效的核销码', icon: 'none' });
    return;
  }
  doVerify(code);
}

function verifyByCode() {
  if (!manualCode.value.trim()) {
    uni.showToast({ title: '请输入核销码', icon: 'none' });
    return;
  }
  doVerify(manualCode.value.trim());
  manualInputVisible.value = false;
  manualCode.value = '';
}

async function doVerify(code) {
  uni.showLoading({ title: '核销中...' });
  try {
    await api.post('/orders/verify', { verification_code: code });
    uni.hideLoading();
    uni.showToast({ title: '核销成功', icon: 'success' });
    fetchOrders();
  } catch (err) {
    uni.hideLoading();
    uni.showToast({ title: '核销失败', icon: 'none' });
  }
}

// Order detail
function goDetail(order) {
  currentOrder.value = order;
  detailVisible.value = true;
}

function copyOrderNo() {
  const no = currentOrder.value?.orderNo || currentOrder.value?.id || '';
  uni.setClipboardData({ data: no, success: () => uni.showToast({ title: '已复制', icon: 'none' }) });
}

async function verifyOrder(order) {
  detailVisible.value = false;
  if (!order.verificationCode && !order.code) {
    uni.showToast({ title: '无核销码', icon: 'none' });
    return;
  }

  uni.showModal({
    title: '确认核销',
    content: '确认核销订单 "' + order.productName + '" 吗？',
    confirmText: '确认核销',
    success: async (resModal) => {
      if (resModal.confirm) {
        const code = order.verificationCode || order.code || order.id;
        await doVerify(code);
      }
    }
  });
}

// ---- Lifecycle ----
onShow(() => {
  loading.value = true;
  fetchOrders().finally(() => { loading.value = false; });
});
</script>

<style lang="scss" scoped>
.orders-page {
  height: 100vh;
  background-color: #F5F5F5;
  display: flex;
  flex-direction: column;
}

// ===== Top Bar =====
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  background-color: #FFFFFF;
  border-bottom: 1rpx solid #F0F0F0;
}

.top-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A1A;
}

.scan-btn {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 24rpx;
  background: linear-gradient(135deg, #07C160, #05A84E);
  border-radius: 32rpx;
  &:active { opacity: 0.85; }
  .scan-icon { font-size: 28rpx; }
  .scan-text { font-size: 24rpx; color: #FFFFFF; font-weight: 600; }
}

// ===== Tab Bar =====
.tab-bar {
  background-color: #FFFFFF;
  border-bottom: 1rpx solid #F0F0F0;
}

.tab-scroll { white-space: nowrap; }

.tab-list {
  display: inline-flex;
  padding: 0 12rpx;
}

.tab-item {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  padding: 24rpx 24rpx;
  position: relative;
  flex-shrink: 0;
  text {
    font-size: 28rpx;
    color: #666;
  }
  &.active text {
    color: #07C160;
    font-weight: 600;
  }
}

.tab-indicator {
  position: absolute;
  bottom: 0;
  width: 48rpx;
  height: 6rpx;
  background: linear-gradient(90deg, #07C160, #4cd964);
  border-radius: 3rpx;
}

// ===== Order List =====
.order-list {
  flex: 1;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: 28rpx;
  color: #999;
}

.empty-state-wrap {
  padding-top: 80rpx;
}

// ===== Order Card =====
.order-card {
  margin: 16rpx 24rpx;
  background-color: #FFFFFF;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
  &:active { opacity: 0.95; }
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 24rpx 12rpx;
  border-bottom: 1rpx solid #F5F5F5;
  .order-no { font-size: 24rpx; color: #999; }
  .order-time { font-size: 22rpx; color: #bbb; }
}

.card-body {
  display: flex;
  padding: 16rpx 24rpx;
  gap: 16rpx;
}

.product-thumb {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  background-color: #F5F5F5;
  flex-shrink: 0;
    overflow: hidden;
  }

.order-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.product-name {
  font-size: 28rpx;
  font-weight: 500;
  color: #333;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.user-row {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.user-avatar {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background-color: #F0F0F0;
    overflow: hidden;
  }

.user-nickname {
  font-size: 24rpx;
  color: #999;
}

.amount-row {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  .amount-label { font-size: 22rpx; color: #999; }
  .amount-value {
    font-size: 30rpx;
    font-weight: 700;
    color: #1A1A1A;
  }
  .refund-tag {
    font-size: 20rpx;
    color: #E74C3C;
    padding: 2rpx 8rpx;
    background-color: #FFF5F5;
    border-radius: 8rpx;
  }
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 24rpx 20rpx;
}

.status-badge {
  padding: 4rpx 16rpx;
  border-radius: 12rpx;
  text { font-size: 22rpx; }
  &.status-pending, &.status-unpaid { background-color: #FFF8EB; text { color: #F5A623; } }
  &.status-paid, &.status-unverified { background-color: #E8F8EE; text { color: #07C160; } }
  &.status-verified, &.status-used { background-color: #EBF5FF; text { color: #4A90D9; } }
  &.status-refunded, &.status-cancelled { background-color: #F5F5F5; text { color: #bbb; } }
}

.verify-btn {
  padding: 8rpx 24rpx;
  background: linear-gradient(135deg, #07C160, #05A84E);
  border-radius: 24rpx;
  &:active { opacity: 0.85; }
  text { font-size: 24rpx; color: #FFFFFF; font-weight: 600; }
}

// ===== Bottom =====
.bottom-placeholder { height: 40rpx; }

// ===== Detail Popup =====
.detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.detail-popup {
  width: 100%;
  max-height: 80vh;
  background-color: #FFFFFF;
  border-radius: 32rpx 32rpx 0 0;
  display: flex;
  flex-direction: column;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 24rpx 16rpx;
  border-bottom: 1rpx solid #F0F0F0;
  .popup-title { font-size: 32rpx; font-weight: 700; color: #1A1A1A; }
  .popup-close {
    width: 48rpx; height: 48rpx; border-radius: 50%;
    background-color: #F5F5F5; display: flex; align-items: center; justify-content: center;
    font-size: 28rpx; color: #999;
  }
}

.popup-body {
  flex: 1;
  padding: 16rpx 24rpx;
  max-height: 50vh;
}

.detail-section {
  padding: 16rpx 0;
  border-bottom: 1rpx solid #F5F5F5;
  &:last-child { border-bottom: none; }
}

.detail-label {
  font-size: 24rpx;
  color: #999;
  display: block;
  margin-bottom: 6rpx;
}

.detail-value {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  &.amount { color: #E55D2B; font-weight: 700; }
}

.detail-value-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.copy-link {
  font-size: 22rpx;
  color: #4A90D9;
  padding: 4rpx 12rpx;
  background-color: rgba(74, 144, 217, 0.06);
  border-radius: 12rpx;
}

.user-detail {
  display: flex;
  align-items: center;
  gap: 12rpx;
  .ud-avatar { width: 56rpx; height: 56rpx; border-radius: 50%; background-color: #F0F0F0;
    overflow: hidden;
  }
  .ud-name { font-size: 28rpx; color: #333; font-weight: 500; }
}

.verification-code {
  font-size: 42rpx;
  font-weight: 800;
  color: #1A1A1A;
  letter-spacing: 8rpx;
  font-family: 'Courier New', monospace;
}

.popup-footer {
  padding: 16rpx 24rpx;
  border-top: 1rpx solid #F0F0F0;
}

.popup-btn {
  width: 100%;
  height: 88rpx;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
  &.primary-btn {
    background: linear-gradient(135deg, #07C160, #05A84E);
    color: #FFFFFF;
    box-shadow: 0 4rpx 16rpx rgba(7, 193, 96, 0.3);
  }
  &.outline-btn {
    background-color: #F5F5F5;
    color: #999;
  }
  &:active { opacity: 0.85; }
}

// ===== Manual Input Modal =====
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.manual-modal {
  width: 580rpx;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
}

.modal-title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #1A1A1A;
  text-align: center;
  margin-bottom: 24rpx;
}

.modal-input {
  width: 100%;
  height: 80rpx;
  background-color: #F5F5F5;
  border-radius: 12rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  color: #333;
  margin-bottom: 24rpx;
}

.modal-actions {
  display: flex;
  gap: 16rpx;
}

.modal-btn {
  flex: 1;
  height: 80rpx;
  border-radius: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
  &.cancel { background-color: #F5F5F5; color: #666; }
  &.confirm {
    background: linear-gradient(135deg, #07C160, #05A84E);
    color: #FFFFFF;
  }
  &:active { opacity: 0.85; }
}
</style>
