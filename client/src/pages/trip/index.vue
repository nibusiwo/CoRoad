<template>
  <view class="trip-page">
    <!-- 顶部状态区域 -->
    <view class="trip-status-area">
      <!-- 无行程 -->
      <view v-if="!hasActiveTrip && !hasDraft" class="no-trip-banner" @click="goCreate">
        <u-icon name="car" size="48" color="#07C160" />
        <view class="no-trip-text">
          <text class="no-trip-title">你还没设行程</text>
          <text class="no-trip-hint">点下方「＋发布行程」开始规划</text>
        </view>
        <text class="no-trip-arrow">›</text>
      </view>

      <!-- 有进行中的行程 -->
      <view v-if="hasActiveTrip && currentTrip" class="active-trip-bar">
        <view class="active-trip-header">
          <view class="trip-status-indicator">
            <text class="indicator-dot">🟢</text>
            <text class="indicator-label">当前行程</text>
          </view>
          <view class="trip-actions">
            <view class="action-btn" @click="editTrip(currentTrip)">
              <text>编辑行程</text>
            </view>
            <view class="action-btn action-danger" @click="finishTrip(currentTrip)">
              <text>结束行程</text>
            </view>
          </view>
        </view>

        <view class="active-trip-route" @click="goDetail(currentTrip)">
          <text class="route-text">
            {{ currentTrip.startPoint || '???' }} → {{ currentTrip.endPoint || '???' }}
          </text>
        </view>

        <view class="active-trip-meta">
          <text class="meta-item">出发：{{ formatDate(currentTrip.departureTime) }}</text>
          <text class="meta-item">|</text>
          <text class="meta-item">预计{{ currentTrip.estimatedDays || '?' }}天</text>
          <text class="meta-item">|</text>
          <text class="meta-item">{{ currentTrip.memberCount || 0 }}/{{ currentTrip.maxCars || '?' }}车</text>
        </view>
      </view>

      <!-- 下一趟行程草稿 -->
      <view v-if="hasDraft && draftTrip" class="draft-card">
        <view class="draft-header">
          <text class="draft-title">下一趟行程</text>
          <text class="draft-badge">草稿</text>
        </view>
        <view class="draft-route" @click="goDetail(draftTrip)">
          <text class="route-text">
            {{ draftTrip.startPoint || '???' }} → {{ draftTrip.endPoint || '???' }}
          </text>
        </view>
        <view class="draft-meta">
          <text class="meta-item">出发：{{ formatDate(draftTrip.departureTime) }}</text>
          <text class="meta-item">|</text>
          <text class="meta-item">预计{{ draftTrip.estimatedDays || '?' }}天</text>
        </view>
        <view class="draft-actions">
          <view class="action-btn" @click="editDraft(draftTrip)">
            <text>编辑</text>
          </view>
          <view class="action-btn action-primary" @click="publishDraft(draftTrip)">
            <text>发起组队</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 推荐行程标题(仅设好行程后显示) -->
    <view class="section-header" v-if="hasTrip">
      <text class="section-title">推荐行程</text>
      <text class="section-hint">按顺路率排序</text>
    </view>

    <!-- 推荐行程列表 -->
    <scroll-view
      v-if="hasTrip"
      class="trip-list"
      scroll-y
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
    >
      <!-- 加载中 -->
      <view v-if="nearbyLoading" class="loading-state">
        <text>加载中...</text>
      </view>

      <!-- 空状态 -->
      <view v-else-if="nearbyTrips.length === 0" class="empty-state">
        <text class="empty-icon">🗺</text>
        <text class="empty-text">附近暂无行程</text>
        <text class="empty-hint">试试扩大范围或者自己发起一个吧</text>
      </view>

      <!-- 行程卡片 -->
      <view
        v-for="trip in nearbyTrips"
        :key="trip.id"
        class="trip-card card"
        @click="goDetail(trip)"
      >
        <!-- 队长信息 -->
        <view class="card-header">
          <view class="leader-info">
            <image
              :src="trip.captainAvatar || '/static/default-avatar.png'"
              class="leader-avatar"
              mode="aspectFill"
            />
            <view class="leader-detail">
              <text class="leader-name">{{ trip.captainNickname || '队长' }}</text>
              <view class="leader-rating">
                <text v-for="i in 5" :key="i" class="star" :class="{ filled: i <= (trip.captainRating || 0) }">★</text>
              </view>
            </view>
          </view>
          <view class="route-match">
            <text class="match-percent">{{ trip.routeMatch || 0 }}%</text>
            <text class="match-label">顺路</text>
          </view>
        </view>

        <!-- 路线 -->
        <view class="card-route">
          <text class="route-label">路线：</text>
          <text class="route-value">{{ trip.startPoint || '???' }} → {{ trip.endPoint || '???' }}</text>
        </view>

        <view class="card-meta-row">
          <text class="meta-text">{{ formatDate(trip.departureTime) }} 出发</text>
          <text class="meta-divider">|</text>
          <text class="meta-text">约{{ trip.estimatedDays || '?' }}天</text>
          <text class="meta-divider">|</text>
          <text class="meta-text">{{ trip.joinedCars || 0 }}/{{ trip.maxCars || '?' }}车</text>
        </view>

        <!-- 行程深度标签 -->
        <view class="card-tags">
          <view class="depth-tag" :class="'depth-' + (trip.depth || 'shallow')">
            <text>{{ depthLabel(trip.depth) }}</text>
          </view>
          <view
            v-for="tag in (trip.tags || []).slice(0, 4)"
            :key="tag"
            class="feature-tag"
          >
            <text>{{ tag }}</text>
          </view>
        </view>

        <!-- 特色标签 -->
        <view v-if="trip.features && trip.features.length" class="card-features">
          <view v-for="feat in trip.features" :key="feat" class="feature-item">
            <text class="feature-icon">✔</text>
            <text class="feature-text">{{ feat }}</text>
          </view>
        </view>

        <!-- 操作按钮 -->
        <view class="card-actions">
          <view class="card-btn btn-chat" @click.stop="greetTrip(trip)">
            <text>💬 打招呼先问</text>
          </view>
          <view
            class="card-btn btn-join"
            :class="{ disabled: trip.hasApplied }"
            @click.stop="applyJoin(trip)"
          >
            <text>{{ trip.hasApplied ? '已申请' : '➕ 申请入队' }}</text>
          </view>
        </view>
      </view>

      <!-- 底部占位 -->
      <view class="bottom-placeholder safe-area-bottom"></view>
    </scroll-view>

    <!-- 未设置行程提示 -->
    <view v-else class="no-trip-recommend">
      <u-icon name="map" size="96" color="#07C160" style="margin-bottom: 12rpx;" />
      <text class="ntr-title">先设置你的行程</text>
      <text class="ntr-desc">设置好起点/终点后，系统会按顺路率为你推荐同行车队</text>
    </view>

    <!-- 浮动发布按钮 -->
    <view class="fab-create" @click="goCreate">
      <text class="fab-icon">＋</text>
    </view>
  </view>
