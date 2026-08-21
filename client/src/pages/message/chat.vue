<template>
  <view class="chat-page">
    <!-- 自定义导航栏 -->
    <view class="chat-navbar">
      <view class="navbar-left" @click="goBack">
        <text class="back-icon">&#8592;</text>
      </view>
      <view class="navbar-center" @click="onTitleTap">
        <text class="navbar-title text-ellipsis">{{ sessionName }}</text>
        <text v-if="sessionStatus" class="navbar-subtitle">{{ sessionStatus }}</text>
      </view>
      <view class="navbar-right">
        <text class="more-icon" @click="onMore">⋯</text>
      </view>
    </view>

    <!-- 消息列表 -->
    <scroll-view
      class="message-list"
      scroll-y
      :scroll-into-view="scrollToId"
      :scroll-with-animation="true"
      :refresher-enabled="true"
      :refresher-triggered="loadingMore"
      refresher-background="#f5f5f5"
      @refresherrefresh="onLoadMore"
    >
      <!-- 加载失败提示 -->
      <view v-if="loadFailed" class="load-failed-tip">
        <text class="load-failed-text">消息加载失败，请检查网络后重试</text>
        <view class="load-failed-btn" @click="loadSessionDetail">
          <text>重新加载</text>
        </view>
      </view>

      <!-- 加载更多提示 -->
      <view v-if="!loadFailed && hasMore" class="load-more-tip">
        <text class="load-more-text">{{ loadingMore ? '加载中...' : '下拉加载更多' }}</text>
      </view>
      <view v-else-if="!loadFailed" class="load-more-tip">
        <text class="load-more-text">没有更多消息了</text>
      </view>

      <!-- 消息列表 -->
      <view
        v-for="msg in messages"
        :key="msg.id"
        :id="'msg-' + msg.id"
      >
        <!-- 系统消息 -->
        <view v-if="msg.type === 'system'" class="msg-system">
          <view class="system-tag">
            <text class="system-text">{{ msg.content }}</text>
          </view>
        </view>

        <!-- 时间分隔 -->
        <view v-if="msg.showTime" class="msg-time-divider">
          <text class="time-text">{{ formatMessageTime(msg.createTime) }}</text>
        </view>

        <!-- 他人消息（左侧） -->
        <view v-if="msg.type !== 'system' && !msg.mine" class="msg-row msg-left">
                    <view class="msg-avatar">
            <local-image style="width:100%;height:100%;"
            :src="msg.avatar || '/static/default-avatar.png'"
           
            mode="aspectFill"
            @click="onAvatarTap(msg)"
           />
          </view>
          <view class="msg-body-left">
            <text v-if="showNicknames" class="msg-nickname">{{ msg.nickname }}</text>
            <!-- 文本消息 -->
            <view v-if="msg.type === 'text'" class="msg-bubble msg-bubble-other">
              <text class="bubble-text">{{ msg.content }}</text>
            </view>
            <!-- 图片消息 -->
            <image
              v-else-if="msg.type === 'image'"
              :src="msg.content"
              class="msg-image"
              mode="widthFix"
              @click="previewImage(msg)"
            />
            <!-- 语音消息 -->
            <view
              v-else-if="msg.type === 'voice'"
              class="msg-voice-bubble"
              :class="msg.mine ? 'voice-mine' : 'voice-other'"
              @click="playVoice(msg)"
            >
              <text class="voice-icon">{{ playingVoiceId === msg.id ? '🔊' : '🔈' }}</text>
              <view class="voice-wave" :class="{ playing: playingVoiceId === msg.id }">
                <text
                  v-for="n in 12"
                  :key="n"
                  class="wave-bar"
                  :style="{ height: voiceWaveHeight(msg, n) }"
                ></text>
              </view>
              <text class="voice-duration">{{ msg.duration ? msg.duration + '″' : '语音' }}</text>
            </view>
            <!-- 位置消息 -->
            <view v-else-if="msg.type === 'location'" class="msg-location-card" @click="openLocation(msg)">
                            <view class="location-thumb">
                <local-image style="width:100%;height:100%;"
                v-if="getMapThumbnail(msg)"
                :src="getMapThumbnail(msg)"
               
                mode="aspectFill"
               />
                <view v-else class="location-thumb location-thumb-fallback">
                  <text class="fallback-icon">📍</text>
                  <text class="fallback-coords">{{ msg.latitude && msg.longitude ? msg.latitude.toFixed(4) + ', ' + msg.longitude.toFixed(4) : '' }}</text>
                </view>
              </view>
              <view class="location-info">
                <text class="location-name">{{ msg.locationName || '位置信息' }}</text>
                <text class="location-addr">{{ msg.locationAddress || '' }}</text>
              </view>
            </view>
            <!-- 拼团分享消息 -->
            <view v-else-if="msg.type === 'group_buy'" class="msg-group-buy-card" @click="openGroupBuy(msg)">
                            <view class="gb-thumb">
                <local-image style="width:100%;height:100%;"
                :src="msg.productImage || ''"
               
                mode="aspectFill"
               />
              </view>
              <view class="gb-info">
                <text class="gb-title text-ellipsis-2">{{ msg.productTitle || '拼团商品' }}</text>
                <view class="gb-bottom">
                  <text class="gb-price">¥{{ msg.productPrice }}</text>
                  <text class="gb-tag">去参团</text>
                </view>
              </view>
            </view>
            <text class="msg-time-left">{{ formatTime(msg.createTime) }}</text>
          </view>
        </view>

        <!-- 自己消息（右侧） -->
        <view v-if="msg.type !== 'system' && msg.mine" class="msg-row msg-right">
          <view class="msg-body-right">
            <!-- 文本消息 -->
            <view v-if="msg.type === 'text'" class="msg-bubble msg-bubble-mine">
              <text class="bubble-text">{{ msg.content }}</text>
            </view>
            <!-- 图片消息 -->
            <image
              v-else-if="msg.type === 'image'"
              :src="msg.content"
              class="msg-image"
              mode="widthFix"
              @click="previewImage(msg)"
            />
            <!-- 语音消息 -->
            <view
              v-else-if="msg.type === 'voice'"
              class="msg-voice-bubble voice-mine"
              @click="playVoice(msg)"
            >
              <text class="voice-icon">{{ playingVoiceId === msg.id ? '🔊' : '🔈' }}</text>
              <view class="voice-wave" :class="{ playing: playingVoiceId === msg.id }">
                <text
                  v-for="n in 12"
                  :key="n"
                  class="wave-bar"
                  :style="{ height: voiceWaveHeight(msg, n) }"
                ></text>
              </view>
              <text class="voice-duration">{{ msg.duration ? msg.duration + '″' : '语音' }}</text>
            </view>
            <!-- 位置消息 -->
            <view v-else-if="msg.type === 'location'" class="msg-location-card" @click="openLocation(msg)">
                            <view class="location-thumb">
                <local-image style="width:100%;height:100%;"
                v-if="getMapThumbnail(msg)"
                :src="getMapThumbnail(msg)"
               
                mode="aspectFill"
               />
                <view v-else class="location-thumb location-thumb-fallback">
                  <text class="fallback-icon">📍</text>
                  <text class="fallback-coords">{{ msg.latitude && msg.longitude ? msg.latitude.toFixed(4) + ', ' + msg.longitude.toFixed(4) : '' }}</text>
                </view>
              </view>
              <view class="location-info">
                <text class="location-name">{{ msg.locationName || '位置信息' }}</text>
                <text class="location-addr">{{ msg.locationAddress || '' }}</text>
              </view>
            </view>
            <!-- 拼团分享消息 -->
            <view v-else-if="msg.type === 'group_buy'" class="msg-group-buy-card" @click="openGroupBuy(msg)">
                            <view class="gb-thumb">
                <local-image style="width:100%;height:100%;"
                :src="msg.productImage || ''"
               
                mode="aspectFill"
               />
              </view>
              <view class="gb-info">
                <text class="gb-title text-ellipsis-2">{{ msg.productTitle || '拼团商品' }}</text>
                <view class="gb-bottom">
                  <text class="gb-price">¥{{ msg.productPrice }}</text>
                  <text class="gb-tag">去参团</text>
                </view>
              </view>
            </view>
            <!-- 发送状态 -->
            <view class="msg-status">
              <text v-if="msg.sending" class="status-sending">发送中...</text>
              <text v-else-if="msg.failed" class="status-failed" @click="resendMessage(msg)">发送失败，点击重发</text>
            </view>
            <text class="msg-time-right">{{ formatTime(msg.createTime) }}</text>
          </view>
        </view>
      </view>

      <!-- 底部占位，防止被输入框遮挡 -->
      <view class="list-bottom-placeholder"></view>
    </scroll-view>

    <!-- 底部输入栏 -->
    <view class="input-bar safe-area-bottom">
      <!-- 附件按钮 -->
      <view class="input-btn" @click="onAttachment">
        <text class="btn-icon">📎</text>
      </view>

      <!-- 对讲按钮（长按录音） -->
      <view
        class="input-btn ptt-btn"
        :class="{ recording: recordingVoice }"
        @touchstart.prevent="onPTTStart"
        @touchend.prevent="onPTTEnd"
        @touchcancel.prevent="onPTTEnd"
      >
        <text class="btn-icon">{{ recordingVoice ? '🔴' : '🎙' }}</text>
      </view>

      <!-- 输入框 -->
      <input
        v-model="inputText"
        class="text-input"
        type="text"
        :placeholder="inputPlaceholder"
        :adjust-position="true"
        :hold-keyboard="true"
        confirm-type="send"
        @confirm="sendText"
        @focus="onInputFocus"
        @blur="onInputBlur"
      />

      <!-- emoji 按钮 -->
      <view class="input-btn" @click="onEmoji">
        <text class="btn-icon">😊</text>
      </view>

      <!-- 发送按钮（有文字时显示） -->
      <view v-if="inputText.trim()" class="send-btn" @click="sendText">
        <text class="send-text">发送</text>
      </view>
    </view>

    <!-- 附件操作菜单 -->
    <view v-if="showActionSheet" class="action-sheet-mask" @click="showActionSheet = false">
      <view class="action-sheet" @click.stop>
        <view class="sheet-title">发送附件</view>
        <view class="sheet-grid">
          <view class="sheet-item" @click="onChooseImage">
            <text class="sheet-icon">🖼</text>
            <text class="sheet-label">相册</text>
          </view>
          <view class="sheet-item" @click="onTakePhoto">
            <text class="sheet-icon">📷</text>
            <text class="sheet-label">拍照</text>
          </view>
          <view class="sheet-item" @click="onSendLocation">
            <text class="sheet-icon">📍</text>
            <text class="sheet-label">位置</text>
          </view>
          <view class="sheet-item" @click="onShareGroupBuy">
            <text class="sheet-icon">🛒</text>
            <text class="sheet-label">拼团分享</text>
          </view>
        </view>
        <view class="sheet-cancel" @click="showActionSheet = false">
          <text>取消</text>
        </view>
      </view>
    </view>

    <!-- 表情选择面板 -->
    <view v-if="showEmojiSheet" class="emoji-sheet">
      <view
        v-for="emoji in emojiList"
        :key="emoji"
        class="emoji-item"
        @click="insertEmoji(emoji)"
      >
        <text class="emoji-text">{{ emoji }}</text>
      </view>
    </view>

    <!-- 录音中浮层 -->
    <view v-if="recordingVoice" class="record-overlay">
      <view class="record-card">
        <text class="record-icon">🔴</text>
        <text class="record-text">{{ recordTip }}</text>
        <text class="record-time">{{ recordSeconds }}s</text>
      </view>
    </view>

    <!-- 对方正在对讲提示 -->
    <view v-if="remoteSpeaking" class="remote-ptt-tip">
      <text class="remote-ptt-dot">🎙</text>
      <text class="remote-ptt-text">队友正在对讲…</text>
    </view>
  </view>
