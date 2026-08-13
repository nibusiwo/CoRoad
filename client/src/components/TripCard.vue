<template>
  <view
    class="trip-card"
    :class="{ 'trip-compact': compact }"
    @click="handleCardClick"
  >
    <!-- ==================== Compact Mode ==================== -->
    <template v-if="compact">
      <view class="compact-row">
        <view class="compact-route">
          <text class="compact-start">{{ trip.startPoint || '未设置' }}</text>
          <text class="compact-arrow">→</text>
          <text class="compact-end">{{ trip.endPoint || '未设置' }}</text>
        </view>
        <view class="compact-meta">
          <text v-if="trip.departureTime" class="compact-time">{{ compactDate(trip.departureTime) }}</text>
          <text v-if="trip.joinedCars !== undefined" class="compact-cars">{{ trip.joinedCars || 0 }}/{{ trip.maxCars || '?' }}车</text>
        </view>
      </view>
    </template>

    <!-- ==================== Full Mode ==================== -->
    <template v-else>
      <!-- Route Header -->
      <view class="card-route">
        <view class="route-start">
          <view class="route-dot start-dot"></view>
          <text class="route-label">{{ trip.startPoint || '出发地' }}</text>
        </view>
        <view class="route-middle">
          <view class="route-line"></view>
          <text class="route-arrow-icon">›</text>
        </view>
        <view class="route-end">
          <view class="route-dot end-dot"></view>
          <text class="route-label">{{ trip.endPoint || '目的地' }}</text>
        </view>
      </view>

      <!-- Leader Info -->
      <view class="card-leader" @click.stop="goToLeader">
        <image
          :src="trip.captainAvatar || '/static/default-avatar.png'"
          class="leader-avatar"
          mode="aspectFill"
        />
        <view class="leader-info">
          <view class="leader-name-row">
            <text class="leader-name">{{ trip.captainNickname || '未知车友' }}</text>
            <text class="leader-level">Lv.{{ trip.captainLevel || 1 }}</text>
          </view>
          <text class="leader-team" v-if="trip.teamName">{{ trip.teamName }}</text>
        </view>
        <!-- Route Match % -->
        <view v-if="trip.routeMatch !== undefined" class="route-match">
          <text class="match-value">{{ trip.routeMatch }}%</text>
          <text class="match-label">路线匹配</text>
        </view>
      </view>

      <!-- Trip Stats -->
      <view class="card-stats">
        <view class="stat-item">
          <text class="stat-icon">🚗</text>
          <text class="stat-value">{{ trip.joinedCars || 0 }}/{{ trip.maxCars || '?' }} 车</text>
        </view>
        <view class="stat-item">
          <text class="stat-icon">👥</text>
          <text class="stat-value">{{ trip.memberCount || 0 }} 人</text>
        </view>
        <view class="stat-item">
          <text class="stat-icon">📅</text>
          <text class="stat-value">{{ trip.estimatedDays || '?' }} 天</text>
        </view>
      </view>

      <!-- Departure Time -->
      <view v-if="trip.departureTime" class="card-time">
        <text class="time-icon">🕐</text>
        <text class="time-text">{{ formatDate(trip.departureTime) }} 出发</text>
      </view>

      <!-- Tags Row -->
      <view v-if="trip.tags && trip.tags.length" class="card-tags">
        <text v-for="tag in trip.tags" :key="tag" class="card-tag">{{ tag }}</text>
      </view>

      <!-- Action Buttons -->
      <view v-if="showActions" class="card-actions">
        <view class="action-btn greet-btn" @click.stop="handleGreet">
          <text>👋 打招呼</text>
        </view>
        <view
          class="action-btn join-btn"
          :class="{ disabled: trip.hasApplied }"
          @click.stop="handleApply"
        >
          <text>{{ trip.hasApplied ? '已申请' : '申请入队' }}</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script>
