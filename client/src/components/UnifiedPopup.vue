<template>
  <view class="popup-overlay" v-if="visible" @tap="onOverlayTap">
    <view class="popup-container" @tap.stop :class="{ 'popup-enter': visible, 'popup-leave': !visible }">
      <!-- ==================== Close Button ==================== -->
      <view class="popup-close" @tap="onClose">
        <text>✕</text>
      </view>

      <!-- ==================== User Header ==================== -->
      <view class="popup-header">
        <image
          class="popup-avatar"
          :src="user.avatar || '/static/default-avatar.png'"
          mode="aspectFill"
        />
        <view class="popup-user-info">
          <view class="popup-name-row">
            <text class="popup-nickname">{{ user.nickname || '未知用户' }}</text>
            <view class="popup-level" v-if="user.level">
              <text>Lv.{{ user.level }}</text>
            </view>
            <view class="popup-cert" v-if="user.isCertified">
              <text>✓ 已认证</text>
            </view>
          </view>
          <text class="popup-level-name" v-if="user.levelName">{{ user.levelName }}</text>
        </view>
      </view>

      <!-- ==================== Location Info ==================== -->
      <view class="popup-location-info" v-if="user.distance || user.speed">
        <view class="loc-info-item" v-if="user.distance">
          <text class="loc-info-icon">📏</text>
          <text class="loc-info-text">{{ typeof user.distance === 'number' ? user.distance.toFixed(1) + 'km' : user.distance }}</text>
        </view>
        <view class="loc-info-item" v-if="user.speed !== undefined && user.speed !== null">
          <text class="loc-info-icon">🏃</text>
          <text class="loc-info-text">{{ user.speed }}km/h</text>
        </view>
        <view class="loc-info-item" v-if="user.lastUpdate">
          <text class="loc-info-icon">🕐</text>
          <text class="loc-info-text">{{ formatTime(user.lastUpdate) }}</text>
        </view>
      </view>

      <!-- ==================== Signature ==================== -->
      <view class="popup-signature" v-if="user.signature">
        <text class="sig-icon">"</text>
        <text class="sig-text">{{ user.signature }}</text>
      </view>

      <!-- ==================== Type-Specific Content ==================== -->

      <!-- Teammate -->
      <view class="popup-actions" v-if="type === 'teammate'">
        <view class="popup-btn message-btn" @tap="onMessage">
          <text>💬 发消息</text>
        </view>
        <view class="popup-btn homepage-btn" @tap="onHomepage">
          <text>👤 查看主页</text>
        </view>
        <!-- B2: 队长专属 - 设为集合点 -->
        <view class="popup-btn meetup-btn" v-if="user.isLeader && !user.isMe" @tap="onSetMeetup">
          <text>🚩 设为集合点</text>
        </view>
      </view>

      <!-- Other Team -->
      <view class="popup-team-info" v-if="type === 'other_team'">
        <view class="team-info-row">
          <text class="team-info-label">车队名称</text>
          <text class="team-info-value">{{ user.teamName || user.nickname || '未知车队' }}</text>
        </view>
        <view class="team-info-row" v-if="user.memberCount !== undefined">
          <text class="team-info-label">在线成员</text>
          <text class="team-info-value">{{ user.memberCount }}人</text>
        </view>
        <view class="team-info-row" v-if="user.routeName">
          <text class="team-info-label">路线</text>
          <text class="team-info-value">{{ user.routeName }}</text>
        </view>
      </view>
      <view class="popup-actions" v-if="type === 'other_team'">
        <view class="popup-btn follow-btn" @tap="onFollow">
          <text>⭐ 关注车队</text>
        </view>
        <view class="popup-btn detail-btn" @tap="onDetail">
          <text>👥 查看成员</text>
        </view>
      </view>

      <!-- Stranger -->
      <view class="popup-actions" v-if="type === 'stranger'">
        <view class="popup-btn follow-btn" @tap="onFollow">
          <text>➕ 关注</text>
        </view>
        <view class="popup-btn homepage-btn" @tap="onHomepage">
          <text>👤 查看主页</text>
        </view>
        <view class="popup-btn message-btn disabled">
          <text>💬 发消息</text>
          <text class="disabled-hint">关注后可发消息</text>
        </view>
      </view>

      <!-- Merchant -->
      <view class="popup-merchant-info" v-if="type === 'merchant'">
        <view class="merchant-product" v-if="user.productName || user.title">
          <text class="merchant-product-name">{{ user.productName || user.title }}</text>
          <view class="merchant-price-row" v-if="user.price !== undefined && user.price !== null">
            <text class="merchant-price">¥{{ user.price }}</text>
            <text class="merchant-original-price" v-if="user.originalPrice">¥{{ user.originalPrice }}</text>
          </view>
          <view class="merchant-tag" v-if="user.discountTag">
            <text>{{ user.discountTag }}</text>
          </view>
        </view>
        <view class="merchant-group-count" v-if="user.groupCount">
          <text>{{ user.groupCount }}人正在拼团</text>
        </view>
      </view>
      <view class="popup-actions" v-if="type === 'merchant'">
        <view class="popup-btn detail-btn" @tap="onDetail">
          <text>📋 查看详情</text>
        </view>
        <view class="popup-btn nav-btn" @tap="onNavigate">
          <text>🧭 导航</text>
        </view>
      </view>

      <!-- POI -->
      <view class="popup-poi-info" v-if="type === 'poi'">
        <view class="poi-type-tag" v-if="user.poiType">
          <text>{{ poiTypeName(user.poiType) }}</text>
        </view>
        <text class="poi-desc" v-if="user.subtitle || user.description">{{ user.subtitle || user.description }}</text>
        <view class="poi-chat-hint" v-if="user.hasChatRoom">
          <text>💬 附近有位置聊天室</text>
        </view>
      </view>
      <view class="popup-actions" v-if="type === 'poi'">
        <view class="popup-btn nav-btn" @tap="onNavigate">
          <text>🧭 导航</text>
        </view>
        <view class="popup-btn chat-btn" v-if="user.hasChatRoom" @tap="onEnterChat">
          <text>💬 进入聊天</text>
        </view>
      </view>

      <!-- ==================== B5: Merchant POI (gas/charge/food/hotel) ==================== -->
      <view class="popup-merchant-poi-info" v-if="type === 'merchant_poi'">
        <view class="mpoi-type-tag" v-if="user.poiType">
          <text>{{ poiTypeName(user.poiType) }}</text>
        </view>
        <view class="mpoi-rating-row" v-if="user.rating || user.distance">
          <text class="mpoi-rating" v-if="user.rating">★ {{ user.rating }}</text>
          <text class="mpoi-distance" v-if="user.distance"> · {{ typeof user.distance === 'number' ? user.distance.toFixed(1) + 'km' : user.distance }}</text>
        </view>
        <text class="mpoi-address" v-if="user.address">📍 {{ user.address }}</text>
      </view>
      <view class="popup-actions" v-if="type === 'merchant_poi'">
        <view class="popup-btn nav-btn" @tap="onNavigate">
          <text>🧭 导航</text>
        </view>
        <view class="popup-btn call-btn" v-if="user.tel" @tap="onCall">
          <text>📞 拨号</text>
        </view>
      </view>

      <!-- ==================== B4: Traffic Event ==================== -->
      <view class="popup-traffic-info" v-if="type === 'traffic_event'">
        <view class="traffic-severity" :class="'severity-' + (user.severity || 'low')">
          <text>{{ severityText(user.severity) }}</text>
        </view>
        <text class="traffic-title">{{ user.title || user.nickname || '路况事件' }}</text>
        <text class="traffic-desc" v-if="user.description">{{ user.description }}</text>
        <view class="traffic-meta" v-if="user.distance">
          <text>📏 距你 {{ typeof user.distance === 'number' ? user.distance.toFixed(1) + 'km' : user.distance }}</text>
        </view>
      </view>
      <view class="popup-actions" v-if="type === 'traffic_event'">
        <view class="popup-btn detour-btn" @tap="onNavigate">
          <text>🧭 绕路方案</text>
        </view>
        <view class="popup-btn forward-btn" @tap="onForwardToChat">
          <text>📤 转发到群聊</text>
        </view>
        <view class="popup-btn nav-btn" @tap="onNavigate">
          <text>📍 导航</text>
        </view>
      </view>

      <!-- ==================== D1: Enhanced Message Preview ==================== -->
      <view class="popup-message-preview" v-if="user.messagePreview">
        <view class="mp-divider"></view>
        <view class="mp-header">
          <text class="mp-label">最近消息</text>
          <view class="mp-unread-dot" v-if="user.messagePreview.isUnread"></view>
        </view>
        <view class="mp-content">
          <text class="mp-sender">{{ user.messagePreview.sender }}:</text>
          <text class="mp-text">{{ user.messagePreview.content }}</text>
        </view>
        <view class="mp-time" v-if="user.messagePreview.time">
          <text>{{ formatTime(user.messagePreview.time) }}</text>
        </view>
      </view>

      <!-- ==================== Last Message Preview (legacy, 向后兼容) ==================== -->
      <view class="popup-last-message" v-else-if="user.lastMessage">
        <view class="last-msg-divider"></view>
        <text class="last-msg-label">最近消息</text>
        <view class="last-msg-content">
          <text class="last-msg-text">{{ user.lastMessage }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'UnifiedPopup',

  props: {
    /**
     * Whether the popup is visible
     */
    visible: {
      type: Boolean,
      default: false
    },

    /**
     * User/marker data object
     * Common fields: id, nickname, avatar, level, levelName, isCertified, distance, speed, lastUpdate, signature, lastMessage
     * Type-specific fields:
     *   other_team: teamName, memberCount, routeName
     *   merchant: merchantName, productName, price, originalPrice, discountTag, groupCount
     *   poi: poiName, poiType, subtitle, hasChatRoom, chatRoomId
     *   merchant_poi (B5): poiType, rating, address, tel
     *   traffic_event (B4): title, description, severity, distance
     *   messagePreview (D1): { sender, content, type, time, isUnread }
     */
    user: {
      type: Object,
      default: function () {
        return {
          id: '',
          nickname: '',
          avatar: '',
          level: 0,
          levelName: '',
          isCertified: false,
          distance: '',
          speed: null,
          lastUpdate: '',
          signature: '',
          lastMessage: null,
          messagePreview: null  // D1: 结构化消息预览 { sender, content, type, time, isUnread }
        };
      }
    },

    /**
     * Popup type:
     * 'teammate'      - team member, show message + homepage
     * 'other_team'    - another team, show follow + view members
     * 'stranger'      - stranger user, show follow + homepage (message disabled)
     * 'merchant'      - merchant / group buy, show detail + navigate
     * 'poi'           - general POI, show navigate + (optional) enter chat
     * 'merchant_poi'  - (B5) 沿途商家(加油/充电/餐厅/酒店),show navigate + call
     * 'traffic_event' - (B4) 路况事件,show detour + forward to chat + navigate
     */
    type: {
      type: String,
      default: 'teammate',
      validator: function (val) {
        return ['teammate', 'other_team', 'stranger', 'merchant', 'poi',
                'merchant_poi', 'traffic_event'].indexOf(val) !== -1;
      }
    }
  },

  methods: {
    /**
     * Close popup
     */
    onClose() {
      this.$emit('close');
    },

    /**
     * Tap on overlay background closes popup
     */
    onOverlayTap() {
      this.$emit('close');
    },

    /**
     * Message button click
     */
    onMessage() {
      this.$emit('message', this.user);
    },

    /**
     * Homepage button click
     */
    onHomepage() {
      this.$emit('homepage', this.user);
    },

    /**
     * Follow button click
     */
    onFollow() {
      this.$emit('follow', this.user);
    },

    /**
     * Navigate button click
     */
    onNavigate() {
      this.$emit('navigate', this.user);
    },

    /**
     * Detail button click
     */
    onDetail() {
      this.$emit('detail', this.user);
    },

    /**
     * Enter chat room
     */
    onEnterChat() {
      if (this.user.chatRoomId) {
        this.$emit('detail', {
          ...this.user,
          action: 'enterChat',
          roomId: this.user.chatRoomId
        });
      }
    },

    /**
     * Format timestamp to relative time string
     */
    formatTime(timeStr) {
      if (!timeStr) return '';

      try {
        const time = new Date(timeStr);
        const now = new Date();
        const diffMs = now - time;
        const diffMin = Math.floor(diffMs / 60000);

        if (diffMin < 1) return '刚刚';
        if (diffMin < 60) return diffMin + '分钟前';

        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return diffHour + '小时前';

        const diffDay = Math.floor(diffHour / 24);
        if (diffDay < 7) return diffDay + '天前';

        // Format as date
        const month = time.getMonth() + 1;
        const day = time.getDate();
        return month + '月' + day + '日';
      } catch (e) {
        return timeStr;
      }
    },

    /**
     * Get human-readable POI type name
     */
    poiTypeName(type) {
      const nameMap = {
        scenic: '景点',
        camp: '营地',
        gas: '加油站',
        gas_station: '加油站',
        charge: '充电站',
        charging_station: '充电站',
        food: '美食',
        restaurant: '美食',
        hotel: '酒店',
        accommodation: '酒店',
        restroom: '卫生间',
        parking: '停车场',
        hospital: '医院',
        rescue: '救援站',
        repair: '维修点',
        convenience: '便利店',
        police: '交警站'
      };
      return nameMap[type] || type || 'POI';
    },

    /**
     * B5: 拨打商家电话
     */
    onCall() {
      if (this.user.tel) {
        uni.makePhoneCall({
          phoneNumber: String(this.user.tel),
          fail: () => {
            uni.showToast({ title: '拨号失败', icon: 'none' });
          }
        });
      }
    },

    /**
     * B4: 转发路况到群聊
     */
    onForwardToChat() {
      this.$emit('forwardToChat', this.user);
    },

    /**
     * B4: 路况严重程度文案
     */
    severityText(severity) {
      const map = { high: '严重拥堵', medium: '中度拥堵', low: '轻微拥堵' };
      return map[severity] || '路况提醒';
    },

    /**
     * B2: 设队长位置为集合点
     */
    onSetMeetup() {
      this.$emit('setMeetup', this.user);
    }
  }
};
</script>

