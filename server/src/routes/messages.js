const router = require('express').Router();
const { auth, optionalAuth } = require('../middleware/auth');
const chatController = require('../controllers/chatController');
const locationChatController = require('../controllers/locationChatController');

// ---------------------------------------------------------------------------
// Chat session routes
// ---------------------------------------------------------------------------

/**
 * GET /api/messages/sessions
 * 获取会话列表 - 支持type筛选: all/team_group/private/location_room
 */
router.get('/sessions', auth, chatController.getSessions);

/**
 * POST /api/messages/sessions/private
 * 创建或获取私聊会话
 */
router.post('/sessions/private', auth, chatController.createPrivateSession);

/**
 * GET /api/messages/sessions/:id
 * 获取会话详情 + 分页消息列表
 */
router.get('/sessions/:id', auth, chatController.getSessionDetail);

/**
 * POST /api/messages/sessions/:id/messages
 * 发送消息到会话
 */
router.post('/sessions/:id/messages', auth, chatController.sendMessage);

/**
 * GET /api/messages/unread
 * 获取总未读消息数
 */
router.get('/unread', auth, chatController.getUnreadCount);

/**
 * POST /api/messages/sessions/:id/read
 * 标记会话消息已读
 */
router.post('/sessions/:id/read', auth, chatController.markAsRead);

/**
 * POST /api/messages/sessions/:id/mute
 * 设置会话免打扰
 */
router.post('/sessions/:id/mute', auth, chatController.muteSession);

/**
 * DELETE /api/messages/sessions/:id/mute
 * 取消会话免打扰
 */
router.delete('/sessions/:id/mute', auth, chatController.unmuteSession);

/**
 * POST /api/messages/sessions/:id/clear
 * 清空会话聊天记录
 */
router.post('/sessions/:id/clear', auth, chatController.clearSessionMessages);

/**
 * POST /api/messages/sessions/:id/leave
 * 退出群聊/删除会话
 */
router.post('/sessions/:id/leave', auth, chatController.leaveSession);

/**
 * GET /api/messages/sessions/:id/members
 * 会话成员列表(群资料)
 */
router.get('/sessions/:id/members', auth, chatController.getSessionMembers);

/**
 * POST /api/messages/sessions/:id/share
 * 分享内容到会话（位置/拼团/交通事件）
 */
router.post('/sessions/:id/share', auth, chatController.shareToSession);

// ---------------------------------------------------------------------------
// Location chat topic routes
// ---------------------------------------------------------------------------

/**
 * POST /api/messages/location-topics
 * 手动创建地点话题
 */
router.post('/location-topics', auth, locationChatController.createTopic);

/**
 * GET /api/messages/location-topics/nearby
 * 获取附近地点话题
 */
router.get('/location-topics/nearby', optionalAuth, locationChatController.getNearbyTopics);

/**
 * GET /api/messages/location-topics/my
 * 获取我参与的话题列表
 */
router.get('/location-topics/my', auth, locationChatController.getMyTopics);

/**
 * POST /api/messages/location-topics/archive-check
 * 手动触发归档扫描（管理员/运营/定时任务调用）
 * 注:字面量路由必须放在 :id 路由之前避免歧义
 */
router.post('/location-topics/archive-check', auth, locationChatController.checkAndArchiveTopics);

/**
 * GET /api/messages/location-topics/:id
 * 获取话题详情 + 消息（参与者看全部，非参与者看前3条预览）
 */
router.get('/location-topics/:id', auth, locationChatController.getTopicDetail);

/**
 * POST /api/messages/location-topics/:id/join
 * 加入地点话题
 */
router.post('/location-topics/:id/join', auth, locationChatController.joinTopic);

/**
 * POST /api/messages/location-topics/:id/leave
 * 离开地点话题
 */
router.post('/location-topics/:id/leave', auth, locationChatController.leaveTopic);

/**
 * POST /api/messages/location-topics/:id/follow
 * 关注话题（不加入聊天）
 */
router.post('/location-topics/:id/follow', auth, locationChatController.followTopic);

module.exports = router;
