require('dotenv').config();

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const app = require('./src/app');
const pool = require('./src/config/db');
const config = require('./src/config');
const { validateProductionEnv } = require('./src/config/validateEnv');
const scheduler = require('./src/jobs/scheduler');
const { getTokenFromRequest, attachSocketUser } = require('./src/services/wsAuth');
const { forEachClient, send } = require('./src/services/websocket');

validateProductionEnv();

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/**
 * 实时对讲(PTT)中继:
 * ptt_start 校验会话成员身份并缓存成员列表;ptt_audio 转发音频帧;ptt_end 结束并清理。
 */
async function relayPtt(ws, msg) {
  const sessionId = parseInt(msg.session_id);
  const senderId = ws.userId;
  if (!sessionId || !senderId) {
    send(ws, { type: 'ptt_error', message: '缺少会话信息' });
    return;
  }

  if (msg.type === 'ptt_start') {
    const [rows] = await pool.query(
      `SELECT user_id FROM chat_session_members
       WHERE session_id = ? AND user_id = ? AND left_at IS NULL`,
      [sessionId, senderId]
    );
    if (rows.length === 0) {
      send(ws, { type: 'ptt_error', message: '您不是该会话成员' });
      return;
    }
    const [members] = await pool.query(
      `SELECT user_id FROM chat_session_members
       WHERE session_id = ? AND user_id != ? AND left_at IS NULL`,
      [sessionId, senderId]
    );
    ws.pttSession = sessionId;
    ws.pttMembers = new Set(members.map((m) => m.user_id));
    const payload = { type: 'ptt_start', session_id: sessionId, sender_id: senderId };
    forEachClient(wss, (client) => {
      if (client.userId && ws.pttMembers.has(client.userId)) send(client, payload);
    });
    return;
  }

  if (ws.pttSession !== sessionId) return; // 未在对讲中的会话忽略

  if (msg.type === 'ptt_audio') {
    const payload = {
      type: 'ptt_audio',
      session_id: sessionId,
      sender_id: senderId,
      seq: msg.seq || 0,
      payload: String(msg.payload || '')
    };
    forEachClient(wss, (client) => {
      if (client.userId && ws.pttMembers.has(client.userId)) send(client, payload);
    });
  } else if (msg.type === 'ptt_end') {
    const payload = { type: 'ptt_end', session_id: sessionId, sender_id: senderId };
    forEachClient(wss, (client) => {
      if (client.userId && ws.pttMembers.has(client.userId)) send(client, payload);
    });
    ws.pttSession = null;
    ws.pttMembers = null;
  }
}

wss.on('connection', (ws, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`[WebSocket] connection from ${clientIp}`);

  ws.isAlive = true;

  try {
    const decoded = attachSocketUser(ws, getTokenFromRequest(req));
    ws.send(JSON.stringify({ type: 'auth_ok', user_id: decoded.userId }));
  } catch (_) {
    ws.send(JSON.stringify({ type: 'auth_error', message: 'unauthorized' }));
    ws.close(1008, 'unauthorized');
    return;
  }

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'auth':
          try {
            const decoded = attachSocketUser(ws, msg.token);
            ws.send(JSON.stringify({ type: 'auth_ok', user_id: decoded.userId }));
          } catch (_) {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'unauthorized' }));
            ws.close(1008, 'unauthorized');
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'ptt_start':
        case 'ptt_audio':
        case 'ptt_end':
          relayPtt(ws, msg).catch((err) => {
            console.warn('[WebSocket] PTT relay failed:', err.message);
          });
          break;

        default:
          ws.send(JSON.stringify({ type: 'ignored', message: 'unsupported message type' }));
          break;
      }
    } catch (_) {
      ws.send(JSON.stringify({ type: 'error', message: 'invalid message format' }));
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] connection closed');
  });

  ws.send(JSON.stringify({ type: 'connected', user_id: ws.userId }));
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

app.set('wss', wss);
global.wsServer = wss;

const PORT = config.port;
const HTTPS_PORT = process.env.HTTPS_PORT ? parseInt(process.env.HTTPS_PORT, 10) : 3443;

// 本地 HTTPS 支持(自签名证书,供微信小程序开发者工具加载头像/图片使用)
// 小程序 <image> 只支持 HTTPS 地址,本地开发用自签名证书 + 开发者工具
// "不校验合法域名/TLS/HTTPS 证书" 即可正常显示。
const certDir = path.resolve(__dirname, 'certs');
const certPath = path.join(certDir, 'cert.pem');
const keyPath = path.join(certDir, 'key.pem');

server.listen(PORT, () => {
  console.log('='.repeat(52));
  console.log(`CoRoad API server started`);
  console.log(`Port: ${PORT} | Env: ${config.env}`);
  console.log('='.repeat(52));
  scheduler.startAll();
});

// 证书存在时同时启动 HTTPS 服务(默认 3443)
if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsOptions = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath)
  };
  const httpsServer = https.createServer(httpsOptions, app);
  httpsServer.listen(HTTPS_PORT, () => {
    console.log(`[HTTPS] https://localhost:${HTTPS_PORT} (自签名证书,用于微信小程序图片加载)`);
  });
} else {
  console.warn(`[HTTPS] 未找到证书 (${certPath}),跳过 HTTPS 服务; 如需小程序图片加载请先生成证书`);
}

function shutdown(signal) {
  console.log(`[Server] received ${signal}, shutting down...`);
  scheduler.stopAll();
  wss.close(() => {
    server.close(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
