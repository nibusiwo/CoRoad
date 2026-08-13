<template>
  <view class="privacy-page">
    <scroll-view class="privacy-scroll" scroll-y>
      <!-- ==================== Section: 发现与可见性 ==================== -->
      <view class="section-card">
        <view class="section-title">发现与可见性</view>
        <view class="menu-list">
          <!-- 可被其他车队发现 -->
          <view class="menu-item toggle-item">
            <view class="menu-left">
              <text class="menu-icon">🔍</text>
              <view class="menu-text-wrap">
                <text class="menu-label">可被其他车队发现</text>
                <text class="menu-desc">关闭后，你的车队不会出现在附近车队列表中</text>
              </view>
            </view>
            <switch
              :checked="privacy.canBeDiscovered"
              color="#07C160"
              @change="toggleSetting('canBeDiscovered', $event.detail.value)"
            />
          </view>

          <!-- 位置共享 -->
          <view class="menu-item toggle-item">
            <view class="menu-left">
              <text class="menu-icon">📍</text>
              <view class="menu-text-wrap">
                <text class="menu-label">位置共享</text>
                <text class="menu-desc">加入车队后自动共享实时位置</text>
              </view>
            </view>
            <switch
              :checked="privacy.autoShareLocation"
              color="#07C160"
              @change="toggleSetting('autoShareLocation', $event.detail.value)"
            />
          </view>
        </view>
      </view>

      <!-- ==================== Section: 互动隐私 ==================== -->
      <view class="section-card">
        <view class="section-title">互动隐私</view>
        <view class="menu-list">
          <!-- 允许陌生人私信 -->
          <view class="menu-item toggle-item">
            <view class="menu-left">
              <text class="menu-icon">💬</text>
              <view class="menu-text-wrap">
                <text class="menu-label">允许陌生人私信</text>
                <text class="menu-desc">关闭后仅好友和队友可向你发送私信</text>
              </view>
            </view>
            <switch
              :checked="privacy.allowStrangerDM"
              color="#07C160"
              @change="toggleSetting('allowStrangerDM', $event.detail.value)"
            />
          </view>
        </view>
      </view>

      <!-- ==================== Section: 个人资料可见性 ==================== -->
      <view class="section-card">
        <view class="section-title">个人资料可见性</view>
        <view class="menu-list">
          <!-- 手机号可见性 -->
          <view class="menu-item" @click="showPhoneVisibilityPicker">
            <view class="menu-left">
              <text class="menu-icon">📞</text>
              <view class="menu-text-wrap">
                <text class="menu-label">手机号可见性</text>
                <text class="menu-desc">{{ phoneVisibilityLabel }}</text>
              </view>
            </view>
            <view class="menu-right">
              <text class="menu-arrow">›</text>
            </view>
          </view>

          <!-- 行程记录可见性 -->
          <view class="menu-item toggle-item">
            <view class="menu-left">
              <text class="menu-icon">📋</text>
              <view class="menu-text-wrap">
                <text class="menu-label">行程记录可见性</text>
                <text class="menu-desc">{{ privacy.tripHistoryPublic ? '所有人可见' : '仅自己可见' }}</text>
              </view>
            </view>
            <switch
              :checked="privacy.tripHistoryPublic"
              color="#07C160"
              @change="toggleSetting('tripHistoryPublic', $event.detail.value)"
            />
          </view>
        </view>
      </view>

      <!-- ==================== Section: 黑名单 ==================== -->
      <view class="section-card">
        <view class="menu-list">
          <view class="menu-item" @click="goToBlacklist">
            <view class="menu-left">
              <text class="menu-icon">🚫</text>
              <text class="menu-label">黑名单管理</text>
            </view>
            <view class="menu-right">
              <text class="menu-count" v-if="blacklistCount > 0">{{ blacklistCount }}人</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
        </view>
      </view>

      <!-- Bottom Safe Area -->
      <view class="safe-area-bottom-placeholder"></view>
    </scroll-view>
  </view>
</template>

<script>
import { userApi } from '@/utils/api.js';

