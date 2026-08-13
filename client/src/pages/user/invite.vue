<template>
  <view class="invite-page">
    <scroll-view class="invite-scroll" scroll-y>
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-if="!loading && inviteData">
        <!-- Hero Section -->
        <view class="hero-section">
          <view class="hero-bg"></view>
          <view class="hero-content">
            <text class="hero-title">邀请好友，一起省钱！</text>
            <text class="hero-subtitle">每邀请一位好友注册，你和TA都能获得丰厚奖励</text>
            <view class="hero-illustration">
              <text class="hero-icon">🎁</text>
            </view>
          </view>
        </view>

        <!-- Invite Code -->
        <view class="code-section card">
          <text class="code-label">我的邀请码</text>
          <view class="code-display">
            <text class="code-text">{{ inviteData.inviteCode || '------' }}</text>
            <view class="code-copy-btn" @click="copyInviteCode">
              <text>复制</text>
            </view>
          </view>
          <text class="code-tip">好友注册时输入此邀请码即可绑定</text>
        </view>

        <!-- Invite QR Code -->
        <view class="qr-section card">
          <text class="qr-title">邀请二维码</text>
          <view class="qr-area">
            <image
              v-if="qrImage"
              :src="qrImage"
              class="qr-image"
              mode="aspectFit"
              @click="previewQr"
            />
            <view v-else class="qr-placeholder">
              <text class="qr-loading">二维码生成中...</text>
            </view>
            <text class="qr-desc">扫一扫，立刻加入</text>
          </view>
          <view class="qr-actions">
            <view class="qr-save-btn" @click="saveQrCode">
              <text>保存二维码</text>
            </view>
          </view>
        </view>

        <!-- Share Buttons -->
        <view class="share-section">
          <view class="share-btn" @click="shareLink">
            <text class="share-btn-icon">🔗</text>
            <text class="share-btn-text">分享链接</text>
          </view>
          <view class="share-btn" @click="generatePoster">
            <text class="share-btn-icon">🖼️</text>
            <text class="share-btn-text">生成海报</text>
          </view>
          <view class="share-btn" @click="shareToWechat">
            <text class="share-btn-icon">💬</text>
            <text class="share-btn-text">分享到微信</text>
          </view>
        </view>

        <!-- Reward Tiers -->
        <view class="reward-section card">
          <text class="section-title">邀请奖励</text>
          <view class="tiers-container">
            <view
              v-for="(tier, index) in rewardTiers"
              :key="tier.count"
              class="tier-item"
              :class="{
                'tier-reached': tier.count <= inviteCount,
                'tier-current': tier.count > inviteCount && (index === 0 || rewardTiers[index - 1].count <= inviteCount),
                'tier-next': tier.count > inviteCount && (index > 0 && rewardTiers[index - 1].count <= inviteCount)
              }"
            >
              <!-- Connector Line -->
              <view
                v-if="index < rewardTiers.length - 1"
                class="tier-connector"
                :class="{ filled: rewardTiers[index + 1].count <= inviteCount }"
              ></view>

              <view class="tier-circle" :class="{ reached: tier.count <= inviteCount }">
                <text v-if="tier.count <= inviteCount">✓</text>
                <text v-else>{{ tier.count }}</text>
              </view>
              <text class="tier-label">邀请{{ tier.count }}人</text>
              <text class="tier-reward">{{ tier.reward }}</text>
            </view>
          </view>
        </view>

        <!-- Total Stats -->
        <view class="stats-section card">
          <text class="section-title">我的战绩</text>
          <view class="stats-row">
            <view class="stat-item">
              <text class="stat-value">{{ inviteCount }}</text>
              <text class="stat-label">已邀请人数</text>
            </view>
            <view class="stat-divider"></view>
            <view class="stat-item">
              <text class="stat-value">¥{{ totalReward }}</text>
              <text class="stat-label">已获奖励</text>
            </view>
            <view class="stat-divider"></view>
            <view class="stat-item">
              <text class="stat-value">{{ pendingReward }}</text>
              <text class="stat-label">待发放</text>
            </view>
          </view>
        </view>

        <!-- Invite History -->
        <view class="history-section card">
          <text class="section-title">
            邀请记录
            <text class="history-count">({{ inviteHistory.length }})</text>
          </text>

          <view v-if="inviteHistory.length === 0" class="empty-history">
            <text>暂无邀请记录</text>
            <text class="empty-hint">快去邀请好友吧</text>
          </view>

          <view
            v-for="record in inviteHistory"
            :key="record.id"
            class="history-item"
          >
            <image
            :src="resolveAssetUrl(record.avatar) || '/static/default-avatar.png'"
              class="history-avatar"
              mode="aspectFill"
            />
            <view class="history-info">
              <text class="history-name">{{ record.nickname || '用户' }}</text>
              <text class="history-time">{{ formatTime(record.registerTime) }}</text>
            </view>
            <view class="history-reward" :class="{ 'reward-granted': record.rewardGranted }">
              <text>{{ record.rewardGranted ? '已发放' : '待发放' }}</text>
            </view>
          </view>
        </view>

        <!-- Bottom Placeholder -->
        <view class="bottom-placeholder safe-area-bottom"></view>
      </template>
    </scroll-view>

    <!-- 隐藏海报画布 -->
    <canvas
      canvas-id="posterCanvas"
      class="poster-canvas"
      style="width:600px;height:900px;"
    ></canvas>
    <canvas
      canvas-id="inviteQrCanvas"
      class="poster-canvas"
      style="width:300px;height:300px;"
    ></canvas>
  </view>
