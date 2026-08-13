<template>
  <view class="my-trips-page">
    <!-- 顶部 Tab -->
    <view class="tabs">
      <view
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-item"
        :class="{ active: currentTab === tab.key }"
        @click="switchTab(tab.key)"
      >
        <text class="tab-text">{{ tab.label }}</text>
        <view v-if="currentTab === tab.key" class="tab-line"></view>
      </view>
    </view>

    <scroll-view class="list-scroll" scroll-y :refresher-enabled="true" :refresher-triggered="refreshing" @refresherrefresh="onRefresh">
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <view v-else-if="list.length === 0" class="empty-state">
        <text class="empty-icon">{{ currentTab === 'active' ? '🚗' : '📋' }}</text>
        <text class="empty-text">{{ currentTab === 'active' ? '暂无进行中的行程' : '暂无历史行程' }}</text>
        <text class="empty-hint">发起或加入行程后，会显示在这里</text>
      </view>

      <view v-else class="trip-list-wrap">
        <view v-for="trip in list" :key="trip.id" class="trip-card" @click="goDetail(trip)">
          <view class="card-top">
            <text class="card-title">{{ trip.title || '自驾行程' }}</text>
            <view class="status-badge" :class="'st-' + trip.status">
              <text>{{ statusLabel(trip.status) }}</text>
            </view>
          </view>
          <view class="card-route">
            <text>{{ trip.startPoint || '起点' }} → {{ trip.endPoint || '终点' }}</text>
          </view>
          <view class="card-meta">
            <text>{{ formatDate(trip.departureTime) }} 出发</text>
            <text class="dot">·</text>
            <text>约{{ trip.estimatedDays || '?' }}天</text>
            <text class="dot">·</text>
            <text>{{ trip.joinedCars || 0 }}/{{ trip.maxCars || '?' }}车</text>
          </view>
          <view class="card-role" v-if="trip.isCaptain">
            <text>我是队长</text>
          </view>
        </view>
        <view class="bottom-placeholder"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { useTripStore } from '@/store/trip.js';

export default {
  data() {
    return {
      currentTab: 'active',
      tabs: [
        { key: 'active', label: '进行中' },
        { key: 'history', label: '历史' }
      ],
      list: [],
      loading: true,
      refreshing: false
    };
  },

  onShow() {
    this.fetchTrips();
  },

  methods: {
    switchTab(key) {
      if (this.currentTab === key) return;
      this.currentTab = key;
      this.fetchTrips();
    },

    async fetchTrips() {
      this.loading = true;
      try {
        const store = useTripStore();
        const res = await store.fetchTripList({ mine: 1, size: 50 });
        const rows = res && res.list ? res.list : [];
        this.list = this.currentTab === 'active'
          ? rows.filter((t) => t.status === 1 || t.status === 2)
          : rows.filter((t) => t.status === 3);
      } catch (err) {
        console.warn('加载我的行程失败:', err);
        this.list = [];
      } finally {
        this.loading = false;
        this.refreshing = false;
      }
    },

    async onRefresh() {
      this.refreshing = true;
      await this.fetchTrips();
    },

    goDetail(trip) {
      uni.navigateTo({ url: '/pages/trip/detail?tripId=' + trip.id });
    },

    statusLabel(status) {
      const map = {
        0: '已取消',
        1: '招募中',
        2: '进行中',
        3: '已完成'
      };
      return map[status] || '未知';
    },

    formatDate(timeStr) {
      if (!timeStr) return '待定';
      const d = new Date(timeStr);
      const p = (n) => String(n).padStart(2, '0');
      return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
  }
};
</script>

<style lang="scss" scoped>
.my-trips-page {
  height: 100vh;
  background: #FFFFFF;
  display: flex;
  flex-direction: column;
}

.tabs {
  display: flex;
  background: #FFFFFF;
  padding: 0 48rpx;

  .tab-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24rpx 0 20rpx;
    position: relative;

    .tab-text {
      font-size: 30rpx;
      color: #666;
    }

    .tab-line {
      position: absolute;
      bottom: 0;
      width: 48rpx;
      height: 6rpx;
      border-radius: 4rpx;
      background: #07C160;
    }

    &.active .tab-text {
      color: #07C160;
      font-weight: 700;
    }
  }
}

.list-scroll {
  flex: 1;
  min-height: 0;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  color: #999;
  font-size: 28rpx;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 140rpx 48rpx;
  gap: 16rpx;

  .empty-icon { font-size: 100rpx; opacity: 0.5; }
  .empty-text { font-size: 30rpx; font-weight: 600; color: #666; }
  .empty-hint { font-size: 24rpx; color: #999; }
}

.trip-list-wrap {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.trip-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 28rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12rpx;

    .card-title {
      font-size: 32rpx;
      font-weight: 700;
      color: #1A1A1A;
    }

    .status-badge {
      font-size: 22rpx;
      padding: 4rpx 18rpx;
      border-radius: 16rpx;

      &.st-1 { color: #4A90D9; background: #EDF4FC; }
      &.st-2 { color: #07C160; background: #E8F8EF; }
      &.st-3 { color: #999; background: #F0F0F0; }
    }
  }

  .card-route {
    font-size: 28rpx;
    font-weight: 500;
    color: #1A1A1A;
    margin-bottom: 12rpx;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 10rpx;
    font-size: 24rpx;
    color: #999;

    .dot { color: #DDD; }
  }

  .card-role {
    margin-top: 16rpx;
    font-size: 20rpx;
    color: #FF8F00;
    background: #FFF8E1;
    display: inline-flex;
    padding: 4rpx 16rpx;
    border-radius: 12rpx;
  }
}

.bottom-placeholder {
  height: 60rpx;
}
</style>
