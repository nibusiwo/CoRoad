# 同道 (CoRoad) - 自驾社交平台 V1 MVP

面向自驾出行场景的社交平台，提供行程规划与招募、实时位置共享、地点聊天室、拼团优惠、商家入驻等功能。

## 技术栈

- **前端 (client)**: Uni-App (Vue 3) + Pinia + SCSS + uview-plus
- **后台管理 (admin)**: React 18 + Vite + TypeScript + Recharts + lucide-react
- **后端 (server)**: Node.js 18+ + Express 4.18
- **数据库**: MySQL 8.0+ + Redis 7+
- **实时通信**: ws (WebSocket) - 实时位置广播、聊天消息推送
- **定时任务**: node-schedule - 聊天室归档、过期拼团退款、脱队检测
- **地图**: 高德地图 SDK (POI/路线/天气/交通态势)
- **IM**: 腾讯云 IM (服务端签名)
- **支付**: 微信支付 V3 (wechatpay-node-v3)
- **存储**: 阿里云 OSS (头像/行驶证/商品图)
- **短信**: 阿里云短信 (验证码)

## 环境要求

| 软件 | 版本 | 说明 |
|------|------|------|
| Node.js | 18+ | 后端运行时 / 前端构建 |
| npm | 9+ | 包管理 |
| MySQL | 8.0+ | 主数据库 |
| Redis | 7+ | 缓存 / 会话 / 限流 |
| HBuilderX | 最新版 | Uni-App 开发 (推荐) |
| 微信开发者工具 | 最新版 | 小程序调试 |

## 项目结构

```
CoRoad/
├── server/                       # 后端服务 (Node.js + Express)
│   ├── src/
│   │   ├── config/               # 配置与数据库初始化
│   │   │   ├── migrations/       # 数据库迁移脚本
│   │   │   ├── db.js             # MySQL 连接池
│   │   │   ├── redis.js          # Redis 客户端
│   │   │   ├── schema.sql        # 数据库表结构
│   │   │   ├── seed.sql          # 初始种子数据
│   │   │   └── validateEnv.js    # 环境变量校验
│   │   ├── constants/            # 业务常量 (statuses.js)
│   │   ├── controllers/          # 控制器 (auth/trip/order/merchant/groupBuy/chat/map...)
│   │   ├── routes/               # 路由 (auth/trips/orders/merchants/group-buy/locations/map/messages/upload/users...)
│   │   ├── services/             # 业务服务 (sms/tim/websocket/wsAuth/wxpay)
│   │   ├── middleware/           # 中间件 (auth/upload)
│   │   ├── utils/                # 工具函数 (helpers/status)
│   │   ├── jobs/                 # 定时任务 (scheduler.js)
│   │   └── app.js                # Express 应用装配
│   ├── scripts/                  # 运维脚本 (migrate.js / check-syntax.js / smoke-v1.js)
│   ├── certs/                    # 微信支付证书目录
│   ├── uploads/                  # 本地上传文件目录
│   ├── server.js                 # 入口文件
│   ├── .env.example              # 环境变量模板
│   └── package.json
│
├── client/                       # 前端 (Uni-App Vue 3)
│   ├── src/
│   │   ├── pages/                # 页面
│   │   │   ├── map/              # 地图页 (Tab 1)
│   │   │   ├── message/          # 消息页 (Tab 2) - chat / session-info
│   │   │   ├── trip/             # 行程页 (Tab 3) - create/detail/my/next/teams
│   │   │   ├── mine/             # 我的 (Tab 4)
│   │   │   ├── login/            # 登录
│   │   │   ├── group-buy/        # 拼团 (activity/detail)
│   │   │   ├── merchant/         # 商家 (apply/manage/products/orders/promotion/settlement...)
│   │   │   ├── order/            # 订单 (detail)
│   │   │   ├── user/             # 用户中心 (certify/coupons/credit-score/follows/badges/blacklist/invite...)
│   │   │   ├── notifications/    # 通知中心
│   │   │   ├── settings/         # 设置 (privacy)
│   │   │   └── support/          # 客服
│   │   ├── components/           # 公共组件 (TripCard/EmptyState/ScanCode/GrowthBar/UnifiedPopup)
│   │   ├── store/                # Pinia 状态管理 (user/trip/chat)
│   │   ├── utils/               # 工具函数 (api/order/poster/ptt/qr)
│   │   ├── static/               # 静态资源
│   │   ├── App.vue
│   │   ├── main.js
│   │   ├── pages.json            # 页面路由配置
│   │   └── manifest.json         # 平台配置
│   ├── scripts/                  # 构建脚本 (generate-static-icons.js)
│   ├── vite.config.js
│   └── package.json
│
├── admin/                        # 后台管理端 (React + Vite + TS)
│   ├── src/
│   │   ├── main.tsx              # 应用入口
│   │   ├── styles.css
│   │   └── extra.css
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
│
├── docs/                         # 项目文档
│   ├── ARCHITECTURE.md           # 系统架构
│   ├── DEV_GUIDE.md              # 开发指南
│   ├── API.md                    # API 说明
│   ├── openapi.yaml              # OpenAPI 规范
│   ├── DEPLOY.md                 # 部署文档
│   ├── dev-doc-extracted.md      # 需求文档提取
│   └── dev-doc-source.docx       # 原始需求文档
│
├── 同道自驾游技术开发文档.md       # 技术开发文档
└── README.md
```

