<template>
  <view class="login-page">
    <!-- ==================== Top Decoration ==================== -->
    <view class="top-decoration">
      <view class="decoration-circle circle-1"></view>
      <view class="decoration-circle circle-2"></view>
      <view class="decoration-circle circle-3"></view>
    </view>

    <!-- ==================== Logo & Brand ==================== -->
    <view class="brand-section">
      <view class="logo-wrap">
        <image class="logo-image" src="/static/logo.png" mode="aspectFit" />
      </view>
      <text class="app-name">同道</text>
      <text class="app-slogan">CoRoad - 自驾社交，同道同行</text>
    </view>

    <!-- ==================== Main Login Area ==================== -->
    <view class="login-area">
      <!-- ---- WeChat Login Button ---- -->
      <view class="wechat-login-btn" @tap="handleWechatLogin">
        <text class="wechat-icon">💚</text>
        <text class="wechat-text">微信一键登录</text>
      </view>

      <!-- ---- Divider ---- -->
      <view class="divider-row">
        <view class="divider-line"></view>
        <text class="divider-text">或</text>
        <view class="divider-line"></view>
      </view>

      <!-- ---- Phone Login ---- -->
      <view class="phone-login-section">
        <!-- 登录方式切换 -->
        <view class="login-mode-tabs">
          <view class="mode-tab" :class="{ active: loginMode === 'code' }" @tap="loginMode = 'code'">
            <text>验证码登录</text>
          </view>
          <view class="mode-tab" :class="{ active: loginMode === 'password' }" @tap="loginMode = 'password'">
            <text>密码登录</text>
          </view>
          <view class="mode-tab" :class="{ active: loginMode === 'register' }" @tap="loginMode = 'register'">
            <text>注册</text>
          </view>
        </view>

        <!-- Phone Input -->
        <view class="input-group">
          <view class="input-prefix">
            <text>+86</text>
          </view>
          <input
            class="input-field"
            type="number"
            v-model="phone"
            placeholder="请输入手机号"
            maxlength="11"
            placeholder-style="color: #BBBBBB"
          />
        </view>

        <!-- Verification Code Input (验证码登录/注册共用) -->
        <view v-if="loginMode === 'code' || loginMode === 'register'" class="input-group">
          <input
            class="input-field"
            type="number"
            v-model="code"
            placeholder="请输入验证码"
            maxlength="6"
            placeholder-style="color: #BBBBBB"
          />
          <view
            class="code-btn"
            :class="{ sending: codeSending, disabled: !canSendCode }"
            @tap="sendVerifyCode"
          >
            <text v-if="!codeSending">发送验证码</text>
            <text v-else>{{ codeCountdown }}s后重发</text>
          </view>
        </view>

        <!-- Password Input (密码登录) -->
        <view v-if="loginMode === 'password'" class="input-group">
          <input
            class="input-field"
            type="password"
            v-model="password"
            placeholder="请输入密码"
            maxlength="20"
            placeholder-style="color: #BBBBBB"
          />
        </view>

        <!-- Password Input (注册) -->
        <view v-if="loginMode === 'register'" class="input-group">
          <input
            class="input-field"
            type="password"
            v-model="password"
            placeholder="请设置密码（6-20位）"
            maxlength="20"
            placeholder-style="color: #BBBBBB"
          />
        </view>

        <!-- Confirm Password Input (注册) -->
        <view v-if="loginMode === 'register'" class="input-group">
          <input
            class="input-field"
            type="password"
            v-model="confirmPassword"
            placeholder="请再次输入密码"
            maxlength="20"
            placeholder-style="color: #BBBBBB"
          />
        </view>

        <!-- Nickname Input (注册, 可选) -->
        <view v-if="loginMode === 'register'" class="input-group">
          <input
            class="input-field"
            type="text"
            v-model="nickname"
            placeholder="昵称（选填）"
            maxlength="20"
            placeholder-style="color: #BBBBBB"
          />
        </view>

        <!-- Phone Login Button -->
        <view
          class="phone-login-btn"
          :class="{ disabled: !canLogin }"
          @tap="handleLogin"
        >
          <text>{{ loginMode === 'register' ? '注册并登录' : '登录' }}</text>
        </view>
      </view>

      <!-- ---- Agreement Text ---- -->
      <view class="agreement-text">
        <text class="agree-desc">登录即表示同意</text>
        <text class="agree-link" @tap="openAgreement('user')">《用户协议》</text>
        <text class="agree-desc">和</text>
        <text class="agree-link" @tap="openAgreement('privacy')">《隐私政策》</text>
      </view>
    </view>

    <!-- ==================== Skip / Browse Option ==================== -->
    <view class="skip-section">
      <text class="skip-text" @tap="skipLogin">暂不登录，先看看 ›</text>
    </view>
  </view>
