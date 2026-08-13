const router = require('express').Router();
const { auth } = require('../middleware/auth');
const orderController = require('../controllers/orderController');

// Order lifecycle.
router.post('/', auth, orderController.createOrder);
router.get('/', auth, orderController.getOrders);
router.get('/merchant', auth, orderController.getMerchantOrders);
router.get('/verification-stats', auth, orderController.getVerificationStats);
router.post('/verify', auth, orderController.verifyOrder);

// WeChat Pay V3 callback; provider signature is verified in the controller.
router.post('/payment-callback', orderController.paymentCallback);

router.get('/:id', auth, orderController.getOrderDetail);
router.post('/:id/pay', auth, orderController.payOrder);
router.post('/:id/refund', auth, orderController.refundOrder);
router.get('/:id/verify-code', auth, orderController.getVerificationCode);
router.post('/:id/split-profit', auth, orderController.splitProfit);

module.exports = router;