## 快速开始

### 后端 (server)

```bash
cd server
npm install
cp .env.example .env
# 编辑 .env 配置 MySQL / Redis / 各第三方密钥
```

初始化数据库:

```bash
mysql -u root -p < src/config/schema.sql
mysql -u root -p < src/config/seed.sql
```

启动开发服务器 (nodemon 热重载):

```bash
npm run dev
```

验证后端:

```bash
curl http://localhost:3000/health
# --> {"status":"ok","timestamp":"...","message":"Server is running"}
```

后端可用脚本:

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式 (nodemon 热重载) |
| `npm start` | 生产模式启动 |
| `npm run migrate` | 执行数据库迁移 |
| `npm run migrate:dry` | 试运行迁移 (dry-run) |
| `npm run check` | 语法检查 |
| `npm test` | 运行单元测试 (jest) |

### 前端 (client)

方式一: CLI

```bash
cd client
npm install
npm run dev:h5          # H5 开发 (默认 http://localhost:8080)
npm run dev:mp-weixin   # 微信小程序
```

方式二: HBuilderX (推荐用于小程序)

1. HBuilderX 打开 `client/` 目录
2. `client/src/utils/` 中的 API 配置指向本地后端:
   ```javascript
   export const API_BASE = 'http://localhost:3000/api'
   export const WS_URL   = 'ws://localhost:3000/ws'
   ```
3. 运行 -> 运行到浏览器 (H5) 或 运行到微信开发者工具

前端可用脚本:

| 命令 | 说明 |
|------|------|
| `npm run dev:h5` | H5 开发 |
| `npm run build:h5` | H5 生产构建 |
| `npm run dev:mp-weixin` | 微信小程序开发 |
| `npm run build:mp-weixin` | 微信小程序生产构建 |

### 后台管理 (admin)

```bash
cd admin
npm install
npm run dev       # 默认 http://localhost:5173
npm run build     # 生产构建
npm run preview   # 预览构建产物
```

## 环境变量说明

后端环境变量参见 `server/.env.example`，主要分类:

| 分类 | 变量 |
|------|------|
| 服务 | `NODE_ENV` `PORT` |
| MySQL | `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` |
| Redis | `REDIS_HOST` `REDIS_PORT` `REDIS_PASSWORD` |
| JWT | `JWT_SECRET` `JWT_EXPIRES_IN` |
| 腾讯云 IM | `TIM_APP_ID` `TIM_SECRET_KEY` `TIM_ADMIN_ID` |
| 高德地图 | `AMAP_KEY` `AMAP_SECRET` |
| 微信支付 V3 | `WX_APP_ID` `WX_APP_SECRET` `WX_MCH_ID` `WX_API_V3_KEY` `WX_PRIVATE_KEY_PATH` `WX_CERT_SERIAL_NO` `WX_NOTIFY_URL` |
| 阿里云 OSS | `OSS_ENDPOINT` `OSS_BUCKET` `OSS_ACCESS_KEY` `OSS_ACCESS_SECRET` |
| 阿里云短信 | `SMS_ACCESS_KEY` `SMS_ACCESS_SECRET` `SMS_SIGN_NAME` `SMS_TEMPLATE_CODE` |

> 生产部署请参考 [docs/DEPLOY.md](docs/DEPLOY.md) 与微信支付真实配置说明 (含证书序列号、回调 URL、商户号等)。

## 更多文档

- [系统架构](docs/ARCHITECTURE.md)
- [开发指南](docs/DEV_GUIDE.md)
- [API 说明](docs/API.md)
- [OpenAPI 规范](docs/openapi.yaml)
- [部署文档](docs/DEPLOY.md)
