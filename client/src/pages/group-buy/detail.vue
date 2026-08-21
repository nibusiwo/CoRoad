<template>
  <view class="detail-page">
    <scroll-view class="detail-scroll" scroll-y>
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-if="!loading && product">
        <!-- Image Carousel -->
        <swiper
          v-if="product.images && product.images.length"
          class="image-swiper"
          indicator-dots
          indicator-color="rgba(255,255,255,0.5)"
          indicator-active-color="#FFFFFF"
          autoplay
          circular
        >
          <swiper-item v-for="(img, index) in product.images" :key="index">
                        <view class="swiper-image">
              <local-image style="width:100%;height:100%;" :src="img" mode="aspectFill"  />
            </view>
          </swiper-item>
        </swiper>
        <!-- Single image fallback -->
        <view v-else class="single-image-wrap">
                    <view class="single-image">
            <local-image style="width:100%;height:100%;"
            :src="product.image || '/static/default-product.png'"
           
            mode="aspectFill"
           />
          </view>
        </view>

        <!-- Product Name & Merchant Info -->
        <view class="info-section">
          <text class="product-name">{{ product.name }}</text>
          <view class="merchant-row">
            <view class="merchant-info" @click="goMerchant">
                            <view class="merchant-logo">
                <local-image style="width:100%;height:100%;"
                :src="product.merchantLogo || '/static/default-merchant.png'"
               
                mode="aspectFill"
               />
              </view>
              <view class="merchant-detail">
                <text class="merchant-name">{{ product.merchantName || '商家' }}</text>
                <view class="merchant-rating">
                  <text v-for="i in 5" :key="i" class="star" :class="{ filled: i <= (product.rating || 0) }">★</text>
                  <text class="rating-score">{{ product.rating || '4.5' }}</text>
                </view>
              </view>
            </view>
            <view v-if="product.merchantLevel" class="level-badge" :class="'level-' + product.merchantLevel">
              <text>{{ product.merchantLevel === 1 ? '金牌' : product.merchantLevel === 2 ? '银牌' : '铜牌' }}</text>
            </view>
          </view>
        </view>

        <!-- Price Section -->
        <view class="price-section card">
          <view class="price-main-row">
            <view class="price-left">
              <text class="original-price">¥{{ product.originalPrice }}</text>
              <text class="current-price">¥{{ product.groupPrice }}</text>
              <text class="price-unit">/人</text>
            </view>
            <view class="saved-tag">
              <text>已省¥{{ (product.originalPrice - product.groupPrice).toFixed(0) }}</text>
            </view>
          </view>
          <text v-if="product.minPeople" class="price-tip">最低{{ product.minPeople }}人成团</text>
        </view>

        <!-- Price Tier Table -->
        <view class="tier-section card">
          <text class="section-title">阶梯价格</text>
          <view class="tier-table">
            <view
              v-for="tier in product.priceTiers"
              :key="tier.count"
              class="tier-row"
              :class="{
                'tier-reached': tier.count <= (product.joinedCount || 0),
                'tier-current': tier.count === currentTier
              }"
            >
              <view class="tier-people">
                <text class="tier-count">{{ tier.count }}人</text>
              </view>
              <view class="tier-price">
                <text class="tier-price-value">¥{{ tier.price }}</text>
                <text class="tier-original" v-if="tier.originalPrice">¥{{ tier.originalPrice }}</text>
              </view>
              <view class="tier-discount">
                <text class="discount-badge">{{ tier.discount }}折</text>
              </view>
              <view class="tier-status">
                <text v-if="tier.count <= (product.joinedCount || 0)" class="status-reached">✓ 已达成</text>
                <text v-else class="status-pending">{{ tier.count - (product.joinedCount || 0) }}人待达到</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Progress Section -->
        <view class="progress-section card">
          <text class="section-title">拼团进度</text>
          <view class="progress-bar-wrap">
            <view class="progress-bar">
              <view
                class="progress-fill"
                :style="{ width: progressPercent + '%' }"
              ></view>
            </view>
          </view>
          <view class="progress-info-row">
            <text class="progress-text">
              已拼<text class="highlight">{{ product.joinedCount || 0 }}</text>人，还差<text class="highlight">{{ remainCount }}</text>人成团
            </text>
          </view>

          <!-- Participant Avatars -->
          <view v-if="participants && participants.length" class="participant-row">
                        <view
              class="participant-avatar"
              v-for="(p, i) in participants.slice(0, 8)"
              :key="i"
            >
              <local-image
                style="width:100%;height:100%;"
                :src="resolveAssetUrl(p.avatar) || '/static/default-avatar.png'"
                mode="aspectFill"
              />
            </view>
            <view v-if="participants.length > 8" class="more-participants">
              <text>+{{ participants.length - 8 }}</text>
            </view>
          </view>

          <!-- Countdown Timer -->
          <view v-if="remainingTime" class="countdown-section">
            <text class="countdown-label">剩余时间</text>
            <view class="countdown-timer">
              <text class="time-block">{{ countdown.hours }}</text>
              <text class="time-colon">:</text>
              <text class="time-block">{{ countdown.minutes }}</text>
              <text class="time-colon">:</text>
              <text class="time-block">{{ countdown.seconds }}</text>
            </view>
          </view>
        </view>

        <!-- Product Description -->
        <view class="desc-section card">
          <text class="section-title">商品详情</text>
          <view class="desc-content" v-if="product.description">
            <rich-text :nodes="product.description"></rich-text>
          </view>
          <view v-else class="desc-empty">
            <text>暂无详细描述</text>
          </view>
        </view>

        <!-- Merchant Info Card -->
        <view class="merchant-card card" @click="goMerchant">
          <text class="section-title">商家信息</text>
          <view class="merchant-card-body">
                        <view class="merchant-card-logo">
              <local-image style="width:100%;height:100%;"
              :src="product.merchantLogo || '/static/default-merchant.png'"
             
              mode="aspectFill"
             />
            </view>
            <view class="merchant-card-info">
              <text class="merchant-card-name">{{ product.merchantName || '商家名称' }}</text>
              <view class="merchant-card-rating">
                <text v-for="i in 5" :key="i" class="star" :class="{ filled: i <= (product.rating || 0) }">★</text>
                <text class="rating-value">{{ product.rating || '4.5' }}</text>
              </view>
              <text class="merchant-card-addr">{{ product.merchantAddress || '暂无地址' }}</text>
            </view>
            <text class="merchant-card-arrow">›</text>
          </view>
        </view>

        <!-- Bottom Placeholder -->
        <view class="detail-bottom"></view>
      </template>
    </scroll-view>

    <!-- Bottom Fixed Bar -->
    <view v-if="!loading && product" class="bottom-bar safe-area-bottom">
      <view class="bottom-price">
        <text class="bottom-price-label">团购价</text>
        <text class="bottom-price-value">¥{{ product.groupPrice }}</text>
      </view>
      <view class="bottom-join-btn" :class="{ pulsing: !hasJoined }" @click="joinOrCreate">
        <text>{{ hasJoined ? '查看我的团' : '立即参团' }}</text>
      </view>
    </view>

    <!-- Share Button (top-right) -->
    <view v-if="!loading && product" class="share-fab" @click="handleShare">
      <text class="share-icon">↗</text>
    </view>

    <!-- 隐藏海报画布 -->
    <canvas
      canvas-id="posterCanvas"
      class="poster-canvas"
      style="width:600px;height:900px;"
    ></canvas>
  </view>
