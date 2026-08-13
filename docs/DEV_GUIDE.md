# CoRoad Development Guide

> 同道 CoRoad 自驾社交平台 - 开发指南

---

## Getting Started

### Prerequisites

| 软件 | 版本 | 说明 |
|------|------|------|
| Node.js | 18+ | 后端运行时 |
| npm | 9+ | 包管理 |
| MySQL | 8.0+ | 数据库 |
| Redis | 7+ | 缓存 |
| HBuilderX | 最新版 | Uni-App 开发 (推荐) |
| 微信开发者工具 | 最新版 | 小程序调试 |

### Clone and Setup

```bash
# 克隆仓库
git clone https://github.com/your-org/coroad.git
cd coroad

# 后端
cd server
cp .env.example .env
# 编辑 .env 填入本地开发配置
npm install

# 初始化数据库
mysql -u root -p < src/config/schema.sql
mysql -u root -p < src/config/seed.sql

# 启动开发服务器 (nodemon 热重载)
npm run dev
```

验证后端:

```bash
curl http://localhost:3000/health
# --> {"status":"ok","timestamp":"...","message":"Server is running"}
```

### Frontend Setup

1. 打开 HBuilderX
2. 文件 -> 打开目录 -> 选择 `client/`
3. 在 `client/src/utils/config.js` 中配置 API base URL:
   ```javascript
   // 开发环境
   export const API_BASE = 'http://localhost:3000/api'
   export const WS_URL = 'ws://localhost:3000/ws'
   ```
4. 运行 -> 运行到浏览器 (H5) 或 运行到微信开发者工具 (小程序)

### VSCode Recommended Extensions

后端开发推荐安装:
- **ESLint** - 代码质量检查
- **Prettier** - 代码格式化
- **DotENV** - .env 文件语法高亮
- **MySQL** - SQL 语法高亮 (可选)
- **Thunder Client** / **Postman** - API 测试

前端开发推荐:
- **Volar** - Vue 3 支持
- **SCSS Formatter** - SCSS 格式化
- **uni-app-schemas** - pages.json 校验
- **微信小程序开发工具** - 小程序专属

### Code Style Guide

项目遵循以下约定:
- 缩进: 2 spaces
- 引号: 单引号 (JS), 双引号 (JSON)
- 分号: 使用分号
- 行尾: LF
- 注释: 中文业务注释 + JSDoc 格式

---

## Project Structure

```
coroad/
+-- server/                        # 后端
|   +-- server.js                  # 入口: HTTP + WebSocket 服务器
|   +-- .env                       # 环境变量 (gitignore)
|   +-- .env.example               # 环境变量模板
|   +-- package.json
|   +-- src/
|       +-- app.js                 # Express 应用配置 (中间件/路由挂载)
|       +-- config/
|       |   +-- index.js           # 全局配置 (从 .env 读取)
|       |   +-- db.js              # MySQL 连接池
|       |   +-- redis.js           # Redis 客户端
|       |   +-- schema.sql         # 数据库建表脚本
|       |   +-- seed.sql           # 种子数据
|       +-- middleware/
|       |   +-- auth.js            # JWT 认证中间件
|       |   +-- upload.js          # multer 文件上传
|       +-- routes/
|       |   +-- auth.js            # /api/auth/*
|       |   +-- users.js           # /api/users/*
|       |   +-- trips.js           # /api/trips/*
|       |   +-- messages.js        # /api/messages/* (含位置聊天)
|       |   +-- locations.js       # /api/locations/*
|       |   +-- group-buy.js       # /api/group-buy/*
|       |   +-- orders.js          # /api/orders/*
|       |   +-- coupons.js         # /api/coupons/*
|       |   +-- merchants.js       # /api/merchants/*
|       |   +-- admin.js           # /api/admin/*
|       |   +-- map.js             # /api/map/*
|       +-- controllers/
|       |   +-- authController.js
|       |   +-- userController.js
|       |   +-- tripController.js
|       |   +-- nextTripController.js
|       |   +-- chatController.js
|       |   +-- locationChatController.js
|       |   +-- locationController.js
|       |   +-- groupBuyController.js
|       |   +-- orderController.js
|       |   +-- couponController.js
|       |   +-- merchantController.js
|       |   +-- adminController.js
|       |   +-- mapController.js
|       +-- services/
|       |   +-- sms.js             # 短信服务
|       |   +-- wxpay.js           # 微信支付
|       |   +-- tim.js             # 腾讯云 IM
|       |   +-- websocket.js       # WebSocket 服务
|       +-- utils/
|       |   +-- helpers.js         # 工具函数 (ApiResponse, calcDistance, etc.)
|       +-- jobs/
|           +-- scheduler.js       # 定时任务调度器
|
+-- client/                        # 前端 (Uni-App)
    +-- src/
        +-- App.vue                # 应用根组件
        +-- main.js                # 入口文件
        +-- manifest.json          # 应用配置
        +-- pages.json             # 页面路由配置
        +-- pages/
        |   +-- index/             # 首页
        |   +-- map/               # 地图页
        |   +-- mine/              # 我的页
        |   +-- login/             # 登录页
        |   +-- user/              # 用户主页/邀请页
        |   +-- group-buy/         # 拼团列表/详情/活动
        |   +-- order/             # 订单列表/详情
        +-- components/            # 公共组件
        |   +-- UnifiedPopup.vue   # 统一弹窗
        +-- stores/                # Pinia stores
        +-- utils/
        |   +-- api.js             # API 请求封装
        |   +-- config.js          # 前端配置
        +-- static/                # 静态资源
```

