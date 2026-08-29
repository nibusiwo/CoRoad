<template>
  <view class="create-page">
    <!-- 步骤指示器 -->
    <view class="step-indicator">
      <view class="step-track">
        <view class="track-bg"></view>
        <view class="track-fill" :style="{ width: ((currentStep - 1) / 2 * 100) + '%' }"></view>
      </view>
      <view class="step-labels">
        <view
          v-for="(step, index) in steps"
          :key="index"
          class="step-item"
          :class="{
            active: currentStep >= index + 1,
            current: currentStep === index + 1
          }"
          @click="goToStep(index + 1)"
        >
          <view class="step-dot" :class="{ filled: currentStep > index + 1 }">
            <text v-if="currentStep > index + 1">✓</text>
            <text v-else>{{ index + 1 }}</text>
          </view>
          <text class="step-name">{{ step }}</text>
        </view>
      </view>
    </view>

    <!-- 表单区域 -->
    <scroll-view class="form-scroll" scroll-y>
      <!-- ========== Step 1: 画路线 ========== -->
      <view v-if="currentStep === 1" class="step-content">
        <view class="form-section">
          <text class="section-title">出发地点</text>
          <view class="location-input" @click="chooseLocation('start')">
            <text class="loc-icon">📍</text>
            <text class="loc-text" :class="{ placeholder: !formData.startPoint }">
              {{ formData.startPoint || '点击选择出发地点' }}
            </text>
            <text class="loc-arrow">›</text>
          </view>
        </view>

        <view class="form-section">
          <text class="section-title">目的地点</text>
          <view class="location-input" @click="chooseLocation('end')">
            <text class="loc-icon">🏁</text>
            <text class="loc-text" :class="{ placeholder: !formData.endPoint }">
              {{ formData.endPoint || '点击选择目的地点' }}
            </text>
            <text class="loc-arrow">›</text>
          </view>
        </view>

        <!-- 途经点 -->
        <view class="form-section">
          <view class="section-header-row">
            <text class="section-title">途经点（可选）</text>
            <text class="section-count">{{ formData.waypoints.length }}/5</text>
          </view>

          <view
            v-for="(wp, index) in formData.waypoints"
            :key="index"
            class="waypoint-item"
          >
            <view class="wp-num">{{ index + 1 }}</view>
            <view class="location-input wp-input" @click="chooseWaypoint(index)">
              <text class="loc-text" :class="{ placeholder: !wp.name }">
                {{ wp.name || '点击选择途经点' }}
              </text>
            </view>
            <view class="wp-remove" @click="removeWaypoint(index)">
              <text>✕</text>
            </view>
          </view>

          <view
            v-if="formData.waypoints.length < 5"
            class="add-waypoint"
            @click="addWaypoint"
          >
            <text class="add-icon">＋</text>
            <text class="add-text">添加途经点</text>
          </view>
        </view>

        <!-- 路线预览 -->
        <view v-if="formData.startPoint || formData.endPoint" class="form-section">
          <text class="section-title">路线预览</text>
          <view class="route-preview">
            <view class="route-line">
              <view class="route-dot start-dot"></view>
              <view class="route-dash"></view>
              <view
                v-for="(wp, index) in formData.waypoints"
                :key="'d' + index"
                class="route-dot wp-dot"
              ></view>
              <view class="route-dash"></view>
              <view class="route-dot end-dot"></view>
            </view>
            <view class="route-map-thumb">
              <text class="map-placeholder">路线地图预览区域</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ========== Step 2: 行程详情 ========== -->
      <view v-if="currentStep === 2" class="step-content">
        <!-- 标题 -->
        <view class="form-section">
          <text class="section-title">行程标题 <text class="required">*</text></text>
          <input
            v-model="formData.title"
            class="form-input"
            placeholder="例如：川西小环线5日游"
            maxlength="30"
          />
        </view>

        <!-- 出发时间 -->
        <view class="form-section">
          <text class="section-title">出发时间 <text class="required">*</text></text>
          <view class="datetime-wrap">
            <!-- 日期选择 -->
            <picker mode="date" :value="selectedDate" :start="minDate" @change="onDateChange" class="date-picker">
              <view class="picker-box">
                <text class="picker-text" :class="{ placeholder: !selectedDate }">
                  {{ selectedDate ? formatDate(selectedDate) : '选择日期' }}
                </text>
                <text class="picker-icon">📅</text>
              </view>
            </picker>
            <!-- 时间选择 -->
            <picker mode="time" :value="selectedTime" @change="onTimeChange" class="time-picker">
              <view class="picker-box">
                <text class="picker-text" :class="{ placeholder: !selectedTime }">
                  {{ selectedTime || '选择时间' }}
                </text>
                <text class="picker-icon">🕐</text>
              </view>
            </picker>
          </view>
        </view>

        <view class="form-section">
          <text class="section-title">预计天数</text>
          <view class="slider-wrap">
            <slider
              :value="formData.estimatedDays"
              @change="formData.estimatedDays = $event.detail.value"
              :min="1"
              :max="30"
              :step="1"
              active-color="#07C160"
              block-size="20"
              show-value
            />
            <text class="slider-value">{{ formData.estimatedDays }} 天</text>
          </view>
        </view>

        <view class="form-section">
          <text class="section-title">日均里程 (km)</text>
          <input
            v-model="formData.dailyDistance"
            class="form-input"
            type="number"
            placeholder="例如：300"
          />
        </view>

        <!-- 行程深度 -->
        <view class="form-section">
          <text class="section-title">行程深度</text>
          <view class="option-group">
            <view
              v-for="opt in depthOptions"
              :key="opt.value"
              class="option-item"
              :class="{ selected: formData.depth === opt.value }"
              @click="formData.depth = opt.value"
            >
              <text class="option-label">{{ opt.label }}</text>
              <text class="option-desc">{{ opt.desc }}</text>
            </view>
          </view>
        </view>

        <!-- 标签选择 -->
        <view class="form-section">
          <text class="section-title">行程标签（多选）</text>
          <view class="tag-grid">
            <view
              v-for="tag in tagOptions"
              :key="tag"
              class="tag-item"
              :class="{ selected: formData.tags.includes(tag) }"
              @click="toggleTag(tag)"
            >
              <text>{{ tag }}</text>
            </view>
          </view>
        </view>

        <!-- 最大车辆 -->
        <view class="form-section">
          <text class="section-title">最大车辆数</text>
          <view class="slider-wrap">
            <slider
              :value="formData.maxCars"
              @change="formData.maxCars = $event.detail.value"
              :min="1"
              :max="20"
              :step="1"
              active-color="#07C160"
              block-size="20"
              show-value
            />
            <text class="slider-value">{{ formData.maxCars }} 辆</text>
          </view>
        </view>

        <!-- 隐私 -->
        <view class="form-section">
          <view class="switch-row">
            <view class="switch-info">
              <text class="switch-label">公开行程</text>
              <text class="switch-desc">{{ formData.isPublic ? '他人可在附近行程中看到' : '仅分享链接可见' }}</text>
            </view>
            <switch
              :checked="formData.isPublic"
              color="#07C160"
              @change="formData.isPublic = $event.detail.value"
            />
          </view>
        </view>

        <!-- 沿途打算 -->
        <view class="form-section">
          <text class="section-title">沿途打算</text>
          <view class="checkbox-group">
            <view
              v-for="opt in planOptions"
              :key="opt"
              class="checkbox-item"
              @click="togglePlan(opt)"
            >
              <view class="checkbox-box" :class="{ checked: formData.plans.includes(opt) }">
                <text v-if="formData.plans.includes(opt)">✓</text>
              </view>
              <text class="checkbox-label">{{ opt }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- ========== Step 3: 发布 ========== -->
      <view v-if="currentStep === 3" class="step-content">
        <view class="review-card">
          <text class="review-title">行程预览</text>

          <!-- 路线 -->
          <view class="review-section">
            <text class="review-label">路线</text>
            <view class="review-route">
              <text class="review-route-text">
                {{ formData.startPoint || '???' }}
                <text v-if="formData.waypoints.length">
                  <text v-for="wp in formData.waypoints" :key="wp.name"> → {{ wp.name }}</text>
                </text>
                → {{ formData.endPoint || '???' }}
              </text>
            </view>
          </view>

          <!-- 基本信息 -->
          <view class="review-section">
            <text class="review-label">基本信息</text>
            <view class="review-grid">
              <view class="review-item">
                <text class="ri-label">标题</text>
                <text class="ri-value">{{ formData.title || '未设置' }}</text>
              </view>
              <view class="review-item">
                <text class="ri-label">出发</text>
                <text class="ri-value">{{ formData.departureTime || '未设置' }}</text>
              </view>
              <view class="review-item">
                <text class="ri-label">天数</text>
                <text class="ri-value">{{ formData.estimatedDays }} 天</text>
              </view>
              <view class="review-item">
                <text class="ri-label">日里程</text>
                <text class="ri-value">{{ formData.dailyDistance }} km</text>
              </view>
              <view class="review-item">
                <text class="ri-label">深度</text>
                <text class="ri-value">{{ depthLabel(formData.depth) }}</text>
              </view>
              <view class="review-item">
                <text class="ri-label">车辆</text>
                <text class="ri-value">最多 {{ formData.maxCars }} 辆</text>
              </view>
            </view>
          </view>

          <!-- 标签 -->
          <view v-if="formData.tags.length" class="review-section">
            <text class="review-label">标签</text>
            <view class="review-tags">
              <text v-for="tag in formData.tags" :key="tag" class="review-tag">{{ tag }}</text>
            </view>
          </view>

          <!-- 沿途打算 -->
          <view v-if="formData.plans.length" class="review-section">
            <text class="review-label">沿途打算</text>
            <text class="review-value">{{ formData.plans.join(' / ') }}</text>
          </view>

          <!-- 隐私 -->
          <view class="review-section">
            <text class="review-label">可见性</text>
            <text class="review-value">{{ formData.isPublic ? '公开行程' : '私密行程' }}</text>
          </view>
        </view>
      </view>

      <!-- 底部占位 -->
      <view class="form-bottom"></view>
    </scroll-view>

    <!-- 底部按钮 -->
    <view class="bottom-bar safe-area-bottom">
      <view
        v-if="currentStep > 1"
        class="btn prev-btn"
        @click="prevStep"
      >
        <text>上一步</text>
      </view>
      <view
        v-if="currentStep < 3"
        class="btn next-btn"
        @click="nextStep"
      >
        <text>下一步</text>
      </view>
      <view
        v-if="currentStep === 3"
        class="btn submit-btn"
        :class="{ disabled: submitting }"
        @click="submitTrip"
      >
        <text>{{ submitting ? '发布中...' : '发布行程' }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { useTripStore } from '@/store/trip.js';

export default {
  data() {
    return {
      currentStep: 1,
      steps: ['画路线', '行程详情', '发布'],
      submitting: false,

      formData: {
        // Step 1
        startPoint: '',
        startLng: null,
        startLat: null,
        endPoint: '',
        endLng: null,
        endLat: null,
        waypoints: [],

        // Step 2
        title: '',
        departureTime: '',
        estimatedDays: 3,
        dailyDistance: '',
        depth: 'medium',
        tags: [],
        maxCars: 5,
        isPublic: true,
        plans: []
      },

      // 日期时间选择
      selectedDate: '',      // YYYY-MM-DD
      selectedTime: '',      // HH:mm
      minDate: '',           // 最小日期（今天）

      // 行程深度选项
      depthOptions: [
        { value: 'shallow', label: '浅', desc: '仅同行' },
        { value: 'medium', label: '中', desc: 'AA拼桌' },
        { value: 'deep', label: '深', desc: '全程同行' }
      ],

      // 标签选项
      tagOptions: [
        '拍照', '美食', 'AA住', '互助',
        '应急药箱', '对讲机', '露营', '钓鱼', '观星'
      ],

      // 沿途打算选项
      planOptions: ['AA', '拼桌', '同逛', '互助']
    };
  },

  computed: {
    tripStore() {
      return useTripStore();
    }
  },

  onLoad(options) {
    // 如果是编辑已有行程
    if (options.tripId) {
      this.loadExistingTrip(options.tripId);
    }
    // 如果是编辑草稿
    if (options.draftId) {
      this.loadDraft(options.draftId);
    }

    // 初始化日期选择器
    this.initDatePicker();
  },

  methods: {
    /** 初始化日期选择器 */
    initDatePicker() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      
      this.minDate = `${year}-${month}-${day}`;
    },

    /** 日期格式化显示 */
    formatDate(dateStr) {
      if (!dateStr) return '';
      const [year, month, day] = dateStr.split('-');
      return `${month}月${day}日`;
    },

    /** 日期选择变化 */
    onDateChange(e) {
      this.selectedDate = e.detail.value;
      this.updateDepartureTime();
    },

    /** 时间选择变化 */
    onTimeChange(e) {
      this.selectedTime = e.detail.value;
      this.updateDepartureTime();
    },

    /** 更新出发时间 */
    updateDepartureTime() {
      if (this.selectedDate && this.selectedTime) {
        this.formData.departureTime = `${this.selectedDate} ${this.selectedTime}`;
      } else {
        this.formData.departureTime = '';
      }
    },

    /** 选择地点（出发/目的） */
    chooseLocation(type) {
      uni.chooseLocation({
        success: (res) => {
          if (type === 'start') {
            this.formData.startPoint = res.name || res.address;
            this.formData.startLng = res.longitude;
            this.formData.startLat = res.latitude;
          } else {
            this.formData.endPoint = res.name || res.address;
            this.formData.endLng = res.longitude;
            this.formData.endLat = res.latitude;
          }
        }
      });
    },

    /** 选择途经点 */
    chooseWaypoint(index) {
      uni.chooseLocation({
        success: (res) => {
          this.formData.waypoints[index] = {
            name: res.name || res.address,
            lng: res.longitude,
            lat: res.latitude
          };
        }
      });
    },

    /** 添加途经点 */
    addWaypoint() {
      if (this.formData.waypoints.length >= 5) {
        uni.showToast({ title: '最多添加5个途经点', icon: 'none' });
        return;
      }
      this.formData.waypoints.push({ name: '', lng: null, lat: null });
    },

    /** 移除途经点 */
    removeWaypoint(index) {
      this.formData.waypoints.splice(index, 1);
    },

    /** 切换标签 */
    toggleTag(tag) {
      const idx = this.formData.tags.indexOf(tag);
      if (idx > -1) {
        this.formData.tags.splice(idx, 1);
      } else {
        this.formData.tags.push(tag);
      }
    },

    /** 切换沿途打算 */
    togglePlan(plan) {
      const idx = this.formData.plans.indexOf(plan);
      if (idx > -1) {
        this.formData.plans.splice(idx, 1);
      } else {
        this.formData.plans.push(plan);
      }
    },

    /** 前一步 */
    prevStep() {
      if (this.currentStep > 1) {
        this.currentStep--;
      }
    },

    /** 下一步（含校验） */
    nextStep() {
      if (!this.validateStep(this.currentStep)) return;

      if (this.currentStep < 3) {
        this.currentStep++;
      }
    },

    /** 跳转到指定步骤 */
    goToStep(step) {
      // 只能回退
      if (step < this.currentStep) {
        this.currentStep = step;
      }
    },

    /** 校验步骤 */
    validateStep(step) {
      if (step === 1) {
        if (!this.formData.startPoint) {
          uni.showToast({ title: '请选择出发地点', icon: 'none' });
          return false;
        }
        if (!this.formData.endPoint) {
          uni.showToast({ title: '请选择目的地点', icon: 'none' });
          return false;
        }
      }

      if (step === 2) {
        if (!this.formData.title.trim()) {
          uni.showToast({ title: '请输入行程标题', icon: 'none' });
          return false;
        }
        if (!this.formData.departureTime) {
          uni.showToast({ title: '请选择出发时间', icon: 'none' });
          return false;
        }
      }

      return true;
    },

    /** 提交发布 */
    async submitTrip() {
      if (this.submitting) return;
      this.submitting = true;

      try {
        const tripData = {
          title: this.formData.title,
          departure_time: this.formData.departureTime,
          estimated_days: this.formData.estimatedDays,
          daily_distance: Number(this.formData.dailyDistance) || 0,
          depth: this.formData.depth,
          tags: this.formData.tags,
          max_cars: this.formData.maxCars,
          is_public: this.formData.isPublic,
          start_point: {
            name: this.formData.startPoint,
            lng: this.formData.startLng,
            lat: this.formData.startLat
          },
          end_point: {
            name: this.formData.endPoint,
            lng: this.formData.endLng,
            lat: this.formData.endLat
          },
          waypoints: this.formData.waypoints.filter((wp) => wp.name)
        };

        const result = await this.tripStore.createTrip(tripData);

        uni.showToast({ title: '发布成功！', icon: 'success' });

        const tripId = result.trip_id || result.id;

        setTimeout(() => {
          uni.redirectTo({
            url: '/pages/trip/detail?tripId=' + tripId
          });
        }, 1500);

      } catch (err) {
        const message = err?.message || err?.errMsg || '发布失败，请重试';
        uni.showToast({ title: message, icon: 'none' });
      } finally {
        this.submitting = false;
      }
    },

    /** 加载已有行程（编辑模式） */
    async loadExistingTrip(tripId) {
      try {
        const trip = await this.tripStore.fetchTripDetail(tripId);
        if (trip) {
          this.formData = {
            ...this.formData,
            startPoint: trip.startPoint || '',
            startLng: trip.startLng || null,
            startLat: trip.startLat || null,
            endPoint: trip.endPoint || '',
            endLng: trip.endLng || null,
            endLat: trip.endLat || null,
            waypoints: trip.waypoints || [],
            title: trip.title || '',
            departureTime: trip.departureTime || '',
            estimatedDays: trip.estimatedDays || 3,
            dailyDistance: String(trip.dailyDistance || ''),
            depth: trip.depth || 'medium',
            tags: trip.tags || [],
            maxCars: trip.maxCars || 5,
            isPublic: trip.isPublic !== undefined ? trip.isPublic : true,
            plans: trip.plans || []
          };
          
          // 解析出发时间
          if (trip.departureTime) {
            const [date, time] = trip.departureTime.split(' ');
            this.selectedDate = date || '';
            this.selectedTime = time || '';
          }
        }
      } catch (err) {
        console.error('加载行程失败:', err);
      }
    },

    /** 加载草稿 */
    async loadDraft(draftId) {
      try {
        const drafts = this.tripStore.draftTrips;
        const draft = drafts.find((d) => d.id === draftId);
        if (draft) {
          this.formData = {
            ...this.formData,
            ...draft,
            dailyDistance: String(draft.dailyDistance || ''),
            tags: draft.tags || [],
            plans: draft.plans || [],
            waypoints: draft.waypoints || []
          };
          
          // 解析出发时间
          if (draft.departureTime) {
            const [date, time] = draft.departureTime.split(' ');
            this.selectedDate = date || '';
            this.selectedTime = time || '';
          }
        }
      } catch (err) {
        console.error('加载草稿失败:', err);
      }
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
  }
};
</script>

<style lang="scss" scoped>
.create-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-bg-white);
}

