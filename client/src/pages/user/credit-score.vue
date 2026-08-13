<template>
  <view class="credit-page">
    <scroll-view class="page-scroll" scroll-y>
      <!-- 分数总览 -->
      <view class="score-hero">
        <view class="score-ring">
          <view class="score-inner">
            <text class="score-value">{{ credit }}</text>
            <text class="score-max">/ 5.0</text>
          </view>
        </view>
        <text class="score-label">{{ levelLabel }}</text>
        <text class="score-desc">信用分反映你在平台上的履约与互助表现</text>
      </view>

      <!-- 维度明细 -->
      <view class="section-card">
        <view class="section-title">信用维度</view>
        <view v-for="item in factors" :key="item.key" class="factor-row">
          <view class="factor-left">
            <text class="factor-icon">{{ item.icon }}</text>
            <view class="factor-text-wrap">
              <text class="factor-name">{{ item.name }}</text>
              <text class="factor-desc">{{ item.desc }}</text>
            </view>
          </view>
          <text class="factor-score" :class="item.status">{{ item.value }}</text>
        </view>
      </view>

      <!-- 说明 -->
      <view class="tips-card">
        <text class="tips-title">如何提升信用分？</text>
        <view class="tip-item">
          <text class="tip-dot">•</text>
          <text class="tip-text">完成车主认证并保持资料真实</text>
        </view>
        <view class="tip-item">
          <text class="tip-dot">•</text>
          <text class="tip-text">按时出发、按约同行，获得队友好评</text>
        </view>
        <view class="tip-item">
          <text class="tip-dot">•</text>
          <text class="tip-text">参与互助救援、分享路况等正向行为</text>
        </view>
        <view class="tip-item">
          <text class="tip-dot">•</text>
          <text class="tip-text">避免爽约、恶意举报等失信行为</text>
        </view>
      </view>

      <view class="bottom-placeholder"></view>
    </scroll-view>
  </view>
</template>

<script>
import { userApi } from '@/utils/api.js';

export default {
  data() {
    return {
      credit: '4.8',
      certified: false,
      tripCount: 0,
      mutualCount: 0
    };
  },

  computed: {
    levelLabel() {
      const c = parseFloat(this.credit) || 0;
      if (c >= 4.9) return '🌟 优秀信用车主';
      if (c >= 4.5) return '👍 良好信用车主';
      if (c >= 4.0) return '🙂 一般信用车主';
      return '⚠️ 信用待提升';
    },

    factors() {
      const certified = this.certified ? '已完成' : '未认证';
      return [
        { key: 'cert', icon: '🔒', name: '车主认证', desc: '行驶证实名认证', value: certified, status: this.certified ? 'positive' : 'neutral' },
        { key: 'trip', icon: '🚗', name: '出行履约', desc: `已完成 ${this.tripCount} 次行程`, value: this.tripCount > 0 ? '良好' : '暂无', status: this.tripCount > 0 ? 'positive' : 'neutral' },
        { key: 'mutual', icon: '🤝', name: '互助记录', desc: `参与 ${this.mutualCount} 次组队互助`, value: this.mutualCount > 0 ? '良好' : '暂无', status: this.mutualCount > 0 ? 'positive' : 'neutral' },
        { key: 'base', icon: '📝', name: '基础信用', desc: '注册与资料完整度', value: '良好', status: 'positive' }
      ];
    }
  },

  onLoad() {
    this.fetchData();
  },

  methods: {
    async fetchData() {
      try {
        const profile = await userApi.getProfile();
        if (profile) {
          this.credit = profile.credit || profile.creditScore || '4.8';
          this.certified = profile.isCertified === 2 || profile.certified === 2 || profile.isCertified === true;
          this.tripCount = profile.tripCount || profile.completedTrips || 0;
          this.mutualCount = profile.mutualCount || profile.teamCount || 0;
        }
      } catch (err) {
        console.warn('加载信用分数据失败:', err);
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.credit-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #E8F5E9 0%, #F5F5F5 260rpx);
}

.page-scroll {
  padding-bottom: 60rpx;
}

.score-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64rpx 48rpx 48rpx;

  .score-ring {
    width: 220rpx;
    height: 220rpx;
    min-width: 220rpx;
    min-height: 220rpx;
    max-width: 220rpx;
    max-height: 220rpx;
    flex-shrink: 0;
    box-sizing: border-box;
    border-radius: 50%;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.92);
    border: 10rpx solid #07C160;
    box-shadow: 0 8rpx 32rpx rgba(7, 193, 96, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;

    .score-inner {
      display: flex;
      align-items: baseline;
      justify-content: center;
      padding-top: 8rpx;

      .score-value {
        font-size: 64rpx;
        font-weight: 800;
        color: #1A1A1A;
      }

      .score-max {
        font-size: 24rpx;
        color: #999;
        margin-left: 4rpx;
      }
    }
  }

  .score-label {
    margin-top: 24rpx;
    font-size: 32rpx;
    font-weight: 700;
    color: #07C160;
  }

  .score-desc {
    margin-top: 12rpx;
    font-size: 24rpx;
    color: #999;
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
    margin-bottom: 20rpx;
  }
}

.factor-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #F0F0F0;

  &:last-child {
    border-bottom: none;
  }

  .factor-left {
    display: flex;
    align-items: center;
    gap: 16rpx;

    .factor-icon {
      font-size: 40rpx;
    }

    .factor-text-wrap {
      .factor-name {
        font-size: 28rpx;
        font-weight: 500;
        color: #1A1A1A;
        display: block;
      }

      .factor-desc {
        font-size: 22rpx;
        color: #999;
        margin-top: 4rpx;
        display: block;
      }
    }
  }

  .factor-score {
    font-size: 26rpx;
    font-weight: 600;

    &.positive {
      color: #07C160;
    }

    &.neutral {
      color: #999;
    }
  }
}

.tips-card {
  margin: 0 24rpx;
  background: #FFF8E1;
  border-radius: 24rpx;
  padding: 28rpx;

  .tips-title {
    font-size: 28rpx;
    font-weight: 700;
    color: #B7791F;
    margin-bottom: 16rpx;
    display: block;
  }

  .tip-item {
    display: flex;
    gap: 12rpx;
    padding: 8rpx 0;

    .tip-dot {
      color: #FFB300;
    }

    .tip-text {
      font-size: 24rpx;
      color: #7A5B1A;
      flex: 1;
    }
  }
}

.bottom-placeholder {
  height: 60rpx;
}
</style>
