const router = require('express').Router();
const { auth } = require('../middleware/auth');
const controller = require('../controllers/supportController');

router.get('/notifications', auth, controller.listNotifications);
router.post('/notifications/:id/read', auth, controller.markNotificationRead);
router.get('/tickets', auth, controller.listTickets);
router.post('/tickets', auth, controller.createTicket);

module.exports = router;