// 步骤指示器
.step-indicator {
  padding: 24rpx 32rpx;
  background-color: var(--color-bg-white);
  border-bottom: 1rpx solid var(--color-border);

  .step-track {
    position: relative;
    height: 4rpx;
    margin-bottom: 16rpx;

    .track-bg {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 100%;
      background-color: var(--color-divider);
      border-radius: 2rpx;
    }

    .track-fill {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background-color: var(--color-primary);
      border-radius: 2rpx;
      transition: width 0.3s ease;
    }
  }

  .step-labels {
    display: flex;
    justify-content: space-around;

    .step-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8rpx;
      opacity: 0.4;
      transition: opacity 0.2s;

      &.active {
        opacity: 1;
      }

      .step-dot {
        width: 44rpx;
        height: 44rpx;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--color-divider);
        font-size: var(--font-xs);
        color: var(--color-text-hint);
        transition: all 0.2s;

        &.filled {
          background-color: var(--color-primary);
          color: #fff;
        }
      }

      &.current .step-dot {
        background-color: var(--color-primary);
        color: #fff;
      }

      .step-name {
        font-size: var(--font-xs);
        color: var(--color-text-secondary);
      }
    }
  }
}

// 表单滚动区
.form-scroll {
  flex: 1;
  overflow-y: auto;
}

