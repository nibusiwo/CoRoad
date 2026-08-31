const pool = require('../config/db');
const config = require('../config');
const { ApiResponse, calcDistance, amapGet } = require('../utils/helpers');
const { createTopicInternal } = require('./locationChatController');  // C2: 事件自动创建话题

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSON column that may already be an object.
 */
function parseJson(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

/**
 * Calculate a simple bounding box for a route.
 */
function calculateBoundingBox(points) {
  if (!points || points.length === 0) return null;

  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  for (const p of points) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }

  return {
    southwest: { lng: minLng, lat: minLat },
    northeast: { lng: maxLng, lat: maxLat }
  };
}

/**
 * Estimate route duration based on total distance (simplified).
 * Returns duration in minutes.
 */
function estimateDuration(distanceKm) {
  // Assume average speed of 60km/h for highway, 40km/h for mixed
  const avgSpeedKmh = 60;
  const hours = distanceKm / avgSpeedKmh;
  return Math.round(hours * 60);
}

/**
 * Estimate toll fees based on distance (simplified).
 */
function estimateToll(distanceKm) {
  // Rough estimate: 0.5 yuan/km for highway tolls
  return Math.round(distanceKm * 0.5);
}

// ---------------------------------------------------------------------------
// 1. fetchTrafficEvents — Pure function to fetch traffic events from AMap
//    Shared by getTrafficEvents (HTTP) and locationController.getMapData
// ---------------------------------------------------------------------------
const fetchTrafficEvents = async (centerLng, centerLat, searchRadiusKm = 50) => {
  const evaluationMap = {
    0: 'unknown',
    1: 'smooth',
    2: 'slow',
    3: 'congested',
    4: 'severely_congested'
  };

  // Map AMap road status code to event type
  const statusToEventType = (status, road) => {
    if (status === 3) return { type: 'jam', type_text: '拥堵' };
    if (status === 4) return { type: 'jam', type_text: '严重拥堵' };
    // 暂无事故/施工的明确字段,从 road.name/description 推断
    return { type: 'congestion', type_text: '通行缓慢' };
  };

  // Map severity from status
  const statusToSeverity = (status) => {
    if (status === 4) return 'high';
    if (status === 3) return 'medium';
    if (status === 2) return 'low';
    return 'low';
  };

  const trafficEvents = {
    center: { lng: centerLng, lat: centerLat },
    search_radius_km: searchRadiusKm,
    overall_traffic_status: 'unknown',
    events: [],
    road_status: {
      highways: [],
      main_roads: [],
      updated_at: new Date().toISOString()
    },
    hint: config.amap?.key ? '正在从高德地图获取交通数据' : '沙箱环境：未配置高德地图密钥，暂无交通事件数据',
    api_integration: {
      endpoint: 'http://restapi.amap.com/v3/traffic/status/circle',
      required_params: ['key', 'location', 'radius'],
      status: config.amap?.key ? 'configured' : 'sandbox'
    }
  };

  // Try to get real traffic data from AMap if key is configured
  if (config.amap && config.amap.key) {
    try {
      const amapData = await amapGet('/v3/traffic/status/circle', {
        key: config.amap.key,
        location: `${centerLng},${centerLat}`,
        radius: String(searchRadiusKm * 1000),
        extensions: 'all'
      });

      if (amapData && amapData.status === '1') {
        const trafficInfo = amapData.trafficinfo;

        trafficEvents.overall_traffic_status = evaluationMap[trafficInfo.evaluation?.status] || 'unknown';
        trafficEvents.evaluation = trafficInfo.evaluation;

        const roads = trafficInfo.roads || [];
        trafficEvents.roads = roads.map(road => ({
          name: road.name,
          status: evaluationMap[road.status] || 'unknown',
          direction: road.direction,
          speed: road.speed,
          lng: road.lng ? parseFloat(road.lng) : undefined,
          lat: road.lat ? parseFloat(road.lat) : undefined,
          segments: (road.segments || []).slice(0, 20)
        }));

        // Convert roads with non-smooth status to events for the map layer
        const eventList = [];
        roads.forEach((road, idx) => {
          const status = road.status;
          // Only include roads that are not smooth (status > 1)
          if (status && status > 1 && road.lng && road.lat) {
            const eventType = statusToEventType(status, road);
            const distance = road.lng && road.lat
              ? calcDistance(centerLng, centerLat, parseFloat(road.lng), parseFloat(road.lat))
              : null;
            eventList.push({
              id: `road_${idx + 1}`,
              type: eventType.type,
              type_text: eventType.type_text,
              location: {
                lng: parseFloat(road.lng),
                lat: parseFloat(road.lat)
              },
              title: `${road.name || '道路'} ${eventType.type_text}`,
              description: road.direction
                ? `${road.name} ${road.direction}方向 ${eventType.type_text}，平均车速 ${road.speed || '未知'}km/h`
                : `${road.name} ${eventType.type_text}，平均车速 ${road.speed || '未知'}km/h`,
              severity: statusToSeverity(status),
              start_time: new Date().toISOString(),
              expected_end_time: null,
              source: '高德地图',
              affected_roads: road.name ? [road.name] : [],
              congestion_level: status,
              average_speed_kmh: road.speed ? parseFloat(road.speed) : null,
              distance_km: distance !== null ? Math.round(distance * 100) / 100 : null
            });
          }
        });

        trafficEvents.events = eventList;
        trafficEvents.api_integration.status = 'configured';
        trafficEvents.hint = '交通事件数据来自高德地图';
      }
    } catch (amapErr) {
      console.error('[AMap Traffic] Failed:', amapErr.message);
      trafficEvents.api_integration.status = 'failed';
      trafficEvents.api_integration.error = amapErr.message;
    }
  }

  // C2: 事件自动创建话题 - 对 severity=high/medium 的事件创建位置话题
  try {
    const highMediumEvents = (trafficEvents.events || []).filter(
      (evt) => (evt.severity === 'high' || evt.severity === 'medium') && evt.location
    );
    if (highMediumEvents.length > 0) {
      // 构造稳定的 poi_id(坐标网格保留 3 位小数 ≈ 100m,避免同道路不同次请求 ID 不同导致重复创建)
      const eventTopics = highMediumEvents.map((evt) => {
        const gridLng = Math.round(evt.location.lng * 1000) / 1000;
        const gridLat = Math.round(evt.location.lat * 1000) / 1000;
        return {
          poi_id: 'event_' + gridLng + '_' + gridLat,
          poi_name: evt.title || '路况事件',
          poi_location: { lng: evt.location.lng, lat: evt.location.lat },
          topic_name: (evt.type_text || '路况') + '讨论',
          event_type: evt.type || 'jam'
        };
      });

      // 批量查询已存在的 topic(去重,避免话题泛滥)
      const poiIds = eventTopics.map((t) => t.poi_id);
      const placeholders = poiIds.map(() => '?').join(',');
      const [existing] = await pool.query(
        `SELECT poi_id FROM location_topics WHERE poi_id IN (${placeholders}) AND status IN ('active', 'quiet')`,
        poiIds
      );
      const existingIds = new Set(existing.map((r) => r.poi_id));

      // 对未存在的话题调用 createTopicInternal(creator_id=null 系统创建)
      for (const t of eventTopics) {
        if (existingIds.has(t.poi_id)) continue;
        try {
          await createTopicInternal({
            poi_id: t.poi_id,
            poi_name: t.poi_name,
            poi_location: t.poi_location,
            topic_name: t.topic_name,
            creator_id: null,
            create_type: 'event',
            event_type: t.event_type
          });
        } catch (createErr) {
          // 单个创建失败不影响整体(可能是并发已创建)
          console.warn('[C2] event topic create failed:', createErr.message);
        }
      }
    }
  } catch (c2Err) {
    console.warn('[C2] event auto topic failed:', c2Err.message);
  }

  return trafficEvents;
};

