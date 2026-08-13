<template>
  <view class="detail-page">
    <scroll-view class="detail-scroll" scroll-y>
      <!-- 加载中 -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-if="!loading && trip">
        <!-- Hero 路线可视化 -->
        <view class="hero-section">
          <view class="hero-route">
            <view class="route-animated">
              <view class="route-node start-node">
                <view class="node-dot start-dot"></view>
                <text class="node-label">{{ getPointName(trip.startPoint) || '出发' }}</text>
              </view>
              <view class="route-path">
                <view
                  v-for="i in 3"
                  :key="i"
                  class="path-dot"
                  :style="{ animationDelay: (i * 0.3) + 's' }"
                ></view>
              </view>
              <view class="route-node end-node">
                <view class="node-dot end-dot"></view>
                <text class="node-label">{{ getPointName(trip.endPoint) || '目的地' }}</text>
              </view>
            </view>
          </view>

          <view class="hero-meta">
            <text class="hero-title">{{ trip.title || '未命名行程' }}</text>
            <view class="hero-dates">
              <text>{{ formatDate(trip.departureTime) }} 出发</text>
              <text class="meta-sep">·</text>
              <text>预计 {{ trip.estimatedDays || '?' }} 天</text>
              <text class="meta-sep">·</text>
              <text>{{ depthLabel(trip.depth) }}</text>
              <!-- E3: 顺路率显示(基于当前用户位置与行程起点/终点) -->
              <template v-if="trip.routeMatch !== null && trip.routeMatch !== undefined">
                <text class="meta-sep">·</text>
                <text class="route-match-text">🛣️ 顺路率 {{ trip.routeMatch }}%</text>
              </template>
            </view>
          </view>

          <!-- 标签 -->
          <view v-if="trip.tags && trip.tags.length" class="hero-tags">
            <text v-for="tag in trip.tags" :key="tag" class="hero-tag">{{ tag }}</text>
          </view>
        </view>

        <!-- 队长信息卡片 -->
        <view class="leader-card card">
          <view class="leader-top" @click="goUserHome(trip.captainId)">
            <image
              :src="trip.captainAvatar || '/static/default-avatar.png'"
              class="leader-avatar"
              mode="aspectFill"
            />
            <view class="leader-info">
              <view class="leader-name-row">
                <text class="leader-name">{{ trip.captainNickname || '队长' }}</text>
                <text class="leader-level">Lv.{{ trip.captainLevel || 1 }}</text>
                <text v-if="trip.captainCertified" class="cert-badge">已认证</text>
              </view>
              <view class="leader-rating">
                <text v-for="i in 5" :key="i" class="star" :class="{ filled: i <= (trip.captainRating || 0) }">★</text>
                <text class="rating-text">{{ trip.captainRating || 0 }}分</text>
              </view>
            </view>
            <text class="leader-arrow">›</text>
          </view>
        </view>

        <!-- 队伍进度 -->
        <view class="team-progress card">
          <text class="progress-title">队伍进度</text>
          <view class="progress-info">
            <text class="progress-value">{{ trip.joinedCars || 0 }}/{{ trip.maxCars || '?' }} 车</text>
            <view class="progress-bar">
              <view
                class="progress-fill"
                :style="{ width: progressPercent + '%' }"
              ></view>
            </view>
          </view>
          <!-- 成员头像列表 -->
          <view v-if="members && members.length" class="member-avatars">
            <image
              v-for="(member, index) in members.slice(0, 8)"
              :key="member.id"
              :src="member.avatar || '/static/default-avatar.png'"
              class="member-thumb"
              mode="aspectFill"
            />
            <view v-if="members.length > 8" class="more-members">
              <text>+{{ members.length - 8 }}</text>
            </view>
          </view>
        </view>

        <!-- 成员列表 -->
        <view class="member-list card">
          <view class="list-header">
            <text class="list-title">团队成员</text>
            <text class="list-count">{{ members.length || 0 }}人</text>
          </view>

          <view
            v-for="member in members"
            :key="member.id"
            class="member-item"
            @click="goUserHome(member.userId)"
          >
            <image
              :src="member.avatar || '/static/default-avatar.png'"
              class="member-avatar"
              mode="aspectFill"
            />
            <view class="member-info">
              <view class="member-name-row">
                <text class="member-name">{{ member.nickname }}</text>
                <view v-if="member.role === 'captain'" class="role-badge role-captain">
                  <text>队长</text>
                </view>
                <view v-else-if="member.role === 'co-captain'" class="role-badge role-co">
                  <text>副队</text>
                </view>
              </view>
              <text class="member-join-time">加入于 {{ formatDate(member.joinTime) }}</text>
            </view>
            <text class="member-arrow">›</text>
          </view>

          <!-- 无成员 -->
          <view v-if="!members || members.length === 0" class="no-members">
            <text>暂无成员</text>
          </view>
        </view>

        <!-- 底部占位 -->
        <view class="detail-bottom"></view>
      </template>
    </scroll-view>

    <!-- 底部操作栏 -->
    <view v-if="!loading && trip" class="action-bar safe-area-bottom">
      <!-- 非成员 -->
      <view v-if="!isMember" class="action-full">
        <view class="action-btn action-apply" :class="{ disabled: trip.hasApplied }" @click="applyJoin">
          <text>{{ trip.hasApplied ? '等待队长审批...' : '➕ 申请加入' }}</text>
        </view>
      </view>

      <!-- 待审批 -->
      <view v-else-if="isPending" class="action-full">
        <view class="action-btn action-pending">
          <text>等待队长审批...</text>
        </view>
      </view>

      <!-- 正式成员 -->
      <view v-else-if="isMember && !isCaptain" class="action-full">
        <view class="action-btn action-leave" @click="leaveTrip">
          <text>退出队伍</text>
        </view>
      </view>

      <!-- 队长 -->
      <view v-if="isCaptain" class="action-captain">
        <view class="action-btn action-edit" @click="editTrip">
          <text>编辑</text>
        </view>
        <view v-if="trip.status === 1" class="action-btn action-start" @click="startTrip">
          <text>开始行程</text>
        </view>
        <view v-else-if="trip.status === 2" class="action-btn action-finish" @click="finishTrip">
          <text>结束行程</text>
        </view>
        <view class="action-btn action-cancel" @click="cancelTrip">
          <text>取消行程</text>
        </view>
      </view>
    </view>

    <!-- 分享按钮（右上角） -->
    <view v-if="!loading && trip" class="share-fab" @click="shareTrip">
      <text class="share-icon">↗</text>
    </view>
  </view>
