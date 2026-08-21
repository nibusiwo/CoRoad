<template>
  <view class="mine-page">
    <!-- ==================== Pull-to-Refresh Container ==================== -->
    <scroll-view
      class="page-scroll"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      :refresher-threshold="80"
      @refresherrefresh="onRefresh"
    >
      <!-- ==================== User Info Card ==================== -->
      <view class="user-card" @tap="goToProfile">
        <view class="user-card-bg"></view>
        <view class="user-card-content">
          <!-- Avatar & Basic Info -->
          <view class="user-header">
            <view class="user-avatar">
              <local-image
                style="width:100%;height:100%;"
                :src="userStore.avatar"
                mode="aspectFill"
              />
            </view>
            <view class="user-info">
              <view class="user-name-row">
                <text class="user-nickname">{{ userStore.nickname }}</text>
                <view class="level-badge">
                  <text>Lv.{{ userStore.level }} {{ userStore.levelName }}</text>
                </view>
              </view>
              <view class="user-id-row">
                <text class="user-id">ID: {{ userStore.userId || '未登录' }}</text>
              </view>
            </view>
            <view class="user-arrow">
              <text>›</text>
            </view>
          </view>

          <!-- Growth Progress Bar -->
          <view class="growth-section" v-if="profileData.growth !== undefined">
            <view class="growth-header">
              <text class="growth-label">同路值</text>
              <text class="growth-value">{{ profileData.growth || 0 }}/{{ nextLevelGrowth }}</text>
            </view>
            <view class="progress-bar">
              <view
                class="progress-fill"
                :style="{ width: growthPercent + '%' }"
              ></view>
            </view>
            <text class="growth-hint">距下一级还需 {{ Math.max(0, nextLevelGrowth - (profileData.growth || 0)) }} 点</text>
          </view>

          <!-- Certification & Credit -->
          <view class="badge-row">
            <view class="cert-badge" v-if="profileData.certified">
              <text class="cert-icon">✓</text>
              <text class="cert-text">已认证</text>
              <text class="cert-type">车</text>
            </view>
            <view class="cert-badge pending" v-else-if="profileData.certPending">
              <text class="cert-icon">⏳</text>
              <text class="cert-text">认证审核中</text>
            </view>
            <view class="cert-badge none" v-else @tap.stop="goToCertify">
              <text class="cert-icon">🔒</text>
              <text class="cert-text">去认证</text>
            </view>
            <view class="credit-badge">
              <text class="credit-icon">★</text>
              <text class="credit-score">{{ profileData.credit || 0 }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ==================== Data Overview Row ==================== -->
      <view class="data-overview">
        <view class="data-item" v-for="item in dataItems" :key="item.key" @tap="item.onTap">
          <text class="data-value">{{ item.value }}</text>
          <text class="data-label">{{ item.label }}</text>
        </view>
      </view>

      <!-- ==================== Section: 行程管理 ==================== -->
      <view class="section-card">
        <view class="section-title">行程管理</view>
        <view class="menu-list">
          <view class="menu-item" @tap="goToMyTrips">
            <view class="menu-left">
              <u-icon name="car" size="34" color="#07C160" />
              <text class="menu-label">我的行程</text>
            </view>
            <view class="menu-right">
              <text class="menu-badge" v-if="tripStore.currentTrip">进行中</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
          <view class="menu-item" @tap="goToMyTeams">
            <view class="menu-left">
              <u-icon name="plus-people-fill" size="34" color="#4A90D9" />
              <text class="menu-label">我的车队</text>
            </view>
            <view class="menu-right">
              <text class="menu-badge" v-if="teamCount > 0">{{ teamCount }}个</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ==================== Section: 社交 ==================== -->
      <view class="section-card">
        <view class="section-title">社交</view>
        <view class="menu-list">
          <view class="menu-item" @tap="goToFollow('following')">
            <view class="menu-left">
              <u-icon name="heart-fill" size="34" color="#07C160" />
              <text class="menu-label">我的关注</text>
            </view>
            <view class="menu-right">
              <text class="menu-count" v-if="profileData.followingCount">{{ profileData.followingCount }}人</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
          <view class="menu-item" @tap="goToFollow('followers')">
            <view class="menu-left">
              <u-icon name="man" size="34" color="#FF6B35" />
              <text class="menu-label">我的粉丝</text>
            </view>
            <view class="menu-right">
              <text class="menu-count" v-if="profileData.followerCount">{{ profileData.followerCount }}人</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
          <view class="menu-item" @tap="goToBlacklist">
            <view class="menu-left">
              <u-icon name="error-circle-fill" size="34" color="#E74C3C" />
              <text class="menu-label">黑名单</text>
            </view>
            <view class="menu-right">
              <text class="menu-arrow">›</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ==================== Section: 信任与安全 ==================== -->
      <view class="section-card safety-section">
        <view class="section-title accent">信任与安全</view>
        <view class="menu-list">
          <view class="menu-item" @tap="goToCertify">
            <view class="menu-left">
              <u-icon name="lock" size="34" color="#FF8F00" />
              <text class="menu-label">车认证</text>
            </view>
            <view class="menu-right">
              <text class="menu-status done" v-if="profileData.certified">已认证</text>
              <text class="menu-status pending" v-else-if="profileData.certPending">审核中</text>
              <text class="menu-status todo" v-else>待认证</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
          <view class="menu-item" @tap="goToEmergencyContacts">
            <view class="menu-left">
              <u-icon name="phone-fill" size="34" color="#E74C3C" />
              <text class="menu-label">紧急联系人</text>
            </view>
            <view class="menu-right">
              <text class="menu-count" v-if="profileData.emergencyContacts">{{ profileData.emergencyContacts }}人</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
          <view class="menu-item" @tap="goToSentinelMode">
            <view class="menu-left">
              <u-icon name="warning" size="34" color="#4A90D9" />
              <text class="menu-label">哨兵模式</text>
            </view>
            <view class="menu-right">
              <text class="menu-status" :class="sentinelOn ? 'done' : 'todo'">{{ sentinelOn ? '已开启' : '未开启' }}</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
          <view class="menu-item" @tap="goToCreditScore">
            <view class="menu-left">
              <u-icon name="integral" size="34" color="#FF6B35" />
              <text class="menu-label">信用分</text>
            </view>
            <view class="menu-right">
              <text class="menu-score">★ {{ profileData.credit || 0 }}</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ==================== Section: 功能入口 ==================== -->
      <view class="section-card">
        <view class="section-title">功能入口</view>
        <view class="func-grid">
      <view class="func-item" v-for="item in funcItems" :key="item.key" @tap="item.onTap">
        <view class="func-icon-wrap">
          <u-icon :name="item.iconName" size="40" :color="item.iconColor || '#07C160'" />
        </view>
            <text class="func-label">{{ item.label }}</text>
          </view>
        </view>
      </view>

      <!-- ==================== Logout Button ==================== -->
      <view class="logout-section" v-if="userStore.isLoggedIn">
        <view class="logout-btn" @tap="handleLogout">
          <text>退出登录</text>
        </view>
      </view>

      <!-- ==================== Login Button ==================== -->
      <view class="logout-section" v-else>
        <view class="login-btn" @tap="goToLogin">
          <text>登录 / 注册</text>
        </view>
      </view>

      <!-- Bottom Safe Area -->
      <view class="safe-area-bottom-placeholder"></view>
    </scroll-view>
  </view>
</template>

<script>
import { useUserStore } from '@/store/user.js';
import { useTripStore } from '@/store/trip.js';
import { userApi } from '@/utils/api.js';

export default {
  data() {
    return {
      // ---- Refresh State ----
      refreshing: false,

      // ---- Profile Data ----
      profileData: {
        growth: 0,
        credit: 0,
        certified: false,
        certPending: false,
        followingCount: 0,
        followerCount: 0,
        emergencyContacts: 0,
        mileage: 0,
        teamCount: 0,
        assistCount: 0,
        mailCount: 0,
        couponCount: 0
      },

      // ---- Other State ----
      teamCount: 0,
      sentinelOn: false,

      // ---- Data Overview Items ----
      dataItems: [],
    };
  },

  computed: {
    userStore() {
      return useUserStore();
    },

    tripStore() {
      return useTripStore();
    },

    /**
     * Next level growth threshold
     */
    nextLevelGrowth() {
      // 优先使用后端返回的准确下一级阈值,避免前端阈值表与后端不一致
      const serverNext = this.userStore.profile && (
        this.userStore.profile.next_level_growth !== undefined
          ? this.userStore.profile.next_level_growth
          : this.userStore.profile.nextLevelGrowth
      );
      if (serverNext) return serverNext;
      const level = this.userStore.level;
      const thresholds = [100, 500, 2000, 5000, 10000, 20000, 50000];
      return thresholds[level] || thresholds[thresholds.length - 1];
    },

    /**
     * Growth percentage for progress bar
     */
    growthPercent() {
      if (!this.profileData.growth || !this.nextLevelGrowth) return 0;
      // 优先使用后端返回的精确进度
      const serverProgress = this.userStore.profile && (
        this.userStore.profile.level_progress !== undefined
          ? this.userStore.profile.level_progress
          : this.userStore.profile.levelProgress
      );
      if (serverProgress !== undefined && serverProgress !== null) {
        return Math.min(100, Math.max(0, serverProgress));
      }
      const currentLevelThresholds = [0, 100, 500, 2000, 5000, 10000, 20000];
      const level = this.userStore.level;
      const base = currentLevelThresholds[level - 1] || 0;
      const range = this.nextLevelGrowth - base;
      if (range <= 0) return 100;
      return Math.min(100, Math.max(0, ((this.profileData.growth - base) / range) * 100));
    },

    /**
     * Function grid items
     */
    funcItems() {
      return [
        { key: 'orders', iconName: 'order', iconColor: '#FF6B35', label: '我的订单', onTap: this.goToOrders },
        { key: 'coupons', iconName: 'coupon', iconColor: '#FF8F00', label: '我的券包', onTap: this.goToCoupons },
        { key: 'badges', iconName: 'star', iconColor: '#F5A623', label: '勋章墙', onTap: this.goToBadges },
        { key: 'invite', iconName: 'gift', iconColor: '#E74C3C', label: '邀请好友', onTap: this.goToInvite },
        { key: 'nextTrip', iconName: 'map', iconColor: '#07C160', label: '下一趟行程', onTap: this.goToNextTrip },
        { key: 'service', iconName: 'chat', iconColor: '#4A90D9', label: '客服中心', onTap: this.goToService },
        { key: 'privacy', iconName: 'lock', iconColor: '#9B59B6', label: '隐私设置', onTap: this.goToPrivacy },
        { key: 'settings', iconName: 'setting', iconColor: '#666666', label: '设置', onTap: this.goToSettings }
      ];
    }
  },

  /**
   * Lifecycle: Page Show
   */
  onShow() {
    if (this.userStore.isLoggedIn) {
      this.loadPageData();
    } else {
      this.resetData();
    }
  },

  methods: {
    // ==================== Data Loading ====================

    async loadPageData() {
      try {
        // Fetch profile
        await this.userStore.fetchProfile();
        const profile = this.userStore.profile || {};

        // Fetch growth data
        let growthData = {};
        try {
          growthData = await userApi.getGrowth();
        } catch (e) {
          // growth API may not exist yet
        }

        // 哨兵模式状态
        try {
          const sentinel = await userApi.getSentinel();
          this.sentinelOn = !!(sentinel && sentinel.sentinel_enabled);
        } catch (e) {
          // 忽略:保持本地状态
        }

        this.profileData = {
          growth: growthData.growth_value || growthData.growth || profile.growth_value || profile.growth || 0,
          credit: growthData.credit_score || growthData.credit || profile.credit_score || profile.credit || 0,
          certified: profile.certified || false,
          certPending: profile.certPending || false,
          followingCount: profile.followingCount || 0,
          followerCount: profile.followerCount || 0,
          emergencyContacts: profile.emergencyContacts || 0,
          mileage: growthData.total_distance || growthData.mileage || profile.total_distance || profile.mileage || 0,
          // 我的车队:用"当前有效车队数"(已加入且行程仍在招募/进行中),而非累计 total_teams
          teamCount: profile.active_team_count !== undefined
            ? profile.active_team_count
            : (profile.activeTeamCount !== undefined
              ? profile.activeTeamCount
              : (growthData.total_teams || growthData.teamCount || profile.total_teams || profile.teamCount || 0)),
          assistCount: 0,
          mailCount: 0,
          couponCount: 0
        };

        // Update data overview items
        this.dataItems = [
          {
            key: 'mileage',
            value: this.formatNumber(this.profileData.mileage) + 'km',
            label: '累计里程',
            onTap: () => {}
          },
          {
            key: 'teams',
            value: this.profileData.teamCount + '车',
            label: '同行车辆',
            onTap: this.goToMyTeams
          },
          {
            key: 'assists',
            value: this.profileData.assistCount + '次',
            label: '互助次数',
            onTap: () => {}
          },
          {
            key: 'mails',
            value: this.profileData.mailCount + '人',
            label: '驿站邮差',
            onTap: () => {}
          },
          {
            key: 'coupons',
            value: this.profileData.couponCount + '张',
            label: '优惠券',
            onTap: this.goToCoupons
          }
        ];

        // Update team count
        this.teamCount = this.profileData.teamCount;
      } catch (err) {
        console.warn('Failed to load mine page data:', err);
        this.setDefaultDataItems();
      }
    },

    resetData() {
      this.profileData = {
        growth: 0, credit: 0, certified: false, certPending: false,
        followingCount: 0, followerCount: 0, emergencyContacts: 0,
        mileage: 0, teamCount: 0, assistCount: 0, mailCount: 0, couponCount: 0
      };
      this.setDefaultDataItems();
    },

    setDefaultDataItems() {
      this.dataItems = [
        { key: 'mileage', value: '0km', label: '累计里程', onTap: () => {} },
        { key: 'teams', value: '0车', label: '同行车辆', onTap: this.goToMyTeams },
        { key: 'assists', value: '0次', label: '互助次数', onTap: () => {} },
        { key: 'mails', value: '0人', label: '驿站邮差', onTap: () => {} },
        { key: 'coupons', value: '0张', label: '优惠券', onTap: this.goToCoupons }
      ];
    },

    // ==================== Pull-to-Refresh ====================

    async onRefresh() {
      this.refreshing = true;
      try {
        await this.loadPageData();
      } catch (e) {
        // ignore
      } finally {
        this.refreshing = false;
      }
    },

    // ==================== Utility ====================

    formatNumber(num) {
      if (num >= 10000) {
        return (num / 10000).toFixed(1) + 'w';
      }
      if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
      }
      return num.toString();
    },

    // ==================== Navigation ====================

    goToProfile() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      uni.navigateTo({
        url: '/pages/user/home?userId=' + this.userStore.userId
      });
    },

    goToMyTrips() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      uni.navigateTo({ url: '/pages/trip/my' });
    },

    goToMyTeams() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      // 独立的"我的车队"页面:展示已加入且行程仍招募/进行中的车队
      uni.navigateTo({ url: '/pages/trip/teams' });
    },

    goToFollow(type) {
      // type: 'following' or 'followers'
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      uni.navigateTo({
        url: '/pages/user/follows?type=' + (type === 'followers' ? 'followers' : 'following')
      });
    },

    goToBlacklist() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      uni.navigateTo({ url: '/pages/user/blacklist' });
    },

    goToCertify() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      uni.navigateTo({ url: '/pages/user/certify' });
    },

    goToEmergencyContacts() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      uni.navigateTo({ url: '/pages/user/emergency-contacts' });
    },

    async goToSentinelMode() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      const next = !this.sentinelOn;
      this.sentinelOn = next;
      try {
        await userApi.updateSentinel(next);
        uni.showToast({
          title: next ? '哨兵模式已开启' : '哨兵模式已关闭',
          icon: 'none'
        });
      } catch (err) {
        this.sentinelOn = !next;
        uni.showToast({ title: '操作失败，请重试', icon: 'none' });
      }
    },

    goToCreditScore() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      uni.navigateTo({ url: '/pages/user/credit-score' });
    },

    // ---- Function Grid Items ----

    goToOrders() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      uni.navigateTo({ url: '/pages/order/index' });
    },

    goToCoupons() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      uni.navigateTo({ url: '/pages/user/coupons' });
    },

    goToBadges() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      uni.navigateTo({ url: '/pages/user/badges' });
    },

    goToInvite() {
      uni.navigateTo({ url: '/pages/user/invite' });
    },

    goToNextTrip() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      uni.navigateTo({ url: '/pages/trip/next' });
    },

    goToService() {
      if (!this.userStore.isLoggedIn) {
        this.goToLogin();
        return;
      }
      uni.navigateTo({ url: '/pages/support/index' });
    },

    goToPrivacy() {
      uni.navigateTo({ url: '/pages/settings/privacy' });
    },

    goToSettings() {
      uni.navigateTo({ url: '/pages/settings/index' });
    },

    goToLogin() {
      uni.navigateTo({ url: '/pages/login/index' });
    },

    // ==================== Logout ====================

    handleLogout() {
      uni.showModal({
        title: '提示',
        content: '确定要退出登录吗？',
        confirmText: '退出',
        confirmColor: '#E74C3C',
        success: (res) => {
          if (res.confirm) {
            this.userStore.logout();
            this.resetData();
            uni.showToast({
              title: '已退出登录',
              icon: 'success',
              duration: 1500
            });
          }
        }
      });
    }
  }
};
</script>

