/**
 * 统一响应格式
 */
class ApiResponse {
  static success(data = null, message = '成功') {
    return { code: 0, message, data };
  }

  static fail(message = '失败', code = -1) {
    return { code, message, data: null };
  }

  static paginated(list, total, page, pageSize) {
    return {
      code: 0,
      message: '成功',
      data: {
        list,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    };
  }
}

/**
 * 生成随机验证码
 */
function generateCode(len = 6) {
  return Math.random().toString().slice(2, 2 + len);
}

/**
 * 生成订单号
 */
function generateOrderNo() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const random = Math.random().toString().slice(2, 8);
  return `CR${dateStr}${timeStr}${random}`;
}

/**
 * 生成核销码
 */
function generateVerifyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * 计算两点距离 (Haversine公式) 单位: km
 */
function calcDistance(lng1, lat1, lng2, lat2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 计算顺路率（简化版：基于路线起终点距离）
 */
function calcRouteMatch(routeA, routeB) {
  const startDist = calcDistance(
    routeA.start_point.lng, routeA.start_point.lat,
    routeB.start_point.lng, routeB.start_point.lat
  );
  const endDist = calcDistance(
    routeA.end_point.lng, routeA.end_point.lat,
    routeB.end_point.lng, routeB.end_point.lat
  );
  const routeLen = calcDistance(
    routeA.start_point.lng, routeA.start_point.lat,
    routeA.end_point.lng, routeA.end_point.lat
  );
  if (routeLen === 0) return 0;
  const match = Math.max(0, 1 - (startDist + endDist) / (routeLen * 2));
  return Math.round(match * 100);
}

/**
 * 高德地图 API 通用请求（使用原生 https 模块，避免 axios 在 Node.js v24 上的 TLS 兼容性问题）
 */
function amapGet(path, params) {
  const https = require('https');
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `https://restapi.amap.com${path}?${query}`;
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject).on('timeout', (req) => { req.destroy(); reject(new Error('timeout')); });
  });
}

/**
 * 获取高德地图天气
 */
async function getAmapWeather(lng, lat) {
  const config = require('../config');
  try {
    const data = await amapGet('/v3/weather/weatherInfo', {
      key: config.amap.key,
      location: `${lng},${lat}`,
      extensions: 'base'
    });
    if (data.status === '1' && data.lives?.length > 0) {
      return data.lives[0];
    }
    return null;
  } catch (err) {
    console.error('获取天气失败:', err.message);
    return null;
  }
}

/**
 * 查询附近POI
 */
async function searchNearbyPOI(lng, lat, types, radius = 5000) {
  const config = require('../config');
  const typeStr = Array.isArray(types) ? types.join('|') : types;
  try {
    const data = await amapGet('/v3/place/around', {
      key: config.amap.key,
      location: `${lng},${lat}`,
      radius: String(radius),
      types: typeStr,
      offset: '20',
      page: '1',
      extensions: 'all'
    });
    if (data.status === '1') {
      return data.pois || [];
    }
    return [];
  } catch (err) {
    console.error('搜索POI失败:', err.message);
    return [];
  }
}

/**
 * 格式化距离
 */
function formatDistance(km) {
  if (km < 1) return Math.round(km * 1000) + 'm';
  if (km < 100) return km.toFixed(1) + 'km';
  return Math.round(km) + 'km';
}

function toMysqlDatetime(value) {
  if (value === undefined || value === null || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(trimmed)) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 19).replace('T', ' ');
      }
    }
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) {
      return `${trimmed}:00`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = {
  ApiResponse,
  generateCode,
  generateOrderNo,
  generateVerifyCode,
  calcDistance,
  calcRouteMatch,
  amapGet,
  getAmapWeather,
  searchNearbyPOI,
  formatDistance,
  toMysqlDatetime
};
