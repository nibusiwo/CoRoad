<template>
  <view class="blacklist-page">
    <!-- ==================== Header ==================== -->
    <view class="page-header">
      <text class="header-title">黑名单</text>
      <text v-if="blockedUsers.length" class="header-count">{{ blockedUsers.length }}人</text>
    </view>

    <scroll-view
      class="page-scroll"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
    >
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <!-- Empty State (inline, avoids component compat issues in MP) -->
      <view v-else-if="blockedUsers.length === 0" class="empty-state-wrap">
        <view class="empty-icon-wrap">
          <text class="empty-icon">🚫</text>
        </view>
        <view class="empty-title">黑名单为空</view>
        <view class="empty-description">你没有拉黑任何用户</view>
        <view class="empty-secondary">被拉黑的用户将无法与你互动</view>
      </view>

      <!-- Blocked Users List -->
      <template v-else>
        <view
          v-for="user in blockedUsers"
          :key="user.id"
          class="user-card"
        >
          <view class="user-info">
                        <view class="user-avatar">
              <local-image style="width:100%;height:100%;"
            :src="resolveAssetUrl(user.avatar) || '/static/default-avatar.png'"
             
              mode="aspectFill"
             />
            </view>
            <view class="user-detail">
              <text class="user-nickname">{{ user.nickname || '车友' }}</text>
              <text class="user-date">{{ formatDate(user.blockDate || user.blockedAt || user.createTime) }} 拉黑</text>
              <text v-if="user.reason" class="user-reason">原因: {{ user.reason }}</text>
            </view>
          </view>

          <view class="unblock-btn" @click="handleUnblock(user)">
            <text>解除拉黑</text>
          </view>
        </view>

        <view class="bottom-placeholder safe-area-bottom"></view>
      </template>
    </scroll-view>
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
const loading = ref(true);
const refreshing = ref(false);
const blockedUsers = ref([]);

// ---- Methods ----
function formatDate(timeStr) {
  if (!timeStr) return '--';
  const d = new Date(timeStr);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return Y + '-' + M + '-' + D;
}

async function fetchBlockedUsers() {
  try {
    const res = await api.get('/users/blocked-list');
    blockedUsers.value = res.records || res || [];
  } catch (err) {
    console.error('Failed to fetch blocked users:', err);
    blockedUsers.value = [];
  }
}

function handleUnblock(user) {
  uni.showModal({
    title: '解除拉黑',
    content: '确定解除对 ' + (user.nickname || '该用户') + ' 的拉黑吗？解除后对方可正常与你互动。',
    confirmText: '确定解除',
    success: async (resModal) => {
      if (resModal.confirm) {
        try {
          await api.delete(`/users/block/${user.id || user.userId}`);
          const index = blockedUsers.value.findIndex(u => (u.id || u.userId) === (user.id || user.userId));
          if (index !== -1) blockedUsers.value.splice(index, 1);
          uni.showToast({ title: '已解除拉黑', icon: 'success' });
        } catch (err) {
          uni.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    }
  });
}

function onRefresh() {
  refreshing.value = true;
  fetchBlockedUsers().finally(() => { refreshing.value = false; });
}

// ---- Lifecycle ----
onShow(async () => {
  loading.value = true;
  await fetchBlockedUsers();
  loading.value = false;
});
</script>

<style lang="scss" scoped>
.blacklist-page {
  height: 100vh;
  background-color: #F5F5F5;
  display: flex;
  flex-direction: column;
}

// ===== Header =====
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx;
  background-color: #FFFFFF;
}

.header-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A1A;
}

.header-count {
  font-size: 24rpx;
  color: #999;
  padding: 6rpx 16rpx;
  background-color: #F5F5F5;
  border-radius: 16rpx;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80rpx 40rpx;
  text-align: center;
}

.empty-icon-wrap {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background-color: #F0F0F0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32rpx;
}

.empty-icon {
  font-size: 72rpx;
}

.empty-title,
.empty-description,
.empty-secondary {
  display: block;
  width: 100%;
  text-align: center;
}

.empty-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1A1A1A;
  margin-bottom: 12rpx;
}

.empty-description {
  font-size: 26rpx;
  color: #666666;
  line-height: 1.6;
  margin-bottom: 8rpx;
}

.empty-secondary {
  font-size: 22rpx;
  color: #999999;
  margin-bottom: 40rpx;
}

// ===== User Card =====
.user-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16rpx 24rpx;
  padding: 24rpx;
  background-color: #FFFFFF;
  border-radius: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 16rpx;
  flex: 1;
  min-width: 0;
}

.user-avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background-color: #F0F0F0;
  flex-shrink: 0;
    overflow: hidden;
  }

.user-detail {
  flex: 1;
  min-width: 0;
  .user-nickname {
    font-size: 28rpx;
    font-weight: 500;
    color: #333;
    display: block;
    margin-bottom: 6rpx;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .user-date {
    font-size: 22rpx;
    color: #bbb;
    display: block;
  }
  .user-reason {
    font-size: 22rpx;
    color: #bbb;
    display: block;
    margin-top: 2rpx;
  }
}

.unblock-btn {
  padding: 12rpx 28rpx;
  border: 1rpx solid #E74C3C;
  border-radius: 28rpx;
  flex-shrink: 0;
  margin-left: 16rpx;
  &:active { background-color: #FFF5F5; }
  text { font-size: 24rpx; color: #E74C3C; font-weight: 500; }
}

// ===== Bottom =====
.bottom-placeholder {
  height: 40rpx;
}
</style>
