// 简单的后端测试服务器
const http = require('http');
const url = require('url');

const PORT = 3000;

const server = http.createServer((req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;

  console.log(`[${new Date().toISOString()}] ${req.method} ${path}`);

  // 路由处理
  if (path === '/') {
    res.writeHead(200);
    res.end(JSON.stringify({
      message: 'CoRoad 简化后端服务器',
      version: '1.0.0-test',
      status: 'running',
      endpoints: {
        health: '/health',
        api: '/api/*'
      }
    }));
  } else if (path === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      message: '后端服务正常运行',
      port: PORT
    }));
  } else if (path === '/api/users/profile') {
    res.writeHead(200);
    res.end(JSON.stringify({
      code: 0,
      message: 'success',
      data: {
        id: 'test-user-001',
        nickname: '测试用户',
        avatar: '/static/default-avatar.png',
        level: 1,
        levelName: '新手车友',
        certified: false,
        growth: 0,
        credit: 5.0
      }
    }));
  } else if (path.startsWith('/api/')) {
    // 其他API请求返回模拟数据
    res.writeHead(200);
    res.end(JSON.stringify({
      code: 0,
      message: 'API端点已识别（简化版）',
      path: path,
      method: req.method,
      hint: '这是简化后端服务器的模拟响应'
    }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({
      code: 404,
      message: '路径不存在',
      path: path
    }));
  }
});

server.listen(PORT, () => {
  console.log('================================================');
  console.log('  CoRoad 简化后端服务器已启动');
  console.log('  地址: http://localhost:' + PORT + '/');
  console.log('  健康检查: http://localhost:' + PORT + '/health');
  console.log('  按 Ctrl+C 停止服务');
  console.log('================================================');
});

// 优雅退出
process.on('SIGTERM', () => {
  console.log('[Server] 收到 SIGTERM，正在关闭...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[Server] 收到 SIGINT，正在关闭...');
  server.close(() => process.exit(0));
});