<style lang="scss" scoped>
// ==================== Overlay ====================
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  // H5 底部 tabBar 的 z-index 为 998,浮窗必须高于它,否则底部按钮被 tabBar 遮挡
  z-index: 2000;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: overlayFadeIn 0.22s ease;
}

@keyframes overlayFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

// ==================== Container ====================
.popup-container {
  position: relative;
  width: 100%;
  max-width: 700rpx;
  background: #FFFFFF;
  border-radius: 32rpx 32rpx 0 0;
  padding: 36rpx 32rpx 40rpx;
  padding-bottom: calc(40rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -8rpx 40rpx rgba(0, 0, 0, 0.12);
  animation: popupSlideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  max-height: 70vh;
  overflow-y: auto;
}

.popup-leave {
  animation: popupSlideDown 0.22s cubic-bezier(0.32, 0.72, 0, 1) forwards;
}

@keyframes popupSlideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes popupSlideDown {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}

// ==================== Close Button ====================
.popup-close {
  position: absolute;
  top: 24rpx;
  right: 28rpx;
  width: 48rpx;
  height: 48rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F5F5F5;
  border-radius: 50%;
  z-index: 10;

  text {
    font-size: 24rpx;
    color: #999;
  }

  &:active {
    background: #E8E8E8;
  }
}

// ==================== Header ====================
.popup-header {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 24rpx;
}

.popup-avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: #F5F5F5;
  border: 3rpx solid #F0F0F0;
  flex-shrink: 0;
}

