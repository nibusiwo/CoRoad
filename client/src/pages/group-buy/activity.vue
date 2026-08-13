<template>
  <view class="activity-page">
    <scroll-view class="activity-scroll" scroll-y>
      <!-- Loading -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <template v-if="!loading && activity">
        <!-- Activity Header -->
        <view class="activity-header">
          <view class="header-product-info">
            <image
              :src="productImage || '/static/default-product.png'"
              class="header-product-img"
              mode="aspectFill"
            />
            <view class="header-text">
              <text class="header-product-name">{{ activity.productName || '团购商品' }}</text>
              <text class="header-target">{{ activity.joinedCount || 0 }}/{{ activity.targetCount || 10 }}人</text>
            </view>
          </view>

          <!-- Progress -->
          <view class="header-progress-bar">
            <view
              class="header-progress-fill"
              :style="{
                width: progressPercent + '%',
                background: progressGradient
              }"
            ></view>
          </view>
        </view>

        <!-- Price Display -->
        <view class="price-display card">
          <view class="price-current-row">
            <text class="price-label">当前价格</text>
            <text class="price-value">¥{{ currentPrice }}/人</text>
          </view>
          <view class="price-compare">
            <text class="price-original">原价 ¥{{ activity.originalPrice || 0 }}</text>
            <text class="price-saved">已省 ¥{{ savedAmount }}</text>
          </view>
        </view>

        <!-- Chop Animation Overlay (shown when animation triggered) -->
        <view v-if="showChopAnimation" class="chop-overlay" @animationend="showChopAnimation = false">
          <view class="chop-animation">
            <text class="chop-icon">🔪</text>
            <text class="chop-text">{{ chopMessage }}</text>
          </view>
        </view>

        <!-- Participant Section -->
        <view class="participant-section card">
          <text class="section-title">参团成员</text>
          <view class="participant-header-row">
            <view class="participant-avatars">
              <image
                v-for="(p, i) in participants"
                :key="i"
            :src="resolveAssetUrl(p.avatar) || '/static/default-avatar.png'"
                class="participant-avatar"
                mode="aspectFill"
              />
              <view v-if="remainingSlots > 0" class="participant-slot empty-slot">
                <text>?</text>
              </view>
            </view>
            <text class="participant-count">{{ participants.length }}人参团</text>
          </view>
        </view>

        <!-- Activity Info -->
        <view class="activity-info card">
          <text class="section-title">活动信息</text>
          <view class="info-row">
            <text class="info-label">发起人</text>
            <text class="info-value">{{ activity.initiatorName || '匿名用户' }}</text>
          </view>
          <view class="info-row">
            <text class="info-label">创建时间</text>
            <text class="info-value">{{ formatTime(activity.createTime) }}</text>
          </view>
          <view v-if="activity.expiryTime" class="info-row">
            <text class="info-label">剩余时间</text>
            <view class="countdown-row">
              <text class="countdown-block">{{ expiryCountdown.hours }}</text>
              <text class="countdown-colon">:</text>
              <text class="countdown-block">{{ expiryCountdown.minutes }}</text>
              <text class="countdown-colon">:</text>
              <text class="countdown-block">{{ expiryCountdown.seconds }}</text>
            </view>
          </view>
          <view v-if="activity.discountPrice" class="info-row highlight-row">
            <text class="info-label">已优惠</text>
            <text class="info-value discount-value">¥{{ activity.discountPrice }}</text>
          </view>
        </view>

        <!-- Share Prompt -->
        <view class="share-prompt card">
          <text class="share-prompt-text">邀请好友一起拼，更便宜！</text>
          <text class="share-prompt-sub">
            每多一人参团，价格更低！最高可享{{ maxDiscount }}折
          </text>
        </view>

        <!-- Share Buttons -->
        <view class="share-actions">
          <view class="share-btn" @click="shareToTeam">
            <text class="share-btn-icon">👥</text>
            <text class="share-btn-text">分享到车队群</text>
          </view>
          <view class="share-btn" @click="shareToWechat">
            <text class="share-btn-icon">💬</text>
            <text class="share-btn-text">分享给微信好友</text>
          </view>
          <view class="share-btn" @click="generatePoster">
            <text class="share-btn-icon">🖼️</text>
            <text class="share-btn-text">生成海报</text>
          </view>
        </view>

        <!-- Step Guide -->
        <view class="step-guide card">
          <text class="section-title">拼团流程</text>
          <view class="steps-row">
            <view
              v-for="(step, index) in steps"
              :key="step.step"
              class="step-item"
              :class="{
                'step-active': step.step === currentStep,
                'step-done': step.step < currentStep
              }"
            >
              <view class="step-circle">
                <text v-if="step.step < currentStep">✓</text>
                <text v-else>{{ step.step }}</text>
              </view>
              <text class="step-label">{{ step.label }}</text>
            </view>
          </view>
        </view>

        <!-- Bottom Placeholder -->
        <view class="activity-bottom"></view>
      </template>
    </scroll-view>

    <!-- Bottom Bar -->
    <view v-if="!loading && activity" class="bottom-bar safe-area-bottom">
      <view class="bottom-price-area">
        <text class="bottom-price-value">¥{{ currentPrice }}</text>
        <text class="bottom-price-label">/人</text>
      </view>
      <view v-if="!hasJoined" class="bottom-join-btn" @click="handleJoin">
        <text>确认参团 ¥{{ currentPrice }}</text>
      </view>
      <view v-else class="bottom-joined-btn">
        <text>已参团</text>
      </view>
    </view>

    <!-- ==================== 参团确认弹窗(含优惠券选择) ==================== -->
    <view v-if="showJoinModal" class="join-modal-mask" @click="closeJoinModal">
      <view class="join-modal" @click.stop>
        <view class="join-modal-header">
          <text class="join-modal-title">确认参团</text>
          <text class="join-modal-close" @click="closeJoinModal">✕</text>
        </view>

        <view class="join-product-row">
          <image :src="productImage || '/static/default-product.png'" class="join-product-img" mode="aspectFill" />
          <view class="join-product-info">
            <text class="join-product-name">{{ activity.productName || '拼团商品' }}</text>
            <text class="join-product-count">{{ participants.length }}人参团 · 还差{{ remainingSlots }}人成团</text>
          </view>
        </view>

        <!-- 优惠券选择 -->
        <view class="coupon-section">
          <view class="coupon-title-row">
            <text class="coupon-title">优惠券</text>
            <text class="coupon-sub" v-if="couponLoading">加载中...</text>
          </view>
          <scroll-view class="coupon-list" scroll-y>
            <view
              class="coupon-item"
              :class="{ selected: selectedCouponId === null }"
              @click="selectedCouponId = null"
            >
              <view class="coupon-item-left">
                <text class="coupon-face">不使用优惠券</text>
                <text class="coupon-desc">按拼团价 ¥{{ currentPrice }} 支付</text>
              </view>
              <view class="coupon-check" :class="{ checked: selectedCouponId === null }">
                <text>✓</text>
              </view>
            </view>
            <view
              v-for="coupon in coupons"
              :key="coupon.id"
              class="coupon-item"
              :class="{ selected: selectedCouponId === coupon.id }"
              @click="selectedCouponId = coupon.id"
            >
              <view class="coupon-item-left">
                <text class="coupon-face">¥{{ coupon.template && coupon.template.face_value }} 券</text>
                <text class="coupon-desc">{{ coupon.template && coupon.template.name }}</text>
                <text class="coupon-min" v-if="coupon.template && coupon.template.min_amount">
                  满{{ coupon.template.min_amount }}元可用
                </text>
              </view>
              <view class="coupon-check" :class="{ checked: selectedCouponId === coupon.id }">
                <text>✓</text>
              </view>
            </view>
            <view v-if="!couponLoading && coupons.length === 0" class="coupon-empty">
              <text>暂无可用的优惠券</text>
            </view>
          </scroll-view>
        </view>

        <!-- 价格汇总 -->
        <view class="join-price-row">
          <text class="join-price-label">应付金额</text>
          <view class="join-price-value-wrap">
            <text class="join-price-original" v-if="couponDiscount > 0">¥{{ currentPrice }}</text>
            <text class="join-price-value">¥{{ payPrice }}</text>
          </view>
        </view>
        <text v-if="couponDiscount > 0" class="join-coupon-saved">优惠券已抵扣 ¥{{ couponDiscount }}</text>

        <view class="join-modal-actions">
          <view class="join-modal-btn cancel" @click="closeJoinModal">
            <text>取消</text>
          </view>
          <view class="join-modal-btn confirm" :class="{ disabled: joining }" @click="confirmJoin">
            <text>{{ joining ? '提交中...' : '确认支付 ¥' + payPrice }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 隐藏海报画布 -->
    <canvas
      canvas-id="posterCanvas"
      class="poster-canvas"
      style="width:600px;height:900px;"
    ></canvas>
  </view>
</template>

<script>
import { groupBuy, coupon, resolveAssetUrl as resolveAsset } from '@/utils/api.js';
import { useUserStore } from '@/store/user.js';
import { useChatStore } from '@/store/chat.js';
import { drawPoster, exportPoster } from '@/utils/poster.js';

export default {
  data() {
    return {
      activityId: '',
      productId: '',
      activity: null,
      participants: [],
      loading: true,
      pollTimer: null,
      previousCount: 0,

      // Chop animation
      showChopAnimation: false,
      chopMessage: '',

      // Countdown
      expiryCountdown: {
        hours: '00',
        minutes: '00',
        seconds: '00'
      },
      countdownTimer: null,

      // Steps
      steps: [
        { step: 1, label: '发起拼团' },
        { step: 2, label: '邀请好友' },
        { step: 3, label: '达到人数' },
        { step: 4, label: '到店核销' }
      ],

      // ---- 参团确认 + 优惠券 ----
      showJoinModal: false,
      joining: false,
      couponLoading: false,
      coupons: [],
      selectedCouponId: null
    };
  },

  computed: {
    userStore() {
      return useUserStore();
    },

    chatStore() {
      return useChatStore();
    },

    progressPercent() {
      if (!this.activity) return 0;
      const target = this.activity.targetCount || 10;
      const joined = this.activity.joinedCount || 0;
      return Math.min(100, Math.round((joined / target) * 100));
    },

    progressGradient() {
      const pct = this.progressPercent;
      if (pct < 30) return 'linear-gradient(90deg, #b0b0b0, #c0c0c0)';
      if (pct < 60) return 'linear-gradient(90deg, #07C160, #4cd964)';
      if (pct < 90) return 'linear-gradient(90deg, #f5a623, #ff8c00)';
      return 'linear-gradient(90deg, #ff6b35, #e74c3c)';
    },

    currentPrice() {
      if (!this.activity) return 0;
      return this.activity.currentPrice || this.activity.groupPrice || 0;
    },

    savedAmount() {
      if (!this.activity) return 0;
      return (this.activity.originalPrice || 0) - this.currentPrice;
    },

    productImage() {
      return this.activity ? resolveAssetUrl(this.activity.productImage || '') : '';
    },

    maxDiscount() {
      // Calculate from price tiers
      return '5';
    },

    currentStep() {
      if (!this.activity) return 1;
      const joined = this.activity.joinedCount || 0;
      const target = this.activity.targetCount || 10;
      if (joined >= target) return 4;
      if (joined >= 1) return 3;
      if (this.participants.length > 0) return 2;
      return 1;
    },

    hasJoined() {
      const uid = this.userStore.userId;
      return this.participants.some((p) => p.userId === uid);
    },

    remainingSlots() {
      if (!this.activity) return 0;
      const target = this.activity.targetCount || 10;
      const joined = this.activity.joinedCount || 0;
      return Math.max(0, target - joined);
    },

    /** 选中优惠券的抵扣金额 */
    couponDiscount() {
      if (this.selectedCouponId === null || this.selectedCouponId === undefined) return 0;
      const coupon = this.coupons.find((c) => c.id === this.selectedCouponId);
      const face = coupon && coupon.template && coupon.template.face_value;
      return Math.max(0, Number(face) || 0);
    },

    /** 实际应付金额 */
    payPrice() {
      return Math.max(0, (Number(this.currentPrice) || 0) - this.couponDiscount);
    }
  },

  onLoad(options) {
    this.activityId = options.activityId || '';
    this.productId = options.productId || '';

    // 从聊天页"拼团分享"入口进入但没有目标活动时,回到拼团列表选商品
    if (options.mode === 'share' && !this.activityId && !this.productId) {
      uni.redirectTo({ url: '/pages/group-buy/index' });
      return;
    }

    if (this.activityId) {
      this.loadActivity();
    } else if (this.productId) {
      this.fetchOrCreateActivity();
    } else {
      this.loading = false;
    }
  },

  onUnload() {
    this.clearTimers();
  },

  onHide() {
    this.clearTimers();
  },

  methods: {
    /** 解析相对资源路径为绝对 URL(小程序必需) */
    resolveAssetUrl(url) {
      return resolveAsset(url);
    },

    /** Load activity detail */
    async loadActivity() {
      this.loading = true;
      try {
        this.activity = await groupBuy.getActivityDetail(this.activityId);
        this.previousCount = this.activity.joinedCount || 0;
        if (this.activity.participants) {
          this.participants = this.activity.participants;
        }
        this.startPolling();
        this.startCountdown();
      } catch (err) {
        console.error('Failed to load activity:', err);
        uni.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        this.loading = false;
      }
    },

    /** Fetch or create a new activity */
    async fetchOrCreateActivity() {
      this.loading = true;
      try {
        // Try to get product detail first
        const product = await groupBuy.getProductDetail(this.productId);

        // Create or join an existing activity
        const result = await groupBuy.createActivity({
          productId: this.productId,
          productName: product.name,
          productImage: product.image
        });

        this.activity = result;
        this.activityId = result.id;
        this.previousCount = result.joinedCount || 1;

        if (result.participants) {
          this.participants = result.participants;
        }

        this.startPolling();
        this.startCountdown();
      } catch (err) {
        // If already has activity, try to join existing one
        try {
          const activities = await groupBuy.getUserActivities(1);
          if (activities && activities.length > 0) {
            const firstActivity = activities[0];
            this.activityId = firstActivity.id;
            this.activity = await groupBuy.getActivityDetail(this.activityId);
            this.previousCount = this.activity.joinedCount || 0;
            if (this.activity.participants) {
              this.participants = this.activity.participants;
            }
            this.startPolling();
            this.startCountdown();
          }
        } catch (e2) {
          console.error('Failed to load activity:', err);
          uni.showToast({ title: '加载失败', icon: 'none' });
        }
      } finally {
        this.loading = false;
      }
    },

    /** Start polling for updates */
    startPolling() {
      this.clearPolling();
      this.pollTimer = setInterval(async () => {
        try {
          if (!this.activityId) return;
          const updated = await groupBuy.getActivityDetail(this.activityId);
          const newCount = updated.joinedCount || 0;

          // Check if count changed
          if (newCount !== this.previousCount && newCount > this.previousCount) {
            const added = newCount - this.previousCount;
            const priceDrop = updated.discountPrice || 0;

            // Trigger chop animation
            this.triggerChopAnimation(added, priceDrop);

            // Update data
            this.activity = { ...this.activity, ...updated };
            this.previousCount = newCount;

            if (updated.participants) {
              this.participants = updated.participants;
            }
          } else {
            // Smooth update without animation
            this.activity = { ...this.activity, ...updated };
            if (updated.participants) {
              this.participants = updated.participants;
            }
          }
        } catch (e) {
          // Silent polling errors
        }
      }, 10000);
    },

    /** Trigger chop animation */
    triggerChopAnimation(added, priceDrop) {
      this.chopMessage = '又砍了一刀！再降¥' + (priceDrop || 'N') + '！共' + added + '人加入';
      this.showChopAnimation = true;
      setTimeout(() => {
        this.showChopAnimation = false;
      }, 2500);
    },

    /** Clear polling */
    clearPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    },

    /** Start countdown timer */
    startCountdown() {
      this.clearCountdown();
      const updateFn = () => {
        if (!this.activity || !this.activity.expiryTime) return;
        const remaining = Math.max(0, Math.floor((new Date(this.activity.expiryTime) - Date.now()) / 1000));
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        this.expiryCountdown = {
          hours: String(hours).padStart(2, '0'),
          minutes: String(minutes).padStart(2, '0'),
          seconds: String(seconds).padStart(2, '0')
        };
        if (remaining <= 0) {
          this.clearCountdown();
        }
      };

      updateFn();
      this.countdownTimer = setInterval(updateFn, 1000);
    },

    /** Clear countdown */
    clearCountdown() {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    },

    /** Clear all timers */
    clearTimers() {
      this.clearPolling();
      this.clearCountdown();
    },

    /** Handle join - 打开确认弹窗并加载可用优惠券 */
    async handleJoin() {
      this.showJoinModal = true;
      this.selectedCouponId = null;
      await this.fetchCoupons();
    },

    /** 加载当前商家可用的优惠券(平台券 + 商家券) */
    async fetchCoupons() {
      this.couponLoading = true;
      try {
        const merchantId = this.activity && this.activity.merchant && this.activity.merchant.id;
        const res = await coupon.getAvailableCoupons(merchantId);
        this.coupons = (res && res.list) || [];
      } catch (err) {
        console.warn('加载优惠券失败:', err);
        this.coupons = [];
      } finally {
        this.couponLoading = false;
      }
    },

    closeJoinModal() {
      if (this.joining) return;
      this.showJoinModal = false;
    },

    /** 确认参团:带上选中优惠券,使用 joinActivity 返回的真实订单跳转支付 */
    async confirmJoin() {
      if (this.joining) return;
      this.joining = true;
      try {
        const result = await groupBuy.joinActivity(this.activityId, {
          coupon_id: this.selectedCouponId || null
        });
        const orderInfo = result && (result.order || result);
        if (!orderInfo || !orderInfo.id) {
          throw new Error('订单创建失败');
        }
        this.showJoinModal = false;
        this.previousCount = this.activity.joinedCount || 0;
        uni.navigateTo({
          url: '/pages/order/detail?id=' + orderInfo.id + '&action=pay'
        });
      } catch (err) {
        console.error('Join activity failed:', err);
        uni.showToast({ title: (err && err.message) || '参团失败，请重试', icon: 'none' });
      } finally {
        this.joining = false;
      }
    },

    /** Share to team chat */
    async shareToTeam() {
      if (!this.activityId) {
        uni.showToast({ title: '拼团活动尚未创建', icon: 'none' });
        return;
      }
      try {
        await this.chatStore.fetchSessions('team');
      } catch (err) {
        console.warn('fetch team sessions failed:', err);
      }
      const teamSessions = (this.chatStore.sessions || []).filter((s) => s.type === 'team');
      if (teamSessions.length === 0) {
        uni.showToast({ title: '暂无车队群聊，先加入车队吧', icon: 'none' });
        return;
      }

      const names = teamSessions.slice(0, 6).map((s) => s.name || '车队群');
      uni.showActionSheet({
        itemList: names,
        success: async (res) => {
          const session = teamSessions[res.tapIndex];
          if (!session) return;
          try {
            uni.showLoading({ title: '分享中...' });
            const productName = this.activity.productName || '拼团商品';
            const price = this.currentPrice || 0;
            await this.chatStore.sendMessage(session.id, {
              type: 'group_buy',
              content: '🛒 拼团分享：' + productName + ' ¥' + price,
              extra: {
                group_buy: {
                  activity_id: this.activityId,
                  product_name: productName,
                  product_price: price,
                  product_image: this.productImage
                }
              }
            });
            uni.hideLoading();
            uni.showToast({ title: '已分享到车队群', icon: 'success' });
          } catch (err) {
            uni.hideLoading();
            uni.showToast({ title: (err && err.message) || '分享失败', icon: 'none' });
          }
        }
      });
    },

    /** Share to WeChat */
    shareToWechat() {
      // Triggers onShareAppMessage
      uni.showToast({ title: '请点击右上角分享', icon: 'none' });
    },

    /** Generate poster */
    generatePoster() {
      if (!this.activity) return;
      uni.showLoading({ title: '生成中...' });
      const ctx = uni.createCanvasContext('posterCanvas', this);
      drawPoster(ctx, {
        title: this.activity.productName || '拼团好物',
        subtitle: '拼团价 ¥' + this.currentPrice + ' 起',
        priceText: '¥' + this.currentPrice,
        bottomText: '已拼 ' + (this.activity.joinedCount || 0) + ' 人 · 还差 ' + this.remainingSlots + ' 人成团',
        brand: '同道 CoRoad · 拼团更省钱',
        qrText: this.activityId ? '/pages/group-buy/activity?activityId=' + this.activityId : ''
      });
      setTimeout(() => {
        exportPoster(this, 'posterCanvas')
          .catch(() => {
            uni.showToast({ title: '海报生成失败', icon: 'none' });
          })
          .finally(() => {
            uni.hideLoading();
          });
      }, 400);
    },

    /** Format time */
    formatTime(timeStr) {
      if (!timeStr) return '--';
      const date = new Date(timeStr);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes;
    }
  },

  /** Share configuration */
  onShareAppMessage() {
    return {
      title: '快来一起拼团，更便宜！',
      path: '/pages/group-buy/activity?activityId=' + this.activityId,
      imageUrl: this.activity ? (this.activity.productImage || '') : ''
    };
  }
};
</script>