</template>

<script>
import { user, resolveAssetUrl as resolveAsset } from '@/utils/api.js';
import { drawPoster, exportPoster } from '@/utils/poster.js';
import { drawQrOnCanvas, canvasToImage } from '@/utils/qr.js';

export default {
  data() {
    return {
      inviteData: null,
      inviteHistory: [],
      inviteCount: 0,
      totalReward: 0,
      pendingReward: 0,
      qrImage: '',
      loading: true,

      // Reward tiers
      rewardTiers: [
        { count: 1, reward: '20元券' },
        { count: 3, reward: '50元券' },
        { count: 5, reward: '100元券' },
        { count: 10, reward: '200元券' }
      ]
    };
  },

  onLoad() {
    this.loadInviteData();
  },

  onShow() {
    if (!this.loading) {
      this.loadInviteData();
    }
  },

  methods: {
    /** 解析相对资源路径为绝对 URL(小程序必需) */
    resolveAssetUrl(url) {
      return resolveAsset(url);
    },

    /** Load invite data */
    async loadInviteData() {
      this.loading = true;
      try {
        const data = await user.getInviteInfo();

        this.inviteData = data;
        this.inviteCode = data.inviteCode || data.code || '';
        this.inviteCount = data.inviteCount || data.count || 0;
        this.totalReward = data.totalReward || data.reward || 0;
        this.pendingReward = data.pendingReward || 0;
        this.inviteHistory = data.history || data.invitees || [];
        this.inviteLink = data.inviteLink || 'https://coroad.cn/invite/' + (data.inviteCode || '');
        this.generateQr();
      } catch (err) {
        console.error('Failed to load invite data:', err);
        // Use mock data as fallback
        this.setupMockData();
      } finally {
        this.loading = false;
      }
    },

    /** Setup mock data for development */
    setupMockData() {
      this.inviteData = {
        inviteCode: 'CR' + Math.random().toString(36).substring(2, 8).toUpperCase()
      };
      this.inviteCode = this.inviteData.inviteCode;
      this.inviteLink = 'https://coroad.cn/invite/' + this.inviteCode;
      this.inviteCount = 0;
      this.totalReward = 0;
      this.pendingReward = 0;
      this.inviteHistory = [];
      this.generateQr();
    },

    /** 生成真实邀请二维码 */
    generateQr() {
      if (!this.inviteLink) return;
      const ctx = uni.createCanvasContext('inviteQrCanvas', this);
      ctx.setFillStyle('#FFFFFF');
      ctx.fillRect(0, 0, 300, 300);
      drawQrOnCanvas(ctx, this.inviteLink, 8, 8, 284, '#1A1A1A');
      ctx.draw();
      setTimeout(() => {
        canvasToImage(this, 'inviteQrCanvas')
          .then((path) => { this.qrImage = path; })
          .catch((err) => console.warn('[Invite] QR export failed:', err));
      }, 300);
    },

    /** 预览二维码 */
    previewQr() {
      if (this.qrImage) {
        uni.previewImage({ urls: [this.qrImage] });
      }
    },

    /** 保存二维码 */
    saveQrCode() {
      if (!this.qrImage) {
        uni.showToast({ title: '二维码生成中，请稍候', icon: 'none' });
        return;
      }
      // #ifdef MP-WEIXIN
      uni.saveImageToPhotosAlbum({
        filePath: this.qrImage,
        success: () => uni.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: () => {
          uni.showModal({
            title: '保存失败',
            content: '需要相册权限，请在设置中授权后重试',
            showCancel: false
          });
        }
      });
      // #endif
      // #ifdef H5
      window.open(this.qrImage);
      uni.showToast({ title: '二维码已在新窗口打开，可右键保存', icon: 'none' });
      // #endif
    },

    /** Copy invite code */
    copyInviteCode() {
      uni.setClipboardData({
        data: this.inviteCode,
        success: () => {
          uni.showToast({ title: '邀请码已复制', icon: 'success' });
        }
      });
    },

    /** Save QR code */
    saveQrCode() {
      uni.showToast({ title: '二维码已保存到相册', icon: 'success' });
    },

    /** Share link */
    shareLink() {
      uni.setClipboardData({
        data: this.inviteLink || '',
        success: () => {
          uni.showToast({ title: '链接已复制，去分享给好友吧', icon: 'none' });
        }
      });
    },

    /** Generate poster */
    generatePoster() {
      uni.showLoading({ title: '生成中...' });
      const ctx = uni.createCanvasContext('posterCanvas', this);
      drawPoster(ctx, {
        title: '邀请好友，一起自驾',
        subtitle: '邀请码 ' + (this.inviteCode || '------'),
        priceText: '',
        bottomText: '新老用户都有奖励，点击加入同道自驾',
        brand: '同道 CoRoad',
        qrText: this.inviteLink || ''
      });
      setTimeout(() => {
        exportPoster(this, 'posterCanvas')
          .catch(() => {
            uni.showToast({ title: '海报生成失败', icon: 'none' });
          })
          .finally(() => {
            uni.hideLoading();
          });
      }, 400);
    },

    /** Share to WeChat */
    shareToWechat() {
      uni.showToast({ title: '请点击右上角分享给微信好友', icon: 'none' });
    },

    /** Format time */
    formatTime(timeStr) {
      if (!timeStr) return '--';
      const date = new Date(timeStr);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return year + '-' + month + '-' + day;
    }
  },

  /** Share configuration */
  onShareAppMessage() {
    return {
      title: '同道 CoRoad - 邀请好友一起省钱！自驾出行专属优惠',
      path: '/pages/login/index?inviteCode=' + (this.inviteCode || ''),
      imageUrl: '/static/share-invite.png'
    };
  }
};
</script>