</template>

<script>
import { useUserStore } from '@/store/user.js';
import { authApi } from '@/utils/api.js';

export default {
  data() {
    return {
      // ---- Phone Login ----
      phone: '',
      code: '',
      password: '',
      confirmPassword: '',
      nickname: '',
      loginMode: 'code',

      // ---- Code Sending ----
      codeSending: false,
      codeCountdown: 60,
      codeTimer: null,

      // ---- Loading State ----
      loading: false
    };
  },

  computed: {
    userStore() {
      return useUserStore();
    },

    /**
     * Whether verification code can be sent
     */
    canSendCode() {
      return !this.codeSending && this.phone.length === 11 && /^1\d{10}$/.test(this.phone);
    },

    /**
     * Whether login button is enabled
     */
    canLogin() {
      if (this.phone.length !== 11 || !/^1\d{10}$/.test(this.phone) || this.loading) return false;
      if (this.loginMode === 'register') {
        return this.code.length >= 4 && this.password.length >= 6 && this.password === this.confirmPassword;
      }
      if (this.loginMode === 'code') return this.code.length >= 4;
      return this.password.length >= 6;
    }
  },

  /**
   * Lifecycle: Page Mounted
   */
  onLoad() {
    // Check if already logged in
    this.checkLoginState();
  },

  /**
   * Lifecycle: Page Unload
   */
  onUnload() {
    // Clear countdown timer
    if (this.codeTimer) {
      clearInterval(this.codeTimer);
      this.codeTimer = null;
    }
  },

  methods: {
    // ==================== Login State Check ====================

    checkLoginState() {
      try {
        const token = uni.getStorageSync('token');
        if (token) {
          // Already has token, navigate to map page
          uni.switchTab({
            url: '/pages/map/index'
          });
        }
      } catch (e) {
        // ignore
      }
    },

    // ==================== WeChat Login ====================

    async handleWechatLogin() {
      if (this.loading) return;
      this.loading = true;

      try {
        // Step 1: Get WeChat login code
        const loginRes = await this.wxLogin();
        const code = loginRes.code;
        console.log('[WeChat Login] wx.login success, code length:', code ? code.length : 0);
        if (!code) {
          throw new Error('获取微信授权失败');
        }

        // Step 2: Call backend to login
        const userInfo = {
          nickName: loginRes.userInfo ? loginRes.userInfo.nickName : '',
          avatarUrl: loginRes.userInfo ? loginRes.userInfo.avatarUrl : ''
        };

        await this.userStore.login(code, userInfo);

        uni.showToast({
          title: '登录成功',
          icon: 'success',
          duration: 1500
        });

        // Navigate to map page after short delay
        setTimeout(() => {
          uni.switchTab({
            url: '/pages/map/index'
          });
        }, 500);
      } catch (err) {
        console.error('WeChat login failed:', err);
        uni.showToast({
          title: err.message || '微信登录失败，请重试',
          icon: 'none',
          duration: 2000
        });
      } finally {
        this.loading = false;
      }
    },

    /**
     * Uni.login wrapper for WeChat mini program
     */
    wxLogin() {
      return new Promise((resolve, reject) => {
        uni.login({
          provider: 'weixin',
          scopes: 'auth_user',
          success: (res) => {
            // Also get user info
            uni.getUserInfo({
              provider: 'weixin',
              success: (infoRes) => {
                resolve({
                  code: res.code,
                  userInfo: infoRes.userInfo
                });
              },
              fail: () => {
                // User may decline userInfo scope, still allow login
                resolve({
                  code: res.code,
                  userInfo: null
                });
              }
            });
          },
          fail: (err) => {
            reject(err);
          }
        });
      });
    },

    // ==================== Phone Login ====================

    /**
     * Send verification code
     */
    async sendVerifyCode() {
      if (!this.canSendCode) return;

      try {
        await authApi.sendCode(this.phone);

        uni.showToast({
          title: '验证码已发送',
          icon: 'success',
          duration: 1500
        });

        // Start countdown
        this.startCodeCountdown();
      } catch (err) {
        uni.showToast({
          title: err.message || '发送失败，请重试',
          icon: 'none',
          duration: 2000
        });
      }
    },

    /**
     * Start 60-second countdown
     */
    startCodeCountdown() {
      this.codeSending = true;
      this.codeCountdown = 60;

      this.codeTimer = setInterval(() => {
        this.codeCountdown--;
        if (this.codeCountdown <= 0) {
          this.codeSending = false;
          if (this.codeTimer) {
            clearInterval(this.codeTimer);
            this.codeTimer = null;
          }
        }
      }, 1000);
    },

    /**
     * Handle phone login
     */
    async handlePhoneLogin() {
      if (!this.canLogin) return;
      this.loading = true;

      try {
        await this.userStore.phoneLogin(this.phone, this.code);

        uni.showToast({
          title: '登录成功',
          icon: 'success',
          duration: 1500
        });

        // Navigate to map page after short delay
        setTimeout(() => {
          uni.switchTab({
            url: '/pages/map/index'
          });
        }, 500);
      } catch (err) {
        console.error('Phone login failed:', err);
        uni.showToast({
          title: err.message || '登录失败，请检查验证码',
          icon: 'none',
          duration: 2000
        });
      } finally {
        this.loading = false;
      }
    },

    /** 登录入口(按模式分发) */
    handleLogin() {
      if (!this.canLogin) return;
      if (this.loginMode === 'register') {
        this.handleRegister();
      } else if (this.loginMode === 'code') {
        this.handlePhoneLogin();
      } else {
        this.handlePasswordLogin();
      }
    },

    /** 手机号注册并自动登录 */
    async handleRegister() {
      this.loading = true;
      try {
        await this.userStore.register(this.phone, this.code, this.password, this.nickname);
        uni.showToast({ title: '注册成功', icon: 'success' });
        setTimeout(() => {
          uni.switchTab({ url: '/pages/map/index' });
        }, 600);
      } catch (err) {
        uni.showToast({
          title: (err && err.message) || '注册失败，请重试',
          icon: 'none'
        });
      } finally {
        this.loading = false;
      }
    },

    /** 手机号+密码登录 */
    async handlePasswordLogin() {
      this.loading = true;
      try {
        await this.userStore.passwordLogin(this.phone, this.password);
        uni.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          uni.switchTab({ url: '/pages/map/index' });
        }, 600);
      } catch (err) {
        uni.showToast({
          title: (err && err.message) || '登录失败',
          icon: 'none'
        });
      } finally {
        this.loading = false;
      }
    },

    // ==================== Agreements ====================

    openAgreement(type) {
      // In production, navigate to agreement pages or open webview
      if (type === 'user') {
        uni.showToast({
          title: '《用户协议》',
          icon: 'none'
        });
      } else if (type === 'privacy') {
        uni.showToast({
          title: '《隐私政策》',
          icon: 'none'
        });
      }
    },

    // ==================== Skip Login ====================

    skipLogin() {
      uni.switchTab({
        url: '/pages/map/index'
      });
    }
  }
};
</script>