<style lang="scss" scoped>
.activity-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F5F5F5;
  position: relative;
}

.activity-scroll {
  flex: 1;
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  font-size: 28rpx;
  color: #999;
}

// ===== Activity Header =====
.activity-header {
  background: linear-gradient(135deg, #e74c3c, #ff6b35);
  padding: 32rpx 24rpx;
}

.header-product-info {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.header-product-img {
  width: 96rpx;
  height: 96rpx;
  border-radius: 16rpx;
  background-color: rgba(255, 255, 255, 0.3);
}

.header-text {
  flex: 1;

  .header-product-name {
    font-size: 30rpx;
    color: #FFFFFF;
    font-weight: 600;
    display: block;
    margin-bottom: 6rpx;
  }

  .header-target {
    font-size: 26rpx;
    color: rgba(255, 255, 255, 0.85);
    font-weight: 600;
  }
}

.header-progress-bar {
  width: 100%;
  height: 12rpx;
  background-color: rgba(255, 255, 255, 0.3);
  border-radius: 6rpx;
  overflow: hidden;

  .header-progress-fill {
    height: 100%;
    border-radius: 6rpx;
    transition: width 0.6s ease;
  }
}

// ===== Price Display =====
.price-display {
  margin: 16rpx 24rpx;
}

.price-current-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10rpx;

  .price-label {
    font-size: 26rpx;
    color: #999;
  }

  .price-value {
    font-size: 44rpx;
    font-weight: 800;
    color: #e74c3c;
  }
}

.price-compare {
  display: flex;
  justify-content: space-between;
  align-items: center;

  .price-original {
    font-size: 24rpx;
    color: #bbb;
    text-decoration: line-through;
  }

  .price-saved {
    font-size: 24rpx;
    color: #07C160;
    font-weight: 600;
    background: rgba(7, 193, 96, 0.06);
    padding: 4rpx 14rpx;
    border-radius: 16rpx;
  }
}

// ===== Chop Animation Overlay =====
.chop-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  background-color: rgba(0, 0, 0, 0.35);
  animation: fadeInOut 2.5s ease-in-out forwards;
  pointer-events: none;
}