</template>

<script>
import { useTripStore } from '@/store/trip.js';
import { useUserStore } from '@/store/user.js';
import { useChatStore } from '@/store/chat.js';

export default {
  data() {
    return {
      refreshing: false
    };
  },

  computed: {
    tripStore() {
      return useTripStore();
    },
    userStore() {
      return useUserStore();
    },
    chatStore() {
      return useChatStore();
    },
    hasActiveTrip() {
      return this.tripStore.hasActiveTrip;
    },
    hasDraft() {
      return this.tripStore.draftCount > 0;
    },
    /** 是否已设置行程(招募中或进行中) */
    hasTrip() {
      const trip = this.tripStore.currentTrip;
      return !!(trip && (trip.status === 1 || trip.status === 2));
    },
    currentTrip() {
      return this.tripStore.currentTrip;
    },
    draftTrip() {
      if (this.tripStore.draftTrips.length > 0) {
        return this.tripStore.draftTrips[0];
      }
      return null;
    },
    nearbyTrips() {
      return this.tripStore.nearbyTrips || [];
    },
    nearbyLoading() {
      return this.tripStore.nearbyLoading;
    }
  },

  onShow() {
    this.loadData();
  },

  methods: {
    /** 加载数据 */
    async loadData() {
      try {
        if (this.userStore.isLoggedIn) {
          await this.tripStore.fetchCurrentTrip();
          await this.tripStore.fetchDrafts();
        }

        // 只有设好行程后才请求推荐行程
        if (this.hasTrip) {
          await this.loadNearbyTrips();
        } else {
          this.tripStore.nearbyTrips = [];
          this.tripStore.nearbyLoading = false;
        }
      } catch (err) {
        console.error('加载行程数据失败:', err);
      }
    },

    /** 加载附近行程 */
    async loadNearbyTrips() {
      try {
        const location = await this.getCurrentLocation();
        if (location) {
          await this.tripStore.fetchNearbyTrips(location.longitude, location.latitude);
        } else {
          // 无定位时仍尝试请求（服务端可能用IP定位）
          await this.tripStore.fetchNearbyTrips(null, null);
        }
      } catch (err) {
        console.error('加载附近行程失败:', err);
      }
    },

    /** 获取当前位置 */
    getCurrentLocation() {
      return new Promise((resolve) => {
        uni.getLocation({
          type: 'gcj02',
          success: (res) => {
            resolve({ longitude: res.longitude, latitude: res.latitude });
          },
          fail: (err) => {
            console.warn('[Trip] uni.getLocation 失败:', err);
            // #ifdef H5
            // H5 浏览器可能因 HTTPS/权限导致 uni 定位失败，回退到原生 Geolocation API
            this.getBrowserLocation()
              .then(resolve)
              .catch(() => resolve(this.getFallbackLocation()));
            // #endif
            // #ifndef H5
            resolve(this.getFallbackLocation());
            // #endif
          }
        });
      });
    },

    // #ifdef H5
    /** H5 浏览器原生定位（返回 wgs84，做粗略 gcj02 偏移） */
    getBrowserLocation() {
      return new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          reject(new Error('浏览器不支持定位'));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { longitude, latitude } = this.transformWgs84ToGcj02(
              pos.coords.longitude,
              pos.coords.latitude
            );
            resolve({ longitude, latitude });
          },
          (err) => {
            console.warn('[Trip] 浏览器原生定位失败:', err);
            reject(err);
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        );
      });
    },

    /**
     * 粗略 wgs84 -> gcj02 坐标偏移
     * 浏览器原生 Geolocation 返回 wgs84，国内地图通常使用 gcj02，
     * 简单偏移可减小距离计算误差。
     */
    transformWgs84ToGcj02(lng, lat) {
      const pi = 3.14159265358979324;
      const a = 6378245.0;
      const ee = 0.00669342162296594323;

      const transformLat = (x, y) => {
        let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
        ret += (20.0 * Math.sin(6.0 * x * pi) + 20.0 * Math.sin(2.0 * x * pi)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(y * pi) + 40.0 * Math.sin(y / 3.0 * pi)) * 2.0 / 3.0;
        ret += (160.0 * Math.sin(y / 12.0 * pi) + 320 * Math.sin(y * pi / 30.0)) * 2.0 / 3.0;
        return ret;
      };

      const transformLng = (x, y) => {
        let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
        ret += (20.0 * Math.sin(6.0 * x * pi) + 20.0 * Math.sin(2.0 * x * pi)) * 2.0 / 3.0;
        ret += (20.0 * Math.sin(x * pi) + 40.0 * Math.sin(x / 3.0 * pi)) * 2.0 / 3.0;
        ret += (150.0 * Math.sin(x / 12.0 * pi) + 300.0 * Math.sin(x / 30.0 * pi)) * 2.0 / 3.0;
        return ret;
      };

      const dLat = transformLat(lng - 105.0, lat - 35.0);
      const dLng = transformLng(lng - 105.0, lat - 35.0);
      const radLat = lat / 180.0 * pi;
      let magic = Math.sin(radLat);
      magic = 1 - ee * magic * magic;
      const sqrtMagic = Math.sqrt(magic);
      const dLatMeters = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * pi);
      const dLngMeters = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * pi);
      return { longitude: lng + dLngMeters, latitude: lat + dLatMeters };
    },
    // #endif

    /** 兜底定位：广州市中心（与现有数据所在城市一致） */
    getFallbackLocation() {
      return { longitude: 113.2644, latitude: 23.1291 };
    },

    /** 下拉刷新 */
    async onRefresh() {
      this.refreshing = true;
      try {
        await this.loadData();
      } finally {
        this.refreshing = false;
      }
    },

    /** 跳转行程详情 */
    goDetail(trip) {
      uni.navigateTo({
        url: '/pages/trip/detail?tripId=' + trip.id
      });
    },

    /** 跳转创建行程 */
    goCreate() {
      uni.navigateTo({
        url: '/pages/trip/create'
      });
    },

    /** 编辑当前行程 */
    editTrip(trip) {
      uni.navigateTo({
        url: '/pages/trip/create?tripId=' + trip.id
      });
    },

    /** 结束行程 */
    finishTrip(trip) {
      uni.showModal({
        title: '确认结束',
        content: '结束当前行程后，队伍将解散，确定要结束吗？',
        success: async (res) => {
          if (res.confirm) {
            try {
              await this.tripStore.finishTrip(trip.id);
              uni.showToast({ title: '行程已结束', icon: 'success' });
              this.loadData();
            } catch (err) {
              uni.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** 编辑草稿 */
    editDraft(draft) {
      uni.navigateTo({
        url: '/pages/trip/create?draftId=' + draft.id
      });
    },

    /** 发布草稿 */
    publishDraft(draft) {
      uni.showModal({
        title: '发起组队',
        content: '确认发布并开始招募队友吗？',
        success: async (res) => {
          if (res.confirm) {
            try {
              await this.tripStore.publishDraft(draft.id);
              uni.showToast({ title: '发布成功', icon: 'success' });
              this.loadData();
            } catch (err) {
              uni.showToast({ title: '发布失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** 申请加入 */
    applyJoin(trip) {
      if (trip.hasApplied) {
        uni.showToast({ title: '已提交申请，请等待队长审批', icon: 'none' });
        return;
      }

      uni.showModal({
        title: '申请入队',
        content: '确认申请加入「' + trip.title + '」吗？',
        success: async (res) => {
          if (res.confirm) {
            try {
              await this.tripStore.applyJoin(trip.id);
              trip.hasApplied = true;
              uni.showToast({ title: '申请已发送，等待队长审批', icon: 'success' });
            } catch (err) {
              uni.showToast({ title: '申请失败，请重试', icon: 'none' });
            }
          }
        }
      });
    },

    /** 打招呼 */
    async greetTrip(trip) {
      try {
        const captainId = this.resolveCaptainId(trip);
        if (!captainId) {
          uni.showToast({ title: '队长信息缺失', icon: 'none' });
          return;
        }

        const session = await this.chatStore.createPrivateSession(captainId);
        this.chatStore.setCurrentSession(session);
        uni.navigateTo({
          url: '/pages/message/chat?sessionId=' + session.id
        });
      } catch (err) {
        uni.showToast({ title: err?.message || '操作失败', icon: 'none' });
      }
    },

    resolveCaptainId(trip) {
      if (!trip) return '';
      const leaderInfo = trip.leaderInfo || trip.leader_info || {};
      return trip.captainId || trip.captain_id || trip.leaderId || trip.leader_id || leaderInfo.id || '';
    },

    /** 深度标签文案 */
    depthLabel(depth) {
      const map = {
        shallow: '浅·仅同行',
        medium: '中·AA拼桌',
        deep: '深·全程同行'
      };
      return map[depth] || '浅·仅同行';
    },

    /** 格式化日期 */
    formatDate(timeStr) {
      if (!timeStr) return '待定';
      const date = new Date(timeStr);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return month + '.' + day + ' ' + hours + ':' + minutes;
    }
  }
};
</script>

<style lang="scss" scoped>
.trip-page {
  display: flex;
  flex-direction: column;
  // 使用 100% 而非 100vh:小程序端 100vh 包含 tabBar 高度,会把列表底部顶到 tabBar 下面
  height: 100%;
  background-color: var(--color-bg-white);
}

// 顶部状态区
.trip-status-area {
  padding: 16rpx 24rpx;
  background-color: var(--color-bg-white);
  border-bottom: 1rpx solid var(--color-border);
}

// 无行程
.no-trip-banner {
  display: flex;
  align-items: center;
  padding: 24rpx;
  background: linear-gradient(135deg, #f0faf3, #e8f8ee);
  border-radius: var(--radius-md);
  gap: 16rpx;

  .no-trip-icon {
    font-size: 52rpx;
  }

  .no-trip-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4rpx;

    .no-trip-title {
      font-size: var(--font-md);
      font-weight: 500;
      color: var(--color-text-primary);
    }

    .no-trip-hint {
      font-size: var(--font-xs);
      color: var(--color-text-hint);
    }
  }

  .no-trip-arrow {
    font-size: 40rpx;
    color: var(--color-text-hint);
  }
}

// 进行中的行程
.active-trip-bar {
  background: linear-gradient(135deg, #e8f8ee, #d4f5e2);
  border-radius: var(--radius-md);
  padding: 20rpx 24rpx;

  .active-trip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12rpx;

    .trip-status-indicator {
      display: flex;
      align-items: center;
      gap: 8rpx;

      .indicator-dot {
        font-size: 20rpx;
      }

      .indicator-label {
        font-size: var(--font-sm);
        font-weight: 500;
        color: var(--color-primary);
      }
    }

    .trip-actions {
      display: flex;
      gap: 12rpx;

      .action-btn {
        padding: 8rpx 20rpx;
        border-radius: 20rpx;
        font-size: var(--font-xs);
        background-color: rgba(255, 255, 255, 0.8);
        color: var(--color-text-secondary);
        border: 1rpx solid var(--color-border);

        &.action-danger {
          color: var(--color-danger);
          border-color: var(--color-danger);
        }
      }
    }
  }

  .active-trip-route {
    margin-bottom: 8rpx;

    .route-text {
      font-size: var(--font-lg);
      font-weight: 600;
      color: var(--color-text-primary);
    }
  }

  .active-trip-meta {
    display: flex;
    align-items: center;
    gap: 8rpx;

    .meta-item {
      font-size: var(--font-xs);
      color: var(--color-text-secondary);
    }
  }
}

// 草稿卡片
.draft-card {
  margin-top: 16rpx;
  padding: 20rpx 24rpx;
  background-color: #fff8e6;
  border-radius: var(--radius-md);
  border: 1rpx dashed #f0c060;

  .draft-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8rpx;

    .draft-title {
      font-size: var(--font-sm);
      font-weight: 500;
      color: #b8860b;
    }

    .draft-badge {
      font-size: var(--font-xs);
      color: #fff;
      background-color: #f0c060;
      padding: 4rpx 12rpx;
      border-radius: 16rpx;
    }
  }

  .draft-route {
    margin-bottom: 6rpx;

    .route-text {
      font-size: var(--font-md);
      font-weight: 500;
      color: var(--color-text-primary);
    }
  }

  .draft-meta {
    display: flex;
    align-items: center;
    gap: 8rpx;
    margin-bottom: 12rpx;

    .meta-item {
      font-size: var(--font-xs);
      color: var(--color-text-secondary);
    }
  }

  .draft-actions {
    display: flex;
    gap: 12rpx;
    justify-content: flex-end;

    .action-btn {
      padding: 10rpx 28rpx;
      border-radius: 20rpx;
      font-size: var(--font-sm);
      background-color: #fff;
      color: var(--color-text-secondary);
      border: 1rpx solid var(--color-border);

      &.action-primary {
        background-color: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
      }
    }
  }
}

// 区块标题
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 24rpx 8rpx;

  .section-title {
    font-size: var(--font-lg);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .section-hint {
    font-size: var(--font-xs);
    color: var(--color-text-hint);
  }
}

// 行程列表
.trip-list {
  flex: 1;
  min-height: 0;
}

// 未设置行程提示
.no-trip-recommend {
  flex: 1;
  min-height: 0;
  background: #FFFFFF;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 64rpx;
  gap: 16rpx;

  .ntr-icon {
    font-size: 96rpx;
    opacity: 0.6;
    margin-bottom: 12rpx;
  }

  .ntr-title {
    font-size: 32rpx;
    font-weight: 700;
    color: #1A1A1A;
  }

  .ntr-desc {
    font-size: 24rpx;
    color: #999;
    text-align: center;
    line-height: 1.6;
  }

  .ntr-btn {
    margin-top: 24rpx;
    padding: 20rpx 64rpx;
    background: linear-gradient(135deg, #07C160, #05A84E);
    border-radius: 44rpx;
    color: #FFFFFF;
    font-size: 28rpx;
    font-weight: 600;
    box-shadow: 0 8rpx 24rpx rgba(7, 193, 96, 0.3);

    &:active {
      opacity: 0.85;
    }
  }
}

// 加载与空状态
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 0;

  .empty-icon {
    font-size: 72rpx;
    margin-bottom: 16rpx;
  }

  .empty-text {
    font-size: var(--font-md);
    color: var(--color-text-secondary);
    margin-bottom: 8rpx;
  }

  .empty-hint {
    font-size: var(--font-xs);
    color: var(--color-text-hint);
  }
}

// 行程卡片
.trip-card {
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16rpx;

    .leader-info {
      display: flex;
      align-items: center;
      gap: 12rpx;

      .leader-avatar {
        width: 64rpx;
        height: 64rpx;
        border-radius: 50%;
        background-color: var(--color-divider);
      }

      .leader-detail {
        .leader-name {
          font-size: var(--font-md);
          font-weight: 500;
          color: var(--color-text-primary);
        }

        .leader-rating {
          display: flex;
          gap: 2rpx;

          .star {
            font-size: 22rpx;
            color: #ddd;

            &.filled {
              color: #f5a623;
            }
          }
        }
      }
    }

    .route-match {
      display: flex;
      flex-direction: column;
      align-items: center;

      .match-percent {
        font-size: var(--font-xl);
        font-weight: 700;
        color: var(--color-primary);
      }

      .match-label {
        font-size: 20rpx;
        color: var(--color-text-hint);
      }
    }
  }

  .card-route {
    margin-bottom: 8rpx;

    .route-label {
      font-size: var(--font-xs);
      color: var(--color-text-hint);
    }

    .route-value {
      font-size: var(--font-md);
      font-weight: 500;
      color: var(--color-text-primary);
    }
  }

  .card-meta-row {
    display: flex;
    align-items: center;
    gap: 8rpx;
    margin-bottom: 12rpx;

    .meta-text {
      font-size: var(--font-xs);
      color: var(--color-text-secondary);
    }

    .meta-divider {
      font-size: var(--font-xs);
      color: #ddd;
    }
  }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8rpx;
    margin-bottom: 12rpx;

    .depth-tag {
      font-size: 20rpx;
      padding: 4rpx 12rpx;
      border-radius: 16rpx;

      &.depth-shallow {
        color: var(--color-info);
        background-color: rgba(74, 144, 217, 0.08);
      }

      &.depth-medium {
        color: #f5a623;
        background-color: rgba(245, 166, 35, 0.08);
      }

      &.depth-deep {
        color: var(--color-danger);
        background-color: rgba(231, 76, 60, 0.08);
      }
    }

    .feature-tag {
      font-size: 20rpx;
      padding: 4rpx 12rpx;
      border-radius: 16rpx;
      color: var(--color-text-secondary);
      background-color: var(--color-divider);
    }
  }

  .card-features {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
    margin-bottom: 16rpx;
    padding: 12rpx;
    background-color: #f8fdf9;
    border-radius: var(--radius-sm);

    .feature-item {
      display: flex;
      align-items: center;
      gap: 4rpx;

      .feature-icon {
        font-size: 20rpx;
        color: var(--color-primary);
      }

      .feature-text {
        font-size: var(--font-xs);
        color: var(--color-text-secondary);
      }
    }
  }

  .card-actions {
    display: flex;
    gap: 12rpx;

    .card-btn {
      flex: 1;
      height: 72rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-md);
      font-size: var(--font-sm);
      font-weight: 500;
      transition: opacity 0.15s;

      &:active {
        opacity: 0.8;
      }

      &.btn-chat {
        background-color: var(--color-divider);
        color: var(--color-text-secondary);
      }

      &.btn-join {
        background-color: var(--color-primary);
        color: #fff;

        &.disabled {
          opacity: 0.5;
        }
      }
    }
  }
}

// 底部占位
.bottom-placeholder {
  height: 140rpx;
}

// 浮动按钮
.fab-create {
  position: fixed;
  right: 32rpx;
  bottom: 100rpx;
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background: var(--color-primary);
  box-shadow: 0 8rpx 24rpx rgba(7, 193, 96, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  transition: transform 0.2s;

  &:active {
    transform: scale(0.92);
  }

  .fab-icon {
    font-size: 48rpx;
    color: #fff;
    font-weight: 300;
  }
}
</style>
