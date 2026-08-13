<template>
  <view class="notify-page">
    <scroll-view
      class="notify-scroll"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
    >
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <view v-else-if="list.length === 0" class="empty-state">
        <text class="empty-icon">🔔</text>
        <text class="empty-text">暂无通知</text>
        <text class="empty-hint">拼团结果、审核进度、系统提醒会显示在这里</text>
      </view>

      <view v-else class="notify-list">
        <view
          v-for="item in list"
          :key="item.id"
          class="notify-item"
          :class="{ unread: !item.read_at }"
          @click="onItemTap(item)"
        >
          <view class="notify-icon-wrap">
            <u-icon :name="notifyIconName(item.type)" size="36" color="#07C160" />
            <view v-if="!item.read_at" class="unread-dot"></view>
          </view>
          <view class="notify-content">
            <view class="notify-title-row">
              <text class="notify-title">{{ item.title }}</text>
              <text class="notify-time">{{ formatTime(item.created_at) }}</text>
            </view>
            <text class="notify-content-text">{{ item.content }}</text>
          </view>
        </view>
      </view>

      <view v-if="!loading && list.length > 0 && hasMore" class="load-more" @click="loadMore">
        <text>{{ loadingMore ? '加载中...' : '加载更多' }}</text>
      </view>

      <view class="bottom-placeholder safe-area-bottom"></view>
    </scroll-view>
  </view>
</template>

<script>
import api from '@/utils/api.js';

export default {
  data() {
    return {
      list: [],
      loading: true,
      refreshing: false,
      loadingMore: false,
      page: 1,
      hasMore: true
    };
  },

  onLoad() {
    this.fetchNotifications(1);
  },

  methods: {
    async fetchNotifications(page) {
      try {
        const res = await api.get('/support/notifications', { page, page_size: 20 });
        const items = (res && res.list) || [];
        const pagination = (res && res.pagination) || {};
        if (page === 1) {
          this.list = items;
        } else {
          this.list = [...this.list, ...items];
        }
        this.page = page;
        this.hasMore = page < (pagination.totalPages || 1);
      } catch (err) {
        console.warn('加载通知失败:', err);
      } finally {
        this.loading = false;
        this.refreshing = false;
        this.loadingMore = false;
      }
    },

    async loadMore() {
      if (this.loadingMore || !this.hasMore) return;
      this.loadingMore = true;
      await this.fetchNotifications(this.page + 1);
    },

    async onRefresh() {
      this.refreshing = true;
      await this.fetchNotifications(1);
    },

    async onItemTap(item) {
      if (item.read_at) return;
      try {
        await api.post('/support/notifications/' + item.id + '/read');
        item.read_at = new Date().toISOString();
      } catch (err) {
        console.warn('标记已读失败:', err);
      }
      // 有业务跳转目标时跳转
      let payload = null;
      try {
        payload = item.payload ? JSON.parse(item.payload) : null;
      } catch (e) {
        payload = null;
      }
      if (payload && payload.activity_id) {
        uni.navigateTo({
          url: '/pages/group-buy/activity?activityId=' + payload.activity_id
        });
      } else if (payload && payload.session_id) {
        uni.navigateTo({
          url: '/pages/message/chat?sessionId=' + payload.session_id + '&type=location_room'
        });
      } else if (payload && payload.merchant_id) {
        uni.navigateTo({
          url: '/pages/merchant/detail?id=' + payload.merchant_id
        });
      }
    },

    typeIcon(type) {
      const map = {
        group_buy_success: '🎉',
        group_buy_failed: '⚠️',
        merchant_review: '🏪',
        topic_new_message: '💬',
        system: '📢',
        system_notification: '📢'
      };
      return map[type] || '🔔';
    },

    /** 通知类型 -> u-icon 图标名 */
    notifyIconName(type) {
      const map = {
        group_buy_success: 'checkmark-circle-fill',
        group_buy_failed: 'warning',
        merchant_review: 'server-fill',
        merchant_new_order: 'order',
        merchant_settlement: 'rmb-circle',
        order_verified: 'checkmark-circle-fill',
        trip_detach: 'warning',
        sentinel_alert: 'warning',
        topic_new_message: 'chat',
        system: 'bell',
        system_notification: 'bell'
      };
      return map[type] || 'bell';
    },

    formatTime(timeStr) {
      if (!timeStr) return '';
      const date = new Date(timeStr);
      const now = new Date();
      const diff = now - date;
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
      if (diff < 86400000) {
        const h = String(date.getHours()).padStart(2, '0');
        const m = String(date.getMinutes()).padStart(2, '0');
        return h + ':' + m;
      }
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return month + '/' + day;
    }
  }
};
</script>

<style lang="scss" scoped>
.notify-page {
  height: 100vh;
  background-color: #F5F5F5;
}

.notify-scroll {
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

  .empty-icon {
    font-size: 100rpx;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 30rpx;
    font-weight: 600;
    color: #666;
  }

  .empty-hint {
    font-size: 24rpx;
    color: #999;
  }
}

.notify-list {
  padding: 16rpx 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.notify-item {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  background: #FFFFFF;
  border-radius: 20rpx;
  padding: 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

  &.unread {
    background: #F3FBF6;
    border: 1rpx solid rgba(7, 193, 96, 0.25);
  }

  .notify-icon-wrap {
    position: relative;
    width: 72rpx;
    height: 72rpx;
    border-radius: 20rpx;
    background: #F0F7F3;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    .notify-icon {
      font-size: 36rpx;
    }

    .unread-dot {
      position: absolute;
      top: -4rpx;
      right: -4rpx;
      width: 18rpx;
      height: 18rpx;
      border-radius: 50%;
      background: #E74C3C;
      border: 2rpx solid #FFFFFF;
    }
  }

  .notify-content {
    flex: 1;
    min-width: 0;

    .notify-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .notify-title {
        font-size: 28rpx;
        font-weight: 600;
        color: #1A1A1A;
      }

      .notify-time {
        font-size: 22rpx;
        color: #999;
        flex-shrink: 0;
        margin-left: 12rpx;
      }
    }

    .notify-content-text {
      font-size: 24rpx;
      color: #666;
      line-height: 1.5;
      margin-top: 8rpx;
      display: block;
    }
  }
}

.load-more {
  text-align: center;
  padding: 24rpx;
  color: #999;
  font-size: 24rpx;
}

.bottom-placeholder {
  height: 60rpx;
}
</style>
