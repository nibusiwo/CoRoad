const router = require('express').Router();
const { auth, optionalAuth } = require('../middleware/auth');
const locationController = require('../controllers/locationController');

// ---------------------------------------------------------------------------
// Location routes
// ---------------------------------------------------------------------------

/**
 * POST /api/locations/report
 * 上报用户位置
 */
router.post('/report', auth, locationController.reportLocation);

/**
 * GET /api/locations/team
 * 获取车队成员实时位置
 */
router.get('/team', auth, locationController.getTeamLocations);

/**
 * GET /api/locations/nearby-teams
 * 获取附近的车队和独立司机
 */
router.get('/nearby-teams', auth, locationController.getNearbyTeams);

/**
 * GET /api/locations/map-data
 * 聚合地图数据（天气/POI/车队/拼团/话题/安全）
 */
router.get('/map-data', optionalAuth, locationController.getMapData);

module.exports = router;