.popup-user-info {
  flex: 1;
  min-width: 0;
}

.popup-name-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 6rpx;
  flex-wrap: wrap;
}

.popup-nickname {
  font-size: 34rpx;
  font-weight: 700;
  color: #1A1A1A;
  max-width: 260rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.popup-level {
  padding: 2rpx 12rpx;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  border-radius: 12rpx;
  flex-shrink: 0;

  text {
    font-size: 20rpx;
    color: #FFFFFF;
    font-weight: 700;
  }
}

.popup-cert {
  padding: 2rpx 10rpx;
  background: rgba(7, 193, 96, 0.1);
  border-radius: 10rpx;
  flex-shrink: 0;

  text {
    font-size: 18rpx;
    color: #07C160;
    font-weight: 600;
  }
}

/* B2: 设为集合点按钮 - 金色主题 */
.meetup-btn {
  background: linear-gradient(135deg, #FFB300, #FF8F00) !important;
  color: #FFFFFF !important;
  border: none !important;

  text {
    color: #FFFFFF !important;
    font-weight: 600;
  }
}

.popup-level-name {
  font-size: 24rpx;
  color: #999;
}

// ==================== Location Info ====================
.popup-location-info {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 20rpx;
  padding: 16rpx 20rpx;
  background: #F9FAFB;
  border-radius: 16rpx;
}

.loc-info-item {
  display: flex;
  align-items: center;
  gap: 6rpx;
}

.loc-info-icon {
  font-size: 22rpx;
}

.loc-info-text {
  font-size: 24rpx;
  color: #666;
}

// ==================== Signature ====================
.popup-signature {
  display: flex;
  align-items: flex-start;
  gap: 6rpx;
  margin-bottom: 24rpx;
  padding: 16rpx 20rpx;
  background: #FFFDF5;
  border-radius: 16rpx;
  border-left: 4rpx solid #F5A623;
}

.sig-icon {
  font-size: 28rpx;
  color: #F5A623;
  line-height: 1;
  flex-shrink: 0;
}

.sig-text {
  font-size: 24rpx;
  color: #666;
  line-height: 1.5;
}

// ==================== Team Info (other_team) ====================
.popup-team-info {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-bottom: 20rpx;
  padding: 16rpx 20rpx;
  background: #F0F7FF;
  border-radius: 16rpx;
}

.team-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.team-info-label {
  font-size: 24rpx;
  color: #999;
}

.team-info-value {
  font-size: 24rpx;
  color: #1A1A1A;
  font-weight: 500;
}

// ==================== Merchant Info ====================
.popup-merchant-info {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-bottom: 20rpx;
  padding: 16rpx 20rpx;
  background: #FFF8F0;
  border-radius: 16rpx;
}

.merchant-product-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #1A1A1A;
}

.merchant-price-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  margin-top: 8rpx;
}