</template>

<script>
import { groupBuy, resolveAssetUrl as resolveAsset } from '@/utils/api.js';
import { drawPoster, exportPoster } from '@/utils/poster.js';

export default {
  data() {
    return {
      productId: '',
      product: null,
      participants: [],
      loading: true,
      countdown: {
        hours: '00',
        minutes: '00',
        seconds: '00'
      },
      countdownTimer: null,
      remainingTime: 0
    };
  },

  computed: {
    progressPercent() {
      if (!this.product) return 0;
      const target = this.product.targetCount || 10;
      const joined = this.product.joinedCount || 0;
      return Math.min(100, Math.round((joined / target) * 100));
    },

    remainCount() {
      if (!this.product) return 0;
      const target = this.product.targetCount || 10;
      const joined = this.product.joinedCount || 0;
      return Math.max(0, target - joined);
    },

    currentTier() {
      if (!this.product || !this.product.priceTiers) return 0;
      const joined = this.product.joinedCount || 0;
      let current = 0;
      for (const tier of this.product.priceTiers) {
        if (tier.count <= joined) {
          current = tier.count;
        }
      }
      return current || (this.product.priceTiers[0] ? this.product.priceTiers[0].count : 0);
    },

    hasJoined() {
      // Check if current user is in participants
      return false; // Will be updated from activity data
    }
  },

  onLoad(options) {
    this.productId = options.id || '';
    if (this.productId) {
      this.loadDetail();
    }
  },

  onUnload() {
    this.clearCountdown();
  },

  methods: {
    /** 解析相对资源路径为绝对 URL(小程序必需) */
    resolveAssetUrl(url) {
      return resolveAsset(url);
    },

    /** Load product detail */
    async loadDetail() {
      this.loading = true;
      try {
        this.product = await groupBuy.getProductDetail(this.productId);

        // Normalize data
        if (!this.product.priceTiers) {
          // Generate default tiers from price configurations
          this.product.priceTiers = this.generateDefaultTiers();
        }

        // Fetch active activity participants
        try {
          const activityRes = await groupBuy.getUserActivities(1);
          // Use the most relevant activity
        } catch (e) {
          // Activity may not exist yet
        }

        // Generate mock participants for display
        this.participants = this.generateMockParticipants();

        // Start countdown
        if (this.product.expiryTime) {
          this.remainingTime = Math.max(0, Math.floor((new Date(this.product.expiryTime) - Date.now()) / 1000));
          this.updateCountdown();
          this.clearCountdown();
          this.countdownTimer = setInterval(() => {
            this.remainingTime--;
            if (this.remainingTime <= 0) {
              this.remainingTime = 0;
              this.clearCountdown();
              this.updateCountdown();
            } else {
              this.updateCountdown();
            }
          }, 1000);
        }
      } catch (err) {
        console.error('Failed to load product detail:', err);
        uni.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },

    /** Generate default price tiers */
    generateDefaultTiers() {
      if (!this.product) return [];
      const basePrice = this.product.groupPrice || 0;
      const originalPrice = this.product.originalPrice || basePrice;
      const target = this.product.targetCount || 10;

      const tiers = [];
      const steps = [2, 4, 6, 8, 10];
      for (let i = 0; i < steps.length; i++) {
        const count = steps[i];
        if (count > target) break;
        const discount = Math.max(5, 10 - i * 1);
        const price = Math.round(basePrice * (1 - (i * 0.05)));
        tiers.push({
          count,
          price,
          originalPrice,
          discount: (10 - i * 0.5).toFixed(1)
        });
      }
      return tiers;
    },

    /** Generate mock participants for display */
    generateMockParticipants() {
      if (!this.product) return [];
      const count = Math.min(this.product.joinedCount || 0, 12);
      const list = [];
      for (let i = 0; i < count; i++) {
        list.push({
          id: 'p_' + i,
          avatar: '/static/default-avatar.png'
        });
      }
      return list;
    },

    /** Update countdown display */
    updateCountdown() {
      const total = Math.max(0, this.remainingTime);
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const seconds = total % 60;
      this.countdown = {
        hours: String(hours).padStart(2, '0'),
        minutes: String(minutes).padStart(2, '0'),
        seconds: String(seconds).padStart(2, '0')
      };
    },

    /** Clear countdown timer */
    clearCountdown() {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    },

    /** Join or create activity */
    joinOrCreate() {
      uni.navigateTo({
        url: '/pages/group-buy/activity?productId=' + this.productId
      });
    },

    /** Navigate to merchant */
    goMerchant() {
      if (this.product && this.product.merchantId) {
        uni.navigateTo({
          url: '/pages/merchant/detail?id=' + this.product.merchantId
        });
      }
    },

    /** Handle share */
    handleShare() {
      uni.showActionSheet({
        itemList: ['分享到微信', '分享到车队群', '生成海报'],
        success: (res) => {
          if (res.tapIndex === 0) {
            // Trigger WeChat share via onShareAppMessage
          } else if (res.tapIndex === 1) {
            uni.showToast({ title: '请选择车队群', icon: 'none' });
          } else if (res.tapIndex === 2) {
            this.generatePoster();
          }
        }
      });
    },

    /** 生成海报 */
    generatePoster() {
      if (!this.product) return;
      uni.showLoading({ title: '生成中...' });
      const ctx = uni.createCanvasContext('posterCanvas', this);
      drawPoster(ctx, {
        title: this.product.name || '拼团好物',
        subtitle: '车队专享价 ¥' + (this.product.groupPrice || this.product.originalPrice || 0) + ' 起',
        priceText: '¥' + (this.product.groupPrice || this.product.originalPrice || 0),
        bottomText: '邀请好友一起拼，人越多越便宜',
        brand: '同道 CoRoad · 拼团更省钱'
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
    }
  },

  /** Share configuration */
  onShareAppMessage() {
    return {
      title: this.product ? (this.product.name + ' - 团购优惠') : '团购优惠',
      path: '/pages/group-buy/detail?id=' + this.productId,
      imageUrl: this.product ? (this.product.image || '') : ''
    };
  }
};
</script>

<style lang="scss" scoped>
.detail-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F5F5F5;
  position: relative;
}

.detail-scroll {
  flex: 1;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: 28rpx;
  color: #999;
}

// ===== Image Carousel =====
.image-swiper {
  width: 100%;
  height: 500rpx;
}

.swiper-image {
  width: 100%;
  height: 100%;
  background-color: #F0F0F0;
}

.single-image-wrap {
  width: 100%;
  height: 500rpx;
}

.single-image {
  width: 100%;
  height: 100%;
  background-color: #F0F0F0;
}

// ===== Info Section =====
.info-section {
  padding: 24rpx;
  background-color: #FFFFFF;
}

.product-name {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A1A;
  line-height: 1.4;
  margin-bottom: 16rpx;
  display: block;
}

.merchant-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.merchant-info {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.merchant-logo {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background-color: #F0F0F0;
    overflow: hidden;
  }

.merchant-detail {
  .merchant-name {
    font-size: 28rpx;
    color: #333;
    font-weight: 500;
    display: block;
    margin-bottom: 4rpx;
  }

  .merchant-rating {
    display: flex;
    align-items: center;
    gap: 2rpx;

    .star {
      font-size: 22rpx;
      color: #ddd;

      &.filled {
        color: #f5a623;
      }
    }

    .rating-score {
      font-size: 22rpx;
      color: #f5a623;
      margin-left: 6rpx;
      font-weight: 500;
    }
  }
}

.level-badge {
  padding: 4rpx 16rpx;
  border-radius: 16rpx;
  font-size: 20rpx;
  font-weight: 600;

  &.level-1 {
    background: linear-gradient(135deg, #ffd700, #ffb800);
    color: #8b6914;
  }

  &.level-2 {
    background: linear-gradient(135deg, #e8e8e8, #c0c0c0);
    color: #666;
  }

  &.level-3 {
    background: linear-gradient(135deg, #ffd4a8, #cd7f32);
    color: #8b4513;
  }
}

// ===== Price Section =====
.price-section {
  margin: 16rpx 24rpx;
}

.price-main-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.price-left {
  display: flex;
  align-items: baseline;
  gap: 12rpx;

  .original-price {
    font-size: 28rpx;
    color: #bbb;
    text-decoration: line-through;
  }

  .current-price {
    font-size: 52rpx;
    font-weight: 800;
    color: #e74c3c;
  }

  .price-unit {
    font-size: 24rpx;
    color: #999;
  }
}

.saved-tag {
  padding: 6rpx 16rpx;
  background: linear-gradient(135deg, #ffe8e5, #ffd4cf);
  border-radius: 20rpx;

  text {
    font-size: 22rpx;
    color: #e74c3c;
    font-weight: 600;
  }
}

.price-tip {
  font-size: 22rpx;
  color: #999;
  margin-top: 8rpx;
  display: block;
}

// ===== Price Tier Table =====
.tier-section {
  margin: 0 24rpx 16rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1A1A1A;
  display: block;
  margin-bottom: 20rpx;
}

.tier-table {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.tier-row {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #F5F5F5;
  gap: 16rpx;

  &:last-child {
    border-bottom: none;
  }

  &.tier-reached {
    .tier-people,
    .tier-price,
    .tier-discount {
      opacity: 0.4;
    }
  }

  &.tier-current {
    background-color: #fef8e7;
    margin: 0 -8rpx;
    padding: 16rpx 8rpx;
    border-radius: 12rpx;
    border-bottom: none;
  }
}

.tier-people {
  width: 60rpx;

  .tier-count {
    font-size: 26rpx;
    font-weight: 600;
    color: #333;
  }
}

.tier-price {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 8rpx;

  .tier-price-value {
    font-size: 32rpx;
    font-weight: 700;
    color: #e74c3c;
  }

  .tier-original {
    font-size: 22rpx;
    color: #bbb;
    text-decoration: line-through;
  }
}

.tier-discount {
  .discount-badge {
    padding: 4rpx 12rpx;
    background-color: #e74c3c;
    color: #fff;
    font-size: 20rpx;
    border-radius: 10rpx;
    font-weight: 600;
  }
}

.tier-status {
  width: 120rpx;
  text-align: right;

  .status-reached {
    font-size: 22rpx;
    color: #07C160;
    font-weight: 500;
  }

  .status-pending {
    font-size: 20rpx;
    color: #bbb;
  }
}

// ===== Progress Section =====
.progress-section {
  margin: 0 24rpx 16rpx;
}

.progress-bar-wrap {
  margin-bottom: 12rpx;
}

.progress-bar {
  width: 100%;
  height: 16rpx;
  background-color: #F0F0F0;
  border-radius: 8rpx;
  overflow: hidden;

  .progress-fill {
    height: 100%;
    border-radius: 8rpx;
    background: linear-gradient(90deg, #07C160, #4cd964, #f5a623, #e74c3c);
    background-size: 300% 100%;
    animation: progressShine 2s ease-in-out infinite;
    transition: width 0.6s ease;
  }
}

@keyframes progressShine {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.progress-info-row {
  margin-bottom: 16rpx;

  .progress-text {
    font-size: 28rpx;
    color: #666;

    .highlight {
      color: #e74c3c;
      font-weight: 700;
    }
  }
}

.participant-row {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;

  .participant-avatar {
    width: 64rpx;
    height: 64rpx;
    border-radius: 50%;
    border: 3rpx solid #fff;
    margin-left: -16rpx;
    background-color: #F0F0F0;

    &:first-child {
      margin-left: 0;
    }
  }

  .more-participants {
    width: 64rpx;
    height: 64rpx;
    border-radius: 50%;
    border: 3rpx solid #fff;
    margin-left: -16rpx;
    background-color: #e8e8e8;
    display: flex;
    align-items: center;
    justify-content: center;

    text {
      font-size: 22rpx;
      color: #999;
    }
  }
}

.countdown-section {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 16rpx 0;
  border-top: 1rpx solid #F0F0F0;

  .countdown-label {
    font-size: 26rpx;
    color: #999;
  }

  .countdown-timer {
    display: flex;
    align-items: center;
    gap: 4rpx;
  }

  .time-block {
    width: 56rpx;
    height: 48rpx;
    background-color: #1A1A1A;
    color: #FFFFFF;
    font-size: 28rpx;
    font-weight: 700;
    border-radius: 8rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Courier New', monospace;
  }

  .time-colon {
    font-size: 28rpx;
    font-weight: 700;
    color: #1A1A1A;
    padding: 0 2rpx;
  }
}

// ===== Description =====
.desc-section {
  margin: 0 24rpx 16rpx;
}

.desc-content {
  font-size: 28rpx;
  color: #333;
  line-height: 1.8;
}

.desc-empty {
  text-align: center;
  padding: 40rpx 0;
  font-size: 26rpx;
  color: #ccc;
}

// ===== Merchant Card =====
.merchant-card {
  margin: 0 24rpx 16rpx;
}

.merchant-card-body {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.merchant-card-logo {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background-color: #F0F0F0;
    overflow: hidden;
  }

.merchant-card-info {
  flex: 1;
  min-width: 0;

  .merchant-card-name {
    font-size: 28rpx;
    font-weight: 600;
    color: #333;
    display: block;
    margin-bottom: 6rpx;
  }

  .merchant-card-rating {
    display: flex;
    align-items: center;
    gap: 2rpx;
    margin-bottom: 4rpx;

    .star {
      font-size: 20rpx;
      color: #ddd;

      &.filled {
        color: #f5a623;
      }
    }

    .rating-value {
      font-size: 20rpx;
      color: #f5a623;
      margin-left: 6rpx;
    }
  }

  .merchant-card-addr {
    font-size: 22rpx;
    color: #999;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.merchant-card-arrow {
  font-size: 36rpx;
  color: #ccc;
}

// ===== Bottom Bar =====
.detail-bottom {
  height: 140rpx;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  background-color: #FFFFFF;
  border-top: 1rpx solid #F0F0F0;
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.04);
  gap: 20rpx;
}

.bottom-price {
  display: flex;
  flex-direction: column;

  .bottom-price-label {
    font-size: 22rpx;
    color: #999;
  }

  .bottom-price-value {
    font-size: 40rpx;
    font-weight: 800;
    color: #e74c3c;
  }
}

.bottom-join-btn {
  flex: 1;
  height: 88rpx;
  background: linear-gradient(135deg, #e74c3c, #ff6b35);
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 16rpx rgba(231, 76, 60, 0.35);

  text {
    font-size: 32rpx;
    color: #FFFFFF;
    font-weight: 700;
  }

  &.pulsing {
    animation: pulse 1.5s ease-in-out infinite;
  }

  &:active {
    opacity: 0.9;
    transform: scale(0.98);
  }
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 4rpx 16rpx rgba(231, 76, 60, 0.35);
  }
  50% {
    box-shadow: 0 8rpx 32rpx rgba(231, 76, 60, 0.55);
  }
}

// ===== Share Fab =====
.share-fab {
  position: fixed;
  top: 16rpx;
  right: 24rpx;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;

  .share-icon {
    font-size: 36rpx;
    color: #fff;
    font-weight: bold;
    transform: rotate(-45deg);
  }
}

// ===== Card Base =====
.card {
  background-color: #FFFFFF;
  border-radius: 20rpx;
  padding: 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.poster-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
}
</style>
