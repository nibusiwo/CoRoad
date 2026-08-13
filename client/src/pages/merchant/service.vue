<template>
  <view class="service-page">
    <scroll-view class="page-scroll" scroll-y>
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-else-if="form">
        <!-- 服务类型 -->
        <view class="section-card">
          <view class="section-title">服务类型</view>
          <view class="toggle-row">
            <view class="toggle-left">
              <text class="toggle-icon">🔧</text>
              <view class="toggle-text">
                <text class="toggle-name">维修服务</text>
                <text class="toggle-desc">提供车辆维修、保养</text>
              </view>
            </view>
            <switch :checked="form.service_scope.repair" color="#07C160" @change="form.service_scope.repair = $event.detail.value" />
          </view>
          <view class="toggle-row">
            <view class="toggle-left">
              <text class="toggle-icon">🆘</text>
              <view class="toggle-text">
                <text class="toggle-name">救援服务</text>
                <text class="toggle-desc">提供道路救援、拖车</text>
              </view>
            </view>
            <switch :checked="form.service_scope.rescue" color="#07C160" @change="form.service_scope.rescue = $event.detail.value" />
          </view>
        </view>

        <!-- 服务范围 -->
        <view class="section-card">
          <view class="section-title">服务范围</view>
          <textarea
            v-model="serviceAreasText"
            class="areas-input"
            placeholder="用逗号分隔，如：成都市区,都江堰,318国道沿线"
            maxlength="200"
          />
          <view class="input-hint">多个区域用英文或中文逗号分隔</view>
        </view>

        <!-- 营业时间 -->
        <view class="section-card">
          <view class="section-title">营业时间</view>
          <view class="time-row">
            <view class="time-item">
              <text class="time-label">开始</text>
              <picker mode="time" :value="form.business_hours.open || '08:00'" @change="form.business_hours.open = $event.detail.value">
                <view class="time-value">{{ form.business_hours.open || '08:00' }}</view>
              </picker>
            </view>
            <text class="time-sep">至</text>
            <view class="time-item">
              <text class="time-label">结束</text>
              <picker mode="time" :value="form.business_hours.close || '22:00'" @change="form.business_hours.close = $event.detail.value">
                <view class="time-value">{{ form.business_hours.close || '22:00' }}</view>
              </picker>
            </view>
          </view>
        </view>

        <!-- 联系方式 -->
        <view class="section-card">
          <view class="section-title">联系方式</view>
          <view class="form-item">
            <text class="form-label">救援电话</text>
            <input v-model="form.phone" class="form-input" type="number" placeholder="救援联系电话" maxlength="11" />
          </view>
          <view class="form-item">
            <text class="form-label">地址</text>
            <input v-model="form.address" class="form-input" placeholder="服务地址" maxlength="100" />
          </view>
          <view class="form-item">
            <text class="form-label">服务说明</text>
            <textarea v-model="form.description" class="form-textarea" placeholder="服务范围、救援响应时间等说明" maxlength="300" />
          </view>
        </view>

        <view class="save-bar safe-area-bottom">
          <view class="save-btn" :class="{ disabled: saving }" @click="save">
            <text>{{ saving ? '保存中...' : '保存设置' }}</text>
          </view>
        </view>
      </template>
    </scroll-view>
  </view>
</template>

<script>
import { merchantApi } from '@/utils/api.js';

export default {
  data() {
    return {
      loading: true,
      saving: false,
      form: null,
      serviceAreasText: ''
    };
  },

  onLoad() {
    this.fetchMerchant();
  },

  methods: {
    async fetchMerchant() {
      try {
        const res = await merchantApi.getMyMerchant();
        const m = res.merchant || res;
        const scope = m.service_scope || {};
        let scopeObj = scope;
        if (typeof scope === 'string') {
          try { scopeObj = JSON.parse(scope); } catch { scopeObj = {}; }
        }
        let hours = m.business_hours || {};
        if (typeof hours === 'string') {
          try { hours = JSON.parse(hours); } catch { hours = {}; }
        }
        this.form = {
          service_scope: {
            repair: !!scopeObj.repair,
            rescue: !!scopeObj.rescue,
            areas: Array.isArray(scopeObj.areas) ? scopeObj.areas : []
          },
          business_hours: { open: hours.open || '08:00', close: hours.close || '22:00' },
          phone: m.phone || '',
          address: m.address || '',
          description: m.description || ''
        };
        this.serviceAreasText = (this.form.service_scope.areas || []).join(',');
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },

    async save() {
      if (this.saving) return;
      this.saving = true;
      try {
        const areas = this.serviceAreasText
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean);
        await merchantApi.updateMerchant({
          service_scope: { ...this.form.service_scope, areas },
          business_hours: this.form.business_hours,
          phone: this.form.phone,
          address: this.form.address,
          description: this.form.description
        });
        uni.showToast({ title: '保存成功', icon: 'success' });
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.service-page {
  min-height: 100vh;
  background: #F5F5F5;
}

.loading-state {
  text-align: center;
  padding: 120rpx 0;
  color: #999;
  font-size: 28rpx;
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

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 0;
  border-bottom: 1rpx solid #F5F5F5;

  &:last-child {
    border-bottom: none;
  }

  .toggle-left {
    display: flex;
    align-items: center;
    gap: 16rpx;

    .toggle-icon {
      font-size: 40rpx;
    }

    .toggle-text {
      .toggle-name {
        font-size: 28rpx;
        font-weight: 500;
        color: #1A1A1A;
        display: block;
      }

      .toggle-desc {
        font-size: 22rpx;
        color: #999;
        display: block;
      }
    }
  }
}

.areas-input,
.form-textarea {
  width: 100%;
  min-height: 140rpx;
  padding: 20rpx;
  background: #F5F5F5;
  border-radius: 16rpx;
  font-size: 26rpx;
  box-sizing: border-box;
}

.input-hint {
  font-size: 22rpx;
  color: #BBB;
  margin-top: 10rpx;
}

.time-row {
  display: flex;
  align-items: center;
  gap: 20rpx;

  .time-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8rpx;

    .time-label {
      font-size: 22rpx;
      color: #999;
    }

    .time-value {
      height: 80rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #F5F5F5;
      border-radius: 16rpx;
      font-size: 30rpx;
      color: #1A1A1A;
    }
  }

  .time-sep {
    color: #999;
  }
}

.form-item {
  margin-bottom: 20rpx;

  .form-label {
    font-size: 26rpx;
    color: #666;
    display: block;
    margin-bottom: 10rpx;
  }

  .form-input {
    height: 80rpx;
    padding: 0 20rpx;
    background: #F5F5F5;
    border-radius: 16rpx;
    font-size: 28rpx;
  }
}

.save-bar {
  padding: 16rpx 24rpx;
  background: #FFFFFF;
  box-shadow: 0 -2rpx 16rpx rgba(0, 0, 0, 0.04);

  .save-btn {
    height: 88rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #07C160, #05A84E);
    border-radius: 44rpx;
    color: #FFFFFF;
    font-size: 30rpx;
    font-weight: 600;

    &.disabled {
      opacity: 0.6;
    }
  }
}
</style>
