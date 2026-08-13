# CoRoad Architecture

> 同道 CoRoad 自驾社交平台 -- 系统架构文档

---

## Overview

CoRoad (同道) 是一款面向自驾出行场景的社交平台，提供行程规划与招募、实时位置共享、地点聊天室、拼团优惠、商家入驻等功能。

### 架构概要

```
Front-end:   Uni-App (Vue 3) -- WeChat Mini Program, H5, Native App
                   |
          HTTPS + WSS (WebSocket)
                   |
Backend:     Nginx (Reverse Proxy / SSL Termination)
                   |
          Express.js API Server (Node.js)
            /          |          \
     MySQL 8.0    Redis 7     WebSocket (ws)
   (Primary DB)  (Cache /     (Real-time
                 Sessions)    Location/Chat)
                   |
Third-party:  高德地图API  腾讯云IM  微信支付V3  阿里云短信
```

---

## Tech Stack Details

### Backend

| 组件 | 技术 | 用途 |
|------|------|------|
| 运行时 | Node.js 18+ | JavaScript 服务端 |
| Web 框架 | Express 4.18 | HTTP 路由、中间件管理 |
| 数据库驱动 | mysql2 (promise) | MySQL 异步连接池 |
| 缓存 | ioredis / redis 4.x | 会话缓存、限流计数器、签到标记 |
| 认证 | jsonwebtoken 9.x | JWT (HS256) 签发与验证 |
| WebSocket | ws 8.x | 实时位置广播、聊天消息推送 |
| 定时任务 | node-schedule 2.x | 归档聊天室、过期拼团退款、脱队检测 |
| 安全 | helmet 7.x, cors 2.x, express-rate-limit 7.x | 安全头、跨域、速率限制 |
| 日志 | morgan 1.x | HTTP 请求日志 |
| 支付 | wechatpay-node-v3 1.x | 微信支付 V3 API |
| 二维码 | qrcode 1.x | 核销码 QR 生成 |
| 验证 | express-validator 7.x | 请求参数校验 |
| 文件上传 | multer 1.4 | multipart 文件处理 |

### Frontend

| 组件 | 技术 | 用途 |
|------|------|------|
| 框架 | Uni-App (Vue 3) | 跨端开发框架 |
| 状态管理 | Pinia | 响应式全局状态 |
| 样式 | SCSS | CSS 预处理 |
| 地图 | 高德地图 SDK | 地图展示、POI 搜索、路线规划 |
| 配置 | pages.json, manifest.json | Uni-App 页面路由及平台配置 |
| API | 统一定义的 API 函数模块 | 封装 HTTP 请求 |

### Third-party Services

| 服务 | SDK / API | 用途 |
|------|-----------|------|
| 微信小程序登录 | wx.login() + jscode2session | 用户认证 |
| 微信支付 V3 | wechatpay-node-v3 | 拼团订单支付、退款 |
| 腾讯云 IM | TIM SDK (server-side sig) | 即时通讯（可选增强） |
| 高德地图 API | 天气/POI/路线/交通态势 | 地图数据聚合 |
| 阿里云短信 | SMS SDK | 验证码发送与验证 |
| 阿里云 OSS | OSS SDK | 文件存储 (头像/行驶证/商品图) |

---

## System Architecture Diagram

