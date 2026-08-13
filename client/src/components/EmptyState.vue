<template>
  <view class="empty-state">
    <!-- ==================== Icon ==================== -->
    <view class="empty-icon-wrap">
      <text class="empty-icon">{{ icon }}</text>
    </view>

    <!-- ==================== Title ==================== -->
    <text class="empty-title">{{ title }}</text>

    <!-- ==================== Description ==================== -->
    <text v-if="description" class="empty-description">{{ description }}</text>

    <!-- ==================== Secondary Description ==================== -->
    <text v-if="secondaryDescription" class="empty-secondary">{{ secondaryDescription }}</text>

    <!-- ==================== Action Button ==================== -->
    <view
      v-if="actionText"
      class="empty-action"
      @click="handleAction"
    >
      <text>{{ actionText }}</text>
    </view>

    <!-- ==================== Secondary Action ==================== -->
    <text
      v-if="secondaryActionText"
      class="empty-secondary-action"
      @click="handleSecondaryAction"
    >{{ secondaryActionText }}</text>
  </view>
</template>

<script>
module.exports = {
  name: 'EmptyState',

  props: {
    /**
     * Icon to show (emoji string or text)
     */
    icon: {
      type: String,
      default: '📭'
    },

    /**
     * Main title text
     */
    title: {
      type: String,
      default: '暂无内容'
    },

    /**
     * Description text below the title
     */
    description: {
      type: String,
      default: ''
    },

    /**
     * Secondary description (lighter, can be used for more context)
     */
    secondaryDescription: {
      type: String,
      default: ''
    },

    /**
     * Text for the primary action button.
     * Button is hidden when empty.
     */
    actionText: {
      type: String,
      default: ''
    },

    /**
     * Navigation path for the action button.
     * If provided, clicking the button navigates here.
     * If not provided, emits 'action' event.
     */
    actionPath: {
      type: String,
      default: ''
    },

    /**
     * Text for a secondary text-link action.
     * Hidden when empty.
     */
    secondaryActionText: {
      type: String,
      default: ''
    },

    /**
     * Navigation path for secondary action.
     * If not provided, emits 'secondary-action' event.
     */
    secondaryActionPath: {
      type: String,
      default: ''
    }
  },

  methods: {
    /** Handle primary action button click */
    handleAction() {
      if (this.actionPath) {
        // Use type-specific navigation
        if (this.actionPath.indexOf('/pages/tab/') === 0 || this.actionPath === '/pages/map/index' ||
            this.actionPath === '/pages/message/index' || this.actionPath === '/pages/trip/index' ||
            this.actionPath === '/pages/mine/index') {
          uni.switchTab({ url: this.actionPath });
        } else {
          uni.navigateTo({ url: this.actionPath });
        }
      } else {
        this.$emit('action');
      }
    },

    /** Handle secondary action link click */
    handleSecondaryAction() {
      if (this.secondaryActionPath) {
        uni.navigateTo({ url: this.secondaryActionPath });
      } else {
        this.$emit('secondary-action');
      }
    }
  }
};
</script>

<style lang="scss" scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80rpx 40rpx;
  text-align: center;
}

// ==================== Icon ====================
.empty-icon-wrap {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  background-color: var(--color-divider);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32rpx;
}

.empty-icon {
  font-size: 72rpx;
}

// ==================== Title ====================
.empty-title {
  font-size: var(--font-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 12rpx;
}

// ==================== Description ====================
.empty-description {
  font-size: var(--font-sm);
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin-bottom: 8rpx;
  max-width: 480rpx;
}

// ==================== Secondary Description ====================
.empty-secondary {
  font-size: var(--font-xs);
  color: var(--color-text-hint);
  margin-bottom: 40rpx;
  max-width: 480rpx;
}

// ==================== Action Button ====================
.empty-action {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80rpx;
  padding: 0 48rpx;
  background: linear-gradient(135deg, var(--color-primary), #05A84E);
  border-radius: 44rpx;
  box-shadow: 0 6rpx 20rpx rgba(7, 193, 96, 0.3);
  margin-bottom: 16rpx;

  text {
    font-size: var(--font-md);
    color: #FFFFFF;
    font-weight: 600;
  }

  &:active {
    opacity: 0.85;
  }
}

// ==================== Secondary Action ====================
.empty-secondary-action {
  font-size: var(--font-sm);
  color: var(--color-primary);
  font-weight: 500;
  padding: 8rpx 16rpx;

  &:active {
    opacity: 0.7;
  }
}
</style>