<style lang="scss" scoped>
// ==================== Page ====================
.login-page {
  position: relative;
  width: 100%;
  min-height: 100vh;
  box-sizing: border-box;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
  overflow: hidden;
}

// ==================== Top Decoration ====================
.top-decoration {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}

.decoration-circle {
  position: absolute;
  border-radius: 50%;
  opacity: 0.03;
  background: #07C160;
  animation: float 20s ease-in-out infinite;
}

.circle-1 {
  width: 600rpx;
  height: 600rpx;
  top: -200rpx;
  right: -150rpx;
  animation-delay: 0s;
}

.circle-2 {
  width: 400rpx;
  height: 400rpx;
  top: 50%;
  left: -100rpx;
  animation-delay: -5s;
}

.circle-3 {
  width: 300rpx;
  height: 300rpx;
  bottom: 100rpx;
  right: 50rpx;
  animation-delay: -10s;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-30rpx) scale(1.1);
  }
}

// ==================== Brand Section ====================
.brand-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 80rpx;
  position: relative;
  z-index: 2;
  animation: slideUp 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(40rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.logo-wrap {
  width: 140rpx;
  height: 140rpx;
  border-radius: 35rpx;
  background: linear-gradient(135deg, #07C160, #05A84E);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 16rpx 48rpx rgba(7, 193, 96, 0.4),
              0 0 80rpx rgba(7, 193, 96, 0.2);
  margin-bottom: 32rpx;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    animation: shimmer 3s infinite;
  }
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%) rotate(45deg);
  }
  100% {
    transform: translateX(100%) rotate(45deg);
  }
}

.logo-image {
  width: 90rpx;
  height: 90rpx;
  position: relative;
  z-index: 1;
}

.app-name {
  font-size: 52rpx;
  font-weight: 900;
  color: #FFFFFF;
  letter-spacing: 12rpx;
  margin-bottom: 16rpx;
  text-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.3);
}

.app-slogan {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 3rpx;
  font-weight: 300;
}