```
+------------------------------------------------------------+
|                     Client (Uni-App)                        |
|         WeChat Mini Program / H5 Web / Native App            |
+-----------------------------+------------------------------+
                              |
                       HTTPS + WSS
                              |
+-----------------------------v------------------------------+
|                   Nginx Reverse Proxy                       |
|        SSL Termination / Static Assets / Load Balancing     |
+-----------------------------+------------------------------+
                              |
+-----------------------------v------------------------------+
|             Express API Server (server.js)                   |
|                                                              |
|  +------------------------------------------------------+  |
|  |  HTTP Server                                           |  |
|  |  app.js (Express Application)                          |  |
|  |                                                        |  |
|  |  +------------------+  +---------------------------+   |  |
|  |  | Global Middleware: |  | Route Modules:           |   |  |
|  |  |  - helmet (安全头)  |  |  - auth     /api/auth    |   |  |
|  |  |  - cors (跨域)     |  |  - users    /api/users   |   |  |
|  |  |  - morgan (日志)   |  |  - trips    /api/trips   |   |  |
|  |  |  - rateLimit (限流) |  |  - messages /api/messages |  |  |
|  |  |  - express.json()  |  |  - locations/api/locations|  |  |
|  |  +------------------+  |  |  - group-buy/api/group-buy|  |  |
|  |                         |  |  - orders   /api/orders  |  |  |
|  |  +------------------+  |  |  - merchants/api/merchants|  |  |
|  |  | Auth Middleware:   |  |  |  - coupons  /api/coupons |  |  |
|  |  |  - auth (JWT验证)  |  |  |  - admin    /api/admin   |  |  |
|  |  |  - optionalAuth    |  |  |  - map      /api/map     |  |  |
|  |  |  - requireCertified|  |  +---------------------------+   |  |
|  |  +------------------+  |                                    |  |
|  |                         |  +---------------------------+   |  |
|  |  +------------------+  |  | Controllers (业务逻辑)     |   |  |
|  |  | Services:          |  |  |  authController          |   |  |
|  |  |  - sms.js           |  |  |  userController          |   |  |
|  |  |  - wxpay.js         |  |  |  tripController          |   |  |
|  |  |  - tim.js           |  |  |  nextTripController      |   |  |
|  |  |  - websocket.js     |  |  |  chatController          |   |  |
|  |  +------------------+  |  |  |  locationChatController  |   |  |
|  |                         |  |  |  locationController      |   |  |
|  +-------------------------+  |  |  groupBuyController      |   |  |
|                               |  |  orderController         |   |  |
|  +-------------------------+  |  |  couponController        |   |  |
|  | WebSocket Server (ws)   |  |  |  merchantController      |   |  |
|  |  - 心跳检测 (30s)       |  |  |  adminController         |   |  |
|  |  - 位置广播             |  |  |  mapController           |   |  |
|  |  - 消息推送             |  |  +---------------------------+   |  |
|  +-------------------------+  |                                    |  |
|                               |  +---------------------------+   |  |
|  +-------------------------+  |  | Scheduled Jobs (node-schedule)|  |
|  | scheduler.js             |  |  |  - archiveLocationTopics    |  |
|  |  - 每30分钟归档话题      |  |  |  - checkExpiredGroupBuys    |  |
|  |  - 每5分钟检查过期拼团   |  |  |  - checkDetachedMembers     |  |
|  |  - 每15分钟检查脱队      |  |  |  - expireCoupons            |  |
|  |  - 每天00:00过期券       |  |  |  - cleanupOldLocations      |  |
|  |  - 每天03:00清理位置记录 |  |  |  - awardCheckinStreak       |  |
|  +-------------------------+  |  +---------------------------+   |  |
+--------------------------------------------------------------+
                    |                          |
          +---------v------+        +----------v--------+
          |    MySQL 8.0    |        |     Redis 7        |
          |   (Primary DB)  |        |    (Cache/Session)  |
          |                 |        |                     |
          | Tables:         |        | Keys:               |
          |  - users        |        |  - login:attempts:* |
          |  - trips/members|        |  - login:blocked:*  |
          |  - chat_*       |        |  - sms:limit:*      |
          |  - merchants    |        |  - checkin:*        |
          |  - group_buy_*  |        |                     |
          |  - orders       |        |                     |
          |  - coupon_*     |        |                     |
          |  - badges       |        |                     |
          |  - location_*   |        |                     |
          |  - follows      |        |                     |
          |  - operation_logs|       |                     |
          +-----------------+        +---------------------+
```

---

## Data Flow

### 1. User Authentication Flow

```
Client                      Server                       External
  |                            |                              |
  |-- POST /api/auth/send-code -->|                            |
  |   {phone}                     |-- Redis: check sms:limit  |
  |                               |-- 阿里云 SMS API --------->|
  |<--- {code:0, message:"已发送"} |<-- 发送成功 --------------|
  |                               |-- Redis: sms:verify:{phone}=code |
  |                               |                              |
  |-- POST /api/auth/phone-login -->|                           |
  |   {phone, code}               |-- Redis: check login:blocked|
  |                               |-- Redis: get sms:verify     |
  |                               |-- MySQL: find-or-create user|
  |                               |-- JWT: sign {userId, phone}  |
  |                               |-- Redis: clear login:attempts|
  |<--- {token, user} ------------|                            |
  |                               |                              |
  |-- GET /api/users/profile ----->|                           |
  |   Authorization: Bearer token |-- JWT: verify              |
  |                               |-- MySQL: SELECT user+stats |
  |<--- {user profile} ----------|                            |
```

