const mysql = require('mysql2/promise');
const config = require('./index');

const pool = mysql.createPool(config.db);

// 测试连接
pool.getConnection()
  .then(conn => {
    console.log('[MySQL] 数据库连接成功');
    conn.release();
  })
  .catch(err => {
    console.error('[MySQL] 数据库连接失败:', err.message);
  });

module.exports = pool;