<style lang="scss" scoped>
// ==================== Page ====================
.mine-page {
  width: 100%;
  min-height: 100vh;
  background: #F5F5F5;
}

.page-scroll {
  width: 100%;
  height: 100vh;
}

// ==================== User Card ====================
.user-card {
  position: relative;
  margin: 24rpx;
  border-radius: 24rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.06);
}

.user-card-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #07C160 0%, #05A84E 40%, #04943D 100%);
}

.user-card-content {
  position: relative;
  padding: 32rpx 28rpx 28rpx;
  z-index: 1;
}

.user-header {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.user-avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
  overflow: hidden;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
}

.user-nickname {
  font-size: 36rpx;
  font-weight: 700;
  color: #FFFFFF;
  max-width: 240rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level-badge {
  padding: 4rpx 14rpx;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 20rpx;
  flex-shrink: 0;
}

.level-badge text {
  font-size: 20rpx;
  color: #FFFFFF;
  font-weight: 600;
}

.user-id-row {
  .user-id {
    font-size: 24rpx;
    color: rgba(255, 255, 255, 0.7);
  }
}

.user-arrow {
  flex-shrink: 0;

  text {
    font-size: 40rpx;
    color: rgba(255, 255, 255, 0.6);
  }
}

// Growth Progress
.growth-section {
  margin-top: 28rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid rgba(255, 255, 255, 0.15);
}

.growth-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10rpx;
}

