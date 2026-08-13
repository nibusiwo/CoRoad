# CoRoad Deployment Guide

> 同道 CoRoad 自驾社交平台部署指南

---

## Prerequisites

| 软件 | 版本要求 | 用途 |
|------|---------|------|
| Node.js | 18+ | 后端运行时 |
| MySQL | 8.0+ | 主数据库 |
| Redis | 7+ | 缓存 / 会话 / 限流 |
| Nginx | 1.20+ (推荐) | 反向代理 / 静态资源 / SSL 终止 |
| PM2 | 5+ (推荐) | 生产环境进程管理 |
| Git | 2.30+ | 源码管理 |

---

## 环境变量

部署前需在 `server/.env` 文件中配置以下环境变量（可参照 `.env.example` 创建）:

### 基础配置

```env
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://yourdomain.com
```

### 数据库

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=coroad
DB_PASSWORD=your_secure_password
DB_NAME=coroad
```

### Redis

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

### JWT

```env
JWT_SECRET=your_jwt_secret_at_least_32_chars
JWT_EXPIRES_IN=7d
```

### 微信支付 V3

```env
WX_APP_ID=your_wechat_app_id
WX_APP_SECRET=your_wechat_app_secret
WX_MCH_ID=your_merchant_id
WX_API_V3_KEY=your_api_v3_key
WX_PRIVATE_KEY_PATH=/path/to/apiclient_key.pem
WX_CERT_SERIAL_NO=your_cert_serial_no
WX_NOTIFY_URL=https://api.coroad.cn/api/orders/notify
```

### 高德地图

```env
AMAP_KEY=your_amap_web_service_key
AMAP_SECRET=your_amap_secret
```

### 腾讯云 IM

```env
TIM_APP_ID=your_tim_app_id
TIM_SECRET_KEY=your_tim_secret_key
TIM_ADMIN_ID=admin
```

### 阿里云短信

```env
SMS_ACCESS_KEY=your_sms_access_key
SMS_ACCESS_SECRET=your_sms_access_secret
SMS_SIGN_NAME=CoRoad
SMS_TEMPLATE_CODE=SMS_123456789
```

### 文件上传 (OSS)

```env
OSS_ENDPOINT=https://oss-cn-beijing.aliyuncs.com
OSS_BUCKET=coroad-uploads
OSS_ACCESS_KEY=your_oss_access_key
OSS_ACCESS_SECRET=your_oss_access_secret
```

### 管理员

```env
ADMIN_USER_IDS=1,2,3
```

---

## Server Setup

### 1. 克隆仓库

```bash
git clone https://github.com/your-org/coroad.git
cd coroad/server
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入实际配置
vim .env
```

### 4. 初始化数据库

```bash
# 创建数据库并导入结构
mysql -u root -p < src/config/schema.sql

# 导入种子数据（勋章定义等初始数据）
mysql -u root -p < src/config/seed.sql
```

`schema.sql` 包含以下表:
- `users` -- 用户表
- `user_invites` -- 用户邀请关系表
- `trips` -- 行程表
- `trip_members` -- 行程成员表
- `next_trip_drafts` -- 行程草稿表
- `location_records` -- 位置上报记录表
- `follows` -- 关注关系表
- `chat_sessions` -- 聊天会话表
- `chat_session_members` -- 会话成员表
- `chat_messages` -- 消息表
- `location_topics` -- 地点聊天室话题表
- `merchants` -- 商家表
- `group_buy_products` -- 拼团商品表
- `group_buy_activities` -- 拼团活动表
- `group_buy_participants` -- 拼团参与者表
- `orders` -- 订单表
- `coupon_templates` -- 券模板表
- `user_coupons` -- 用户券表
- `badges` -- 勋章定义表
- `user_badges` -- 用户勋章表
- `operation_logs` -- 操作日志表

### 5. 启动服务

```bash
# 开发环境（使用 nodemon 热重载）
npm run dev

# 生产环境（使用 PM2）
pm2 start server.js --name coroad

# 查看运行状态
pm2 status
pm2 logs coroad
```

### 6. 验证部署

```bash
curl http://localhost:3000/health
# 期望响应: {"status":"ok","timestamp":"...","message":"Server is running"}
```

---

## Nginx Configuration

以下为 `api.coroad.cn` 的反向代理配置示例:

```nginx
upstream coroad_backend {
    server 127.0.0.1:3000;
    # 多实例时可添加更多
    # server 127.0.0.1:3001;
    # server 127.0.0.1:3002;
    keepalive 64;
}

