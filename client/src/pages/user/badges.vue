<template>
  <view class="badges-page">
    <!-- ==================== Header ==================== -->
    <view class="header-section">
      <text class="header-title">勋章墙</text>
      <text class="header-progress">{{ earnedCount }}/{{ totalCount }}</text>
    </view>

    <scroll-view class="page-scroll" scroll-y :refresher-enabled="true" :refresher-triggered="refreshing" @refresherrefresh="onRefresh">
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-if="!loading">
        <!-- ==================== Badge Grid ==================== -->
        <view class="badge-grid">
          <view
            v-for="badge in badges"
            :key="badge.id"
            class="badge-card"
            :class="{ earned: badge.earned, locked: !badge.earned }"
            @click="showDetail(badge)"
          >
            <!-- Badge Icon -->
            <view class="badge-icon-wrap" :class="{ glow: badge.earned }">
              <image
                v-if="badge.icon"
                :src="badge.icon"
                class="badge-icon"
                mode="aspectFill"
              />
              <text v-else class="badge-emoji">{{ getBadgeEmoji(badge) }}</text>

              <!-- Lock Overlay -->
              <view v-if="!badge.earned" class="lock-overlay">
                <text class="lock-icon">🔒</text>
              </view>
            </view>

            <!-- Badge Name -->
            <text class="badge-name" :class="{ earned: badge.earned }">{{ badge.name }}</text>

            <!-- Progress Bar (for badges with progress) -->
            <view v-if="badge.progress !== undefined && badge.target !== undefined && !badge.earned" class="progress-bar-wrap">
              <view class="progress-bar">
                <view
                  class="progress-fill"
                  :style="{ width: Math.min(100, (badge.progress / badge.target) * 100) + '%' }"
                ></view>
              </view>
              <text class="progress-text">{{ badge.progress }}/{{ badge.target }}</text>
            </view>
          </view>
        </view>

        <!-- Empty -->
        <view v-if="badges.length === 0" class="empty-state-wrap">
          <EmptyState icon="🏅" title="暂无勋章" description="参与平台活动获取勋章" />
        </view>

        <view class="bottom-placeholder safe-area-bottom"></view>
      </template>
    </scroll-view>

    <!-- ==================== Detail Popup ==================== -->
    <view v-if="detailVisible && currentBadge" class="detail-overlay" @click.self="detailVisible = false">
      <view class="detail-popup">
        <view class="popup-close-btn" @click="detailVisible = false">
          <text>✕</text>
        </view>

        <!-- Icon -->
        <view class="popup-icon-wrap" :class="{ glow: currentBadge.earned }">
          <image
            v-if="currentBadge.icon"
            :src="currentBadge.icon"
            class="popup-icon"
            mode="aspectFill"
          />
          <text v-else class="popup-emoji">{{ getBadgeEmoji(currentBadge) }}</text>
        </view>

        <!-- Info -->
        <text class="popup-name">{{ currentBadge.name }}</text>
        <text class="popup-desc">{{ currentBadge.description || '完成特定任务可获得此勋章' }}</text>

        <!-- Earned Info -->
        <view v-if="currentBadge.earned && currentBadge.earnedDate" class="popup-earned">
          <text class="earned-icon">✅</text>
          <text class="earned-text">已于 {{ formatDate(currentBadge.earnedDate) }} 获得</text>
        </view>

        <!-- Progress -->
        <view v-if="currentBadge.progress !== undefined && currentBadge.target !== undefined" class="popup-progress">
          <text class="progress-label">获取进度</text>
          <view class="progress-bar-wrap large">
            <view class="progress-bar large">
              <view
                class="progress-fill"
                :style="{ width: Math.min(100, (currentBadge.progress / currentBadge.target) * 100) + '%' }"
              ></view>
            </view>
            <text class="progress-text large">{{ currentBadge.progress }}/{{ currentBadge.target }}</text>
          </view>
          <text class="progress-hint" v-if="currentBadge.progressHint">{{ currentBadge.progressHint }}</text>
        </view>

        <!-- Share badge -->
        <view v-if="currentBadge.earned" class="popup-share-btn" @click="shareBadge">
          <text>炫耀一下</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import api from '@/utils/api.js';
import EmptyState from '@/components/EmptyState.vue';

// ---- State ----
const loading = ref(true);
const refreshing = ref(false);
const badges = ref([]);

// Detail popup
const detailVisible = ref(false);
const currentBadge = ref(null);

// ---- Computed ----
const earnedCount = computed(() => badges.value.filter(b => b.earned).length);
const totalCount = computed(() => badges.value.length);

// ---- Methods ----
function getBadgeEmoji(badge) {
  const categoryMap = {
    travel: '🚗',
    social: '🤝',
    shopping: '🛒',
    milestone: '🏆',
    event: '🎉',
    checkin: '📅',
    review: '📝'
  };
  if (badge && badge.category) {
    return categoryMap[badge.category] || '🏅';
  }
  return '🏅';
}

function formatDate(timeStr) {
  if (!timeStr) return '--';
  const d = new Date(timeStr);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return Y + '-' + M + '-' + D;
}

async function fetchBadges() {
  try {
    const res = await api.get('/users/badges/all');
    const allBadges = res.badges || res.records || res || [];
    const earnedIds = res.earnedIds || res.earned || [];

    // Mark earned status and enrich with earned data
    const earnedMap = {};
    if (res.earnedDetails) {
      res.earnedDetails.forEach(e => { earnedMap[e.badgeId] = e; });
    }

    badges.value = allBadges.map(b => {
      const isEarned = Array.isArray(earnedIds)
        ? earnedIds.includes(b.id)
        : !!earnedIds[b.id];
      const detail = earnedMap[b.id] || {};
      return {
        ...b,
        earned: isEarned,
        earnedDate: detail.earnedDate || b.earnedDate || null,
        progress: detail.progress !== undefined ? detail.progress : (b.progress !== undefined ? b.progress : undefined),
        target: detail.target !== undefined ? detail.target : (b.target !== undefined ? b.target : undefined),
        progressHint: detail.progressHint || b.progressHint || ''
      };
    });
  } catch (err) {
    console.error('Failed to fetch badges:', err);
    badges.value = [];
  }
}