.merchant-price {
  font-size: 36rpx;
  font-weight: 800;
  color: #FF6B35;
}

.merchant-original-price {
  font-size: 24rpx;
  color: #BBB;
  text-decoration: line-through;
}

.merchant-tag {
  align-self: flex-start;
  padding: 4rpx 12rpx;
  background: linear-gradient(135deg, #FF6B35, #E55D2B);
  border-radius: 8rpx;
  margin-top: 4rpx;

  text {
    font-size: 20rpx;
    color: #FFFFFF;
    font-weight: 600;
  }
}

.merchant-group-count {
  text {
    font-size: 24rpx;
    color: #FF6B35;
    font-weight: 500;
  }
}

// ==================== POI Info ====================
.popup-poi-info {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-bottom: 20rpx;
  padding: 16rpx 20rpx;
  background: #F5F5F5;
  border-radius: 16rpx;
}

.poi-type-tag {
  align-self: flex-start;
  padding: 4rpx 14rpx;
  background: #E8F5E9;
  border-radius: 10rpx;

  text {
    font-size: 22rpx;
    color: #07C160;
    font-weight: 600;
  }
}

.poi-desc {
  font-size: 24rpx;
  color: #666;
  line-height: 1.5;
}

.poi-chat-hint {
  margin-top: 4rpx;

  text {
    font-size: 24rpx;
    color: #9B59B6;
  }
}

// ==================== Action Buttons ====================
.popup-actions {
  display: flex;
  gap: 16rpx;
  margin-top: 8rpx;
}

.popup-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 80rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  font-weight: 500;
  transition: all 0.15s ease;

  &:active {
    transform: scale(0.97);
    opacity: 0.85;
  }

  &.message-btn {
    background: rgba(7, 193, 96, 0.08);
    color: #07C160;
  }

  &.homepage-btn {
    background: #F5F5F5;
    color: #1A1A1A;
  }

  &.follow-btn {
    background: rgba(74, 144, 217, 0.08);
    color: #4A90D9;
  }

  &.detail-btn {
    background: rgba(255, 107, 53, 0.08);
    color: #FF6B35;
  }

  &.nav-btn {
    background: rgba(7, 193, 96, 0.08);
    color: #07C160;
  }

  &.chat-btn {
    background: rgba(155, 89, 182, 0.08);
    color: #9B59B6;
  }

  &.disabled {
    background: #F5F5F5;
    color: #CCCCCC;
    pointer-events: none;
  }
}