OR for WeChat login:

```
Client                      Server                       WeChat
  |                            |                              |
  |-- wx.login() 获取 code     |                            |
  |-- POST /api/auth/wechat-login->|                         |
  |   {code, nickname, avatar} |-- GET jscode2session ------->|
  |                            |   {appid, secret, code}     |
  |                            |<-- {openid, session_key} ---|
  |                            |-- MySQL: find-or-create user |
  |                            |-- JWT: sign                  |
  |<--- {token, user} --------|                            |
```

### 2. Real-time Location Sharing Flow

```
Client A (位置上报)           Server                       Client B (车队成员)
  |                            |                              |
  |-- POST /api/locations/report->|                           |
  |   {lng, lat, speed, dir}  |-- MySQL: INSERT location_records|
  |                           |-- MySQL: UPDATE users.last_position|
  |                           |-- Check auto-detach conditions|
  |                           |-- WS: broadcast --------------->|
  |<--- {recorded_at} --------|  location_update               |
  |                           |                              |
  |                           |  Client B 获取车队位置:         |
  |                           |<-- GET /api/locations/team ---|
  |                           |-- MySQL: query members + pos -->|
  |                           |-- {members[] with distance}    |
```

Auto-detach logic:
- 计算用户当前位置与行程路线的最短距离 (遍历所有 route_data.path 点)
- 若偏离 > 50km 持续 30 分钟 -> `left_reason: 'detour'`
- 若超过 12 小时未更新位置 -> `left_reason: 'timeout'`
- 自动从 trip_members 和 chat_session_members 中移除

### 3. Group Buy + Payment + Verification Flow

```
Initiator                    Server                         Joiners
  |                            |                              |
  |-- POST /api/group-buy/activities->|                       |
  |   {product_id, target_count}|-- Validate product + tier  |
  |                           |-- MySQL: INSERT activity     |
  |                           |-- Auto-join as participant   |
  |<--- {activity, share_info}|                              |
  |                           |                              |
  |-- 分享到车队               |-- Joiner: POST .../join ----->|
  |                           |-- MySQL: INSERT participant  |
  |                           |-- MySQL: UPDATE current_count|
  |                           |-- MySQL: INSERT order (待支付)|
  |                           |-- MySQL: award growth_value  |
  |                           |<-- {participant, order}       |
  |                           |                              |
  |                           |-- Joiner: POST /api/orders/:id/pay->|
  |                           |-- MySQL: UPDATE order status=2|
  |                           |-- MySQL: deduct coupon       |
  |                           |-- MySQL: incr activity count |
  |                           |-- Check if target reached    |
  |                           |<-- {paid}                     |
  |                           |                              |
  Target reached:              |                              |
  |<-- activity.status=2 ------|-- Notify all participants    |
  |                           |                              |
  Verification (at merchant):  |                              |
  |                           |-- POST /api/orders/verify --->|
  |                           |   {order_no or verify_code}  |
  |                           |-- MySQL: UPDATE status=3     |
  |                           |-- Split profit (commission)  |
  |<-- {verified, split_info} |                              |
```

Scheduled task for expired activities:
- 每 5 分钟检查 `status=1 AND expire_at < NOW()` 的活动
- 设为 status=3 (失败)
- 该活动下所有已支付订单自动退款 (status->4)
- 退还使用的优惠券

### 4. Chat Message Flow

```
Sender                       Server                       Recipients
  |                            |                              |
  |-- POST .../sessions/:id/messages->|                        |
  |   {type, content, extra}  |-- MySQL: validate membership  |
  |                           |-- Check private chat rules:  |
  |                           |   - block check              |
  |                           |   - team/follow check        |
  |                           |   - 3-message limit check    |
  |                           |                              |
  |                           |-- MySQL: INSERT chat_messages|
  |                           |-- MySQL: UPDATE last_message |
  |                           |-- MySQL: UPDATE session.updated_at|
  |                           |-- MySQL: INCR unread_count   |
  |                           |   for all other members      |
  |                           |   (skip muted members)       |
  |                           |-- WS: broadcast --------------->|
  |<--- {message} ------------|   chat_message event          |
```

Private chat permission rules:
- Same team (active trip): always allowed
- Mutual follow: always allowed
- One-way follow: sender limited to 3 messages total
- No follow + no team: rejected with "关注后可发消息"
- Blocked (either direction): rejected

