const pool = require('../config/db');
const config = require('../config');
const { ApiResponse, toMysqlDatetime } = require('../utils/helpers');

// =============================================================================
// 1. createDraft — Create a trip draft.
// =============================================================================
const createDraft = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { start_point, end_point, departure_time } = req.body;

    // Validation
    if (!start_point && !end_point && !departure_time) {
      return res.status(422).json(ApiResponse.fail('请至少填写一项信息'));
    }

    const departureTime = toMysqlDatetime(departure_time);
    const [result] = await pool.query(
      `INSERT INTO next_trip_drafts (user_id, start_point, end_point, departure_time, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
      [
        userId,
        start_point ? JSON.stringify(start_point) : null,
        end_point ? JSON.stringify(end_point) : null,
        departureTime
      ]
    );

    res.json(ApiResponse.success({ draft_id: result.insertId }, '草稿已创建'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 2. getDrafts — Get user's draft list (status != 0), ordered by updated_at desc.
// =============================================================================
const getDrafts = async (req, res, next) => {
  try {
    const userId = req.userId;

    const [rows] = await pool.query(
      `SELECT * FROM next_trip_drafts
       WHERE user_id = ? AND status != 0
       ORDER BY updated_at DESC`,
      [userId]
    );

    const list = rows.map(row => ({
      id: row.id,
      start_point: row.start_point ? (typeof row.start_point === 'string' ? JSON.parse(row.start_point) : row.start_point) : null,
      end_point: row.end_point ? (typeof row.end_point === 'string' ? JSON.parse(row.end_point) : row.end_point) : null,
      departure_time: row.departure_time,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));

    res.json(ApiResponse.success(list));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 3. updateDraft — Update draft fields.
// =============================================================================
const updateDraft = async (req, res, next) => {
  try {
    const userId = req.userId;
    const draftId = parseInt(req.params.id);

    if (!draftId || isNaN(draftId)) {
      return res.status(422).json(ApiResponse.fail('无效的草稿ID'));
    }

    // Verify ownership
    const [[draft]] = await pool.query(
      'SELECT * FROM next_trip_drafts WHERE id = ? AND status != 0',
      [draftId]
    );
    if (!draft) {
      return res.status(404).json(ApiResponse.fail('草稿不存在'));
    }
    if (draft.user_id !== userId) {
      return res.status(403).json(ApiResponse.fail('无权修改此草稿'));
    }

    const { start_point, end_point, departure_time } = req.body;
    const updates = [];
    const params = [];

    if (start_point !== undefined) {
      updates.push('start_point = ?');
      params.push(start_point ? JSON.stringify(start_point) : null);
    }
    if (end_point !== undefined) {
      updates.push('end_point = ?');
      params.push(end_point ? JSON.stringify(end_point) : null);
    }
    if (departure_time !== undefined) {
      const departureTime = toMysqlDatetime(departure_time);
      if (departure_time && !departureTime) {
        return res.status(422).json(ApiResponse.fail('无效的出发时间'));
      }
      updates.push('departure_time = ?');
      params.push(departureTime);
    }

    if (updates.length === 0) {
      return res.status(422).json(ApiResponse.fail('没有需要更新的字段'));
    }

    params.push(draftId);
    await pool.query(
      `UPDATE next_trip_drafts SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params
    );

    res.json(ApiResponse.success(null, '草稿已更新'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 4. deleteDraft — Soft delete draft (set status=0).
// =============================================================================
const deleteDraft = async (req, res, next) => {
  try {
    const userId = req.userId;
    const draftId = parseInt(req.params.id);

    if (!draftId || isNaN(draftId)) {
      return res.status(422).json(ApiResponse.fail('无效的草稿ID'));
    }

    // Verify ownership
    const [[draft]] = await pool.query(
      'SELECT * FROM next_trip_drafts WHERE id = ? AND status != 0',
      [draftId]
    );
    if (!draft) {
      return res.status(404).json(ApiResponse.fail('草稿不存在'));
    }
    if (draft.user_id !== userId) {
      return res.status(403).json(ApiResponse.fail('无权删除此草稿'));
    }

    // Soft delete
    await pool.query(
      'UPDATE next_trip_drafts SET status = 0, updated_at = NOW() WHERE id = ?',
      [draftId]
    );

    res.json(ApiResponse.success(null, '草稿已删除'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 5. publishDraft — Convert draft to actual trip.
// =============================================================================
const publishDraft = async (req, res, next) => {
  try {
    const userId = req.userId;
    const draftId = parseInt(req.params.id);

    if (!draftId || isNaN(draftId)) {
      return res.status(422).json(ApiResponse.fail('无效的草稿ID'));
    }

    // Verify ownership and get draft data
    const [[draft]] = await pool.query(
      'SELECT * FROM next_trip_drafts WHERE id = ? AND status = 1',
      [draftId]
    );
    if (!draft) {
      return res.status(404).json(ApiResponse.fail('草稿不存在或已发布'));
    }
    if (draft.user_id !== userId) {
      return res.status(403).json(ApiResponse.fail('无权发布此草稿'));
    }

    // Validate required fields for publishing
    if (!draft.start_point || !draft.end_point) {
      return res.status(422).json(ApiResponse.fail('草稿缺少起点或终点信息'));
    }
    if (!draft.departure_time) {
      return res.status(422).json(ApiResponse.fail('草稿缺少出发时间'));
    }

    // Check user is certified
    const [[userRow]] = await pool.query(
      'SELECT is_certified, nickname, avatar FROM users WHERE id = ?',
      [userId]
    );
    if (!userRow) {
      return res.status(404).json(ApiResponse.fail('用户不存在'));
    }
    if (userRow.is_certified !== 2) {
      return res.status(403).json(ApiResponse.fail('请先完成车主认证'));
    }

    // --- Create trip from draft data -----------------------------------------
    const startPoint = typeof draft.start_point === 'string' ? JSON.parse(draft.start_point) : draft.start_point;
    const endPoint = typeof draft.end_point === 'string' ? JSON.parse(draft.end_point) : draft.end_point;
    const title = req.body.title || `${startPoint.name || '起点'} → ${endPoint.name || '终点'}`;
    const maxCars = parseInt(req.body.max_cars) || 4;
    if (maxCars < 1 || maxCars > 20) {
      return res.status(422).json(ApiResponse.fail('最大车数应在1-20之间'));
    }

    const [tripResult] = await pool.query(
      `INSERT INTO trips
        (leader_id, title, start_point, end_point, waypoints, route_data,
         departure_time, estimated_days, daily_distance, depth, tags,
         max_cars, current_cars, max_members, current_members, is_public,
         status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, 1, NOW(), NOW())`,
      [
        userId,
        title.trim(),
        typeof draft.start_point === 'string' ? draft.start_point : JSON.stringify(draft.start_point),
        typeof draft.end_point === 'string' ? draft.end_point : JSON.stringify(draft.end_point),
        req.body.waypoints ? JSON.stringify(req.body.waypoints) : null,
        req.body.route_data ? JSON.stringify(req.body.route_data) : null,
        toMysqlDatetime(draft.departure_time),
        parseInt(req.body.estimated_days) || 1,
        parseInt(req.body.daily_distance) || null,
        parseInt(req.body.depth) || 1,
        req.body.tags ? JSON.stringify(req.body.tags) : null,
        maxCars,
        parseInt(req.body.max_members) || 20,
        req.body.is_public !== undefined ? (req.body.is_public ? 1 : 0) : 1
      ]
    );

    const tripId = tripResult.insertId;

    // Insert leader as member
    await pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role, status, joined_at, created_at)
       VALUES (?, ?, 1, 2, NOW(), NOW())`,
      [tripId, userId]
    );

    // Create chat session
    const [chatResult] = await pool.query(
      `INSERT INTO chat_sessions
        (type, name, avatar, trip_id, creator_id, member_count, is_active, created_at, updated_at)
       VALUES ('team_group', ?, ?, ?, ?, 1, 1, NOW(), NOW())`,
      [title.trim(), userRow.avatar || null, tripId, userId]
    );

    const sessionId = chatResult.insertId;

    await pool.query(
      `INSERT INTO chat_session_members (session_id, user_id, joined_at)
       VALUES (?, ?, NOW())`,
      [sessionId, userId]
    );

    // Mark draft as published
    await pool.query(
      'UPDATE next_trip_drafts SET status = 2, updated_at = NOW() WHERE id = ?',
      [draftId]
    );

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'publish_draft', 'trip', ?, ?, NOW())`,
      [userId, String(tripId), JSON.stringify({ draft_id: draftId, title: title.trim() })]
    );

    res.json(ApiResponse.success({
      trip_id: tripId,
      session_id: sessionId,
      draft_id: draftId
    }, '草稿发布成功'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================

module.exports = {
  createDraft,
  getDrafts,
  updateDraft,
  deleteDraft,
  publishDraft
};
