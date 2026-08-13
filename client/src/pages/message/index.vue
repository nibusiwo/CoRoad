<template>
  <view class="message-page">
    <!-- 顶部筛选标签 -->
    <view class="filter-tabs">
      <view
        v-for="tab in filterTabs"
        :key="tab.key"
        class="tab-item"
        :class="{ active: currentFilter === tab.key }"
        @click="onFilterChange(tab.key)"
      >
        <u-icon
          v-if="tab.icon"
          :name="tab.icon"
          size="22"
          :color="currentFilter === tab.key ? '#FFFFFF' : '#666666'"
          style="margin-right: 6rpx;"
        />
        <text class="tab-text">{{ tab.label }}</text>
        <view v-if="tab.key === 'all' && totalUnread > 0" class="tab-badge">
          {{ totalUnread > 99 ? '99+' : totalUnread }}
        </view>
      </view>
    </view>

    <!-- 会话列表 -->
    <scroll-view
      class="session-list"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
    >
      <!-- 加载中 -->
      <view v-if="loading" class="loading-state">
        <text class="loading-text">加载中...</text>
      </view>

      <!-- 空状态 -->
      <view v-else-if="displayList.length === 0" class="empty-state">
        <text class="empty-icon">💬</text>
        <text class="empty-text">暂无消息</text>
        <text class="empty-hint">加入车队或位置共享后，消息会出现在这里</text>
      </view>

      <!-- 会话项 -->
      <view
        v-for="session in displayList"
        :key="session.id"
        class="session-item"
        :class="{ 'session-active': session.isActive, 'session-unread': session.unreadCount > 0 }"
        @click="onSessionTap(session)"
      >
        <!-- 头像区域 -->
        <view class="session-avatar-wrap">
          <!-- 车队群聊: 展示成员头像九宫格(类似微信群头像) -->
          <view
            v-if="session.type === 'team' && session.memberAvatars && session.memberAvatars.length"
            class="avatar-grid"
            :class="'grid-count-' + Math.min(session.memberAvatars.length, 9)"
          >
            <view
              v-for="(member, mIndex) in session.memberAvatars.slice(0, 9)"
              :key="mIndex"
              class="avatar-grid-cell"
            >
              <image
                v-if="member.avatar"
                :src="member.avatar"
                class="avatar-grid-img"
                mode="aspectFill"
              />
              <view v-else class="avatar-grid-fallback" :style="{ backgroundColor: getAvatarColor(member.nickname) }">
                <text class="avatar-grid-text">{{ getAvatarInitial(member.nickname) }}</text>
              </view>
            </view>
          </view>
          <image
            v-else
            :src="getSessionAvatar(session)"
            class="session-avatar"
            mode="aspectFill"
          />
          <view class="type-icon">
            <text>{{ getTypeIcon(session.type) }}</text>
          </view>
        </view>

        <!-- 内容区域 -->
        <view class="session-content">
          <view class="session-top">
            <view class="session-name-wrap">
              <text class="session-name text-ellipsis">{{ session.name }}</text>
              <text v-if="session.memberCount" class="member-count">· {{ session.memberCount }}人</text>
              <text v-if="session.isActive && session.type === 'team'" class="live-dot">🟢</text>
            </view>
            <text class="session-time">{{ formatTime(session.lastMessageTime) }}</text>
          </view>

          <view class="session-bottom">
            <!-- 最后一条消息预览 -->
            <text v-if="!session.isStrangerRemote" class="session-preview text-ellipsis">
              {{ session.lastMessage || '暂无消息' }}
            </text>

            <!-- A10: 陌生人消息统一提示 - 与后端规则一致(关注后可发消息) -->
            <view v-else class="stranger-actions">
              <text class="stranger-hint">关注后可发消息</text>
              <view class="action-btns">
                <view class="action-btn action-reply" @click.stop="onStrangerReply(session)">
                  <text>关注</text>
                </view>
                <view class="action-btn action-ignore" @click.stop="onStrangerIgnore(session)">
                  <text>忽略</text>
                </view>
                <view class="action-btn action-block" @click.stop="onStrangerBlock(session)">
                  <text>拉黑</text>
                </view>
              </view>
            </view>

            <!-- 状态指示 -->
            <view class="session-status">
              <text v-if="session.isActive && session.locationSharing" class="status-tag status-live">
                位置共享 ON
              </text>
              <text v-if="session.isMutualFollow" class="status-tag status-follow">
                已互关
              </text>
            </view>

            <!-- 未读 badge -->
            <view v-if="session.unreadCount > 0" class="unread-badge">
              {{ session.unreadCount > 99 ? '99+' : session.unreadCount }}
            </view>
          </view>
        </view>
      </view>

      <!-- 历史话题分隔 -->
      <view v-if="historySessions.length > 0" class="history-divider">
        <view class="divider-line"></view>
        <text class="divider-text">历史话题</text>
        <view class="divider-line"></view>
      </view>

      <!-- 历史话题列表 -->
      <view
        v-for="session in historySessions"
        :key="session.id"
        class="session-item session-archived"
        @click="onSessionTap(session)"
      >
        <view class="session-avatar-wrap">
          <image
            :src="getSessionAvatar(session)"
            class="session-avatar"
            mode="aspectFill"
          />
          <view class="type-icon type-archived">
            <text>📦</text>
          </view>
        </view>
        <view class="session-content">
          <view class="session-top">
            <text class="session-name text-ellipsis">{{ session.name }}</text>
            <text class="session-time">{{ formatTime(session.lastMessageTime) }}</text>
          </view>
          <view class="session-bottom">
            <text class="session-preview text-ellipsis archived-text">话题已存档</text>
          </view>
        </view>
      </view>

      <!-- 没有更多消息 -->
      <view v-if="!loading && displayList.length > 0" class="no-more-tip">
        <text>— 没有更多消息 —</text>
      </view>

      <!-- 底部占位 -->
      <view class="bottom-placeholder safe-area-bottom"></view>
    </scroll-view>
  </view>
