<template>
  <view class="next-trip-page">
    <!-- ==================== Loading ==================== -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- ==================== Empty State ==================== -->
    <template v-if="!loading && drafts.length === 0">
      <view class="empty-state">
        <view class="empty-illustration">
          <text class="empty-illustration-icon">🗺️</text>
          <view class="empty-map-lines">
            <view class="map-line line-1"></view>
            <view class="map-line line-2"></view>
            <view class="map-line line-3"></view>
            <view class="map-dot start-dot"></view>
            <view class="map-dot end-dot"></view>
          </view>
        </view>
        <text class="empty-title">还没有行程草稿</text>
        <text class="empty-desc">规划下一趟自驾行程，与车友结伴同行</text>
        <view class="empty-action" @click="createNewTrip">
          <text>🚀 规划下一趟行程</text>
        </view>
      </view>
    </template>

    <!-- ==================== Draft List ==================== -->
    <template v-if="!loading && drafts.length > 0">
      <scroll-view class="draft-scroll" scroll-y>
        <!-- Create New Button at Top -->
        <view class="create-bar" @click="createNewTrip">
          <view class="create-inner">
            <text class="create-icon">＋</text>
            <text class="create-text">创建新行程草稿</text>
          </view>
        </view>

        <!-- Draft Cards -->
        <view
          v-for="draft in drafts"
          :key="draft.id"
          class="draft-card"
        >
          <!-- Route Info -->
          <view class="draft-route" @click="editDraft(draft)">
            <view class="route-line-row">
              <view class="route-node start">
                <view class="node-dot start-dot"></view>
                <text class="node-label">{{ draft.startPoint || '未设置起点' }}</text>
              </view>
              <view class="route-arrow">
                <view class="arrow-line"></view>
                <text class="arrow-icon">→</text>
              </view>
              <view class="route-node end">
                <view class="node-dot end-dot"></view>
                <text class="node-label">{{ draft.endPoint || '未设置终点' }}</text>
              </view>
            </view>

            <!-- Meta row -->
            <view class="draft-meta">
              <text class="draft-time" v-if="draft.departureTime">
                🕐 {{ formatDate(draft.departureTime) }}
              </text>
              <text class="draft-days" v-if="draft.estimatedDays">
                📅 {{ draft.estimatedDays }}天
              </text>
              <text class="draft-cars" v-if="draft.maxCars">
                🚗 最多{{ draft.maxCars }}辆
              </text>
            </view>

            <!-- Draft Title -->
            <text class="draft-title" v-if="draft.title">{{ draft.title }}</text>

            <!-- Tags -->
            <view v-if="draft.tags && draft.tags.length" class="draft-tags">
              <text v-for="tag in draft.tags" :key="tag" class="draft-tag">{{ tag }}</text>
            </view>

            <!-- Draft Tag -->
            <view class="draft-status-tag">
              <text>草稿</text>
            </view>

            <!-- Update Time -->
            <text class="draft-update" v-if="draft.updatedAt">上次编辑: {{ formatDate(draft.updatedAt) }}</text>
          </view>

          <!-- Action Buttons -->
          <view class="draft-actions">
            <view class="draft-action edit" @click="editDraft(draft)">
              <text>编辑</text>
            </view>
            <view class="draft-action delete" @click="deleteDraft(draft)">
              <text>删除</text>
            </view>
            <view class="draft-action publish" @click="publishDraft(draft)">
              <text>发起组队</text>
            </view>
          </view>
        </view>

        <!-- Create New Button at Bottom -->
        <view class="create-bar-bottom" @click="createNewTrip">
          <view class="create-inner">
            <text class="create-icon">＋</text>
            <text class="create-text">创建新行程</text>
          </view>
        </view>

        <!-- Bottom Safe Area -->
        <view class="list-bottom"></view>
      </scroll-view>
    </template>
  </view>
</template>

<script>
import { useTripStore } from '@/store/trip.js';

