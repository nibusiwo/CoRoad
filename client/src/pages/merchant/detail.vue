<template>
  <view class="merchant-detail-page">
    <scroll-view class="detail-scroll" scroll-y>
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-if="!loading && merchant">
        <!-- ==================== Header ==================== -->
        <view class="merchant-header">
          <!-- Cover Image -->
          <image
            v-if="merchant.coverImage"
            :src="merchant.coverImage"
            class="header-cover"
            mode="aspectFill"
          />
          <view v-else class="header-cover-placeholder"></view>

          <!-- Info Overlay -->
          <view class="header-info">
            <image
            :src="resolveAssetUrl(merchant.logo) || '/static/default-avatar.png'"
              class="header-logo"
              mode="aspectFill"
            />
            <view class="header-text">
              <view class="header-name-row">
                <text class="header-name">{{ merchant.name }}</text>
                <view class="header-type-tag" v-if="merchant.type">
                  <text>{{ merchant.type }}</text>
                </view>
              </view>
              <view class="header-rating">
                <text v-for="i in 5" :key="i" class="star" :class="{ filled: i <= (merchant.rating || 0) }">★</text>
                <text class="rating-text">{{ merchant.rating || '--' }}分</text>
              </view>
              <view v-if="merchant.level" class="header-level-badge">
                <text>{{ merchant.level }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- ==================== Info Section ==================== -->
        <view class="info-section card">
          <!-- Address -->
          <view class="info-item" @click="navigateTo(merchant)">
            <text class="info-icon">📍</text>
            <view class="info-text-wrap">
              <text class="info-label">地址</text>
              <text class="info-value">{{ merchant.address || '暂无地址' }}</text>
            </view>
            <text class="info-action-text">导航</text>
          </view>

          <!-- Phone -->
          <view class="info-item" @click="callMerchant(merchant)">
            <text class="info-icon">📞</text>
            <view class="info-text-wrap">
              <text class="info-label">电话</text>
              <text class="info-value">{{ merchant.phone || '暂无电话' }}</text>
            </view>
            <text class="info-action-text">拨打</text>
          </view>

          <!-- Business Hours -->
          <view class="info-item">
            <text class="info-icon">🕐</text>
            <view class="info-text-wrap">
              <text class="info-label">营业时间</text>
              <text class="info-value">{{ merchant.businessHours || '暂无信息' }}</text>
            </view>
          </view>
        </view>

        <!-- ==================== Group Buy Products ==================== -->
        <view v-if="products && products.length" class="products-section">
          <view class="section-header">
            <text class="section-title">🚗 车队专享价</text>
            <text v-if="products.length > 3" class="section-more" @click="viewAllProducts">
              全部 {{ products.length }} 个 ›
            </text>
          </view>

          <scroll-view class="products-scroll" scroll-x>
            <view
              v-for="product in products"
              :key="product.id"
              class="product-card"
              @click="goToProduct(product.id)"
            >
              <image
            :src="resolveAssetUrl(product.image) || '/static/default-product.png'"
                class="product-image"
                mode="aspectFill"
              />
              <view class="product-info">
                <text class="product-name">{{ product.name }}</text>

                <!-- Tier Prices -->
                <view class="product-tiers" v-if="product.tiers && product.tiers.length">
                  <view
                    v-for="tier in product.tiers"
                    :key="tier.minCount"
                    class="tier-item"
                  >
                    <text class="tier-count">{{ tier.minCount }}人团</text>
                    <text class="tier-price">¥{{ tier.price }}</text>
                  </view>
                </view>
                <view v-else class="product-price">
                  <text class="price-label">车队价</text>
                  <text class="price-value">¥{{ product.price }}</text>
                  <text v-if="product.originalPrice" class="price-original">¥{{ product.originalPrice }}</text>
                </view>

                <!-- Progress -->
                <view class="product-progress" v-if="product.currentGroupCount">
                  <text class="progress-text">{{ product.currentGroupCount }}人正在拼团</text>
                </view>
              </view>

              <!-- Join Button -->
              <view class="product-join-btn" @click.stop="joinGroupBuy(product)">
                <text>参团</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <!-- ==================== Description ==================== -->
        <view v-if="merchant.description" class="desc-section card">
          <text class="section-label">商家介绍</text>
          <text class="desc-text">{{ merchant.description }}</text>
        </view>

        <!-- ==================== Promotion ==================== -->
        <view v-if="merchant.promotion" class="promo-section card">
          <view class="promo-banner">
            <text class="promo-icon">🎉</text>
            <text class="promo-text">{{ merchant.promotion }}</text>
          </view>
        </view>

        <!-- ==================== Photo Gallery ==================== -->
        <view v-if="merchant.photos && merchant.photos.length" class="gallery-section">
          <view class="section-header">
            <text class="section-title">📸 商家相册</text>
            <text class="section-count">{{ merchant.photos.length }}张</text>
          </view>
          <view class="gallery-grid">
            <image
              v-for="(photo, index) in merchant.photos"
              :key="index"
              :src="photo"
              class="gallery-image"
              mode="aspectFill"
              @click="previewPhotos(index)"
            />
          </view>
        </view>

        <!-- ==================== Repair Service Info ==================== -->
        <view v-if="merchant.hasRepair" class="repair-section card">
          <view class="repair-header">
            <text class="repair-icon">🔧</text>
            <text class="repair-title">维修服务</text>
          </view>
          <view class="repair-scope" v-if="merchant.repairScope">
            <text class="scope-label">服务范围</text>
            <text class="scope-text">{{ merchant.repairScope }}</text>
          </view>
          <view class="repair-contact" v-if="merchant.rescuePhone" @click="callRescue(merchant.rescuePhone)">
            <text class="rescue-icon">🆘</text>
            <text class="rescue-label">救援电话</text>
            <text class="rescue-phone">{{ merchant.rescuePhone }}</text>
            <text class="rescue-action">拨打</text>
          </view>
        </view>

        <!-- Bottom Placeholder -->
        <view class="detail-bottom"></view>
      </template>
    </scroll-view>

    <!-- ==================== Bottom Bar ==================== -->
    <view v-if="!loading && merchant" class="bottom-bar safe-area-bottom">
      <view class="bottom-action" @click="navigateTo(merchant)">
        <text class="bottom-icon">🧭</text>
        <text class="bottom-label">导航</text>
      </view>
      <view class="bottom-action" @click="callMerchant(merchant)">
        <text class="bottom-icon">📞</text>
        <text class="bottom-label">电话</text>
      </view>
      <view
        class="bottom-action"
        @click="toggleFollow"
        :class="{ followed: isFollowed }"
      >
        <text class="bottom-icon">{{ isFollowed ? '⭐' : '☆' }}</text>
        <text class="bottom-label">{{ isFollowed ? '已关注' : '关注' }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { merchantApi, groupBuyApi, resolveAssetUrl as resolveAsset } from '@/utils/api.js';

export default {
  data() {
    return {
      merchantId: '',
      merchant: null,
      products: [],
      loading: true,
      isFollowed: false
    };
  },

  onLoad(options) {
    this.merchantId = options.merchantId || '';
    if (this.merchantId) {
      this.loadMerchantDetail();
    }
  },

  methods: {
    /** 解析相对资源路径为绝对 URL(小程序必需) */
    resolveAssetUrl(url) {
      return resolveAsset(url);
    },

    /** Load merchant detail and products */
    async loadMerchantDetail() {
      this.loading = true;
      try {
        const [detail, productRes] = await Promise.all([
          merchantApi.getMerchantDetail(this.merchantId),
          groupBuyApi.getProducts({ merchantId: this.merchantId })
        ]);
        this.merchant = detail;
        this.products = productRes.records || productRes || [];
        this.isFollowed = detail.isFollowed || false;
      } catch (err) {
        uni.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },

    /** Navigate to merchant location */
    navigateTo(merchant) {
      if (!merchant.latitude || !merchant.longitude) {
        uni.showToast({ title: '暂无位置信息', icon: 'none' });
        return;
      }

      uni.openLocation({
        latitude: merchant.latitude,
        longitude: merchant.longitude,
        name: merchant.name,
        address: merchant.address,
        scale: 16
      });
    },

    /** Call merchant */
    callMerchant(merchant) {
      if (!merchant.phone) {
        uni.showToast({ title: '暂无电话号码', icon: 'none' });
        return;
      }
      uni.makePhoneCall({
        phoneNumber: merchant.phone
      });
    },

    /** Call rescue phone */
    callRescue(phone) {
      uni.makePhoneCall({
        phoneNumber: phone
      });
    },

    /** Toggle follow/收藏 */
    async toggleFollow() {
      this.isFollowed = !this.isFollowed;
      uni.showToast({
        title: this.isFollowed ? '已关注' : '已取消关注',
        icon: 'none'
      });
      // In production, call follow/unfollow API
    },

    /** Go to product detail */
    goToProduct(productId) {
      uni.navigateTo({
        url: '/pages/group-buy/detail?productId=' + productId
      });
    },

    /** Join group buy */
    joinGroupBuy(product) {
      uni.navigateTo({
        url: '/pages/group-buy/detail?productId=' + product.id
      });
    },

    /** View all products */
    viewAllProducts() {
      uni.navigateTo({ url: '/pages/group-buy/index' });
    },

    /** Preview photos */
    previewPhotos(currentIndex) {
      uni.previewImage({
        urls: this.merchant.photos,
        current: currentIndex
      });
    }
  }
};
</script>

<style lang="scss" scoped>
.merchant-detail-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-bg);
}

.detail-scroll {
  flex: 1;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: var(--font-sm);
  color: var(--color-text-hint);
}

// ==================== Header ====================
.merchant-header {
  position: relative;
}

.header-cover {
  width: 100%;
  height: 360rpx;
  background-color: #E0E0E0;
}

.header-cover-placeholder {
  width: 100%;
  height: 360rpx;
  background: linear-gradient(135deg, #FF6B35 0%, #FF8C5A 50%, #FFA87D 100%);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 0 24rpx 24rpx;
  margin-top: -80rpx;
  position: relative;
  z-index: 2;
}

.header-logo {
  width: 120rpx;
  height: 120rpx;
  border-radius: 20rpx;
  border: 4rpx solid #FFFFFF;
  background-color: #F0F0F0;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
}

.header-text {
  flex: 1;
  min-width: 0;
  margin-top: 40rpx;
}

.header-name-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 8rpx;
}

.header-name {
  font-size: var(--font-xl);
  font-weight: 700;
  color: #FFFFFF;
  max-width: 300rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.2);
}