---

## Project Conventions

### File Naming

| 类型 | 规范 | 示例 |
|------|------|------|
| JS (Node) | camelCase | `userController.js`, `nextTripController.js` |
| Vue SFC | PascalCase | `UnifiedPopup.vue` |
| Vue 页面目录 | kebab-case | `group-buy/`, `user/home.vue` |
| SQL 文件 | snake_case | `schema.sql`, `seed.sql` |
| Route 模块 | 单数/复数按资源: `auth.js`, `users.js`, `trips.js` |

### API Response Format

统一使用 `ApiResponse` 类 (定义在 `utils/helpers.js`):

```javascript
// 成功
res.json(ApiResponse.success(data, '操作成功'));
// -> { code: 0, message: '操作成功', data: {...} }

// 失败
res.status(422).json(ApiResponse.fail('请输入正确的手机号'));
// -> { code: -1, message: '请输入正确的手机号', data: null }

// 失败 (自定义 code)
res.status(401).json(ApiResponse.fail('请先登录', 401));

// 分页
res.json(ApiResponse.paginated(list, total, page, pageSize));
// -> { code: 0, message: '成功', data: { list: [...], pagination: {...} } }
```

### Controller Pattern

Controller 导出具名函数，每个函数是一个 Express 路由处理器:

```javascript
// 标准结构
const getXxx = async (req, res, next) => {
  try {
    // 1. 从 req 获取参数
    const userId = req.userId;
    const { param1 } = req.body;

    // 2. 参数校验
    if (!param1) {
      return res.status(422).json(ApiResponse.fail('缺少参数'));
    }

    // 3. 数据库操作
    const [rows] = await pool.query('SELECT ...', [userId]);

    // 4. 业务逻辑处理

    // 5. 返回响应
    res.json(ApiResponse.success(rows));
  } catch (err) {
    next(err);  // 传递给全局错误处理器
  }
};

module.exports = { getXxx, createXxx };
```

### Error Handling Pattern

1. **Controller 层**: try-catch, 业务错误直接 `res.status(xx).json(ApiResponse.fail(...))`
2. **系统错误**: 调用 `next(err)` 传递给全局错误处理器
3. **全局错误处理器** (在 `app.js` 中):
   - JSON 解析错误: 400
   - Multer 文件大小: 400
   - express-validator 错误: 422
   - 已知状态码错误: 原样返回
   - 未知错误: 500 (生产环境不暴露 stack trace)

```javascript
// 抛出自定义状态码错误
throw Object.assign(
  new Error('登录尝试次数过多'),
  { statusCode: 429 }
);
```

### Database Query Pattern

始终使用参数化查询，通过 `mysql2/promise` 的 `pool.query()`:

```javascript
// SELECT
const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);

// SELECT 单行
const [[row]] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);

// INSERT
const [result] = await pool.query(
  'INSERT INTO users (nickname, created_at) VALUES (?, NOW())',
  [nickname]
);
const newId = result.insertId;

// UPDATE
const [result] = await pool.query(
  'UPDATE users SET nickname = ?, updated_at = NOW() WHERE id = ?',
  [nickname, userId]
);

// DELETE (或软删除)
await pool.query('UPDATE trips SET status = 0 WHERE id = ?', [tripId]);

// COUNT
const [[{ total }]] = await pool.query(
  'SELECT COUNT(*) AS total FROM follows WHERE followee_id = ?',
  [userId]
);
```

### JSON Field Handling

MySQL JSON 字段读出来可能是字符串或已解析对象，统一处理:

```javascript
function parseJson(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

// Usage
const startPoint = parseJson(row.start_point);
const priceTiers = parseJson(row.price_tiers);
```

---

## Adding a New Feature

以下是添加新功能的完整步骤指南:

### Step 1: Database Migration (if needed)

如果需要新的表或字段，先在 `server/src/config/schema.sql` 中添加 DDL:

```sql
CREATE TABLE `new_table` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `status` TINYINT DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='新功能表';
```

然后手动执行迁移或在开发环境重建数据库:

```bash
mysql -u root -p coroad < server/src/config/schema.sql
```

### Step 2: Create Controller

在 `server/src/controllers/` 下新建文件:

```javascript
// server/src/controllers/newFeatureController.js
const pool = require('../config/db');
const { ApiResponse } = require('../utils/helpers');

const getList = async (req, res, next) => {
  try {
    const userId = req.userId;
    const [rows] = await pool.query('SELECT * FROM new_table WHERE user_id = ?', [userId]);
    res.json(ApiResponse.success(rows));
  } catch (err) {
    next(err);
  }
};

// Add more CRUD methods...

module.exports = { getList, create, update, remove };
```

### Step 3: Create Route File

在 `server/src/routes/` 下新建文件:

```javascript
// server/src/routes/new-feature.js
const router = require('express').Router();
const { auth } = require('../middleware/auth');
const controller = require('../controllers/newFeatureController');

router.get('/', auth, controller.getList);
router.post('/', auth, controller.create);
router.put('/:id', auth, controller.update);
router.delete('/:id', auth, controller.remove);

module.exports = router;
```

### Step 4: Register in app.js

在 `server/src/app.js` 中添加:

```javascript
const newFeatureRoutes = require('./routes/new-feature');
// ...
app.use('/api/new-feature', newFeatureRoutes);
```

### Step 5: Create Frontend Page/Component

在 `client/src/pages/` 下创建页面:

```
client/src/pages/new-feature/index.vue
```

```vue
<template>
  <view class="page">
    <view v-for="item in list" :key="item.id">
      {{ item.name }}
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { apiGet } from '@/utils/api'

const list = ref([])

onMounted(async () => {
  const res = await apiGet('/new-feature')
  list.value = res.data
})
</script>

<style lang="scss" scoped>
.page { padding: 20rpx; }
</style>
```

### Step 6: Register in pages.json

在 `client/src/pages.json` 中添加:

```json
{
  "pages": [
    // ...existing pages
    {
      "path": "pages/new-feature/index",
      "style": {
        "navigationBarTitleText": "新功能"
      }
    }
  ]
}
```

### Step 7: Add API Functions

在 `client/src/utils/api.js` 中添加 API 调用函数:

```javascript
export function getNewFeatureList() {
  return request('/new-feature', 'GET')
}

export function createNewFeature(data) {
  return request('/new-feature', 'POST', data)
}
```

### Step 8: Test

1. 启动后端: `cd server && npm run dev`
2. 启动前端: 在 HBuilderX 中运行
3. 使用 Postman 测试 API
4. 在前端验证功能

---

## Testing

### Running the Backend Locally

```bash
cd server
npm run dev
```

服务启动在 `http://localhost:3000`。

### Testing with Postman / HTTP Client

1. 导入 API 集合（可参考 `docs/API.md` 中的端点）
2. 设置环境变量 `base_url = http://localhost:3000/api`
3. 先调用 `/api/auth/phone-login` 获取 token
4. 在 Collection 的 Authorization 中设置 `Bearer {{token}}`
5. 测试各接口

测试流程示例:

```bash
# 1. 发送验证码
curl -X POST http://localhost:3000/api/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000"}'

# 2. 手机号登录 (验证码在开发环境可能为固定值，查看 sms.js 配置)
curl -X POST http://localhost:3000/api/auth/phone-login \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","code":"123456"}'

# 3. 获取用户资料
curl http://localhost:3000/api/users/profile \
  -H "Authorization: Bearer <token>"

# 4. 获取行程列表
curl "http://localhost:3000/api/trips?page=1&pageSize=10"

# 5. 健康检查
curl http://localhost:3000/health
```

### Testing Without SMS

在开发环境中，可以临时修改 `sms.js` 服务使验证码在本地直接生效，或使用固定验证码模式:

```javascript
// sms.js (development mode)
if (process.env.NODE_ENV === 'development') {
  // Bypass SMS, store fixed code
  await redis.set(`sms:verify:${phone}`, '123456', { EX: 300 });
  return { success: true };
}
```

### WeChat DevTools for Mini Program Testing

1. 打开微信开发者工具
2. 导入项目 -> 选择 `client/` 目录
3. 填写 AppID (可使用测试号)
4. 在详情 -> 本地设置中勾选"不校验合法域名"
5. 编译运行

### H5 Testing

1. HBuilderX -> 运行 -> 运行到浏览器 -> Chrome
2. 默认打开 `http://localhost:8080`
3. 使用浏览器 DevTools 进行调试

---

## Configuration Management

### Config Structure (`server/src/config/index.js`)

所有可配置项通过 `config/` 目录集中管理:

```javascript
module.exports = {
  // 服务器
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT) || 3000,

  // 数据库
  db: { host, port, user, password, database, connectionLimit: 20 },

  // Redis
  redis: { host, port, password },

  // JWT
  jwt: { secret, expiresIn: '7d' },

  // 第三方服务
  wxpay: { appId, appSecret, mchId, apiV3Key, ... },
  amap: { key, secret },
  tim: { appId, secretKey, adminId },

  // 业务配置
  commissionRates: { 1: 0.10, 2: 0.08, 3: 0.06, 4: 0.05, 5: 0.03 },
  growth: {
    factors: { drive_distance: 1, trip_complete: 200, ... },
    levels: [ { level: 0, name: '路人', min: 0 }, ... ]
  },
  inviteRewards: [ { count: 1, couponValue: 20 }, ... ],
  detachThreshold: { maxDistance: 50, maxSilence: 720, duration: 30 },
  groupBuyExpiry: 24,
  newUserDays: 7,
  chatRoomArchiveHours: 24
};
```

### Environment Variables

`.env` 中的敏感配置不会被提交到 Git（已在 `.gitignore` 中），通过 `.env.example` 作为模板。

---

## Git Workflow

### Branch Naming

| 分支类型 | 命名格式 | 示例 |
|----------|---------|------|
| 功能开发 | `feature/xxx` | `feature/group-buy-product-search` |
| Bug 修复 | `fix/xxx` | `fix/token-expiry-check` |
| 紧急修复 | `hotfix/xxx` | `hotfix/payment-callback-crash` |
| 发布分支 | `release/x.y.z` | `release/1.2.0` |

### Commit Message Format

遵循 Conventional Commits 规范:

```
<type>(<scope>): <subject>

[body]

[footer]
```

类型 (type):
- `feat`: 新功能
- `fix`: Bug 修复
- `refactor`: 代码重构
- `docs`: 文档更新
- `style`: 代码格式 (不影响逻辑)
- `test`: 测试相关
- `chore`: 构建/工具/依赖变更

示例:

```
feat(trip): add nearby trip search with Haversine formula

feat(chat): add private message permission rules (block/follow/team)
fix(auth): correct login attempt counter expiry from 1800s to window duration
refactor(config): extract business config to config/index.js
docs(api): add complete API documentation
```

### PR Review Process

1. 从最新 `main` 创建 feature 分支
2. 开发和本地测试
3. 提交 PR，描述变更内容和测试情况
4. 代码审查 (Code Review) 重点检查:
   - SQL 是否使用参数化查询（防止注入）
   - 是否正确处理 JSON 字段的序列化/反序列化
   - 认证中间件是否正确应用
   - 错误处理是否完整
   - API 响应格式是否符合 ApiResponse 规范