// 步骤内容
.step-content {
  padding: 24rpx;
}

// 表单区域
.form-section {
  margin-bottom: 28rpx;
}

.section-title {
  display: block;
  font-size: var(--font-sm);
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 12rpx;

  .required {
    color: var(--color-danger);
  }
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .section-count {
    font-size: var(--font-xs);
    color: var(--color-text-hint);
  }
}

// 地点输入
.location-input {
  display: flex;
  align-items: center;
  padding: 20rpx 24rpx;
  background-color: var(--color-bg-white);
  border-radius: var(--radius-sm);
  border: 1rpx solid var(--color-border);
  gap: 12rpx;

  .loc-icon {
    font-size: 32rpx;
  }

  .loc-text {
    flex: 1;
    font-size: var(--font-md);
    color: var(--color-text-primary);

    &.placeholder {
      color: var(--color-text-hint);
    }
  }

  .loc-arrow {
    font-size: 32rpx;
    color: var(--color-text-hint);
  }
}

// 途经点
.waypoint-item {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 12rpx;

  .wp-num {
    width: 40rpx;
    height: 40rpx;
    border-radius: 50%;
    background-color: var(--color-primary);
    color: #fff;
    font-size: var(--font-xs);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .wp-input {
    flex: 1;
  }

  .wp-remove {
    width: 48rpx;
    height: 48rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-danger);
    font-size: var(--font-lg);
    flex-shrink: 0;
  }
}