</template>

<script>
import { useTripStore } from '@/store/trip.js';
import { useUserStore } from '@/store/user.js';

export default {
  data() {
    return {
      tripId: '',
      trip: null,
      members: [],
      loading: true
    };
  },

  computed: {
    tripStore() {
      return useTripStore();
    },
    userStore() {
      return useUserStore();
    },
    currentUserId() {
      return this.userStore.userId;
    },
    isCaptain() {
      return this.trip && this.trip.captainId === this.currentUserId;
    },
    isMember() {
      if (this.trip && this.trip.isMember) return true;
      if (!this.members.length || !this.currentUserId) return false;
      return this.members.some((m) => String(m.userId || m.user_id) === String(this.currentUserId));
    },
    isPending() {
      if (this.trip && this.trip.myStatus === 1) return true;
      // 可以从成员列表中查找自己的状态
      if (!this.members.length || !this.currentUserId) return false;
      const self = this.members.find((m) => String(m.userId || m.user_id) === String(this.currentUserId));
      return !!(self && (self.status === 1 || self.status === 'pending'));
    },
    progressPercent() {
      if (!this.trip) return 0;
      const max = this.trip.maxCars || 1;
      const joined = this.trip.joinedCars || 0;
      return Math.min(100, Math.round((joined / max) * 100));
    }
  },

  onLoad(options) {
    this.tripId = options.tripId || '';
    if (this.tripId) {
      this.loadDetail();
    }
  },

  onShow() {
    // 每次显示时刷新（例如从其他页面返回）
    if (this.tripId && !this.loading) {
      this.loadDetail();
    }
  },

  methods: {
    /** 获取地点名称 */
    getPointName(point) {
      if (!point) return '';
      if (typeof point === 'string') return point;
      if (point.name) return point.name;
      return '';
    },

    /** 加载行程详情 */
    async loadDetail() {
      this.loading = true;
      try {
        this.trip = await this.tripStore.fetchTripDetail(this.tripId);
        this.members = await this.tripStore.fetchTripMembers(this.tripId);
      } catch (err) {
        uni.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },

    /** 申请加入 */
    applyJoin() {
      if (this.trip && this.trip.hasApplied) {
        uni.showToast({ title: '已提交申请，等待队长审批', icon: 'none' });
        return;
      }

      uni.showModal({
        title: '申请入队',
        content: '确认申请加入「' + (this.trip ? this.trip.title : '') + '」吗？',
        success: async (res) => {
          if (res.confirm) {
            try {
              await this.tripStore.applyJoin(this.tripId);
              if (this.trip) this.trip.hasApplied = true;
              uni.showToast({ title: '申请已发送', icon: 'success' });
            } catch (err) {
              uni.showToast({ title: '申请失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** 退出行程 */
    leaveTrip() {
      uni.showModal({
        title: '退出队伍',
        content: '确定要退出该队伍吗？',
        success: async (res) => {
          if (res.confirm) {
            try {
              await this.tripStore.leaveTrip(this.tripId);
              uni.showToast({ title: '已退出', icon: 'success' });
              setTimeout(() => {
                uni.navigateBack();
              }, 1500);
            } catch (err) {
              uni.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** 编辑行程 */
    editTrip() {
      uni.navigateTo({
        url: '/pages/trip/create?tripId=' + this.tripId
      });
    },

    /** 开始行程 */
    startTrip() {
      uni.showModal({
        title: '开始行程',
        content: '确认开始行程吗？开始后队伍成员将可以进行实时位置共享。',
        success: async (res) => {
          if (res.confirm) {
            try {
              await this.tripStore.startTrip(this.tripId);
              if (this.trip) this.trip.status = 2;
              uni.showToast({ title: '行程已开始', icon: 'success' });
              this.loadDetail();
            } catch (err) {
              uni.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** 结束行程 */
    finishTrip() {
      uni.showModal({
        title: '结束行程',
        content: '行程结束后队伍将解散，确定要结束吗？',
        success: async (res) => {
          if (res.confirm) {
            try {
              await this.tripStore.finishTrip(this.tripId);
              if (this.trip) this.trip.status = 3;
              uni.showToast({ title: '行程已结束', icon: 'success' });
              this.loadDetail();
            } catch (err) {
              uni.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** 取消行程 */
    cancelTrip() {
      uni.showModal({
        title: '取消行程',
        content: '取消后行程将被删除且无法恢复，确定要取消吗？',
        confirmColor: '#E74C3C',
        success: async (res) => {
          if (res.confirm) {
            try {
              await this.tripStore.cancelTrip(this.tripId);
              uni.showToast({ title: '行程已取消', icon: 'success' });
              setTimeout(() => {
                uni.navigateBack();
              }, 1500);
            } catch (err) {
              uni.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** 分享行程 */
    shareTrip() {
      if (!this.trip) return;
      uni.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline']
      });

      // 在 Uni-App 中通过分享菜单触发
      uni.showActionSheet({
        itemList: ['分享到微信', '分享到聊天', '复制链接'],
        success: (res) => {
          if (res.tapIndex === 0) {
            // 触发微信分享（由页面 onShareAppMessage 处理）
          } else if (res.tapIndex === 1) {
            this.shareToChat();
          } else if (res.tapIndex === 2) {
            uni.setClipboardData({
              data: 'https://coroad.cn/trip/' + this.tripId,
              success: () => {
                uni.showToast({ title: '链接已复制', icon: 'none' });
              }
            });
          }
        }
      });
    },

    /** 分享到聊天 */
    shareToChat() {
      uni.navigateTo({
        url: '/pages/message/index'
      });
      uni.showToast({ title: '请选择聊天对象', icon: 'none' });
    },

    /** 跳转用户主页 */
    goUserHome(userId) {
      uni.navigateTo({
        url: '/pages/user/home?userId=' + userId
      });
    },

    /** 格式化日期 */
    formatDate(timeStr) {
      if (!timeStr) return '--';
      const date = new Date(timeStr);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return month + '/' + day + ' ' + hours + ':' + minutes;
    },

    /** 深度标签 */
    depthLabel(depth) {
      const map = {
        shallow: '浅·仅同行',
        medium: '中·AA拼桌',
        deep: '深·全程同行'
      };
      return map[depth] || '中·AA拼桌';
    }
  },

  /** Uni-App 分享 */
  onShareAppMessage() {
    return {
      title: (this.trip ? this.trip.title : '同道自驾行程'),
      path: '/pages/trip/detail?tripId=' + this.tripId,
      imageUrl: this.trip ? (this.trip.coverImage || '') : ''
    };
  }
};
</script>

<style lang="scss" scoped>
.detail-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-bg-white);
  position: relative;
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

// ===== Hero 区域 =====
.hero-section {
  background: linear-gradient(180deg, #e8f8ee 0%, var(--color-bg-white) 100%);
  padding: 32rpx 24rpx 24rpx;
}

.hero-route {
  margin-bottom: 20rpx;
}

.route-animated {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
}

.route-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;

  .node-dot {
    width: 24rpx;
    height: 24rpx;
    border-radius: 50%;
    box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.15);

    &.start-dot {
      background-color: var(--color-primary);
    }

    &.end-dot {
      background-color: var(--color-danger);
    }
  }

  .node-label {
    font-size: var(--font-xs);
    color: var(--color-text-secondary);
    white-space: nowrap;
    max-width: 140rpx;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.route-path {
  flex: 1;
  height: 4rpx;
  background: linear-gradient(90deg, var(--color-primary), var(--color-warning), var(--color-danger));
  margin: 0 8rpx;
  position: relative;
  overflow: hidden;

  .path-dot {
    position: absolute;
    top: -4rpx;
    width: 12rpx;
    height: 12rpx;
    background-color: #fff;
    border: 2rpx solid var(--color-primary);
    border-radius: 50%;
    animation: pathMove 1.5s ease-in-out infinite;

    &:nth-child(1) {
      left: 20%;
    }
    &:nth-child(2) {
      left: 50%;
    }
    &:nth-child(3) {
      left: 80%;
    }
  }
}

@keyframes pathMove {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.3;
    transform: scale(1.5);
  }
}

.hero-meta {
  text-align: center;
  margin-bottom: 16rpx;

  .hero-title {
    font-size: var(--font-xl);
    font-weight: 600;
    color: var(--color-text-primary);
    display: block;
    margin-bottom: 8rpx;
  }

  .hero-dates {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6rpx;
    font-size: var(--font-xs);
    color: var(--color-text-secondary);

    .meta-sep {
      color: #ddd;
    }

    /* E3: 顺路率绿色高亮 */
    .route-match-text {
      color: #07C160;
      font-weight: 600;
    }
  }
}

.hero-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8rpx;

  .hero-tag {
    font-size: 20rpx;
    padding: 4rpx 16rpx;
    border-radius: 20rpx;
    background-color: rgba(7, 193, 96, 0.08);
    color: var(--color-primary);
  }
}

// ===== 队长卡片 =====
.leader-card {
  .leader-top {
    display: flex;
    align-items: center;
    gap: 16rpx;

    .leader-avatar {
      width: 88rpx;
      height: 88rpx;
      border-radius: 50%;
      background-color: var(--color-divider);
    }

    .leader-info {
      flex: 1;
      min-width: 0;

      .leader-name-row {
        display: flex;
        align-items: center;
        gap: 8rpx;
        margin-bottom: 6rpx;

        .leader-name {
          font-size: var(--font-md);
          font-weight: 500;
          color: var(--color-text-primary);
        }

        .leader-level {
          font-size: 20rpx;
          color: var(--color-primary);
          background-color: rgba(7, 193, 96, 0.08);
          padding: 2rpx 8rpx;
          border-radius: 8rpx;
        }

        .cert-badge {
          font-size: 18rpx;
          color: #f5a623;
          background-color: rgba(245, 166, 35, 0.08);
          padding: 2rpx 8rpx;
          border-radius: 8rpx;
          border: 1rpx solid #f5a623;
        }
      }

      .leader-rating {
        display: flex;
        align-items: center;
        gap: 4rpx;

        .star {
          font-size: 24rpx;
          color: #ddd;

          &.filled {
            color: #f5a623;
          }
        }

        .rating-text {
          font-size: var(--font-xs);
          color: var(--color-text-hint);
          margin-left: 6rpx;
        }
      }
    }

    .leader-arrow {
      font-size: 36rpx;
      color: var(--color-text-hint);
    }
  }
}

// ===== 队伍进度 =====
.team-progress {
  .progress-title {
    display: block;
    font-size: var(--font-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    margin-bottom: 12rpx;
  }

  .progress-info {
    margin-bottom: 12rpx;

    .progress-value {
      font-size: var(--font-md);
      font-weight: 600;
      color: var(--color-primary);
      display: block;
      margin-bottom: 8rpx;
    }

    .progress-bar {
      height: 10rpx;
      background-color: var(--color-divider);
      border-radius: 5rpx;
      overflow: hidden;

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--color-primary), #4cd964);
        border-radius: 5rpx;
        transition: width 0.6s ease;
      }
    }
  }

  .member-avatars {
    display: flex;
    align-items: center;
    gap: -12rpx;

    .member-thumb {
      width: 56rpx;
      height: 56rpx;
      border-radius: 50%;
      border: 3rpx solid #fff;
      margin-left: -12rpx;

      &:first-child {
        margin-left: 0;
      }
    }

    .more-members {
      width: 56rpx;
      height: 56rpx;
      border-radius: 50%;
      border: 3rpx solid #fff;
      margin-left: -12rpx;
      background-color: var(--color-divider);
      display: flex;
      align-items: center;
      justify-content: center;

      text {
        font-size: 20rpx;
        color: var(--color-text-hint);
      }
    }
  }
}

// ===== 成员列表 =====
.member-list {
  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16rpx;
    padding-bottom: 16rpx;
    border-bottom: 1rpx solid var(--color-divider);

    .list-title {
      font-size: var(--font-md);
      font-weight: 500;
      color: var(--color-text-primary);
    }

    .list-count {
      font-size: var(--font-xs);
      color: var(--color-text-hint);
    }
  }
}

.member-item {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  gap: 16rpx;
  border-bottom: 1rpx solid var(--color-divider);

  &:last-child {
    border-bottom: none;
  }

  .member-avatar {
    width: 72rpx;
    height: 72rpx;
    border-radius: 50%;
    background-color: var(--color-divider);
  }

  .member-info {
    flex: 1;
    min-width: 0;

    .member-name-row {
      display: flex;
      align-items: center;
      gap: 8rpx;
      margin-bottom: 4rpx;

      .member-name {
        font-size: var(--font-md);
        font-weight: 500;
        color: var(--color-text-primary);
      }

      .role-badge {
        font-size: 18rpx;
        padding: 2rpx 10rpx;
        border-radius: 8rpx;

        &.role-captain {
          color: #f5a623;
          background-color: rgba(245, 166, 35, 0.08);
        }

        &.role-co {
          color: var(--color-info);
          background-color: rgba(74, 144, 217, 0.08);
        }
      }
    }

    .member-join-time {
      font-size: var(--font-xs);
      color: var(--color-text-hint);
    }
  }

  .member-arrow {
    font-size: 32rpx;
    color: var(--color-text-hint);
  }
}

.no-members {
  text-align: center;
  padding: 32rpx 0;
  font-size: var(--font-xs);
  color: var(--color-text-hint);
}

// 底部占位
.detail-bottom {
  height: 140rpx;
}

// ===== 底部操作栏 =====
.action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16rpx 24rpx;
  background-color: var(--color-bg-white);
  border-top: 1rpx solid var(--color-border);
  display: flex;
  gap: 12rpx;
}

.action-full {
  flex: 1;

  .action-btn {
    width: 100%;
    height: 88rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    font-size: var(--font-lg);
    font-weight: 500;

    &:active {
      opacity: 0.85;
    }

    &.action-apply {
      background-color: var(--color-primary);
      color: #fff;

      &.disabled {
        opacity: 0.5;
      }
    }

    &.action-pending {
      background-color: var(--color-divider);
      color: var(--color-text-hint);
    }

    &.action-leave {
      background-color: var(--color-bg);
      color: var(--color-danger);
      border: 1rpx solid var(--color-danger);
    }
  }
}

.action-captain {
  flex: 1;
  display: flex;
  gap: 12rpx;

  .action-btn {
    flex: 1;
    height: 88rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    font-size: var(--font-sm);
    font-weight: 500;

    &:active {
      opacity: 0.85;
    }

    &.action-edit {
      background-color: var(--color-bg);
      color: var(--color-text-secondary);
    }

    &.action-start {
      background-color: var(--color-primary);
      color: #fff;
    }

    &.action-finish {
      background-color: var(--color-warning);
      color: #fff;
    }

    &.action-cancel {
      background-color: var(--color-divider);
      color: var(--color-text-hint);
    }
  }
}

// ===== 分享浮动按钮 =====
.share-fab {
  position: fixed;
  top: 16rpx;
  right: 24rpx;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.35);
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
</style>
