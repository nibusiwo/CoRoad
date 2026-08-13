const router = require('express').Router();
const { auth } = require('../middleware/auth');
const couponController = require('../controllers/couponController');

// User coupon wallet.
router.get('/my', auth, couponController.getMyCoupons);
router.get('/available', auth, couponController.getAvailableCoupons);
router.post('/use', auth, couponController.useCoupon);
router.post('/return', auth, couponController.returnCoupon);

// Coupon issuing and template management.
router.post('/issue', auth, couponController.issueCoupon);
router.post('/invite-reward', auth, couponController.issueInviteCoupon);
router.get('/templates', auth, couponController.getTemplates);
router.post('/templates', auth, couponController.createTemplate);
router.put('/templates/:id', auth, couponController.updateTemplate);

module.exports = router;
