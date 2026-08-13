const pool = require('../config/db');
const { ApiResponse, calcDistance } = require('../utils/helpers');
const config = require('../config');

// ---------------------------------------------------------------------------
// C2: createTopicInternal — 话题创建内部函数(事务包裹,供 handler 和事件自动创建复用)
// ---------------------------------------------------------------------------
const createTopicInternal = async (params) => {
  const { poi_id, poi_name, poi_location, topic_name, creator_id, create_type = 'user', event_type = null } = params;

  if (!poi_id || !poi_name || !poi_location) {
    throw new Error('createTopicInternal: 缺少必要参数 poi_id/poi_name/poi_location');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. INSERT chat_session (creator_id 为 null 时 member_count=0,如事件自动创建)
    const [sessionResult] = await conn.query(
      `INSERT INTO chat_sessions (type, name, avatar, poi_id, poi_name, poi_location, creator_id, member_count, is_active, auto_created, created_at, updated_at)
       VALUES ('location_room', ?, NULL, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
      [topic_name || poi_name, poi_id, poi_name, JSON.stringify(poi_location), creator_id, creator_id ? 1 : 0, create_type === 'event' ? 1 : 0]
    );
    const sessionId = sessionResult.insertId;

    // 2. INSERT location_topic (create_type/event_type 区分手动 vs 事件)
    const [topicResult] = await conn.query(
      `INSERT INTO location_topics (poi_id, poi_name, poi_location, topic_name, session_id, creator_id, create_type, event_type, online_count, total_messages, status, last_message_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', NULL, NOW(), NOW())`,
      [poi_id, poi_name, JSON.stringify(poi_location), topic_name || null, sessionId, creator_id, create_type, event_type, creator_id ? 1 : 0]
    );
    const topicId = topicResult.insertId;

    // 3. INSERT member (creator_id 为 null 时跳过,如事件自动创建)
    if (creator_id) {
      await conn.query(
        'INSERT INTO chat_session_members (session_id, user_id, unread_count, is_muted, joined_at) VALUES (?, ?, 0, 0, NOW())',
        [sessionId, creator_id]
      );
    }

    await conn.commit();
    const [[topic]] = await pool.query('SELECT * FROM location_topics WHERE id = ?', [topicId]);
    return { sessionId, topicId, topic };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ---------------------------------------------------------------------------
// 1. createTopic — manually create a location topic (C2: 新建分支复用 createTopicInternal)
// ---------------------------------------------------------------------------
const createTopic = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { poi_id, poi_name, poi_location, topic_name } = req.body;

    if (!poi_id) {
      return res.status(422).json(ApiResponse.fail('请提供POI ID'));
    }
    if (!poi_name) {
      return res.status(422).json(ApiResponse.fail('请提供POI名称'));
    }
    if (!poi_location || poi_location.lng === undefined || poi_location.lat === undefined) {
      return res.status(422).json(ApiResponse.fail('请提供POI位置 {lng, lat}'));
    }

    // Check if a topic with the same poi_id and topic_name already exists
    const [existing] = await pool.query(
      'SELECT id, session_id, status FROM location_topics WHERE poi_id = ? AND topic_name = ?',
      [poi_id, topic_name || null]
    );

    if (existing.length > 0) {
      const sessionId = existing[0].session_id;

      // If archived, revive it
      if (existing[0].status === 'archived') {
        await pool.query(
          "UPDATE location_topics SET status = 'active', updated_at = NOW() WHERE id = ?",
          [existing[0].id]
        );
        await pool.query(
          'UPDATE chat_sessions SET is_active = 1, updated_at = NOW() WHERE id = ?',
          [sessionId]
        );
      }

      // Add user as member if not already
      const [[memberRow]] = await pool.query(
        'SELECT id FROM chat_session_members WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
        [sessionId, userId]
      );
      if (!memberRow) {
        await pool.query(
          'INSERT INTO chat_session_members (session_id, user_id, unread_count, is_muted, joined_at) VALUES (?, ?, 0, 0, NOW())',
          [sessionId, userId]
        );
        await pool.query(
          'UPDATE chat_sessions SET member_count = member_count + 1, updated_at = NOW() WHERE id = ?',
          [sessionId]
        );
      }

      const [[topic]] = await pool.query('SELECT * FROM location_topics WHERE id = ?', [existing[0].id]);
      return res.json(ApiResponse.success(topic, '话题已存在，已加入'));
    }

    // C2: 新建分支复用 createTopicInternal(事务包裹)
    const { topic } = await createTopicInternal({
      poi_id, poi_name, poi_location, topic_name,
      creator_id: userId,
      create_type: 'user'
    });

    res.json(ApiResponse.success(topic, '话题创建成功'));
  } catch (err) {
    // Handle duplicate key
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json(ApiResponse.fail('该话题已存在'));
    }
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 2. getNearbyTopics — get nearby location topics within radius
// ---------------------------------------------------------------------------
const getNearbyTopics = async (req, res, next) => {
  try {
    const userId = req.userId || null;
    const lng = parseFloat(req.query.lng);
    const lat = parseFloat(req.query.lat);
    const radius = parseInt(req.query.radius) || 20; // default 20km

    if (isNaN(lng) || isNaN(lat)) {
      return res.status(422).json(ApiResponse.fail('请提供经纬度坐标'));
    }

    // Get all active/quiet topics
    const [topics] = await pool.query(
      `SELECT lt.*, cs.last_message
       FROM location_topics lt
       LEFT JOIN chat_sessions cs ON cs.id = lt.session_id
       WHERE lt.status IN ('active', 'quiet')
       ORDER BY lt.online_count DESC, lt.last_message_at DESC
       LIMIT 200`,
    );

    // Filter and sort by distance
    const nearbyTopics = [];
    for (const t of topics) {
      let poiLocation;
      try {
        poiLocation = typeof t.poi_location === 'string'
          ? JSON.parse(t.poi_location)
          : t.poi_location;
      } catch {
        continue;
      }

      const dist = calcDistance(lng, lat, poiLocation.lng || 0, poiLocation.lat || 0);
      if (dist <= radius) {
        nearbyTopics.push({
          id: t.id,
          poi_id: t.poi_id,
          poi_name: t.poi_name,
          poi_location: poiLocation,
          topic_name: t.topic_name,
          session_id: t.session_id,
          creator_id: t.creator_id,
          create_type: t.create_type,
          online_count: t.online_count || 0,
          total_messages: t.total_messages || 0,
          status: t.status,
          last_message: t.last_message,
          last_message_at: t.last_message_at,
          distance_km: Math.round(dist * 100) / 100,
          created_at: t.created_at
        });
      }
    }

    // Sort by distance, then by online_count desc
    nearbyTopics.sort((a, b) => {
      if (a.distance_km !== b.distance_km) return a.distance_km - b.distance_km;
      return b.online_count - a.online_count;
    });

    res.json(ApiResponse.success({ list: nearbyTopics, total: nearbyTopics.length }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 3. getTopicDetail — get topic detail with recent messages
// ---------------------------------------------------------------------------
const getTopicDetail = async (req, res, next) => {
  try {
    const userId = req.userId;
    const topicId = parseInt(req.params.id);

    if (!topicId || isNaN(topicId)) {
      return res.status(422).json(ApiResponse.fail('无效的话题ID'));
    }

    // Get topic
    const [[topic]] = await pool.query(
      'SELECT * FROM location_topics WHERE id = ?',
      [topicId]
    );
    if (!topic) {
      return res.status(404).json(ApiResponse.fail('话题不存在'));
    }

    // Get session
    const [[session]] = await pool.query(
      'SELECT * FROM chat_sessions WHERE id = ?',
      [topic.session_id]
    );
    if (!session) {
      return res.status(404).json(ApiResponse.fail('会话不存在'));
    }

    // Check if user is a member
    const [[memberRow]] = await pool.query(
      'SELECT id FROM chat_session_members WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
      [session.id, userId]
    );

    const isMember = !!memberRow;

    // Get messages
    let messages = [];
    if (isMember) {
      // Full access — paginated messages
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 50));
      const offset = (page - 1) * pageSize;

      const [[{ total }]] = await pool.query(
        'SELECT COUNT(*) AS total FROM chat_messages WHERE session_id = ?',
        [session.id]
      );

      [messages] = await pool.query(
        `SELECT m.id, m.sender_id, m.type, m.content, m.extra, m.created_at,
                u.nickname AS sender_nickname, u.avatar AS sender_avatar
         FROM chat_messages m
         LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.session_id = ?
         ORDER BY m.created_at DESC
         LIMIT ? OFFSET ?`,
        [session.id, pageSize, offset]
      );

      // Update online_count
      await pool.query(
        'UPDATE location_topics SET online_count = online_count + 1, updated_at = NOW() WHERE id = ?',
        [topicId]
      );

      res.json(ApiResponse.success({
        topic: {
          id: topic.id,
          poi_id: topic.poi_id,
          poi_name: topic.poi_name,
          poi_location: topic.poi_location,
          topic_name: topic.topic_name,
          session_id: topic.session_id,
          create_type: topic.create_type,
          online_count: topic.online_count,
          total_messages: topic.total_messages,
          status: topic.status,
          last_message_at: topic.last_message_at,
          created_at: topic.created_at
        },
        is_participant: true,
        messages: {
          list: messages,
          pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
        }
      }));
    } else {
      // Preview only — first 3 messages
      [messages] = await pool.query(
        `SELECT m.id, m.sender_id, m.type, m.content, m.extra, m.created_at,
                u.nickname AS sender_nickname, u.avatar AS sender_avatar
         FROM chat_messages m
         LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.session_id = ?
         ORDER BY m.created_at DESC
         LIMIT 3`,
        [session.id]
      );

      res.json(ApiResponse.success({
        topic: {
          id: topic.id,
          poi_id: topic.poi_id,
          poi_name: topic.poi_name,
          poi_location: topic.poi_location,
          topic_name: topic.topic_name,
          session_id: topic.session_id,
          create_type: topic.create_type,
          online_count: topic.online_count,
          total_messages: topic.total_messages,
          status: topic.status,
          last_message_at: topic.last_message_at,
          created_at: topic.created_at
        },
        is_participant: false,
        messages_preview: messages,
        hint: '加入话题后可查看完整消息'
      }));
    }
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 4. joinTopic — join a location topic (participate)
// ---------------------------------------------------------------------------
const joinTopic = async (req, res, next) => {
  try {
    const userId = req.userId;
    const topicId = parseInt(req.params.id);

    if (!topicId || isNaN(topicId)) {
      return res.status(422).json(ApiResponse.fail('无效的话题ID'));
    }

    // Get topic
    const [[topic]] = await pool.query(
      'SELECT * FROM location_topics WHERE id = ?',
      [topicId]
    );
    if (!topic) {
      return res.status(404).json(ApiResponse.fail('话题不存在'));
    }

    const sessionId = topic.session_id;

    // Check if already a member
    const [[existingMember]] = await pool.query(
      'SELECT id FROM chat_session_members WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
      [sessionId, userId]
    );
    if (existingMember) {
      return res.status(400).json(ApiResponse.fail('您已加入该话题'));
    }

    // If topic was archived, revive it
    if (topic.status === 'archived') {
      await pool.query(
        "UPDATE location_topics SET status = 'active', online_count = online_count + 1, updated_at = NOW() WHERE id = ?",
        [topicId]
      );
      await pool.query(
        'UPDATE chat_sessions SET is_active = 1, updated_at = NOW() WHERE id = ?',
        [sessionId]
      );
    } else {
      await pool.query(
        'UPDATE location_topics SET online_count = online_count + 1, updated_at = NOW() WHERE id = ?',
        [topicId]
      );
    }

    // Add to chat_session_members
    await pool.query(
      'INSERT INTO chat_session_members (session_id, user_id, unread_count, is_muted, joined_at) VALUES (?, ?, 0, 0, NOW())',
      [sessionId, userId]
    );

    // Update member count
    await pool.query(
      'UPDATE chat_sessions SET member_count = member_count + 1, updated_at = NOW() WHERE id = ?',
      [sessionId]
    );

    res.json(ApiResponse.success({
      topic_id: topicId,
      session_id: sessionId,
      status: 'active'
    }, '已加入话题'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 5. leaveTopic — leave a location topic
// ---------------------------------------------------------------------------
const leaveTopic = async (req, res, next) => {
  try {
    const userId = req.userId;
    const topicId = parseInt(req.params.id);

    if (!topicId || isNaN(topicId)) {
      return res.status(422).json(ApiResponse.fail('无效的话题ID'));
    }

    // Get topic
    const [[topic]] = await pool.query(
      'SELECT * FROM location_topics WHERE id = ?',
      [topicId]
    );
    if (!topic) {
      return res.status(404).json(ApiResponse.fail('话题不存在'));
    }

    const sessionId = topic.session_id;

    // Check membership
    const [[memberRow]] = await pool.query(
      'SELECT id FROM chat_session_members WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
      [sessionId, userId]
    );
    if (!memberRow) {
      return res.status(400).json(ApiResponse.fail('您未加入该话题'));
    }

    // Mark as left (soft leave)
    await pool.query(
      'UPDATE chat_session_members SET left_at = NOW() WHERE session_id = ? AND user_id = ?',
      [sessionId, userId]
    );

    // Update online_count and member_count
    await pool.query(
      'UPDATE location_topics SET online_count = GREATEST(online_count - 1, 0), updated_at = NOW() WHERE id = ?',
      [topicId]
    );
    await pool.query(
      'UPDATE chat_sessions SET member_count = GREATEST(member_count - 1, 0), updated_at = NOW() WHERE id = ?',
      [sessionId]
    );

    res.json(ApiResponse.success(null, '已离开话题'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 6. getMyTopics — get topics the user has participated in
// ---------------------------------------------------------------------------
const getMyTopics = async (req, res, next) => {
  try {
    const userId = req.userId;

    // Get sessions the user is a member of (including left ones for read-only access)
    const [rows] = await pool.query(
      `SELECT DISTINCT lt.*, cs.last_message, csm.left_at, csm.joined_at
       FROM chat_session_members csm
       JOIN chat_sessions cs ON cs.id = csm.session_id AND cs.type = 'location_room'
       JOIN location_topics lt ON lt.session_id = cs.id
       WHERE csm.user_id = ?
       ORDER BY
         CASE WHEN lt.status = 'archived' THEN 1 ELSE 0 END ASC,
         lt.last_message_at DESC`,
      [userId]
    );

    const activeTopics = [];
    const archivedTopics = [];

    for (const t of rows) {
      const obj = {
        id: t.id,
        poi_id: t.poi_id,
        poi_name: t.poi_name,
        poi_location: t.poi_location,
        topic_name: t.topic_name,
        session_id: t.session_id,
        create_type: t.create_type,
        online_count: t.online_count || 0,
        total_messages: t.total_messages || 0,
        status: t.status,
        last_message: t.last_message,
        last_message_at: t.last_message_at,
        joined_at: t.joined_at,
        has_left: !!t.left_at,
        created_at: t.created_at
      };

      if (t.status === 'archived') {
        archivedTopics.push(obj);
      } else {
        activeTopics.push(obj);
      }
    }

    res.json(ApiResponse.success({
      active: activeTopics,
      archived: archivedTopics.length > 0 ? archivedTopics : undefined,
      total: rows.length
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 7. followTopic — follow a topic without joining the chat
// ---------------------------------------------------------------------------
const followTopic = async (req, res, next) => {
  try {
    const userId = req.userId;
    const topicId = parseInt(req.params.id);

    if (!topicId || isNaN(topicId)) {
      return res.status(422).json(ApiResponse.fail('无效的话题ID'));
    }

    // Get topic
    const [[topic]] = await pool.query(
      'SELECT * FROM location_topics WHERE id = ?',
      [topicId]
    );
    if (!topic) {
      return res.status(404).json(ApiResponse.fail('话题不存在'));
    }

    // Check if already following (use follows table with type 3 for topics)
    const [[existing]] = await pool.query(
      'SELECT id FROM follows WHERE follower_id = ? AND followee_id = ? AND follow_type = 3',
      [userId, topicId]
    );
    if (existing) {
      return res.status(400).json(ApiResponse.fail('已关注该话题'));
    }

    // Insert follow record (follow_type=3 means topic)
    await pool.query(
      'INSERT INTO follows (follower_id, followee_id, follow_type, created_at) VALUES (?, ?, 3, NOW())',
      [userId, topicId]
    );

    res.json(ApiResponse.success({
      topic_id: topicId,
      followed: true
    }, '已关注话题'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 8. checkAndArchiveTopics — scheduled job: archive stale topics
// ---------------------------------------------------------------------------
const checkAndArchiveTopics = async (req, res, next) => {
  try {
    const archiveHours = config.chatRoomArchiveHours || 24;
    const cutoffTime = new Date(Date.now() - archiveHours * 60 * 60 * 1000).toISOString();

    // Find topics where last_message_at > 24 hours ago (or NULL with created_at > 24h)
    const [topicsToArchive] = await pool.query(
      `SELECT id, session_id, last_message_at, created_at, status
       FROM location_topics
       WHERE status IN ('active', 'quiet')
         AND (
           (last_message_at IS NOT NULL AND last_message_at < ?)
           OR (last_message_at IS NULL AND created_at < ?)
         )`,
      [cutoffTime, cutoffTime]
    );

    let archivedCount = 0;

    for (const t of topicsToArchive) {
      await pool.query(
        "UPDATE location_topics SET status = 'archived', updated_at = NOW() WHERE id = ?",
        [t.id]
      );

      if (t.session_id) {
        await pool.query(
          'UPDATE chat_sessions SET is_active = 0, updated_at = NOW() WHERE id = ?',
          [t.session_id]
        );
      }

      archivedCount++;
    }

    res.json(ApiResponse.success({
      archived_count: archivedCount,
      checked_at: new Date().toISOString()
    }, `已归档 ${archivedCount} 个话题`));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createTopic,
  createTopicInternal,
  getNearbyTopics,
  getTopicDetail,
  joinTopic,
  leaveTopic,
  getMyTopics,
  followTopic,
  checkAndArchiveTopics
};