.header-type-tag {
  padding: 4rpx 14rpx;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 16rpx;
  flex-shrink: 0;

  text {
    font-size: 20rpx;
    color: #FFFFFF;
    font-weight: 500;
  }
}

.header-rating {
  display: flex;
  align-items: center;
  gap: 4rpx;

  .star {
    font-size: 24rpx;
    color: rgba(255, 255, 255, 0.35);

    &.filled {
      color: #FFD700;
    }
  }

  .rating-text {
    font-size: var(--font-xs);
    color: rgba(255, 255, 255, 0.8);
    margin-left: 6rpx;
  }
}

.header-level-badge {
  margin-top: 8rpx;
  padding: 4rpx 14rpx;
  background: rgba(255, 215, 0, 0.2);
  border: 1rpx solid rgba(255, 215, 0, 0.4);
  border-radius: 12rpx;
  align-self: flex-start;

  text {
    font-size: 20rpx;
    color: #FFD700;
    font-weight: 600;
  }
}

// ==================== Info Section ====================
.info-section {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 0;

  &:not(:last-child) {
    border-bottom: 1rpx solid var(--color-divider);
  }

  &:active {
    opacity: 0.8;
  }
}

.info-icon {
  font-size: 32rpx;
  flex-shrink: 0;
}

.info-text-wrap {
  flex: 1;
  min-width: 0;
}