export default {
  data() {
    return {
      drafts: [],
      loading: true
    };
  },

  computed: {
    tripStore() {
      return useTripStore();
    }
  },

  onShow() {
    this.loadDrafts();
  },

  methods: {
    /** Fetch trip drafts */
    async loadDrafts() {
      this.loading = true;
      try {
        await this.tripStore.fetchDrafts();
        this.drafts = this.tripStore.draftTrips;
      } catch (err) {
        console.warn('Failed to load drafts:', err);
        this.drafts = [];
      } finally {
        this.loading = false;
      }
    },

    /** Create new trip (navigate to create page) */
    createNewTrip() {
      uni.navigateTo({
        url: '/pages/trip/create'
      });
    },

    /** Edit a draft */
    editDraft(draft) {
      uni.navigateTo({
        url: '/pages/trip/create?draftId=' + draft.id
      });
    },

    /** Delete a draft */
    deleteDraft(draft) {
      uni.showModal({
        title: '删除草稿',
        content: '确定要删除该行程草稿吗？删除后不可恢复。',
        confirmText: '删除',
        confirmColor: '#E74C3C',
        success: async (res) => {
          if (res.confirm) {
            try {
              await this.tripStore.deleteDraft(draft.id);
              this.drafts = this.drafts.filter((d) => d.id !== draft.id);
              uni.showToast({ title: '已删除', icon: 'success' });
            } catch (err) {
              uni.showToast({ title: '删除失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** Publish draft as a trip */
    publishDraft(draft) {
      // Validate minimum fields
      if (!draft.startPoint || !draft.endPoint) {
        uni.showToast({ title: '请先完善路线信息', icon: 'none' });
        this.editDraft(draft);
        return;
      }

      uni.showModal({
        title: '发起组队',
        content: '确认发布「' + (draft.title || '未命名行程') + '」吗？发布后其他车友可以看到并申请加入。',
        confirmText: '确认发起',
        confirmColor: '#07C160',
        success: async (res) => {
          if (res.confirm) {
            uni.showLoading({ title: '发布中...', mask: true });
            try {
              const result = await this.tripStore.publishDraft(draft.id);
              uni.hideLoading();
              uni.showToast({ title: '发布成功！', icon: 'success' });
              setTimeout(() => {
                uni.redirectTo({
                  url: '/pages/trip/detail?tripId=' + result.id
                });
              }, 1500);
            } catch (err) {
              uni.hideLoading();
              uni.showToast({ title: '发布失败，请重试', icon: 'none' });
            }
          }
        }
      });
    },

    /** Format date */
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
    }
  }
};
</script>

<style lang="scss" scoped>
.next-trip-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-bg-white);
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: var(--font-sm);
  color: var(--color-text-hint);
}

// ==================== Empty State ====================
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60rpx 40rpx;
}

.empty-illustration {
  position: relative;
  width: 240rpx;
  height: 200rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 40rpx;
}

.empty-illustration-icon {
  font-size: 100rpx;
  z-index: 2;
}

.empty-map-lines {
  position: absolute;
  top: 30rpx;
  left: 30rpx;
  right: 30rpx;
  bottom: 30rpx;

  .map-line {
    position: absolute;
    height: 3rpx;
    background-color: rgba(7, 193, 96, 0.2);
    border-radius: 2rpx;

    &.line-1 {
      top: 30%;
      left: 15%;
      right: 15%;
    }

    &.line-2 {
      top: 50%;
      left: 10%;
      right: 20%;
    }

    &.line-3 {
      top: 70%;
      left: 20%;
      right: 10%;
    }
  }

  .map-dot {
    position: absolute;
    width: 16rpx;
    height: 16rpx;
    border-radius: 50%;

    &.start-dot {
      top: 20%;
      left: 10%;
      background-color: var(--color-primary);
    }

    &.end-dot {
      bottom: 20%;
      right: 10%;
      background-color: var(--color-danger);
    }
  }
}

.empty-title {
  font-size: var(--font-lg);
  color: var(--color-text-primary);
  font-weight: 600;
  margin-bottom: 12rpx;
}

.empty-desc {
  font-size: var(--font-sm);
  color: var(--color-text-hint);
  margin-bottom: 40rpx;
  text-align: center;
}

.empty-action {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  padding: 0 48rpx;
  background: linear-gradient(135deg, var(--color-primary), #05A84E);
  border-radius: 48rpx;
  box-shadow: 0 6rpx 20rpx rgba(7, 193, 96, 0.3);

  text {
    font-size: var(--font-lg);
    color: #FFFFFF;
    font-weight: 600;
  }

  &:active {
    opacity: 0.85;
  }
}

// ==================== Draft Scroll ====================
.draft-scroll {
  flex: 1;
}

// ==================== Create Bar ====================
.create-bar {
  margin: 20rpx 24rpx 16rpx;
}

.create-bar-bottom {
  margin: 16rpx 24rpx;
}

.create-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 20rpx;
  border: 2rpx dashed var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-white);
  transition: background 0.15s;

  &:active {
    background-color: #F9F9F9;
  }
}

.create-icon {
  font-size: var(--font-lg);
  color: var(--color-primary);
  font-weight: 300;
}

.create-text {
  font-size: var(--font-sm);
  color: var(--color-primary);
  font-weight: 500;
}

// ==================== Draft Card ====================
.draft-card {
  margin: 0 24rpx 20rpx;
  background-color: var(--color-bg-white);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.draft-route {
  padding: 24rpx 24rpx 16rpx;
  position: relative;

  &:active {
    background-color: #F9F9F9;
  }
}

.route-line-row {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  margin-bottom: 16rpx;
}

.route-node {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;

  .node-dot {
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

  .node-label {
    font-size: var(--font-xs);
    color: var(--color-text-secondary);
    text-align: center;
    max-width: 180rpx;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.route-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 8rpx;

  .arrow-line {
    width: 2rpx;
    flex: 1;
    min-height: 24rpx;
    background: repeating-linear-gradient(
      0deg,
      #E0E0E0 0,
      #E0E0E0 4rpx,
      transparent 4rpx,
      transparent 8rpx
    );
  }

  .arrow-icon {
    font-size: 24rpx;
    color: var(--color-text-hint);
  }
}

.draft-meta {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 10rpx;

  text {
    font-size: 20rpx;
    color: var(--color-text-hint);
  }
}

.draft-title {
  display: block;
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 8rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  margin-bottom: 8rpx;

  .draft-tag {
    font-size: 18rpx;
    padding: 2rpx 12rpx;
    border-radius: 16rpx;
    background-color: rgba(7, 193, 96, 0.08);
    color: var(--color-primary);
  }
}

.draft-status-tag {
  position: absolute;
  top: 24rpx;
  right: 24rpx;
  padding: 4rpx 14rpx;
  background-color: rgba(245, 166, 35, 0.1);
  border: 1rpx solid rgba(245, 166, 35, 0.3);
  border-radius: 16rpx;

  text {
    font-size: 20rpx;
    color: #F5A623;
    font-weight: 500;
  }
}

.draft-update {
  font-size: 20rpx;
  color: var(--color-text-hint);
  display: block;
  margin-top: 8rpx;
}

// ==================== Draft Actions ====================
.draft-actions {
  display: flex;
  border-top: 1rpx solid var(--color-divider);

  .draft-action {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 80rpx;
    font-size: var(--font-sm);
    font-weight: 500;
    transition: background 0.15s;

    &:active {
      opacity: 0.85;
    }

    &.edit {
      color: var(--color-text-secondary);
      background-color: #FAFAFA;
    }

    &.delete {
      color: var(--color-danger);
      background-color: #FAFAFA;
    }

    &.publish {
      color: #FFFFFF;
      background: linear-gradient(135deg, var(--color-primary), #05A84E);
    }

    &:not(:last-child) {
      border-right: 1rpx solid var(--color-divider);
    }
  }
}

// ==================== Bottom ====================
.list-bottom {
  height: 40rpx;
}
</style>
