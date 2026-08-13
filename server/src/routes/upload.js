const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { uploadImage, uploadFile, uploadAudio } = require('../middleware/upload');
const { upload } = require('../controllers/uploadController');

router.post('/', auth, uploadFile, upload);
router.post('/image', auth, uploadImage, upload);
router.post('/audio', auth, uploadAudio, upload);

module.exports = router;