.disabled-hint {
  font-size: 18rpx;
  color: #CCCCCC;
  margin-top: 2rpx;
}

// ==================== Last Message Preview ====================
.popup-last-message {
  margin-top: 24rpx;
}

.last-msg-divider {
  height: 1rpx;
  background: #F0F0F0;
  margin-bottom: 16rpx;
}

.last-msg-label {
  font-size: 22rpx;
  color: #999;
  margin-bottom: 10rpx;
  display: block;
}

.last-msg-content {
  padding: 16rpx 20rpx;
  background: #F9FAFB;
  border-radius: 16rpx;
}

.last-msg-text {
  font-size: 26rpx;
  color: #666;
  line-height: 1.5;
}

// ==================== B5: Merchant POI Info ====================
.popup-merchant-poi-info {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-bottom: 20rpx;
  padding: 16rpx 20rpx;
  background: #F0FBF5;
  border-radius: 16rpx;
}

.mpoi-type-tag {
  align-self: flex-start;
  padding: 4rpx 14rpx;
  background: #E8F5E9;
  border-radius: 10rpx;

  text {
    font-size: 22rpx;
    color: #07C160;
    font-weight: 600;
  }
}

.mpoi-rating-row {
  display: flex;
  align-items: center;
  gap: 4rpx;
}

