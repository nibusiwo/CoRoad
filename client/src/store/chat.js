/**
 * 聊天状态管理 - Pinia Store
 * CoRoad 同道自驾社交平台
 */

import { defineStore } from 'pinia';
import api from '@/utils/api.js';
import { resolveAssetUrl } from '@/utils/api.js';
import { useUserStore } from '@/store/user.js';

// ---------------------------------------------------------------------------
// 后端响应归一化工具
// 后端字段为 snake_case / JSON 字符串,消息页与聊天页按 camelCase 消费
// ---------------------------------------------------------------------------

function parseJson(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

const SESSION_TYPE_MAP = {
  team_group: 'team',
  location_room: 'topic',
  private: 'private'
};

/**
 * 归一化会话对象(后端 -> 前端字段)
 */
function normalizeSession(s, archived) {
  if (!s) return null;
  const lastMsg = parseJson(s.last_message);
  return {
    id: s.id,
    type: SESSION_TYPE_MAP[s.type] || s.type || 'private',
    name: s.name || '',
    avatar: resolveAssetUrl(s.avatar || ''),
    tripId: s.trip_id || null,
    targetId: s.trip_id || s.poi_id || null,
    poiId: s.poi_id || null,
    poiName: s.poi_name || null,
    poiLocation: parseJson(s.poi_location),
    memberCount: s.member_count || 0,
    memberAvatars: Array.isArray(s.member_avatars)
      ? s.member_avatars.map((m) => ({ ...m, avatar: resolveAssetUrl(m.avatar || '') }))
      : [],
    lastMessage: (lastMsg && (lastMsg.content || lastMsg.text)) || String(s.last_message || ''),
    lastMessageTime: s.updated_at || s.last_message_at || '',
    isActive: s.is_active === 1 || s.is_active === true,
    unreadCount: s.unread_count || 0,
    isMuted: s.is_muted === 1 || s.is_muted === true,
    archived: !!archived || (s.type === 'location_room' && s.is_active === 0),
    locationSharing: false,
    isMutualFollow: false,
    isStrangerRemote: false
  };
}

/**
 * 归一化消息对象(后端 -> 前端字段),并展开 extra 中的业务数据
 */
function normalizeMessage(m) {
  if (!m) return null;
  const extra = parseJson(m.extra);
  const userStore = useUserStore();
  const senderId = m.sender_id != null ? m.sender_id : m.senderId;

  const msg = {
    id: m.id,
    sessionId: m.session_id || m.sessionId,
    userId: senderId,
    nickname: m.sender_nickname || m.nickname || '',
    avatar: resolveAssetUrl(m.sender_avatar || m.avatar || ''),
    type: m.type || 'text',
    content: resolveAssetUrl(m.content || ''),
    extra,
    createTime: m.created_at || m.createTime || '',
    mine: m.mine === true || String(senderId) === String(userStore.userId),
    sending: false,
    failed: false,
    showTime: m.showTime || false
  };

  // 拼团分享卡片
  if (msg.type === 'group_buy' || (extra && extra.group_buy)) {
    const gb = (extra && extra.group_buy) || {};
    msg.productTitle = gb.product_name || gb.name || gb.title || gb.share_data?.product_name || msg.content;
    msg.productPrice = gb.price != null ? gb.price
      : (gb.product_price != null ? gb.product_price
        : (gb.share_data && gb.share_data.product_price));
    msg.productImage = resolveAssetUrl(gb.image || gb.product_image || (gb.share_data && gb.share_data.product_image) || '');
    msg.activityId = gb.activity_id || gb.activityId || gb.id || (gb.share_data && gb.share_data.activity_id);
  }

  // 位置消息
  if (msg.type === 'location' || msg.type === 'meetup' || (extra && (extra.location || extra.meetup_point))) {
    const loc = (extra && (extra.location || extra.meetup_point)) || {};
    msg.locationName = loc.name || msg.locationName || '';
    msg.locationAddress = loc.address || '';
    msg.latitude = loc.lat != null ? loc.lat : msg.latitude;
    msg.longitude = loc.lng != null ? loc.lng : msg.longitude;
  }

  // 语音消息
  if (msg.type === 'voice' || (extra && extra.voice)) {
    const v = (extra && extra.voice) || {};
    msg.duration = v.duration || 0;
    msg.voiceUrl = msg.content;
  }

  return msg;
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    sessions: [],
    unreadTotal: 0,
    currentSession: null,
    currentMessages: [],
    myTopics: [],
    nearbyTopics: [],
    loading: false,
    messageLoading: false
  }),

  getters: {
    /** 会话数量 */
    sessionCount(state) {
      return state.sessions.length;
    },

    /** 是否有未读消息 */
    hasUnread(state) {
      return state.unreadTotal > 0;
    },

    /** 当前会话ID */
    currentSessionId(state) {
      return state.currentSession ? state.currentSession.id : '';
    },

    /** 当前消息列表 */
    messages(state) {
      return state.currentMessages;
    },

    /** 话题总数 */
    topicCount(state) {
      return state.myTopics.length + state.nearbyTopics.length;
    }
  },

  actions: {
    /**
     * 获取会话列表
     * @param {string} type 会话类型: all/private/team/topic
     */
    async fetchSessions(type) {
      this.loading = true;
      try {
        const res = await api.chat.getSessions(type);
        const data = res.records || res;

        let activeList = [];
        let archivedList = [];
        if (Array.isArray(data)) {
          activeList = data;
        } else if (data && typeof data === 'object') {
          activeList = data.active || data.list || [];
          archivedList = data.archived || [];
        }

        const sessions = [
          ...activeList.map((s) => normalizeSession(s, false)).filter(Boolean),
          ...archivedList.map((s) => normalizeSession(s, true)).filter(Boolean)
        ];
        this.sessions = sessions;
        return this.sessions;
      } catch (err) {
        throw err;
      } finally {
        this.loading = false;
      }
    },

    /**
     * 获取未读消息数
     */
    async fetchUnread() {
      try {
        const res = await api.chat.getUnreadCount();
        const raw = res.total !== undefined ? res.total
          : (res.unread_count !== undefined ? res.unread_count
            : (res.unreadCount !== undefined ? res.unreadCount : 0));
        this.unreadTotal = parseInt(raw, 10) || 0;
        return this.unreadTotal;
      } catch (err) {
        // 静默失败，不影响主流程
        console.warn('Failed to fetch unread count:', err);
        return 0;
      }
    },

    /**
     * 获取会话详情（消息列表）
     * @param {string} sessionId
     * @param {number} page
     */
    async fetchSessionDetail(sessionId, page) {
      this.messageLoading = true;
      try {
        const res = await api.chat.getSessionDetail(sessionId, page);
        const data = res.records || res || {};

        let session = null;
        let list = [];
        let pagination = null;

        if (data.messages && Array.isArray(data.messages.list)) {
          session = data.session;
          list = data.messages.list;
          pagination = data.messages.pagination;
        } else if (Array.isArray(data)) {
          list = data;
        } else if (Array.isArray(data.list)) {
          list = data.list;
          pagination = data.pagination;
        }

        const messages = list.map(normalizeMessage).filter(Boolean);

        if (page === 1) {
          this.currentMessages = messages;
        } else {
          this.currentMessages = [...messages, ...this.currentMessages];
        }

        if (session) {
          this.currentSession = {
            ...(this.currentSession || {}),
            ...normalizeSession(session, session.type === 'location_room' && session.is_active === 0)
          };
        }

        const totalPages = pagination ? (pagination.total_pages || pagination.totalPages || 1) : 1;
        const total = pagination ? (pagination.total || 0) : (data.total || 0);
        return {
          hasMore: page < totalPages,
          total,
          messages
        };
      } catch (err) {
        throw err;
      } finally {
        this.messageLoading = false;
      }
    },

    /**
     * 发送消息
     * @param {string} sessionId
     * @param {Object} data 消息数据 { type, content, ... }
     */
    async sendMessage(sessionId, data) {
      try {
        const message = await api.chat.sendMessage(sessionId, data);
        const normalized = normalizeMessage(message);
        // 发送方本地消息由页面以临时消息占位,这里不重复 push;
        // 若页面没有本地占位(如分享卡片),则补充进去
        const exists = this.currentMessages.some((m) => String(m.id) === String(normalized.id));
        if (!exists && this.currentSession && String(this.currentSession.id) === String(sessionId)) {
          this.currentMessages.push(normalized);
        }
        return normalized;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 标记会话已读
     * @param {string} sessionId
     */
    async markRead(sessionId) {
      try {
        await api.chat.markAsRead(sessionId);
        // 更新本地会话未读数
        const session = this.sessions.find((s) => s.id === sessionId);
        if (session) {
          if (session.unreadCount) {
            this.unreadTotal = Math.max(0, this.unreadTotal - session.unreadCount);
            session.unreadCount = 0;
          }
        }
      } catch (err) {
        console.warn('Failed to mark as read:', err);
      }
    },

    /**
     * 设置当前会话
     * @param {Object} session
     */
    setCurrentSession(session) {
      this.currentSession = session;
      this.currentMessages = [];
    },

    /**
     * 创建私聊会话
     * @param {string} userId
     */
    async createPrivateSession(userId) {
      try {
        const res = await api.chat.createPrivateSession(userId);
        const targetUser = res && (res.target_user || res.targetUser);
        const session = res && res.session
          ? {
              ...res.session,
              targetUser,
              targetId: targetUser ? targetUser.id : res.session.targetId,
              isLimited: res.is_limited !== undefined ? res.is_limited : res.isLimited,
              isExisting: res.is_existing !== undefined ? res.is_existing : res.isExisting
            }
          : res;

        if (!session || !session.id) {
          throw new Error('Invalid private session response');
        }

        const existingIndex = this.sessions.findIndex((item) => String(item.id) === String(session.id));
        if (existingIndex !== -1) {
          this.sessions.splice(existingIndex, 1);
        }
        this.sessions.unshift(session);
        return session;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 接收新消息（由 WebSocket 或轮询触发）
     * @param {Object} message
     */
    receiveMessage(message) {
      const normalized = normalizeMessage(message);
      if (!normalized) return;

      // 去重:若当前会话已存在同 id 消息(自己发送/重复推送),跳过
      if (this.currentMessages.some((m) => String(m.id) === String(normalized.id))) {
        return;
      }

      // 更新未读数
      this.unreadTotal += 1;

      // 如果当前正在看这个会话，直接追加消息
      if (this.currentSession && String(normalized.sessionId) === String(this.currentSession.id)) {
        this.currentMessages.push(normalized);
        // 自动标记已读
        this.markRead(normalized.sessionId);
      }

      // 更新会话列表中的最后一条消息
      const sessionIndex = this.sessions.findIndex((s) => String(s.id) === String(normalized.sessionId));
      if (sessionIndex !== -1) {
        const session = this.sessions[sessionIndex];
        session.lastMessage = normalized.content || '[消息]';
        session.lastMessageTime = normalized.createTime;
        session.unreadCount = (session.unreadCount || 0) + 1;
        // 将该会话移到顶部
        this.sessions.splice(sessionIndex, 1);
        this.sessions.unshift(session);
      } else if (this.currentSession && String(normalized.sessionId) === String(this.currentSession.id)) {
        // 当前会话不在会话列表(直接进入的聊天),同步当前会话未读数
        this.currentSession.unreadCount = 0;
      }
    },

    /**
     * 删除会话（本地）
     * @param {string} sessionId
     */
    removeSession(sessionId) {
      this.sessions = this.sessions.filter((s) => s.id !== sessionId);
      if (this.currentSession && this.currentSession.id === sessionId) {
        this.currentSession = null;
        this.currentMessages = [];
      }
    },

    // ---- 话题管理 ----

    /**
     * 获取附近话题
     * @param {number} lng
     * @param {number} lat
     */
    async fetchNearbyTopics(lng, lat) {
      try {
        const res = await api.chat.getNearbyTopics(lng, lat);
        this.nearbyTopics = res.records || res || [];
        return this.nearbyTopics;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 获取我的话题
     */
    async fetchMyTopics() {
      try {
        const res = await api.chat.getMyTopics();
        this.myTopics = res.records || res || [];
        return this.myTopics;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 创建话题
     * @param {Object} data
     */
    async createTopic(data) {
      try {
        const topic = await api.chat.createTopic(data);
        this.myTopics.unshift(topic);
        return topic;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 加入话题
     * @param {string} id
     */
    async joinTopic(id) {
      try {
        const result = await api.chat.joinTopic(id);
        // 从 nearbyTopics 移到 myTopics
        const topic = this.nearbyTopics.find((t) => t.id === id);
        if (topic) {
          this.nearbyTopics = this.nearbyTopics.filter((t) => t.id !== id);
          this.myTopics.unshift({ ...topic, joined: true });
        }
        return result;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 退出话题
     * @param {string} id
     */
    async leaveTopic(id) {
      try {
        await api.chat.leaveTopic(id);
        this.myTopics = this.myTopics.filter((t) => t.id !== id);
      } catch (err) {
        throw err;
      }
    },

    /**
     * 重置所有状态
     */
    resetAll() {
      this.sessions = [];
      this.unreadTotal = 0;
      this.currentSession = null;
      this.currentMessages = [];
      this.myTopics = [];
      this.nearbyTopics = [];
      this.loading = false;
      this.messageLoading = false;
    }
  }
});
