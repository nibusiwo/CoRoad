<template>
  <view class="teams-page">
    <scroll-view class="list-scroll" scroll-y :refresher-enabled="true" :refresher-triggered="refreshing" @refresherrefresh="onRefresh">
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <view v-else-if="list.length === 0" class="empty-state">
        <text class="empty-icon">🚙</text>
        <text class="empty-text">还没有加入任何车队</text>
        <text class="empty-hint">发布行程或申请加入同行车队后，会显示在这里</text>
      </view>

      <view v-else class="team-list-wrap">
        <view v-for="trip in list" :key="trip.id" class="team-card" @click="goDetail(trip)">
          <view class="card-top">
            <view class="card-title-row">
              <text class="card-title">{{ trip.title || '自驾车队' }}</text>
              <view class="role-badge" v-if="trip.isCaptain">
                <text>队长</text>
              </view>
            </view>
            <view class="status-badge">
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
          <view class="card-bottom">
            <text class="leader-info">队长：{{ trip.captainNickname || '未知' }}</text>
            <text class="card-arrow">›</text>
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
      list: [],
      loading: true,
      refreshing: false
    };
  },

  onShow() {
    this.fetchTeams();
  },

  methods: {
    async fetchTeams() {
      this.loading = true;
      try {
        const store = useTripStore();
        const res = await store.fetchTripList({ mine: 1, size: 50 });
        const rows = res && res.list ? res.list : [];
        // 我的车队 = 已加入且行程仍处于招募中/进行中
        this.list = rows.filter((t) => t.status === 1 || t.status === 2);
      } catch (err) {
        console.warn('加载我的车队失败:', err);
        this.list = [];
      } finally {
        this.loading = false;
        this.refreshing = false;
      }
    },

    async onRefresh() {
      this.refreshing = true;
      await this.fetchTeams();
    },

    goDetail(trip) {
      uni.navigateTo({ url: '/pages/trip/detail?tripId=' + trip.id });
    },

    statusLabel(status) {
      const map = { 1: '招募中', 2: '进行中' };
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
.teams-page {
  height: 100vh;
  background: #FFFFFF;
}

.list-scroll {
  height: 100%;
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
  .empty-hint { font-size: 24rpx; color: #999; text-align: center; }
}

.team-list-wrap {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.team-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 28rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12rpx;

    .card-title-row {
      display: flex;
      align-items: center;
      gap: 12rpx;

      .card-title {
        font-size: 32rpx;
        font-weight: 700;
        color: #1A1A1A;
      }

      .role-badge {
        font-size: 20rpx;
        color: #FF8F00;
        background: #FFF8E1;
        padding: 2rpx 14rpx;
        border-radius: 12rpx;
      }
    }

    .status-badge {
      font-size: 22rpx;
      padding: 4rpx 18rpx;
      border-radius: 16rpx;
      background: #E8F8EF;
      color: #07C160;
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

  .card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid #F5F5F5;

    .leader-info {
      font-size: 24rpx;
      color: #666;
    }

    .card-arrow {
      font-size: 32rpx;
      color: #CCC;
    }
  }
}

.bottom-placeholder {
  height: 60rpx;
}
</style>