.mpoi-rating {
  font-size: 24rpx;
  color: #F5A623;
  font-weight: 600;
}

.mpoi-distance {
  font-size: 24rpx;
  color: #999;
}

.mpoi-address {
  font-size: 22rpx;
  color: #666;
  line-height: 1.5;
}

// ==================== B4: Traffic Event Info ====================
.popup-traffic-info {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-bottom: 20rpx;
  padding: 16rpx 20rpx;
  background: #FFF5F5;
  border-radius: 16rpx;
}

.traffic-severity {
  align-self: flex-start;
  padding: 4rpx 14rpx;
  border-radius: 10rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #FFFFFF;

  &.severity-high {
    background: #E74C3C;
  }

  &.severity-medium {
    background: #F39C12;
  }

  &.severity-low {
    background: #F5A623;
  }
}

.traffic-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1A1A1A;
}

.traffic-desc {
  font-size: 24rpx;
  color: #666;
  line-height: 1.5;
}

.traffic-meta {
  font-size: 22rpx;
  color: #999;
}

// ==================== B4: Traffic Action Buttons ====================
.popup-btn {
  &.call-btn {
    background: rgba(52, 152, 219, 0.08);
    color: #3498DB;
  }

  &.forward-btn {
    background: rgba(231, 76, 60, 0.08);
    color: #E74C3C;
  }

  &.detour-btn {
    background: rgba(243, 156, 18, 0.08);
    color: #F39C12;
  }
}

// ==================== D1: Enhanced Message Preview ====================
.popup-message-preview {
  margin-top: 24rpx;
}

.mp-divider {
  height: 1rpx;
  background: #F0F0F0;
  margin-bottom: 16rpx;
}

.mp-header {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 10rpx;
}

.mp-label {
  font-size: 22rpx;
  color: #999;
}

.mp-unread-dot {
  width: 14rpx;
  height: 14rpx;
  background: #E74C3C;
  border-radius: 50%;
}

.mp-content {
  padding: 16rpx 20rpx;
  background: #F9FAFB;
  border-radius: 16rpx;
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  flex-wrap: wrap;
}

.mp-sender {
  font-size: 24rpx;
  color: #4A90D9;
  font-weight: 600;
  flex-shrink: 0;
}

.mp-text {
  font-size: 26rpx;
  color: #1A1A1A;
  line-height: 1.5;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.mp-time {
  margin-top: 8rpx;

  text {
    font-size: 20rpx;
    color: #BBB;
  }
}
</style>