.add-waypoint {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20rpx;
  border: 1rpx dashed var(--color-border);
  border-radius: var(--radius-sm);
  gap: 8rpx;

  .add-icon {
    font-size: 28rpx;
    color: var(--color-primary);
  }

  .add-text {
    font-size: var(--font-sm);
    color: var(--color-primary);
  }
}

// 路线预览
.route-preview {
  background-color: var(--color-bg-white);
  border-radius: var(--radius-sm);
  border: 1rpx solid var(--color-border);
  padding: 20rpx;

  .route-line {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8rpx;
    margin-bottom: 16rpx;

    .route-dot {
      width: 16rpx;
      height: 16rpx;
      border-radius: 50%;

      &.start-dot {
        background-color: var(--color-primary);
      }

      &.wp-dot {
        background-color: var(--color-warning);
      }

      &.end-dot {
        background-color: var(--color-danger);
      }
    }

    .route-dash {
      flex: 1;
      height: 2rpx;
      background: repeating-linear-gradient(90deg, #ccc 0, #ccc 8rpx, transparent 8rpx, transparent 16rpx);
    }
  }

  .route-map-thumb {
    height: 200rpx;
    background-color: var(--color-divider);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;

    .map-placeholder {
      font-size: var(--font-xs);
      color: var(--color-text-hint);
    }
  }
}

// 表单输入
.form-input {
  width: 100%;
  height: 80rpx;
  padding: 0 24rpx;
  background-color: var(--color-bg-white);
  border-radius: var(--radius-sm);
  border: 1rpx solid var(--color-border);
  font-size: var(--font-md);
  box-sizing: border-box;
}

// 选择器
.picker-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  background-color: var(--color-bg-white);
  border-radius: var(--radius-sm);
  border: 1rpx solid var(--color-border);

  .picker-text {
    font-size: var(--font-md);
    color: var(--color-text-primary);

    &.placeholder {
      color: var(--color-text-hint);
    }
  }

  .picker-arrow {
    font-size: 28rpx;
  }
}