.growth-label {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
}

.growth-value {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
}

.progress-bar {
  width: 100%;
  height: 12rpx;
  // 轨道用深色,未填充时清晰可见为空;填充用白色
  background: rgba(0, 0, 0, 0.14);
  border-radius: 6rpx;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 6rpx;
  transition: width 0.5s ease;
}

.growth-hint {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 6rpx;
  display: block;
}

// Badge Row
.badge-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 20rpx;
}

.cert-badge {
  display: flex;
  align-items: center;
  gap: 4rpx;
  padding: 6rpx 14rpx;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 16rpx;

  &.pending {
    background: rgba(255, 193, 7, 0.3);
  }

  &.none {
    background: rgba(255, 255, 255, 0.15);
  }
}

.cert-icon {
  font-size: 22rpx;
}

.cert-text {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
}

.cert-type {
  font-size: 18rpx;
  color: rgba(255, 255, 255, 0.8);
}

.credit-badge {
  display: flex;
  align-items: center;
  gap: 4rpx;
  padding: 6rpx 14rpx;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 16rpx;
}

.credit-icon {
  font-size: 22rpx;
  color: #FFD700;
}

.credit-score {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
}

// ==================== Data Overview ====================
.data-overview {
  display: flex;
  justify-content: space-around;
  background: #FFFFFF;
  margin: 0 24rpx 16rpx;
  border-radius: 24rpx;
  padding: 24rpx 0;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.data-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  flex: 1;
}

