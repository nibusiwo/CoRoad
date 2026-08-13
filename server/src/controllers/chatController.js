const pool = require('../config/db');
const { ApiResponse, calcDistance } = require('../utils/helpers');
const config = require('../config');
const websocket = require('../services/websocket');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether two users are in the same team (same active trip).
 */
async function areUsersInSameTeam(userId, otherUserId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM trip_members tm1
     JOIN trip_members tm2 ON tm1.trip_id = tm2.trip_id
     JOIN trips t ON t.id = tm1.trip_id
     WHERE tm1.user_id = ? AND tm1.status = 2
       AND tm2.user_id = ? AND tm2.status = 2
       AND t.status = 2`,
    [userId, otherUserId]
  );
  return rows[0].cnt > 0;
}

/**
 * Count messages sent by `senderId` in `sessionId`.
 */
async function countMessagesFromSender(sessionId, senderId) {
  const [[row]] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM chat_messages WHERE session_id = ? AND sender_id = ? AND type != ?',
    [sessionId, senderId, 'system']
  );
  return row.cnt;
}

async function hasReplyFromUser(sessionId, userId) {
  const [[row]] = await pool.query(
    'SELECT id FROM chat_messages WHERE session_id = ? AND sender_id = ? AND type != ? LIMIT 1',
    [sessionId, userId, 'system']
  );
  return !!row;
}

/**
 * Check block status between two users (either direction).
 */
async function checkBlockBetween(userA, userB) {
  const [[row]] = await pool.query(
    'SELECT id FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
    [userA, userB, userB, userA]
  );
  return !!row;
}

/**
 * Try broadcasting via WebSocket if a global `wsServer` is available.
 */
function tryBroadcast(event, data) {
  try {
    if (global.wsServer) {
      global.wsServer.emit(event, data);
    }
  } catch (_) { /* ignore */ }
}

/**
 * Format a raw user row into a public summary for chat context.
 */
function userSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    nickname: row.nickname,
    avatar: row.avatar
  };
}

// ---------------------------------------------------------------------------
// 1. getSessions — chat session list
// ---------------------------------------------------------------------------
const getSessions = async (req, res, next) => {
  try {
    const userId = req.userId;
    // A9: 接受前端别名 'team'/'topic',映射到后端 'team_group'/'location_room'
    const typeFilterRaw = req.query.type || 'all';
    const typeFilterMap = {
      all: 'all',
      team_group: 'team_group',
      team: 'team_group',
      private: 'private',
      location_room: 'location_room',
      topic: 'location_room'
    };
    const typeFilter = typeFilterMap[typeFilterRaw] || 'all';

    let typeCondition = '';
    const params = [userId, userId];

    if (typeFilter === 'team_group') {
      typeCondition = 'AND cs.type = ?';
      params.push('team_group');
    } else if (typeFilter === 'private') {
      typeCondition = 'AND cs.type = ?';
      params.push('private');
    } else if (typeFilter === 'location_room') {
      typeCondition = 'AND cs.type = ?';
      params.push('location_room');
    }

    const sql = `
      SELECT
        cs.id, cs.type, cs.name, cs.avatar, cs.trip_id,
        cs.poi_id, cs.poi_name, cs.poi_location,
        cs.member_count, cs.last_message, cs.is_active,
        csm.unread_count, csm.is_muted,
        cs.created_at, cs.updated_at
      FROM chat_sessions cs
      JOIN chat_session_members csm ON csm.session_id = cs.id AND csm.user_id = ? AND csm.left_at IS NULL
      WHERE cs.id IN (
        SELECT session_id FROM chat_session_members WHERE user_id = ? AND left_at IS NULL
      )
      ${typeCondition}
      ORDER BY
        CASE WHEN cs.type = 'location_room' AND cs.is_active = 0 THEN 1 ELSE 0 END ASC,
        cs.updated_at DESC
    `;

    const [sessions] = await pool.query(sql, params);

    // Fetch member avatars for all listed sessions (used by the message page
    // to render a WeChat-style avatar grid for team/group chats).
    const sessionIds = sessions.map((s) => s.id);
    let memberAvatarMap = {};
    if (sessionIds.length > 0) {
      const [memberRows] = await pool.query(
        `SELECT csm.session_id, csm.user_id, u.avatar AS avatar, u.nickname AS nickname
         FROM chat_session_members csm
         JOIN users u ON u.id = csm.user_id
         WHERE csm.session_id IN (?) AND csm.left_at IS NULL
         ORDER BY csm.joined_at ASC`,
        [sessionIds]
      );
      memberAvatarMap = memberRows.reduce((map, row) => {
        if (!map[row.session_id]) map[row.session_id] = [];
        map[row.session_id].push({
          user_id: row.user_id,
          avatar: row.avatar,
          nickname: row.nickname
        });
        return map;
      }, {});
    }

    // Classify into active and archived
    const activeSessions = [];
    const archivedSessions = [];

    for (const s of sessions) {
      const obj = {
        id: s.id,
        type: s.type,
        name: s.name,
        avatar: s.avatar,
        trip_id: s.trip_id,
        poi_id: s.poi_id,
        poi_name: s.poi_name,
        poi_location: s.poi_location,
        member_count: s.member_count,
        last_message: s.last_message,
        is_active: s.is_active,
        unread_count: s.unread_count || 0,
        is_muted: s.is_muted,
        member_avatars: memberAvatarMap[s.id] || [],
        created_at: s.created_at,
        updated_at: s.updated_at
      };

      if (s.type === 'location_room' && s.is_active === 0) {
        archivedSessions.push(obj);
      } else {
        activeSessions.push(obj);
      }
    }

    res.json(ApiResponse.success({
      active: activeSessions,
      archived: archivedSessions.length > 0 ? archivedSessions : undefined
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 2. getSessionDetail — session info + paginated messages
// ---------------------------------------------------------------------------
const getSessionDetail = async (req, res, next) => {
  try {
    const userId = req.userId;
    const sessionId = parseInt(req.params.id);
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    if (!sessionId || isNaN(sessionId)) {
      return res.status(422).json(ApiResponse.fail('无效的会话ID'));
    }

    // Check membership
    const [[memberRow]] = await pool.query(
      'SELECT id FROM chat_session_members WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
      [sessionId, userId]
    );
    if (!memberRow) {
      return res.status(403).json(ApiResponse.fail('您不是该会话的成员'));
    }

    // Get session info
    const [[session]] = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = ?',
      [sessionId]
    );
    if (!session) {
      return res.status(404).json(ApiResponse.fail('会话不存在'));
    }

    // Get total message count
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM chat_messages WHERE session_id = ?',
      [sessionId]
    );

    // Get messages (newest first, with offset)
    const [messages] = await pool.query(
      `SELECT m.id, m.session_id, m.sender_id, m.type, m.content, m.extra, m.created_at,
              u.nickname AS sender_nickname, u.avatar AS sender_avatar
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.session_id = ?
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [sessionId, pageSize, offset]
    );

    res.json(ApiResponse.success({
      session: {
        id: session.id,
        type: session.type,
        name: session.name,
        avatar: session.avatar,
        trip_id: session.trip_id,
        poi_id: session.poi_id,
        poi_name: session.poi_name,
        poi_location: session.poi_location,
        member_count: session.member_count,
        last_message: session.last_message,
        is_active: session.is_active,
        created_at: session.created_at,
        updated_at: session.updated_at
      },
      messages: {
        list: messages,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 3. sendMessage — send a message to a session
// ---------------------------------------------------------------------------
const sendMessage = async (req, res, next) => {
  try {
    const senderId = req.userId;
    const sessionId = parseInt(req.params.id);
    const { type, content, extra } = req.body;

    if (!sessionId || isNaN(sessionId)) {
      return res.status(422).json(ApiResponse.fail('无效的会话ID'));
    }
    if (!content || (typeof content === 'string' && !content.trim())) {
      return res.status(422).json(ApiResponse.fail('消息内容不能为空'));
    }

    // Get session info
    const [[session]] = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = ?',
      [sessionId]
    );
    if (!session) {
      return res.status(404).json(ApiResponse.fail('会话不存在'));
    }

    // Check user is a member
    const [[memberRow]] = await pool.query(
      'SELECT id FROM chat_session_members WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
      [sessionId, senderId]
    );
    if (!memberRow) {
      return res.status(403).json(ApiResponse.fail('您不是该会话的成员'));
    }

    // Validate private messaging rules
    if (session.type === 'private') {
      // Find the other member
      const [otherMembers] = await pool.query(
        `SELECT user_id FROM chat_session_members
         WHERE session_id = ? AND user_id != ? AND left_at IS NULL`,
        [sessionId, senderId]
      );

      if (otherMembers.length > 0) {
        const otherUserId = otherMembers[0].user_id;

        // Check block
        const blocked = await checkBlockBetween(senderId, otherUserId);
        if (blocked) {
          return res.status(403).json(ApiResponse.fail('无法发送消息：您已屏蔽该用户或被该用户屏蔽'));
        }

        // Check team membership (always allow)
        const sameTeam = await areUsersInSameTeam(senderId, otherUserId);
        if (!sameTeam) {
          // Check mutual follow
          const [[follow1]] = await pool.query(
            'SELECT id FROM follows WHERE follower_id = ? AND followee_id = ? AND follow_type = 1',
            [senderId, otherUserId]
          );
          const [[follow2]] = await pool.query(
            'SELECT id FROM follows WHERE follower_id = ? AND followee_id = ? AND follow_type = 1',
            [otherUserId, senderId]
          );

          const mutualFollow = !!(follow1 && follow2);
          const oneWayFollow = !!(follow1 || follow2);

          if (mutualFollow) {
            // Mutual followers — always allow
          } else if (oneWayFollow) {
            // Follower-only: allow 3 messages until the other user replies.
            const unlockedByReply = await hasReplyFromUser(sessionId, otherUserId);
            if (!unlockedByReply) {
              const msgCount = await countMessagesFromSender(sessionId, senderId);
              if (msgCount >= 3) {
                return res.status(403).json(ApiResponse.fail('关注后可发消息'));
              }
            }
          } else {
            // Neither — reject
            return res.status(403).json(ApiResponse.fail('关注后可发消息'));
          }
        }
      }
    }

    // A11: 归档话题复活机制 - 不再阻止发言,改为复活后允许发送
    if (session.type === 'location_room' && session.is_active === 0) {
      // 复活话题:status='archived' → 'active',is_active 0 → 1
      await pool.query(
        "UPDATE location_topics SET status = 'active', last_message_at = NOW(), updated_at = NOW() WHERE session_id = ?",
        [sessionId]
      );
      await pool.query(
        'UPDATE chat_sessions SET is_active = 1, updated_at = NOW() WHERE id = ?',
        [sessionId]
      );
      session.is_active = 1; // 同步内存中的状态

      // 复活后通知所有成员
      tryBroadcast('topic_revived', { session_id: sessionId });
    }

    const messageType = type || 'text';
    const messageExtra = extra ? JSON.stringify(extra) : null;

    // Insert the message
    const [insertResult] = await pool.query(
      'INSERT INTO chat_messages (session_id, sender_id, type, content, extra, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [sessionId, senderId, messageType, content, messageExtra]
    );

    // Update session last_message and updated_at
    const lastMessage = JSON.stringify({
      content: content.length > 100 ? content.slice(0, 100) + '...' : content,
      sender_id: senderId,
      time: new Date().toISOString()
    });
    await pool.query(
      'UPDATE chat_sessions SET last_message = ?, updated_at = NOW() WHERE id = ?',
      [lastMessage, sessionId]
    );

    // Update location_topics if applicable
    if (session.type === 'location_room') {
      await pool.query(
        'UPDATE location_topics SET total_messages = total_messages + 1, last_message_at = NOW(), online_count = online_count + 1, updated_at = NOW() WHERE session_id = ?',
        [sessionId]
      );
    }

    // Increment unread_count for all other members
    await pool.query(
      `UPDATE chat_session_members
       SET unread_count = unread_count + 1
       WHERE session_id = ? AND user_id != ? AND left_at IS NULL AND is_muted = 0`,
      [sessionId, senderId]
    );

    // Get sender info for the response
    const [[sender]] = await pool.query(
      'SELECT id, nickname, avatar FROM users WHERE id = ?',
      [senderId]
    );

    const messageObj = {
      id: insertResult.insertId,
      session_id: sessionId,
      sender_id: senderId,
      sender_nickname: sender?.nickname || '',
      sender_avatar: sender?.avatar || null,
      type: messageType,
      content,
      extra: extra || null,
      created_at: new Date().toISOString()
    };

    // A13: websocket 精准推送 - 只推送给会话成员(而非全局广播)
    websocket.notifyNewMessage(sessionId, senderId, messageObj, global.wsServer);
    // 保留全局广播作为兜底(防止客户端只监听老事件)
    tryBroadcast('chat_message', {
      session_id: sessionId,
      message: messageObj
    });

    // A15: 关注话题后新消息通知 - 给话题关注者发送通知
    if (session.type === 'location_room') {
      try {
        const [[topicInfo]] = await pool.query(
          'SELECT id, poi_name FROM location_topics WHERE session_id = ?',
          [sessionId]
        );
        if (topicInfo) {
          const [followers] = await pool.query(
            'SELECT follower_id FROM follows WHERE followee_id = ? AND follow_type = 3',
            [topicInfo.id]
          );
          if (followers.length > 0) {
            const contentPreview = content.length > 50 ? content.slice(0, 50) + '...' : content;
            const notifyPayload = {
              title: '话题有新消息',
              content: `你关注的【${topicInfo.poi_name}】有新消息: ${contentPreview}`,
              type: 'topic_new_message',
              priority: 'normal',
              data: { session_id: sessionId, topic_id: topicInfo.id }
            };
            const followerIds = followers.map((f) => f.follower_id).filter((id) => id !== senderId);
            websocket.sendSystemNotification(followerIds, notifyPayload, global.wsServer);
          }
        }
      } catch (notifyErr) {
        console.warn('[Chat] topic followers notify failed:', notifyErr.message);
      }
    }

    res.json(ApiResponse.success(messageObj, '发送成功'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 4. createPrivateSession — create or get existing private chat
// ---------------------------------------------------------------------------
const createPrivateSession = async (req, res, next) => {
  try {
    const userId = req.userId;
    const target_user_id = req.body.target_user_id || req.body.user_id || req.body.userId;

    if (!target_user_id) {
      return res.status(422).json(ApiResponse.fail('请提供目标用户ID'));
    }

    const targetUserId = parseInt(target_user_id);
    if (targetUserId === userId) {
      return res.status(400).json(ApiResponse.fail('不能和自己创建私聊'));
    }

    // Check target user exists
    const [[targetUser]] = await pool.query(
      'SELECT id, nickname, avatar, status FROM users WHERE id = ?',
      [targetUserId]
    );
    if (!targetUser || targetUser.status === 0) {
      return res.status(404).json(ApiResponse.fail('用户不存在或已禁用'));
    }

    // Check block status
    const blocked = await checkBlockBetween(userId, targetUserId);
    if (blocked) {
      return res.status(403).json(ApiResponse.fail('无法发起私聊：您已屏蔽该用户或被该用户屏蔽'));
    }

    // Check if a private session already exists between these two users
    const [existingSessions] = await pool.query(
      `SELECT cs.id FROM chat_sessions cs
       JOIN chat_session_members csm1 ON csm1.session_id = cs.id AND csm1.user_id = ? AND csm1.left_at IS NULL
       JOIN chat_session_members csm2 ON csm2.session_id = cs.id AND csm2.user_id = ? AND csm2.left_at IS NULL
       WHERE cs.type = 'private'`,
      [userId, targetUserId]
    );

    if (existingSessions.length > 0) {
      // Session already exists — return it directly
      const sessionId = existingSessions[0].id;
      const [[session]] = await pool.query(
        'SELECT * FROM chat_sessions WHERE id = ?',
        [sessionId]
      );

      return res.json(ApiResponse.success({
        session: {
          id: session.id,
          type: session.type,
          name: session.name,
          avatar: session.avatar,
          member_count: session.member_count,
          last_message: session.last_message,
          is_active: session.is_active,
          created_at: session.created_at,
          updated_at: session.updated_at
        },
        target_user: userSummary(targetUser),
        is_existing: true
      }, '已存在的私聊会话'));
    }

    // Determine if this should be a limited session
    let isLimited = false;

    // Check team membership
    const sameTeam = await areUsersInSameTeam(userId, targetUserId);

    if (!sameTeam) {
      // Check follow status
      const [[myFollow]] = await pool.query(
        'SELECT id FROM follows WHERE follower_id = ? AND followee_id = ? AND follow_type = 1',
        [userId, targetUserId]
      );
      const [[theirFollow]] = await pool.query(
        'SELECT id FROM follows WHERE follower_id = ? AND followee_id = ? AND follow_type = 1',
        [targetUserId, userId]
      );

      if (myFollow && theirFollow) {
        // Mutual follow — full access
      } else if (myFollow || theirFollow) {
        // One-way follow — limited 3 messages
        isLimited = true;
      } else {
        // Neither — reject
        return res.status(403).json(ApiResponse.fail('关注后可发消息'));
      }
    }

    // Create the session
    const name = `${targetUser.nickname || '用户'} 的私聊`;
    const [insertResult] = await pool.query(
      `INSERT INTO chat_sessions (type, name, avatar, member_count, last_message, is_active, created_at, updated_at)
       VALUES ('private', ?, ?, 2, NULL, 1, NOW(), NOW())`,
      [name, targetUser.avatar || null]
    );
    const sessionId = insertResult.insertId;

    // Add both users as members
    await pool.query(
      `INSERT INTO chat_session_members (session_id, user_id, unread_count, is_muted, joined_at)
       VALUES (?, ?, 0, 0, NOW()), (?, ?, 0, 0, NOW())`,
      [sessionId, userId, sessionId, targetUserId]
    );

    // If limited, insert a system message
    if (isLimited) {
      await pool.query(
        `INSERT INTO chat_messages (session_id, sender_id, type, content, extra, created_at)
         VALUES (?, 0, 'system', '关注后可无限发消息，当前仅限3条', NULL, NOW())`,
        [sessionId]
      );
    }

    const [[session]] = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = ?',
      [sessionId]
    );

    res.json(ApiResponse.success({
      session: {
        id: session.id,
        type: session.type,
        name: session.name,
        avatar: session.avatar,
        member_count: session.member_count,
        last_message: session.last_message,
        is_active: session.is_active,
        created_at: session.created_at,
        updated_at: session.updated_at
      },
      target_user: userSummary(targetUser),
      is_limited: isLimited,
      is_existing: false
    }, '私聊会话已创建'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 5. getUnreadCount — total unread count across all sessions
// ---------------------------------------------------------------------------
const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.userId;

    const [[{ total }]] = await pool.query(
      `SELECT COALESCE(SUM(csm.unread_count), 0) AS total
       FROM chat_session_members csm
       JOIN chat_sessions cs ON cs.id = csm.session_id
       WHERE csm.user_id = ? AND csm.left_at IS NULL AND cs.is_active = 1`,
      [userId]
    );

    res.json(ApiResponse.success({ unread_count: total }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 6. markAsRead — mark all messages in a session as read
// ---------------------------------------------------------------------------
const markAsRead = async (req, res, next) => {
  try {
    const userId = req.userId;
    const sessionId = parseInt(req.params.id);

    if (!sessionId || isNaN(sessionId)) {
      return res.status(422).json(ApiResponse.fail('无效的会话ID'));
    }

    const [result] = await pool.query(
      'UPDATE chat_session_members SET unread_count = 0 WHERE session_id = ? AND user_id = ?',
      [sessionId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json(ApiResponse.fail('会话不存在或您不是其成员'));
    }

    res.json(ApiResponse.success(null, '已标记为已读'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 7. muteSession — mute notifications for a session
// ---------------------------------------------------------------------------
const muteSession = async (req, res, next) => {
  try {
    const userId = req.userId;
    const sessionId = parseInt(req.params.id);

    if (!sessionId || isNaN(sessionId)) {
      return res.status(422).json(ApiResponse.fail('无效的会话ID'));
    }

    const [result] = await pool.query(
      'UPDATE chat_session_members SET is_muted = 1 WHERE session_id = ? AND user_id = ?',
      [sessionId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json(ApiResponse.fail('会话不存在或您不是其成员'));
    }

    res.json(ApiResponse.success({ session_id: sessionId, is_muted: true }, '已设为免打扰'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 8. unmuteSession — unmute notifications for a session
// ---------------------------------------------------------------------------
const unmuteSession = async (req, res, next) => {
  try {
    const userId = req.userId;
    const sessionId = parseInt(req.params.id);

    if (!sessionId || isNaN(sessionId)) {
      return res.status(422).json(ApiResponse.fail('无效的会话ID'));
    }

    const [result] = await pool.query(
      'UPDATE chat_session_members SET is_muted = 0 WHERE session_id = ? AND user_id = ?',
      [sessionId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json(ApiResponse.fail('会话不存在或您不是其成员'));
    }

    res.json(ApiResponse.success({ session_id: sessionId, is_muted: false }, '已取消免打扰'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 8.5 clearSessionMessages — 清空会话聊天记录(仅会话成员)
// ---------------------------------------------------------------------------
const clearSessionMessages = async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id);
    const userId = req.userId;
    if (!sessionId || isNaN(sessionId)) {
      return res.status(422).json(ApiResponse.fail('无效的会话ID'));
    }

    const [[memberRow]] = await pool.query(
      'SELECT id FROM chat_session_members WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
      [sessionId, userId]
    );
    if (!memberRow) {
      return res.status(403).json(ApiResponse.fail('您不是该会话的成员'));
    }

    await pool.query(
      'DELETE FROM chat_messages WHERE session_id = ?',
      [sessionId]
    );
    await pool.query(
      'UPDATE chat_sessions SET last_message = NULL, updated_at = NOW() WHERE id = ?',
      [sessionId]
    );

    res.json(ApiResponse.success(null, '聊天记录已清空'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 8.6 leaveSession — 退出群聊/删除会话(移除成员关系)
// ---------------------------------------------------------------------------
const leaveSession = async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id);
    const userId = req.userId;
    if (!sessionId || isNaN(sessionId)) {
      return res.status(422).json(ApiResponse.fail('无效的会话ID'));
    }

    const [result] = await pool.query(
      `UPDATE chat_session_members SET left_at = NOW()
       WHERE session_id = ? AND user_id = ? AND left_at IS NULL`,
      [sessionId, userId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json(ApiResponse.fail('您不在该会话中'));
    }

    await pool.query(
      'UPDATE chat_sessions SET member_count = GREATEST(member_count - 1, 0), updated_at = NOW() WHERE id = ?',
      [sessionId]
    );

    res.json(ApiResponse.success(null, '已退出群聊'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 8.7 getSessionMembers — 会话成员列表(群资料)
// ---------------------------------------------------------------------------
const getSessionMembers = async (req, res, next) => {
  try {
    const sessionId = parseInt(req.params.id);
    const userId = req.userId;
    if (!sessionId || isNaN(sessionId)) {
      return res.status(422).json(ApiResponse.fail('无效的会话ID'));
    }

    const [[memberRow]] = await pool.query(
      'SELECT id FROM chat_session_members WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
      [sessionId, userId]
    );
    if (!memberRow) {
      return res.status(403).json(ApiResponse.fail('您不是该会话的成员'));
    }

    const [[session]] = await pool.query(
      'SELECT id, type, name, member_count, trip_id FROM chat_sessions WHERE id = ?',
      [sessionId]
    );
    if (!session) {
      return res.status(404).json(ApiResponse.fail('会话不存在'));
    }

    const [members] = await pool.query(
      `SELECT csm.user_id, u.nickname, u.avatar, u.level, u.is_certified, csm.joined_at,
              tm.role AS trip_role
       FROM chat_session_members csm
       JOIN users u ON u.id = csm.user_id
       LEFT JOIN trip_members tm ON tm.trip_id = ? AND tm.user_id = csm.user_id AND tm.status IN (1, 2)
       WHERE csm.session_id = ? AND csm.left_at IS NULL
       ORDER BY tm.role ASC, csm.joined_at ASC`,
      [session.trip_id, sessionId]
    );

    res.json(ApiResponse.success({
      session: {
        id: session.id,
        type: session.type,
        name: session.name,
        member_count: session.member_count,
        trip_id: session.trip_id
      },
      members: members.map((m) => ({
        userId: m.user_id,
        nickname: m.nickname,
        avatar: m.avatar,
        level: m.level,
        is_certified: m.is_certified,
        role: m.trip_role || null,
        joined_at: m.joined_at
      }))
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 9. shareToSession — share content to a session as a system message
// ---------------------------------------------------------------------------
const shareToSession = async (req, res, next) => {
  try {
    const userId = req.userId;
    const sessionId = parseInt(req.params.id);
    const { share_type, share_data } = req.body;

    if (!sessionId || isNaN(sessionId)) {
      return res.status(422).json(ApiResponse.fail('无效的会话ID'));
    }
    if (!share_type || !share_data) {
      return res.status(422).json(ApiResponse.fail('请提供分享类型和分享数据'));
    }

    const validTypes = ['location', 'group_buy', 'traffic_event'];
    if (!validTypes.includes(share_type)) {
      return res.status(422).json(ApiResponse.fail(`无效的分享类型，仅支持: ${validTypes.join(', ')}`));
    }

    // Check membership
    const [[memberRow]] = await pool.query(
      'SELECT id FROM chat_session_members WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
      [sessionId, userId]
    );
    if (!memberRow) {
      return res.status(403).json(ApiResponse.fail('您不是该会话的成员'));
    }

    // Get session
    const [[session]] = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = ?',
      [sessionId]
    );
    if (!session) {
      return res.status(404).json(ApiResponse.fail('会话不存在'));
    }

    // Build content based on share type
    let content = '';
    const extra = {
      share_type,
      share_data,
      shared_by: userId
    };

    switch (share_type) {
      case 'location':
        content = `[位置分享] ${share_data.name || ''}`;
        extra.location = { lng: share_data.lng, lat: share_data.lat };
        break;
      case 'group_buy':
        content = `[拼团分享] ${share_data.product_name || ''}`;
        extra.activity_id = share_data.activity_id;
        break;
      case 'traffic_event':
        content = `[交通事件] ${share_data.event_desc || ''}`;
        extra.event_type = share_data.event_type;
        break;
    }

    // Insert system message
    const [insertResult] = await pool.query(
      'INSERT INTO chat_messages (session_id, sender_id, type, content, extra, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [sessionId, userId, 'system', content, JSON.stringify(extra)]
    );

    // Update session last_message and updated_at
    const lastMessage = JSON.stringify({
      content: content,
      sender_id: userId,
      time: new Date().toISOString()
    });
    await pool.query(
      'UPDATE chat_sessions SET last_message = ?, updated_at = NOW() WHERE id = ?',
      [lastMessage, sessionId]
    );

    // Increment unread_count for other members
    await pool.query(
      `UPDATE chat_session_members
       SET unread_count = unread_count + 1
       WHERE session_id = ? AND user_id != ? AND left_at IS NULL AND is_muted = 0`,
      [sessionId, userId]
    );

    const messageObj = {
      id: insertResult.insertId,
      session_id: sessionId,
      sender_id: userId,
      type: 'system',
      content,
      extra,
      created_at: new Date().toISOString()
    };

    // Broadcast via WebSocket
    tryBroadcast('chat_message', {
      session_id: sessionId,
      message: messageObj
    });

    res.json(ApiResponse.success(messageObj, '分享成功'));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSessions,
  getSessionDetail,
  sendMessage,
  createPrivateSession,
  getUnreadCount,
  markAsRead,
  muteSession,
  unmuteSession,
  clearSessionMessages,
  leaveSession,
  getSessionMembers,
  shareToSession
};