module.exports = {
  name: 'TripCard',

  props: {
    /**
     * Trip object with full trip data.
     * Expected fields: id, startPoint, endPoint, departureTime, estimatedDays,
     * joinedCars, maxCars, memberCount, captainAvatar, captainNickname,
     * captainLevel, teamName, routeMatch, tags, hasApplied, status
     */
    trip: {
      type: Object,
      required: true,
      default: function () {
        return {};
      }
    },

    /**
     * Whether to show action buttons (打招呼, 申请入队)
     */
    showActions: {
      type: Boolean,
      default: true
    },

    /**
     * Whether to show in compact mode (single line layout)
     */
    compact: {
      type: Boolean,
      default: false
    }
  },

  methods: {
    /** Handle card tap (compact mode = navigate) */
    handleCardClick() {
      this.$emit('click', this.trip);
      if (this.trip.id) {
        uni.navigateTo({
          url: '/pages/trip/detail?tripId=' + this.trip.id
        });
      }
    },

    /** Navigate to leader's user home */
    goToLeader() {
      if (this.trip.captainId) {
        this.$emit('leader-click', this.trip);
        uni.navigateTo({
          url: '/pages/user/home?userId=' + this.trip.captainId
        });
      }
    },

    /** Handle greet action */
    handleGreet() {
      this.$emit('greet', this.trip);
    },

    /** Handle apply action */
    handleApply() {
      if (this.trip.hasApplied) {
        uni.showToast({ title: '已提交申请，等待队长审批', icon: 'none' });
        return;
      }
      this.$emit('apply', this.trip);
    },

    /** Format date for full display */
    formatDate(timeStr) {
      if (!timeStr) return '';
      try {
        const date = new Date(timeStr);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return month + '/' + day + ' ' + hours + ':' + minutes;
      } catch (e) {
        return timeStr;
      }
    },

    /** Format date for compact display */
    compactDate(timeStr) {
      if (!timeStr) return '';
      try {
        const date = new Date(timeStr);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return month + '/' + day;
      } catch (e) {
        return timeStr;
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.trip-card {
  background-color: var(--color-bg-white);
  border-radius: var(--radius-md);
  padding: 24rpx;
  box-shadow: var(--shadow-sm);
  overflow: hidden;

  &:active {
    background-color: #FCFCFC;
  }
}

// ==================== Compact Mode ====================
.trip-compact {
  padding: 20rpx 24rpx;

  .compact-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
  }

  .compact-route {
    display: flex;
    align-items: center;
    gap: 8rpx;
    flex: 1;
    min-width: 0;

    text {
      font-size: var(--font-sm);
    }

    .compact-start {
      color: var(--color-primary);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 140rpx;
    }

    .compact-arrow {
      color: var(--color-text-hint);
      flex-shrink: 0;
    }

    .compact-end {
      color: var(--color-danger);
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 140rpx;
    }
  }

  .compact-meta {
    display: flex;
    align-items: center;
    gap: 12rpx;
    flex-shrink: 0;

    text {
      font-size: 20rpx;
      color: var(--color-text-hint);
    }
  }
}

// ==================== Full Mode ====================

// Route
.card-route {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.route-start,
.route-end {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  flex: 1;
}

.route-dot {
  width: 20rpx;
  height: 20rpx;
  border-radius: 50%;

  &.start-dot {
    background-color: var(--color-primary);
  }

  &.end-dot {
    background-color: var(--color-danger);
  }
}

.route-label {
  font-size: var(--font-xs);
  color: var(--color-text-secondary);
  text-align: center;
  max-width: 180rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-middle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
  padding: 0 12rpx;

  .route-line {
    width: 80rpx;
    height: 3rpx;
    background: linear-gradient(90deg, var(--color-primary), var(--color-danger));
    border-radius: 2rpx;
  }

  .route-arrow-icon {
    font-size: 28rpx;
    color: var(--color-text-hint);
    transform: rotate(90deg);
  }
}

// Leader
.card-leader {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 0;
  border-top: 1rpx solid var(--color-divider);
  border-bottom: 1rpx solid var(--color-divider);
  margin-bottom: 12rpx;

  .leader-avatar {
    width: 72rpx;
    height: 72rpx;
    border-radius: 50%;
    background-color: var(--color-divider);
    flex-shrink: 0;
  }

  .leader-info {
    flex: 1;
    min-width: 0;

    .leader-name-row {
      display: flex;
      align-items: center;
      gap: 8rpx;
      margin-bottom: 4rpx;

      .leader-name {
        font-size: var(--font-sm);
        font-weight: 600;
        color: var(--color-text-primary);
        max-width: 180rpx;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .leader-level {
        font-size: 18rpx;
        color: var(--color-primary);
        background-color: rgba(7, 193, 96, 0.08);
        padding: 2rpx 8rpx;
        border-radius: 8rpx;
      }
    }

    .leader-team {
      font-size: 20rpx;
      color: var(--color-text-hint);
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .route-match {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8rpx 12rpx;
    background-color: rgba(7, 193, 96, 0.06);
    border-radius: var(--radius-sm);
    flex-shrink: 0;

    .match-value {
      font-size: 28rpx;
      font-weight: 700;
      color: var(--color-primary);
    }

    .match-label {
      font-size: 16rpx;
      color: var(--color-text-hint);
    }
  }
}

// Stats
.card-stats {
  display: flex;
  gap: 24rpx;
  margin-bottom: 8rpx;

  .stat-item {
    display: flex;
    align-items: center;
    gap: 6rpx;

    .stat-icon {
      font-size: 22rpx;
    }

    .stat-value {
      font-size: var(--font-xs);
      color: var(--color-text-secondary);
      font-weight: 500;
    }
  }
}

// Time
.card-time {
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin-bottom: 10rpx;

  .time-icon {
    font-size: 22rpx;
  }

  .time-text {
    font-size: var(--font-xs);
    color: var(--color-text-secondary);
  }
}

// Tags
.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-bottom: 10rpx;

  .card-tag {
    font-size: 20rpx;
    padding: 4rpx 14rpx;
    background-color: rgba(7, 193, 96, 0.08);
    color: var(--color-primary);
    border-radius: 20rpx;
  }
}

// Actions
.card-actions {
  display: flex;
  gap: 12rpx;
  margin-top: 4rpx;
  padding-top: 12rpx;
  border-top: 1rpx solid var(--color-divider);

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 72rpx;
    border-radius: var(--radius-sm);
    font-size: var(--font-sm);
    font-weight: 500;
    transition: opacity 0.15s;

    &:active {
      opacity: 0.85;
    }

    &.greet-btn {
      background-color: rgba(74, 144, 217, 0.08);
      color: var(--color-info);
    }

    &.join-btn {
      background-color: rgba(7, 193, 96, 0.08);
      color: var(--color-primary);

      &.disabled {
        opacity: 0.5;
        pointer-events: none;
      }
    }
  }
}
</style>
