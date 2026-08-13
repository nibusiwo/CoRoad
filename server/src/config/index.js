const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  env: process.env.NODE_ENV || 'development',
  integrationMode: process.env.INTEGRATION_MODE || 'sandbox',
  port: parseInt(process.env.PORT, 10) || 3000,

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'coroad',
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    timezone: '+08:00'
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'coroad_jwt_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  tim: {
    appId: process.env.TIM_APP_ID,
    secretKey: process.env.TIM_SECRET_KEY,
    adminId: process.env.TIM_ADMIN_ID || 'admin'
  },

  amap: {
    key: process.env.AMAP_KEY,
    secret: process.env.AMAP_SECRET
  },

  wxpay: {
    appId: process.env.WX_APP_ID,
    appSecret: process.env.WX_APP_SECRET,
    mchId: process.env.WX_MCH_ID,
    apiV3Key: process.env.WX_API_V3_KEY,
    privateKeyPath: process.env.WX_PRIVATE_KEY_PATH,
    certSerialNo: process.env.WX_CERT_SERIAL_NO,
    notifyUrl: process.env.WX_NOTIFY_URL
  },

  oss: {
    endpoint: process.env.OSS_ENDPOINT,
    bucket: process.env.OSS_BUCKET,
    accessKey: process.env.OSS_ACCESS_KEY,
    accessSecret: process.env.OSS_ACCESS_SECRET
  },

  sms: {
    accessKey: process.env.SMS_ACCESS_KEY,
    accessSecret: process.env.SMS_ACCESS_SECRET,
    signName: process.env.SMS_SIGN_NAME,
    templateCode: process.env.SMS_TEMPLATE_CODE
  },

  commissionRates: {
    1: 0.10,
    2: 0.08,
    3: 0.06,
    4: 0.05,
    5: 0.03
  },

  growth: {
    factors: {
      drive_distance: 1,
      trip_complete: 200,
      team_leader: 100,
      invite_user: 150,
      daily_checkin: 5,
      review_merchant: 20,
      group_buy_count: 50
    },
    levels: [
      { level: 0, name: '路人', min: 0 },
      { level: 1, name: '新手司机', min: 100 },
      { level: 2, name: '老司机', min: 500 },
      { level: 3, name: '车队领航', min: 2000 },
      { level: 4, name: '同路达人', min: 5000 },
      { level: 5, name: '自驾先锋', min: 10000 },
      { level: 6, name: '传奇旅人', min: 30000 }
    ]
  },

  inviteRewards: [
    { count: 1, couponValue: 20, description: '邀请 1 人，得 20 元券' },
    { count: 3, couponValue: 50, description: '邀请 3 人，得 50 元券' },
    { count: 5, couponValue: 100, description: '邀请 5 人，得 100 元券' },
    { count: 10, couponValue: 200, description: '邀请 10 人，得 200 元券' }
  ],

  detachThreshold: {
    maxDistance: 50,
    maxSilence: 12 * 60,
    duration: 30
  },

  groupBuyExpiry: 24,
  newUserDays: 7,
  chatRoomArchiveHours: 24
};
