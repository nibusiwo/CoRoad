<template>
  <view class="follows-page">
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

    <scroll-view
      class="list-scroll"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
    >
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <view v-else-if="displayList.length === 0" class="empty-state">
        <text class="empty-icon">{{ currentTab === 'following' ? '⭐' : '👥' }}</text>
        <text class="empty-text">{{ currentTab === 'following' ? '还没有关注任何人' : '还没有粉丝' }}</text>
        <text class="empty-hint">{{ currentTab === 'following' ? '在地图上发现车友或车队，点“关注”吧' : '多参与行程与拼团，认识更多同路人' }}</text>
      </view>

      <view v-else class="list-wrap">
        <!-- 关注 Tab:车队分组 -->
        <template v-if="currentTab === 'following'">
          <view v-if="teams.length" class="group-title">关注的车队</view>
          <view
            v-for="team in teams"
            :key="'team-' + team.followId"
            class="item-card"
            @click="goTeam(team)"
          >
            <view class="item-avatar team-avatar">
              <text>🚙</text>
            </view>
            <view class="item-info">
              <view class="item-name-row">
                <text class="item-name">{{ team.tripName }}</text>
                <view class="team-tag"><text>车队</text></view>
              </view>
              <text class="item-desc">
                {{ team.currentMembers || 0 }}人在线 · 队长{{ team.leaderNickname || '未知' }}
              </text>
            </view>
            <view class="item-arrow">›</view>
          </view>

          <view v-if="users.length" class="group-title">关注的用户</view>
        </template>

        <!-- 用户列表(关注/粉丝共用) -->
        <view
          v-for="user in users"
          :key="'user-' + user.id"
          class="item-card"
          @click="goUser(user)"
        >
                    <view class="item-avatar">
            <local-image style="width:100%;height:100%;"
            :src="resolveAssetUrl(user.avatar) || '/static/default-avatar.png'"
           
            mode="aspectFill"
           />
          </view>
          <view class="item-info">
            <view class="item-name-row">
              <text class="item-name">{{ user.nickname || '用户' }}</text>
              <text v-if="user.level" class="level-tag">Lv.{{ user.level }}</text>
              <text v-if="user.isCertified === 2 || user.isCertified === true" class="cert-tag">✓ 认证</text>
            </view>
            <text class="item-desc">{{ user.signature || user.vehicleModel || '这个人很懒，什么都没写' }}</text>
          </view>
          <view v-if="currentTab === 'following'" class="item-action" @click.stop="unfollowUser(user)">
            <text>已关注</text>
          </view>
          <view v-else class="item-arrow">›</view>
        </view>

        <view class="bottom-placeholder"></view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { userApi, resolveAssetUrl as resolveAsset } from '@/utils/api.js';

export default {
  data() {
    return {
      currentTab: 'following',
      tabs: [
        { key: 'following', label: '关注' },
        { key: 'followers', label: '粉丝' }
      ],
      users: [],
      teams: [],
      loading: true,
      refreshing: false
    };
  },

  computed: {
    displayList() {
      return this.users.concat(this.teams);
    }
  },

  onLoad(options) {
    if (options.type === 'followers') {
      this.currentTab = 'followers';
    }
  },

  onShow() {
    this.fetchData();
  },

  methods: {
    /** 解析相对资源路径为绝对 URL(小程序必需) */
    resolveAssetUrl(url) {
      return resolveAsset(url);
    },

    switchTab(key) {
      if (this.currentTab === key) return;
      this.currentTab = key;
      this.fetchData();
    },

    async fetchData() {
      this.loading = true;
      try {
        if (this.currentTab === 'following') {
          const [userRes, teamRes] = await Promise.all([
            userApi.getFollowing(1, 1),
            userApi.getFollowing(1, 2)
          ]);
          this.users = userRes && userRes.list ? userRes.list : [];
          this.teams = (teamRes && teamRes.list ? teamRes.list : []).map((t) => ({
            followId: t.follow_id,
            tripId: t.trip_id,
            tripName: t.trip_name,
            currentMembers: t.current_members,
            leaderId: t.leader_id,
            leaderNickname: t.leader_nickname,
            leaderAvatar: t.leader_avatar
          }));
        } else {
          const res = await userApi.getFollowers(1);
          this.users = res && res.list ? res.list : [];
          this.teams = [];
        }
      } catch (err) {
        console.warn('加载关注列表失败:', err);
        this.users = [];
        this.teams = [];
      } finally {
        this.loading = false;
        this.refreshing = false;
      }
    },

    async onRefresh() {
      this.refreshing = true;
      await this.fetchData();
    },

    goUser(user) {
      uni.navigateTo({ url: '/pages/user/home?userId=' + user.id });
    },

    goTeam(team) {
      if (team.tripId) {
        uni.navigateTo({ url: '/pages/trip/detail?tripId=' + team.tripId });
      }
    },

    async unfollowUser(user) {
      try {
        await userApi.unfollow(user.id, 1);
        uni.showToast({ title: '已取消关注', icon: 'none' });
        this.users = this.users.filter((u) => u.id !== user.id);
      } catch (err) {
        uni.showToast({ title: '操作失败', icon: 'none' });
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.follows-page {
  height: 100vh;
  background: #F5F5F5;
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

    &.active {
      .tab-text {
        color: #07C160;
        font-weight: 700;
      }
    }
  }
}

.list-scroll {
  flex: 1;
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
    text-align: center;
  }
}

.list-wrap {
  padding: 16rpx 24rpx;
}

.group-title {
  font-size: 24rpx;
  color: #999;
  padding: 20rpx 8rpx 12rpx;
}

.item-card {
  display: flex;
  align-items: center;
  gap: 20rpx;
  background: #FFFFFF;
  border-radius: 20rpx;
  padding: 22rpx;
  margin-bottom: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

  .item-avatar {
    width: 88rpx;
    height: 88rpx;
    border-radius: 50%;
    background: #F0F0F0;
    flex-shrink: 0;
    overflow: hidden;
  }

  .team-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #EDF4FC;
    font-size: 40rpx;
  }

  .item-info {
    flex: 1;
    min-width: 0;

    .item-name-row {
      display: flex;
      align-items: center;
      gap: 12rpx;

      .item-name {
        font-size: 30rpx;
        font-weight: 600;
        color: #1A1A1A;
      }

      .level-tag {
        font-size: 20rpx;
        color: #FF8F00;
        background: #FFF8E1;
        padding: 2rpx 12rpx;
        border-radius: 10rpx;
      }

      .cert-tag {
        font-size: 20rpx;
        color: #07C160;
        background: #E8F8EF;
        padding: 2rpx 12rpx;
        border-radius: 10rpx;
      }

      .team-tag {
        font-size: 20rpx;
        color: #4A90D9;
        background: #EDF4FC;
        padding: 2rpx 12rpx;
        border-radius: 10rpx;
      }
    }

    .item-desc {
      font-size: 24rpx;
      color: #999;
      margin-top: 8rpx;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .item-action {
    flex-shrink: 0;
    font-size: 24rpx;
    color: #999;
    background: #F5F5F5;
    padding: 10rpx 22rpx;
    border-radius: 16rpx;
  }

  .item-arrow {
    font-size: 32rpx;
    color: #CCC;
    flex-shrink: 0;
  }
}

.bottom-placeholder {
  height: 60rpx;
}
</style>
