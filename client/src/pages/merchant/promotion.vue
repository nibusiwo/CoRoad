<template>
  <view class="promotion-page">
    <scroll-view class="page-scroll" scroll-y :refresher-enabled="true" :refresher-triggered="refreshing" @refresherrefresh="onRefresh">
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-if="!loading">
        <!-- ==================== Promotion Code ==================== -->
        <view class="code-section">
          <view class="code-card">
            <text class="code-title">我的推广码</text>
            <view class="code-value-row">
              <text class="code-value">{{ promoCode }}</text>
              <view class="copy-btn" @click="copyCode">
                <text>复制</text>
              </view>
            </view>
            <view class="qr-code-wrap">
              <view class="qr-placeholder">
                <view class="qr-grid">
                  <view v-for="i in 25" :key="i" class="qr-cell" :class="{ filled: (i % 2 !== 0) && (i % 4 !== 0) }"></view>
                </view>
              </view>
              <text class="qr-hint">扫码注册成为车友</text>
            </view>
          </view>
        </view>

        <!-- ==================== Stats ==================== -->
        <view class="stats-section">
          <view class="stat-card">
            <text class="stat-value">{{ stats.registerCount || 0 }}</text>
            <text class="stat-label">注册用户</text>
          </view>
          <view class="stat-card">
            <text class="stat-value">{{ stats.orderCount || 0 }}</text>
            <text class="stat-label">带来订单</text>
          </view>
          <view class="stat-card">
            <text class="stat-value">¥{{ stats.revenue || 0 }}</text>
            <text class="stat-label">带来收入</text>
          </view>
        </view>

        <!-- ==================== Toggle Settings ==================== -->
        <view class="settings-section card">
          <text class="section-title">推广设置</text>

          <view class="setting-item">
            <view class="setting-info">
              <text class="setting-name">提供拉新券</text>
              <text class="setting-desc">新用户通过你的推广码注册可获得新人优惠券</text>
            </view>
            <switch
              :checked="settings.couponEnabled"
              color="#07C160"
              @change="toggleSetting('couponEnabled')"
            />
          </view>

          <view class="setting-item">
            <view class="setting-info">
              <text class="setting-name">加入奖励池</text>
              <text class="setting-desc">加入平台推广奖励池，获得额外推广奖励</text>
            </view>
            <switch
              :checked="settings.rewardPoolEnabled"
              color="#07C160"
              @change="toggleSetting('rewardPoolEnabled')"
            />
          </view>

          <view class="setting-item">
            <view class="setting-info">
              <text class="setting-name">自动分享</text>
              <text class="setting-desc">完成订单后自动生成分享海报</text>
            </view>
            <switch
              :checked="settings.autoShareEnabled"
              color="#07C160"
              @change="toggleSetting('autoShareEnabled')"
            />
          </view>
        </view>

        <!-- ==================== Invited Users ==================== -->
        <view class="users-section card">
          <view class="section-header">
            <text class="section-title">已邀请用户</text>
            <text class="section-count">共 {{ invitedUsers.length }} 人</text>
          </view>

          <view v-if="invitedUsers.length === 0" class="empty-row">
            <text>暂无邀请用户</text>
          </view>

          <view v-for="user in invitedUsers" :key="user.id" class="user-item">
                        <view class="user-avatar">
              <local-image style="width:100%;height:100%;" :src="resolveAssetUrl(user.avatar) || '/static/default-avatar.png'" mode="aspectFill"  />
            </view>
            <view class="user-info">
              <text class="user-nickname">{{ user.nickname || '车友' }}</text>
              <text class="user-date">{{ formatDate(user.registerDate) }} 注册</text>
            </view>
            <view class="user-contribution" v-if="user.orderCount">
              <text class="uc-num">{{ user.orderCount }}单</text>
              <text class="uc-label">贡献</text>
            </view>
          </view>
        </view>

        <!-- ==================== Share Button ==================== -->
        <view class="share-section">
          <view class="share-btn" @click="openShareAction">
            <text class="share-icon">📤</text>
            <text class="share-text">分享推广码</text>
          </view>
        </view>

        <view class="bottom-placeholder safe-area-bottom"></view>
      </template>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import api, { resolveAssetUrl as resolveAsset } from '@/utils/api.js';

// 小程序模板只能访问组件内定义的绑定,包一层让模板可用
function resolveAssetUrl(url) {
  return resolveAsset(url);
}

// ---- State ----
const loading = ref(true);
const refreshing = ref(false);
const promoCode = ref('');
const stats = reactive({
  registerCount: 0,
  orderCount: 0,
  revenue: 0
});
const settings = reactive({
  couponEnabled: true,
  rewardPoolEnabled: false,
  autoShareEnabled: true
});
const invitedUsers = ref([]);

// ---- Methods ----
function formatDate(timeStr) {
  if (!timeStr) return '--';
  const d = new Date(timeStr);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return Y + '-' + M + '-' + D;
}

function copyCode() {
  uni.setClipboardData({
    data: promoCode.value,
    success: () => uni.showToast({ title: '推广码已复制', icon: 'none' })
  });
}

async function fetchPromotion() {
  try {
    const res = await api.merchant.getPromotionCode();
    promoCode.value = res.promo_code || res.code || '';
    if (res.stats) Object.assign(stats, res.stats);
    if (res.settings) Object.assign(settings, res.settings);
    invitedUsers.value = res.invited_users || res.users || [];
  } catch (err) {
    console.error('Failed to fetch promotion data:', err);
  }
}

