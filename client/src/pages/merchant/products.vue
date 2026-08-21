<template>
  <view class="products-page">
    <!-- ==================== Top Bar ==================== -->
    <view class="top-bar">
      <text class="top-title">商品管理</text>
      <view class="add-btn" @click="goAddProduct">
        <text class="add-icon">+</text>
      </view>
    </view>

    <!-- ==================== Product List ==================== -->
    <scroll-view
      class="product-list"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
    >
      <!-- Loading -->
      <view v-if="loading && products.length === 0" class="loading-state">
        <text>加载中...</text>
      </view>

      <!-- Empty State -->
      <view v-else-if="!loading && products.length === 0" class="empty-state-wrap">
        <EmptyState
          icon="📦"
          title="暂无商品"
          description="添加团购商品吸引更多车友"
          actionText="添加商品"
          @action="goAddProduct"
        />
      </view>

      <!-- Product Cards -->
      <view v-for="product in products" :key="product.id" class="product-card">
        <view class="card-main" @click="goEditProduct(product)">
                    <view class="product-image">
            <local-image style="width:100%;height:100%;"
            :src="resolveAssetUrl(product.image) || '/static/default-product.png'"
           
            mode="aspectFill"
           />
          </view>
          <view class="product-info">
            <text class="product-name">{{ product.name }}</text>
            <view class="price-row">
              <text v-if="product.originalPrice" class="original-price">¥{{ product.originalPrice }}</text>
              <text v-if="product.tiers && product.tiers.length" class="tier-range">
                {{ getTierRange(product.tiers) }}
              </text>
            </view>
            <view class="meta-row">
              <text class="sales-text">已售 {{ product.sales || 0 }} 份</text>
              <view
                class="status-switch"
                :class="{ on: product.status === 'on' }"
                @click.stop="toggleStatus(product)"
              >
                <text>{{ product.status === 'on' ? '上架中' : '已下架' }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- Action Buttons -->
        <view class="card-actions">
          <view class="action-btn edit-btn" @click="goEditProduct(product)">
            <text class="action-icon">✏️</text>
            <text>编辑</text>
          </view>
          <view
            class="action-btn toggle-btn"
            :class="{ off: product.status !== 'on' }"
            @click="toggleStatus(product)"
          >
            <text class="action-icon">{{ product.status === 'on' ? '⬇️' : '⬆️' }}</text>
            <text>{{ product.status === 'on' ? '下架' : '上架' }}</text>
          </view>
          <view class="action-btn delete-btn" @click="confirmDelete(product)">
            <text class="action-icon">🗑️</text>
            <text>删除</text>
          </view>
        </view>
      </view>

      <view class="bottom-placeholder safe-area-bottom"></view>
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
const products = ref([]);

// ---- Methods ----
function getTierRange(tiers) {
  if (!tiers || !tiers.length) return '';
  const prices = tiers.map(t => t.price || t.groupPrice || 0).filter(p => p > 0);
  if (!prices.length) return '';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min === max) return '团购 ¥' + min;
  return '团购 ¥' + min + ' ~ ¥' + max;
}

async function fetchProducts() {
  try {
    const res = await api.merchant.getProducts();
    products.value = res.list || res.records || res || [];
  } catch (err) {
    console.error('Failed to fetch products:', err);
    products.value = [];
  }
}

async function toggleStatus(product) {
  const newStatus = product.status === 'on' ? 'off' : 'on';
  const actionText = newStatus === 'off' ? '下架' : '上架';

  uni.showModal({
    title: '确认' + actionText,
    content: '确定要' + actionText + '该商品吗？',
    confirmText: '确定',
    success: async (resModal) => {
      if (resModal.confirm) {
        try {
          await api.merchant.toggleProduct(product.id, newStatus === 'on' ? 1 : 0);
          product.status = newStatus === 'on' ? 1 : 0;
          uni.showToast({ title: '已' + actionText, icon: 'success' });
        } catch (err) {
          uni.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    }
  });
}

function confirmDelete(product) {
  uni.showModal({
    title: '删除商品',
    content: '确定要删除"' + product.name + '"吗？删除后不可恢复。',
    confirmText: '确定删除',
    confirmColor: '#E74C3C',
    success: async (resModal) => {
      if (resModal.confirm) {
        try {
          await api.put('/merchants/products/' + product.id, { status: 0 });
          const index = products.value.findIndex(p => p.id === product.id);
          if (index !== -1) products.value.splice(index, 1);
          uni.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          uni.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    }
  });
}

function goAddProduct() {
  uni.navigateTo({ url: '/pages/merchant/products/edit' });
}

function goEditProduct(product) {
  uni.navigateTo({ url: '/pages/merchant/products/edit?id=' + product.id });
}

async function onRefresh() {
  refreshing.value = true;
  await fetchProducts();
  refreshing.value = false;
}

// ---- Lifecycle ----
onShow(async () => {
  loading.value = true;
  await fetchProducts();
  loading.value = false;
});
</script>

<style lang="scss" scoped>
.products-page {
  height: 100vh;
  background-color: #F5F5F5;
  display: flex;
  flex-direction: column;
}

// ===== Top Bar =====
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  background-color: #FFFFFF;
  border-bottom: 1rpx solid #F0F0F0;
}

.top-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A1A;
}

.add-btn {
  width: 64rpx;
  height: 64rpx;
  background: linear-gradient(135deg, #FF6B35, #E55D2B);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 12rpx rgba(229, 93, 43, 0.3);
  &:active { opacity: 0.85; }
}

.add-icon {
  font-size: 44rpx;
  color: #FFFFFF;
  font-weight: 300;
  line-height: 1;
}

// ===== Product List =====
.product-list {
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
  padding-top: 80rpx;
}

// ===== Product Card =====
.product-card {
  margin: 16rpx 24rpx;
  background-color: #FFFFFF;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.card-main {
  display: flex;
  padding: 20rpx;
  gap: 16rpx;
  &:active { background-color: #FAFAFA; }
}

.product-image {
  width: 160rpx;
  height: 160rpx;
  border-radius: 12rpx;
  background-color: #F5F5F5;
  flex-shrink: 0;
    overflow: hidden;
  }

.product-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.product-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #1A1A1A;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  line-height: 1.4;
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 10rpx;
  .original-price {
    font-size: 24rpx;
    color: #bbb;
    text-decoration: line-through;
  }
  .tier-range {
    font-size: 28rpx;
    font-weight: 700;
    color: #E55D2B;
  }
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  .sales-text {
    font-size: 22rpx;
    color: #999;
  }
}

.status-switch {
  padding: 4rpx 16rpx;
  border-radius: 12rpx;
  background-color: #F5F5F5;
  text {
    font-size: 22rpx;
    color: #999;
    font-weight: 500;
  }
  &.on {
    background-color: #E8F8EE;
    text { color: #07C160; }
  }
}

// ===== Card Actions =====
.card-actions {
  display: flex;
  border-top: 1rpx solid #F5F5F5;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  padding: 18rpx 0;
  font-size: 24rpx;
  color: #666;
  &:not(:last-child) { border-right: 1rpx solid #F5F5F5; }
  &:active { background-color: #FAFAFA; }
}

.action-icon {
  font-size: 26rpx;
}

.toggle-btn {
  &.off { color: #07C160; }
}

.delete-btn {
  color: #E74C3C;
}

// ===== Bottom =====
.bottom-placeholder {
  height: 40rpx;
}
</style>
