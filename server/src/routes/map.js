const router = require('express').Router();
const { optionalAuth } = require('../middleware/auth');
const mapController = require('../controllers/mapController');

// ---------------------------------------------------------------------------
// GET /api/map/traffic-events — Get traffic events near a location
// ---------------------------------------------------------------------------
router.get('/traffic-events', optionalAuth, mapController.getTrafficEvents);

// ---------------------------------------------------------------------------
// GET /api/map/route-info — Get route planning info between two points
// ---------------------------------------------------------------------------
router.get('/route-info', optionalAuth, mapController.getRouteInfo);

module.exports = router;