5. 审查通过后合并到 `main`
6. 部署到测试环境验证
7. 打 tag 发版

---

## Common Patterns

### Pagination Pattern

```javascript
const page = Math.max(1, parseInt(req.query.page) || 1);
const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize) || 20));
const offset = (page - 1) * pageSize;

// Count
const [[{ total }]] = await pool.query(
  'SELECT COUNT(*) AS total FROM table WHERE ...',
  params
);

// Fetch
const [rows] = await pool.query(
  'SELECT * FROM table WHERE ... LIMIT ? OFFSET ?',
  [...params, pageSize, offset]
);

res.json(ApiResponse.paginated(list, total, page, pageSize));
```

### Soft Delete Pattern

项目使用软删除而非物理删除，通过 status 字段标记:

```javascript
// 删除: 将 status 设为 0
await pool.query('UPDATE table SET status = 0 WHERE id = ?', [id]);

// 查询时排除软删除记录
const [rows] = await pool.query('SELECT * FROM table WHERE status != 0');
```

### Distance Calculation

使用 Haversine 公式计算球面距离:

```javascript
const { calcDistance } = require('../utils/helpers');

const distKm = calcDistance(lng1, lat1, lng2, lat2);
// 返回距离 (km)
```

### Route Match Calculation

```javascript
const { calcRouteMatch } = require('../utils/helpers');

const matchPercent = calcRouteMatch(
  { start_point: { lng: 116.4, lat: 39.9 }, end_point: { lng: 117.2, lat: 40.1 } },
  { start_point: { lng: 116.5, lat: 39.95 }, end_point: { lng: 117.1, lat: 40.0 } }
);
// 返回 0-100 的顺路率
```

### Operation Logging

关键操作记录到 `operation_logs` 表:

```javascript
await pool.query(
  `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
   VALUES (?, ?, ?, ?, ?, NOW())`,
  [userId, 'action_name', 'target_type', String(targetId), JSON.stringify(detail)]
);
```

---

## Scheduled Jobs

定时任务在 `server/src/jobs/scheduler.js` 中定义，服务启动时自动注册:

| Job | Cron | 说明 |
|-----|------|------|
| `archiveLocationTopics` | `*/30 * * * *` | 归档超过 24 小时无消息的地点聊天室 |
| `checkExpiredGroupBuys` | `*/5 * * * *` | 处理过期拼团并退款 |
| `checkDetachedMembers` | `*/15 * * * *` | 检查并移除脱队成员 |
| `expireCoupons` | `0 0 * * *` | 过期未使用的优惠券 |
| `cleanupOldLocationRecords` | `0 3 * * *` | 清理 30 天之前的位置记录 |
| `awardCheckinStreak` | `0 1 * * *` | 连续签到奖励 (V1 占位) |

添加新任务:

```javascript
// 1. 在 scheduler.js 中定义函数
function startNewJob() {
  jobs.newJob = schedule.scheduleJob('cron_expression', async () => {
    // 任务逻辑...
  });
  console.log('[Scheduler] newJob 已注册');
}

// 2. 在 startAll() 中调用
function startAll() {
  // ... existing jobs
  startNewJob();
}
```

---

## Troubleshooting

### 常见开发问题

**Q: 数据库连接失败 "Access denied"**
A: 检查 `.env` 中的 `DB_USER` 和 `DB_PASSWORD`，确认 MySQL 允许该用户连接。

**Q: Redis 连接失败**
A: 确认 Redis 服务运行 (`redis-cli ping`)，检查 `.env` 密码配置。若开发环境不需要 Redis 密码，将 `REDIS_PASSWORD` 留空。

**Q: JWT token 过期**
A: 默认有效期 7 天。开发中可调大 `JWT_EXPIRES_IN` (如 `30d`) 或频繁调用 `/api/auth/refresh-token`。

**Q: 前端请求跨域被拦截**
A: 后端 `cors` 中间件已配置 `CORS_ORIGIN`，开发中可设为 `*`。小程序需在微信公众平台配置 request 合法域名。

**Q: WebSocket 连接失败**
A: 确认客户端使用正确的协议 (`ws://` 开发, `wss://` 生产)，确认 Nginx (生产) 正确代理 `/ws` 路径。
