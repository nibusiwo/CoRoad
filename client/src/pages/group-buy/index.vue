<template>
  <view class="group-buy-page">
    <!-- Search Bar -->
    <view class="search-bar">
      <view class="search-input-wrap">
        <text class="search-icon">🔍</text>
        <input
          class="search-input"
          v-model="searchKeyword"
          placeholder="搜索团购商品"
          confirm-type="search"
          @confirm="onSearch"
        />
        <text v-if="searchKeyword" class="search-clear" @click="clearSearch">✕</text>
      </view>
    </view>

    <!-- Category Filter Chips -->
    <scroll-view class="category-scroll" scroll-x :show-scrollbar="false">
      <view class="category-list">
        <view
          v-for="cat in categories"
          :key="cat.value"
          class="category-chip"
          :class="{ active: activeCategory === cat.value }"
          @click="onCategoryChange(cat.value)"
        >
          <text>{{ cat.label }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- Sort Options -->
    <view class="sort-bar">
      <view
        v-for="sort in sortOptions"
        :key="sort.value"
        class="sort-item"
        :class="{ active: activeSort === sort.value }"
        @click="onSortChange(sort.value)"
      >
        <text>{{ sort.label }}</text>
      </view>
    </view>

    <!-- Product List -->
    <scroll-view
      class="product-list"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      :refresher-threshold="80"
      @refresherrefresh="onRefresh"
      @scrolltolower="onLoadMore"
    >
      <!-- Loading -->
      <view v-if="loading && products.length === 0" class="loading-state">
        <text>加载中...</text>
      </view>

      <!-- Empty -->
      <view v-else-if="!loading && products.length === 0" class="empty-state">
        <text class="empty-icon">🛍️</text>
        <text class="empty-text">暂无团购商品</text>
        <text class="empty-hint">敬请期待更多优惠</text>
      </view>

      <!-- Product Cards -->
      <view
        v-for="product in products"
        :key="product.id"
        class="product-card card"
        @click="goDetail(product)"
      >
        <view class="card-body">
          <!-- Product Image -->
                    <view class="product-image">
            <local-image style="width:100%;height:100%;"
            :src="resolveAssetUrl(product.image) || '/static/default-product.png'"
           
            mode="aspectFill"
           />
          </view>

          <!-- Product Info -->
          <view class="product-info">
            <text class="product-name">{{ product.name }}</text>
            <view class="merchant-row">
              <text class="merchant-name">{{ product.merchantName || '商家' }}</text>
              <view class="merchant-rating">
                <text class="star">★</text>
                <text class="rating-text">{{ product.rating || '4.5' }}</text>
              </view>
            </view>

            <!-- Distance -->
            <text v-if="product.distance !== undefined" class="distance-text">
              {{ formatDistance(product.distance) }}
            </text>

            <!-- Hot Badge -->
            <view v-if="product.joinedCount > 0" class="hot-badge">
              <text class="hot-icon">🔥</text>
              <text class="hot-text">{{ product.joinedCount }}人正在拼</text>
            </view>

            <!-- Price Row -->
            <view class="price-row">
              <text class="original-price">¥{{ product.originalPrice }}</text>
              <text class="group-price">¥{{ product.groupPrice }}</text>
            </view>

            <!-- Progress Bar -->
            <view class="progress-section">
              <view class="progress-bar">
                <view
                  class="progress-fill"
                  :style="{
                    width: progressPercent(product) + '%',
                    background: progressGradient(product)
                  }"
                ></view>
              </view>
              <text class="progress-text">已拼{{ product.joinedCount || 0 }}人</text>
            </view>
          </view>
        </view>

        <!-- Join Button -->
        <view class="card-actions">
          <view class="join-btn" @click.stop="joinActivity(product)">
            <text>立即参团</text>
          </view>
        </view>
      </view>

      <!-- Load More -->
      <view v-if="loadingMore" class="loading-more">
        <text>加载更多...</text>
      </view>
      <view v-else-if="noMore" class="no-more">
        <text>— 没有更多了 —</text>
      </view>

      <!-- Bottom Placeholder -->
      <view class="bottom-placeholder safe-area-bottom"></view>
    </scroll-view>
  </view>
</template>

<script>
import { groupBuy, resolveAssetUrl as resolveAsset } from '@/utils/api.js';