---

## Database Design

### Key Tables and Relationships

```
users (1) ---< user_invites >--- (1) users
  |                                     (inviter/invitee)
  |
  +--< trips (leader_id) >-- (1) users
  |       |
  |       +--< trip_members (trip_id, user_id) >-- (1) users
  |       +--< next_trip_drafts (user_id) >-- (1) users
  |
  +--< location_records (user_id)
  |
  +--< follows (follower_id, followee_id) >-- (1) users
  |
  +--< user_badges (user_id) >-- (1) badges
  |
  +--< orders (user_id)
  |
  +--< user_coupons (user_id) >-- (1) coupon_templates

chat_sessions (1) ---< chat_session_members (session_id, user_id)
  |       |
  |       +--< chat_messages (session_id, sender_id) >-- (1) users
  |
  +--< location_topics (session_id)

merchants (1) ---< group_buy_products (merchant_id)
  |       |
  |       +--< group_buy_activities (product_id)
  |               |
  |               +--< group_buy_participants (activity_id, user_id) >-- (1) users
  |
  +--< orders (merchant_id)
  +--< coupon_templates (merchant_id)

operation_logs --- (user_id) >-- (1) users
```

### JSON Field Usage

系统大量使用 MySQL JSON 类型存储灵活结构的数据：

| 表 | JSON 字段 | 存储内容 |
|----|----------|----------|
| users | `last_position` | `{lng, lat, altitude, speed, direction, updateTime}` |
| users | `certification_data` | `{driving_license, face_data, vehicle_model, plate_number}` |
| trips | `start_point`, `end_point` | `{name, lng, lat}` |
| trips | `waypoints` | `[{name, lng, lat}]` |
| trips | `route_data` | 高德路线规划 API 完整响应 |
| trips | `tags` | `["拍照","美食","AA住"]` |
| merchants | `location` | `{lng, lat}` |
| merchants | `business_hours` | `{open:"08:00", close:"22:00"}` |
| merchants | `qualifications` | 资质文件 URL 数组 |
| group_buy_products | `price_tiers` | `[{count:3, price:90}, {count:6, price:80}]` |
| chat_sessions | `last_message` | `{content, sender_id, time}` |
| chat_sessions | `poi_location` | `{lng, lat}` |
| chat_messages | `extra` | 扩展数据（位置/分享等） |
| operation_logs | `detail` | 结构化操作详情 |

### Indexing Strategy

| 表 | 索引 | 类型 | 用途 |
|----|------|------|------|
| users | `uk_wx_openid`, `uk_phone` | UNIQUE | 微信/手机号唯一查找 |
| users | `idx_level`, `idx_certified` | INDEX | 管理端筛选 |
| trips | `idx_leader`, `idx_departure`, `idx_status` | INDEX | 队长查询/时间排序/状态筛选 |
| trip_members | `uk_trip_user`, `idx_user`, `idx_status` | UNIQUE/INDEX | 防重复/用户行程查询 |
| follows | `uk_follow`, `idx_followee` | UNIQUE/INDEX | 防重复/粉丝查询 |
| chat_messages | `idx_session_time`, `idx_sender` | INDEX | 消息分页查询/发送者查询 |
| location_topics | `uk_poi_topic`, `idx_status`, `idx_location` | UNIQUE/INDEX/FUNCTIONAL | 话题去重/状态筛选/地理空间查询 |
| merchants | `idx_type`, `idx_level`, `idx_status`, `idx_location` | INDEX/FUNCTIONAL | 分类/等级/状态/地理查询 |
| orders | `uk_order_no`, `idx_user`, `idx_merchant`, `idx_activity`, `idx_status` | UNIQUE/INDEX | 订单号/用户/商家/活动/状态查询 |
| user_coupons | `uk_code`, `idx_user_status`, `idx_template` | UNIQUE/INDEX | 券码/用户状态/模板查询 |
| operation_logs | `idx_user_time`, `idx_action` | INDEX | 用户日志时序查询/操作类型筛选 |

### Spatial Indexing

对于 `merchants.location` 和 `location_topics.poi_location` 中的经纬度，使用 MySQL 的 functional index:
```sql
KEY `idx_location` ((CAST(JSON_EXTRACT(location, '$.lng') AS DOUBLE)), (CAST(JSON_EXTRACT(location, '$.lat') AS DOUBLE)))
```

