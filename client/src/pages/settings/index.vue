<template>
  <view class="settings-page">
    <scroll-view class="settings-scroll" scroll-y>
      <!-- ==================== User Info Preview ==================== -->
      <view class="user-preview card" @click="goToProfile">
                <view class="preview-avatar">
          <local-image style="width:100%;height:100%;"
          :src="userStore.avatar"
         
          mode="aspectFill"
         />
        </view>
        <view class="preview-info">
          <text class="preview-name">{{ userStore.nickname }}</text>
          <text class="preview-id">ID: {{ userStore.userId }}</text>
        </view>
        <text class="preview-arrow">›</text>
      </view>

      <!-- ==================== Section: 账号安全 ==================== -->
      <view class="section-card">
        <view class="section-title">账号安全</view>
        <view class="menu-list">
          <view class="menu-item" @click="changePhone">
            <view class="menu-left">
              <u-icon name="phone" size="34" color="#07C160" />
              <text class="menu-label">修改手机号</text>
            </view>
            <view class="menu-right">
              <text class="menu-value">{{ maskedPhone }}</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
          <view class="menu-item" @click="changePassword">
            <view class="menu-left">
              <u-icon name="lock" size="34" color="#FF8F00" />
              <text class="menu-label">修改密码</text>
            </view>
            <view class="menu-right">
              <text class="menu-arrow">›</text>
            </view>
          </view>
          <view class="menu-item" @click="deactivateAccount">
            <view class="menu-left">
              <u-icon name="warning" size="34" color="#E74C3C" />
              <text class="menu-label danger-text">账号注销</text>
            </view>
            <view class="menu-right">
              <text class="menu-arrow">›</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ==================== Section: 通知设置 ==================== -->
      <view class="section-card">
        <view class="section-title">通知设置</view>
        <view class="menu-list">
          <view class="menu-item toggle-item">
            <view class="menu-left">
              <u-icon name="bell" size="34" color="#FF8F00" />
              <text class="menu-label">消息通知</text>
            </view>
            <switch
              :checked="notifications.message"
              color="#07C160"
              @change="toggleNotification('message', $event.detail.value)"
            />
          </view>
          <view class="menu-item toggle-item">
            <view class="menu-left">
              <u-icon name="heart" size="34" color="#E74C3C" />
              <text class="menu-label">拼团提醒</text>
            </view>
            <switch
              :checked="notifications.groupBuy"
              color="#07C160"
              @change="toggleNotification('groupBuy', $event.detail.value)"
            />
          </view>
          <view class="menu-item toggle-item">
            <view class="menu-left">
              <u-icon name="car" size="34" color="#07C160" />
              <text class="menu-label">行程提醒</text>
            </view>
            <switch
              :checked="notifications.trip"
              color="#07C160"
              @change="toggleNotification('trip', $event.detail.value)"
            />
          </view>
        </view>
      </view>

      <!-- ==================== Section: 通用 ==================== -->
      <view class="section-card">
        <view class="section-title">通用</view>
        <view class="menu-list">
          <view class="menu-item" @click="chooseMapApp">
            <view class="menu-left">
              <u-icon name="map" size="34" color="#07C160" />
              <text class="menu-label">地图设置</text>
            </view>
            <view class="menu-right">
              <text class="menu-value">{{ mapAppName }}</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
          <view class="menu-item" @click="clearCache">
            <view class="menu-left">
              <u-icon name="trash" size="34" color="#999999" />
              <text class="menu-label">清除缓存</text>
            </view>
            <view class="menu-right">
              <text class="menu-value">{{ cacheSize }}</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
          <view class="menu-item" @click="goToAbout">
            <view class="menu-left">
              <u-icon name="info-circle" size="34" color="#4A90D9" />
              <text class="menu-label">关于同道</text>
            </view>
            <view class="menu-right">
              <text class="menu-value">{{ appVersion }}</text>
              <text class="menu-arrow">›</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ==================== Logout Button ==================== -->
      <view class="logout-area">
        <view class="logout-btn" @click="handleLogout">
          <text>退出登录</text>
        </view>
      </view>

      <!-- Bottom Safe Area -->
      <view class="safe-area-bottom-placeholder"></view>
    </scroll-view>

    <!-- ==================== 修改手机号弹窗 ==================== -->
    <view v-if="showPhoneModal" class="modal-mask" @click="closePhoneModal">
      <view class="modal-card" @click.stop>
        <view class="modal-header">
          <text class="modal-title">修改手机号</text>
          <text class="modal-close" @click="closePhoneModal">✕</text>
        </view>
        <view class="form-item">
          <text class="form-label">新手机号</text>
          <input v-model="phoneForm.phone" class="form-input" type="number" placeholder="请输入新手机号" maxlength="11" />
        </view>
        <view class="form-item">
          <text class="form-label">验证码</text>
          <view class="code-row">
            <input v-model="phoneForm.code" class="form-input code-input" type="number" placeholder="6位验证码" maxlength="6" />
            <view class="code-btn" :class="{ disabled: sendingCode || codeCountdown > 0 }" @click="sendPhoneCode">
              <text>{{ codeCountdown > 0 ? codeCountdown + 's' : (sendingCode ? '发送中...' : '获取验证码') }}</text>
            </view>
          </view>
        </view>
        <view class="modal-actions">
          <view class="modal-btn cancel" @click="closePhoneModal"><text>取消</text></view>
          <view class="modal-btn confirm" :class="{ disabled: submitting }" @click="submitChangePhone">
            <text>{{ submitting ? '提交中...' : '确认修改' }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ==================== 修改密码弹窗 ==================== -->
    <view v-if="showPwdModal" class="modal-mask" @click="closePwdModal">
      <view class="modal-card" @click.stop>
        <view class="modal-header">
          <text class="modal-title">修改密码</text>
          <text class="modal-close" @click="closePwdModal">✕</text>
        </view>
        <view class="form-item">
          <text class="form-label">当前密码</text>
          <input v-model="pwdForm.old" class="form-input" password placeholder="首次设置可留空" />
        </view>
        <view class="form-item">
          <text class="form-label">新密码</text>
          <input v-model="pwdForm.n1" class="form-input" password placeholder="至少6位" maxlength="20" />
        </view>
        <view class="form-item">
          <text class="form-label">确认新密码</text>
          <input v-model="pwdForm.n2" class="form-input" password placeholder="再次输入新密码" maxlength="20" />
        </view>
        <view class="modal-actions">
          <view class="modal-btn cancel" @click="closePwdModal"><text>取消</text></view>
          <view class="modal-btn confirm" :class="{ disabled: submitting }" @click="submitChangePassword">
            <text>{{ submitting ? '提交中...' : '确认修改' }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { useUserStore } from '@/store/user.js';
import { useTripStore } from '@/store/trip.js';
import { authApi } from '@/utils/api.js';

export default {
  data() {
    return {
      notifications: {
        message: true,
        groupBuy: true,
        trip: true
      },
      mapAppName: '高德地图',
      cacheSize: '0 KB',
      appVersion: '1.0.0',

      // ---- 修改手机号 ----
      showPhoneModal: false,
      phoneForm: { phone: '', code: '' },
      sendingCode: false,
      codeCountdown: 0,

      // ---- 修改密码 ----
      showPwdModal: false,
      pwdForm: { old: '', n1: '', n2: '' },
      submitting: false
    };
  },

  computed: {
    userStore() {
      return useUserStore();
    },
    /**
     * Mask phone number for display
     */
    maskedPhone() {
      const profile = this.userStore.profile;
      let phone = (profile && profile.phone) || '';
      if (phone && phone.length >= 11) {
        phone = phone.slice(0, 3) + '****' + phone.slice(-4);
      }
      return phone || '未绑定';
    }
  },

  onShow() {
    this.loadSettings();
    this.calculateCacheSize();
  },

  methods: {
    /** Load current settings from storage */
    loadSettings() {
      try {
        const stored = uni.getStorageSync('settings_notifications');
        if (stored) {
          this.notifications = { ...this.notifications, ...JSON.parse(stored) };
        }
        const mapApp = uni.getStorageSync('settings_map_app');
        if (mapApp) {
          this.mapAppName = mapApp;
        }
      } catch (e) {
        // ignore
      }
    },

    /** Calculate cache size */
    calculateCacheSize() {
      // In real Uni-App, use plus.cache.calculate on App
      // MVP: read from storage info
      try {
        const info = uni.getStorageInfoSync();
        const size = info.currentSize || 0;
        if (size < 1024) {
          this.cacheSize = size + ' KB';
        } else {
          this.cacheSize = (size / 1024).toFixed(1) + ' MB';
        }
      } catch (e) {
        this.cacheSize = '--';
      }
    },

    // ---- Navigation ----

    /** Go to profile edit */
    goToProfile() {
      uni.navigateTo({
        url: '/pages/user/home?userId=' + this.userStore.userId
      });
    },

    /** Change phone number - 打开弹窗 */
    changePhone() {
      this.phoneForm = { phone: '', code: '' };
      this.showPhoneModal = true;
    },

    closePhoneModal() {
      if (this.sendingCode) return;
      this.showPhoneModal = false;
    },

    /** 发送新手机号验证码 */
    async sendPhoneCode() {
      const phone = (this.phoneForm.phone || '').trim();
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        uni.showToast({ title: '请输入正确的手机号', icon: 'none' });
        return;
      }
      this.sendingCode = true;
      try {
        await authApi.sendCode(phone);
        uni.showToast({ title: '验证码已发送', icon: 'success' });
        this.codeCountdown = 60;
        const timer = setInterval(() => {
          this.codeCountdown -= 1;
          if (this.codeCountdown <= 0) clearInterval(timer);
        }, 1000);
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '发送失败', icon: 'none' });
      } finally {
        this.sendingCode = false;
      }
    },

    /** 提交修改手机号 */
    async submitChangePhone() {
      const phone = (this.phoneForm.phone || '').trim();
      const code = (this.phoneForm.code || '').trim();
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        uni.showToast({ title: '请输入正确的手机号', icon: 'none' });
        return;
      }
      if (!code) {
        uni.showToast({ title: '请输入验证码', icon: 'none' });
        return;
      }
      this.submitting = true;
      try {
        const result = await authApi.changePhone(phone, code);
        if (result && result.token) {
          uni.setStorageSync('token', result.token);
        }
        this.showPhoneModal = false;
        await this.userStore.fetchProfile();
        uni.showToast({ title: '手机号已修改', icon: 'success' });
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '修改失败', icon: 'none' });
      } finally {
        this.submitting = false;
      }
    },

    /** Change password - 打开弹窗 */
    changePassword() {
      this.pwdForm = { old: '', n1: '', n2: '' };
      this.showPwdModal = true;
    },

    closePwdModal() {
      if (this.submitting) return;
      this.showPwdModal = false;
    },

    /** 提交修改密码 */
    async submitChangePassword() {
      const { old: oldPwd, n1, n2 } = this.pwdForm;
      if (n1.length < 6) {
        uni.showToast({ title: '新密码长度至少6位', icon: 'none' });
        return;
      }
      if (n1 !== n2) {
        uni.showToast({ title: '两次输入的新密码不一致', icon: 'none' });
        return;
      }
      this.submitting = true;
      try {
        await authApi.changePassword(oldPwd || undefined, n1);
        this.showPwdModal = false;
        uni.showToast({ title: '密码已修改', icon: 'success' });
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '修改失败', icon: 'none' });
      } finally {
        this.submitting = false;
      }
    },

    /** Deactivate account */
    deactivateAccount() {
      uni.showModal({
        title: '账号注销',
        content: '注销后您的所有数据将被永久删除且无法恢复。确定要注销账号吗？',
        confirmText: '确认注销',
        confirmColor: '#E74C3C',
        success: (res) => {
          if (res.confirm) {
            uni.showModal({
              title: '再次确认',
              content: '注销后不可恢复，是否继续？',
              confirmText: '是的，我要注销',
              confirmColor: '#E74C3C',
              success: (res2) => {
                if (res2.confirm) {
                  this.doDeactivate();
                }
              }
            });
          }
        }
      });
    },

    /** Execute account deactivation */
    async doDeactivate() {
      uni.showLoading({ title: '注销中...' });
      try {
        await authApi.deactivate();
        uni.hideLoading();
        uni.showToast({ title: '账号已注销', icon: 'success' });
        try {
          uni.removeStorageSync('token');
          uni.removeStorageSync('userInfo');
        } catch (e) { /* ignore */ }
        setTimeout(() => {
          uni.reLaunch({ url: '/pages/login/index' });
        }, 1200);
      } catch (err) {
        uni.hideLoading();
        uni.showToast({ title: (err && err.message) || '注销失败', icon: 'none' });
      }
    },

    // ---- Notification Toggles ----

    /** Toggle a notification setting */
    toggleNotification(key, value) {
      this.notifications[key] = value;
      try {
        uni.setStorageSync('settings_notifications', JSON.stringify(this.notifications));
      } catch (e) {
        // ignore
      }
      const labels = {
        message: '消息通知',
        groupBuy: '拼团提醒',
        trip: '行程提醒'
      };
      uni.showToast({
        title: labels[key] + (value ? '已开启' : '已关闭'),
        icon: 'none',
        duration: 1000
      });
    },

    // ---- Map Settings ----

    /** Choose default map app */
    chooseMapApp() {
      uni.showActionSheet({
        itemList: ['高德地图', '百度地图', '腾讯地图', '苹果地图'],
        success: (res) => {
          const apps = ['高德地图', '百度地图', '腾讯地图', '苹果地图'];
          this.mapAppName = apps[res.tapIndex];
          try {
            uni.setStorageSync('settings_map_app', this.mapAppName);
          } catch (e) {
            // ignore
          }
        }
      });
    },

    // ---- Clear Cache ----

    /** Clear app cache */
    clearCache() {
      uni.showModal({
        title: '清除缓存',
        content: '将清除所有本地缓存数据，包括图片缓存和临时文件。是否继续？',
        confirmText: '确定清除',
        confirmColor: '#FF6B35',
        success: async (res) => {
          if (res.confirm) {
            uni.showLoading({ title: '清理中...', mask: true });
            try {
              uni.clearStorageSync();
              this.notifications = {
                message: true,
                groupBuy: true,
                trip: true
              };
              this.mapAppName = '高德地图';
              uni.hideLoading();
              uni.showToast({ title: '缓存已清除', icon: 'success' });
              this.calculateCacheSize();
            } catch (e) {
              uni.hideLoading();
              uni.showToast({ title: '清除失败', icon: 'none' });
            }
          }
        }
      });
    },

    // ---- About ----

    /** Go to about page */
    goToAbout() {
      uni.showModal({
        title: '关于同道',
        content: '同道 CoRoad v' + this.appVersion + '\n\n一个有趣的自驾社交平台\n\n驾驶不再是孤独的旅程。',
        showCancel: false,
        confirmText: '知道了'
      });
    },

    // ---- Logout ----

    /** Handle logout */
    handleLogout() {
      uni.showModal({
        title: '退出登录',
        content: '确定要退出当前账号吗？',
        confirmText: '退出',
        confirmColor: '#E74C3C',
        success: (res) => {
          if (res.confirm) {
            this.doLogout();
          }
        }
      });
    },

    /** Execute logout */
    doLogout() {
      // Clear token and stores
      const userStore = useUserStore();
      const tripStore = useTripStore();

      userStore.logout();
      tripStore.resetAll();

      // Clear all storage
      try {
        uni.clearStorageSync();
      } catch (e) {
        // ignore
      }

      uni.showToast({
        title: '已退出登录',
        icon: 'success',
        duration: 1500
      });

      setTimeout(() => {
        uni.reLaunch({
          url: '/pages/login/index'
        });
      }, 1500);
    }
  }
};
</script>

