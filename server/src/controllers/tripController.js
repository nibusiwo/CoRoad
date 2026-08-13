const pool = require('../config/db');
const config = require('../config');
const { ApiResponse, calcDistance, calcRouteMatch, toMysqlDatetime } = require('../utils/helpers');

// =============================================================================
// 1. createTrip — Create a new trip. User becomes leader (role=1).
// =============================================================================
const createTrip = async (req, res, next) => {
  try {
    const userId = req.userId;
    const {
      title, start_point, end_point, waypoints, route_data,
      departure_time, estimated_days, daily_distance, depth,
      tags, max_cars, max_members, is_public
    } = req.body;

    // --- Validation ----------------------------------------------------------
    if (!title || !title.trim()) {
      return res.status(422).json(ApiResponse.fail('请输入行程标题'));
    }
    if (title.length > 100) {
      return res.status(422).json(ApiResponse.fail('行程标题不能超过100个字符'));
    }
    if (!start_point || !start_point.name || start_point.lng == null || start_point.lat == null) {
      return res.status(422).json(ApiResponse.fail('请选择起点'));
    }
    if (!end_point || !end_point.name || end_point.lng == null || end_point.lat == null) {
      return res.status(422).json(ApiResponse.fail('请选择终点'));
    }
    const departureTime = toMysqlDatetime(departure_time);
    if (!departureTime) {
      return res.status(422).json(ApiResponse.fail('请选择出发时间'));
    }

    const maxCars = parseInt(max_cars) || 4;
    if (maxCars < 1 || maxCars > 20) {
      return res.status(422).json(ApiResponse.fail('最大车数应在1-20之间'));
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

    // --- Insert trip ---------------------------------------------------------
    const [result] = await pool.query(
      `INSERT INTO trips
        (leader_id, title, start_point, end_point, waypoints, route_data,
         departure_time, estimated_days, daily_distance, depth, tags,
         max_cars, current_cars, max_members, current_members, is_public,
         status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, 1, NOW(), NOW())`,
      [
        userId,
        title.trim(),
        JSON.stringify(start_point),
        JSON.stringify(end_point),
        waypoints ? JSON.stringify(waypoints) : null,
        route_data ? JSON.stringify(route_data) : null,
        departureTime,
        parseInt(estimated_days) || 1,
        parseInt(daily_distance) || null,
        parseInt(depth) || 1,
        tags ? JSON.stringify(tags) : null,
        maxCars,
        parseInt(max_members) || 20,
        is_public !== undefined ? (is_public ? 1 : 0) : 1
      ]
    );

    const tripId = result.insertId;

    // --- Insert leader as member (role=1, status=2) -------------------------
    await pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role, status, joined_at, created_at)
       VALUES (?, ?, 1, 2, NOW(), NOW())`,
      [tripId, userId]
    );

    // --- Create chat session for trip ---------------------------------------
    const [chatResult] = await pool.query(
      `INSERT INTO chat_sessions
        (type, name, avatar, trip_id, creator_id, member_count, is_active, created_at, updated_at)
       VALUES ('team_group', ?, ?, ?, ?, 1, 1, NOW(), NOW())`,
      [title.trim(), userRow.avatar || null, tripId, userId]
    );

    const sessionId = chatResult.insertId;

    // Add leader to chat session
    await pool.query(
      `INSERT INTO chat_session_members (session_id, user_id, joined_at)
       VALUES (?, ?, NOW())`,
      [sessionId, userId]
    );

    // --- Log operation -------------------------------------------------------
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'create_trip', 'trip', ?, ?, NOW())`,
      [userId, String(tripId), JSON.stringify({ title: title.trim(), max_cars: maxCars })]
    );

    res.json(ApiResponse.success({
      trip_id: tripId,
      session_id: sessionId
    }, '行程创建成功'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 2. getTripList — List trips with filters, paginated.
// =============================================================================
const getTripList = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const {
      status, keyword, sort, point_lng, point_lat, mine
    } = req.query;

    // Build WHERE conditions
    const conditions = ['t.status != 0'];
    const params = [];

    if (status !== undefined && status !== '') {
      const statusNum = parseInt(status);
      if (!isNaN(statusNum)) {
        conditions.push('t.status = ?');
        params.push(statusNum);
      }
    }

    if (keyword && keyword.trim()) {
      conditions.push('t.title LIKE ?');
      params.push(`%${keyword.trim()}%`);
    }
    // mine=1: 只看我发起的或我加入的行程
    if (mine === '1' && req.userId) {
      conditions.push(
        '(t.leader_id = ? OR EXISTS (SELECT 1 FROM trip_members tm WHERE tm.trip_id = t.id AND tm.user_id = ? AND tm.status IN (1, 2)))'
      );
      params.push(req.userId, req.userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Build ORDER BY
    let orderClause = 'ORDER BY t.created_at DESC';
    if (sort === 'departure_time') {
      orderClause = 'ORDER BY t.departure_time ASC';
    } else if (sort === 'departure_time_desc') {
      orderClause = 'ORDER BY t.departure_time DESC';
    }

    // Count total
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM trips t ${whereClause}`,
      params
    );

    const currentUserId = req.userId || null;
    const membershipSelect = currentUserId
      ? ', tm_self.role AS my_role, tm_self.status AS my_status'
      : ', NULL AS my_role, NULL AS my_status';
    const membershipJoin = currentUserId
      ? 'LEFT JOIN trip_members tm_self ON tm_self.trip_id = t.id AND tm_self.user_id = ?'
      : '';

    // Fetch list with leader info
    const [rows] = await pool.query(
      `SELECT t.*,
              u.nickname AS leader_nickname,
              u.avatar AS leader_avatar,
              ROUND(u.credit_score / 20, 1) AS leader_rating
              ${membershipSelect}
       FROM trips t
       JOIN users u ON u.id = t.leader_id
       ${membershipJoin}
       ${whereClause}
       ${orderClause}
       LIMIT ? OFFSET ?`,
      currentUserId ? [currentUserId, ...params, pageSize, offset] : [...params, pageSize, offset]
    );

    // Process rows: parse JSON fields, compute route_match if point provided
    const list = rows.map(row => {
      const item = {
        id: row.id,
        leader_id: row.leader_id,
        leader_nickname: row.leader_nickname,
        leader_avatar: row.leader_avatar,
        leader_rating: row.leader_rating,
        title: row.title,
        start_point: typeof row.start_point === 'string' ? JSON.parse(row.start_point) : row.start_point,
        end_point: typeof row.end_point === 'string' ? JSON.parse(row.end_point) : row.end_point,
        waypoints: row.waypoints ? (typeof row.waypoints === 'string' ? JSON.parse(row.waypoints) : row.waypoints) : null,
        departure_time: row.departure_time,
        estimated_days: row.estimated_days,
        daily_distance: row.daily_distance,
        depth: row.depth,
        tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : null,
        max_cars: row.max_cars,
        current_cars: row.current_cars,
        max_members: row.max_members,
        current_members: row.current_members,
        is_public: row.is_public,
        status: row.status,
        my_role: row.my_role,
        my_status: row.my_status,
        has_applied: row.my_status === 1,
        is_member: row.my_status === 2,
        is_captain: currentUserId != null && String(row.leader_id) === String(currentUserId),
        started_at: row.started_at,
        finished_at: row.finished_at,
        created_at: row.created_at,
        updated_at: row.updated_at
      };

      // Compute route_match if a point is provided
      if (point_lng != null && point_lat != null && item.start_point && item.end_point) {
        item.route_match = calcRouteMatch(
          { start_point: item.start_point, end_point: item.end_point },
          { start_point: { lng: parseFloat(point_lng), lat: parseFloat(point_lat) }, end_point: { lng: parseFloat(point_lng), lat: parseFloat(point_lat) } }
        );
      }

      return item;
    });

    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 3. getTripDetail — Get trip detail with full member list and leader info.
// =============================================================================
const getTripDetail = async (req, res, next) => {
  try {
    const tripId = parseInt(req.params.id);
    if (!tripId || isNaN(tripId)) {
      return res.status(422).json(ApiResponse.fail('无效的行程ID'));
    }

    // Fetch trip with leader info
    const [[trip]] = await pool.query(
      `SELECT t.*, u.nickname AS leader_nickname, u.avatar AS leader_avatar,
              ROUND(u.credit_score / 20, 1) AS leader_rating,
              u.vehicle_model AS leader_vehicle, u.plate_number AS leader_plate,
              u.level AS leader_level, u.growth_value AS leader_growth,
              u.is_certified AS leader_certified
       FROM trips t
       JOIN users u ON u.id = t.leader_id
       WHERE t.id = ? AND t.status != 0`,
      [tripId]
    );

    if (!trip) {
      return res.status(404).json(ApiResponse.fail('行程不存在或已取消'));
    }

    // Fetch members
    const [members] = await pool.query(
      `SELECT tm.id AS member_id, tm.user_id, tm.role, tm.status, tm.joined_at, tm.left_at,
              u.nickname, u.avatar, u.vehicle_model, u.plate_number, u.level, u.is_certified
       FROM trip_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.trip_id = ?
         AND tm.status IN (1, 2)
       ORDER BY tm.role ASC, tm.joined_at ASC`,
      [tripId]
    );

    // Fetch pending applicants separately
    const [pending] = await pool.query(
      `SELECT tm.id AS member_id, tm.user_id, tm.role, tm.status, tm.created_at AS applied_at,
              u.nickname, u.avatar, u.vehicle_model, u.plate_number, u.level, u.is_certified
       FROM trip_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.trip_id = ? AND tm.status = 1
       ORDER BY tm.created_at ASC`,
      [tripId]
    );

    // Check if current user is a member
    const currentUserId = req.userId || null;
    let myRole = null;
    let myStatus = null;
    if (currentUserId) {
      const [[myRow]] = await pool.query(
        'SELECT role, status FROM trip_members WHERE trip_id = ? AND user_id = ?',
        [tripId, currentUserId]
      );
      if (myRow) {
        myRole = myRow.role;
        myStatus = myRow.status;
      }
    }

    // E3: 计算顺路率(基于当前用户位置 → 行程起点 vs 行程起点 → 行程终点)
    let routeMatch = null;
    if (currentUserId) {
      try {
        const [[currentUser]] = await pool.query(
          'SELECT last_position FROM users WHERE id = ?',
          [currentUserId]
        );
        let userPos = currentUser?.last_position;
        if (typeof userPos === 'string') {
          try { userPos = JSON.parse(userPos); } catch { userPos = null; }
        }
        const startPoint = typeof trip.start_point === 'string'
          ? JSON.parse(trip.start_point) : trip.start_point;
        const endPoint = typeof trip.end_point === 'string'
          ? JSON.parse(trip.end_point) : trip.end_point;
        if (userPos && userPos.lng != null && userPos.lat != null &&
            startPoint && endPoint &&
            startPoint.lng != null && endPoint.lng != null) {
          const userRoute = {
            start_point: { lng: userPos.lng, lat: userPos.lat },
            end_point: { lng: startPoint.lng, lat: startPoint.lat }
          };
          const tripRoute = {
            start_point: { lng: startPoint.lng, lat: startPoint.lat },
            end_point: { lng: endPoint.lng, lat: endPoint.lat }
          };
          routeMatch = calcRouteMatch(userRoute, tripRoute);
        }
      } catch (matchErr) {
        console.warn('[Trip] route_match calc failed:', matchErr.message);
      }
    }

    // Build response
    const detail = {
      id: trip.id,
      leader_id: trip.leader_id,
      leader_info: {
        id: trip.leader_id,
        nickname: trip.leader_nickname,
        avatar: trip.leader_avatar,
        vehicle_model: trip.leader_vehicle,
        plate_number: trip.leader_plate ? trip.leader_plate.slice(0, 2) + '****' : null,
        level: trip.leader_level,
        growth_value: trip.leader_growth,
        is_certified: trip.leader_certified,
        rating: trip.leader_rating
      },
      title: trip.title,
      start_point: typeof trip.start_point === 'string' ? JSON.parse(trip.start_point) : trip.start_point,
      end_point: typeof trip.end_point === 'string' ? JSON.parse(trip.end_point) : trip.end_point,
      waypoints: trip.waypoints ? (typeof trip.waypoints === 'string' ? JSON.parse(trip.waypoints) : trip.waypoints) : null,
      route_data: trip.route_data ? (typeof trip.route_data === 'string' ? JSON.parse(trip.route_data) : trip.route_data) : null,
      departure_time: trip.departure_time,
      estimated_days: trip.estimated_days,
      daily_distance: trip.daily_distance,
      depth: trip.depth,
      tags: trip.tags ? (typeof trip.tags === 'string' ? JSON.parse(trip.tags) : trip.tags) : null,
      max_cars: trip.max_cars,
      current_cars: trip.current_cars,
      max_members: trip.max_members,
      current_members: trip.current_members,
      is_public: trip.is_public,
      status: trip.status,
      started_at: trip.started_at,
      finished_at: trip.finished_at,
      created_at: trip.created_at,
      updated_at: trip.updated_at,
      route_match: routeMatch,
      members: members.map(m => ({
        member_id: m.member_id,
        user_id: m.user_id,
        nickname: m.nickname,
        avatar: m.avatar,
        vehicle_model: m.vehicle_model,
        plate_number: m.plate_number ? m.plate_number.slice(0, 2) + '****' : null,
        level: m.level,
        is_certified: m.is_certified,
        role: m.role,
        status: m.status,
        joined_at: m.joined_at,
        left_at: m.left_at
      })),
      pending_applicants: pending.map(p => ({
        member_id: p.member_id,
        user_id: p.user_id,
        nickname: p.nickname,
        avatar: p.avatar,
        vehicle_model: p.vehicle_model,
        is_certified: p.is_certified,
        applied_at: p.applied_at
      })),
      my_role: myRole,
      my_status: myStatus,
      has_applied: myStatus === 1,
      is_member: myStatus === 2,
      is_captain: currentUserId != null && String(trip.leader_id) === String(currentUserId)
    };

    res.json(ApiResponse.success(detail));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 4. updateTrip — Update trip (leader only).
// =============================================================================
const updateTrip = async (req, res, next) => {
  try {
    const userId = req.userId;
    const tripId = parseInt(req.params.id);
    if (!tripId || isNaN(tripId)) {
      return res.status(422).json(ApiResponse.fail('无效的行程ID'));
    }

    // Check trip exists and user is leader
    const [[trip]] = await pool.query(
      'SELECT * FROM trips WHERE id = ? AND status != 0',
      [tripId]
    );
    if (!trip) {
      return res.status(404).json(ApiResponse.fail('行程不存在或已取消'));
    }
    if (trip.leader_id !== userId) {
      return res.status(403).json(ApiResponse.fail('只有队长可以修改行程'));
    }
    if (trip.status !== 1) {
      return res.status(400).json(ApiResponse.fail('行程已经开始或结束，无法修改'));
    }

    // Editable fields
    const editableFields = ['title', 'departure_time', 'max_cars', 'depth', 'tags', 'is_public', 'estimated_days', 'daily_distance'];
    const updates = [];
    const params = [];

    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        const val = req.body[field];
        switch (field) {
          case 'title':
            if (!val || !val.trim()) return res.status(422).json(ApiResponse.fail('标题不能为空'));
            if (val.length > 100) return res.status(422).json(ApiResponse.fail('标题不能超过100个字符'));
            updates.push('title = ?');
            params.push(val.trim());
            break;
          case 'max_cars':
            const maxCars = parseInt(val);
            if (maxCars < 1 || maxCars > 20) return res.status(422).json(ApiResponse.fail('最大车数应在1-20之间'));
            if (maxCars < trip.current_cars) return res.status(422).json(ApiResponse.fail('最大车数不能小于当前车数'));
            updates.push('max_cars = ?');
            params.push(maxCars);
            break;
          case 'depth':
            updates.push('depth = ?');
            params.push(parseInt(val) || 1);
            break;
          case 'tags':
            updates.push('tags = ?');
            params.push(val ? JSON.stringify(val) : null);
            break;
          case 'is_public':
            updates.push('is_public = ?');
            params.push(val ? 1 : 0);
            break;
          case 'estimated_days':
            updates.push('estimated_days = ?');
            params.push(parseInt(val) || 1);
            break;
          case 'daily_distance':
            updates.push('daily_distance = ?');
            params.push(parseInt(val) || null);
            break;
        case 'departure_time':
            const departureTime = toMysqlDatetime(val);
            if (!departureTime) {
              return res.status(422).json(ApiResponse.fail('无效的出发时间'));
            }
            updates.push('departure_time = ?');
            params.push(departureTime);
            break;
        }
      }
    }

    if (updates.length === 0) {
      return res.status(422).json(ApiResponse.fail('没有需要更新的字段'));
    }

    params.push(tripId);
    await pool.query(
      `UPDATE trips SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params
    );

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'update_trip', 'trip', ?, ?, NOW())`,
      [userId, String(tripId), JSON.stringify({ updated_fields: updates.map(u => u.split(' ')[0]) })]
    );

    res.json(ApiResponse.success(null, '行程已更新'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 5. cancelTrip — Cancel trip (leader only). Set status=0.
// =============================================================================
const cancelTrip = async (req, res, next) => {
  try {
    const userId = req.userId;
    const tripId = parseInt(req.params.id);
    if (!tripId || isNaN(tripId)) {
      return res.status(422).json(ApiResponse.fail('无效的行程ID'));
    }

    // Check trip exists and user is leader
    const [[trip]] = await pool.query(
      'SELECT * FROM trips WHERE id = ? AND status != 0',
      [tripId]
    );
    if (!trip) {
      return res.status(404).json(ApiResponse.fail('行程不存在或已取消'));
    }
    if (trip.leader_id !== userId) {
      return res.status(403).json(ApiResponse.fail('只有队长可以取消行程'));
    }

    // Set trip status to 0
    await pool.query('UPDATE trips SET status = 0, updated_at = NOW() WHERE id = ?', [tripId]);

    // Remove all members from chat session
    const [[chatSession]] = await pool.query(
      'SELECT id FROM chat_sessions WHERE trip_id = ? AND type = ?',
      [tripId, 'team_group']
    );
    if (chatSession) {
      await pool.query(
        'UPDATE chat_session_members SET left_at = NOW() WHERE session_id = ? AND left_at IS NULL',
        [chatSession.id]
      );
      await pool.query(
        'UPDATE chat_sessions SET is_active = 0, updated_at = NOW() WHERE id = ?',
        [chatSession.id]
      );
    }

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'cancel_trip', 'trip', ?, ?, NOW())`,
      [userId, String(tripId), JSON.stringify({ title: trip.title })]
    );

    res.json(ApiResponse.success(null, '行程已取消'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 6. startTrip — Mark trip as started (leader only). Set status=2.
// =============================================================================
const startTrip = async (req, res, next) => {
  try {
    const userId = req.userId;
    const tripId = parseInt(req.params.id);
    if (!tripId || isNaN(tripId)) {
      return res.status(422).json(ApiResponse.fail('无效的行程ID'));
    }

    // Check trip exists and user is leader
    const [[trip]] = await pool.query(
      'SELECT * FROM trips WHERE id = ? AND status != 0',
      [tripId]
    );
    if (!trip) {
      return res.status(404).json(ApiResponse.fail('行程不存在或已取消'));
    }
    if (trip.leader_id !== userId) {
      return res.status(403).json(ApiResponse.fail('只有队长可以开始行程'));
    }
    if (trip.status !== 1) {
      return res.status(400).json(ApiResponse.fail('行程状态不正确，无法开始'));
    }

    // Set status to 2 (started)
    await pool.query(
      'UPDATE trips SET status = 2, started_at = NOW(), updated_at = NOW() WHERE id = ?',
      [tripId]
    );

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'start_trip', 'trip', ?, ?, NOW())`,
      [userId, String(tripId), JSON.stringify({ title: trip.title })]
    );

    res.json(ApiResponse.success({ started_at: new Date().toISOString() }, '行程已出发'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 7. finishTrip — Mark trip as finished (leader only). Set status=3.
// =============================================================================
const finishTrip = async (req, res, next) => {
  try {
    const userId = req.userId;
    const tripId = parseInt(req.params.id);
    if (!tripId || isNaN(tripId)) {
      return res.status(422).json(ApiResponse.fail('无效的行程ID'));
    }

    // Check trip exists and user is leader
    const [[trip]] = await pool.query(
      'SELECT * FROM trips WHERE id = ? AND status != 0',
      [tripId]
    );
    if (!trip) {
      return res.status(404).json(ApiResponse.fail('行程不存在或已取消'));
    }
    if (trip.leader_id !== userId) {
      return res.status(403).json(ApiResponse.fail('只有队长可以结束行程'));
    }
    if (trip.status !== 2) {
      return res.status(400).json(ApiResponse.fail('行程尚未出发，无法结束'));
    }

    // Set status to 3 (finished)
    await pool.query(
      'UPDATE trips SET status = 3, finished_at = NOW(), updated_at = NOW() WHERE id = ?',
      [tripId]
    );

    // Get all active members
    const [members] = await pool.query(
      'SELECT user_id, role FROM trip_members WHERE trip_id = ? AND status = 2',
      [tripId]
    );

    // Award growth value to all members
    const tripCompleteGrowth = config.growth.factors.trip_complete || 200;
    const teamLeaderGrowth = config.growth.factors.team_leader || 100;

    for (const member of members) {
      let growthAward = tripCompleteGrowth;
      if (member.role === 1) {
        growthAward += teamLeaderGrowth;
      }
      await pool.query(
        'UPDATE users SET growth_value = growth_value + ?, total_teams = total_teams + 1, updated_at = NOW() WHERE id = ?',
        [growthAward, member.user_id]
      );
      // Log growth
      await pool.query(
        `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
         VALUES (?, 'growth_award', 'trip', ?, ?, NOW())`,
        [member.user_id, String(tripId), JSON.stringify({ action: 'trip_complete', growth_award: growthAward, role: member.role })]
      );
    }

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'finish_trip', 'trip', ?, ?, NOW())`,
      [userId, String(tripId), JSON.stringify({ title: trip.title, members_awarded: members.length })]
    );

    res.json(ApiResponse.success({
      finished_at: new Date().toISOString(),
      members_awarded: members.length
    }, '行程已结束'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 8. applyJoin — Apply to join a trip.
// =============================================================================
const applyJoin = async (req, res, next) => {
  try {
    const userId = req.userId;
    const tripId = parseInt(req.params.id);
    if (!tripId || isNaN(tripId)) {
      return res.status(422).json(ApiResponse.fail('无效的行程ID'));
    }

    // Check trip exists and is recruiting
    const [[trip]] = await pool.query(
      'SELECT * FROM trips WHERE id = ? AND status != 0',
      [tripId]
    );
    if (!trip) {
      return res.status(404).json(ApiResponse.fail('行程不存在或已取消'));
    }
    if (trip.status !== 1) {
      return res.status(400).json(ApiResponse.fail('行程不在招募中'));
    }

    // Check if already a member
    const [[existingMember]] = await pool.query(
      'SELECT * FROM trip_members WHERE trip_id = ? AND user_id = ?',
      [tripId, userId]
    );
    if (existingMember && existingMember.status === 1) {
      return res.json(ApiResponse.success({
        my_status: 1,
        has_applied: true,
        is_member: false
      }, 'Already applied'));
    }
    if (existingMember && existingMember.status === 2) {
      return res.json(ApiResponse.success({
        my_status: 2,
        has_applied: false,
        is_member: true
      }, 'Already joined'));
    }
    if (existingMember && (existingMember.status === 3 || existingMember.status === 4)) {
      await pool.query(
        'UPDATE trip_members SET status = 1, created_at = NOW() WHERE id = ?',
        [existingMember.id]
      );
      return res.json(ApiResponse.success({
        my_status: 1,
        has_applied: true,
        is_member: false
      }, 'Applied'));
    }
    if (existingMember) {
      if (existingMember.status === 1) {
        return res.status(400).json(ApiResponse.fail('已申请，等待队长审核'));
      }
      if (existingMember.status === 2) {
        return res.status(400).json(ApiResponse.fail('你已经是该行程的成员'));
      }
      // If previously left or removed, allow re-apply by updating
      if (existingMember.status === 3 || existingMember.status === 4) {
        await pool.query(
          'UPDATE trip_members SET status = 1, created_at = NOW() WHERE id = ?',
          [existingMember.id]
        );
        return res.json(ApiResponse.success(null, '重新申请已发送'));
      }
    }

    // Check car count
    if (trip.current_cars >= trip.max_cars) {
      return res.status(400).json(ApiResponse.fail('车队已满'));
    }

    // Insert pending member
    await pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role, status, created_at)
       VALUES (?, ?, 2, 1, NOW())`,
      [tripId, userId]
    );

    res.json(ApiResponse.success(null, '申请已发送'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 9. approveMember — Leader approves a pending member.
// =============================================================================
const approveMember = async (req, res, next) => {
  try {
    const userId = req.userId;
    const tripId = parseInt(req.params.id);
    const targetUserId = parseInt(req.params.userId);

    if (!tripId || isNaN(tripId) || !targetUserId || isNaN(targetUserId)) {
      return res.status(422).json(ApiResponse.fail('无效的参数'));
    }

    // Check trip exists and user is leader
    const [[trip]] = await pool.query(
      'SELECT * FROM trips WHERE id = ? AND status != 0',
      [tripId]
    );
    if (!trip) {
      return res.status(404).json(ApiResponse.fail('行程不存在或已取消'));
    }
    if (trip.leader_id !== userId) {
      return res.status(403).json(ApiResponse.fail('只有队长可以审批成员'));
    }
    // 文档规则:行程完成后不可再邀请/通过新成员
    if (trip.status !== 1) {
      return res.status(400).json(ApiResponse.fail(trip.status === 3 ? '行程已完成，无法再加入成员' : '行程已开始，无法再加入成员'));
    }

    // Check the target member is pending
    const [[member]] = await pool.query(
      'SELECT * FROM trip_members WHERE trip_id = ? AND user_id = ? AND status = 1',
      [tripId, targetUserId]
    );
    if (!member) {
      return res.status(404).json(ApiResponse.fail('未找到该申请'));
    }

    // Approve: set status to 2, increment counts
    await pool.query(
      'UPDATE trip_members SET status = 2, joined_at = NOW() WHERE id = ?',
      [member.id]
    );

    await pool.query(
      'UPDATE trips SET current_cars = current_cars + 1, current_members = current_members + 1, updated_at = NOW() WHERE id = ?',
      [tripId]
    );

    // Add user to trip chat session
    const [[chatSession]] = await pool.query(
      'SELECT id FROM chat_sessions WHERE trip_id = ? AND type = ?',
      [tripId, 'team_group']
    );
    if (chatSession) {
      // Check if already in session
      const [[existingCsMember]] = await pool.query(
        'SELECT id FROM chat_session_members WHERE session_id = ? AND user_id = ?',
        [chatSession.id, targetUserId]
      );
      if (existingCsMember) {
        // Rejoin
        await pool.query(
          'UPDATE chat_session_members SET left_at = NULL, joined_at = NOW() WHERE id = ?',
          [existingCsMember.id]
        );
      } else {
        await pool.query(
          `INSERT INTO chat_session_members (session_id, user_id, joined_at) VALUES (?, ?, NOW())`,
          [chatSession.id, targetUserId]
        );
      }
      // Update member count
      const [[countRow]] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM chat_session_members WHERE session_id = ? AND left_at IS NULL',
        [chatSession.id]
      );
      await pool.query(
        'UPDATE chat_sessions SET member_count = ?, updated_at = NOW() WHERE id = ?',
        [countRow.cnt, chatSession.id]
      );
    }

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'approve_member', 'trip_member', ?, ?, NOW())`,
      [userId, String(member.id), JSON.stringify({ trip_id: tripId, user_id: targetUserId })]
    );

    res.json(ApiResponse.success(null, '已批准加入'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 10. rejectMember — Leader rejects a pending member.
// =============================================================================
const rejectMember = async (req, res, next) => {
  try {
    const userId = req.userId;
    const tripId = parseInt(req.params.id);
    const targetUserId = parseInt(req.params.userId);

    if (!tripId || isNaN(tripId) || !targetUserId || isNaN(targetUserId)) {
      return res.status(422).json(ApiResponse.fail('无效的参数'));
    }

    // Check trip exists and user is leader
    const [[trip]] = await pool.query(
      'SELECT * FROM trips WHERE id = ? AND status != 0',
      [tripId]
    );
    if (!trip) {
      return res.status(404).json(ApiResponse.fail('行程不存在或已取消'));
    }
    if (trip.leader_id !== userId) {
      return res.status(403).json(ApiResponse.fail('只有队长可以拒绝申请'));
    }

    // Check the target member is pending
    const [[member]] = await pool.query(
      'SELECT * FROM trip_members WHERE trip_id = ? AND user_id = ? AND status = 1',
      [tripId, targetUserId]
    );
    if (!member) {
      return res.status(404).json(ApiResponse.fail('未找到该申请'));
    }

    // Set status to 4 (removed)
    await pool.query(
      'UPDATE trip_members SET status = 4, left_at = NOW(), left_reason = ? WHERE id = ?',
      ['rejected', member.id]
    );

    res.json(ApiResponse.success(null, '已拒绝申请'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 11. removeMember — Leader removes an active member.
// =============================================================================
const removeMember = async (req, res, next) => {
  try {
    const userId = req.userId;
    const tripId = parseInt(req.params.id);
    const targetUserId = parseInt(req.params.userId);

    if (!tripId || isNaN(tripId) || !targetUserId || isNaN(targetUserId)) {
      return res.status(422).json(ApiResponse.fail('无效的参数'));
    }

    // Check trip exists and user is leader
    const [[trip]] = await pool.query(
      'SELECT * FROM trips WHERE id = ? AND status != 0',
      [tripId]
    );
    if (!trip) {
      return res.status(404).json(ApiResponse.fail('行程不存在或已取消'));
    }
    if (trip.leader_id !== userId) {
      return res.status(403).json(ApiResponse.fail('只有队长可以移除成员'));
    }
    if (targetUserId === userId) {
      return res.status(400).json(ApiResponse.fail('队长不能移除自己'));
    }

    // Check target member exists and is active (status=2)
    const [[member]] = await pool.query(
      'SELECT * FROM trip_members WHERE trip_id = ? AND user_id = ? AND status = 2',
      [tripId, targetUserId]
    );
    if (!member) {
      return res.status(404).json(ApiResponse.fail('未找到该成员或成员已离队'));
    }

    // Set status to 4 (removed), decrement counts
    await pool.query(
      'UPDATE trip_members SET status = 4, left_at = NOW(), left_reason = ? WHERE id = ?',
      ['kicked', member.id]
    );

    await pool.query(
      'UPDATE trips SET current_cars = GREATEST(current_cars - 1, 0), current_members = GREATEST(current_members - 1, 0), updated_at = NOW() WHERE id = ?',
      [tripId]
    );

    // Remove from chat session
    const [[chatSession]] = await pool.query(
      'SELECT id FROM chat_sessions WHERE trip_id = ? AND type = ?',
      [tripId, 'team_group']
    );
    if (chatSession) {
      await pool.query(
        'UPDATE chat_session_members SET left_at = NOW() WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
        [chatSession.id, targetUserId]
      );
      const [[countRow]] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM chat_session_members WHERE session_id = ? AND left_at IS NULL',
        [chatSession.id]
      );
      await pool.query(
        'UPDATE chat_sessions SET member_count = ?, updated_at = NOW() WHERE id = ?',
        [countRow.cnt, chatSession.id]
      );
    }

    // Log operation
    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'remove_member', 'trip_member', ?, ?, NOW())`,
      [userId, String(member.id), JSON.stringify({ trip_id: tripId, user_id: targetUserId, reason: 'kicked' })]
    );

    res.json(ApiResponse.success(null, '已移除成员'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 12. leaveTrip — Member leaves trip voluntarily.
// =============================================================================
const leaveTrip = async (req, res, next) => {
  try {
    const userId = req.userId;
    const tripId = parseInt(req.params.id);
    if (!tripId || isNaN(tripId)) {
      return res.status(422).json(ApiResponse.fail('无效的行程ID'));
    }

    // Check trip exists
    const [[trip]] = await pool.query(
      'SELECT * FROM trips WHERE id = ? AND status != 0',
      [tripId]
    );
    if (!trip) {
      return res.status(404).json(ApiResponse.fail('行程不存在或已取消'));
    }

    // Leader cannot leave; they should cancel the trip
    if (trip.leader_id === userId) {
      return res.status(400).json(ApiResponse.fail('队长不能退出行程，请取消行程'));
    }

    // Check member exists and is active (status=2)
    const [[member]] = await pool.query(
      'SELECT * FROM trip_members WHERE trip_id = ? AND user_id = ? AND status = 2',
      [tripId, userId]
    );
    if (!member) {
      return res.status(404).json(ApiResponse.fail('你不在该行程中或已退出'));
    }

    // Set status to 3 (left), decrement counts
    await pool.query(
      'UPDATE trip_members SET status = 3, left_at = NOW(), left_reason = ? WHERE id = ?',
      ['leave', member.id]
    );

    await pool.query(
      'UPDATE trips SET current_cars = GREATEST(current_cars - 1, 0), current_members = GREATEST(current_members - 1, 0), updated_at = NOW() WHERE id = ?',
      [tripId]
    );

    // Remove from chat session
    const [[chatSession]] = await pool.query(
      'SELECT id FROM chat_sessions WHERE trip_id = ? AND type = ?',
      [tripId, 'team_group']
    );
    if (chatSession) {
      await pool.query(
        'UPDATE chat_session_members SET left_at = NOW() WHERE session_id = ? AND user_id = ? AND left_at IS NULL',
        [chatSession.id, userId]
      );
      const [[countRow]] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM chat_session_members WHERE session_id = ? AND left_at IS NULL',
        [chatSession.id]
      );
      await pool.query(
        'UPDATE chat_sessions SET member_count = ?, updated_at = NOW() WHERE id = ?',
        [countRow.cnt, chatSession.id]
      );
    }

    res.json(ApiResponse.success(null, '已退出行程'));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 13. getNearbyTrips — Get trips within 10km of a given lng/lat.
// =============================================================================
const getNearbyTrips = async (req, res, next) => {
  try {
    const { lng, lat } = req.query;
    const hasLocation = lng != null && lat != null && !isNaN(parseFloat(lng)) && !isNaN(parseFloat(lat));
    const centerLng = hasLocation ? parseFloat(lng) : null;
    const centerLat = hasLocation ? parseFloat(lat) : null;
    const currentUserId = req.userId || null;
    const membershipSelect = currentUserId
      ? ', tm_self.role AS my_role, tm_self.status AS my_status'
      : ', NULL AS my_role, NULL AS my_status';
    const membershipJoin = currentUserId
      ? 'LEFT JOIN trip_members tm_self ON tm_self.trip_id = t.id AND tm_self.user_id = ?'
      : '';

    // 用户当前行程(招募中/进行中),作为顺路率计算的基准路线
    let userRoute = null;
    if (currentUserId) {
      const [userTrips] = await pool.query(
        `SELECT t.start_point, t.end_point
         FROM trips t
         JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = ? AND tm.status = 2
         WHERE t.status IN (1, 2) AND t.is_public = 1
         ORDER BY t.created_at DESC
         LIMIT 1`,
        [currentUserId]
      );
      if (userTrips.length > 0) {
        const uStart = typeof userTrips[0].start_point === 'string'
          ? JSON.parse(userTrips[0].start_point) : userTrips[0].start_point;
        const uEnd = typeof userTrips[0].end_point === 'string'
          ? JSON.parse(userTrips[0].end_point) : userTrips[0].end_point;
        if (uStart && uStart.lng != null && uEnd && uEnd.lng != null) {
          userRoute = { start_point: uStart, end_point: uEnd };
        }
      }
    }

    // 未设置行程:不返回任何推荐
    if (!userRoute) {
      return res.json(ApiResponse.success([]));
    }

    // Fetch all recruiting trips
    const [trips] = await pool.query(
      `SELECT t.*, u.nickname AS leader_nickname, u.avatar AS leader_avatar,
              ROUND(u.credit_score / 20, 1) AS leader_rating
              ${membershipSelect}
       FROM trips t
       JOIN users u ON u.id = t.leader_id
       ${membershipJoin}
       WHERE t.status = 1 AND t.is_public = 1
       ORDER BY t.created_at DESC`,
      currentUserId ? [currentUserId] : []
    );

    // Filter by distance using Haversine formula (10km radius) when location provided
    const RADIUS_KM = 10;
    const nearbyList = [];

    for (const trip of trips) {
      const startPoint = typeof trip.start_point === 'string' ? JSON.parse(trip.start_point) : trip.start_point;
      if (!startPoint || startPoint.lng == null || startPoint.lat == null) continue;

      const endPoint = typeof trip.end_point === 'string' ? JSON.parse(trip.end_point) : trip.end_point;
      let dist = null;
      let match = 0;

      // 顺路率基于用户当前行程路线计算
      match = calcRouteMatch(
        { start_point: startPoint, end_point: endPoint },
        userRoute
      );

      if (hasLocation) {
        dist = calcDistance(centerLng, centerLat, startPoint.lng, startPoint.lat);
        if (dist > RADIUS_KM) continue;
      }

      nearbyList.push({
        id: trip.id,
        leader_id: trip.leader_id,
        leader_nickname: trip.leader_nickname,
        leader_avatar: trip.leader_avatar,
        leader_rating: trip.leader_rating,
        title: trip.title,
        start_point: startPoint,
        end_point: endPoint,
        departure_time: trip.departure_time,
        estimated_days: trip.estimated_days,
        depth: trip.depth,
        tags: trip.tags ? (typeof trip.tags === 'string' ? JSON.parse(trip.tags) : trip.tags) : null,
        max_cars: trip.max_cars,
        current_cars: trip.current_cars,
        current_members: trip.current_members,
        my_role: trip.my_role,
        my_status: trip.my_status,
        has_applied: trip.my_status === 1,
        is_member: trip.my_status === 2,
        is_captain: currentUserId != null && String(trip.leader_id) === String(currentUserId),
        distance_km: dist != null ? Math.round(dist * 10) / 10 : null,
        route_match: match
      });
    }

    // 按顺路率从高到低排序;顺路率相同时距离近的优先
    nearbyList.sort((a, b) => (b.route_match - a.route_match) || ((a.distance_km ?? Infinity) - (b.distance_km ?? Infinity)));

    res.json(ApiResponse.success(nearbyList));
  } catch (err) {
    next(err);
  }
};

// =============================================================================
// 14. getTripMembers — Get all members with their last known location.
// =============================================================================
const getTripMembers = async (req, res, next) => {
  try {
    const tripId = parseInt(req.params.id);
    if (!tripId || isNaN(tripId)) {
      return res.status(422).json(ApiResponse.fail('无效的行程ID'));
    }

    // Get all active members (status=2)
    const [members] = await pool.query(
      `SELECT tm.id AS member_id, tm.user_id, tm.role, tm.joined_at,
              u.nickname, u.avatar, u.vehicle_model, u.plate_number,
              u.level, u.is_certified, u.last_position
       FROM trip_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.trip_id = ? AND tm.status = 2
       ORDER BY tm.role ASC, tm.joined_at ASC`,
      [tripId]
    );

    // For each member, get their last location record as a fallback
    const memberList = await Promise.all(members.map(async (m) => {
      let lastPosition = null;
      // Try user.last_position first
      if (m.last_position) {
        lastPosition = typeof m.last_position === 'string' ? JSON.parse(m.last_position) : m.last_position;
      }
      // Fallback: query location_records
      if (!lastPosition) {
        const [[locRow]] = await pool.query(
          'SELECT lng, lat, altitude, speed, direction, created_at FROM location_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
          [m.user_id]
        );
        if (locRow) {
          lastPosition = {
            lng: locRow.lng,
            lat: locRow.lat,
            altitude: locRow.altitude,
            speed: locRow.speed,
            direction: locRow.direction,
            updateTime: locRow.created_at
          };
        }
      }

      return {
        member_id: m.member_id,
        user_id: m.user_id,
        nickname: m.nickname,
        avatar: m.avatar,
        vehicle_model: m.vehicle_model,
        plate_number: m.plate_number ? m.plate_number.slice(0, 2) + '****' : null,
        level: m.level,
        is_certified: m.is_certified,
        role: m.role,
        joined_at: m.joined_at,
        last_position: lastPosition
      };
    }));

    res.json(ApiResponse.success(memberList));
  } catch (err) {
    next(err);
  }
};

// =============================================================================

module.exports = {
  createTrip,
  getTripList,
  getTripDetail,
  updateTrip,
  cancelTrip,
  startTrip,
  finishTrip,
  applyJoin,
  approveMember,
  rejectMember,
  removeMember,
  leaveTrip,
  getNearbyTrips,
  getTripMembers
};