但当前实现中，地理距离过滤在应用层通过 Haversine 公式计算（从数据库取出候选集后在 Node.js 中过滤），避免依赖数据库空间索引。

---

## Security

### JWT Token Management

- 签名算法: HS256
- Token 有效期: 7 天（可配置 `JWT_EXPIRES_IN`）
- 密钥: 通过 `JWT_SECRET` 环境变量配置（建议 32+ 字符随机字符串）
- Token 存储: 客户端自行管理（localStorage / wx.setStorageSync）
- 刷新机制: `/api/auth/refresh-token`，需携带当前有效 token
- Token 不存储敏感信息，仅含 `userId` 和 `phone`

### Rate Limiting

三层限流:

1. **全局限流** (`globalLimiter`): 每个 IP 每分钟 200 次请求
2. **认证接口限流** (`authLimiter`): 每 15 分钟 20 次 (login/register)
3. **短信限流** (`smsLimiter`): 每分钟 1 次 (send-code)
4. **Redis 级限流**: 短信每手机号 60 秒冷却，登录每手机号 30 分钟内最多 5 次失败

### Input Validation

- 手机号: 正则 `/^1[3-9]\d{9}$/` 校验
- 验证码: 6 位数字 `/^\d{6}$/`
- 车牌号: 中国车牌正则校验
- 昵称/标题: 长度限制 (nickname <= 50, title <= 100, signature <= 200)
- 数值范围: max_cars (1-20), 等级 (1-5)
- 业务校验: 商家类型白名单, 优惠券类型白名单, 分享类型白名单

### SQL Injection Prevention

全部使用参数化查询（prepared statements），通过 `mysql2` 的 `?` 占位符:

```javascript
// Safe: parameterized query
const [rows] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);

// Never: string concatenation
// const sql = `SELECT * FROM users WHERE phone = '${phone}'`;  // DANGEROUS
```

动态 `ORDER BY` 和表名使用白名单校验，不可直接拼接用户输入。

### File Upload Restrictions

- 使用 `multer` 中间件
- 请求体大小限制: 10MB (`express.json({ limit: '10mb' })`)
- Nginx 层面: `client_max_body_size 20m`
- 文件类型应根据上传场景校验（行驶证/头像/商品图）

### Other Security Measures

- **helmet**: 设置各种 HTTP 安全头 (X-Content-Type-Options, X-Frame-Options, etc.)
- **CORS**: 配置 `CORS_ORIGIN` 限制允许的域名
- **trust proxy**: 信任反向代理的 X-Forwarded-For 头
- **敏感数据脱敏**: 公开接口中的手机号和车牌号自动脱敏
- **操作日志**: 所有关键操作记录到 `operation_logs` 表
- **用户状态检查**: 禁用用户 (`status=0`) 被拒绝登录和 token 刷新

---

## Scalability Considerations

### Current (V1 / MVP)

- 单进程 Node.js + 内置 WebSocket
- 单实例 MySQL
- 单实例 Redis
- 高德地图 POI 查询每次实时请求

### Horizontal Scaling (Future)

```
                   +-- Load Balancer --+
                   |                   |
          +--------v------+   +--------v------+
          | API Server 1  |   | API Server 2  |
          | (Express + WS)|   | (Express + WS)|
          +-------+-------+   +-------+-------+
                  |                   |
          +-------v-------------------v-------+
          |         Redis Cluster             |
          |  (Pub/Sub for cross-instance WS)  |
          +-----------------------------------+
                  |
          +-------v--------+
          |  MySQL Primary  |
          |  + Read Replica |
          +-----------------+
```

关键无状态设计:
- JWT token 无需服务端 session（客户端持有）
- Redis 中的数据（限流计数器、签到标记）天然支持共享
- WebSocket 跨实例通信需引入 Redis Pub/Sub 适配器

### Cache Strategy

- Redis 缓存: 短信限流、登录失败计数、每日签到标记
- 未来可缓存: 热门商品列表、商家详情、地图 POI 数据
- 数据库连接池: 默认 20 个连接 (`connectionLimit: 20`)

### CDN

- 静态文件（头像、商品图）使用 Nginx 或阿里云 OSS + CDN
- H5 前端静态资源部署到 CDN
- Nginx 配置 `expires 30d` 长期缓存策略
