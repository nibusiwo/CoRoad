const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// ---------------------------------------------------------------------------
// Route modules (lazy — will error only when mounted if missing)
// ---------------------------------------------------------------------------
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const tripRoutes = require('./routes/trips');
const chatRoutes = require('./routes/messages');
const locationRoutes = require('./routes/locations');
const groupBuyRoutes = require('./routes/group-buy');
const orderRoutes = require('./routes/orders');
const merchantRoutes = require('./routes/merchants');
const couponRoutes = require('./routes/coupons');
const adminRoutes = require('./routes/admin');
const mapRoutes = require('./routes/map');
const uploadRoutes = require('./routes/upload');
const securityRoutes = require('./routes/security');
const supportRoutes = require('./routes/support');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();

// -- Trust proxy (for rate limiting behind reverse proxy) --------------------
app.set('trust proxy', 1);

// -- Security headers --------------------------------------------------------
// HSTS 只在生产环境开启,本地开发必须关闭:
// 本地后端同时监听 HTTP(3000) 与 HTTPS(3443,自签名证书,供小程序加载图片/头像)。
// 只要有一次 HTTPS 响应带上 Strict-Transport-Security,Chromium 内核客户端
// (微信开发者工具 / Chrome / Edge)就会记住 localhost 并把它"锁"成 https——
// 之后所有 http://localhost:3000 的请求会被静默升级成 https://localhost:3000,
// 而 3000 是明文 HTTP 端口,结果是 ERR_SSL_PROTOCOL_ERROR、
// 登录/地图等所有接口全部 request:fail。
// 如需在自建 HTTPS 环境强制开启,设置 ENABLE_HSTS=true;
// 生产环境(由 Nginx 终止 TLS)也可直接在 Nginx 上配置该响应头。
const enableHsts = process.env.ENABLE_HSTS
  ? process.env.ENABLE_HSTS === 'true'
  : process.env.NODE_ENV === 'production';
app.use(
  helmet({
    hsts: enableHsts ? { maxAge: 15552000, includeSubDomains: true } : false,
  }),
);

// -- CORS --------------------------------------------------------------------
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
    exposedHeaders: ['X-Total-Count'],
    credentials: true,
    maxAge: 86400,
  }),
);

// -- Logging -----------------------------------------------------------------
const logFormat =
  ':remote-addr - :remote-user [:date[iso]] ":method :url HTTP/:http-version" ' +
  ':status :res[content-length] ":referrer" ":user-agent" - :response-time ms';
app.use(morgan(logFormat));

// -- Body parsing ------------------------------------------------------------
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buffer) => { req.rawBody = buffer.toString('utf8'); }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// -- Static files (fonts / uploaded avatars / images) ------------------------
// 微信开发者工具的渲染层运行在 servicewechat.com 域下,请求本地静态资源属于跨源,
// 必须返回 CORP + CORS 响应头,否则字体/图片会被 (blocked:NotSameOrigin) 拦截。
// 参考: /static(小程序图标字体, loadFontFace 加载)、/uploads(头像/相册图片)
const crossOriginStatic = (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
};

app.use('/static', crossOriginStatic, express.static(path.resolve(__dirname, '../../client/src/static')));

app.use('/uploads', crossOriginStatic, express.static('uploads'));

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 分钟
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '请求过于频繁，请稍后再试' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '操作过于频繁，请15分钟后再试' },
});

const smsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 分钟
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '验证码发送过于频繁，请稍后再试' },
});

// -- Apply rate limiters -----------------------------------------------------
app.use('/api/', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/send-code', smsLimiter);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  console.log('[Health check] Request received');
  res.setHeader('Content-Type', 'application/json');
  res.json({ status: 'ok', timestamp: new Date().toISOString(), message: 'Server is running' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'CoRoad API Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api/*'
    }
  });
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/messages', chatRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/group-buy', groupBuyRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/support', supportRoutes);

// ---------------------------------------------------------------------------
// 404 — catch unmatched routes
// ---------------------------------------------------------------------------
app.use((_req, res, _next) => {
  res.status(404).json({ code: 404, message: '接口不存在' });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  // Log the full error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[Error]', err);
  }

  // JSON Syntax Error
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 400, message: 'JSON 格式错误' });
  }

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: 400, message: '文件大小超过限制' });
  }

  // Joi / express-validator errors (array of validation errors)
  if (err.array && typeof err.array === 'function') {
    const messages = err.array().map((e) => e.msg || e.message).join('; ');
    return res.status(422).json({ code: 422, message: messages });
  }

  // Known operational error (thrown with statusCode)
  const statusCode = err.statusCode || err.status || 500;
  const message =
    statusCode === 500 ? '服务器内部错误' : err.message || '未知错误';

  res.status(statusCode).json({
    code: statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
});

module.exports = app;