// 日期时间选择器
.datetime-wrap {
  display: flex;
  gap: 20rpx;
  
  .date-picker,
  .time-picker {
    flex: 1;
  }
  
  .picker-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20rpx 24rpx;
    background-color: var(--color-bg-white);
    border-radius: var(--radius-sm);
    border: 1rpx solid var(--color-border);
    
    .picker-text {
      font-size: var(--font-md);
      color: var(--color-text-primary);
      
      &.placeholder {
        color: var(--color-text-hint);
      }
    }
    
    .picker-icon {
      font-size: 28rpx;
    }
  }
}

// 滑块
.slider-wrap {
  padding: 8rpx 0;

  .slider-value {
    font-size: var(--font-sm);
    color: var(--color-primary);
    text-align: right;
    display: block;
    margin-top: 4rpx;
  }
}

// 选项组（深度选择）
.option-group {
  display: flex;
  gap: 16rpx;

  .option-item {
    flex: 1;
    padding: 16rpx;
    background-color: var(--color-bg-white);
    border: 2rpx solid var(--color-border);
    border-radius: var(--radius-sm);
    text-align: center;
    transition: all 0.2s;

    &.selected {
      border-color: var(--color-primary);
      background-color: rgba(7, 193, 96, 0.04);
    }

    .option-label {
      display: block;
      font-size: var(--font-lg);
      font-weight: 600;
      color: var(--color-text-primary);
      margin-bottom: 4rpx;
    }

    .option-desc {
      font-size: var(--font-xs);
      color: var(--color-text-hint);
    }
  }
}

