<template>
  <view class="review-page">
    <scroll-view class="page-scroll" scroll-y :refresher-enabled="true" :refresher-triggered="refreshing" @refresherrefresh="onRefresh">
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-else-if="levelInfo">
        <!-- 等级总览 -->
        <view class="level-hero">
          <view class="level-badge" :class="'level-' + levelInfo.current_level">
            <text>Lv.{{ levelInfo.current_level }}</text>
          </view>
          <text class="level-name">{{ levelInfo.current_level_name }}</text>
          <text class="level-score">{{ levelInfo.score }} 分</text>

          <!-- 升级进度 -->
          <view class="progress-wrap">
            <view class="progress-track">
              <view class="progress-fill" :style="{ width: levelInfo.progress + '%' }"></view>
            </view>
            <view class="progress-meta">
              <text v-if="levelInfo.next_level">
                距{{ levelInfo.next_level_name }}还差 {{ levelInfo.score_to_next }} 分
              </text>
              <text v-else>已达最高等级 🏆</text>
              <text>{{ levelInfo.progress }}%</text>
            </view>
          </view>
        </view>

        <!-- 佣金信息 -->
        <view class="commission-card">
          <view class="commission-left">
            <text class="commission-label">当前平台佣金率</text>
            <text class="commission-value">{{ levelInfo.commission_rate_text || (Math.round((levelInfo.commission_rate || 0.1) * 100) + '%') }}</text>
          </view>
          <view class="commission-right">
            <text class="commission-hint">等级越高，佣金越低</text>
            <text class="commission-icon">💰</text>
          </view>
        </view>

        <!-- 考核维度 -->
        <view class="section-card">
          <view class="section-title">考核维度</view>
          <view v-for="dim in dimensionList" :key="dim.key" class="dim-row">
            <view class="dim-header">
              <text class="dim-label">{{ dim.label }}</text>
              <text class="dim-score">{{ dim.score }}分</text>
            </view>
            <view class="dim-track">
              <view class="dim-fill" :style="{ width: dim.score + '%', background: dimColor(dim.score) }"></view>
            </view>
            <text class="dim-detail">{{ dim.detail }}</text>
          </view>
        </view>

        <!-- 等级规则说明 -->
        <view class="section-card">
          <view class="section-title">等级规则</view>
          <view class="rule-row">
            <text class="rule-level">Lv.1 初级商家</text>
            <text class="rule-score">0 - 200分</text>
            <text class="rule-rate">佣金 10%</text>
          </view>
          <view class="rule-row">
            <text class="rule-level">Lv.2 银牌商家</text>
            <text class="rule-score">200 - 500分</text>
            <text class="rule-rate">佣金 8%</text>
          </view>
          <view class="rule-row">
            <text class="rule-level">Lv.3 金牌商家</text>
            <text class="rule-score">500 - 1000分</text>
            <text class="rule-rate">佣金 6%</text>
          </view>
          <view class="rule-row">
            <text class="rule-level">Lv.4 钻石商家</text>
            <text class="rule-score">1000 - 2000分</text>
            <text class="rule-rate">佣金 5%</text>
          </view>
          <view class="rule-row">
            <text class="rule-level">Lv.5 战略伙伴</text>
            <text class="rule-score">2000分以上</text>
            <text class="rule-rate">佣金 3%</text>
          </view>
        </view>

        <view class="bottom-placeholder"></view>
      </template>

      <view v-else-if="!loading && !levelInfo" class="empty-state">
        <text class="empty-icon">📊</text>
        <text class="empty-text">暂无考核数据</text>
        <text class="empty-hint">入驻并完成审核后可查看考核成绩</text>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { merchantApi } from '@/utils/api.js';