@keyframes fadeInOut {
  0% { opacity: 0; }
  15% { opacity: 1; }
  70% { opacity: 1; }
  100% { opacity: 0; }
}

.chop-animation {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  animation: chopBounce 0.6s ease-in-out 3;
}

@keyframes chopBounce {
  0%, 100% { transform: scale(1) rotate(0deg); }
  25% { transform: scale(1.3) rotate(-15deg); }
  50% { transform: scale(1.1) rotate(0deg); }
  75% { transform: scale(1.2) rotate(15deg); }
}

.chop-icon {
  font-size: 120rpx;
}

.chop-text {
  font-size: 36rpx;
  color: #FFFFFF;
  font-weight: 700;
  text-align: center;
  background: linear-gradient(135deg, #e74c3c, #ff6b35);
  padding: 16rpx 32rpx;
  border-radius: 24rpx;
  box-shadow: 0 8rpx 24rpx rgba(231, 76, 60, 0.4);
}

// ===== Participant Section =====
.participant-section {
  margin: 0 24rpx 16rpx;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1A1A1A;
  display: block;
  margin-bottom: 20rpx;
}

.participant-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.participant-avatars {
  display: flex;
  align-items: center;

  .participant-avatar {
    width: 72rpx;
    height: 72rpx;
    border-radius: 50%;
    border: 3rpx solid #fff;
    margin-left: -20rpx;
    background-color: #F0F0F0;

    &:first-child {
      margin-left: 0;
    }
  }

  .empty-slot {
    width: 72rpx;
    height: 72rpx;
    border-radius: 50%;
    border: 2rpx dashed #ddd;
    margin-left: -20rpx;
    background-color: #FAFAFA;
    display: flex;
    align-items: center;
    justify-content: center;

    text {
      font-size: 32rpx;
      color: #ccc;
    }
  }
}

.participant-count {
  font-size: 26rpx;
  color: #999;
  font-weight: 500;
}

// ===== Activity Info =====
.activity-info {
  margin: 0 24rpx 16rpx;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #F5F5F5;

  &:last-child {
    border-bottom: none;
  }

  &.highlight-row {
    background-color: #fef8e7;
    margin: 0 -24rpx;
    padding: 16rpx 24rpx;
    border-bottom: none;
    border-radius: 8rpx;
  }
}

.info-label {
  font-size: 26rpx;
  color: #999;
}

.info-value {
  font-size: 26rpx;
  color: #333;
  font-weight: 500;

  &.discount-value {
    color: #e74c3c;
    font-weight: 700;
    font-size: 30rpx;
  }
}

.countdown-row {
  display: flex;
  align-items: center;
  gap: 4rpx;
}

.countdown-block {
  width: 48rpx;
  height: 40rpx;
  background-color: #1A1A1A;
  color: #FFFFFF;
  font-size: 24rpx;
  font-weight: 700;
  border-radius: 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Courier New', monospace;
}

.countdown-colon {
  font-size: 24rpx;
  font-weight: 700;
  color: #1A1A1A;
  padding: 0 2rpx;
}

// ===== Share Prompt =====
.share-prompt {
  margin: 0 24rpx 16rpx;
  background: linear-gradient(135deg, #fff8f0, #fff0e6);
  text-align: center;
}

.share-prompt-text {
  font-size: 30rpx;
  font-weight: 700;
  color: #e74c3c;
  display: block;
  margin-bottom: 8rpx;
}

.share-prompt-sub {
  font-size: 24rpx;
  color: #999;
}

// ===== Share Actions =====
.share-actions {
  display: flex;
  margin: 0 24rpx 16rpx;
  gap: 16rpx;
}

.share-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  padding: 24rpx 16rpx;
  background-color: #FFFFFF;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
  transition: opacity 0.15s;

  &:active {
    opacity: 0.8;
  }
}

.share-btn-icon {
  font-size: 48rpx;
}

.share-btn-text {
  font-size: 22rpx;
  color: #666;
  white-space: nowrap;
}

// ===== Step Guide =====
.step-guide {
  margin: 0 24rpx 16rpx;
}

.steps-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  flex: 1;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: 24rpx;
    left: 60%;
    width: 80%;
    height: 2rpx;
    background-color: #eee;
  }

  &:last-child::after {
    display: none;
  }

  &.step-done::after {
    background-color: #07C160;
  }

  &.step-active::after {
    background: linear-gradient(90deg, #07C160, #e74c3c);
  }
}