export default {
  data() {
    return {
      // Search
      searchKeyword: '',

      // Category
      categories: [
        { label: '全部', value: 'all' },
        { label: '住宿', value: 'hotel' },
        { label: '餐饮', value: 'food' },
        { label: '加油', value: 'gas' },
        { label: '维修', value: 'repair' },
        { label: '露营', value: 'camping' },
        { label: '购物', value: 'shopping' }
      ],
      activeCategory: 'all',

      // Sort
      sortOptions: [
        { label: '距离最近', value: 'distance' },
        { label: '热度最高', value: 'hot' },
        { label: '价格最低', value: 'price' }
      ],
      activeSort: 'distance',

      // Products
      products: [],
      page: 1,
      pageSize: 20,
      total: 0,

      // States
      loading: false,
      loadingMore: false,
      noMore: false,
      refreshing: false,

      // Location
      currentLocation: null
    };
  },

  onLoad() {
    this.getLocation();
    this.fetchProducts();
  },

  onShow() {
    // Refresh when coming back from another page
    if (this.products.length > 0) {
      this.page = 1;
      this.fetchProducts();
    }
  },

  methods: {
    /** 解析相对资源路径为绝对 URL(小程序必需) */
    resolveAssetUrl(url) {
      return resolveAsset(url);
    },

    /** Get current location */
    getLocation() {
      uni.getLocation({
        type: 'gcj02',
        success: (res) => {
          this.currentLocation = {
            lng: res.longitude,
            lat: res.latitude
          };
        },
        fail: () => {
          // Location permission denied, use defaults
          this.currentLocation = null;
        }
      });
    },

    /** Fetch products from API */
    async fetchProducts() {
      if (this.loading) return;
      this.loading = true;

      try {
        const params = {
          page: this.page,
          size: this.pageSize,
          sort: this.activeSort
        };

        if (this.activeCategory !== 'all') {
          params.category = this.activeCategory;
        }

        if (this.searchKeyword) {
          params.keyword = this.searchKeyword;
        }

        if (this.currentLocation) {
          params.lng = this.currentLocation.lng;
          params.lat = this.currentLocation.lat;
        }

        const res = await groupBuy.getProducts(params);
        const records = res.records || res || [];
        this.total = res.total || 0;

        if (this.page === 1) {
          this.products = records;
        } else {
          this.products = [...this.products, ...records];
        }

        this.noMore = this.products.length >= this.total;
      } catch (err) {
        console.error('Failed to fetch group buy products:', err);
        if (this.page === 1) {
          this.products = [];
        }
      } finally {
        this.loading = false;
        this.loadingMore = false;
        this.refreshing = false;
      }
    },

    /** Pull-down refresh */
    async onRefresh() {
      this.refreshing = true;
      this.page = 1;
      await this.fetchProducts();
    },

    /** Load more on scroll to bottom */
    onLoadMore() {
      if (this.loadingMore || this.noMore) return;
      this.loadingMore = true;
      this.page++;
      this.fetchProducts();
    },

    /** Search submit */
    onSearch() {
      this.page = 1;
      this.products = [];
      this.fetchProducts();
    },

    /** Clear search */
    clearSearch() {
      this.searchKeyword = '';
      this.page = 1;
      this.products = [];
      this.fetchProducts();
    },

    /** Category change */
    onCategoryChange(value) {
      if (this.activeCategory === value) return;
      this.activeCategory = value;
      this.page = 1;
      this.products = [];
      this.fetchProducts();
    },

    /** Sort change */
    onSortChange(value) {
      if (this.activeSort === value) return;
      this.activeSort = value;
      this.page = 1;
      this.products = [];
      this.fetchProducts();
    },

    /** Navigate to detail */
    goDetail(product) {
      uni.navigateTo({
        url: '/pages/group-buy/detail?id=' + product.id
      });
    },

    /** Join group buy activity */
    joinActivity(product) {
      uni.navigateTo({
        url: '/pages/group-buy/activity?productId=' + product.id
      });
    },

    /** Calculate progress percentage */
    progressPercent(product) {
      const target = product.targetCount || 10;
      const joined = product.joinedCount || 0;
      return Math.min(100, Math.round((joined / target) * 100));
    },

    /** Progress bar gradient color */
    progressGradient(product) {
      const pct = this.progressPercent(product);
      if (pct < 30) return '#b0b0b0';
      if (pct < 60) return 'linear-gradient(90deg, #07C160, #4cd964)';
      if (pct < 90) return 'linear-gradient(90deg, #f5a623, #ff8c00)';
      return 'linear-gradient(90deg, #ff6b35, #e74c3c)';
    },

    /** Format distance */
    formatDistance(meters) {
      if (!meters && meters !== 0) return '';
      if (meters < 1000) {
        return Math.round(meters) + 'm';
      }
      return (meters / 1000).toFixed(1) + 'km';
    }
  },

  /** Share */
  onShareAppMessage() {
    return {
      title: '同道团购 - 自驾出行专属优惠',
      path: '/pages/group-buy/index'
    };
  }
};
</script>

<style lang="scss" scoped>
.group-buy-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F5F5F5;
}

// ===== Search Bar =====
.search-bar {
  padding: 16rpx 24rpx;
  background-color: #FFFFFF;
}

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  height: 72rpx;
  background-color: #F5F5F5;
  border-radius: 36rpx;
  padding: 0 24rpx;
}

.search-icon {
  font-size: 30rpx;
  margin-right: 12rpx;
}

.search-input {
  flex: 1;
  height: 100%;
  font-size: 28rpx;
  color: #1A1A1A;
}