<style lang="scss" scoped>
.invite-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F5F5F5;
}

.invite-scroll {
  flex: 1;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: 28rpx;
  color: #999;
}

// ===== Hero Section =====
.hero-section {
  position: relative;
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #e74c3c 0%, #ff6b35 50%, #f5a623 100%);
}

.hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48rpx 24rpx 40rpx;
}

.hero-title {
  font-size: 40rpx;
  font-weight: 800;
  color: #FFFFFF;
  margin-bottom: 12rpx;
}

.hero-subtitle {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 24rpx;
}

.hero-illustration {
  padding: 20rpx 0;
}

.hero-icon {
  font-size: 100rpx;
}

// ===== Invite Code =====
.code-section {
  margin: 24rpx 24rpx 16rpx;
  text-align: center;
}

.code-label {
  font-size: 26rpx;
  color: #999;
  display: block;
  margin-bottom: 16rpx;
}

.code-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20rpx;
  margin-bottom: 12rpx;
}

.code-text {
  font-size: 44rpx;
  font-weight: 800;
  color: #1A1A1A;
  letter-spacing: 10rpx;
  font-family: 'Courier New', monospace;
}

.code-copy-btn {
  padding: 8rpx 24rpx;
  background: linear-gradient(135deg, #e74c3c, #ff6b35);
  border-radius: 24rpx;

  text {
    font-size: 24rpx;
    color: #FFFFFF;
    font-weight: 600;
  }
}

.code-tip {
  font-size: 22rpx;
  color: #bbb;
}

// ===== QR Code =====
.qr-section {
  margin: 0 24rpx 16rpx;
  text-align: center;
}

.qr-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1A1A1A;
  display: block;
  margin-bottom: 20rpx;
}

.qr-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20rpx;
}

.qr-placeholder {
  padding: 16rpx;
  background-color: #FFFFFF;
  border: 4rpx solid #1A1A1A;
  border-radius: 16rpx;
  margin-bottom: 16rpx;
}