// 标签网格
.tag-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;

  .tag-item {
    padding: 12rpx 24rpx;
    background-color: var(--color-bg-white);
    border: 1rpx solid var(--color-border);
    border-radius: 32rpx;
    font-size: var(--font-sm);
    color: var(--color-text-secondary);
    transition: all 0.2s;

    &.selected {
      background-color: rgba(7, 193, 96, 0.08);
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
  }
}

// 开关行
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 24rpx;
  background-color: var(--color-bg-white);
  border-radius: var(--radius-sm);
  border: 1rpx solid var(--color-border);

  .switch-info {
    .switch-label {
      display: block;
      font-size: var(--font-md);
      color: var(--color-text-primary);
    }

    .switch-desc {
      font-size: var(--font-xs);
      color: var(--color-text-hint);
    }
  }
}

// 复选框组
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;

  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 8rpx;

    .checkbox-box {
      width: 40rpx;
      height: 40rpx;
      border: 2rpx solid var(--color-border);
      border-radius: 8rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24rpx;
      color: #fff;
      background-color: var(--color-bg-white);
      transition: all 0.2s;

      &.checked {
        background-color: var(--color-primary);
        border-color: var(--color-primary);
      }
    }

    .checkbox-label {
      font-size: var(--font-sm);
      color: var(--color-text-primary);
    }
  }
}