.search-clear {
  font-size: 28rpx;
  color: #999;
  padding: 8rpx;
  margin-left: 8rpx;
}

// ===== Category Scroll =====
.category-scroll {
  background-color: #FFFFFF;
  padding-bottom: 12rpx;
  white-space: nowrap;
}

.category-list {
  display: inline-flex;
  padding: 0 16rpx;
  gap: 12rpx;
}

.category-chip {
  display: inline-flex;
  align-items: center;
  height: 56rpx;
  padding: 0 24rpx;
  border-radius: 28rpx;
  background-color: #F5F5F5;
  font-size: 24rpx;
  color: #666;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &.active {
    background-color: rgba(7, 193, 96, 0.1);
    color: #07C160;
    font-weight: 600;
  }
}

// ===== Sort Bar =====
.sort-bar {
  display: flex;
  align-items: center;
  background-color: #FFFFFF;
  padding: 0 24rpx 12rpx;
  gap: 32rpx;
  border-bottom: 1rpx solid #F0F0F0;
}

.sort-item {
  font-size: 26rpx;
  color: #999;
  padding: 8rpx 0;
  position: relative;

  &.active {
    color: #07C160;
    font-weight: 600;

    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 4rpx;
      background-color: #07C160;
      border-radius: 2rpx;
    }
  }
}

// ===== Product List =====
.product-list {
  flex: 1;
}

// Loading & Empty States
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;

  .empty-icon {
    font-size: 80rpx;
    margin-bottom: 16rpx;
  }

  .empty-text {
    font-size: 30rpx;
    color: #666;
    margin-bottom: 8rpx;
  }

  .empty-hint {
    font-size: 24rpx;
    color: #999;
  }
}

// ===== Product Card =====
.product-card {
  margin: 16rpx 24rpx;
  padding: 0;
  overflow: hidden;
  background-color: #FFFFFF;
  border-radius: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

  .card-body {
    display: flex;
    padding: 20rpx;
    gap: 16rpx;
  }
}

.product-image {
  width: 200rpx;
  height: 200rpx;
  border-radius: 12rpx;
  flex-shrink: 0;
  background-color: #F5F5F5;
    overflow: hidden;
  }

.product-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.product-name {
  font-size: 30rpx;
  font-weight: 600;
  color: #1A1A1A;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.merchant-row {
  display: flex;
  align-items: center;
  gap: 12rpx;

  .merchant-name {
    font-size: 24rpx;
    color: #999;
  }

  .merchant-rating {
    display: flex;
    align-items: center;
    gap: 4rpx;

    .star {
      font-size: 22rpx;
      color: #f5a623;
    }

    .rating-text {
      font-size: 22rpx;
      color: #f5a623;
      font-weight: 500;
    }
  }
}

.distance-text {
  font-size: 22rpx;
  color: #07C160;
  background-color: rgba(7, 193, 96, 0.06);
  padding: 2rpx 12rpx;
  border-radius: 12rpx;
  align-self: flex-start;
}

.hot-badge {
  display: flex;
  align-items: center;
  align-self: flex-start;
  gap: 4rpx;
  background: linear-gradient(135deg, #fff5f0, #ffede3);
  padding: 4rpx 14rpx;
  border-radius: 16rpx;

  .hot-icon {
    font-size: 22rpx;
  }

  .hot-text {
    font-size: 20rpx;
    color: #e74c3c;
    font-weight: 600;
  }
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-top: 4rpx;

  .original-price {
    font-size: 22rpx;
    color: #bbb;
    text-decoration: line-through;
  }

  .group-price {
    font-size: 36rpx;
    font-weight: 700;
    color: #e74c3c;

    &::before {
      content: '¥';
      font-size: 24rpx;
    }
  }
}

.progress-section {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 2rpx;

  .progress-bar {
    flex: 1;
    height: 10rpx;
    background-color: #F0F0F0;
    border-radius: 5rpx;
    overflow: hidden;

    .progress-fill {
      height: 100%;
      border-radius: 5rpx;
      transition: width 0.6s ease;
    }
  }

  .progress-text {
    font-size: 20rpx;
    color: #999;
    white-space: nowrap;
  }
}

.card-actions {
  padding: 0 20rpx 20rpx;
  display: flex;
  justify-content: flex-end;
}

.join-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 180rpx;
  height: 64rpx;
  background: linear-gradient(135deg, #e74c3c, #ff6b35);
  border-radius: 32rpx;
  box-shadow: 0 4rpx 12rpx rgba(231, 76, 60, 0.3);
  transition: opacity 0.15s;

  &:active {
    opacity: 0.85;
  }

  text {
    font-size: 26rpx;
    color: #FFFFFF;
    font-weight: 600;
  }
}

// ===== Load More =====
.loading-more,
.no-more {
  display: flex;
  justify-content: center;
  padding: 24rpx 0;
  font-size: 24rpx;
  color: #999;
}

// ===== Bottom =====
.bottom-placeholder {
  height: 40rpx;
}
</style>
