<template>
  <view class="settlement-page">
    <scroll-view class="page-scroll" scroll-y :refresher-enabled="true" :refresher-triggered="refreshing" @refresherrefresh="onRefresh">
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-if="!loading">
        <!-- ==================== Earnings Summary ==================== -->
        <view class="earnings-card">
          <view class="earnings-bg"></view>
          <view class="earnings-content">
            <view class="earnings-item main">
              <text class="earnings-label">累计收入</text>
              <text class="earnings-value large">¥{{ summary.totalIncome || 0 }}</text>
            </view>
            <view class="earnings-divider"></view>
            <view class="earnings-sub-row">
              <view class="earnings-item">
                <text class="earnings-label">本月收入</text>
                <text class="earnings-value">¥{{ summary.monthIncome || 0 }}</text>
              </view>
              <view class="earnings-item">
                <text class="earnings-label">待结算</text>
                <text class="earnings-value pending">¥{{ summary.pendingSettlement || 0 }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- ==================== Month Filter ==================== -->
        <view class="filter-row">
          <picker mode="date" fields="month" :value="currentMonth" @change="onMonthChange">
            <view class="filter-picker">
              <text class="filter-text">{{ currentMonth || '选择月份' }}</text>
              <text class="filter-arrow">▼</text>
            </view>
          </picker>
        </view>

        <!-- ==================== Settlement Records ==================== -->
        <view v-if="records.length === 0" class="empty-state-wrap">
          <EmptyState icon="💰" title="暂无结算记录" :description="currentMonth ? '该月份暂无结算记录' : '请选择月份查看结算记录'" />
        </view>

        <view v-for="record in records" :key="record.id" class="record-card">
          <!-- Order Info -->
          <view class="record-header">
            <text class="record-order-no">订单: {{ record.orderNo || '--' }}</text>
            <view class="record-status" :class="{ settled: record.status === 'settled' }">
              <text>{{ record.status === 'settled' ? '已结算' : '待结算' }}</text>
            </view>
          </view>

          <view class="record-body">
            <view class="record-row">
              <text class="record-label">订单金额</text>
              <text class="record-value">¥{{ record.orderAmount || 0 }}</text>
            </view>
            <view class="record-row">
              <text class="record-label">佣金率</text>
              <text class="record-value">{{ record.commissionRate || 0 }}%</text>
            </view>
            <view class="record-row">
              <text class="record-label">佣金金额</text>
              <text class="record-value deduction">-¥{{ record.commissionAmount || 0 }}</text>
            </view>
            <view class="record-row total-row">
              <text class="record-label">结算金额</text>
              <text class="record-value settlement">¥{{ record.settlementAmount || 0 }}</text>
            </view>
          </view>

          <view class="record-footer" v-if="record.settlementDate">
            <text class="record-date">结算日期: {{ formatDate(record.settlementDate) }}</text>
          </view>
          <view class="record-footer" v-else-if="record.status !== 'settled'">
            <text class="record-hint">预计结算日期: {{ formatDate(record.expectedDate) || 'T+7' }}</text>
          </view>
        </view>

        <view class="bottom-placeholder safe-area-bottom"></view>
      </template>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import api from '@/utils/api.js';
import EmptyState from '@/components/EmptyState.vue';

// ---- State ----
const loading = ref(true);
const refreshing = ref(false);
const currentMonth = ref('');
const summary = reactive({
  totalIncome: 0,
  monthIncome: 0,
  pendingSettlement: 0
});
const records = ref([]);

// ---- Methods ----
function formatDate(timeStr) {
  if (!timeStr) return '--';
  const d = new Date(timeStr);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return Y + '-' + M + '-' + D;
}

function onMonthChange(e) {
  currentMonth.value = e.detail.value;
  fetchRecords();
}

async function fetchRecords() {
  try {
    const params = {};
    if (currentMonth.value) {
      params.month = currentMonth.value;
    }
    const res = await api.merchant.getSettlements(params);

    if (res.summary) {
      Object.assign(summary, res.summary);
    }
    // Also fetch summary if not in same response
    if (!res.summary) {
      try {
        const summaryRes = await api.merchant.getSettlements({ ...params, summary: true });
        Object.assign(summary, summaryRes.summary || {});
      } catch (e) { /* ignore */ }
    }

    records.value = res.list || res.records || res || [];
  } catch (err) {
    console.error('Failed to fetch settlements:', err);
    records.value = [];
  }
}

async function onRefresh() {
  refreshing.value = true;
  await fetchRecords();
  refreshing.value = false;
}

// ---- Lifecycle ----
onShow(async () => {
  loading.value = true;
  // Default to current month
  const now = new Date();
  currentMonth.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  await fetchRecords();
  loading.value = false;
});
</script>

<style lang="scss" scoped>
.settlement-page {
  height: 100vh;
  background-color: #F5F5F5;
  display: flex;
  flex-direction: column;
}

.page-scroll { flex: 1; }

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: 28rpx;
  color: #999;
}

