const pool = require('../config/db');
const redis = require('../config/redis');
const config = require('../config');
const { ApiResponse } = require('../utils/helpers');

async function probe(name, fn) {
  const started = Date.now();
  try {
    await fn();
    return { name, status: 'healthy', latency_ms: Date.now() - started };
  } catch (error) {
    return { name, status: 'degraded', latency_ms: Date.now() - started, message: error.message };
  }
}

async function getHealth(req, res) {
  const checks = await Promise.all([
    probe('api', async () => undefined),
    probe('mysql', async () => { await pool.query('SELECT 1'); }),
    probe('redis', async () => {
      if (!redis.isOpen) throw new Error('redis connection is closed');
      await redis.ping();
    }),
    probe('payment_callback', async () => {
      if (config.env === 'production' && !config.wxpay.notifyUrl) throw new Error('notify url missing');
    }),
    probe('map', async () => {
      if (config.env === 'production' && !config.amap.key) throw new Error('AMap key missing');
    }),
    probe('sms', async () => {
      if (config.env === 'production' && !config.sms.accessKey) throw new Error('SMS credentials missing');
    }),
    probe('faceid', async () => {
      if (config.env === 'production' && !process.env.FACEID_APP_ID) throw new Error('FaceID credentials missing');
    }),
    probe('messaging', async () => {
      if (config.env === 'production' && (!config.tim.appId || !config.tim.secretKey)) throw new Error('TIM credentials missing');
    })
  ]);
  const healthy = checks.every((check) => check.status === 'healthy');
  res.status(healthy ? 200 : 503).json(ApiResponse.success({
    environment: process.env.INTEGRATION_MODE === 'sandbox' ? 'sandbox' : config.env,
    updated_at: new Date().toISOString(),
    checks
  }));
}

module.exports = { getHealth };