async function toggleSetting(key) {
  const newVal = !settings[key];
  // Optimistic update
  settings[key] = newVal;

  try {
    if (key === 'inviteCoupon') await api.merchant.toggleInviteCoupon(newVal);
    if (key === 'rewardPool') await api.merchant.toggleRewardPool(newVal);
    uni.showToast({ title: '设置已更新', icon: 'success' });
  } catch (err) {
    // Revert on failure
    settings[key] = !newVal;
    uni.showToast({ title: '设置失败', icon: 'none' });
  }
}

function openShareAction() {
  // #ifdef MP-WEIXIN
  uni.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline']
  });
  // #endif

  uni.showToast({
    title: '请点击右上角分享',
    icon: 'none'
  });
}

function onRefresh() {
  refreshing.value = true;
  fetchPromotion().finally(() => { refreshing.value = false; });
}

// ---- Lifecycle ----
onShow(async () => {
  loading.value = true;
  await fetchPromotion();
  loading.value = false;
});

// ---- Share Config ----
// #ifdef MP-WEIXIN
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app';

onShareAppMessage(() => {
  return {
    title: '加入同道，一起自驾出行！',
    path: '/pages/login/index?promoCode=' + promoCode.value,
    imageUrl: ''
  };
});

onShareTimeline(() => {
  return {
    title: '同道 CoRoad - 自驾社交平台',
    query: 'promoCode=' + promoCode.value,
    imageUrl: ''
  };
});
// #endif
</script>

<style lang="scss" scoped>
.promotion-page {
  height: 100vh;
  background-color: #F5F5F5;
  display: flex;
  flex-direction: column;
}

.page-scroll { flex: 1; }

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: 28rpx;
  color: #999;
}

// ===== Code Section =====
.code-section {
  padding: 24rpx;
}

.code-card {
  background: linear-gradient(135deg, #FF6B35, #FF8C5A);
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 8rpx 30rpx rgba(255, 107, 53, 0.3);
}

.code-title {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 16rpx;
}

.code-value-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 28rpx;
}

.code-value {
  font-size: 48rpx;
  font-weight: 800;
  color: #FFFFFF;
  letter-spacing: 6rpx;
  font-family: 'Courier New', monospace;
}

.copy-btn {
  padding: 8rpx 20rpx;
  background-color: rgba(255, 255, 255, 0.25);
  border-radius: 20rpx;
  text { font-size: 24rpx; color: #FFFFFF; font-weight: 600; }
  &:active { opacity: 0.7; }
}

.qr-code-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}

.qr-placeholder {
  padding: 20rpx;
  background-color: #FFFFFF;
  border-radius: 16rpx;
}

.qr-grid {
  display: grid;
  grid-template-columns: repeat(5, 32rpx);
  grid-template-rows: repeat(5, 32rpx);
  gap: 4rpx;
}

.qr-cell {
  width: 32rpx;
  height: 32rpx;
  border-radius: 4rpx;
  background-color: #FFFFFF;
  &.filled { background-color: #1A1A1A; }
}

.qr-hint {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.7);
}

// ===== Stats =====
.stats-section {
  display: flex;
  margin: 0 24rpx 16rpx;
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
  font-size: 30rpx;
  font-weight: 700;
  color: #FF6B35;
  margin-bottom: 6rpx;
}

.stat-label {
  font-size: 20rpx;
  color: #999;
  white-space: nowrap;
}

// ===== Card =====
.card {
  margin: 0 24rpx 16rpx;
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

// ===== Settings =====
.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
  &:not(:last-child) { border-bottom: 1rpx solid #F5F5F5; }
}

.setting-info {
  flex: 1;
  margin-right: 20rpx;
}

.setting-name {
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  display: block;
  margin-bottom: 4rpx;
}

.setting-desc {
  font-size: 22rpx;
  color: #bbb;
}

// ===== Users =====
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.section-count {
  font-size: 24rpx;
  color: #999;
}

.empty-row {
  text-align: center;
  padding: 32rpx 0;
  font-size: 24rpx;
  color: #bbb;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 16rpx 0;
  &:not(:last-child) { border-bottom: 1rpx solid #F5F5F5; }
}

.user-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background-color: #F0F0F0;
  flex-shrink: 0;
    overflow: hidden;
  }

.user-info {
  flex: 1;
  min-width: 0;
  .user-nickname {
    font-size: 26rpx;
    font-weight: 500;
    color: #333;
    display: block;
    margin-bottom: 4rpx;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .user-date { font-size: 22rpx; color: #bbb; }
}

.user-contribution {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  .uc-num { font-size: 24rpx; font-weight: 700; color: #FF6B35; }
  .uc-label { font-size: 20rpx; color: #999; }
}

// ===== Share =====
.share-section {
  padding: 16rpx 24rpx;
  display: flex;
  justify-content: center;
}

.share-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  width: 480rpx;
  height: 88rpx;
  background: linear-gradient(135deg, #FF6B35, #E55D2B);
  border-radius: 44rpx;
  box-shadow: 0 6rpx 20rpx rgba(229, 93, 43, 0.35);
  &:active { opacity: 0.85; }
  .share-icon { font-size: 36rpx; }
  .share-text { font-size: 30rpx; color: #FFFFFF; font-weight: 700; }
}

// ===== Bottom =====
.bottom-placeholder { height: 40rpx; }
</style>