.qr-grid {
  display: grid;
  grid-template-columns: repeat(5, 32rpx);
  grid-template-rows: repeat(5, 32rpx);
  gap: 3rpx;
}

.qr-cell {
  width: 32rpx;
  height: 32rpx;
  border-radius: 4rpx;
  background-color: #FFFFFF;

  &.filled {
    background-color: #1A1A1A;
  }
}

.qr-desc {
  font-size: 24rpx;
  color: #999;
}

.qr-actions {
  display: flex;
  justify-content: center;
}

.qr-save-btn {
  padding: 12rpx 32rpx;
  background-color: #F5F5F5;
  border: 1rpx solid #E0E0E0;
  border-radius: 24rpx;

  text {
    font-size: 26rpx;
    color: #666;
  }
}

// ===== Share Buttons =====
.share-section {
  display: flex;
  margin: 0 24rpx 16rpx;
  gap: 16rpx;
}

.share-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  padding: 24rpx 0;
  background-color: #FFFFFF;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
  transition: opacity 0.15s;

  &:active {
    opacity: 0.8;
  }
}

.share-btn-icon {
  font-size: 44rpx;
}

.share-btn-text {
  font-size: 22rpx;
  color: #666;
}

// ===== Reward Tiers =====
.reward-section {
  margin: 0 24rpx 16rpx;
  overflow: hidden;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1A1A1A;
  display: block;
  margin-bottom: 24rpx;
}

.tiers-container {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  position: relative;
}

.tier-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  position: relative;
  text-align: center;
  gap: 8rpx;

  &.tier-reached {
    opacity: 1;
  }

  &.tier-next {
    opacity: 0.5;
  }
}

.tier-connector {
  position: absolute;
  top: 24rpx;
  left: 60%;
  width: 80%;
  height: 3rpx;
  background-color: #F0F0F0;
  z-index: 0;

  &.filled {
    background-color: #07C160;
  }
}

.tier-circle {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background-color: #F0F0F0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: #999;
  font-weight: 700;
  z-index: 1;
  position: relative;

  &.reached {
    background: linear-gradient(135deg, #07C160, #4cd964);
    color: #FFFFFF;
    box-shadow: 0 4rpx 12rpx rgba(7, 193, 96, 0.3);
  }
}

.tier-label {
  font-size: 22rpx;
  color: #666;
  font-weight: 500;
}

.tier-reward {
  font-size: 22rpx;
  font-weight: 700;
  color: #e74c3c;
  background-color: rgba(231, 76, 60, 0.06);
  padding: 4rpx 12rpx;
  border-radius: 12rpx;
}

// ===== Stats Section =====
.stats-section {
  margin: 0 24rpx 16rpx;
}

.stats-row {
  display: flex;
  align-items: center;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;

  .stat-value {
    font-size: 36rpx;
    font-weight: 800;
    color: #1A1A1A;
  }

  .stat-label {
    font-size: 24rpx;
    color: #999;
  }
}

.stat-divider {
  width: 1rpx;
  height: 48rpx;
  background-color: #F0F0F0;
}

// ===== History =====
.history-section {
  margin: 0 24rpx 16rpx;
}

.history-count {
  font-size: 24rpx;
  color: #999;
  font-weight: 400;
}

.empty-history {
  text-align: center;
  padding: 40rpx 0;

  text {
    font-size: 26rpx;
    color: #ccc;
    display: block;
  }

  .empty-hint {
    font-size: 22rpx;
    color: #ddd;
    margin-top: 8rpx;
  }
}

.history-item {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #F5F5F5;
  gap: 16rpx;

  &:last-child {
    border-bottom: none;
  }
}

.history-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background-color: #F0F0F0;
}

.history-info {
  flex: 1;

  .history-name {
    font-size: 28rpx;
    color: #333;
    font-weight: 500;
    display: block;
    margin-bottom: 4rpx;
  }

  .history-time {
    font-size: 22rpx;
    color: #999;
  }
}

.history-reward {
  padding: 6rpx 16rpx;
  background-color: #F5F5F5;
  border-radius: 12rpx;

  text {
    font-size: 22rpx;
    color: #999;
  }

  &.reward-granted {
    background-color: rgba(7, 193, 96, 0.06);

    text {
      color: #07C160;
    }
  }
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

.poster-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
}
</style>
