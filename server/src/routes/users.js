const router = require('express').Router();
const { auth, optionalAuth } = require('../middleware/auth');
const {
  getProfile,
  updateProfile,
  certifyVehicle,
  getGrowth,
  getBadges,
  getUserHome,
  getInviteInfo,
  bindInviter,
  toggleDiscoverable,
  getSentinel,
  updateSentinel,
  getFollowers,
  getFollowing,
  follow,
  unfollow,
  blockUser,
  unblockUser,
  getBlockedUsers,
  dailyCheckin
} = require('../controllers/userController');

/**
 * GET /api/users/profile
 * 获取当前用户完整资料（含统计信息）
 */
router.get('/profile', auth, getProfile);

/**
 * PUT /api/users/profile
 * 更新当前用户资料（昵称/头像/签名/车型/车牌）
 */
router.put('/profile', auth, updateProfile);

/**
 * POST /api/users/certify
 * 提交车主认证（行驶证 + 人脸识别）
 */
router.post('/certify', auth, certifyVehicle);

/**
 * GET /api/users/growth
 * 获取用户成长值、等级、进度
 */
router.get('/growth', auth, getGrowth);

/**
 * GET /api/users/badges
 * 获取用户勋章列表
 */
router.get('/badges', auth, getBadges);

/**
 * GET /api/users/home/:userId
 * 获取其他用户的公开主页信息（可选认证）
 */
router.get('/home/:userId', optionalAuth, getUserHome);

/**
 * GET /api/users/invite
 * 获取用户邀请码/邀请链接、邀请统计、奖励记录
 */
router.get('/invite', auth, getInviteInfo);

/**
 * POST /api/users/invite/bind
 * 绑定邀请人（7天宽限期内通过手机号补填）
 */
router.post('/invite/bind', auth, bindInviter);

/**
 * PUT /api/users/privacy/discoverable
 * 切换"可被其他车队发现"隐私设置
 */
router.put('/privacy/discoverable', auth, toggleDiscoverable);

/**
 * GET /api/users/sentinel — 获取哨兵模式状态
 * PUT /api/users/sentinel — 开启/关闭哨兵模式
 */
router.get('/sentinel', auth, getSentinel);
router.put('/sentinel', auth, updateSentinel);

/**
 * GET /api/users/followers
 * 获取粉丝列表
 */
router.get('/followers', auth, getFollowers);

/**
 * GET /api/users/following
 * 获取关注列表
 */
router.get('/following', auth, getFollowing);

/**
 * POST /api/users/follow
 * 关注用户或车队
 */
router.post('/follow', auth, follow);

/**
 * DELETE /api/users/follow/:followeeId
 * 取消关注
 */
router.delete('/follow/:followeeId', auth, unfollow);

/**
 * POST /api/users/block
 * 屏蔽用户
 */
router.post('/block', auth, blockUser);

/**
 * DELETE /api/users/block/:userId
 * 取消屏蔽
 */
router.delete('/block/:userId', auth, unblockUser);

/**
 * GET /api/users/blocked-list
 * 获取屏蔽列表
 */
router.get('/blocked-list', auth, getBlockedUsers);

/**
 * POST /api/users/checkin
 * 每日签到（每日一次，奖励成长值）
 */
router.post('/checkin', auth, dailyCheckin);

module.exports = router;