</template>

<script>
import { useChatStore } from '@/store/chat.js';
import { useUserStore } from '@/store/user.js';
import { useTripStore } from '@/store/trip.js';
import { upload, chatApi, userApi } from '@/utils/api.js';
import { PttClient } from '@/utils/ptt.js';

export default {
  data() {
    return {
      sessionId: '',
      isReadonly: false,
      inputText: '',
      inputPlaceholder: '输入消息...',
      showActionSheet: false,
      scrollToId: '',
      currentPage: 1,
      loadingMore: false,
      hasMore: true,
      pageSize: 20,
      showNicknames: true,
      loadFailed: false,

      // ---- 语音对讲 ----
      recordingVoice: false,
      recordSeconds: 0,
      recordTip: '录音中，松开发送',
      recordTimer: null,
      recorderManager: null,
      playingVoiceId: null,
      audioCtx: null,

      // ---- 表情 ----
      showEmojiSheet: false,
      emojiList: ['😀','😄','😁','😂','🤣','😊','😍','😘','😜','🤔','😎','😭','😡','👍','👎','👏','🙏','💪','🤝','🚗','🛣️','⛽','🔋','🏔️','⛺','🏕️','🍜','🍢','☕','📷','📍','🗺️','🚩','🆘','⚠️','💬','🔥','💰','🎉'],

      // ---- 实时对讲 ----
      pttClient: null,
      remoteSpeaking: false,

      // ---- 报位置目标行程 ----
      shareTripId: ''
    };
  },

  onLoad(options) {
    this.sessionId = options.sessionId || '';
    this.shareTripId = options.tripId || '';
    this.isReadonly = options.readonly === 'true';

    if (this.isReadonly) {
      this.inputPlaceholder = '话题已存档，只读模式';
    }

    this.loadSessionDetail();

    // 实时对讲连接
    this.ensurePtt();

    // 地图"报位置"跳转:把当前位置作为 location 消息发送到本队群聊
    if (options.shareLocation === '1' && options.lat && options.lng) {
      this.shareLocationToTeam(options.lat, options.lng, options.name || '我的位置');
    }
  },

  computed: {
    chatStore() {
      return useChatStore();
    },
    userStore() {
      return useUserStore();
    },
    messages() {
      return this.chatStore.messages || [];
    },
    sessionName() {
      const session = this.chatStore.currentSession;
      return (session && session.name) || '聊天';
    },
    sessionStatus() {
      const session = this.chatStore.currentSession;
      if (!session) return '';
      if (session.type === 'team' && session.tripStatus) {
        return '🚙 ' + session.tripStatus;
      }
      return '';
    }
  },

  onShow() {
    // 标记已读
    if (this.sessionId && !this.isReadonly) {
      this.chatStore.markRead(this.sessionId);
    }
  },

  onUnload() {
    // 关闭实时对讲连接
    if (this.pttClient) {
      this.pttClient.close();
      this.pttClient = null;
    }
  },

  methods: {
    /** 加载会话消息 */
    async loadSessionDetail() {
      if (!this.sessionId) return;
      this.loadFailed = false;
      try {
        const res = await this.chatStore.fetchSessionDetail(this.sessionId, 1);
        this.hasMore = (res && res.hasMore !== undefined) ? res.hasMore : true;
        this.currentPage = 1;
        this.$nextTick(() => {
          this.scrollToBottom();
        });
      } catch (err) {
        this.loadFailed = true;
        uni.showToast({ title: '加载失败', icon: 'none' });
      }
    },

    /** 加载更多 */
    async onLoadMore() {
      if (!this.hasMore || this.loadingMore) return;
      this.loadingMore = true;
      try {
        const res = await this.chatStore.fetchSessionDetail(this.sessionId, this.currentPage + 1);
        if (res) {
          this.currentPage += 1;
          this.hasMore = res.hasMore !== undefined ? res.hasMore : true;
        }
      } catch (err) {
        uni.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        this.loadingMore = false;
      }
    },

    /** 回退 */
    goBack() {
      const pages = getCurrentPages();
      if (pages.length > 1) {
        uni.navigateBack();
      } else {
        uni.switchTab({ url: '/pages/message/index' });
      }
    },

    /** 标题点击 */
    onTitleTap() {
      const session = this.chatStore.currentSession;
      if (!session) return;

      if (session.type === 'team') {
        uni.navigateTo({
          url: '/pages/trip/detail?tripId=' + session.targetId
        });
      } else if (session.type === 'private') {
        uni.navigateTo({
          url: '/pages/user/home?userId=' + session.targetId
        });
      } else if (session.type === 'topic') {
        // 地点话题:展示话题信息(无独立详情页时给出轻量反馈)
        uni.showModal({
          title: session.name || '位置话题',
          content: (session.poiName ? '地点: ' + session.poiName + '\n' : '') +
            '话题成员 ' + (session.memberCount || 0) + ' 人',
          showCancel: false,
          confirmText: '知道了'
        });
      }
    },

    /** 更多 */
    onMore() {
      const type = this.chatStore.currentSession ? this.chatStore.currentSession.type : '';
      const itemList = ['聊天信息', '清空聊天记录'];
      // 车队群/私聊支持退出或删除会话;地点话题不支持
      if (type !== 'topic') {
        itemList.push(type === 'team' ? '退出群聊' : '删除会话');
      }
      if (this.chatStore.currentSession && this.chatStore.currentSession.type === 'private') {
        itemList.push('拉黑', '举报');
      }
      uni.showActionSheet({
        itemList: itemList,
        success: (res) => {
          if (res.tapIndex === 0) {
            this.onChatInfo();
          } else if (res.tapIndex === 1) {
            this.onClearHistory();
          } else if (res.tapIndex === 2 && type !== 'topic') {
            this.onLeaveSession();
          } else if (res.tapIndex === (type !== 'topic' ? 3 : 2)) {
            this.onBlock();
          } else if (res.tapIndex === (type !== 'topic' ? 4 : 3)) {
            this.onReport();
          }
        }
      });
    },

    /** 聊天信息 */
    onChatInfo() {
      if (this.sessionId) {
        uni.navigateTo({
          url: '/pages/message/session-info?sessionId=' + this.sessionId
        });
      }
    },

    /** 清空聊天记录 */
    onClearHistory() {
      uni.showModal({
        title: '确认清空',
        content: '清空后将无法恢复',
        success: async (res) => {
          if (res.confirm) {
            try {
              uni.showLoading({ title: '清空中...' });
              await chatApi.clearSession(this.sessionId);
              uni.hideLoading();
              // 本地同步清空
              this.chatStore.currentMessages = [];
              if (this.chatStore.currentSession) {
                this.chatStore.currentSession.lastMessage = '';
              }
              uni.showToast({ title: '已清空', icon: 'success' });
            } catch (err) {
              uni.hideLoading();
              uni.showToast({ title: (err && err.message) || '清空失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** 退出群聊/删除会话 */
    onLeaveSession() {
      const session = this.chatStore.currentSession;
      const isTeam = session && session.type === 'team';
      uni.showModal({
        title: isTeam ? '退出群聊' : '删除会话',
        content: isTeam
          ? '退出后将不再收到该车队群的消息，确定退出吗？'
          : '删除后聊天记录将从列表中移除，确定删除吗？',
        confirmColor: '#E74C3C',
        success: async (res) => {
          if (res.confirm) {
            try {
              uni.showLoading({ title: isTeam ? '退出中...' : '删除中...' });
              await chatApi.leaveSession(this.sessionId);
              uni.hideLoading();
              this.chatStore.removeSession(this.sessionId);
              uni.showToast({ title: isTeam ? '已退出群聊' : '已删除会话', icon: 'success' });
              setTimeout(() => this.goBack(), 1200);
            } catch (err) {
              uni.hideLoading();
              uni.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** 拉黑 */
    onBlock() {
      const session = this.chatStore.currentSession;
      if (!session) return;
      uni.showModal({
        title: '确认拉黑',
        content: '拉黑后将不再收到该用户的消息',
        success: async (res) => {
          if (res.confirm) {
            try {
              await userApi.blockUser(session.targetId);
              this.chatStore.removeSession(session.id);
              uni.showToast({ title: '已拉黑', icon: 'none' });
              setTimeout(() => this.goBack(), 1500);
            } catch (err) {
              uni.showToast({ title: '操作失败', icon: 'none' });
            }
          }
        }
      });
    },

    /** 举报 */
    onReport() {
      uni.showToast({ title: '已提交举报', icon: 'none' });
    },

    /** 发送文字消息 */
    sendText() {
      const text = this.inputText.trim();
      if (!text || this.isReadonly) return;

      const tempId = 'temp_' + Date.now();
      const msg = {
        id: tempId,
        type: 'text',
        content: text,
        mine: true,
        createTime: new Date().toISOString(),
        sending: true
      };

      this.chatStore.currentMessages.push(msg);
      this.inputText = '';
      this.$nextTick(() => this.scrollToBottom());

      this.chatStore.sendMessage(this.sessionId, { type: 'text', content: text })
        .then((result) => {
          const index = this.chatStore.currentMessages.findIndex((m) => m.id === tempId);
          if (index !== -1) {
            this.chatStore.currentMessages[index] = { ...result, mine: true };
          }
        })
        .catch(() => {
          const index = this.chatStore.currentMessages.findIndex((m) => m.id === tempId);
          if (index !== -1) {
            this.chatStore.currentMessages[index].sending = false;
            this.chatStore.currentMessages[index].failed = true;
          }
        });
    },

    /** 重新发送 */
    resendMessage(msg) {
      msg.sending = true;
      msg.failed = false;
      this.chatStore.sendMessage(this.sessionId, { type: 'text', content: msg.content })
        .then((result) => {
          Object.assign(msg, { ...result, mine: true, sending: false, failed: false });
        })
        .catch(() => {
          msg.sending = false;
          msg.failed = true;
        });
    },

    /** 附件按钮 */
    onAttachment() {
      if (this.isReadonly) {
        uni.showToast({ title: '只读模式', icon: 'none' });
        return;
      }
      this.showActionSheet = true;
    },

    /** 从相册选择 */
    onChooseImage() {
      this.showActionSheet = false;
      uni.chooseImage({
        count: 9,
        sizeType: ['compressed'],
        sourceType: ['album'],
        success: (res) => {
          res.tempFilePaths.forEach((path) => {
            this.uploadAndSendImage(path);
          });
        }
      });
    },

    /** 拍照 */
    onTakePhoto() {
      this.showActionSheet = false;
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['camera'],
        success: (res) => {
          res.tempFilePaths.forEach((path) => {
            this.uploadAndSendImage(path);
          });
        }
      });
    },

    /** 上传图片并发送 */
    async uploadAndSendImage(filePath) {
      const tempId = 'temp_img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const localMsg = {
        id: tempId,
        type: 'image',
        content: filePath,
        mine: true,
        createTime: new Date().toISOString(),
        sending: true
      };
      this.chatStore.currentMessages.push(localMsg);
      this.$nextTick(() => this.scrollToBottom());

      try {
        const result = await upload('/upload/image', filePath);
        const url = result.url || result;
        await this.chatStore.sendMessage(this.sessionId, { type: 'image', content: url });
        const index = this.chatStore.currentMessages.findIndex((m) => m.id === tempId);
        if (index !== -1) {
          this.chatStore.currentMessages[index] = {
            id: result.id || tempId,
            type: 'image',
            content: url,
            mine: true,
            createTime: new Date().toISOString(),
            sending: false
          };
        }
      } catch (err) {
        const index = this.chatStore.currentMessages.findIndex((m) => m.id === tempId);
        if (index !== -1) {
          this.chatStore.currentMessages[index].sending = false;
          this.chatStore.currentMessages[index].failed = true;
        }
      }
    },

    /** 发送位置 */
    onSendLocation() {
      this.showActionSheet = false;
      uni.chooseLocation({
        success: async (res) => {
          const locationData = {
            type: 'location',
            content: res.address,
            locationName: res.name,
            locationAddress: res.address,
            latitude: res.latitude,
            longitude: res.longitude
          };

          const tempId = 'temp_loc_' + Date.now();
          const localMsg = {
            id: tempId,
            ...locationData,
            mine: true,
            createTime: new Date().toISOString(),
            sending: true
          };
          this.chatStore.currentMessages.push(localMsg);
          this.$nextTick(() => this.scrollToBottom());

          try {
            const result = await this.chatStore.sendMessage(this.sessionId, locationData);
            const index = this.chatStore.currentMessages.findIndex((m) => m.id === tempId);
            if (index !== -1) {
              this.chatStore.currentMessages[index] = { ...result, mine: true, sending: false };
            }
          } catch (err) {
            const index = this.chatStore.currentMessages.findIndex((m) => m.id === tempId);
            if (index !== -1) {
              this.chatStore.currentMessages[index].sending = false;
              this.chatStore.currentMessages[index].failed = true;
            }
          }
        }
      });
    },

    /** 分享拼团 */
    onShareGroupBuy() {
      this.showActionSheet = false;
      uni.navigateTo({
        url: '/pages/group-buy/activity?mode=share'
      });
    },

    /** 对讲按钮 - 开始录音 */
    onPTTStart() {
      if (this.isReadonly) {
        uni.showToast({ title: '只读模式', icon: 'none' });
        return;
      }
      if (!this.sessionId) {
        uni.showToast({ title: '请先进入一个会话', icon: 'none' });
        return;
      }

      this.recordingVoice = true;
      this.recordSeconds = 0;
      this.recordTip = '录音中，松开发送';

      // 实时对讲流(与语音消息并行)
      this.ensurePtt();
      if (this.pttClient) {
        this.pttClient.start();
      }

      if (!this.recorderManager) {
        this.recorderManager = uni.getRecorderManager();
        this.recorderManager.onStop((res) => {
          this.recordingVoice = false;
          if (this.recordTimer) {
            clearInterval(this.recordTimer);
            this.recordTimer = null;
          }
          if (res && res.tempFilePath) {
            this.uploadAndSendVoice(res.tempFilePath, this.recordSeconds);
          }
        });
        this.recorderManager.onError((err) => {
          this.recordingVoice = false;
          if (this.recordTimer) {
            clearInterval(this.recordTimer);
            this.recordTimer = null;
          }
          console.warn('[Voice] recorder error:', err);
          uni.showToast({ title: '录音失败，请重试', icon: 'none' });
        });
      }

      // 超时上限 60s 自动结束
      this.recordTimer = setInterval(() => {
        this.recordSeconds += 1;
        if (this.recordSeconds >= 60) {
          this.recordTip = '已达60秒，自动发送';
          this.stopRecording();
        }
      }, 1000);

      try {
        this.recorderManager.start({
          duration: 60000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'mp3'
        });
      } catch (err) {
        console.warn('[Voice] start failed:', err);
        this.recordingVoice = false;
        uni.showToast({ title: '录音启动失败', icon: 'none' });
      }
    },

    /** 对讲按钮 - 结束录音 */
    onPTTEnd() {
      if (!this.recordingVoice) return;
      if (this.pttClient) {
        this.pttClient.stop();
      }
      if (this.recordSeconds < 1) {
        this.recordTip = '说话时间太短';
        this.stopRecording();
        uni.showToast({ title: '说话时间太短', icon: 'none' });
        return;
      }
      this.recordTip = '正在发送...';
      this.stopRecording();
    },

    stopRecording() {
      try {
        if (this.recorderManager) {
          this.recorderManager.stop();
        }
      } catch (err) {
        console.warn('[Voice] stop failed:', err);
      }
    },

    /** 确保对讲客户端就绪 */
    ensurePtt() {
      if (!this.sessionId) return;
      if (this.pttClient && String(this.pttClient.sessionId) === String(this.sessionId)) return;
      if (this.pttClient) {
        this.pttClient.close();
        this.pttClient = null;
      }
      this.pttClient = new PttClient({
        sessionId: this.sessionId,
        onEvent: (state, senderId) => {
          if (state === 'remote_start') {
            this.remoteSpeaking = true;
          } else if (state === 'remote_end') {
            this.remoteSpeaking = false;
          }
        }
      });
      this.pttClient.connect();
    },

    /** 上传并发送语音消息 */
    async uploadAndSendVoice(filePath, duration) {
      const tempId = 'temp_voice_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const localMsg = {
        id: tempId,
        type: 'voice',
        content: filePath,
        duration: Math.max(1, Math.round(duration || 1)),
        mine: true,
        createTime: new Date().toISOString(),
        sending: true
      };
      this.chatStore.currentMessages.push(localMsg);
      this.$nextTick(() => this.scrollToBottom());

      try {
        const result = await upload('/upload/audio', filePath, {}, { showError: false });
        const url = (result && result.url) || result || '';
        if (!url) throw new Error('上传失败');
        await this.chatStore.sendMessage(this.sessionId, {
          type: 'voice',
          content: url,
          extra: { voice: { duration: Math.max(1, Math.round(duration || 1)) } }
        });
        const index = this.chatStore.currentMessages.findIndex((m) => m.id === tempId);
        if (index !== -1) {
          this.chatStore.currentMessages[index].sending = false;
          this.chatStore.currentMessages[index].content = url;
        }
      } catch (err) {
        const index = this.chatStore.currentMessages.findIndex((m) => m.id === tempId);
        if (index !== -1) {
          this.chatStore.currentMessages[index].sending = false;
          this.chatStore.currentMessages[index].failed = true;
        }
        uni.showToast({ title: '语音发送失败', icon: 'none' });
      }
    },

    /** 播放语音消息 */
    playVoice(msg) {
      const url = msg.voiceUrl || msg.content;
      if (!url) return;

      if (this.playingVoiceId === msg.id) {
        if (this.audioCtx) {
          this.audioCtx.stop();
        }
        this.playingVoiceId = null;
        return;
      }

      if (this.audioCtx) {
        this.audioCtx.destroy();
        this.audioCtx = null;
      }

      const ctx = uni.createInnerAudioContext();
      ctx.src = url;
      this.audioCtx = ctx;
      this.playingVoiceId = msg.id;

      ctx.onEnded(() => {
        this.playingVoiceId = null;
      });
      ctx.onError((err) => {
        console.warn('[Voice] play failed:', err);
        this.playingVoiceId = null;
        uni.showToast({ title: '播放失败', icon: 'none' });
      });

      ctx.play();
    },

    /** 语音波形高度（按消息 id 生成稳定伪随机） */
    voiceWaveHeight(msg, n) {
      const seed = String(msg.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      const heights = [8, 16, 24, 14, 30, 20, 12, 26, 18, 10, 22, 28];
      const idx = (seed + n * 3) % heights.length;
      return (heights[idx] * 0.8 + 8) + 'rpx';
    },

    /** 地图"报位置"跳转 - 发送位置到本队群聊 */
    async shareLocationToTeam(lat, lng, name) {
      try {
        if (this.sessionId) {
          await this.chatStore.sendMessage(this.sessionId, {
            type: 'location',
            content: name || '我的位置',
            locationName: name || '我的位置',
            locationAddress: '',
            latitude: parseFloat(lat),
            longitude: parseFloat(lng),
            extra: {
              location: {
                name: name || '我的位置',
                address: '',
                lat: parseFloat(lat),
                lng: parseFloat(lng)
              }
            }
          });
          uni.showToast({ title: '位置已发送到群聊', icon: 'success' });
        } else {
          await this.chatStore.fetchSessions('team');
          const teamSessions = (this.chatStore.sessions || []).filter((s) => s.type === 'team');
          // 优先:跳转参数指定的行程 -> 当前进行中的行程 -> 第一个车队群
          let teamSession = null;
          if (this.shareTripId) {
            teamSession = teamSessions.find((s) => String(s.tripId) === String(this.shareTripId));
          }
          if (!teamSession) {
            const tripStore = useTripStore();
            const current = tripStore.currentTrip;
            if (current && current.id) {
              teamSession = teamSessions.find((s) => String(s.tripId) === String(current.id));
            }
          }
          if (!teamSession) {
            teamSession = teamSessions[0];
          }
          if (teamSession) {
            // 进入该车队群聊会话,让发送的位置消息可见
            this.sessionId = String(teamSession.id);
            this.chatStore.setCurrentSession(teamSession);
            this.loadSessionDetail();
            this.ensurePtt();
            await this.chatStore.sendMessage(teamSession.id, {
              type: 'location',
              content: name || '我的位置',
              locationName: name || '我的位置',
              locationAddress: '',
              latitude: parseFloat(lat),
              longitude: parseFloat(lng),
              extra: {
                location: {
                  name: name || '我的位置',
                  address: '',
                  lat: parseFloat(lat),
                  lng: parseFloat(lng)
                }
              }
            });
            uni.showToast({ title: '位置已发送到群聊', icon: 'success' });
          } else {
            uni.showToast({ title: '暂无车队群聊', icon: 'none' });
          }
        }
      } catch (err) {
        console.warn('[Chat] share location failed:', err);
        uni.showToast({ title: '位置发送失败', icon: 'none' });
      }
    },

    /** emoji 按钮 */
    onEmoji() {
      this.showEmojiSheet = !this.showEmojiSheet;
      if (this.showActionSheet) {
        this.showActionSheet = false;
      }
    },

    /** 插入表情到输入框 */
    insertEmoji(emoji) {
      this.inputText += emoji;
      this.showEmojiSheet = false;
    },

    /** 输入框聚焦 */
    onInputFocus() {
      this.$nextTick(() => this.scrollToBottom());
    },

    /** 输入框失焦 */
    onInputBlur() {
      // 保持键盘不收起
    },

    /** 预览图片 */
    previewImage(msg) {
      const urls = this.messages
        .filter((m) => m.type === 'image')
        .map((m) => m.content);
      uni.previewImage({
        urls: urls,
        current: msg.content
      });
    },

    /** 打开位置 */
    openLocation(msg) {
      uni.openLocation({
        latitude: msg.latitude || 0,
        longitude: msg.longitude || 0,
        name: msg.locationName || '',
        address: msg.locationAddress || ''
      });
    },

    /** 打开拼团详情 */
    openGroupBuy(msg) {
      if (msg.activityId) {
        uni.navigateTo({
          url: '/pages/group-buy/activity?id=' + msg.activityId
        });
      }
    },

    /** 点击头像 */
    onAvatarTap(msg) {
      if (msg.userId) {
        uni.navigateTo({
          url: '/pages/user/home?userId=' + msg.userId
        });
      }
    },

    /** 获取地图缩略图 */
    getMapThumbnail(msg) {
      // 无真实地图静态图 key 时不请求外部服务,由前端占位视图展示
      // 接入腾讯/高德静态图后,在此返回拼接 URL 即可
      return '';
    },

    /** 滚动到底部 */
    scrollToBottom() {
      if (this.messages.length > 0) {
        const lastMsg = this.messages[this.messages.length - 1];
        this.scrollToId = 'msg-' + lastMsg.id;
      }
    },

    /** 格式化消息时间为简短形式 */
    formatTime(timeStr) {
      if (!timeStr) return '';
      const date = new Date(timeStr);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return hours + ':' + minutes;
    },

    /** 格式化消息时间（带日期） */
    formatMessageTime(timeStr) {
      if (!timeStr) return '';
      const now = new Date();
      const date = new Date(timeStr);
      const diff = now - date;

      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const time = hours + ':' + minutes;

      if (diff < 86400000 && date.getDate() === now.getDate()) {
        return time;
      }

      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.getDate() === yesterday.getDate() &&
          date.getMonth() === yesterday.getMonth() &&
          date.getFullYear() === yesterday.getFullYear()) {
        return '昨天 ' + time;
      }

      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return month + '/' + day + ' ' + time;
    }
  }
};
</script>

<style lang="scss" scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-bg);
}

// 自定义导航栏
.chat-navbar {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 16rpx;
  background-color: var(--color-bg-white);
  border-bottom: 1rpx solid var(--color-border);

  .navbar-left {
    width: 80rpx;
    display: flex;
    align-items: center;
    justify-content: center;

    .back-icon {
      font-size: 40rpx;
      color: var(--color-text-primary);
      font-weight: 300;
    }
  }

  .navbar-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;

    .navbar-title {
      font-size: var(--font-lg);
      font-weight: 500;
      color: var(--color-text-primary);
      max-width: 400rpx;
    }

    .navbar-subtitle {
      font-size: 20rpx;
      color: var(--color-primary);
    }
  }

  .navbar-right {
    width: 80rpx;
    display: flex;
    align-items: center;
    justify-content: center;

    .more-icon {
      font-size: 40rpx;
      color: var(--color-text-secondary);
      font-weight: bold;
    }
  }
}

// 消息列表
.message-list {
  flex: 1;
  padding: 16rpx 0;
  overflow-y: auto;
}

// 加载失败提示
.load-failed-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60rpx 0;

  .load-failed-text {
    font-size: var(--font-sm);
    color: var(--color-text-hint);
    margin-bottom: 20rpx;
  }

  .load-failed-btn {
    padding: 12rpx 40rpx;
    border-radius: 32rpx;
    background-color: var(--color-primary);

    text {
      font-size: var(--font-sm);
      color: #fff;
    }

    &:active {
      opacity: 0.8;
    }
  }
}

// 加载更多提示
.load-more-tip {
  display: flex;
  justify-content: center;
  padding: 16rpx 0;

  .load-more-text {
    font-size: var(--font-xs);
    color: var(--color-text-hint);
  }
}

// 系统消息
.msg-system {
  display: flex;
  justify-content: center;
  padding: 8rpx 0;

  .system-tag {
    max-width: 80%;
    padding: 8rpx 24rpx;
    background-color: #e8e8e8;
    border-radius: 8rpx;

    .system-text {
      font-size: var(--font-xs);
      color: var(--color-text-hint);
      text-align: center;
    }
  }
}

// 时间分隔
.msg-time-divider {
  display: flex;
  justify-content: center;
  padding: 12rpx 0;

  .time-text {
    font-size: var(--font-xs);
    color: #ccc;
    padding: 4rpx 16rpx;
    background-color: rgba(0, 0, 0, 0.03);
    border-radius: 8rpx;
  }
}

// 消息行
.msg-row {
  display: flex;
  padding: 8rpx 24rpx;
  align-items: flex-start;
}

// 左侧消息（他人）
.msg-left {
  justify-content: flex-start;

  .msg-avatar {
    width: 72rpx;
    height: 72rpx;
    border-radius: 8rpx;
    flex-shrink: 0;
    margin-top: 4rpx;
    overflow: hidden;
  }

  .msg-body-left {
    margin-left: 12rpx;
    max-width: 420rpx;
  }

  .msg-nickname {
    font-size: var(--font-xs);
    color: var(--color-text-hint);
    margin-bottom: 4rpx;
    display: block;
  }

  .msg-bubble-other {
    background-color: #fff;
    border-radius: 4rpx 20rpx 20rpx 20rpx;
  }

  .msg-time-left {
    font-size: 20rpx;
    color: #ccc;
    margin-top: 4rpx;
  }
}

// 右侧消息（自己）
.msg-right {
  justify-content: flex-end;

  .msg-body-right {
    max-width: 420rpx;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .msg-bubble-mine {
    background-color: #95EC69;
    border-radius: 20rpx 4rpx 20rpx 20rpx;
  }

  .msg-time-right {
    font-size: 20rpx;
    color: #ccc;
    margin-top: 4rpx;
  }

  .msg-status {
    .status-sending {
      font-size: 20rpx;
      color: var(--color-text-hint);
    }
    .status-failed {
      font-size: 20rpx;
      color: var(--color-danger);
    }
  }
}

// 消息气泡
.msg-bubble {
  padding: 16rpx 24rpx;
  max-width: 100%;
  word-break: break-all;

  .bubble-text {
    font-size: var(--font-md);
    color: var(--color-text-primary);
    line-height: 1.5;
  }
}

// 图片消息
.msg-image {
  max-width: 360rpx;
  border-radius: var(--radius-sm);
  background-color: var(--color-divider);
}

// 语音消息
.msg-voice-bubble {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 18rpx 22rpx;
  border-radius: 18rpx;
  min-width: 180rpx;
  max-width: 360rpx;
  cursor: pointer;

  &.voice-other {
    background-color: var(--color-bg-white);
    border: 1rpx solid var(--color-border);
  }

  &.voice-mine {
    background-color: var(--color-primary);
  }

  .voice-icon {
    font-size: 30rpx;
    flex-shrink: 0;
  }

  .voice-wave {
    display: flex;
    align-items: center;
    gap: 3rpx;
    height: 36rpx;
    flex: 1;

    .wave-bar {
      width: 4rpx;
      border-radius: 2rpx;
      background-color: currentColor;
    }

    &.playing .wave-bar {
      animation: voiceWave 0.8s ease-in-out infinite;
    }
  }

  .voice-duration {
    font-size: var(--font-xs);
    flex-shrink: 0;
  }
}

.msg-voice-bubble.voice-other {
  color: var(--color-text-primary);
}

.msg-voice-bubble.voice-mine {
  color: #FFFFFF;
}

@keyframes voiceWave {
  0%, 100% { transform: scaleY(0.6); }
  50% { transform: scaleY(1.15); }
}

// 位置消息卡片
.msg-location-card {
  width: 400rpx;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background-color: #fff;
  box-shadow: var(--shadow-sm);

  .location-thumb {
    width: 400rpx;
    height: 160rpx;
    background-color: var(--color-divider);
  }

  .location-thumb-fallback {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #E8F4EC, #F0F7F3);
    gap: 8rpx;

    .fallback-icon {
      font-size: 48rpx;
    }

    .fallback-coords {
      font-size: 20rpx;
      color: #7A9C8A;
    }
  }

  .location-info {
    padding: 12rpx 16rpx;

    .location-name {
      font-size: var(--font-sm);
      font-weight: 500;
      color: var(--color-text-primary);
      display: block;
    }

    .location-addr {
      font-size: var(--font-xs);
      color: var(--color-text-hint);
      margin-top: 4rpx;
      display: block;
    }
  }
}

// 拼团分享卡片
.msg-group-buy-card {
  display: flex;
  width: 420rpx;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background-color: #fff;
  box-shadow: var(--shadow-sm);

  .gb-thumb {
    width: 140rpx;
    height: 140rpx;
    flex-shrink: 0;
    background-color: var(--color-divider);
  }

  .gb-info {
    flex: 1;
    padding: 16rpx;
    display: flex;
    flex-direction: column;
    justify-content: space-between;

    .gb-title {
      font-size: var(--font-sm);
      color: var(--color-text-primary);
      line-height: 1.4;
    }

    .gb-bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .gb-price {
        font-size: var(--font-md);
        font-weight: 600;
        color: var(--color-danger);
      }

      .gb-tag {
        font-size: 20rpx;
        color: #fff;
        background-color: var(--color-danger);
        border-radius: 16rpx;
        padding: 4rpx 16rpx;
      }
    }
  }
}

// 底部输入栏
.input-bar {
  display: flex;
  align-items: center;
  padding: 12rpx 16rpx;
  background-color: var(--color-bg-white);
  border-top: 1rpx solid var(--color-border);
  gap: 8rpx;

  .input-btn {
    width: 64rpx;
    height: 64rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    .btn-icon {
      font-size: 36rpx;
    }

    &:active {
      opacity: 0.6;
    }

    &.ptt-btn.recording {
      width: 96rpx;
      height: 96rpx;
      border-radius: 50%;
      background-color: #FDECEA;
      box-shadow: 0 0 0 6rpx rgba(231, 76, 60, 0.18);
      animation: recordPulse 1s ease-in-out infinite;
    }
  }

  @keyframes recordPulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
  }

  .text-input {
    flex: 1;
    height: 64rpx;
    padding: 0 20rpx;
    background-color: var(--color-bg);
    border-radius: 32rpx;
    font-size: var(--font-md);
  }

  .send-btn {
    flex-shrink: 0;
    width: 100rpx;
    height: 64rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-primary);
    border-radius: 12rpx;

    .send-text {
      font-size: var(--font-sm);
      color: #fff;
      font-weight: 500;
    }

    &:active {
      opacity: 0.85;
    }
  }
}

// 录音中浮层
.record-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;

  .record-card {
    width: 300rpx;
    height: 300rpx;
    border-radius: 32rpx;
    background: rgba(255, 255, 255, 0.96);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12rpx;
    box-shadow: var(--shadow-lg);

    .record-icon {
      font-size: 72rpx;
      animation: recordPulse 1s ease-in-out infinite;
    }

    .record-text {
      font-size: var(--font-sm);
      color: var(--color-text-secondary);
    }

    .record-time {
      font-size: var(--font-xl);
      font-weight: 700;
      color: var(--color-danger);
    }
  }
}

// 对方正在对讲提示
.remote-ptt-tip {
  position: fixed;
  top: 120rpx;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx 28rpx;
  background: rgba(0, 0, 0, 0.65);
  border-radius: 32rpx;
  animation: pttTipIn 0.2s ease;

  .remote-ptt-dot {
    font-size: 28rpx;
    animation: recordPulse 0.8s ease-in-out infinite;
  }

  .remote-ptt-text {
    font-size: 24rpx;
    color: #FFFFFF;
  }
}

@keyframes pttTipIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10rpx);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

// 表情选择面板
.emoji-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 96rpx;
  z-index: 1200;
  background: #FFFFFF;
  border-top: 1rpx solid #EEEEEE;
  box-shadow: 0 -4rpx 24rpx rgba(0, 0, 0, 0.08);
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  padding: 20rpx 24rpx;
  max-height: 300rpx;
  overflow-y: auto;

  .emoji-item {
    width: 88rpx;
    height: 88rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12rpx;

    .emoji-text {
      font-size: 44rpx;
    }

    &:active {
      background: #F5F5F5;
    }
  }
}

// 列表底部占位
.list-bottom-placeholder {
  height: 120rpx;
}

// 操作菜单遮罩
.action-sheet-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 999;
  display: flex;
  align-items: flex-end;
}

// 操作菜单
.action-sheet {
  width: 100%;
  background-color: var(--color-bg-white);
  border-radius: 24rpx 24rpx 0 0;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);

  .sheet-title {
    text-align: center;
    font-size: var(--font-sm);
    color: var(--color-text-hint);
    padding: 24rpx 0 16rpx;
  }

  .sheet-grid {
    display: flex;
    padding: 0 32rpx 24rpx;
    gap: 24rpx;
    justify-content: space-around;

    .sheet-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8rpx;

      .sheet-icon {
        font-size: 52rpx;
      }

      .sheet-label {
        font-size: var(--font-xs);
        color: var(--color-text-secondary);
      }
    }
  }

  .sheet-cancel {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 88rpx;
    border-top: 1rpx solid var(--color-border);
    font-size: var(--font-lg);
    color: var(--color-text-secondary);

    &:active {
      background-color: #f8f8f8;
    }
  }
}
</style>