<style lang="scss" scoped>
.settings-page {
  width: 100%;
  min-height: 100vh;
  background-color: var(--color-bg);
}

.settings-scroll {
  width: 100%;
  height: 100vh;
}

// ==================== User Preview ====================
.user-preview {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin: 20rpx 24rpx;
  padding: 24rpx;
  background-color: var(--color-bg-white);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);

  .preview-avatar {
    width: 96rpx;
    height: 96rpx;
    border-radius: 50%;
    background-color: var(--color-divider);
    border: 3rpx solid #F0F0F0;
    flex-shrink: 0;
    overflow: hidden;
  }

  .preview-info {
    flex: 1;
    min-width: 0;

    .preview-name {
      display: block;
      font-size: var(--font-lg);
      font-weight: 600;
      color: var(--color-text-primary);
      margin-bottom: 6rpx;
    }

    .preview-id {
      font-size: var(--font-xs);
      color: var(--color-text-hint);
    }
  }

  .preview-arrow {
    font-size: 36rpx;
    color: var(--color-text-hint);
    flex-shrink: 0;
  }

  &:active {
    background-color: #F9F9F9;
  }
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
.menu-list {
  // no additional styling needed
}

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

  &.toggle-item {
    // full-height for switch
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
  font-size: var(--font-md);
  color: var(--color-text-primary);

  &.danger-text {
    color: var(--color-danger);
  }
}

