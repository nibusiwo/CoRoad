const router = require('express').Router();
const { auth } = require('../middleware/auth');
const controller = require('../controllers/securityController');

router.get('/contacts', auth, controller.listContacts);
router.post('/contacts', auth, controller.saveContact);
router.delete('/contacts/:id', auth, controller.deleteContact);
router.post('/sos', auth, controller.createSos);
router.post('/sos/:id/resolve', auth, controller.resolveSos);

module.exports = router;
