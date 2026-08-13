const redis = require('redis');
const config = require('./index');

const client = redis.createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port
  },
  password: config.redis.password
});

client.on('connect', () => {
  console.log('[Redis] 连接成功');
});

client.on('error', (err) => {
  console.error('[Redis] 连接失败:', err.message);
});

client.connect().catch(err => {
  console.error('[Redis] 初始连接失败:', err.message);
});

module.exports = client;