server {
    listen 80;
    server_name api.coroad.cn;

    # HTTP -> HTTPS 重定向
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.coroad.cn;

    # SSL 证书
    ssl_certificate     /etc/nginx/ssl/api.coroad.cn.pem;
    ssl_certificate_key /etc/nginx/ssl/api.coroad.cn.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # 日志
    access_log /var/log/nginx/coroad_access.log;
    error_log  /var/log/nginx/coroad_error.log;

    # 客户端上传大小限制
    client_max_body_size 20m;

    # 静态文件
    location /uploads/ {
        alias /path/to/coroad/server/uploads/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://coroad_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }

    # API 代理
    location / {
        proxy_pass http://coroad_backend;
        proxy_http_version 1.1;

        # 标准代理头
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时设置
        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # 缓冲
        proxy_buffering off;
    }
}
```

验证并重载 Nginx:

```bash
nginx -t
systemctl reload nginx
```

---

## SSL Certificate

### 使用 Let's Encrypt (推荐)

```bash
# 安装 certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d api.coroad.cn

# 自动续期 (certbot 自动配置了 cron / systemd timer)
sudo certbot renew --dry-run
```

### 使用购买的 SSL 证书

将证书文件和私钥放在 `/etc/nginx/ssl/` 目录下，确保 Nginx 配置中的路径正确。

---

## Database Backup

### 每日自动备份

创建备份脚本 `/opt/scripts/coroad_backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/opt/backups/coroad"
DB_NAME="coroad"
DB_USER="root"
DB_PASS="your_password"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

FILENAME="${DB_NAME}_$(date +%Y%m%d_%H%M%S).sql.gz"
mysqldump -u"$DB_USER" -p"$DB_PASS" \
  --single-transaction \
  --routines \
  --triggers \
  "$DB_NAME" | gzip > "$BACKUP_DIR/$FILENAME"

# 清理旧备份
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $FILENAME ($(du -h $BACKUP_DIR/$FILENAME | cut -f1))"
```

添加 cron 任务（每天凌晨 2:00）:

```bash
chmod +x /opt/scripts/coroad_backup.sh
crontab -e
# 添加:
0 2 * * * /opt/scripts/coroad_backup.sh >> /var/log/coroad_backup.log 2>&1
```

### 恢复备份

```bash
gunzip < /opt/backups/coroad/coroad_20260730_020000.sql.gz | mysql -u root -p coroad
```

---

## Monitoring

### PM2 进程监控

```bash
# 实时监控面板
pm2 monit

# 查看进程详情
pm2 show coroad

# 查看日志
pm2 logs coroad --lines 100

# 保存进程列表（开机自启）
pm2 save
pm2 startup
```

### PM2 日志轮转

```bash
pm2 install pm2-logrotate

# 配置轮转策略
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### 健康检查

服务提供 `/health` 端点用于外部监控:

```bash
# 简单检查
curl -f http://localhost:3000/health

# 配合 systemd timer 或 cron 做存活检查
# 示例 cron (每 5 分钟):
*/5 * * * * curl -f http://localhost:3000/health || systemctl restart coroad
```

### 数据库监控

建议监控:
- MySQL 连接数: `SHOW STATUS LIKE 'Threads_connected';`
- Redis 内存使用: `redis-cli INFO memory | grep used_memory_human`
- 慢查询日志: 在 MySQL 配置中开启 `slow_query_log`

### 应用日志

- 请求日志通过 `morgan` 输出到 stdout (由 PM2 收集)
- 错误通过 Express 全局错误处理器记录
- 定时任务执行日志带 `[Scheduler]` 前缀

---

## Frontend Deployment

### WeChat Mini Program

1. 在 `client/src/manifest.json` 中配置正确的 `appid` 和 `name`
2. 在 `client/src/utils/config.js` 中设置 API base URL 为生产地址
3. 使用 HBuilderX 或微信开发者工具打开 `client` 项目
4. 编译并上传代码
5. 在微信公众平台提交审核

### H5 Web App

```bash
cd client
npm run build:h5

# 部署到 Nginx
cp -r dist/build/h5/* /var/www/coroad-h5/

# 部署到 CDN (以阿里云 OSS 为例)
ossutil cp -r dist/build/h5/ oss://coroad-h5/ --recursive
```

H5 Nginx 配置:

```nginx
server {
    listen 80;
    server_name h5.coroad.cn;

    root /var/www/coroad-h5;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

### App (Native)

使用 HBuilderX 的云打包或本地打包功能生成 Android APK / iOS IPA。

---

## Scheduled Tasks

服务启动时自动注册以下定时任务 (使用 `node-schedule`):

| 任务 | 频率 | 功能 |
|------|------|------|
| archiveLocationTopics | 每 30 分钟 | 归档超过 24 小时无消息的地点聊天室 |
| checkExpiredGroupBuys | 每 5 分钟 | 检查并自动退款过期的拼团活动 |
| checkDetachedMembers | 每 15 分钟 | 检查超时/脱队的行程成员并自动移除 |
| expireCoupons | 每天 00:00 | 过期未使用的优惠券 |
| cleanupOldLocationRecords | 每天 03:00 | 清理 30 天前的位置历史记录 |
| awardCheckinStreak | 每天 01:00 | 连续签到奖励 (V1 占位) |

---

## 优雅退出

PM2 发送 `SIGINT` 信号后，服务将:
1. 调用 `scheduler.stopAll()` 取消所有定时任务
2. 关闭 WebSocket 服务器
3. 关闭 HTTP 服务器
4. 退出进程

```bash
pm2 stop coroad    # 优雅停止
pm2 restart coroad # 优雅重启
```

---

## Troubleshooting

### 数据库连接失败

- 检查 MySQL 服务是否运行: `systemctl status mysql`
- 检查 `.env` 中的 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` 是否正确
- 检查防火墙是否放行 MySQL 端口
- 检查 MySQL 用户权限: `SELECT user, host FROM mysql.user;`

### Redis 连接失败

- 检查 Redis 服务: `systemctl status redis`
- 检查 `redis-cli ping` 是否返回 PONG
- 检查 `.env` 中的 `REDIS_PASSWORD` 是否与 Redis 配置一致

### WebSocket 连接失败

- 确认 Nginx 正确代理了 `/ws` 路径并设置了 `Upgrade` 和 `Connection` 头
- 检查防火墙是否放行 WSS 端口 (通常走 443)
- 确认客户端使用 `wss://` 协议

### PM2 进程频繁重启

- 检查日志: `pm2 logs coroad --err`
- 确认 Node.js 版本 >= 18
- 确认所有依赖已安装: `npm ls --depth=0`
- 检查服务器可用内存: `free -h`
