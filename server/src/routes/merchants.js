const router = require('express').Router();
const { auth, optionalAuth } = require('../middleware/auth');
const merchantController = require('../controllers/merchantController');

// ---------------------------------------------------------------------------
// POST /api/merchants/apply — Submit merchant application (auth)
// ---------------------------------------------------------------------------
router.post('/apply', auth, merchantController.apply);

// ---------------------------------------------------------------------------
// GET /api/merchants/my — Get current user's merchant (auth)
// ---------------------------------------------------------------------------
router.get('/my', auth, merchantController.getMyMerchant);

// ---------------------------------------------------------------------------
// PUT /api/merchants/my — Update current user's merchant (auth)
// ---------------------------------------------------------------------------
router.put('/my', auth, merchantController.updateMerchant);

// ---------------------------------------------------------------------------
// GET /api/merchants/products — Get merchant's own products (auth)
// ---------------------------------------------------------------------------
router.get('/products', auth, merchantController.getProducts);

// ---------------------------------------------------------------------------
// POST /api/merchants/products — Create a group buy product (auth)
// ---------------------------------------------------------------------------
router.post('/products', auth, merchantController.createProduct);

// ---------------------------------------------------------------------------
// PUT /api/merchants/products/:id — Update a product (auth)
// ---------------------------------------------------------------------------
router.put('/products/:id', auth, merchantController.updateProduct);

// ---------------------------------------------------------------------------
// PUT /api/merchants/products/:id/toggle — Toggle product status (auth)
// ---------------------------------------------------------------------------
router.put('/products/:id/toggle', auth, merchantController.toggleProduct);

// ---------------------------------------------------------------------------
// GET /api/merchants/orders — Get merchant orders (auth)
// ---------------------------------------------------------------------------
router.get('/orders', auth, merchantController.getMerchantOrders);

// ---------------------------------------------------------------------------
// GET /api/merchants/settlements — Get settlement records (auth)
// ---------------------------------------------------------------------------
router.get('/settlements', auth, merchantController.getSettlementRecords);

// ---------------------------------------------------------------------------
// GET /api/merchants/level — Get merchant level info (auth)
// ---------------------------------------------------------------------------
router.get('/level', auth, merchantController.getLevelInfo);

// ---------------------------------------------------------------------------
// PUT /api/merchants/settings/invite-coupon — Toggle invite coupon (auth)
// ---------------------------------------------------------------------------
router.put('/settings/invite-coupon', auth, merchantController.toggleInviteCoupon);

// ---------------------------------------------------------------------------
// PUT /api/merchants/settings/reward-pool — Toggle reward pool (auth)
// ---------------------------------------------------------------------------
router.put('/settings/reward-pool', auth, merchantController.toggleRewardPool);

// ---------------------------------------------------------------------------
// GET /api/merchants/promotion-code — Get promotion code (auth)
// ---------------------------------------------------------------------------
router.get('/promotion-code', auth, merchantController.getPromotionCode);

// ---------------------------------------------------------------------------
// GET /api/merchants/repair-services — Get nearby repair services
// ---------------------------------------------------------------------------
router.get('/repair-services', merchantController.getRepairServices);

// ---------------------------------------------------------------------------
// GET /api/merchants/:id — Get merchant public detail (optionalAuth)
// NOTE: This route MUST be placed AFTER all the named routes above to avoid
//       /:id from catching /products, /orders, /my, etc.
// ---------------------------------------------------------------------------
router.get('/:id', optionalAuth, merchantController.getMerchantDetail);

module.exports = router;
