<template>
  <view class="growth-bar" @click="handleClick">
    <!-- ==================== Level Badge ==================== -->
    <view class="level-section">
      <view class="level-badge">
        <text class="level-badge-num">Lv.{{ level }}</text>
      </view>
      <text v-if="showDetail" class="level-name">{{ levelName }}</text>
    </view>

    <!-- ==================== Progress Bar ==================== -->
    <view class="bar-section">
      <!-- Value Text -->
      <view v-if="showDetail" class="bar-header">
        <text class="bar-value-text">{{ displayValue }}/{{ displayMax }}</text>
        <text class="bar-percent">{{ percentText }}</text>
      </view>

      <!-- Bar -->
      <view class="bar-track">
        <view
          class="bar-fill"
          :style="{ width: animatedPercent + '%' }"
        >
          <view class="bar-glow"></view>
        </view>
      </view>

      <!-- Hint -->
      <text v-if="showDetail && remaining > 0" class="bar-hint">
        距下一级还需 {{ remaining }} 点
      </text>
      <text v-else-if="showDetail && remaining <= 0" class="bar-hint max-hint">
        已达到最高等级 🎉
      </text>
    </view>
  </view>
</template>

<script>
module.exports = {
  name: 'GrowthBar',

  props: {
    /**
     * Current growth value
     */
    value: {
      type: Number,
      default: 0
    },

    /**
     * Next level threshold (maximum for current level)
     */
    max: {
      type: Number,
      default: 100
    },

    /**
     * Current level number
     */
    level: {
      type: Number,
      default: 1
    },

    /**
     * Human-readable level name
     */
    levelName: {
      type: String,
      default: ''
    },

    /**
     * Whether to show detail text (value/max, percentage, hint)
     */
    showDetail: {
      type: Boolean,
      default: true
    }
  },

  data() {
    return {
      animatedPercent: 0,
      animating: false
    };
  },

  computed: {
    /** Display value clamped to [0, max] */
    displayValue() {
      return Math.max(0, Math.min(this.value, this.max));
    },

    /** Display max */
    displayMax() {
      return this.max || 100;
    },

    /** Raw percentage */
    rawPercent() {
      if (!this.displayMax) return 0;
      return Math.min(100, Math.round((this.value / this.displayMax) * 100));
    },

    /** Percentage text for display */
    percentText() {
      return this.rawPercent + '%';
    },

    /** Remaining growth to next level */
    remaining() {
      if (this.max <= 0) return 0;
      const diff = this.max - this.value;
      return Math.max(0, diff);
    }
  },

  watch: {
    /** Animate fill on value change */
    rawPercent: {
      immediate: true,
      handler(newVal) {
        if (this.animating) return;
        this.animateTo(newVal);
      }
    }
  },

  methods: {
    /** Smooth animate the fill width */
    animateTo(target) {
      if (this.animatedPercent === target) return;
      this.animating = true;

      const start = this.animatedPercent;
      const duration = 600; // ms
      const startTime = Date.now();

      const step = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        this.animatedPercent = Math.round(start + (target - start) * eased);

        if (progress < 1) {
          // Use requestAnimationFrame if available, otherwise setTimeout
          if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(step);
          } else {
            setTimeout(step, 16);
          }
        } else {
          this.animatedPercent = target;
          this.animating = false;
        }
      };

      step();
    },

    /** Handle click */
    handleClick() {
      this.$emit('click');
    }
  }
};
</script>

<style lang="scss" scoped>
.growth-bar {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

// ==================== Level Section ====================
.level-section {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.level-badge {
  padding: 4rpx 16rpx;
  background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
  border-radius: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(255, 165, 0, 0.25);
}

.level-badge-num {
  font-size: 24rpx;
  font-weight: 800;
  color: #FFFFFF;
}

.level-name {
  font-size: var(--font-xs);
  color: var(--color-text-secondary);
  font-weight: 500;
}

// ==================== Bar Section ====================
.bar-section {
  flex: 1;
}

.bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8rpx;
}

.bar-value-text {
  font-size: var(--font-xs);
  color: var(--color-text-secondary);
  font-weight: 500;
}

.bar-percent {
  font-size: var(--font-xs);
  color: var(--color-primary);
  font-weight: 600;
}

// Track
.bar-track {
  width: 100%;
  height: 14rpx;
  background-color: #E8E8E8;
  border-radius: 7rpx;
  overflow: hidden;
  position: relative;
}

// Fill with gradient and glow
.bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary) 0%, #4cd964 50%, #34C759 100%);
  border-radius: 7rpx;
  position: relative;
  transition: none;
  min-width: 0;
}

.bar-glow {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 20rpx;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6));
  border-radius: 0 7rpx 7rpx 0;
}

// Hint
.bar-hint {
  display: block;
  font-size: 20rpx;
  color: var(--color-text-hint);
  margin-top: 6rpx;

  &.max-hint {
    color: #F5A623;
    font-weight: 500;
  }
}
</style>