.step-circle {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background-color: #F0F0F0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  color: #999;
  font-weight: 600;
  z-index: 1;

  .step-active & {
    background: linear-gradient(135deg, #e74c3c, #ff6b35);
    color: #fff;
    box-shadow: 0 4rpx 16rpx rgba(231, 76, 60, 0.35);
  }

  .step-done & {
    background-color: #07C160;
    color: #fff;
  }
}

.step-label {
  font-size: 20rpx;
  color: #999;
  text-align: center;

  .step-active & {
    color: #e74c3c;
    font-weight: 600;
  }

  .step-done & {
    color: #07C160;
  }
}

// ===== Bottom Bar =====
.activity-bottom {
  height: 140rpx;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  background-color: #FFFFFF;
  border-top: 1rpx solid #F0F0F0;
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.04);
  gap: 20rpx;
}

.bottom-price-area {
  display: flex;
  align-items: baseline;
  gap: 4rpx;

  .bottom-price-value {
    font-size: 40rpx;
    font-weight: 800;
    color: #e74c3c;
  }

  .bottom-price-label {
    font-size: 24rpx;
    color: #999;
  }
}

.bottom-join-btn {
  flex: 1;
  height: 88rpx;
  background: linear-gradient(135deg, #e74c3c, #ff6b35);
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 16rpx rgba(231, 76, 60, 0.35);

  text {
    font-size: 30rpx;
    color: #FFFFFF;
    font-weight: 700;
  }

  &:active {
    opacity: 0.9;
    transform: scale(0.98);
  }
}

.bottom-joined-btn {
  flex: 1;
  height: 88rpx;
  background-color: #F0F0F0;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;

  text {
    font-size: 28rpx;
    color: #07C160;
    font-weight: 600;
  }
}

// ===== Card Base =====
.card {
  background-color: #FFFFFF;
  border-radius: 20rpx;
  padding: 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

// ===== 参团确认弹窗 =====
.join-modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.join-modal {
  width: 100%;
  max-width: 700rpx;
  background: #FFFFFF;
  border-radius: 32rpx 32rpx 0 0;
  padding: 32rpx 32rpx 40rpx;
  padding-bottom: calc(40rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
  max-height: 80vh;
  overflow-y: auto;
  animation: joinModalUp 0.25s ease;

  .join-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24rpx;

    .join-modal-title {
      font-size: 34rpx;
      font-weight: 700;
      color: #1A1A1A;
    }

    .join-modal-close {
      font-size: 30rpx;
      color: #999;
      padding: 8rpx;
    }
  }

  .join-product-row {
    display: flex;
    align-items: center;
    gap: 20rpx;
    padding: 20rpx;
    background: #F7F8FA;
    border-radius: 20rpx;
    margin-bottom: 24rpx;

    .join-product-img {
      width: 96rpx;
      height: 96rpx;
      border-radius: 16rpx;
      background: #E8E8E8;
      flex-shrink: 0;
    }

    .join-product-info {
      flex: 1;
      min-width: 0;

      .join-product-name {
        font-size: 28rpx;
        font-weight: 600;
        color: #1A1A1A;
        display: block;
      }

      .join-product-count {
        font-size: 22rpx;
        color: #999;
        margin-top: 8rpx;
        display: block;
      }
    }
  }

  .coupon-section {
    margin-bottom: 20rpx;

    .coupon-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16rpx;

      .coupon-title {
        font-size: 28rpx;
        font-weight: 600;
        color: #1A1A1A;
      }

      .coupon-sub {
        font-size: 22rpx;
        color: #999;
      }
    }

    .coupon-list {
      max-height: 320rpx;

      .coupon-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18rpx 20rpx;
        border: 2rpx solid #EEEEEE;
        border-radius: 16rpx;
        margin-bottom: 12rpx;
        transition: all 0.15s ease;

        &.selected {
          border-color: #FF6B35;
          background: rgba(255, 107, 53, 0.04);
        }

        .coupon-item-left {
          flex: 1;
          min-width: 0;

          .coupon-face {
            font-size: 28rpx;
            font-weight: 700;
            color: #FF6B35;
            display: block;
          }

          .coupon-desc {
            font-size: 22rpx;
            color: #666;
            margin-top: 4rpx;
            display: block;
          }

          .coupon-min {
            font-size: 20rpx;
            color: #999;
            margin-top: 2rpx;
            display: block;
          }
        }

        .coupon-check {
          width: 40rpx;
          height: 40rpx;
          border-radius: 50%;
          border: 2rpx solid #DDDDDD;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-left: 16rpx;
          flex-shrink: 0;

          text {
            font-size: 22rpx;
            color: #FFFFFF;
            opacity: 0;
          }

          &.checked {
            background: #FF6B35;
            border-color: #FF6B35;

            text {
              opacity: 1;
            }
          }
        }
      }

      .coupon-empty {
        text-align: center;
        padding: 24rpx 0;
        font-size: 24rpx;
        color: #999;
      }
    }
  }

  .join-price-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20rpx 0 8rpx;
    border-top: 1rpx solid #F0F0F0;

    .join-price-label {
      font-size: 28rpx;
      color: #1A1A1A;
      font-weight: 600;
    }

    .join-price-value-wrap {
      display: flex;
      align-items: baseline;
      gap: 12rpx;

      .join-price-original {
        font-size: 24rpx;
        color: #999;
        text-decoration: line-through;
      }

      .join-price-value {
        font-size: 40rpx;
        font-weight: 800;
        color: #FF6B35;
      }
    }
  }

  .join-coupon-saved {
    font-size: 22rpx;
    color: #07C160;
    display: block;
    text-align: right;
    margin-bottom: 8rpx;
  }

  .join-modal-actions {
    display: flex;
    gap: 20rpx;
    margin-top: 20rpx;

    .join-modal-btn {
      flex: 1;
      height: 88rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 20rpx;
      font-size: 30rpx;
      font-weight: 600;

      &.cancel {
        background: #F5F5F5;
        color: #666;
      }

      &.confirm {
        background: linear-gradient(135deg, #FF6B35, #E74C3C);
        color: #FFFFFF;

        &.disabled {
          opacity: 0.6;
        }
      }
    }
  }
}

@keyframes joinModalUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.poster-canvas {
  position: fixed;
  left: -9999px;
  top: 0;
}
</style>