.menu-right {
  display: flex;
  align-items: center;
  gap: 8rpx;
}

.menu-value {
  font-size: var(--font-sm);
  color: var(--color-text-hint);
}

.menu-arrow {
  font-size: 32rpx;
  color: #CCCCCC;
}

// ==================== Logout ====================
.logout-area {
  padding: 40rpx 24rpx;
}

.logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 96rpx;
  background-color: var(--color-bg-white);
  border-radius: 24rpx;
  box-shadow: var(--shadow-sm);

  text {
    font-size: var(--font-lg);
    color: var(--color-danger);
    font-weight: 500;
  }

  &:active {
    background-color: #FFF0F0;
  }
}

// ==================== Safe Area ====================
.safe-area-bottom-placeholder {
  height: calc(40rpx + constant(safe-area-inset-bottom));
  height: calc(40rpx + env(safe-area-inset-bottom));
}

// ==================== 弹窗 ====================
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-card {
  width: 620rpx;
  background: #FFFFFF;
  border-radius: 28rpx;
  padding: 36rpx 32rpx 28rpx;
  box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.2);

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 28rpx;

    .modal-title {
      font-size: 34rpx;
      font-weight: 700;
      color: #1A1A1A;
    }

    .modal-close {
      font-size: 28rpx;
      color: #999;
      padding: 8rpx;
    }
  }

  .form-item {
    margin-bottom: 24rpx;

    .form-label {
      font-size: 26rpx;
      color: #666;
      display: block;
      margin-bottom: 12rpx;
    }

    .form-input {
      height: 80rpx;
      padding: 0 24rpx;
      background: #F5F5F5;
      border-radius: 16rpx;
      font-size: 28rpx;
      flex: 1;
    }

    .code-row {
      display: flex;
      gap: 16rpx;

      .code-input {
        flex: 1;
      }

      .code-btn {
        width: 200rpx;
        height: 80rpx;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #E8F8EF;
        color: #07C160;
        border-radius: 16rpx;
        font-size: 24rpx;

        &.disabled {
          opacity: 0.6;
        }
      }
    }
  }

  .modal-actions {
    display: flex;
    gap: 20rpx;
    margin-top: 32rpx;

    .modal-btn {
      flex: 1;
      height: 84rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 20rpx;
      font-size: 30rpx;
      font-weight: 600;

      &.cancel {
        background: #F5F5F5;
        color: #666;
      }

      &.confirm {
        background: linear-gradient(135deg, #07C160, #05A84E);
        color: #FFFFFF;

        &.disabled {
          opacity: 0.6;
        }
      }
    }
  }
}
</style>