export default {
  data() {
    return {
      loading: true,
      refreshing: false,
      levelInfo: null
    };
  },

  computed: {
    dimensionList() {
      const dims = (this.levelInfo && this.levelInfo.dimensions) || {};
      return Object.keys(dims).map((key) => ({
        key,
        label: dims[key].label || key,
        score: Math.max(0, Math.min(100, Math.round(dims[key].score || 0))),
        detail: dims[key].detail || ''
      }));
    }
  },

  onLoad() {
    this.fetchLevel();
  },

  methods: {
    async fetchLevel() {
      try {
        const res = await merchantApi.getLevel();
        this.levelInfo = res || null;
      } catch (err) {
        console.warn('加载考核数据失败:', err);
        this.levelInfo = null;
        if (err && err.code !== 404) {
          uni.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
        }
      } finally {
        this.loading = false;
        this.refreshing = false;
      }
    },

    async onRefresh() {
      this.refreshing = true;
      await this.fetchLevel();
    },

    dimColor(score) {
      if (score >= 80) return '#07C160';
      if (score >= 60) return '#FFB300';
      return '#FF6B35';
    }
  }
};
</script>

<style lang="scss" scoped>
.review-page {
  min-height: 100vh;
  background: #F5F5F5;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  color: #999;
  font-size: 28rpx;
}

.level-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56rpx 40rpx 40rpx;
  background: linear-gradient(135deg, #1B3A6B, #2C5BA3);
  border-bottom-left-radius: 40rpx;
  border-bottom-right-radius: 40rpx;

  .level-badge {
    width: 120rpx;
    height: 120rpx;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    border: 4rpx solid rgba(255, 255, 255, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16rpx;

    text {
      font-size: 40rpx;
      font-weight: 800;
      color: #FFFFFF;
    }

    &.level-3, &.level-4, &.level-5 {
      background: linear-gradient(135deg, #F6C453, #E8A93B);
      border-color: #FFE9B8;
    }
  }

  .level-name {
    font-size: 34rpx;
    font-weight: 700;
    color: #FFFFFF;
  }

  .level-score {
    font-size: 26rpx;
    color: rgba(255, 255, 255, 0.75);
    margin-top: 8rpx;
  }

  .progress-wrap {
    width: 100%;
    margin-top: 32rpx;

    .progress-track {
      height: 14rpx;
      background: rgba(255, 255, 255, 0.18);
      border-radius: 8rpx;
      overflow: hidden;

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #FFD54F, #FFB300);
        border-radius: 8rpx;
        transition: width 0.4s ease;
      }
    }

    .progress-meta {
      display: flex;
      justify-content: space-between;
      margin-top: 12rpx;
      font-size: 22rpx;
      color: rgba(255, 255, 255, 0.8);
    }
  }
}

.commission-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 24rpx;
  padding: 28rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

  .commission-left {
    .commission-label {
      font-size: 24rpx;
      color: #999;
      display: block;
    }

    .commission-value {
      font-size: 44rpx;
      font-weight: 800;
      color: #FF6B35;
      margin-top: 8rpx;
      display: block;
    }
  }

  .commission-right {
    display: flex;
    align-items: center;
    gap: 12rpx;

    .commission-hint {
      font-size: 22rpx;
      color: #999;
    }

    .commission-icon {
      font-size: 44rpx;
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
    font-size: 30rpx;
    font-weight: 700;
    color: #1A1A1A;
    margin-bottom: 24rpx;
  }
}

.dim-row {
  margin-bottom: 28rpx;

  &:last-child {
    margin-bottom: 0;
  }

  .dim-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .dim-label {
      font-size: 28rpx;
      font-weight: 500;
      color: #1A1A1A;
    }

    .dim-score {
      font-size: 26rpx;
      font-weight: 700;
      color: #07C160;
    }
  }

  .dim-track {
    height: 12rpx;
    background: #F0F0F0;
    border-radius: 6rpx;
    margin: 12rpx 0 8rpx;
    overflow: hidden;

    .dim-fill {
      height: 100%;
      border-radius: 6rpx;
      transition: width 0.4s ease;
    }
  }

  .dim-detail {
    font-size: 22rpx;
    color: #999;
  }
}

.rule-row {
  display: flex;
  align-items: center;
  padding: 18rpx 0;
  border-bottom: 1rpx solid #F0F0F0;

  &:last-child {
    border-bottom: none;
  }

  .rule-level {
    flex: 1;
    font-size: 26rpx;
    color: #1A1A1A;
    font-weight: 500;
  }

  .rule-score {
    flex: 1;
    font-size: 24rpx;
    color: #666;
  }

  .rule-rate {
    font-size: 24rpx;
    color: #FF6B35;
    font-weight: 600;
  }
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

.bottom-placeholder {
  height: 60rpx;
}
</style>