.info-label {
  display: block;
  font-size: var(--font-xs);
  color: var(--color-text-hint);
  margin-bottom: 4rpx;
}

.info-value {
  display: block;
  font-size: var(--font-sm);
  color: var(--color-text-primary);
}

.info-action-text {
  font-size: var(--font-xs);
  color: var(--color-primary);
  font-weight: 500;
  flex-shrink: 0;
}

// ==================== Products Section ====================
.products-section {
  margin: 16rpx 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24rpx 16rpx;
}

.section-title {
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text-primary);
}

.section-more {
  font-size: var(--font-xs);
  color: var(--color-primary);
}

.products-scroll {
  white-space: nowrap;
  padding: 0 24rpx;
}

.product-card {
  display: inline-flex;
  flex-direction: column;
  width: 320rpx;
  margin-right: 16rpx;
  background-color: var(--color-bg-white);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  position: relative;
  white-space: normal;

  &:active {
    opacity: 0.9;
  }
}

.product-image {
  width: 100%;
  height: 200rpx;
  background-color: var(--color-divider);
}

.product-info {
  padding: 16rpx;
}

.product-name {
  font-size: var(--font-sm);
  font-weight: 500;
  color: var(--color-text-primary);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 10rpx;
}

.product-tiers {
  display: flex;
  gap: 8rpx;
  margin-bottom: 10rpx;
  flex-wrap: wrap;
}

