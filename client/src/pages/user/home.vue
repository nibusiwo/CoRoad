<template>
  <view class="user-home-page">
    <scroll-view class="home-scroll" scroll-y>
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-if="!loading && userData">
        <!-- Cover / Avatar Area -->
        <view class="header-section">
        <!-- Cover Image -->
          <view class="cover-wrap" @click="onCoverTap">
            <image
              :src="resolveAssetUrl(userData.coverImage || userData.cover_image) || '/static/default-cover.png'"
              class="cover-image"
              mode="aspectFill"
            />
            <view v-if="isSelf" class="cover-edit-badge">
              <text class="cover-edit-icon">📷 更换背景</text>
            </view>
          </view>

          <!-- Back Button -->
          <view class="back-btn" @click="goBack">
            <text class="back-icon">‹</text>
          </view>

          <!-- Avatar & Info -->
          <view class="avatar-area">
            <view class="avatar-wrap" @click="onAvatarTap">
              <image
                :src="resolveAssetUrl(userData.avatar) || '/static/default-avatar.png'"
                class="avatar"
                mode="aspectFill"
              />
              <view v-if="isSelf" class="avatar-edit-badge">
                <text class="avatar-edit-icon">📷</text>
              </view>
            </view>
            <view class="user-name-row">
              <text class="nickname">{{ userData.nickname || '用户' }}</text>
              <!-- Level Badge -->
              <view v-if="userData.level" class="level-tag" :class="'lv-' + userData.level">
                <text>Lv.{{ userData.level }}</text>
              </view>
              <!-- Certification Badge -->
              <view v-if="userData.certified" class="cert-badge">
                <text class="cert-icon">✓</text>
                <text>已认证车主</text>
              </view>
            </view>
            <text v-if="userData.gender !== undefined" class="gender-text">
              {{ userData.gender === 1 ? '男' : userData.gender === 2 ? '女' : '未设置' }}
              <text v-if="userData.age">· {{ userData.age }}岁</text>
            </text>
          </view>
        </view>

        <!-- Stats Row -->
        <view class="stats-row">
          <view class="stat-item">
            <text class="stat-value">{{ formatNumber(userData.mileage || 0) }}km</text>
            <text class="stat-label">里程</text>
          </view>
          <view class="stat-divider"></view>
          <view class="stat-item">
            <text class="stat-value">{{ userData.tripCount || 0 }}次</text>
            <text class="stat-label">组队次数</text>
          </view>
          <view class="stat-divider"></view>
          <view class="stat-item">
            <text class="stat-value">{{ userData.groupBuyCount || 0 }}次</text>
            <text class="stat-label">拼团次数</text>
          </view>
          <view class="stat-divider"></view>
          <view class="stat-item">
            <text class="stat-value">{{ userData.followerCount || 0 }}</text>
            <text class="stat-label">粉丝数</text>
          </view>
        </view>

        <!-- Signature / Bio -->
        <view v-if="userData.signature" class="signature-section card">
          <text class="signature-text">{{ userData.signature }}</text>
        </view>

        <!-- Vehicle Info -->
        <view v-if="userData.vehicle" class="vehicle-section card">
          <text class="section-title">车辆信息</text>
          <view class="vehicle-info">
            <text class="vehicle-icon">🚗</text>
            <view class="vehicle-detail">
              <text class="vehicle-model">{{ userData.vehicle.model || '未知车型' }}</text>
              <text class="vehicle-plate">{{ maskPlate(userData.vehicle.plate || '') }}</text>
            </view>
          </view>
        </view>

        <!-- Badge Showcase -->
        <view v-if="userData.badges && userData.badges.length" class="badge-section card">
          <text class="section-title">
            徽章墙
            <text class="badge-count">({{ userData.badges.length }})</text>
          </text>
          <scroll-view class="badge-scroll" scroll-x :show-scrollbar="false">
            <view class="badge-list">
              <view
                v-for="badge in userData.badges"
                :key="badge.id"
                class="badge-item"
              >
                <image
                  :src="badge.icon || '/static/default-badge.png'"
                  class="badge-icon"
                  mode="aspectFill"
                />
                <text class="badge-name">{{ badge.name }}</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <!-- Trip History -->
        <view v-if="tripHistory.length" class="trip-section card">
          <text class="section-title">最近行程</text>
          <view class="trip-list">
            <view
              v-for="trip in tripHistory"
              :key="trip.id"
              class="trip-card"
              @click="goTripDetail(trip)"
            >
              <view class="trip-route">
                <text class="trip-start">{{ trip.startPoint || '出发' }}</text>
                <text class="trip-arrow">→</text>
                <text class="trip-end">{{ trip.endPoint || '目的地' }}</text>
              </view>
              <view class="trip-meta">
                <text class="trip-date">{{ formatDate(trip.departureTime) }}</text>
                <text class="trip-days">{{ trip.estimatedDays || '?' }}天</text>
              </view>
            </view>
          </view>
        </view>

        <!-- No Trips -->
        <view v-else-if="!loading" class="no-trips card">
          <text class="no-trips-text">暂无行程记录</text>
        </view>

        <!-- Action Buttons -->
        <view class="action-section">
          <!-- Not Following -->
          <view v-if="!isFollowing && !isBlocked" class="follow-btn" @click="handleFollow">
            <text class="follow-icon">+</text>
            <text>关注</text>
          </view>

          <!-- Following -->
          <view v-if="isFollowing && !isBlocked" class="action-row">
            <view class="followed-btn" @click="handleUnfollow">
              <text>已关注</text>
            </view>
            <view class="message-btn" @click="goChat">
              <text>发私信</text>
            </view>
          </view>

          <!-- Blocked -->
          <view v-if="isBlocked" class="blocked-notice">
            <text class="blocked-icon">🚫</text>
            <text class="blocked-text">您已屏蔽该用户</text>
            <view class="unblock-btn" @click="handleUnblock">
              <text>解除屏蔽</text>
            </view>
          </view>
        </view>

        <!-- Report / Block -->
        <view class="bottom-actions">
          <view class="report-btn" @click="handleReport">
            <text>举报</text>
          </view>
          <text class="action-divider">|</text>
          <view class="block-btn" @click="handleBlock">
            <text>{{ isBlocked ? '已屏蔽' : '屏蔽' }}</text>
          </view>
        </view>

        <!-- Bottom Placeholder -->
        <view class="bottom-placeholder safe-area-bottom"></view>
      </template>
    </scroll-view>
  </view>