.data-value {
  font-size: 30rpx;
  font-weight: 700;
  color: #1A1A1A;
}

.data-label {
  font-size: 22rpx;
  color: #999;
}

// ==================== Section Card ====================
.section-card {
  background: #FFFFFF;
  margin: 0 24rpx 16rpx;
  border-radius: 24rpx;
  padding: 24rpx 0 8rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1A1A1A;
  padding: 0 28rpx 16rpx;
  border-bottom: 1rpx solid #F5F5F5;

  &.accent {
    color: #FF6B35;
  }
}

.safety-section {
  border: 1rpx solid rgba(255, 107, 53, 0.2);
}

// ==================== Menu List ====================
.menu-list {
  padding: 4rpx 0;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 28rpx;
  transition: background 0.15s ease;

  &:active {
    background: #F9F9F9;
  }
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.menu-icon {
  font-size: 36rpx;
}

.menu-label {
  font-size: 28rpx;
  color: #1A1A1A;
}

.menu-right {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.menu-badge {
  font-size: 20rpx;
  color: #07C160;
  background: rgba(7, 193, 96, 0.08);
  padding: 4rpx 12rpx;
  border-radius: 12rpx;
}

.menu-count {
  font-size: 24rpx;
  color: #999;
}

.menu-status {
  font-size: 24rpx;
  color: #999;

  &.done {
    color: #07C160;
  }

  &.pending {
    color: #F5A623;
  }

  &.todo {
    color: #999;
  }
}

.menu-score {
  font-size: 24rpx;
  color: #F5A623;
  font-weight: 600;
}

.menu-arrow {
  font-size: 32rpx;
  color: #CCCCCC;
}

// ==================== Function Grid ====================
.func-grid {
  display: flex;
  flex-wrap: wrap;
  padding: 16rpx 12rpx 8rpx;
}

.func-item {
  width: 25%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  padding: 20rpx 0;
  transition: transform 0.15s ease;

  &:active {
    transform: scale(0.94);
  }
}

.func-icon-wrap {
  width: 84rpx;
  height: 84rpx;
  background: #F5F5F5;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.func-icon {
  font-size: 40rpx;
}

.func-label {
  font-size: 22rpx;
  color: #333;
}

// ==================== Logout / Login ====================
.logout-section {
  padding: 32rpx 24rpx;
}

.logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  background: #FFFFFF;
  border: 1rpx solid #E0E0E0;
  border-radius: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);

  text {
    font-size: 28rpx;
    color: #999;
  }

  &:active {
    background: #F5F5F5;
  }
}

.login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  background: linear-gradient(135deg, #07C160, #05A84E);
  border-radius: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(7, 193, 96, 0.3);

  text {
    font-size: 30rpx;
    color: #FFFFFF;
    font-weight: 600;
  }

  &:active {
    opacity: 0.85;
  }
}

// ==================== Safe Area ====================
.safe-area-bottom-placeholder {
  height: calc(40rpx + constant(safe-area-inset-bottom));
  height: calc(40rpx + env(safe-area-inset-bottom));
}
</style>
