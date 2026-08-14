const pool = require('../config/db');
const redis = require('../config/redis');
const config = require('../config');
const { ApiResponse } = require('../utils/helpers');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute level info from growth value using config thresholds.
 */
function computeLevelInfo(growthValue) {
  const levels = config.growth.levels;
  let level = 0;
  let levelName = '路人';
  let minGrowth = 0;
  let nextGrowth = levels[1]?.min || 100;

  for (let i = levels.length - 1; i >= 0; i--) {
    if (growthValue >= levels[i].min) {
      level = levels[i].level;
      levelName = levels[i].name;
      minGrowth = levels[i].min;
      nextGrowth = levels[i + 1]?.min || null;
      break;
    }
  }

  const progress = nextGrowth
    ? Math.min(100, Math.round(((growthValue - minGrowth) / (nextGrowth - minGrowth)) * 100))
    : 100;

  return { level, levelName, minGrowth, nextGrowth, progress };
}

/**
 * Sanitize a user row for public display (strip sensitive fields).
 */
function sanitizeUserPublic(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    avatar: row.avatar,
    cover_image: row.cover_image,
    gender: row.gender,
    vehicle_model: row.vehicle_model,
    plate_number: row.plate_number ? row.plate_number.slice(0, 2) + '****' : null,
    signature: row.signature,
    is_certified: row.is_certified,
    level: row.level,
    growth_value: row.growth_value,
    total_distance: row.total_distance,
    total_teams: row.total_teams
  };
}