</template>

<script>
import { useChatStore } from '@/store/chat.js';
import { chatApi, userApi } from '@/utils/api.js';

export default {
  data() {
    return {
      currentFilter: 'all',
      filterTabs: [
        { key: 'all', label: '全部', icon: '' },
        { key: 'team', label: '车队', icon: 'chat' },
        { key: 'topic', label: '地点', icon: 'pushpin' },
        { key: 'private', label: '私信', icon: 'account' }
      ],
      refreshing: false,
      intervalId: null
    };
  },

  computed: {
    chatStore() {
      return useChatStore();
    },
    loading() {
      return this.chatStore.loading;
    },
    sessions() {
      const s = this.chatStore.sessions;
      return Array.isArray(s) ? s : [];
    },
    totalUnread() {
      return this.chatStore.unreadTotal || 0;
    },
    /** 活跃会话（非归档） */
    activeSessions() {
      return this.sessions.filter((s) => !s.archived);
    },
    /** 历史/归档话题 */
    historySessions() {
      return this.sessions.filter((s) => s.archived);
    },
    /** 最终展示列表 */
    displayList() {
      return this.activeSessions;
    }
  },

  onShow() {
    this.loadSessions();
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  beforeUnmount() {
    this.stopPolling();
  },

  methods: {
    /** 加载会话列表 */
    async loadSessions() {
      try {
        await this.chatStore.fetchSessions(this.currentFilter);
        await this.chatStore.fetchUnread();
      } catch (err) {
        console.error('加载会话列表失败:', err);
      }
    },

    /** 切换筛选标签 */
    onFilterChange(key) {
      if (this.currentFilter === key) return;
      this.currentFilter = key;
      this.loadSessions();
    },

    /** 点击会话 */
    onSessionTap(session) {
      if (session.archived) {
        // 历史话题，查看只读
        uni.navigateTo({
          url: '/pages/message/chat?sessionId=' + session.id + '&readonly=true'
        });
        return;
      }

      // 标记已读
      if (session.unreadCount > 0) {
        this.chatStore.markRead(session.id);
      }

      this.chatStore.setCurrentSession(session);

      uni.navigateTo({
        url: '/pages/message/chat?sessionId=' + session.id
      });
    },

    /** A10: 陌生人 - 跳转到对方主页让用户关注 */
    async onStrangerReply(session) {
      const targetId = session.targetId || session.target_id;
      if (!targetId) {
        uni.showToast({ title: '无法获取用户信息', icon: 'none' });
        return;
      }
      uni.navigateTo({
        url: '/pages/user/home?userId=' + targetId
      });
    },

    /** 陌生人-忽略 */
    async onStrangerIgnore(session) {
      try {
        await this.chatStore.markRead(session.id);
        uni.showToast({ title: '已忽略', icon: 'none' });
        this.loadSessions();
      } catch (err) {
        console.error('操作失败:', err);
      }
    },

    /** 陌生人-拉黑 */
    async onStrangerBlock(session) {
      uni.showModal({
        title: '确认拉黑',
        content: '拉黑后将不再收到该用户的消息',
        success: async (res) => {
          if (res.confirm) {
            try {
              await userApi.blockUser(session.targetId);
              this.chatStore.removeSession(session.id);
              uni.showToast({ title: '已拉黑', icon: 'none' });
            } catch (err) {
              uni.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** 下拉刷新 */
    async onRefresh() {
      this.refreshing = true;
      try {
        await this.loadSessions();
      } finally {
        this.refreshing = false;
      }
    },

    /** 开始轮询（每10秒拉一次未读数） */
    startPolling() {
      this.stopPolling();
      this.intervalId = setInterval(() => {
        this.chatStore.fetchUnread().catch(() => {});
      }, 10000);
    },

    /** 停止轮询 */
    stopPolling() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    },

    /** 获取默认头像 */
    getDefaultAvatar(type) {
      const map = {
        team: '/static/default-team.png',
        topic: '/static/default-topic.png',
        private: '/static/default-avatar.png'
      };
      return map[type] || '/static/default-avatar.png';
    },

    /** 会话头像:车队/地点用统一图标,私信用用户头像 */
    getSessionAvatar(session) {
      if (!session) return '/static/default-avatar.png';
      if (session.type === 'team') return '/static/default-team.png';
      if (session.type === 'topic') return '/static/default-topic.png';
      return session.avatar || '/static/default-avatar.png';
    },

    /** 取成员昵称首字符作为头像兜底文字 */
    getAvatarInitial(nickname) {
      const name = (nickname || '').trim();
      if (!name) return '?';
      return name.slice(0, 1);
    },

    /** 根据昵称生成稳定的占位头像背景色 */
    getAvatarColor(nickname) {
      const name = (nickname || '').trim();
      const palette = ['#07C160', '#4A90D9', '#F5A623', '#E74C3C', '#8E44AD', '#16A085', '#D35400', '#2C3E50', '#7F8C8D'];
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) % 997;
      }
      return palette[hash % palette.length];
    },

    /** 获取类型图标 */
    getTypeIcon(type) {
      const map = {
        team: '🚙',
        topic: '📍',
        private: '✉'
      };
      return map[type] || '💬';
    },

    /** 格式化时间 */
    formatTime(timeStr) {
      if (!timeStr) return '';
      const now = new Date();
      const date = new Date(timeStr);
      const diff = now - date;

      // 今天
      if (diff < 86400000 && date.getDate() === now.getDate()) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return hours + ':' + minutes;
      }

      // 昨天
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.getDate() === yesterday.getDate() &&
          date.getMonth() === yesterday.getMonth() &&
          date.getFullYear() === yesterday.getFullYear()) {
        return '昨天';
      }

      // 本周内
      if (diff < 7 * 86400000) {
        const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return days[date.getDay()];
      }

      // 更早
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return month + '/' + day;
    }
  }
};
</script>

<style lang="scss" scoped>
.message-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-bg);
}