.tier-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8rpx 12rpx;
  background: rgba(255, 107, 53, 0.06);
  border-radius: var(--radius-sm);
  min-width: 80rpx;

  .tier-count {
    font-size: 18rpx;
    color: var(--color-text-hint);
  }

  .tier-price {
    font-size: var(--font-sm);
    color: var(--color-warning);
    font-weight: 700;
  }
}

.product-price {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  margin-bottom: 8rpx;

  .price-label {
    font-size: 20rpx;
    color: var(--color-warning);
    font-weight: 500;
  }

  .price-value {
    font-size: var(--font-lg);
    color: var(--color-warning);
    font-weight: 700;
  }

  .price-original {
    font-size: 20rpx;
    color: #BBB;
    text-decoration: line-through;
  }
}

.product-progress {
  .progress-text {
    font-size: 20rpx;
    color: var(--color-text-hint);
  }
}

.product-join-btn {
  position: absolute;
  bottom: 16rpx;
  right: 16rpx;
  padding: 8rpx 24rpx;
  background: linear-gradient(135deg, var(--color-warning), #E55D2B);
  border-radius: 24rpx;

  text {
    font-size: var(--font-xs);
    color: #FFFFFF;
    font-weight: 600;
  }

  &:active {
    opacity: 0.85;
  }
}

// ==================== Description ====================
.desc-section {
  .section-label {
    display: block;
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 12rpx;
  }

  .desc-text {
    font-size: var(--font-sm);
    color: var(--color-text-secondary);
    line-height: 1.8;
    white-space: pre-wrap;
  }
}

// ==================== Promotion ====================
.promo-section {
  margin-top: 0;
}

.promo-banner {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 20rpx 24rpx;
  background: linear-gradient(135deg, rgba(255, 107, 53, 0.06), rgba(255, 107, 53, 0.12));
  border-radius: var(--radius-sm);

  .promo-icon {
    font-size: 36rpx;
  }

  .promo-text {
    font-size: var(--font-sm);
    color: var(--color-warning);
    font-weight: 500;
    flex: 1;
  }
}

// ==================== Gallery ====================
.gallery-section {
  padding: 16rpx 24rpx;

  .section-header {
    padding: 0 0 16rpx;
  }

  .section-count {
    font-size: var(--font-xs);
    color: var(--color-text-hint);
  }
}

.gallery-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;

  .gallery-image {
    width: calc(33.33% - 6rpx);
    height: 160rpx;
    border-radius: var(--radius-sm);
    background-color: var(--color-divider);
  }
}

// ==================== Repair Section ====================
.repair-section {
  border-left: 6rpx solid var(--color-info);

  .repair-header {
    display: flex;
    align-items: center;
    gap: 10rpx;
    margin-bottom: 16rpx;

    .repair-icon {
      font-size: 32rpx;
    }

    .repair-title {
      font-size: var(--font-md);
      font-weight: 600;
      color: var(--color-text-primary);
    }
  }

  .repair-scope {
    margin-bottom: 16rpx;

    .scope-label {
      display: block;
      font-size: var(--font-xs);
      color: var(--color-text-hint);
      margin-bottom: 6rpx;
    }

    .scope-text {
      font-size: var(--font-sm);
      color: var(--color-text-secondary);
      line-height: 1.6;
    }
  }

  .repair-contact {
    display: flex;
    align-items: center;
    gap: 10rpx;
    padding: 16rpx 20rpx;
    background-color: rgba(74, 144, 217, 0.06);
    border-radius: var(--radius-sm);

    .rescue-icon {
      font-size: 28rpx;
    }

    .rescue-label {
      font-size: var(--font-xs);
      color: var(--color-text-hint);
    }

    .rescue-phone {
      font-size: var(--font-md);
      color: var(--color-info);
      font-weight: 600;
      flex: 1;
    }

    .rescue-action {
      font-size: var(--font-xs);
      color: var(--color-info);
      font-weight: 500;
    }

    &:active {
      opacity: 0.85;
    }
  }
}

// ==================== Bottom Bar ====================
.detail-bottom {
  height: 130rpx;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 12rpx 24rpx;
  background-color: var(--color-bg-white);
  border-top: 1rpx solid var(--color-border);
}

.bottom-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  padding: 8rpx 24rpx;

  .bottom-icon {
    font-size: 36rpx;
  }

  .bottom-label {
    font-size: 20rpx;
    color: var(--color-text-secondary);
  }

  &.followed .bottom-label {
    color: #F5A623;
  }

  &:active {
    opacity: 0.7;
  }
}
</style>