// ---------------------------------------------------------------------------
// 2. getTrafficEvents — Get traffic events near a location (HTTP endpoint)
// ---------------------------------------------------------------------------
const getTrafficEvents = async (req, res, next) => {
  try {
    const { lng, lat, radius: radiusStr } = req.query;

    if (lng == null || lat == null) {
      return res.status(422).json(ApiResponse.fail('请提供经纬度坐标'));
    }

    const centerLng = parseFloat(lng);
    const centerLat = parseFloat(lat);
    const searchRadius = parseInt(radiusStr) || 50;

    const trafficEvents = await fetchTrafficEvents(centerLng, centerLat, searchRadius);
    res.json(ApiResponse.success(trafficEvents));
  } catch (err) {
    next(err);
  }
};

// ---------------------------------------------------------------------------
// 3. getRouteInfo — Get route planning info between two points
// ---------------------------------------------------------------------------
const getRouteInfo = async (req, res, next) => {
  try {
    const origin_lng = req.query.origin_lng ?? req.query.originLng;
    const origin_lat = req.query.origin_lat ?? req.query.originLat;
    const origin_name = req.query.origin_name ?? req.query.originName;
    const dest_lng = req.query.dest_lng ?? req.query.destLng;
    const dest_lat = req.query.dest_lat ?? req.query.destLat;
    const dest_name = req.query.dest_name ?? req.query.destName;
    const { waypoints, strategy } = req.query;

    // --- Validation ---
    if (origin_lng == null || origin_lat == null) {
      return res.status(422).json(ApiResponse.fail('请提供起点坐标'));
    }
    if (dest_lng == null || dest_lat == null) {
      return res.status(422).json(ApiResponse.fail('请提供终点坐标'));
    }

    const origin = {
      lng: parseFloat(origin_lng),
      lat: parseFloat(origin_lat),
      name: origin_name || '起点'
    };
    const destination = {
      lng: parseFloat(dest_lng),
      lat: parseFloat(dest_lat),
      name: dest_name || '终点'
    };

    // Parse waypoints if provided
    let waypointList = [];
    if (waypoints) {
      try {
        waypointList = typeof waypoints === 'string' ? JSON.parse(waypoints) : waypoints;
      } catch { /* ignore */ }
    }

    // --- Calculate basic route info using helpers ---
    const directDistance = calcDistance(origin.lng, origin.lat, destination.lng, destination.lat);

    // Build all points including waypoints
    const allPoints = [origin, ...waypointList, destination];
    let totalDistance = 0;
    for (let i = 0; i < allPoints.length - 1; i++) {
      totalDistance += calcDistance(
        allPoints[i].lng, allPoints[i].lat,
        allPoints[i + 1].lng, allPoints[i + 1].lat
      );
    }

    // Add 30% to account for road curvature (simplified)
    const roadDistance = Math.round(totalDistance * 1.3 * 10) / 10;
    const estimatedDurationMin = estimateDuration(roadDistance);
    const estimatedTollFee = estimateToll(roadDistance);
    const boundingBox = calculateBoundingBox(allPoints);

    // --- Build V1 MVP response ---
    const routeInfo = {
      origin: {
        name: origin.name,
        lng: origin.lng,
        lat: origin.lat
      },
      destination: {
        name: destination.name,
        lng: destination.lng,
        lat: destination.lat
      },
      waypoints: waypointList.map((wp, i) => ({
        index: i + 1,
        name: wp.name || `途经点${i + 1}`,
        lng: wp.lng,
        lat: wp.lat
      })),
      summary: {
        direct_distance_km: Math.round(directDistance * 10) / 10,
        road_distance_km: roadDistance,
        estimated_duration_min: estimatedDurationMin,
        estimated_duration_text: estimatedDurationMin >= 60
          ? `${Math.floor(estimatedDurationMin / 60)}小时${estimatedDurationMin % 60}分钟`
          : `${estimatedDurationMin}分钟`,
        estimated_toll_yuan: estimatedTollFee
      },
      strategy: strategy || '0', // 0: fastest, 1: shortest, 2: avoid highway
      bounding_box: boundingBox,
      path: allPoints.map((point) => ({ name: point.name || '', lng: point.lng, lat: point.lat })),
      segments: [],
      hint: '路线规划功能将在后续版本中对接高德地图路线规划API',
      api_integration: {
        endpoint: 'http://restapi.amap.com/v3/direction/driving',
        required_params: ['key', 'origin', 'destination'],
        status: 'not_configured'
      }
    };

    // Build route segments (simplified)
    for (let i = 0; i < allPoints.length - 1; i++) {
      const segDistance = calcDistance(
        allPoints[i].lng, allPoints[i].lat,
        allPoints[i + 1].lng, allPoints[i + 1].lat
      );
      const segRoadDistance = Math.round(segDistance * 1.3 * 10) / 10;
      const segDuration = estimateDuration(segRoadDistance);

      routeInfo.segments.push({
        index: i,
        from: {
          name: allPoints[i].name || `点${i + 1}`,
          lng: allPoints[i].lng,
          lat: allPoints[i].lat
        },
        to: {
          name: allPoints[i + 1].name || `点${i + 2}`,
          lng: allPoints[i + 1].lng,
          lat: allPoints[i + 1].lat
        },
        distance_km: segRoadDistance,
        duration_min: segDuration,
        toll_yuan: estimateToll(segRoadDistance)
      });
    }

    // --- Try to get real route data from AMap if key is configured ---
    if (config.amap && config.amap.key) {
      try {
        // Build AMap origin/destination strings (lng,lat format)
        const originStr = `${origin.lng},${origin.lat}`;
        const destStr = `${destination.lng},${destination.lat}`;

        // Build waypoints string for AMap
        let waypointsStr = '';
        if (waypointList.length > 0) {
          waypointsStr = waypointList.map(wp => `${wp.lng},${wp.lat}`).join(';');
        }

        const amapParams = {
          key: config.amap.key,
          origin: originStr,
          destination: destStr,
          strategy: strategy || '0',
          extensions: 'all',
          ...(waypointsStr ? { waypoints: waypointsStr } : {})
        };

        const amapData = await amapGet('/v3/direction/driving', amapParams);

        if (amapData && amapData.status === '1' && amapData.route) {
          const amapRoute = amapData.route;
          const amapPath = amapRoute.paths?.[0];

          if (amapPath) {
            // Parse distance (meters -> km) and duration (seconds -> min)
            routeInfo.summary.road_distance_km = Math.round((parseInt(amapPath.distance) / 1000) * 10) / 10;
            routeInfo.summary.estimated_duration_min = Math.round(parseInt(amapPath.duration) / 60);
            routeInfo.summary.estimated_duration_text = routeInfo.summary.estimated_duration_min >= 60
              ? `${Math.floor(routeInfo.summary.estimated_duration_min / 60)}小时${routeInfo.summary.estimated_duration_min % 60}分钟`
              : `${routeInfo.summary.estimated_duration_min}分钟`;
            routeInfo.summary.estimated_toll_yuan = parseInt(amapPath.tolls) || 0;
            routeInfo.summary.traffic_lights = parseInt(amapPath.traffic_lights) || 0;

            // Parse step segments
            const steps = amapPath.steps || [];
            routeInfo.segments = steps.map((step, idx) => ({
              index: idx,
              instruction: step.instruction,
              orientation: step.orientation,
              road_name: step.road,
              distance_km: Math.round((parseInt(step.distance) / 1000) * 10) / 10,
              duration_min: Math.round(parseInt(step.duration) / 60),
              toll_distance_km: step.toll_distance ? Math.round((parseInt(step.toll_distance) / 1000) * 10) / 10 : 0,
              tolls: parseInt(step.tolls) || 0,
              cities: step.cities || [],
              action: step.action,
              polyline: step.polyline
            }));

            // 对外统一返回真实道路点，避免消费者误用仅含起终点的简化 path。
            const roadPath = [];
            for (const segment of routeInfo.segments) {
              if (!segment.polyline || typeof segment.polyline !== 'string') continue;
              for (const pair of segment.polyline.split(';')) {
                const [lng, lat] = pair.split(',').map(Number);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
                const previous = roadPath[roadPath.length - 1];
                if (!previous || previous.lng !== lng || previous.lat !== lat) {
                  roadPath.push({ lng, lat });
                }
              }
            }
            if (roadPath.length > 1) {
              routeInfo.path = roadPath;
            }

            // Parse restricted detail
            if (amapRoute.restricted) {
              routeInfo.summary.has_restriction = true;
              routeInfo.summary.restriction_detail = amapRoute.restricted;
            }

            routeInfo.api_integration.status = 'configured';
            routeInfo.hint = '路线规划数据来自高德地图';
          } else {
            routeInfo.api_integration.status = 'failed';
            routeInfo.api_integration.amap_info = amapData.info || '';
            routeInfo.api_integration.amap_infocode = amapData.infocode || '';
            routeInfo.hint = '路线规划失败：' + (amapData.info || '高德接口返回异常，请检查 Web服务 Key 配置');
          }
        } else if (amapData) {
          routeInfo.api_integration.status = 'failed';
          routeInfo.api_integration.amap_info = amapData.info || '';
          routeInfo.api_integration.amap_infocode = amapData.infocode || '';
          routeInfo.hint = '路线规划失败：' + (amapData.info || '高德接口返回异常，请检查 Web服务 Key 配置');
        }
      } catch (amapErr) {
        console.error('[AMap Route] Failed:', amapErr.message);
        routeInfo.api_integration.status = 'failed';
        routeInfo.api_integration.error = amapErr.message;
      }
    }

    res.json(ApiResponse.success(routeInfo));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  fetchTrafficEvents,
  getTrafficEvents,
  getRouteInfo
};