// 筛选标签
.filter-tabs {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  background-color: var(--color-bg-white);
  border-bottom: 1rpx solid var(--color-border);
  gap: 8rpx;

  .tab-item {
    position: relative;
    display: flex;
    align-items: center;
    padding: 12rpx 24rpx;
    border-radius: 32rpx;
    background-color: var(--color-divider);
    transition: all 0.2s;

    &.active {
      background-color: var(--color-primary);
      .tab-text {
        color: #fff;
        font-weight: 500;
      }
    }

    .tab-text {
      font-size: var(--font-sm);
      color: var(--color-text-secondary);
    }

    .tab-badge {
      position: absolute;
      top: -6rpx;
      right: -6rpx;
      min-width: 32rpx;
      height: 32rpx;
      line-height: 32rpx;
      text-align: center;
      font-size: 20rpx;
      color: #fff;
      background-color: var(--color-danger);
      border-radius: 16rpx;
      padding: 0 8rpx;
    }
  }
}

// 会话列表
.session-list {
  flex: 1;
  overflow-y: auto;
}

// 加载状态
.loading-state {
  display: flex;
  justify-content: center;
  padding: 80rpx 0;

  .loading-text {
    font-size: var(--font-sm);
    color: var(--color-text-hint);
  }
}

// 空状态
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
    font-size: var(--font-lg);
    color: var(--color-text-secondary);
    margin-bottom: 8rpx;
  }

  .empty-hint {
    font-size: var(--font-sm);
    color: var(--color-text-hint);
  }
}

// 会话项
.session-item {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  background-color: var(--color-bg-white);
  border-bottom: 1rpx solid var(--color-divider);
  transition: background 0.15s;

  &:active {
    background-color: #f8f8f8;
  }

  &.session-active {
    background-color: #fbfefc;
  }

  &.session-unread {
    background-color: #f0faf3;

    .session-name {
      font-weight: 600;
      color: #1A1A1A;
    }
  }

  &.session-archived {
    opacity: 0.7;
  }
}

