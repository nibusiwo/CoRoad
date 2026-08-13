/**
 * 文件上传中间件
 *
 * 基于 multer 实现图片/视频/通用文件上传，包含类型过滤和大小限制。
 * 上传的文件存储在 uploads/ 目录，并返回可访问的文件 URL。
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'uploads');

// Allowed MIME types
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const VIDEO_MIMES = ['video/mp4', 'video/quicktime'];
const AUDIO_MIMES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
  'audio/x-m4a', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/ogg', 'audio/webm'
];
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.mov'];
const ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.amr', '.ogg', '.webm'];

// Size limits (bytes)
const IMAGE_MAX_SIZE = 10 * 1024 * 1024;   // 10 MB
const VIDEO_MAX_SIZE = 50 * 1024 * 1024;   // 50 MB
const DEFAULT_MAX_SIZE = 20 * 1024 * 1024;  // 20 MB for generic uploads

// ---------------------------------------------------------------------------
// Ensure upload directory exists
// ---------------------------------------------------------------------------
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Storage configuration
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// ---------------------------------------------------------------------------
// File filter helpers
// ---------------------------------------------------------------------------

/**
 * Filter function for image uploads.
 */
function imageFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_IMAGE_EXTENSIONS.includes(ext) && IMAGE_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('仅支持上传 JPG、PNG、GIF、WebP 格式的图片'), false);
  }
}

/**
 * Filter function for video uploads.
 */
function videoFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_VIDEO_EXTENSIONS.includes(ext) && VIDEO_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('仅支持上传 MP4、MOV 格式的视频'), false);
  }
}

/**
 * Filter function for audio uploads (语音对讲/语音消息).
 */
function audioFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_AUDIO_EXTENSIONS.includes(ext) && AUDIO_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('仅支持上传 MP3、WAV、M4A、AAC、AMR、OGG 格式的音频'), false);
  }
}

/**
 * Filter function for mixed image/video uploads.
 */
function mediaFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const isImage = ALLOWED_IMAGE_EXTENSIONS.includes(ext) && IMAGE_MIMES.includes(file.mimetype);
  const isVideo = ALLOWED_VIDEO_EXTENSIONS.includes(ext) && VIDEO_MIMES.includes(file.mimetype);

  if (isImage || isVideo) {
    cb(null, true);
  } else {
    cb(new Error('仅支持上传 JPG、PNG、GIF、WebP 图片或 MP4、MOV 视频'), false);
  }
}

/**
 * Generic file filter — allow images, videos, and common document types.
 */
function genericFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = [
    ...ALLOWED_IMAGE_EXTENSIONS,
    ...ALLOWED_VIDEO_EXTENSIONS,
    ...ALLOWED_AUDIO_EXTENSIONS,
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  ];
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件格式'));
  }
}

// ---------------------------------------------------------------------------
// Multer instances
// ---------------------------------------------------------------------------

/**
 * Single image upload middleware.
 * Accepts a single file with field name 'file'.
 * Max size: 10 MB.
 */
const uploadImage = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: IMAGE_MAX_SIZE, files: 1 },
}).single('file');

/**
 * Multiple images upload middleware.
 * Accepts up to 9 files with field name 'files'.
 * Max size: 10 MB per file.
 */
const uploadImages = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: IMAGE_MAX_SIZE, files: 9 },
}).array('files', 9);

/**
 * Universal file upload middleware.
 * Accepts a single file with field name 'file'.
 * Max size: 20 MB.
 */
const uploadFile = multer({
  storage,
  fileFilter: genericFilter,
  limits: { fileSize: DEFAULT_MAX_SIZE, files: 1 },
}).single('file');

/**
 * Single audio upload middleware (语音消息/对讲).
 * Accepts a single file with field name 'file'.
 * Max size: 10 MB.
 */
const uploadAudio = multer({
  storage,
  fileFilter: audioFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
}).single('file');

// ---------------------------------------------------------------------------
// Route: serve uploaded files
// ---------------------------------------------------------------------------

/**
 * Express router middleware to serve uploaded files.
 * Usage: app.use('/uploads', uploadRouter)
 * Already configured in app.js: app.use('/uploads', express.static('uploads'));
 * So this is redundant but provided as an additional route handler if needed.
 */
function serveUploads(req, res, next) {
  const filePath = path.join(UPLOAD_DIR, path.basename(req.path));
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    next();
  }
}

// ---------------------------------------------------------------------------
// Helper: build file URL after upload
// ---------------------------------------------------------------------------

/**
 * Build the public URL for an uploaded file.
 * @param {string} filename - The stored filename
 * @param {string} [baseUrl] - Base URL override (defaults to '/uploads')
 * @returns {string} Public URL path
 */
function getFileUrl(filename, baseUrl) {
  const base = baseUrl || '/uploads';
  return `${base}/${filename}`;
}

/**
 * Build file response objects from multer file array.
 * @param {Array<Express.Multer.File>} files - File array from multer
 * @returns {Array<{url: string, originalName: string, size: number, mimetype: string}>}
 */
function getFileUrls(files) {
  if (!files || files.length === 0) return [];
  return files.map((file) => ({
    url: getFileUrl(file.filename),
    originalName: file.originalname,
    size: file.size,
    mimetype: file.mimetype,
    filename: file.filename,
  }));
}

module.exports = {
  uploadImage,
  uploadImages,
  uploadFile,
  uploadAudio,
  serveUploads,
  getFileUrl,
  getFileUrls,
};