// ---------------------------------------------------------------------------
// 1. getProfile — current user profile with stats
// ---------------------------------------------------------------------------
const getProfile = async (req, res, next) => {
  try {
    const userId = req.userId;

    const [rows] = await pool.query(
      `SELECT u.*,
        (SELECT COUNT(*) FROM follows WHERE followee_id = u.id AND follow_type = 1) AS follower_count,
        (SELECT COUNT(*) FROM follows WHERE follower_id = u.id AND follow_type = 1) AS following_count,
        (SELECT COUNT(*) FROM trip_members WHERE user_id = u.id AND status = 2) AS trip_count,
        (SELECT COUNT(*) FROM trip_members tm
          JOIN trips t ON t.id = tm.trip_id
          WHERE tm.user_id = u.id AND tm.status = 2 AND t.status IN (1, 2)) AS active_team_count
       FROM users u WHERE u.id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }

    const user = rows[0];
    const levelInfo = computeLevelInfo(user.growth_value || 0);

    res.json(ApiResponse.success({
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      cover_image: user.cover_image,
      phone: user.phone,
      gender: user.gender,
      vehicle_model: user.vehicle_model,
      plate_number: user.plate_number,
      signature: user.signature,
      is_certified: user.is_certified,
      can_be_discovered: user.can_be_discovered,
      certification_data: user.certification_data,
      growth_value: user.growth_value || 0,
      level: levelInfo.level,
      level_name: levelInfo.levelName,
      level_progress: levelInfo.progress,
      next_level_growth: levelInfo.nextGrowth,
      credit_score: user.credit_score || 100,
      total_distance: user.total_distance || 0,
      total_teams: user.total_teams || 0,
      active_team_count: user.active_team_count || 0,
      total_group_buy: user.total_group_buy || 0,
      total_invites: user.total_invites || 0,
      follower_count: user.follower_count || 0,
      following_count: user.following_count || 0,
      trip_count: user.trip_count || 0,
      created_at: user.created_at,
      last_login_at: user.last_login_at
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 2. updateProfile — update nickname, avatar, signature, vehicle, plate
// ---------------------------------------------------------------------------
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.userId;
    const allowedFields = ['nickname', 'avatar', 'cover_image', 'signature', 'vehicle_model', 'plate_number', 'gender'];
    const updates = [];
    const params = [];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const val = req.body[field];
        // Basic validation
        if (field === 'nickname' && (typeof val !== 'string' || val.length > 50)) {
          return res.status(422).json(ApiResponse.fail('昵称不能超过50个字符'));
        }
        if (field === 'signature' && (typeof val === 'string' && val.length > 200)) {
          return res.status(422).json(ApiResponse.fail('签名不能超过200个字符'));
        }
        if (field === 'plate_number' && val && !/^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]$/.test(val) && !/^[A-Z][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,5}$/.test(val)) {
          return res.status(422).json(ApiResponse.fail('请输入正确的车牌号'));
        }
        updates.push(`${field} = ?`);
        params.push(val);
      }
    }

    if (updates.length === 0) {
      return res.status(422).json(ApiResponse.fail('没有需要更新的字段'));
    }

    params.push(userId);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params
    );

    // Fetch updated profile
    const [rows] = await pool.query('SELECT id, nickname, avatar, cover_image, gender, vehicle_model, plate_number, signature, is_certified, can_be_discovered, growth_value, level, updated_at FROM users WHERE id = ?', [userId]);
    res.json(ApiResponse.success(rows[0], '更新成功'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 3. certifyVehicle — submit vehicle certification
// ---------------------------------------------------------------------------
const certifyVehicle = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { driving_license, face_data, vehicle_model, plate_number } = req.body;

    if (!driving_license) {
      return res.status(422).json(ApiResponse.fail('请上传行驶证照片'));
    }
    if (!face_data) {
      return res.status(422).json(ApiResponse.fail('请完成人脸识别'));
    }

    // Check if user already certified or pending
    const [existing] = await pool.query('SELECT is_certified, certification_data FROM users WHERE id = ?', [userId]);
    if (existing.length === 0) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }
    if (existing[0].is_certified === 2) {
      return res.status(400).json(ApiResponse.fail('您已完成车主认证'));
    }
    if (existing[0].is_certified === 1) {
      return res.status(400).json(ApiResponse.fail('认证审核中，请耐心等待'));
    }

    const certData = JSON.stringify({
      driving_license,
      face_data,
      vehicle_model: vehicle_model || null,
      plate_number: plate_number || null,
      submitted_at: new Date().toISOString()
    });

    const updates = ['is_certified = 1', 'certification_data = ?', 'updated_at = NOW()'];
    const params = [certData];

    if (vehicle_model) {
      updates.push('vehicle_model = ?');
      params.push(vehicle_model);
    }
    if (plate_number) {
      updates.push('plate_number = ?');
      params.push(plate_number);
    }
    params.push(userId);

    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

    // Log the operation
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [userId, 'certify_vehicle', 'user', String(userId), JSON.stringify({ certData })]
    );

    res.json(ApiResponse.success(null, '认证资料已提交，请等待审核'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 4. getGrowth — user growth value, level, level progress
// ---------------------------------------------------------------------------
const getGrowth = async (req, res, next) => {
  try {
    const userId = req.userId;

    const [rows] = await pool.query(
      'SELECT growth_value, level, total_distance, total_teams, total_group_buy, total_invites, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }

    const user = rows[0];
    const growthValue = user.growth_value || 0;
    const levelInfo = computeLevelInfo(growthValue);

    // Get recent growth records from operation logs (growth-related actions)
    const [logs] = await pool.query(
      `SELECT action, detail, created_at FROM operation_logs
       WHERE user_id = ? AND action IN ('daily_checkin', 'growth_award', 'trip_complete', 'invite_user', 'team_lead', 'review_merchant', 'group_buy_participate')
       ORDER BY created_at DESC LIMIT 30`,
      [userId]
    );

    res.json(ApiResponse.success({
      growth_value: growthValue,
      level: levelInfo.level,
      level_name: levelInfo.levelName,
      progress: levelInfo.progress,
      next_level_growth: levelInfo.nextGrowth,
      factors: config.growth.factors,
      all_levels: config.growth.levels.map(l => ({
        level: l.level,
        name: l.name,
        min: l.min,
        reached: growthValue >= l.min
      })),
      recent_logs: logs
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 5. getBadges — user badges list
// ---------------------------------------------------------------------------
const getBadges = async (req, res, next) => {
  try {
    const userId = req.userId;

    // Get user's earned badges
    const [earned] = await pool.query(
      `SELECT b.id, b.name, b.icon, b.description, b.type, b.condition_json, ub.earned_at
       FROM user_badges ub
       JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = ?
       ORDER BY ub.earned_at DESC`,
      [userId]
    );

    // Get all badges (including unearned)
    const [allBadges] = await pool.query('SELECT * FROM badges ORDER BY id');

    const earnedIds = new Set(earned.map(b => b.id));

    const badgeList = allBadges.map(b => ({
      id: b.id,
      name: b.name,
      icon: b.icon,
      description: b.description,
      type: b.type,
      condition: b.condition_json,
      earned: earnedIds.has(b.id),
      earned_at: earned.find(e => e.id === b.id)?.earned_at || null
    }));

    res.json(ApiResponse.success({
      earned_count: earned.length,
      total_count: allBadges.length,
      badges: badgeList
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 6. getUserHome — another user's public profile
// ---------------------------------------------------------------------------
const getUserHome = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    const currentUserId = req.userId || null; // optionalAuth means this may not exist

    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(422).json(ApiResponse.fail('无效的用户ID'));
    }

    const [rows] = await pool.query(
      `SELECT u.*,
        (SELECT COUNT(*) FROM follows WHERE followee_id = u.id AND follow_type = 1) AS follower_count,
        (SELECT COUNT(*) FROM follows WHERE follower_id = u.id AND follow_type = 1) AS following_count,
        (SELECT COUNT(*) FROM trip_members WHERE user_id = u.id AND status = 2) AS trip_count
       FROM users u WHERE u.id = ? AND u.status = 1`,
      [targetUserId]
    );

    if (rows.length === 0) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }

    const user = rows[0];
    const levelInfo = computeLevelInfo(user.growth_value || 0);

    // Check relationship with current user
    let isFollowed = false;
    let isFollowingMe = false;
    let isBlocked = false;

    if (currentUserId && currentUserId !== targetUserId) {
      const [[followRow]] = await pool.query(
        'SELECT id FROM follows WHERE follower_id = ? AND followee_id = ? AND follow_type = 1',
        [currentUserId, targetUserId]
      );
      isFollowed = !!followRow;

      const [[followBackRow]] = await pool.query(
        'SELECT id FROM follows WHERE follower_id = ? AND followee_id = ? AND follow_type = 1',
        [targetUserId, currentUserId]
      );
      isFollowingMe = !!followBackRow;

      const [[blockRow]] = await pool.query(
        'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?',
        [currentUserId, targetUserId]
      );
      isBlocked = !!blockRow;
    }

    // Get user's recent badges (top 5)
    const [badges] = await pool.query(
      `SELECT b.name, b.icon FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
       WHERE ub.user_id = ? ORDER BY ub.earned_at DESC LIMIT 5`,
      [targetUserId]
    );

    res.json(ApiResponse.success({
      ...sanitizeUserPublic(user),
      level: levelInfo.level,
      level_name: levelInfo.levelName,
      follower_count: user.follower_count || 0,
      following_count: user.following_count || 0,
      trip_count: user.trip_count || 0,
      is_followed: isFollowed,
      is_following_me: isFollowingMe,
      is_blocked: isBlocked,
      badges: badges
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 7. getInviteInfo — invite link/code, stats, reward records
// ---------------------------------------------------------------------------
const getInviteInfo = async (req, res, next) => {
  try {
    const userId = req.userId;

    // Generate a deterministic invite code from the user ID
    const inviteCode = `CR${String(userId).padStart(6, '0')}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Invite statistics
    const [[inviteStats]] = await pool.query(
      `SELECT COUNT(*) AS total_invited, SUM(CASE WHEN reward_claimed = 1 THEN 1 ELSE 0 END) AS rewarded_count
       FROM user_invites WHERE inviter_id = ?`,
      [userId]
    );

    // People I've invited
    const [invitedUsers] = await pool.query(
      `SELECT ui.id AS invite_id, ui.invitee_id, ui.bind_type, ui.reward_claimed, ui.created_at,
              u.nickname, u.avatar, u.created_at AS user_created_at
       FROM user_invites ui
       JOIN users u ON u.id = ui.invitee_id
       WHERE ui.inviter_id = ?
       ORDER BY ui.created_at DESC`,
      [userId]
    );

    // Reward tiers from config
    const totalInvited = inviteStats?.total_invited || 0;
    const rewards = config.inviteRewards.map(tier => ({
      ...tier,
      achieved: totalInvited >= tier.count
    }));

    res.json(ApiResponse.success({
      invite_code: inviteCode,
      total_invited: totalInvited,
      rewarded_count: inviteStats?.rewarded_count || 0,
      invited_users: invitedUsers,
      reward_tiers: rewards
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 8. bindInviter — bind inviter by phone number (7-day grace period)
// ---------------------------------------------------------------------------
const bindInviter = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { phone } = req.body;

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return res.status(422).json(ApiResponse.fail('请输入正确的手机号'));
    }

    // Check user is within 7-day grace period
    const [userRows] = await pool.query('SELECT created_at FROM users WHERE id = ?', [userId]);
    if (userRows.length === 0) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }

    const daysSinceCreation = (Date.now() - new Date(userRows[0].created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCreation > config.newUserDays) {
      return res.status(400).json(ApiResponse.fail(`注册已超过${config.newUserDays}天，无法绑定邀请人`));
    }

    // Check if already bound
    const [existingInvite] = await pool.query(
      'SELECT id FROM user_invites WHERE invitee_id = ?',
      [userId]
    );
    if (existingInvite.length > 0) {
      return res.status(400).json(ApiResponse.fail('已经绑定过邀请人'));
    }

    // Find the inviter by phone
    const [inviterRows] = await pool.query('SELECT id FROM users WHERE phone = ? AND status = 1', [phone]);
    if (inviterRows.length === 0) {
      return res.status(404).json(ApiResponse.fail('未找到该用户'));
    }

    const inviterId = inviterRows[0].id;

    // Cannot invite yourself
    if (inviterId === userId) {
      return res.status(400).json(ApiResponse.fail('不能绑定自己'));
    }

    // Create invite relationship
    await pool.query(
      'INSERT INTO user_invites (inviter_id, invitee_id, bind_type, reward_claimed, created_at) VALUES (?, ?, 3, 0, NOW())',
      [inviterId, userId]
    );

    // Update inviter's invite count
    await pool.query('UPDATE users SET total_invites = total_invites + 1, updated_at = NOW() WHERE id = ?', [inviterId]);

    // Award growth value to inviter
    const growthAward = config.growth.factors.invite_user || 150;
    await pool.query('UPDATE users SET growth_value = growth_value + ?, updated_at = NOW() WHERE id = ?', [growthAward, inviterId]);

    // Log operation
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [inviterId, 'invite_user', 'user', String(userId), JSON.stringify({ bind_type: 3, growth_award: growthAward })]
    );

    res.json(ApiResponse.success(null, '绑定成功'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 9. toggleDiscoverable — toggle "can be discovered" privacy setting
// ---------------------------------------------------------------------------
const toggleDiscoverable = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { discoverable } = req.body;

    if (discoverable === undefined) {
      return res.status(422).json(ApiResponse.fail('请提供 discoverable 参数'));
    }

    const newValue = discoverable ? 1 : 0;

    await pool.query(
      'UPDATE users SET can_be_discovered = ?, updated_at = NOW() WHERE id = ?',
      [newValue, userId]
    );

    res.json(ApiResponse.success({ can_be_discovered: newValue }, newValue ? '已设为可被发现' : '已关闭被发现'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 9.5 getSentinel — 获取哨兵模式状态
// ---------------------------------------------------------------------------
const getSentinel = async (req, res, next) => {
  try {
    const [[user]] = await pool.query(
      'SELECT sentinel_enabled FROM users WHERE id = ?',
      [req.userId]
    );
    if (!user) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }
    res.json(ApiResponse.success({ sentinel_enabled: user.sentinel_enabled === 1 }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 9.6 updateSentinel — 开启/关闭哨兵模式
// ---------------------------------------------------------------------------
const updateSentinel = async (req, res, next) => {
  try {
    const { enabled } = req.body;
    if (enabled === undefined) {
      return res.status(422).json(ApiResponse.fail('请提供 enabled 参数'));
    }
    const newValue = enabled ? 1 : 0;
    await pool.query(
      'UPDATE users SET sentinel_enabled = ?, updated_at = NOW() WHERE id = ?',
      [newValue, req.userId]
    );
    res.json(ApiResponse.success({ sentinel_enabled: newValue === 1 }, newValue ? '哨兵模式已开启' : '哨兵模式已关闭'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 10. getFollowers — get follower list
// ---------------------------------------------------------------------------
const getFollowers = async (req, res, next) => {
  try {
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM follows WHERE followee_id = ? AND follow_type = 1',
      [userId]
    );

    const [rows] = await pool.query(
      `SELECT f.id AS follow_id, f.created_at AS followed_at,
              u.id, u.nickname, u.avatar, u.signature, u.vehicle_model, u.level, u.growth_value, u.is_certified
       FROM follows f
       JOIN users u ON u.id = f.follower_id
       WHERE f.followee_id = ? AND f.follow_type = 1
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    );

    res.json(ApiResponse.paginated(rows, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 11. getFollowing — get following list
// ---------------------------------------------------------------------------
const getFollowing = async (req, res, next) => {
  try {
    const userId = req.userId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;
    const followType = parseInt(req.query.type) || 1; // 1=用户 2=车队

    let rows;
    let total;

    if (followType === 2) {
      // 关注的车队:followee_id 指向 trips.id
      [[{ total }]] = await pool.query(
        'SELECT COUNT(*) AS total FROM follows WHERE follower_id = ? AND follow_type = 2',
        [userId]
      );
      [rows] = await pool.query(
        `SELECT f.id AS follow_id, f.created_at AS followed_at,
                t.id AS trip_id, t.title AS trip_name, t.route_data, t.current_members, t.current_cars,
                t.leader_id,
                u.nickname AS leader_nickname, u.avatar AS leader_avatar
         FROM follows f
         JOIN trips t ON t.id = f.followee_id
         LEFT JOIN users u ON u.id = t.leader_id
         WHERE f.follower_id = ? AND f.follow_type = 2
         ORDER BY f.created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, pageSize, offset]
      );
    } else {
      [[{ total }]] = await pool.query(
        'SELECT COUNT(*) AS total FROM follows WHERE follower_id = ? AND follow_type = 1',
        [userId]
      );
      [rows] = await pool.query(
        `SELECT f.id AS follow_id, f.created_at AS followed_at,
                u.id, u.nickname, u.avatar, u.signature, u.vehicle_model, u.level, u.growth_value, u.is_certified
         FROM follows f
         JOIN users u ON u.id = f.followee_id
         WHERE f.follower_id = ? AND f.follow_type = 1
         ORDER BY f.created_at DESC
         LIMIT ? OFFSET ?`,
        [userId, pageSize, offset]
      );
    }

    res.json(ApiResponse.paginated(rows, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 12. follow — follow a user or team
// ---------------------------------------------------------------------------
const follow = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { followee_id, follow_type } = req.body;

    if (!followee_id) {
      return res.status(422).json(ApiResponse.fail('请提供要关注的用户或车队ID'));
    }

    const type = follow_type || 1; // default: follow a user

    // Cannot follow yourself
    if (type === 1 && followee_id === userId) {
      return res.status(400).json(ApiResponse.fail('不能关注自己'));
    }

    // Check if the target exists
    if (type === 1) {
      const [targetRows] = await pool.query('SELECT id, status FROM users WHERE id = ?', [followee_id]);
      if (targetRows.length === 0 || targetRows[0].status === 0) {
        return res.status(404).json(ApiResponse.fail('用户不存在或已禁用'));
      }
    }

    // Check if already following
    const [existing] = await pool.query(
      'SELECT id FROM follows WHERE follower_id = ? AND followee_id = ? AND follow_type = ?',
      [userId, followee_id, type]
    );
    if (existing.length > 0) {
      return res.status(400).json(ApiResponse.fail(type === 1 ? '已经关注了该用户' : '已经关注了该车队'));
    }

    // Check if blocked
    if (type === 1) {
      const [[blockCheck]] = await pool.query(
        'SELECT id FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
        [userId, followee_id, followee_id, userId]
      );
      if (blockCheck) {
        return res.status(400).json(ApiResponse.fail('无法关注该用户'));
      }
    }

    await pool.query(
      'INSERT INTO follows (follower_id, followee_id, follow_type, created_at) VALUES (?, ?, ?, NOW())',
      [userId, followee_id, type]
    );

    res.json(ApiResponse.success(null, '关注成功'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 13. unfollow — unfollow a user or team
// ---------------------------------------------------------------------------
const unfollow = async (req, res, next) => {
  try {
    const userId = req.userId;
    const followeeId = parseInt(req.params.followeeId);
    const followType = parseInt(req.query.type) || 1;

    if (!followeeId || isNaN(followeeId)) {
      return res.status(422).json(ApiResponse.fail('无效的ID'));
    }

    const [result] = await pool.query(
      'DELETE FROM follows WHERE follower_id = ? AND followee_id = ? AND follow_type = ?',
      [userId, followeeId, followType]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json(ApiResponse.fail('未关注该用户或车队'));
    }

    res.json(ApiResponse.success(null, '已取消关注'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 14. blockUser — block a user
// ---------------------------------------------------------------------------
const blockUser = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { blocked_id } = req.body;

    if (!blocked_id) {
      return res.status(422).json(ApiResponse.fail('请提供要屏蔽的用户ID'));
    }

    if (blocked_id === userId) {
      return res.status(400).json(ApiResponse.fail('不能屏蔽自己'));
    }

    // Check if target exists
    const [targetRows] = await pool.query('SELECT id FROM users WHERE id = ?', [blocked_id]);
    if (targetRows.length === 0) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }

    // Check if already blocked
    const [existing] = await pool.query(
      'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?',
      [userId, blocked_id]
    );
    if (existing.length > 0) {
      return res.status(400).json(ApiResponse.fail('已经屏蔽了该用户'));
    }

    await pool.query(
      'INSERT INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, NOW())',
      [userId, blocked_id]
    );

    // Also unfollow each other if following
    await pool.query(
      'DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)',
      [userId, blocked_id, blocked_id, userId]
    );

    res.json(ApiResponse.success(null, '已屏蔽该用户'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 15. unblockUser — unblock a user
// ---------------------------------------------------------------------------
const unblockUser = async (req, res, next) => {
  try {
    const userId = req.userId;
    const blockedId = parseInt(req.params.userId);

    if (!blockedId || isNaN(blockedId)) {
      return res.status(422).json(ApiResponse.fail('无效的用户ID'));
    }

    const [result] = await pool.query(
      'DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?',
      [userId, blockedId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json(ApiResponse.fail('未屏蔽该用户'));
    }

    res.json(ApiResponse.success(null, '已取消屏蔽'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 15.5. getBlockedUsers — get blocked user list
// ---------------------------------------------------------------------------
const getBlockedUsers = async (req, res, next) => {
  try {
    const userId = req.userId;

    const [rows] = await pool.query(
      `SELECT ub.blocked_id, ub.created_at AS block_date,
              u.id, u.nickname, u.avatar, u.phone
       FROM user_blocks ub
       LEFT JOIN users u ON ub.blocked_id = u.id
       WHERE ub.blocker_id = ?
       ORDER BY ub.created_at DESC`,
      [userId]
    );

    const records = rows.map(r => ({
      id: r.blocked_id,
      nickname: r.nickname || '车友',
      avatar: r.avatar || '',
      phone: r.phone || '',
      blockDate: r.block_date,
      blockedAt: r.block_date
    }));

    res.json(ApiResponse.success(records));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 16. dailyCheckin — daily check-in, award growth value
// ---------------------------------------------------------------------------
const dailyCheckin = async (req, res, next) => {
  try {
    const userId = req.userId;

    // Use Redis to check if the user has already checked in today
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const checkinKey = `checkin:${userId}:${today}`;

    const alreadyCheckedIn = await redis.get(checkinKey);
    if (alreadyCheckedIn) {
      return res.status(400).json(ApiResponse.fail('今日已签到'));
    }

    const growthAward = config.growth.factors.daily_checkin || 5;

    // Award growth value
    await pool.query(
      'UPDATE users SET growth_value = growth_value + ?, updated_at = NOW() WHERE id = ?',
      [growthAward, userId]
    );

    // Mark checked in (expire at end of day)
    const secondsUntilMidnight = Math.ceil(
      (new Date(today + 'T23:59:59+08:00').getTime() - Date.now()) / 1000
    );
    await redis.setEx(checkinKey, secondsUntilMidnight, '1');

    // Log operation
    await pool.query(
      'INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [userId, 'daily_checkin', 'user', String(userId), JSON.stringify({ growth_award: growthAward, date: today })]
    );

    // Get updated growth value
    const [[updatedUser]] = await pool.query(
      'SELECT growth_value, level FROM users WHERE id = ?',
      [userId]
    );
    const levelInfo = computeLevelInfo(updatedUser?.growth_value || 0);

    res.json(ApiResponse.success({
      growth_award: growthAward,
      growth_value: updatedUser?.growth_value || 0,
      level: levelInfo.level,
      level_name: levelInfo.levelName,
      consecutive_hint: '明天继续签到获得更多成长值'
    }, '签到成功'));
  } catch (err) {
    next(err);
  }
};

module.exports = {
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
};
