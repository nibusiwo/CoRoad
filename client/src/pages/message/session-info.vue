<template>
  <view class="session-info-page">
    <scroll-view class="page-scroll" scroll-y>
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-else-if="session">
        <!-- 群资料 -->
        <view class="info-card">
          <view class="group-avatar">
            <u-icon :name="session.type === 'team' ? 'car' : 'chat'" size="48" color="#FFFFFF" />
          </view>
          <view class="group-meta">
            <text class="group-name">{{ session.name }}</text>
            <text class="group-desc">
              {{ typeText }} · {{ session.member_count || 0 }}人
            </text>
          </view>
        </view>

        <!-- 成员列表 -->
        <view class="section-card">
          <view class="section-title">群成员（{{ members.length }}）</view>
          <view
            v-for="member in members"
            :key="member.userId"
            class="member-row"
            @click="goUser(member)"
          >
            <image
              :src="member.avatar || '/static/default-avatar.png'"
              class="member-avatar"
              mode="aspectFill"
            />
            <view class="member-info">
              <view class="member-name-row">
                <text class="member-name">{{ member.nickname || '用户' }}</text>
                <text v-if="member.role === 'captain'" class="role-badge captain">队长</text>
                <text v-else-if="member.role === 'co-captain'" class="role-badge co">副队长</text>
                <text v-if="member.level" class="level-badge">Lv.{{ member.level }}</text>
              </view>
              <text class="member-time">加入于 {{ formatTime(member.joined_at) }}</text>
            </view>
            <text class="member-arrow">›</text>
          </view>
          <view v-if="members.length === 0" class="empty-members">
            <text>暂无成员</text>
          </view>
        </view>

        <!-- 操作 -->
        <view class="action-card">
          <view class="action-row" @click="clearHistory">
            <text>清空聊天记录</text>
          </view>
          <view v-if="session.type !== 'topic'" class="action-row danger" @click="leaveChat">
            <text>{{ session.type === 'team' ? '退出群聊' : '删除会话' }}</text>
          </view>
        </view>
      </template>
    </scroll-view>
  </view>
</template>

<script>
import { chatApi } from '@/utils/api.js';

export default {
  data() {
    return {
      sessionId: '',
      session: null,
      members: [],
      loading: true
    };
  },

  computed: {
    typeText() {
      if (!this.session) return '';
      const map = { team: '车队群聊', topic: '地点话题', private: '私聊' };
      return map[this.session.type] || '会话';
    }
  },

  onLoad(options) {
    this.sessionId = options.sessionId || '';
    this.fetchInfo();
  },

  methods: {
    async fetchInfo() {
      if (!this.sessionId) return;
      try {
        const res = await chatApi.getSessionMembers(this.sessionId);
        this.session = (res && res.session) || null;
        this.members = (res && res.members) || [];
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },

    goUser(member) {
      if (member.userId) {
        uni.navigateTo({ url: '/pages/user/home?userId=' + member.userId });
      }
    },

    clearHistory() {
      uni.showModal({
        title: '确认清空',
        content: '清空后将无法恢复',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await chatApi.clearSession(this.sessionId);
            uni.showToast({ title: '已清空', icon: 'success' });
          } catch (err) {
            uni.showToast({ title: '清空失败', icon: 'none' });
          }
        }
      });
    },

    leaveChat() {
      const isTeam = this.session && this.session.type === 'team';
      uni.showModal({
        title: isTeam ? '退出群聊' : '删除会话',
        content: isTeam ? '退出后将不再收到该群消息，确定退出吗？' : '确定删除该会话吗？',
        confirmColor: '#E74C3C',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await chatApi.leaveSession(this.sessionId);
            uni.showToast({ title: '已退出', icon: 'success' });
            setTimeout(() => {
              uni.switchTab({ url: '/pages/message/index' });
            }, 1200);
          } catch (err) {
            uni.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      });
    },

    formatTime(v) {
      if (!v) return '--';
      const d = new Date(v);
      if (isNaN(d.getTime())) return '--';
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
  }
};
</script>

<style lang="scss" scoped>
.session-info-page {
  min-height: 100vh;
  background: #F5F5F5;
}

.loading-state {
  text-align: center;
  padding: 120rpx 0;
  color: #999;
  font-size: 28rpx;
}

.info-card {
  display: flex;
  align-items: center;
  gap: 24rpx;
  margin: 24rpx;
  padding: 32rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

  .group-avatar {
    width: 112rpx;
    height: 112rpx;
    border-radius: 24rpx;
    background: linear-gradient(135deg, #07C160, #05A84E);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .group-meta {
    flex: 1;
    min-width: 0;

    .group-name {
      font-size: 34rpx;
      font-weight: 700;
      color: #1A1A1A;
      display: block;
    }

    .group-desc {
      font-size: 24rpx;
      color: #999;
      margin-top: 8rpx;
      display: block;
    }
  }
}

.section-card {
  margin: 24rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 28rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

  .section-title {
    font-size: 28rpx;
    font-weight: 600;
    color: #1A1A1A;
    margin-bottom: 12rpx;
  }
}

.member-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #F5F5F5;

  &:last-child {
    border-bottom: none;
  }

  .member-avatar {
    width: 84rpx;
    height: 84rpx;
    border-radius: 50%;
    background: #F0F0F0;
    flex-shrink: 0;
  }

  .member-info {
    flex: 1;
    min-width: 0;

    .member-name-row {
      display: flex;
      align-items: center;
      gap: 12rpx;

      .member-name {
        font-size: 30rpx;
        font-weight: 600;
        color: #1A1A1A;
      }

      .role-badge {
        font-size: 20rpx;
        padding: 2rpx 14rpx;
        border-radius: 12rpx;

        &.captain {
          color: #FF8F00;
          background: #FFF8E1;
        }

        &.co {
          color: #4A90D9;
          background: #EDF4FC;
        }
      }

      .level-badge {
        font-size: 20rpx;
        color: #07C160;
        background: #E8F8EF;
        padding: 2rpx 12rpx;
        border-radius: 10rpx;
      }
    }

    .member-time {
      font-size: 22rpx;
      color: #999;
      margin-top: 6rpx;
      display: block;
    }
  }

  .member-arrow {
    font-size: 32rpx;
    color: #CCC;
  }
}

.empty-members {
  text-align: center;
  padding: 40rpx 0;
  color: #999;
  font-size: 24rpx;
}

.action-card {
  margin: 24rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

  .action-row {
    padding: 28rpx 32rpx;
    font-size: 30rpx;
    color: #1A1A1A;
    text-align: center;
    border-bottom: 1rpx solid #F5F5F5;

    &:last-child {
      border-bottom: none;
    }

    &.danger {
      color: #E74C3C;
    }

    &:active {
      background: #F8F8F8;
    }
  }
}
</style>
