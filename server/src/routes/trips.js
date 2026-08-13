const router = require('express').Router();
const { auth, optionalAuth } = require('../middleware/auth');
const tripController = require('../controllers/tripController');
const nextTripController = require('../controllers/nextTripController');

// =============================================================================
// Trip routes
// =============================================================================

// POST /api/trips — Create a new trip
router.post('/', auth, tripController.createTrip);

// GET /api/trips — List trips with filters
router.get('/', optionalAuth, tripController.getTripList);

// GET /api/trips/nearby — Get trips near a geographic point
router.get('/nearby', optionalAuth, tripController.getNearbyTrips);

// --- Next Trip Draft sub-routes (must be before /:id) -----------------------

// POST /api/trips/next — Create a trip draft
router.post('/next', auth, nextTripController.createDraft);

// GET /api/trips/next — Get user's draft list
router.get('/next', auth, nextTripController.getDrafts);

// PUT /api/trips/next/:id — Update a draft
router.put('/next/:id', auth, nextTripController.updateDraft);

// DELETE /api/trips/next/:id — Soft delete a draft
router.delete('/next/:id', auth, nextTripController.deleteDraft);

// POST /api/trips/next/:id/publish — Publish a draft as a real trip
router.post('/next/:id/publish', auth, nextTripController.publishDraft);

// --- Trip detail / member management routes (after /nearby and /next) --------

// GET /api/trips/:id — Get trip detail
router.get('/:id', auth, tripController.getTripDetail);

// PUT /api/trips/:id — Update trip
router.put('/:id', auth, tripController.updateTrip);

// DELETE /api/trips/:id — Cancel trip
router.delete('/:id', auth, tripController.cancelTrip);

// POST /api/trips/:id/start — Start trip
router.post('/:id/start', auth, tripController.startTrip);

// POST /api/trips/:id/finish — Finish trip
router.post('/:id/finish', auth, tripController.finishTrip);

// POST /api/trips/:id/join — Apply to join trip
router.post('/:id/join', auth, tripController.applyJoin);

// POST /api/trips/:id/leave — Leave trip
router.post('/:id/leave', auth, tripController.leaveTrip);

// GET /api/trips/:id/members — Get trip members with locations
router.get('/:id/members', auth, tripController.getTripMembers);

// POST /api/trips/:id/approve/:userId — Approve pending member
router.post('/:id/approve/:userId', auth, tripController.approveMember);

// POST /api/trips/:id/reject/:userId — Reject pending member
router.post('/:id/reject/:userId', auth, tripController.rejectMember);

// DELETE /api/trips/:id/members/:userId — Remove active member
router.delete('/:id/members/:userId', auth, tripController.removeMember);

module.exports = router;