// ==================== Login Area ====================
.login-area {
  width: 100%;
  max-width: 600rpx;
  position: relative;
  z-index: 2;
  animation: fadeIn 0.8s ease-out 0.3s both;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// ---- WeChat Login Button ----
.wechat-login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 96rpx;
  background: linear-gradient(135deg, #07C160, #05A84E);
  border-radius: 48rpx;
  box-shadow: 0 8rpx 32rpx rgba(7, 193, 96, 0.4),
              0 0 0 2rpx rgba(7, 193, 96, 0.2);
  gap: 12rpx;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    transition: left 0.5s ease;
  }

  &:hover::before {
    left: 100%;
  }

  &:active {
    transform: scale(0.96);
    box-shadow: 0 4rpx 16rpx rgba(7, 193, 96, 0.5);
  }
}

.wechat-icon {
  font-size: 36rpx;
  filter: drop-shadow(0 2rpx 4rpx rgba(0, 0, 0, 0.2));
}

.wechat-text {
  font-size: 30rpx;
  color: #FFFFFF;
  font-weight: 700;
  letter-spacing: 2rpx;
}

// ---- Divider ----
.divider-row {
  display: flex;
  align-items: center;
  margin: 32rpx 0;
  gap: 20rpx;
}

.divider-line {
  flex: 1;
  height: 1rpx;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
}

.divider-text {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 300;
  letter-spacing: 2rpx;
}

// ---- Phone Login ----
.phone-login-section {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.input-group {
  display: flex;
  align-items: center;
  height: 88rpx;
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 24rpx;
  padding: 0 24rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;

  &:focus-within {
    border-color: rgba(7, 193, 96, 0.6);
    background: rgba(255, 255, 255, 0.12);
    box-shadow: 0 0 0 4rpx rgba(7, 193, 96, 0.1);
  }
}

.input-prefix {
  padding-right: 16rpx;
  margin-right: 16rpx;
  border-right: 2rpx solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;

  text {
    font-size: 26rpx;
    color: rgba(255, 255, 255, 0.9);
    font-weight: 600;
  }
}

.input-field {
  flex: 1;
  height: 100%;
  font-size: 28rpx;
  color: #FFFFFF;
  font-weight: 400;

  &::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }
}

.code-btn {
  flex-shrink: 0;
  padding: 10rpx 20rpx;
  background: rgba(7, 193, 96, 0.8);
  border-radius: 20rpx;
  margin-left: 12rpx;
  transition: all 0.2s ease;

  text {
    font-size: 22rpx;
    color: #FFFFFF;
    font-weight: 600;
    white-space: nowrap;
    letter-spacing: 1rpx;
  }

  &.sending {
    background: rgba(255, 255, 255, 0.2);
  }

  &.disabled {
    background: rgba(255, 255, 255, 0.1);

    text {
      color: rgba(255, 255, 255, 0.4);
    }
  }

  &:active:not(.sending):not(.disabled) {
    transform: scale(0.94);
  }
}

.phone-login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  background: rgba(7, 193, 96, 0.15);
  border: 2rpx solid rgba(7, 193, 96, 0.4);
  border-radius: 48rpx;
  margin-top: 8rpx;
  transition: all 0.3s ease;

  text {
    font-size: 30rpx;
    color: #07C160;
    font-weight: 700;
    letter-spacing: 2rpx;
  }

  &.disabled {
    opacity: 0.4;
  }

  &:active:not(.disabled) {
    transform: scale(0.96);
    background: rgba(7, 193, 96, 0.25);
  }
}

// ---- Agreement Text ----
.agreement-text {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 28rpx;
  text-align: center;
  line-height: 1.8;
}

.agree-desc {
  font-size: 20rpx;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 1rpx;
}

.agree-link {
  font-size: 20rpx;
  color: #07C160;
  font-weight: 500;
  letter-spacing: 1rpx;
}

// ==================== Skip Section ====================
.skip-section {
  margin-top: 40rpx;
  margin-bottom: 20rpx;
  position: relative;
  z-index: 2;
  animation: fadeIn 0.8s ease-out 0.6s both;
}

.skip-text {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 2rpx;
  font-weight: 300;
  padding: 16rpx 32rpx;
  border: 2rpx solid rgba(255, 255, 255, 0.1);
  border-radius: 24rpx;
  transition: all 0.3s ease;

  &:active {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.7);
  }
}

// 登录方式切换
.login-mode-tabs {
  display: flex;
  justify-content: center;
  gap: 48rpx;
  margin-bottom: 32rpx;

  .mode-tab {
    padding: 10rpx 8rpx;
    font-size: 28rpx;
    color: rgba(255, 255, 255, 0.55);
    border-bottom: 4rpx solid transparent;

    &.active {
      color: #FFFFFF;
      font-weight: 600;
      border-bottom-color: #07C160;
    }
  }
}
</style>