function showDetail(badge) {
  currentBadge.value = badge;
  detailVisible.value = true;
}

function shareBadge() {
  // #ifdef MP-WEIXIN
  uni.showShareMenu({
    withShareTicket: true,
    menus: ['shareAppMessage', 'shareTimeline']
  });
  // #endif

  uni.showToast({ title: '请点击右上角分享', icon: 'none' });
}

function onRefresh() {
  refreshing.value = true;
  fetchBadges().finally(() => { refreshing.value = false; });
}

// ---- Lifecycle ----
onShow(async () => {
  loading.value = true;
  await fetchBadges();
  loading.value = false;
});
</script>

<style lang="scss" scoped>
.badges-page {
  height: 100vh;
  background-color: #F5F5F5;
  display: flex;
  flex-direction: column;
}

// ===== Header =====
.header-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 24rpx 16rpx;
  background-color: #FFFFFF;
}

.header-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A1A;
}

.header-progress {
  font-size: 28rpx;
  font-weight: 600;
  color: #FF6B35;
  padding: 6rpx 20rpx;
  background-color: rgba(255, 107, 53, 0.06);
  border-radius: 20rpx;
}

// ===== Page Scroll =====
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

.empty-state-wrap {
  padding-top: 80rpx;
}

// ===== Badge Grid =====
.badge-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
  padding: 20rpx 24rpx;
}

.badge-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28rpx 16rpx 20rpx;
  background-color: #FFFFFF;
  border-radius: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
  transition: transform 0.15s;
  &:active { transform: scale(0.96); }

  &.locked {
    opacity: 0.65;
  }
}

.badge-icon-wrap {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background-color: #F5F5F5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12rpx;
  position: relative;
  overflow: hidden;

  &.glow {
    box-shadow: 0 0 20rpx rgba(255, 193, 7, 0.4), 0 0 40rpx rgba(255, 193, 7, 0.2);
    background: linear-gradient(135deg, #FFF8E1, #FFECB3);
    border: 2rpx solid #FFC107;
  }
}

.badge-icon {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
}

.badge-emoji {
  font-size: 48rpx;
}

.lock-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.35);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  .lock-icon { font-size: 28rpx; }
}

.badge-name {
  font-size: 24rpx;
  color: #666;
  font-weight: 500;
  text-align: center;
  margin-bottom: 8rpx;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  line-height: 1.3;
  &.earned { color: #1A1A1A; font-weight: 600; }
}

// ===== Progress Bar =====
.progress-bar-wrap {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}

.progress-bar {
  width: 100%;
  height: 8rpx;
  background-color: #F0F0F0;
  border-radius: 4rpx;
  overflow: hidden;
  &.large {
    height: 12rpx;
    border-radius: 6rpx;
  }
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #FFC107, #FF9800);
  border-radius: inherit;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 18rpx;
  color: #999;
  &.large { font-size: 24rpx; font-weight: 500; }
}

// ===== Bottom =====
.bottom-placeholder { height: 40rpx; }

// ===== Detail Popup =====
.detail-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-popup {
  width: 600rpx;
  background-color: #FFFFFF;
  border-radius: 28rpx;
  padding: 48rpx 32rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.popup-close-btn {
  position: absolute;
  top: 16rpx;
  right: 16rpx;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background-color: #F5F5F5;
  display: flex;
  align-items: center;
  justify-content: center;
  text { font-size: 28rpx; color: #999; }
}

.popup-icon-wrap {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
  background-color: #F5F5F5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20rpx;
  &.glow {
    box-shadow: 0 0 30rpx rgba(255, 193, 7, 0.5), 0 0 60rpx rgba(255, 193, 7, 0.25);
    background: linear-gradient(135deg, #FFF8E1, #FFECB3);
    border: 3rpx solid #FFC107;
  }
}

.popup-icon {
  width: 110rpx;
  height: 110rpx;
  border-radius: 50%;
}

.popup-emoji {
  font-size: 68rpx;
}

.popup-name {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A1A;
  margin-bottom: 10rpx;
}

.popup-desc {
  font-size: 26rpx;
  color: #666;
  text-align: center;
  line-height: 1.6;
  margin-bottom: 20rpx;
}

.popup-earned {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx 24rpx;
  background-color: #E8F8EE;
  border-radius: 16rpx;
  margin-bottom: 20rpx;
  .earned-icon { font-size: 28rpx; }
  .earned-text { font-size: 26rpx; color: #07C160; font-weight: 500; }
}

.popup-progress {
  width: 100%;
  margin-bottom: 20rpx;
  .progress-label {
    font-size: 24rpx;
    color: #999;
    display: block;
    margin-bottom: 10rpx;
  }
  .progress-hint {
    font-size: 22rpx;
    color: #bbb;
    margin-top: 8rpx;
    display: block;
    text-align: center;
  }
}

.progress-bar-wrap.large {
  .progress-bar { margin-bottom: 6rpx; }
}

.popup-share-btn {
  width: 320rpx;
  height: 80rpx;
  background: linear-gradient(135deg, #FFC107, #FF9800);
  border-radius: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 16rpx rgba(255, 152, 0, 0.35);
  text { font-size: 28rpx; color: #FFFFFF; font-weight: 600; }
  &:active { opacity: 0.85; }
}
</style>