// ===== Earnings Card =====
.earnings-card {
  margin: 20rpx 24rpx;
  border-radius: 24rpx;
  overflow: hidden;
  position: relative;
}

.earnings-bg {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: linear-gradient(135deg, #FF6B35, #FF8C5A, #FFA87D);
}

.earnings-content {
  position: relative;
  z-index: 1;
  padding: 32rpx 28rpx;
}

.earnings-item {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  &.main {
    align-items: center;
    margin-bottom: 20rpx;
  }
}

.earnings-label {
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.8);
}

.earnings-value {
  font-size: 34rpx;
  color: #FFFFFF;
  font-weight: 700;
  &.large {
    font-size: 52rpx;
    font-weight: 800;
  }
  &.pending {
    color: #FFD700;
  }
}

.earnings-divider {
  height: 1rpx;
  background-color: rgba(255, 255, 255, 0.2);
  margin-bottom: 20rpx;
}

.earnings-sub-row {
  display: flex;
  .earnings-item {
    flex: 1;
    text-align: center;
  }
}

// ===== Filter =====
.filter-row {
  display: flex;
  justify-content: flex-end;
  padding: 0 24rpx 16rpx;
}

.filter-picker {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx 24rpx;
  background-color: #FFFFFF;
  border-radius: 32rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
  .filter-text { font-size: 24rpx; color: #333; }
  .filter-arrow { font-size: 18rpx; color: #999; }
}

// ===== Empty State =====
.empty-state-wrap {
  padding-top: 60rpx;
}

// ===== Record Card =====
.record-card {
  margin: 16rpx 24rpx;
  background-color: #FFFFFF;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.record-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx 12rpx;
  border-bottom: 1rpx solid #F5F5F5;
  .record-order-no {
    font-size: 24rpx;
    color: #999;
  }
}

.record-status {
  padding: 4rpx 14rpx;
  background-color: #FFF8EB;
  border-radius: 12rpx;
  text { font-size: 22rpx; color: #F5A623; font-weight: 500; }
  &.settled {
    background-color: #E8F8EE;
    text { color: #07C160; }
  }
}

.record-body {
  padding: 12rpx 24rpx 16rpx;
}

.record-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10rpx 0;
  &.total-row {
    padding-top: 14rpx;
    margin-top: 8rpx;
    border-top: 1rpx solid #F0F0F0;
  }
  .record-label { font-size: 24rpx; color: #999; }
  .record-value {
    font-size: 26rpx;
    color: #333;
    font-weight: 500;
    &.deduction { color: #E74C3C; }
    &.settlement { font-size: 30rpx; font-weight: 700; color: #E55D2B; }
  }
}

.record-footer {
  padding: 12rpx 24rpx 20rpx;
  .record-date { font-size: 22rpx; color: #07C160; }
  .record-hint { font-size: 22rpx; color: #bbb; }
}

// ===== Bottom =====
.bottom-placeholder {
  height: 40rpx;
}
</style>