// 预览卡片
.review-card {
  background-color: var(--color-bg-white);
  border-radius: var(--radius-md);
  padding: 24rpx;
  box-shadow: var(--shadow-sm);

  .review-title {
    font-size: var(--font-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 24rpx;
    display: block;
  }
}

.review-section {
  margin-bottom: 20rpx;
  padding-bottom: 20rpx;
  border-bottom: 1rpx solid var(--color-divider);

  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }

  .review-label {
    font-size: var(--font-xs);
    color: var(--color-text-hint);
    margin-bottom: 8rpx;
    display: block;
  }
}

.review-route {
  .review-route-text {
    font-size: var(--font-md);
    font-weight: 500;
    color: var(--color-text-primary);
    line-height: 1.5;
  }
}

.review-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12rpx;

  .review-item {
    display: flex;
    flex-direction: column;
    gap: 4rpx;

    .ri-label {
      font-size: var(--font-xs);
      color: var(--color-text-hint);
    }

    .ri-value {
      font-size: var(--font-sm);
      color: var(--color-text-primary);
    }
  }
}

.review-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;

  .review-tag {
    font-size: 20rpx;
    padding: 4rpx 16rpx;
    border-radius: 20rpx;
    background-color: rgba(7, 193, 96, 0.08);
    color: var(--color-primary);
  }
}

.review-value {
  font-size: var(--font-sm);
  color: var(--color-text-primary);
}

// 底部占位
.form-bottom {
  height: 120rpx;
}

// 底部按钮栏
.bottom-bar {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  background-color: var(--color-bg-white);
  border-top: 1rpx solid var(--color-border);
  gap: 16rpx;

  .btn {
    flex: 1;
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
  }

  .prev-btn {
    background-color: var(--color-divider);
    color: var(--color-text-secondary);
  }

  .next-btn {
    background-color: var(--color-primary);
    color: #fff;
  }

  .submit-btn {
    flex: 1;
    height: 88rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    font-size: var(--font-lg);
    font-weight: 500;
    background-color: var(--color-primary);
    color: #fff;

    &.disabled {
      opacity: 0.5;
    }
  }
}
</style>
