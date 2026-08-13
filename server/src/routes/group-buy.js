const router = require('express').Router();
const { auth } = require('../middleware/auth');
const groupBuyController = require('../controllers/groupBuyController');

// Product discovery.
router.get('/products', groupBuyController.getProducts);
router.get('/products/:id', groupBuyController.getProductDetail);

// Activity lifecycle.
router.post('/activities', auth, groupBuyController.createActivity);
router.get('/activities/my', auth, groupBuyController.getUserActivities);
router.get('/activities/:id', auth, groupBuyController.getActivityDetail);
router.post('/activities/:id/join', auth, groupBuyController.joinActivity);
router.get('/activities/:id/share', auth, groupBuyController.shareActivity);

module.exports = router;