</template>

<script>
import { user, upload, resolveAssetUrl as resolveAsset } from '@/utils/api.js';
import { useUserStore } from '@/store/user.js';
import { useChatStore } from '@/store/chat.js';

export default {
  data() {
    return {
      userId: '',
      userData: null,
      tripHistory: [],
      loading: true,
      isFollowing: false,
      isBlocked: false
    };
  },

  computed: {
    userStore() {
      return useUserStore();
    },
    chatStore() {
      return useChatStore();
    },
    isSelf() {
      return String(this.userId) === String(this.userStore.userId);
    }
  },

  onLoad(options) {
    this.userId = options.userId || '';
    if (this.userId) {
      this.loadUserHome();
    }
  },

  onShow() {
    // Refresh when coming back
    if (this.userId && !this.loading) {
      this.loadUserHome();
    }
  },

  methods: {
    /** 解析相对资源路径为绝对 URL(小程序必需) */
    resolveAssetUrl(url) {
      return resolveAsset(url);
    },

    /** Load user home data */
    async loadUserHome() {
      this.loading = true;
      try {
        const data = await user.getUserHome(this.userId);

        // Normalize response
        this.userData = data.user || data.profile || data;
        this.tripHistory = data.recentTrips || data.trips || [];
        this.isFollowing = data.isFollowing !== undefined ? data.isFollowing : false;
        this.isBlocked = data.isBlocked !== undefined ? data.isBlocked : false;

        // If viewing own profile, hide action buttons
        if (this.isSelf) {
          this.isFollowing = true; // hide follow buttons
        }
      } catch (err) {
        console.error('Failed to load user home:', err);
        uni.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },

    /** 点击头像: 自己查看时允许自定义头像 */
    onAvatarTap() {
      if (!this.isSelf) return;
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const filePath = res.tempFilePaths && res.tempFilePaths[0];
          if (filePath) {
            this.uploadAvatar(filePath);
          }
        }
      });
    },

    /** 点击背景图: 自己查看时允许自定义背景图 */
    onCoverTap() {
      if (!this.isSelf) return;
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const filePath = res.tempFilePaths && res.tempFilePaths[0];
          if (filePath) {
            this.uploadCover(filePath);
          }
        }
      });
    },

    /** 上传并保存自定义背景图 */
    async uploadCover(filePath) {
      uni.showLoading({ title: '上传中...', mask: true });
      try {
        const uploadRes = await upload('/upload', filePath, {}, { showLoading: false, showError: false });
        const fileObj = (uploadRes && (uploadRes.file || (uploadRes.files && uploadRes.files[0]))) || uploadRes;
        const coverUrl = (fileObj && fileObj.url) || (typeof uploadRes === 'string' ? uploadRes : '');
        if (!coverUrl) {
          throw new Error('上传失败');
        }
        await user.updateProfile({ cover_image: coverUrl });
        await this.userStore.fetchProfile();
        if (this.userData) {
          this.userData.coverImage = coverUrl;
          this.userData.cover_image = coverUrl;
        }
        uni.hideLoading();
        uni.showToast({ title: '背景图已更新', icon: 'success' });
      } catch (err) {
        uni.hideLoading();
        console.warn('Failed to update cover:', err);
        uni.showToast({ title: (err && err.message) || '背景图更新失败', icon: 'none' });
      }
    },

    /** 上传并保存自定义头像 */
    async uploadAvatar(filePath) {
      uni.showLoading({ title: '上传中...', mask: true });
      try {
        const uploadRes = await upload('/upload', filePath, {}, { showLoading: false, showError: false });
        const fileObj = (uploadRes && (uploadRes.file || (uploadRes.files && uploadRes.files[0]))) || uploadRes;
        const avatarUrl = (fileObj && fileObj.url) || (typeof uploadRes === 'string' ? uploadRes : '');
        if (!avatarUrl) {
          throw new Error('上传失败');
        }
        await user.updateProfile({ avatar: avatarUrl });
        await this.userStore.fetchProfile();
        if (this.userData) {
          this.userData.avatar = avatarUrl;
        }
        uni.hideLoading();
        uni.showToast({ title: '头像已更新', icon: 'success' });
      } catch (err) {
        uni.hideLoading();
        console.warn('Failed to update avatar:', err);
        uni.showToast({ title: (err && err.message) || '头像更新失败', icon: 'none' });
      }
    },

    /** Handle follow */
    async handleFollow() {
      try {
        await user.follow(this.userId, 1);
        this.isFollowing = true;
        if (this.userData) {
          this.userData.followerCount = (this.userData.followerCount || 0) + 1;
        }
        uni.showToast({ title: '已关注', icon: 'success' });
      } catch (err) {
        uni.showToast({ title: '关注失败', icon: 'none' });
      }
    },

    /** Handle unfollow */
    handleUnfollow() {
      uni.showModal({
        title: '取消关注',
        content: '确定要取消关注吗？',
        confirmText: '确定',
        success: async (res) => {
          if (res.confirm) {
            try {
              await user.unfollow(this.userId, 1);
              this.isFollowing = false;
              if (this.userData) {
                this.userData.followerCount = Math.max(0, (this.userData.followerCount || 1) - 1);
              }
              uni.showToast({ title: '已取消关注', icon: 'none' });
            } catch (err) {
              uni.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** Navigate to private chat */
    async goChat() {
      try {
        const session = await this.chatStore.createPrivateSession(this.userId);
        this.chatStore.setCurrentSession(session);
        uni.navigateTo({
          url: '/pages/message/chat?sessionId=' + session.id
        });
      } catch (err) {
        uni.showToast({ title: err?.message || '创建会话失败', icon: 'none' });
      }
    },

    /** Handle block */
    handleBlock() {
      if (this.isBlocked) {
        uni.showToast({ title: '已屏蔽该用户', icon: 'none' });
        return;
      }

      uni.showModal({
        title: '屏蔽用户',
        content: '屏蔽后将不再收到该用户的消息和动态，确定要屏蔽吗？',
        confirmText: '确定屏蔽',
        confirmColor: '#E74C3C',
        success: (res) => {
          if (res.confirm) {
            this.isBlocked = true;
            this.isFollowing = false;
            uni.showToast({ title: '已屏蔽', icon: 'none' });
          }
        }
      });
    },

    /** Handle unblock */
    handleUnblock() {
      uni.showModal({
        title: '解除屏蔽',
        content: '确定要解除屏蔽吗？解除后该用户可正常与你互动。',
        confirmText: '确定',
        success: (res) => {
          if (res.confirm) {
            this.isBlocked = false;
            uni.showToast({ title: '已解除屏蔽', icon: 'none' });
          }
        }
      });
    },

    /** Handle report */
    handleReport() {
      uni.showActionSheet({
        itemList: ['色情低俗', '广告骚扰', '诈骗信息', '其他违规'],
        success: (res) => {
          const reasons = ['porn', 'ad', 'fraud', 'other'];
          const reason = reasons[res.tapIndex];
          uni.showModal({
            title: '确认举报',
            content: '确定要举报该用户吗？我们将尽快处理。',
            confirmText: '确定举报',
            confirmColor: '#E74C3C',
            success: (modalRes) => {
              if (modalRes.confirm) {
                uni.showToast({ title: '举报已提交', icon: 'success' });
              }
            }
          });
        }
      });
    },

    /** Navigate to trip detail */
    goTripDetail(trip) {
      uni.navigateTo({
        url: '/pages/trip/detail?tripId=' + trip.id
      });
    },

    /** Go back */
    goBack() {
      uni.navigateBack();
    },

    /** Mask license plate */
    maskPlate(plate) {
      if (!plate) return '未设置';
      if (plate.length <= 3) return plate;
      return plate.substring(0, 2) + '**' + plate.substring(plate.length - 2);
    },

    /** Format number */
    formatNumber(num) {
      if (!num) return '0';
      if (num >= 10000) {
        return (num / 10000).toFixed(1) + 'w';
      }
      return num.toString();
    },

    /** Format date */
    formatDate(timeStr) {
      if (!timeStr) return '待定';
      const date = new Date(timeStr);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return month + '/' + day;
    }
  }
};
</script>

<style lang="scss" scoped>
.user-home-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F5F5F5;
}

.home-scroll {
  flex: 1;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: 28rpx;
  color: #999;
}

// ===== Header Section =====
.header-section {
  position: relative;
}

.cover-image {
  width: 100%;
  height: 360rpx;
  background: linear-gradient(135deg, #e8f8ee, #07C160);
}

.cover-wrap {
  position: relative;
  width: 100%;
  height: 360rpx;
}

.cover-edit-badge {
  position: absolute;
  right: 20rpx;
  bottom: 16rpx;
  padding: 8rpx 20rpx;
  border-radius: 24rpx;
  background-color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;

  .cover-edit-icon {
    font-size: 22rpx;
    color: #FFFFFF;
    line-height: 1;
  }
}

.back-btn {
  position: absolute;
  top: 16rpx;
  left: 20rpx;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;

  .back-icon {
    font-size: 48rpx;
    color: #FFFFFF;
    font-weight: 300;
    line-height: 1;
  }
}

.avatar-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: -72rpx;
  position: relative;
  z-index: 1;
}

.avatar-wrap {
  position: relative;
  width: 144rpx;
  height: 144rpx;
  border-radius: 50%;
  border: 6rpx solid #FFFFFF;
  overflow: hidden;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.1);
  margin-bottom: 12rpx;
  background-color: #FFFFFF;
}

.avatar {
  width: 100%;
  height: 100%;
}

.avatar-edit-badge {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;

  .avatar-edit-icon {
    font-size: 26rpx;
    line-height: 1;
  }
}

.user-name-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 8rpx;
}

.nickname {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A1A;
}

.level-tag {
  padding: 2rpx 12rpx;
  border-radius: 12rpx;
  font-size: 20rpx;
  font-weight: 600;

  &.lv-1 { background-color: #e8e8e8; color: #666; }
  &.lv-2 { background-color: #d4f5e2; color: #07C160; }
  &.lv-3 { background-color: #e8f0fe; color: #4A90D9; }
  &.lv-4 { background-color: #fef8e7; color: #f5a623; }
  &.lv-5, &.lv-6 { background: linear-gradient(135deg, #ffd700, #ffb800); color: #8b6914; }
}

.cert-badge {
  display: flex;
  align-items: center;
  gap: 4rpx;
  padding: 2rpx 10rpx;
  background-color: rgba(245, 166, 35, 0.1);
  border: 1rpx solid #f5a623;
  border-radius: 12rpx;
  font-size: 20rpx;
  color: #f5a623;

  .cert-icon {
    font-size: 18rpx;
    font-weight: 700;
  }
}

.gender-text {
  font-size: 24rpx;
  color: #999;
}

// ===== Stats Row =====
.stats-row {
  display: flex;
  align-items: center;
  margin: 24rpx;
  background-color: #FFFFFF;
  border-radius: 20rpx;
  padding: 24rpx 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;

  .stat-value {
    font-size: 30rpx;
    font-weight: 700;
    color: #1A1A1A;
  }

  .stat-label {
    font-size: 22rpx;
    color: #999;
  }
}

.stat-divider {
  width: 1rpx;
  height: 40rpx;
  background-color: #F0F0F0;
}

// ===== Signature =====
.signature-section {
  margin: 0 24rpx 16rpx;
}

.signature-text {
  font-size: 26rpx;
  color: #666;
  line-height: 1.6;
}

// ===== Vehicle Info =====
.vehicle-section {
  margin: 0 24rpx 16rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1A1A1A;
  display: block;
  margin-bottom: 16rpx;
}

.vehicle-info {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.vehicle-icon {
  font-size: 44rpx;
}

.vehicle-detail {
  .vehicle-model {
    font-size: 26rpx;
    color: #333;
    font-weight: 500;
    display: block;
    margin-bottom: 4rpx;
  }

  .vehicle-plate {
    font-size: 24rpx;
    color: #999;
    font-family: 'Courier New', monospace;
    letter-spacing: 2rpx;
  }
}

// ===== Badge Section =====
.badge-section {
  margin: 0 24rpx 16rpx;
}

.badge-count {
  font-size: 24rpx;
  color: #999;
  font-weight: 400;
}

.badge-scroll {
  white-space: nowrap;
}

.badge-list {
  display: inline-flex;
  gap: 16rpx;
}

.badge-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}

.badge-icon {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background-color: #F5F5F5;
  border: 2rpx solid #f0c060;
}

.badge-name {
  font-size: 20rpx;
  color: #666;
  max-width: 100rpx;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// ===== Trip Section =====
.trip-section {
  margin: 0 24rpx 16rpx;
}

.trip-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.trip-card {
  padding: 16rpx;
  background-color: #F9F9F9;
  border-radius: 12rpx;
  transition: background 0.15s;

  &:active {
    background-color: #F0F0F0;
  }
}

.trip-route {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 8rpx;

  .trip-start,
  .trip-end {
    font-size: 26rpx;
    color: #333;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200rpx;
  }

  .trip-arrow {
    font-size: 24rpx;
    color: #07C160;
    font-weight: 600;
    flex-shrink: 0;
  }
}

.trip-meta {
  display: flex;
  gap: 16rpx;

  text {
    font-size: 22rpx;
    color: #999;
  }
}

.no-trips {
  margin: 0 24rpx 16rpx;
  text-align: center;
  padding: 40rpx 0;

  .no-trips-text {
    font-size: 26rpx;
    color: #bbb;
  }
}

// ===== Action Section =====
.action-section {
  padding: 16rpx 24rpx;
  display: flex;
  justify-content: center;
}

.follow-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  width: 320rpx;
  height: 88rpx;
  background: linear-gradient(135deg, #07C160, #05A84E);
  border-radius: 44rpx;
  box-shadow: 0 4rpx 16rpx rgba(7, 193, 96, 0.3);

  text {
    font-size: 30rpx;
    color: #FFFFFF;
    font-weight: 600;
  }

  .follow-icon {
    font-size: 36rpx;
    font-weight: 300;
  }

  &:active {
    opacity: 0.85;
  }
}

.action-row {
  display: flex;
  gap: 20rpx;
  width: 100%;
}

.followed-btn {
  flex: 1;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #F5F5F5;
  border: 1rpx solid #E0E0E0;
  border-radius: 44rpx;

  text {
    font-size: 28rpx;
    color: #666;
  }

  &:active {
    background-color: #EEEEEE;
  }
}

.message-btn {
  flex: 1;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #07C160, #05A84E);
  border-radius: 44rpx;
  box-shadow: 0 4rpx 16rpx rgba(7, 193, 96, 0.3);

  text {
    font-size: 28rpx;
    color: #FFFFFF;
    font-weight: 600;
  }

  &:active {
    opacity: 0.85;
  }
}

// ===== Blocked Notice =====
.blocked-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 24rpx;
  background-color: #FFF5F5;
  border-radius: 16rpx;

  .blocked-icon {
    font-size: 48rpx;
  }

  .blocked-text {
    font-size: 26rpx;
    color: #999;
  }
}

.unblock-btn {
  padding: 12rpx 32rpx;
  background-color: #FFFFFF;
  border: 1rpx solid #E0E0E0;
  border-radius: 24rpx;

  text {
    font-size: 26rpx;
    color: #e74c3c;
  }
}

// ===== Bottom Actions =====
.bottom-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  margin-bottom: 20rpx;
}

.report-btn,
.block-btn {
  padding: 8rpx 0;

  text {
    font-size: 24rpx;
    color: #999;
  }
}

.action-divider {
  font-size: 24rpx;
  color: #ddd;
}

// ===== Card =====
.card {
  background-color: #FFFFFF;
  border-radius: 20rpx;
  padding: 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

// ===== Bottom =====
.bottom-placeholder {
  height: 40rpx;
}
</style>