.session-avatar-wrap {
  position: relative;
  width: 96rpx;
  height: 96rpx;
  margin-right: 20rpx;
  flex-shrink: 0;

  .avatar-grid {
    width: 96rpx;
    height: 96rpx;
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    justify-content: center;
    gap: 4rpx;
    overflow: hidden;

    &.grid-count-1 {
      .avatar-grid-cell {
        width: 96rpx;
        height: 96rpx;
      }
    }

    &.grid-count-2,
    &.grid-count-3,
    &.grid-count-4 {
      .avatar-grid-cell {
        width: 46rpx;
        height: 46rpx;
      }
    }

    &.grid-count-5,
    &.grid-count-6 {
      .avatar-grid-cell {
        width: 44rpx;
        height: 44rpx;
      }
    }

    &.grid-count-7,
    &.grid-count-8,
    &.grid-count-9 {
      .avatar-grid-cell {
        width: 29rpx;
        height: 29rpx;
      }
    }

    .avatar-grid-cell {
      border-radius: 6rpx;
      overflow: hidden;
      background-color: var(--color-divider);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .avatar-grid-img {
      width: 100%;
      height: 100%;
    }

    .avatar-grid-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .avatar-grid-text {
      color: #fff;
      font-size: 20rpx;
      line-height: 1;
    }
  }

  .session-avatar {
    width: 96rpx;
    height: 96rpx;
    border-radius: var(--radius-md);
    background-color: var(--color-divider);
  }

  .type-icon {
    position: absolute;
    right: -4rpx;
    bottom: -4rpx;
    width: 36rpx;
    height: 36rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-white);
    border-radius: 50%;
    font-size: 22rpx;
    box-shadow: 0 2rpx 6rpx rgba(0,0,0,0.1);
  }

  .type-archived {
    opacity: 0.6;
  }
}

.session-content {
  flex: 1;
  min-width: 0;
}

.session-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6rpx;

  .session-name-wrap {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .session-name {
    font-size: var(--font-md);
    font-weight: 500;
    color: var(--color-text-primary);
    max-width: 340rpx;
  }

  .member-count {
    font-size: var(--font-xs);
    color: var(--color-text-hint);
    margin-left: 4rpx;
    flex-shrink: 0;
  }

  .live-dot {
    font-size: 20rpx;
    margin-left: 6rpx;
    flex-shrink: 0;
  }

  .session-time {
    font-size: var(--font-xs);
    color: var(--color-text-hint);
    flex-shrink: 0;
    margin-left: 12rpx;
  }
}

.session-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .session-preview {
    font-size: var(--font-sm);
    color: var(--color-text-hint);
    flex: 1;
    min-width: 0;
    line-height: 1.4;

    &.archived-text {
      color: #ccc;
      font-style: italic;
    }
  }

  .session-status {
    display: flex;
    gap: 6rpx;
    flex-shrink: 0;
    margin-right: 8rpx;

    .status-tag {
      font-size: 18rpx;
      padding: 2rpx 8rpx;
      border-radius: 6rpx;

      &.status-live {
        color: var(--color-primary);
        background-color: rgba(7, 193, 96, 0.08);
      }

      &.status-follow {
        color: var(--color-info);
        background-color: rgba(74, 144, 217, 0.08);
      }
    }
  }

  .unread-badge {
    min-width: 36rpx;
    height: 36rpx;
    line-height: 36rpx;
    text-align: center;
    font-size: 20rpx;
    color: #fff;
    background-color: var(--color-danger);
    border-radius: 18rpx;
    padding: 0 8rpx;
    flex-shrink: 0;
  }
}

// 陌生人操作按钮
.stranger-actions {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex: 1;

  .stranger-hint {
    font-size: var(--font-xs);
    color: var(--color-warning);
    flex-shrink: 0;
  }

  .action-btns {
    display: flex;
    gap: 6rpx;

    .action-btn {
      padding: 4rpx 16rpx;
      border-radius: 20rpx;
      font-size: 22rpx;
      border: 1rpx solid;

      &.action-reply {
        color: var(--color-primary);
        border-color: var(--color-primary);
      }

      &.action-ignore {
        color: var(--color-text-hint);
        border-color: var(--color-text-hint);
      }

      &.action-block {
        color: var(--color-danger);
        border-color: var(--color-danger);
      }

      &:active {
        opacity: 0.7;
      }
    }
  }
}

// 历史话题分隔
.history-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32rpx 24rpx 16rpx;

  .divider-line {
    flex: 1;
    height: 1rpx;
    background-color: var(--color-border);
  }

  .divider-text {
    font-size: var(--font-xs);
    color: var(--color-text-hint);
    padding: 0 24rpx;
  }
}

// 底部占位
.bottom-placeholder {
  height: 24rpx;
}

// 没有更多消息提示
.no-more-tip {
  text-align: center;
  padding: 20rpx 0 4rpx;
  font-size: 22rpx;
  color: #C5CCC8;
}
</style>
