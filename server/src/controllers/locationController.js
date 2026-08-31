const pool = require('../config/db');
const redis = require('../config/redis');
const { ApiResponse, calcDistance, getAmapWeather, searchNearbyPOI, formatDistance } = require('../utils/helpers');
const config = require('../config');
const { fetchTrafficEvents } = require('./mapController');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map AMap weather description string to an emoji icon.
 */
function weatherToIcon(weatherDesc) {
  if (!weatherDesc) return '🌤️';
  const desc = weatherDesc;
  if (/晴/.test(desc)) return '☀️';
  if (/多云|阴有多云/.test(desc)) return '⛅';
  if (/阴/.test(desc)) return '☁️';
  if (/雷|雷阵雨/.test(desc)) return '⛈️';
  if (/大雨|暴雨/.test(desc)) return '🌧️';
  if (/雨/.test(desc)) return '🌦️';
  if (/大雪|暴雪/.test(desc)) return '❄️';
  if (/雪/.test(desc)) return '🌨️';
  if (/雾|霾/.test(desc)) return '🌫️';
  if (/沙|尘/.test(desc)) return '🌪️';
  return '🌤️';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * 脱队通知:写入站内通知并尝试 WebSocket 推送
 */
async function notifyDetach(userId, reason, tripId) {
  try {
    const isDetour = reason === 'detour';
    const title = isDetour ? '⚠️ 已偏离路线自动退队' : '⏰ 长时间未同步位置自动退队';
    const content = isDetour
      ? '你的位置已偏离队伍路线超过阈值，系统已自动将你移出车队群聊。'
      : '你已超过12小时未同步位置，系统已自动将你移出车队群聊。';
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, content, payload, read_at, created_at)
       VALUES (?, 'trip_detach', ?, ?, ?, NULL, NOW())`,
      [userId, title, content, JSON.stringify({ trip_id: tripId, reason })]
    );
    const websocket = require('../services/websocket');
    websocket.sendSystemNotification(
      [userId],
      { title, content, type: 'trip_detach', priority: 'high', data: { trip_id: tripId, reason } },
      global.wsServer
    );
  } catch (err) {
    console.warn('[Location] detach notify failed:', err.message);
  }
}

/**
 * Parse a JSON column that may already be an object.
 */
function parseJson(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

/**
 * Calculate distance from a point to a series of waypoints (route).
 * Returns the minimum distance in km.
 */
function calcDistanceToRoute(lng, lat, routeData) {
  if (!routeData || !routeData.path || !Array.isArray(routeData.path)) return null;

  let minDist = Infinity;
  for (const point of routeData.path) {
    const dist = calcDistance(lng, lat, point.lng || 0, point.lat || 0);
    if (dist < minDist) {
      minDist = dist;
    }
  }
  return minDist;
}

// ---------------------------------------------------------------------------
// 1. reportLocation — report user's current location
// ---------------------------------------------------------------------------
const reportLocation = async (req, res, next) => {
  try {
    const userId = req.userId;
    const { lng, lat, altitude, speed, direction, accuracy } = req.body;

    if (lng === undefined || lat === undefined) {
      return res.status(422).json(ApiResponse.fail('请提供经纬度坐标'));
    }

    const now = new Date();
    const nowISO = now.toISOString();

    // Insert into location_records
    await pool.query(
      `INSERT INTO location_records (user_id, lng, lat, altitude, speed, direction, accuracy, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [userId, lng, lat, altitude || null, speed || null, direction || null, accuracy || null]
    );

    // Update user's last_position in users table
    const lastPosition = JSON.stringify({
      lng,
      lat,
      altitude: altitude || null,
      speed: speed || null,
      direction: direction || null,
      updateTime: nowISO
    });
    await pool.query(
      'UPDATE users SET last_position = ?, updated_at = NOW() WHERE id = ?',
      [lastPosition, userId]
    );

    // Check if user is in an active trip (trip_members status=2, trip status=2)
    const [activeTrips] = await pool.query(
      `SELECT tm.id AS member_id, tm.trip_id, t.route_data, t.leader_id
       FROM trip_members tm
       JOIN trips t ON t.id = tm.trip_id
       WHERE tm.user_id = ? AND tm.status = 2 AND t.status = 2
         AND tm.role <> 1`,
      [userId]
    );

    let autoDetach = null;

    for (const trip of activeTrips) {
      // Check detach condition: distance from route > 50km for 30min+
      const routeData = parseJson(trip.route_data);
      if (routeData && routeData.path) {
        const distanceFromRoute = calcDistanceToRoute(lng, lat, routeData);

        if (distanceFromRoute !== null && distanceFromRoute > config.detachThreshold.maxDistance) {
          // Check if position has been off-route for 30+ minutes
          const cutoffTime = new Date(now.getTime() - config.detachThreshold.duration * 60 * 1000).toISOString();

          const [recentRecords] = await pool.query(
            `SELECT lng, lat, created_at FROM location_records
             WHERE user_id = ? AND created_at >= ?
             ORDER BY created_at DESC`,
            [userId, cutoffTime]
          );

          // Check each recent record
          let allOffRoute = recentRecords.length > 0;
          for (const rec of recentRecords) {
            const recDist = calcDistanceToRoute(rec.lng, rec.lat, routeData);
            if (recDist !== null && recDist <= config.detachThreshold.maxDistance) {
              allOffRoute = false;
              break;
            }
          }

          if (allOffRoute && recentRecords.length >= 2) {
            // Auto-detach: leave trip, remove from chat
            await pool.query(
              "UPDATE trip_members SET status = 3, left_at = NOW(), left_reason = 'detour' WHERE id = ?",
              [trip.member_id]
            );
            await pool.query(
              'UPDATE trips SET current_members = GREATEST(current_members - 1, 0), current_cars = GREATEST(current_cars - 1, 0), updated_at = NOW() WHERE id = ?',
              [trip.trip_id]
            );

            // Remove from team chat
            const [[teamSession]] = await pool.query(
              'SELECT id FROM chat_sessions WHERE trip_id = ? AND type = ?',
              [trip.trip_id, 'team_group']
            );
            if (teamSession) {
              await pool.query(
                'UPDATE chat_session_members SET left_at = NOW() WHERE session_id = ? AND user_id = ?',
                [teamSession.id, userId]
              );
              await pool.query(
                'UPDATE chat_sessions SET member_count = GREATEST(member_count - 1, 0), updated_at = NOW() WHERE id = ?',
                [teamSession.id]
              );
            }

            autoDetach = { trip_id: trip.trip_id, reason: 'detour', distance_km: Math.round(distanceFromRoute * 10) / 10 };
            await notifyDetach(userId, 'detour', trip.trip_id);
            break;
          }
        }
      }

      // Check detach condition: last update was > 12 hours ago
      if (!autoDetach) {
        const [prevRecords] = await pool.query(
          `SELECT created_at FROM location_records
           WHERE user_id = ? AND id < (SELECT MAX(id) FROM location_records WHERE user_id = ?)
           ORDER BY created_at DESC LIMIT 1`,
          [userId, userId]
        );

        if (prevRecords.length > 0) {
          const lastUpdateMs = now.getTime() - new Date(prevRecords[0].created_at).getTime();
          const silenceMinutes = config.detachThreshold.maxSilence || (12 * 60);

          if (lastUpdateMs > silenceMinutes * 60 * 1000) {
            // Auto-detach due to silence
            await pool.query(
              "UPDATE trip_members SET status = 3, left_at = NOW(), left_reason = 'timeout' WHERE id = ?",
              [trip.member_id]
            );
            await pool.query(
              'UPDATE trips SET current_members = GREATEST(current_members - 1, 0), current_cars = GREATEST(current_cars - 1, 0), updated_at = NOW() WHERE id = ?',
              [trip.trip_id]
            );

            const [[teamSession]] = await pool.query(
              'SELECT id FROM chat_sessions WHERE trip_id = ? AND type = ?',
              [trip.trip_id, 'team_group']
            );
            if (teamSession) {
              await pool.query(
                'UPDATE chat_session_members SET left_at = NOW() WHERE session_id = ? AND user_id = ?',
                [teamSession.id, userId]
              );
              await pool.query(
                'UPDATE chat_sessions SET member_count = GREATEST(member_count - 1, 0), updated_at = NOW() WHERE id = ?',
                [teamSession.id]
              );
            }

            autoDetach = { trip_id: trip.trip_id, reason: 'timeout', silence_hours: Math.round(lastUpdateMs / (60 * 60 * 1000) * 10) / 10 };
            await notifyDetach(userId, 'timeout', trip.trip_id);
          }
        }
      }
    }

    // Broadcast to team members via WebSocket
    tryBroadcast('location_update', {
      user_id: userId,
      lng,
      lat,
      altitude: altitude || null,
      speed: speed || null,
      direction: direction || null,
      time: nowISO
    });

    const response = {
      recorded_at: nowISO,
      auto_detach: autoDetach
    };

    res.json(ApiResponse.success(response, '位置已上报'));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 2. getTeamLocations — get real-time locations of team members
// ---------------------------------------------------------------------------
const getTeamLocations = async (req, res, next) => {
  try {
    const userId = req.userId;

    // Find user's active trip
    const [[memberRow]] = await pool.query(
      `SELECT tm.trip_id FROM trip_members tm
       JOIN trips t ON t.id = tm.trip_id
       WHERE tm.user_id = ? AND tm.status = 2 AND t.status = 2
       LIMIT 1`,
      [userId]
    );

    if (!memberRow) {
      return res.status(400).json(ApiResponse.fail('您当前没有活跃的行程'));
    }

    const tripId = memberRow.trip_id;

    // Get current user's position
    const [[currentUser]] = await pool.query(
      'SELECT last_position FROM users WHERE id = ?',
      [userId]
    );
    const myPosition = parseJson(currentUser?.last_position);

    // Get all active members in the trip (B2: JOIN trips 取 leader_id 用于标识队长)
    const [members] = await pool.query(
      `SELECT u.id AS user_id, u.nickname, u.avatar, u.last_position, t.leader_id
       FROM trip_members tm
       JOIN users u ON u.id = tm.user_id
       JOIN trips t ON t.id = tm.trip_id
       WHERE tm.trip_id = ? AND tm.status = 2
       ORDER BY u.id`,
      [tripId]
    );

    const memberLocations = [];
    for (const m of members) {
      const pos = parseJson(m.last_position);
      const obj = {
        user_id: m.user_id,
        nickname: m.nickname,
        avatar: m.avatar ? (m.avatar.length > 200 ? m.avatar : m.avatar) : null,
        // B2: 标识队长(用于前端 👑 marker + "设为集合点"按钮)
        is_leader: (m.user_id === m.leader_id) ? 1 : 0,
        lng: pos?.lng || null,
        lat: pos?.lat || null,
        altitude: pos?.altitude || null,
        speed: pos?.speed || null,
        direction: pos?.direction || null,
        last_update_time: pos?.updateTime || null
      };

      // Calculate distance from current user
      if (myPosition && pos && pos.lng !== undefined && pos.lat !== undefined) {
        obj.distance_from_me = Math.round(calcDistance(myPosition.lng, myPosition.lat, pos.lng, pos.lat) * 1000) / 1000;
      } else {
        obj.distance_from_me = null;
      }

      memberLocations.push(obj);
    }

    res.json(ApiResponse.success({
      trip_id: tripId,
      members: memberLocations,
      total: memberLocations.length
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 3. getNearbyTeams — get nearby teams and individual drivers
// ---------------------------------------------------------------------------
const getNearbyTeams = async (req, res, next) => {
  try {
    const userId = req.userId;
    const lng = parseFloat(req.query.lng);
    const lat = parseFloat(req.query.lat);
    const radius = parseInt(req.query.radius) || 50; // default 50km

    if (isNaN(lng) || isNaN(lat)) {
      return res.status(422).json(ApiResponse.fail('请提供经纬度坐标'));
    }

    const results = {
      teams: [],
      individual_drivers: []
    };

    // Get all active trips (status=2) with leader info
    const [activeTrips] = await pool.query(
      `SELECT t.id AS trip_id, t.leader_id, t.title, t.route_data, t.current_members, t.current_cars,
              u.nickname AS leader_nickname, u.avatar AS leader_avatar, u.last_position, u.can_be_discovered
       FROM trips t
       JOIN users u ON u.id = t.leader_id
       WHERE t.status = 2 AND t.is_public = 1`,
    );

    for (const trip of activeTrips) {
      const leaderPos = parseJson(trip.last_position);
      if (!leaderPos || leaderPos.lng === undefined || leaderPos.lat === undefined) continue;

      // Only include if leader's can_be_discovered = 1
      if (!trip.can_be_discovered) continue;

      const dist = calcDistance(lng, lat, leaderPos.lng, leaderPos.lat);
      if (dist <= radius) {
        results.teams.push({
          trip_id: trip.trip_id,
          trip_name: trip.title,
          leader_id: trip.leader_id,
          leader_nickname: trip.leader_nickname,
          leader_avatar: trip.leader_avatar,
          leader_position: {
            lng: leaderPos.lng,
            lat: leaderPos.lat,
            altitude: leaderPos.altitude || null,
            speed: leaderPos.speed || null,
            direction: leaderPos.direction || null,
            update_time: leaderPos.updateTime || null
          },
          member_count: trip.current_members || 1,
          car_count: trip.current_cars || 1,
          route_summary: trip.route_data
            ? (() => {
                const rd = parseJson(trip.route_data);
                return rd ? {
                  start_point: rd.start_point || null,
                  end_point: rd.end_point || null,
                  waypoints_count: rd.waypoints ? rd.waypoints.length : 0
                } : null;
              })()
            : null,
          distance_km: Math.round(dist * 100) / 100
        });
      }
    }

    // Sort teams by distance
    results.teams.sort((a, b) => a.distance_km - b.distance_km);

    // Get individual drivers: certified users NOT in any active trip, with recent position
    const cutoffTime = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 minutes

    const [individualDrivers] = await pool.query(
      `SELECT u.id, u.nickname, u.avatar, u.vehicle_model, u.last_position, u.growth_value, u.level
       FROM users u
       WHERE u.is_certified = 2
         AND u.can_be_discovered = 1
         AND u.status = 1
         AND u.last_position IS NOT NULL
         AND u.id != ?
         AND NOT EXISTS (
           SELECT 1 FROM trip_members tm
           JOIN trips t ON t.id = tm.trip_id
           WHERE tm.user_id = u.id AND tm.status = 2 AND t.status = 2
         )
       ORDER BY u.last_login_at DESC
       LIMIT 100`,
      [userId]
    );

    for (const driver of individualDrivers) {
      const driverPos = parseJson(driver.last_position);
      if (!driverPos || driverPos.lng === undefined || driverPos.lat === undefined) continue;

      // Check position freshness (within 30 min)
      if (driverPos.updateTime && new Date(driverPos.updateTime) < new Date(cutoffTime)) continue;

      const dist = calcDistance(lng, lat, driverPos.lng, driverPos.lat);
      if (dist <= radius) {
        results.individual_drivers.push({
          user_id: driver.id,
          nickname: driver.nickname,
          avatar: driver.avatar,
          vehicle_model: driver.vehicle_model,
          position: {
            lng: driverPos.lng,
            lat: driverPos.lat,
            altitude: driverPos.altitude || null,
            speed: driverPos.speed || null,
            direction: driverPos.direction || null,
            update_time: driverPos.updateTime || null
          },
          level: driver.level,
          distance_km: Math.round(dist * 100) / 100
        });
      }
    }

    // Sort drivers by distance
    results.individual_drivers.sort((a, b) => a.distance_km - b.distance_km);

    res.json(ApiResponse.success(results));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 4. getNearbyGroupBuys — get nearby active group buy activities
// ---------------------------------------------------------------------------
const getNearbyGroupBuys = async (req, res, next) => {
  try {
    const userId = req.userId;
    const lng = parseFloat(req.query.lng);
    const lat = parseFloat(req.query.lat);
    const radius = parseInt(req.query.radius) || 30; // default 30km

    if (isNaN(lng) || isNaN(lat)) {
      return res.status(422).json(ApiResponse.fail('请提供经纬度坐标'));
    }

    // Get active group buy activities with product and merchant info
    const [activities] = await pool.query(
      `SELECT
         gba.id, gba.product_id, gba.initiator_id, gba.trip_id,
         gba.target_count, gba.current_count, gba.status, gba.expire_at, gba.created_at,
         gbp.name AS product_name, gbp.images AS product_images,
         gbp.original_price, gbp.description AS product_description,
         gbp.price_tiers, gbp.min_count,
         m.id AS merchant_id, m.name AS merchant_name, m.type AS merchant_type,
         m.logo AS merchant_logo, m.location AS merchant_location,
         m.rating AS merchant_rating, m.level AS merchant_level
       FROM group_buy_activities gba
       JOIN group_buy_products gbp ON gbp.id = gba.product_id AND gbp.status = 1
       JOIN merchants m ON m.id = gbp.merchant_id AND m.status = 1
       WHERE gba.status = 1
         AND gba.expire_at > NOW()
       ORDER BY gba.created_at DESC
       LIMIT 200`
    );

    const nearbyResults = [];

    for (const act of activities) {
      const merchantLoc = parseJson(act.merchant_location);
      if (!merchantLoc || merchantLoc.lng === undefined || merchantLoc.lat === undefined) continue;

      const dist = calcDistance(lng, lat, merchantLoc.lng, merchantLoc.lat);
      if (dist <= radius) {
        // Parse price tiers
        let priceTiers = [];
        try {
          priceTiers = typeof act.price_tiers === 'string'
            ? JSON.parse(act.price_tiers)
            : (act.price_tiers || []);
        } catch { /* ignore */ }

        // Parse product images
        let images = [];
        try {
          images = typeof act.product_images === 'string'
            ? JSON.parse(act.product_images)
            : (act.product_images || []);
        } catch { /* ignore */ }

        // Calculate progress percentage
        const progress = act.target_count > 0
          ? Math.min(100, Math.round((act.current_count / act.target_count) * 100))
          : 0;

        // Get current tier
        let currentTier = null;
        for (const tier of priceTiers) {
          if (act.current_count >= tier.count) {
            currentTier = tier;
          }
        }

        // Get next tier
        let nextTier = null;
        for (const tier of priceTiers) {
          if (act.current_count < tier.count) {
            nextTier = tier;
            break;
          }
        }

        nearbyResults.push({
          activity_id: act.id,
          product_id: act.product_id,
          product_name: act.product_name,
          product_images: images,
          original_price: act.original_price,
          product_description: act.product_description,
          price_tiers: priceTiers,
          current_tier: currentTier,
          next_tier: nextTier,
          current_count: act.current_count,
          target_count: act.target_count,
          min_count: act.min_count,
          progress_percent: progress,
          status: act.status,
          expire_at: act.expire_at,
          created_at: act.created_at,
          merchant: {
            id: act.merchant_id,
            name: act.merchant_name,
            type: act.merchant_type,
            logo: act.merchant_logo,
            location: merchantLoc,
            rating: act.merchant_rating,
            level: act.merchant_level
          },
          distance_km: Math.round(dist * 100) / 100,
          distance_text: formatDistance(dist)
        });
      }
    }

    // Sort by distance
    nearbyResults.sort((a, b) => a.distance_km - b.distance_km);

    res.json(ApiResponse.success({
      list: nearbyResults,
      total: nearbyResults.length
    }));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 5. getMapData — aggregated map data endpoint
// ---------------------------------------------------------------------------
const getMapData = async (req, res, next) => {
  try {
    const userId = req.userId || null;
    const lng = parseFloat(req.query.lng);
    const lat = parseFloat(req.query.lat);
    const zoom = parseInt(req.query.zoom) || 12;

    if (isNaN(lng) || isNaN(lat)) {
      return res.status(422).json(ApiResponse.fail('请提供经纬度坐标'));
    }

    // Cache key: 坐标精确到小数点后2位（约1km），zoom分档缓存
    const gridLng = Math.round(lng * 100) / 100;
    const gridLat = Math.round(lat * 100) / 100;
    const zoomBucket = Math.floor(zoom / 2); // zoom 分桶: 0-1->0, 2-3->1, ...
    const cacheKey = `mapdata:${gridLng}:${gridLat}:${zoomBucket}`;
    const cacheTTL = 300; // 缓存 5 分钟

    // 尝试从 Redis 获取缓存
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        return res.json(JSON.parse(cached));
      }
    } catch (cacheErr) {
      console.warn('[Cache] Redis read failed:', cacheErr.message);
    }

    // Determine search radius based on zoom level
    let searchRadius;
    if (zoom >= 16) searchRadius = 3000;
    else if (zoom >= 14) searchRadius = 5000;
    else if (zoom >= 12) searchRadius = 10000;
    else if (zoom >= 10) searchRadius = 20000;
    else searchRadius = 50000;

    // Run multiple queries in parallel
    const weatherPromise = getAmapWeather(lng, lat).catch(() => null);

    // POI categories mapping
    const poiCategories = {
      'gas_station': '加油站',
      'charging_station': '充电站',
      'accommodation': '住宿',
      'restaurant': '餐厅',
      'repair': '维修',
      'convenience': '便利店',
      'hospital': '医院',
      'scenic': '景点',
      'camping': '露营地',
      'toilet': '厕所',
      'parking': '停车场',
      'service_area': '服务区',
      'police': '派出所'
    };

    const amapTypeCodes = {
      '加油站': '010100',
      '充电站': '010102',
      '住宿': '100000|100100',
      '餐厅': '050000',
      '维修': '030000',
      '便利店': '060200',
      '医院': '090100',
      '景点': '110000',
      '露营地': '110102',
      '厕所': '200300',
      '停车场': '150900',
      '服务区': '150401',
      '派出所': '130104'
    };

    // Launch POI searches in parallel
    const poiPromises = {};
    for (const [key, label] of Object.entries(poiCategories)) {
      const typeCode = amapTypeCodes[label];
      poiPromises[key] = typeCode
        ? searchNearbyPOI(lng, lat, typeCode, searchRadius).catch(() => [])
        : Promise.resolve([]);
    }

    // Teams and group buys promises
    const teamsPromise = (async () => {
      try {
        const [activeTrips] = await pool.query(
          `SELECT t.id AS trip_id, t.leader_id, t.title, t.current_members, t.current_cars,
                  u.nickname AS leader_nickname, u.avatar AS leader_avatar, u.last_position, u.can_be_discovered
           FROM trips t
           JOIN users u ON u.id = t.leader_id
           WHERE t.status = 2 AND t.is_public = 1 AND u.can_be_discovered = 1`
        );

        const teams = [];
        for (const trip of activeTrips) {
          const leaderPos = parseJson(trip.last_position);
          if (!leaderPos || leaderPos.lng === undefined || leaderPos.lat === undefined) continue;

          const dist = calcDistance(lng, lat, leaderPos.lng, leaderPos.lat);
          if (dist <= 50) {
            teams.push({
              trip_id: trip.trip_id,
              trip_name: trip.title,
              leader_id: trip.leader_id,
              leader_nickname: trip.leader_nickname,
              leader_avatar: trip.leader_avatar,
              leader_position: { lng: leaderPos.lng, lat: leaderPos.lat },
              member_count: trip.current_members,
              car_count: trip.current_cars,
              distance_km: Math.round(dist * 100) / 100
            });
          }
        }
        teams.sort((a, b) => a.distance_km - b.distance_km);
        return teams;
      } catch { return []; }
    })();

    const groupBuysPromise = (async () => {
      try {
        const [activities] = await pool.query(
          `SELECT gba.id, gba.current_count, gba.target_count, gba.expire_at,
                  gbp.name AS product_name, gbp.original_price, gbp.price_tiers,
                  m.name AS merchant_name, m.location AS merchant_location, m.level AS merchant_level
           FROM group_buy_activities gba
           JOIN group_buy_products gbp ON gbp.id = gba.product_id AND gbp.status = 1
           JOIN merchants m ON m.id = gbp.merchant_id AND m.status = 1
           WHERE gba.status = 1 AND gba.expire_at > NOW()`
        );

        const buys = [];
        for (const act of activities) {
          const merchantLoc = parseJson(act.merchant_location);
          if (!merchantLoc || merchantLoc.lng === undefined) continue;

          const dist = calcDistance(lng, lat, merchantLoc.lng, merchantLoc.lat);
          if (dist <= 30) {
            let priceTiers = [];
            try { priceTiers = typeof act.price_tiers === 'string' ? JSON.parse(act.price_tiers) : (act.price_tiers || []); } catch {}

            buys.push({
              activity_id: act.id,
              product_name: act.product_name,
              original_price: act.original_price,
              price_tiers: priceTiers,
              current_count: act.current_count,
              target_count: act.target_count,
              merchant_name: act.merchant_name,
              merchant_location: merchantLoc,
              merchant_level: act.merchant_level,
              expire_at: act.expire_at,
              distance_km: Math.round(dist * 100) / 100
            });
          }
        }
        buys.sort((a, b) => a.distance_km - b.distance_km);
        return buys;
      } catch { return []; }
    })();

    const topicsPromise = (async () => {
      try {
        const [topics] = await pool.query(
          `SELECT lt.id, lt.poi_id, lt.poi_name, lt.poi_location, lt.topic_name,
                  lt.online_count, lt.total_messages, lt.status
           FROM location_topics lt
           WHERE lt.status IN ('active', 'quiet')`
        );

        const nearbyTopics = [];
        for (const t of topics) {
          const loc = parseJson(t.poi_location);
          if (!loc || loc.lng === undefined) continue;

          const dist = calcDistance(lng, lat, loc.lng, loc.lat);
          if (dist <= 20) {
            nearbyTopics.push({
              id: t.id,
              poi_id: t.poi_id,
              poi_name: t.poi_name,
              poi_location: loc,
              topic_name: t.topic_name,
              // A2: 对齐前端字段名,同时保留 online_count 供其他用途
              online_count: t.online_count || 0,
              activeUsers: t.online_count || 0,
              total_messages: t.total_messages || 0,
              topicCount: 1, // 单话题,聚合时由前端或后端按 poi_id 汇总
              status: t.status,
              distance_km: Math.round(dist * 100) / 100
            });
          }
        }

        // A2: 按 poi_id 聚合话题数,使前端可显示 "💬 X个话题"
        const topicsByPoi = {};
        for (const t of nearbyTopics) {
          if (!topicsByPoi[t.poi_id]) {
            topicsByPoi[t.poi_id] = { ...t, topicCount: 1 };
          } else {
            topicsByPoi[t.poi_id].topicCount += 1;
            // 取活跃度最高的话题作为代表(在线人数最多)
            if (t.activeUsers > topicsByPoi[t.poi_id].activeUsers) {
              topicsByPoi[t.poi_id].activeUsers = t.activeUsers;
              topicsByPoi[t.poi_id].topic_name = t.topic_name;
              topicsByPoi[t.poi_id].online_count = t.online_count;
            }
          }
        }
        const aggregatedTopics = Object.values(topicsByPoi);
        aggregatedTopics.sort((a, b) => a.distance_km - b.distance_km);
        return aggregatedTopics;
      } catch { return []; }
    })();

    // A4: 路况数据通路打通 - 调用 fetchTrafficEvents 获取真实数据
    const trafficEventsPromise = fetchTrafficEvents(lng, lat, 50).catch(() => ({
      events: [],
      hint: '交通事件数据获取失败'
    }));

    // B6: 查询当前用户车辆型号(用于加油/充电焦虑判断)
    const vehicleModelPromise = (async () => {
      if (!userId) return null;
      try {
        const [[row]] = await pool.query(
          'SELECT vehicle_model FROM users WHERE id = ?',
          [userId]
        );
        return row?.vehicle_model || null;
      } catch { return null; }
    })();

    // D2: 消息提示规则分级 - 聚合查询 4 类未读消息
    const notificationsPromise = (async () => {
      if (!userId) {
        return {
          teamGroupUnread: 0,
          crossTeamMessages: [],
          friendMessages: 0,
          systemMarketing: 0,
          systemAlerts: []
        };
      }
      try {
        // 查询用户当前活跃行程(用于本队群聊 + 跨车队判断)
        const [[activeTrip]] = await pool.query(
          `SELECT tm.trip_id FROM trip_members tm
           JOIN trips t ON t.id = tm.trip_id
           WHERE tm.user_id = ? AND tm.status = 2 AND t.status = 2
           LIMIT 1`,
          [userId]
        );
        const tripId = activeTrip?.trip_id || null;

        // 本队成员 user_id 集合(用于区分好友私信 vs 跨车队私信)
        let teammateIds = [];
        if (tripId) {
          const [tmRows] = await pool.query(
            'SELECT user_id FROM trip_members WHERE trip_id = ? AND status = 2',
            [tripId]
          );
          teammateIds = tmRows.map(r => r.user_id);
        }
        const teammateIdList = teammateIds.length > 0 ? teammateIds : [0];

        // 1. 本队群聊未读数(type='team_group')
        let teamGroupUnread = 0;
        if (tripId) {
          const [[tgRow]] = await pool.query(
            `SELECT COALESCE(SUM(csm.unread_count), 0) AS unread
             FROM chat_session_members csm
             JOIN chat_sessions cs ON cs.id = csm.session_id
             WHERE csm.user_id = ? AND cs.type = 'team_group' AND cs.trip_id = ?`,
            [userId, tripId]
          );
          teamGroupUnread = tgRow?.unread || 0;
        }

        // 2. 所有 private 私信会话(含对方信息 + 最近消息预览)
        const [privateSessions] = await pool.query(
          `SELECT cs.id AS session_id, csm.unread_count,
                  cs.last_message, cs.updated_at,
                  other_user.id AS sender_id, other_user.nickname AS sender_name,
                  other_user.avatar AS sender_avatar, other_user.last_position AS sender_location
           FROM chat_session_members csm
           JOIN chat_sessions cs ON cs.id = csm.session_id
           JOIN chat_session_members other_csm ON other_csm.session_id = cs.id AND other_csm.user_id != ?
           JOIN users other_user ON other_user.id = other_csm.user_id
           WHERE csm.user_id = ? AND cs.type = 'private'`,
          [userId, userId]
        );

        // 拆分:跨车队私信(对方不在本队) vs 好友私信(对方在本队或无行程)
        const crossTeamMessages = [];
        let friendUnread = 0;
        for (const ps of privateSessions) {
          const isTeammate = teammateIds.includes(ps.sender_id);
          // 解析最近消息预览
          let preview = '';
          if (ps.last_message) {
            try {
              const lm = typeof ps.last_message === 'string' ? JSON.parse(ps.last_message) : ps.last_message;
              preview = lm?.content || lm?.text || '';
            } catch { preview = ''; }
          }
          // 解析发送者位置
          let senderLoc = null;
          if (ps.sender_location) {
            try {
              senderLoc = typeof ps.sender_location === 'string' ? JSON.parse(ps.sender_location) : ps.sender_location;
            } catch { senderLoc = null; }
          }

          if (!isTeammate && tripId) {
            // 跨车队私信
            crossTeamMessages.push({
              sessionId: ps.session_id,
              senderId: ps.sender_id,
              senderName: ps.sender_name,
              senderAvatar: ps.sender_avatar,
              senderLocation: senderLoc,
              preview: preview,
              unreadCount: ps.unread_count || 0,
              lastTime: ps.updated_at
            });
          } else {
            // 好友私信(对方是本队成员 或 用户无活跃行程)
            friendUnread += (ps.unread_count || 0);
          }
        }

        // 3. 系统营销通知未读数(type='system')
        const [[sysRow]] = await pool.query(
          `SELECT COALESCE(SUM(csm.unread_count), 0) AS unread
           FROM chat_session_members csm
           JOIN chat_sessions cs ON cs.id = csm.session_id
           WHERE csm.user_id = ? AND cs.type = 'system'`,
          [userId]
        );
        const systemMarketing = sysRow?.unread || 0;

        return {
          teamGroupUnread,
          crossTeamMessages,
          friendMessages: friendUnread,
          systemMarketing,
          systemAlerts: []  // D4 走 websocket 实时推送,此处留空
        };
      } catch (err) {
        console.warn('[getMapData] notifications aggregation failed:', err.message);
        return {
          teamGroupUnread: 0,
          crossTeamMessages: [],
          friendMessages: 0,
          systemMarketing: 0,
          systemAlerts: []
        };
      }
    })();

    // Await weather first (most critical)
    const weather = await weatherPromise;

    // Await all POIs
    const poiResults = {};
    for (const [key, label] of Object.entries(poiCategories)) {
      poiResults[key] = await poiPromises[key];
    }

    // Await the rest (B6 vehicleModel + D2 notifications 并行)
    const [teams, groupBuys, topics, trafficEventsData, vehicleModel, notifications] = await Promise.all([
      teamsPromise,
      groupBuysPromise,
      topicsPromise,
      trafficEventsPromise,
      vehicleModelPromise,
      notificationsPromise
    ]);

    // A1: POI 数据结构归一化 - 平铺数组,使用 latitude/longitude 字段
    const flatPois = [];
    const safetyPois = { police_stations: [], hospitals: [] };
    for (const [key, results] of Object.entries(poiResults)) {
      for (const poi of results) {
        // 高德 POI 接口返回的 location 是 "lng,lat" 字符串
        const locStr = poi.location || '';
        const [lngStr, latStr] = locStr.split(',');
        const poiLng = parseFloat(lngStr) || 0;
        const poiLat = parseFloat(latStr) || 0;
        if (poiLng === 0 && poiLat === 0) continue;

        const item = {
          id: poi.id,
          name: poi.name,
          type: key, // 使用 poiCategories 的 key 作为 type
          latitude: poiLat,
          longitude: poiLng,
          location: { lng: poiLng, lat: poiLat },
          address: poi.address || null,
          distance: poi.distance ? parseFloat(poi.distance) : null,
          tel: poi.tel || null,
          rating: poi.biz_ext?.rating || null,
          business_area: poi.business_area || null
        };

        flatPois.push(item);

        // 同步归类到 safety
        if (key === 'police') safetyPois.police_stations.push(item);
        if (key === 'hospital') safetyPois.hospitals.push(item);
      }
    }

    // A4: 把交通事件转换为地图 marker 友好的格式(字段: latitude/longitude)
    const trafficEventsList = (trafficEventsData.events || []).map(evt => ({
      id: evt.id,
      type: evt.type,
      type_text: evt.type_text,
      title: evt.title,
      description: evt.description,
      severity: evt.severity,
      latitude: evt.location?.lat || 0,
      longitude: evt.location?.lng || 0,
      location: evt.location,
      source: evt.source,
      affected_roads: evt.affected_roads,
      congestion_level: evt.congestion_level,
      average_speed_kmh: evt.average_speed_kmh,
      distance_km: evt.distance_km,
      start_time: evt.start_time,
      expected_end_time: evt.expected_end_time
    }));

    const trafficEvents = {
      list: trafficEventsList,
      overall_status: trafficEventsData.overall_traffic_status || 'unknown',
      roads: trafficEventsData.roads || [],
      hint: trafficEventsData.hint || '交通事件数据来自高德地图'
    };

    // B6: 加油/充电焦虑提醒 - 根据车辆类型判断最近加油/充电站距离是否超阈值
    let fuelAnxietyCheck = { shouldWarn: false, type: 'fuel', nearestDistance: null, nearestPoi: null, threshold: 50, vehicleModel: vehicleModel };
    if (userId && vehicleModel) {
      // 判断车辆类型:含 电/EV/Electric/新能源/混动 视为电动车
      const evPattern = /电|EV|Electric|新能源|混动|hybrid/i;
      const isElectric = evPattern.test(vehicleModel);
      const targetType = isElectric ? 'charging_station' : 'gas_station';
      const threshold = isElectric ? 30 : 50;  // 电动车 30km,燃油车 50km

      // 从 flatPois 找最近的目标类型站点
      let nearestPoi = null;
      let nearestDist = Infinity;
      for (const poi of flatPois) {
        if (poi.type === targetType || poi.type === (isElectric ? 'charge' : 'gas')) {
          const poiLng = poi.longitude;
          const poiLat = poi.latitude;
          if (typeof poiLng === 'number' && typeof poiLat === 'number' && poiLng !== 0 && poiLat !== 0) {
            const d = calcDistance(lng, lat, poiLng, poiLat);
            if (d < nearestDist) {
              nearestDist = d;
              nearestPoi = poi;
            }
          }
        }
      }

      const nearestDistance = nearestDist === Infinity ? null : Math.round(nearestDist * 100) / 100;
      fuelAnxietyCheck = {
        shouldWarn: nearestDistance !== null && nearestDistance > threshold,
        type: isElectric ? 'charge' : 'fuel',
        nearestDistance,
        nearestPoi: nearestPoi ? {
          id: nearestPoi.id,
          name: nearestPoi.name,
          latitude: nearestPoi.latitude,
          longitude: nearestPoi.longitude,
          address: nearestPoi.address,
          tel: nearestPoi.tel
        } : null,
        threshold,
        vehicleModel
      };
    }

    const responseData = ApiResponse.success({
      center: { lng, lat },
      zoom,
      search_radius_m: searchRadius,
      // A3: 天气数据增加 emoji 图标字段
      weather: weather ? {
        province: weather.province,
        city: weather.city,
        weather: weather.weather,
        desc: weather.weather,
        icon: weatherToIcon(weather.weather),
        temp: weather.temperature ? parseInt(weather.temperature) : null,
        temperature: weather.temperature,
        wind_direction: weather.winddirection,
        wind_power: weather.windpower,
        humidity: weather.humidity,
        report_time: weather.reporttime
      } : null,
      // A1: pois 改为平铺数组(同时保留按类型分组的 pois_by_type 便于其他场景使用)
      pois: flatPois,
      pois_by_type: poiResults,
      nearby_teams: teams,
      nearby_group_buys: groupBuys,
      // A2: 字段名改为 chatRooms,与前端一致
      chatRooms: topics,
      nearby_topics: topics, // 保留旧字段名,向后兼容
      traffic_events: trafficEvents,
      safety: safetyPois,
      // B6: 加油/充电焦虑提醒
      fuelAnxietyCheck,
      // D2: 消息提示规则分级(本队群聊未读/跨车队私信/好友私信/系统营销)
      notifications
    });

    // 缓存到 Redis（异步，失败不影响响应）
    redis.setEx(cacheKey, cacheTTL, JSON.stringify(responseData)).catch(err => {
      console.warn('[Cache] Redis write failed:', err.message);
    });

    res.json(responseData);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  reportLocation,
  getTeamLocations,
  getNearbyTeams,
  getNearbyGroupBuys,
  getMapData
};