export default {
  data() {
    return {
      privacy: {
        canBeDiscovered: true,
        autoShareLocation: true,
        allowStrangerDM: false,
        phoneVisibility: 'team', // 'all' | 'team' | 'self'
        tripHistoryPublic: true
      },
      blacklistCount: 0,
      saving: false
    };
  },

  computed: {
    phoneVisibilityLabel() {
      const labels = {
        all: '所有人',
        team: '仅队友',
        self: '仅自己'
      };
      return labels[this.privacy.phoneVisibility] || '仅队友';
    }
  },

  onLoad() {
    this.fetchPrivacySettings();
  },

  onShow() {
    this.fetchPrivacySettings();
  },

  methods: {
    /** Fetch current privacy settings */
    async fetchPrivacySettings() {
      try {
        // Try fetching from API first
        const profile = await userApi.getProfile();
        if (profile) {
          this.privacy = {
            canBeDiscovered: profile.canBeDiscovered !== undefined ? profile.canBeDiscovered : true,
            autoShareLocation: profile.autoShareLocation !== undefined ? profile.autoShareLocation : true,
            allowStrangerDM: profile.allowStrangerDM !== undefined ? profile.allowStrangerDM : false,
            phoneVisibility: profile.phoneVisibility || 'team',
            tripHistoryPublic: profile.tripHistoryPublic !== undefined ? profile.tripHistoryPublic : true
          };
          this.blacklistCount = profile.blacklistCount || 0;
        }
      } catch (err) {
        // Fall back to local storage
        try {
          const stored = uni.getStorageSync('privacy_settings');
          if (stored) {
            this.privacy = { ...this.privacy, ...JSON.parse(stored) };
          }
        } catch (e) {
          // ignore
        }
      }
    },

    /** Toggle a privacy setting */
    async toggleSetting(key, value) {
      this.privacy[key] = value;

      // Save locally
      try {
        uni.setStorageSync('privacy_settings', JSON.stringify(this.privacy));
      } catch (e) {
        // ignore
      }

      // Call API to persist
      try {
        await userApi.updateProfile({ [key]: value });
      } catch (err) {
        // Revert on failure
        this.privacy[key] = !value;
        uni.showToast({ title: '设置失败，请重试', icon: 'none' });
        return;
      }

      const labels = {
        canBeDiscovered: '车队发现',
        autoShareLocation: '位置共享',
        allowStrangerDM: '陌生人私信',
        tripHistoryPublic: '行程记录可见性'
      };
      uni.showToast({
        title: (labels[key] || key) + (value ? '已开启' : '已关闭'),
        icon: 'none',
        duration: 1000
      });
    },

    /** Show phone visibility picker */
    showPhoneVisibilityPicker() {
      const items = ['所有人', '仅队友', '仅自己'];
      uni.showActionSheet({
        itemList: items,
        itemColor: '#1A1A1A',
        success: async (res) => {
          const values = ['all', 'team', 'self'];
          const newValue = values[res.tapIndex];

          if (newValue !== this.privacy.phoneVisibility) {
            this.privacy.phoneVisibility = newValue;

            // Save locally
            try {
              uni.setStorageSync('privacy_settings', JSON.stringify(this.privacy));
            } catch (e) {
              // ignore
            }

            // Call API
            try {
              await userApi.updateProfile({ phoneVisibility: newValue });
              uni.showToast({ title: '手机号可见性已更新', icon: 'none' });
            } catch (err) {
              this.privacy.phoneVisibility = values[res.tapIndex === 0 ? 1 : 0];
              uni.showToast({ title: '更新失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** Navigate to blacklist management */
    goToBlacklist() {
      uni.navigateTo({ url: '/pages/user/blacklist' });
    }
  }
};
</script>

<style lang="scss" scoped>
.privacy-page {
  width: 100%;
  min-height: 100vh;
  background-color: var(--color-bg);
}

.privacy-scroll {
  width: 100%;
  height: 100vh;
}

// ==================== Section Card ====================
.section-card {
  background-color: var(--color-bg-white);
  margin: 0 24rpx 16rpx;
  border-radius: 20rpx;
  padding: 0 0 8rpx;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.section-title {
  font-size: var(--font-xs);
  color: var(--color-text-hint);
  padding: 20rpx 28rpx 12rpx;
  display: block;
  letter-spacing: 1rpx;
}

// ==================== Menu List ====================
.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 28rpx;
  transition: background 0.15s ease;
  min-height: 88rpx;

  &:active {
    background-color: #F9F9F9;
  }
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
  flex: 1;
  min-width: 0;
}

.menu-icon {
  font-size: 36rpx;
  flex-shrink: 0;
}

.menu-text-wrap {
  flex: 1;
  min-width: 0;
}

.menu-label {
  display: block;
  font-size: var(--font-md);
  color: var(--color-text-primary);
  margin-bottom: 4rpx;
}

.menu-desc {
  display: block;
  font-size: 20rpx;
  color: var(--color-text-hint);
  line-height: 1.4;
}

.menu-right {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-shrink: 0;
}

.menu-count {
  font-size: var(--font-xs);
  color: var(--color-text-hint);
}

.menu-arrow {
  font-size: 32rpx;
  color: #CCCCCC;
}

// ==================== Safe Area ====================
.safe-area-bottom-placeholder {
  height: calc(40rpx + constant(safe-area-inset-bottom));
  height: calc(40rpx + env(safe-area-inset-bottom));
}
</style>
