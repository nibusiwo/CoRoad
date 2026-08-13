# CoRoad API Documentation

> 同道 CoRoad 自驾社交平台 REST API 完整文档

## 基础信息

- **Base URL**: `https://api.coroad.cn/api`
- **Response Format**: JSON
- **Auth Header**: `Authorization: Bearer <token>`

---

## 通用响应格式

### 成功响应

```json
{
  "code": 0,
  "message": "成功",
  "data": { ... }
}
```

### 分页响应

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "list": [ ... ],
    "pagination": {
      "total": 100,
      "page": 1,
      "pageSize": 20,
      "totalPages": 5
    }
  }
}
```

### 错误响应

```json
{
  "code": 401,
  "message": "请先登录",
  "data": null
}
```

### 常见 HTTP 状态码

| 状态码 | 含义 |
|-------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 401 | 未登录或 token 过期 |
| 403 | 无权限访问 |
| 404 | 资源不存在 |
| 422 | 参数校验失败 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

---

## 认证 (Auth)

所有认证接口在 `/api/auth` 路径下。注：短信验证码发送和登录接口有独立的限流（详见 app.js 全局配置）。

### POST /api/auth/send-code

发送短信验证码。已内置 Redis 级别 60 秒冷却限制 + Express rate-limit 每分钟 1 次。

- **Auth**: No
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | phone | string | 是 | 手机号，须匹配 `/^1[3-9]\d{9}$/` |
- **Success 200**:
  ```json
  {
    "code": 0,
    "message": "验证码已发送",
    "data": null
  }
  ```
- **Errors**:
  - 422: `请输入正确的手机号`
  - 429: `验证码已发送，请60秒后再试` (Redis 限制)
  - 429: 速率限制 (app.js 全局 `smsLimiter`)
- **备注**: 验证码发送后存储在 Redis 中（由 `sms.js` 服务管理），有效期 5 分钟。

### POST /api/auth/wechat-login

微信小程序登录。通过 `code` 换取 `openid` / `unionid`，自动创建或查找用户。

- **Auth**: No
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | code | string | 是 | 微信 `wx.login()` 返回的临时登录凭证 |
  | nickname | string | 否 | 用户昵称 |
  | avatar | string | 否 | 用户头像 URL |
- **Success 200**:
  ```json
  {
    "code": 0,
    "message": "登录成功",
    "data": {
      "token": "eyJhbGciOi...",
      "user": {
        "id": 1,
        "nickname": "微信用户xxx",
        "avatar": "https://...",
        "phone": null,
        "is_certified": 0,
        "is_new": true
      }
    }
  }
  ```
- **备注**: `is_new` 表示微信用户尚未绑定手机号。若 `code` 无效则返回 `登录凭证 code 无效或已过期`。

### POST /api/auth/phone-login

手机号 + 验证码登录。内置防暴力破解机制：同一手机号 30 分钟内最多 5 次失败尝试，超出后锁定 60 分钟。

- **Auth**: No
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | phone | string | 是 | 手机号 |
  | code | string | 是 | 6 位数字验证码 |
- **Success 200**:
  ```json
  {
    "code": 0,
    "message": "登录成功",
    "data": {
      "token": "eyJhbGciOi...",
      "user": {
        "id": 1,
        "nickname": "138****5678",
        "avatar": null,
        "phone": "13812345678",
        "is_certified": 0,
        "wx_openid": false
      }
    }
  }
  ```
- **Errors**:
  - 422: `请输入正确的手机号` / `请输入6位数字验证码`
  - 429: `登录尝试次数过多，请X分钟后再试`
  - 400: `验证码错误或已过期`
  - 403: `账号已被禁用，请联系客服`

### POST /api/auth/refresh-token

刷新 JWT Token。需携带当前有效 token。

- **Auth**: Yes
- **Body**: 无
- **Success 200**:
  ```json
  {
    "code": 0,
    "message": "Token 已刷新",
    "data": {
      "token": "eyJhbGciOi..."
    }
  }
  ```
- **Errors**:
  - 401: `请先登录`
  - 403: `账号已被禁用，请联系客服`

---

## 用户 (User)

所有用户接口在 `/api/users` 路径下。除 `GET /home/:userId` 为可选认证外，其余均需认证。

### GET /api/users/profile

获取当前登录用户的完整个人资料，含粉丝数、关注数、行程数等统计信息。

- **Auth**: Yes
- **Success 200**:
  ```json
  {
    "code": 0,
    "data": {
      "id": 1,
      "nickname": "车友小明",
      "avatar": "https://...",
      "phone": "13812345678",
      "gender": 1,
      "vehicle_model": "特斯拉 Model 3",
      "plate_number": "京A12345",
      "signature": "热爱自驾",
      "is_certified": 2,
      "can_be_discovered": 1,
      "growth_value": 520,
      "level": 1,
      "level_name": "新手司机",
      "level_progress": 42,
      "next_level_growth": 500,
      "credit_score": 100,
      "total_distance": 3200,
      "total_teams": 5,
      "total_group_buy": 3,
      "total_invites": 2,
      "follower_count": 15,
      "following_count": 8,
      "trip_count": 7,
      "created_at": "2026-01-15T08:00:00.000Z",
      "last_login_at": "2026-07-30T10:00:00.000Z"
    }
  }
  ```
- **备注**: `is_certified` 取值 0=未认证, 1=审核中, 2=已认证。等级由 `growth_value` 根据 `config.growth.levels` 计算得出。

### PUT /api/users/profile

更新当前用户资料。

- **Auth**: Yes
- **Body** (可选字段，至少传一个):
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | nickname | string | 否 | 昵称，不超过 50 字符 |
  | avatar | string | 否 | 头像 URL |
  | signature | string | 否 | 个性签名，不超过 200 字符 |
  | vehicle_model | string | 否 | 车型 |
  | plate_number | string | 否 | 车牌号，须符合中国车牌格式 |
  | gender | number | 否 | 性别 0=未知 1=男 2=女 |
- **Success 200**: 返回更新后的用户字段子集。
- **Errors**:
  - 422: `昵称不能超过50个字符` / `签名不能超过200个字符` / `请输入正确的车牌号` / `没有需要更新的字段`

### POST /api/users/certify

提交车主认证。需上传行驶证照片数据并完成人脸识别。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | driving_license | string | 是 | 行驶证照片 (base64 或 URL) |
  | face_data | string | 是 | 人脸识别数据 |
  | vehicle_model | string | 否 | 车型 |
  | plate_number | string | 否 | 车牌号 |
- **Success 200**:
  ```json
  { "code": 0, "message": "认证资料已提交，请等待审核", "data": null }
  ```
- **Errors**:
  - 422: `请上传行驶证照片` / `请完成人脸识别`
  - 400: `您已完成车主认证` / `认证审核中，请耐心等待`
- **备注**: 提交后 `is_certified` 设为 1（审核中），管理员通过 `POST /api/admin/certifications/:userId/review` 审核。

### GET /api/users/growth

获取用户成长值（同路值）、等级、等级进度及最近的成长值记录。

- **Auth**: Yes
- **Success 200**:
  ```json
  {
    "code": 0,
    "data": {
      "growth_value": 520,
      "level": 1,
      "level_name": "新手司机",
      "progress": 42,
      "next_level_growth": 500,
      "factors": {
        "drive_distance": 1,
        "trip_complete": 200,
        "team_leader": 100,
        "invite_user": 150,
        "daily_checkin": 5,
        "review_merchant": 20,
        "group_buy_count": 50
      },
      "all_levels": [ ... ],
      "recent_logs": [ ... ]
    }
  }
  ```

### GET /api/users/badges

获取用户勋章列表（含已获得和未获得的所有勋章）。

- **Auth**: Yes
- **Success 200**:
  ```json
  {
    "code": 0,
    "data": {
      "earned_count": 3,
      "total_count": 8,
      "badges": [
        { "id": 1, "name": "初次上路", "icon": "first_trip", "type": "trip", "earned": true, "earned_at": "..." },
        { "id": 4, "name": "万里长征", "icon": "ten_thousand_km", "type": "distance", "earned": false, "earned_at": null }
      ]
    }
  }
  ```

### GET /api/users/home/:userId

获取指定用户的公开主页。

- **Auth**: Optional (未登录也可访问，但不会返回关系状态)
- **Path Params**: `userId` -- 目标用户 ID
- **Success 200** (已登录且有关系时):
  ```json
  {
    "id": 2,
    "nickname": "张三",
    "avatar": "...",
    "level": 2,
    "follower_count": 20,
    "trip_count": 12,
    "is_followed": true,
    "is_following_me": false,
    "is_blocked": false,
    "badges": [ ... ]
  }
  ```
- **备注**: 手机号和完整车牌号已做脱敏处理。

### GET /api/users/invite

获取当前用户的邀请码、邀请统计、奖励记录及被邀请人列表。

- **Auth**: Yes
- **Success 200**:
  ```json
  {
    "code": 0,
    "data": {
      "invite_code": "CR000001abc1",
      "total_invited": 5,
      "rewarded_count": 2,
      "invited_users": [ ... ],
      "reward_tiers": [
        { "count": 1, "couponValue": 20, "achieved": true },
        { "count": 3, "couponValue": 50, "achieved": true },
        { "count": 5, "couponValue": 100, "achieved": false }
      ]
    }
  }
  ```

### POST /api/users/invite/bind

绑定邀请人（通过手机号补填）。仅限注册 7 天内的新用户。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | phone | string | 是 | 邀请人的手机号 |
- **Success 200**: `{"code":0, "message":"绑定成功"}`
- **Errors**:
  - 422: `请输入正确的手机号`
  - 400: `注册已超过X天，无法绑定邀请人` / `已经绑定过邀请人` / `不能绑定自己`
  - 404: `未找到该用户`
- **备注**: 绑定成功后会给邀请人增加 `invite_user` 成长值（150 点）。

### PUT /api/users/privacy/discoverable

切换"可被其他车队发现"的隐私开关。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | discoverable | boolean | 是 | true=可被发现, false=关闭 |
- **Success 200**: `{"code":0, "message":"已设为可被发现", "data":{"can_be_discovered":1}}`

### GET /api/users/followers

获取当前用户的粉丝列表（分页）。

- **Auth**: Yes
- **Query Params**: `page` (默认 1), `pageSize` (默认 20, 最大 50)
- **Success 200**: 分页响应格式，每条包含 `follow_id`, `followed_at`, 用户公开信息。

### GET /api/users/following

获取当前用户的关注列表（分页）。

- **Auth**: Yes
- **Query Params**: `page` (默认 1), `pageSize` (默认 20, 最大 50)
- **Success 200**: 分页响应格式。

### POST /api/users/follow

关注用户或车队。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | followee_id | number | 是 | 被关注者 ID |
  | follow_type | number | 否 | 关注类型 1=用户(默认) 2=车队 |
- **Success 200**: `{"code":0, "message":"关注成功"}`
- **Errors**:
  - 422: `请提供要关注的用户或车队ID`
  - 400: `不能关注自己` / `已经关注了该用户` / `无法关注该用户` (存在屏蔽关系)
  - 404: `用户不存在或已禁用`

### DELETE /api/users/follow/:followeeId

取消关注。

- **Auth**: Yes
- **Path Params**: `followeeId` -- 被关注者 ID
- **Query Params**: `type` (可选, 默认 1=用户)
- **Success 200**: `{"code":0, "message":"已取消关注"}`

### POST /api/users/block

屏蔽用户。屏蔽后将同时自动取消双向关注。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | blocked_id | number | 是 | 要屏蔽的用户 ID |
- **Success 200**: `{"code":0, "message":"已屏蔽该用户"}`

### DELETE /api/users/block/:userId

取消屏蔽。

- **Auth**: Yes
- **Path Params**: `userId` -- 被屏蔽用户 ID
- **Success 200**: `{"code":0, "message":"已取消屏蔽"}`

### POST /api/users/checkin

每日签到。每日仅一次，使用 Redis 按天防重，奖励 5 点同路值。

- **Auth**: Yes
- **Success 200**:
  ```json
  {
    "code": 0,
    "message": "签到成功",
    "data": {
      "growth_award": 5,
      "growth_value": 525,
      "level": 1,
      "level_name": "新手司机",
      "consecutive_hint": "明天继续签到获得更多成长值"
    }
  }
  ```
- **Error**: 400 `今日已签到`

---

## 行程 (Trip)

所有行程接口在 `/api/trips` 路径下。

### 行程状态说明

| status | 含义 |
|--------|------|
| 0 | 已取消 |
| 1 | 招募中 |
| 2 | 已出发 |
| 3 | 已结束 |

### POST /api/trips

创建新行程（需要车主认证）。创建成功后自动创建行程群聊会话，创建者为队长。

- **Auth**: Yes (需要已认证)
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | title | string | 是 | 行程标题，不超过 100 字符 |
  | start_point | object | 是 | `{name, lng, lat}` |
  | end_point | object | 是 | `{name, lng, lat}` |
  | waypoints | array | 否 | `[{name, lng, lat}]` |
  | route_data | object | 否 | 高德路线规划结果 |
  | departure_time | datetime | 是 | 出发时间 |
  | estimated_days | number | 否 | 预计天数，默认 1 |
  | daily_distance | number | 否 | 每日里程(km) |
  | depth | number | 否 | 同路深度 1=浅(仅同行) 2=中(AA) 3=深(全程)，默认 1 |
  | tags | array | 否 | 标签 `["拍照","美食"]` |
  | max_cars | number | 否 | 最大车数 1-20，默认 4 |
  | max_members | number | 否 | 最大人数，默认 20 |
  | is_public | boolean | 否 | 是否公开，默认 true |
- **Success 200**:
  ```json
  { "code": 0, "message": "行程创建成功", "data": { "trip_id": 1, "session_id": 1 } }
  ```
- **Errors**: 403 `请先完成车主认证`

### GET /api/trips

获取行程列表（支持筛选、排序、分页）。

- **Auth**: Optional (未登录可访问公开行程)
- **Query Params**:
  | 参数 | 类型 | 默认 | 说明 |
  |------|------|------|------|
  | page | number | 1 | 页码 |
  | pageSize | number | 20 | 每页条数 (最大 50) |
  | status | number | -- | 0=已取消 1=招募中 2=已出发 3=已结束 |
  | keyword | string | -- | 标题模糊搜索 |
  | sort | string | -- | `departure_time` (升序) / `departure_time_desc` (降序) |
  | point_lng | number | -- | 用户经度 (配合 point_lat 计算 route_match) |
  | point_lat | number | -- | 用户纬度 |
- **Success 200**: 分页响应，每条行程包含 `leader_nickname`, `leader_avatar` 及 JSON 解析后的起终点信息。

### GET /api/trips/nearby

获取附近行程（10km 半径内）。根据起点的直线距离用 Haversine 公式计算。

- **Auth**: Optional
- **Query Params**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | lng | number | 是 | 当前经度 |
  | lat | number | 是 | 当前纬度 |
- **Success 200**:
  ```json
  {
    "code": 0,
    "data": [
      {
        "id": 1,
        "title": "京郊自驾",
        "distance_km": 3.2,
        "route_match": 85,
        "departure_time": "2026-08-01T08:00:00.000Z",
        ...
      }
    ]
  }
  ```
- **备注**: 仅查询 `status=1 AND is_public=1` 的行程。`route_match` 是顺路率百分比。

### GET /api/trips/:id

获取行程详情，包含完整成员列表、待审批申请、队长信息、当前用户的角色状态。

- **Auth**: Yes
- **Path Params**: `id` -- 行程 ID
- **Success 200**: 含 `leader_info`, `members[]` (含车牌脱敏), `pending_applicants[]`, `my_role`, `my_status`, 以及 JSON 解析后的 `start_point`/`end_point`/`waypoints`/`route_data`/`tags`。

### PUT /api/trips/:id

更新行程（仅队长可操作，且行程状态必须为 1=招募中）。

- **Auth**: Yes
- **Path Params**: `id` -- 行程 ID
- **Body** (可编辑字段): `title`, `departure_time`, `max_cars`, `depth`, `tags`, `is_public`, `estimated_days`, `daily_distance`
- **Success 200**: `{"code":0, "message":"行程已更新"}`
- **Errors**: 403 `只有队长可以修改行程` / 400 `行程已经开始或结束，无法修改`

### POST /api/trips/:id/start

标记行程出发（仅队长可操作）。`status` 从 1 -> 2。

- **Auth**: Yes (需要是队长)
- **Success 200**: `{"code":0, "message":"行程已出发", "data":{"started_at":"..."}}`

### POST /api/trips/:id/finish

标记行程结束（仅队长可操作）。`status` 从 2 -> 3。结束后给所有成员发放成长值：普通成员 200 点，队长额外 +100 点。

- **Auth**: Yes (需要是队长)
- **Success 200**:
  ```json
  {
    "code": 0,
    "message": "行程已结束",
    "data": { "finished_at": "...", "members_awarded": 3 }
  }
  ```

### DELETE /api/trips/:id

取消行程（仅队长可操作）。`status` -> 0。同时关闭关联的群聊会话。

- **Auth**: Yes (需要是队长)
- **Success 200**: `{"code":0, "message":"行程已取消"}`

### POST /api/trips/:id/join

申请加入行程。`status` 设为 1（申请中），等待队长审批。

- **Auth**: Yes
- **Success 200**: `{"code":0, "message":"申请已发送"}`
- **Errors**: 400 `行程不在招募中` / `已申请，等待队长审核` / `你已经是该行程的成员` / `车队已满`
- **备注**: 如果用户之前已退出或被移除(status=3/4)，可重新申请。

### POST /api/trips/:id/approve/:userId

队长审批通过申请。`status` 从 1 -> 2，同时将用户加入行程群聊并更新成员计数。

- **Auth**: Yes (需要是队长)
- **Path Params**: `id` -- 行程 ID, `userId` -- 被审批用户 ID
- **Success 200**: `{"code":0, "message":"已批准加入"}`

### POST /api/trips/:id/reject/:userId

队长拒绝申请。`status` -> 4 (removed)，`left_reason` = "rejected"。

- **Auth**: Yes (需要是队长)
- **Success 200**: `{"code":0, "message":"已拒绝申请"}`

### DELETE /api/trips/:id/members/:userId

队长移除活跃成员。`status` -> 4，`left_reason` = "kicked"。同时从群聊中移除。

- **Auth**: Yes (需要是队长)
- **Path Params**: `id` -- 行程 ID, `userId` -- 被移除用户 ID
- **Success 200**: `{"code":0, "message":"已移除成员"}`

### POST /api/trips/:id/leave

成员主动退出行程。`status` -> 3，`left_reason` = "leave"。同时从群聊中移除。

- **Auth**: Yes
- **Errors**: 400 `队长不能退出行程，请取消行程`

### GET /api/trips/:id/members

获取行程成员列表，包含每个成员的最后已知位置（来自 `users.last_position` 或 `location_records` 回退查询）。

- **Auth**: Yes
- **Success 200**: 成员数组，每人含 `last_position: {lng, lat, altitude, speed, direction, updateTime}`

---

### Next Trip (下一趟行程草稿)

草稿相关接口在 `/api/trips/next` 下，用于用户提前规划行程但暂不发布。

### POST /api/trips/next

创建行程草稿。

- **Auth**: Yes
- **Body**: `start_point` (JSON), `end_point` (JSON), `departure_time` (datetime)，至少填一项

### GET /api/trips/next

获取当前用户所有草稿列表（已删除的除外），按 `updated_at` 降序。

- **Auth**: Yes

### PUT /api/trips/next/:id

更新草稿。

- **Auth**: Yes (需要是草稿所有者)
- **Body**: `start_point`, `end_point`, `departure_time` (至少一个)

### DELETE /api/trips/next/:id

软删除草稿（`status` -> 0）。

- **Auth**: Yes (需要是草稿所有者)

### POST /api/trips/next/:id/publish

将草稿发布为正式行程。需草稿包含 `start_point`、`end_point`、`departure_time`，且用户已完成车主认证。发布后草稿 `status` -> 2（已发布）。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | title | string | 否 | 默认为 `起点名 -> 终点名` |
  | max_cars | number | 否 | 默认 4 |
  | waypoints | array | 否 | 途经点 |
  | route_data | object | 否 | 路线数据 |
  | tags | array | 否 | 标签 |
  | is_public | boolean | 否 | 默认 true |
- **Success 200**: `{"trip_id": 1, "session_id": 1, "draft_id": 1}`

---

## 聊天 / 消息 (Messages)

所有聊天相关接口在 `/api/messages` 路径下。消息路由同时包含标准聊天和地点聊天室功能。

### 会话类型说明

| type | 含义 |
|------|------|
| team_group | 车队群聊（自动创建于行程创建时） |
| private | 私聊 |
| location_room | 地点聊天室（关联 POI） |
| system | 系统消息 |

### GET /api/messages/sessions

获取当前用户的会话列表，分为 active 和 archived (已归档的地点聊天室)。

- **Auth**: Yes
- **Query Params**: `type` -- `all` / `team_group` / `private` / `location_room`
- **Success 200**:
  ```json
  {
    "code": 0,
    "data": {
      "active": [
        {
          "id": 1,
          "type": "team_group",
          "name": "京郊自驾",
          "avatar": "...",
          "trip_id": 1,
          "member_count": 3,
          "last_message": { "content": "出发!", "sender_id": 1, "time": "..." },
          "unread_count": 2,
          "is_muted": false,
          "created_at": "...",
          "updated_at": "..."
        }
      ],
      "archived": [ ... ]
    }
  }
  ```
- **备注**: 归档会话仅在 type 为 `location_room` 且 `is_active=0` 时出现。

### POST /api/messages/sessions/private

创建或获取私聊会话。若会话已存在则直接返回。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | target_user_id | number | 是 | 目标用户 ID |
- **Success 200**: `{"session":{...}, "target_user":{...}, "is_existing": false}`
- **私聊权限规则**:
  - 同一车队的成员：完全开放
  - 互相关注：完全开放
  - 单向关注：发起方限制 3 条消息（会插入系统提示消息）
  - 未关注：拒绝，提示 `关注后可发消息`
  - 存在屏蔽关系：拒绝
- **备注**: `is_limited` 字段标记是否受限（单向关注场景）。

### GET /api/messages/sessions/:id

获取会话详情和分页消息列表。

- **Auth**: Yes (需要是会话成员)
- **Query Params**: `page` (默认 1), `pageSize` (默认 50, 最大 100)
- **Success 200**: 含 `session` 信息 + `messages.list[]` + `messages.pagination`

### POST /api/messages/sessions/:id/messages

发送消息到会话。

- **Auth**: Yes (需要是会话成员)
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | type | string | 否 | 消息类型 `text`/`image`/`location`/`voice`/`system`，默认 text |
  | content | string | 是 | 消息内容 |
  | extra | object | 否 | 扩展数据 |
- **Success 200**: 返回消息对象，同时通过 WebSocket 广播给其他会话成员。
- **备注**: 发送消息后会自动更新 `chat_sessions.last_message` 和 `updated_at`，并对其他在线成员递增 `unread_count`（免打扰成员除外）。若为 `location_room` 类型，还会更新 `location_topics.total_messages`。

### GET /api/messages/unread

获取所有会话的总未读消息数。

- **Auth**: Yes
- **Success 200**: `{"code":0, "data":{"unread_count":5}}`

### POST /api/messages/sessions/:id/read

标记会话为已读（将 `unread_count` 重置为 0）。

- **Auth**: Yes

### POST /api/messages/sessions/:id/mute

设置会话免打扰。

- **Auth**: Yes

### DELETE /api/messages/sessions/:id/mute

取消会话免打扰。

- **Auth**: Yes

### POST /api/messages/sessions/:id/share

分享内容到会话（位置、拼团、交通事件）。消息类型为 `system`。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | share_type | string | 是 | `location` / `group_buy` / `traffic_event` |
  | share_data | object | 是 | 分享数据 |

---

### 地点聊天室 (Location Chat)

所有地点聊天室接口在 `/api/messages/location-topics` 下。

### POST /api/messages/location-topics

手动创建地点话题。若同一 `poi_id + topic_name` 已存在则直接加入（归档的自动复活）。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | poi_id | string | 是 | POI 唯一标识 |
  | poi_name | string | 是 | POI 名称 |
  | poi_location | object | 是 | `{lng, lat}` |
  | topic_name | string | 否 | 话题名称 |

### GET /api/messages/location-topics/nearby

获取附近地点话题（默认 20km 半径内）。按距离升序、在线人数降序排列。

- **Auth**: Optional
- **Query Params**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | lng | number | 是 | 经度 |
  | lat | number | 是 | 纬度 |
  | radius | number | 否 | 搜索半径(km)，默认 20 |

### GET /api/messages/location-topics/my

获取当前用户参与的所有地点话题列表（分 active/archived）。

- **Auth**: Yes

### GET /api/messages/location-topics/:id

获取话题详情。参与者可查看完整分页消息，非参与者仅看到前 3 条预览。

- **Auth**: Yes
- **备注**: 参与者调用时会自动递增 `online_count`。

### POST /api/messages/location-topics/:id/join

加入地点话题。

- **Auth**: Yes
- **备注**: 若话题已归档则自动复活。

### POST /api/messages/location-topics/:id/leave

离开地点话题（软离开，`left_at` 标记）。

- **Auth**: Yes

### POST /api/messages/location-topics/:id/follow

关注话题但不加入聊天（使用 `follows` 表 `follow_type=3`）。

- **Auth**: Yes

---

## 位置 (Location)

所有位置接口在 `/api/locations` 路径下。

### POST /api/locations/report

上报用户位置。数据写入 `location_records` 表，同时更新 `users.last_position`。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | lng | number | 是 | 经度 |
  | lat | number | 是 | 纬度 |
  | altitude | number | 否 | 海拔(m) |
  | speed | number | 否 | 速度(km/h) |
  | direction | number | 否 | 方向(度 0-360) |
  | accuracy | number | 否 | 精度(m) |
- **Success 200**:
  ```json
  { "code": 0, "message": "位置已上报", "data": { "recorded_at": "...", "auto_detach": null } }
  ```
- **自动脱队机制**: 如果用户在活跃行程中，系统会检查是否偏离路线 > 50km 持续 30 分钟，或超过 12 小时未更新位置。满足条件则自动移除成员（`left_reason: 'detour'` 或 `'timeout'`），并从群聊中移除。
- **备注**: 同时通过 WebSocket `location_update` 事件广播给车队成员。

### GET /api/locations/team

获取当前用户所在活跃车队的成员实时位置及与己方的距离。

- **Auth**: Yes
- **Success 200**:
  ```json
  {
    "code": 0,
    "data": {
      "trip_id": 1,
      "members": [
        { "user_id": 1, "nickname": "...", "lng": 116.4, "lat": 39.9, "distance_from_me": 0 },
        { "user_id": 2, "nickname": "...", "lng": 116.5, "lat": 39.95, "distance_from_me": 5.2 }
      ],
      "total": 2
    }
  }
  ```
- **Error**: 400 `您当前没有活跃的行程`

### GET /api/locations/nearby-teams

获取附近的车队和独立司机（默认 50km 半径）。

- **Auth**: Yes
- **Query Params**: `lng`, `lat` (必填), `radius` (可选 km, 默认 50)
- **Success 200**:
  ```json
  {
    "code": 0,
    "data": {
      "teams": [ { "trip_id": 1, "trip_name": "...", "leader_id": 1, "distance_km": 3.2, ... } ],
      "individual_drivers": [ { "user_id": 3, "nickname": "...", "vehicle_model": "...", "distance_km": 1.5, ... } ]
    }
  }
  ```
- **备注**: 仅展示 `can_be_discovered=1` 的车队队长和个体司机。独立司机仅返回最近 30 分钟内有位置更新的。

### GET /api/locations/map-data

聚合地图数据接口，返回天气、POI、车队、拼团、话题、安全设施的全量数据。

- **Auth**: Optional
- **Query Params**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | lng | number | 是 | 经度 |
  | lat | number | 是 | 纬度 |
  | zoom | number | 否 | 地图缩放级别，影响搜索半径 |
- **Success 200**:
  ```json
  {
    "code": 0,
    "data": {
      "center": { "lng": 116.4, "lat": 39.9 },
      "zoom": 12,
      "search_radius_m": 10000,
      "weather": { "province": "北京", "weather": "晴", "temperature": "28", ... },
      "pois": {
        "gas_station": [ ... ],
        "charging_station": [ ... ],
        "accommodation": [ ... ],
        "restaurant": [ ... ],
        "repair": [ ... ],
        "convenience": [ ... ],
        "hospital": [ ... ],
        "scenic": [ ... ],
        "camping": [ ... ],
        "toilet": [ ... ],
        "parking": [ ... ],
        "service_area": [ ... ],
        "police": [ ... ]
      },
      "nearby_teams": [ ... ],
      "nearby_group_buys": [ ... ],
      "nearby_topics": [ ... ],
      "traffic_events": { "list": [], "hint": "交通事件功能即将上线" },
      "safety": { "police_stations": [ ... ], "hospitals": [ ... ] }
    }
  }
  ```
- **备注**: 搜索半径根据 zoom 级别自动调整 (zoom>=16: 3km, >=14: 5km, >=12: 10km, >=10: 20km, <10: 50km)。所有 POI、车队、拼团、话题查询并行执行。

---

## 拼团 (Group Buy)

所有拼团接口在 `/api/group-buy` 路径下。

### GET /api/group-buy/products

获取拼团商品列表（分页）。支持按商家、关键词搜索，可按距离排序。

- **Auth**: No
- **Query Params**:
  | 参数 | 类型 | 默认 | 说明 |
  |------|------|------|------|
  | page | number | 1 | 页码 |
  | pageSize | number | 20 | 每页条数 |
  | merchant_id | number | -- | 商家 ID 筛选 |
  | keyword | string | -- | 商品名称搜索 |
  | lng | number | -- | 用于按距离排序的经度 |
  | lat | number | -- | 用于按距离排序的纬度 |
- **Success 200**: 分页响应，含商品信息、商家名称/评分/Logo/位置、距离(若传了坐标)。

### GET /api/group-buy/products/:id

获取商品详情，含全部阶梯价格和当前活跃活动数。

- **Auth**: No
- **Path Params**: `id` -- 商品 ID
- **Success 200**: 含 `price_tiers[]` (含每档节省金额), `active_activities_count`, 完整商家信息。

### POST /api/group-buy/activities

发起拼团活动。发起人自动成为参团者。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | product_id | number | 是 | 商品 ID |
  | target_count | number | 是 | 目标人数(须匹配 price_tier 的 count) |
  | trip_id | number | 否 | 关联行程 ID |
- **Success 200**:
  ```json
  {
    "code": 0,
    "data": {
      "activity_id": 1,
      "product_name": "酒店标准间",
      "target_count": 6,
      "current_count": 1,
      "current_price": 80,
      "original_price": 120,
      "savings": 40,
      "expire_at": "2026-07-31T...",
      "status": 1,
      "share_info": { "title": "...发起了拼团！", "image": "...", "link": "..." }
    }
  }
  ```

### GET /api/group-buy/activities/:id

获取拼团活动详情，含参与者列表、当前/下一阶梯价格、进度、剩余时间。

- **Auth**: Yes
- **Path Params**: `id` -- 活动 ID
- **Success 200**: 含 `product`, `merchant`, `participants[]`, `current_price_tier`, `next_price_tier`, `all_price_tiers[]`, `is_participant`, `remaining_seconds`, `progress`。

### POST /api/group-buy/activities/:id/join

参与拼团。加入后自动创建待支付订单，并发放 50 点同路值。

- **Auth**: Yes
- **Success 200**: 含 `participant_id`, `order` (含 `order_no`, `verification_code`), `activity_status`, `is_success`。
- **备注**: 若参与后达成目标人数，活动状态自动标记为 2(已成团)，并通知所有参与者。

### GET /api/group-buy/activities/my

获取当前用户参与的所有拼团活动（分页）。

- **Auth**: Yes
- **Query Params**: `page`, `pageSize`
- **Success 200**: 每条含 `is_initiator` 标记、进度、剩余时间。

### GET /api/group-buy/activities/:id/share

生成拼团活动分享数据（适用于微信分享卡片）。

- **Auth**: Yes
- **Success 200**: 含 `title`, `image`, `description`, `path`, `need_more`, `current_price`, `savings` 等分享结构数据。

---

## 订单 (Order)

所有订单接口在 `/api/orders` 路径下。

### 订单状态说明

| status | 含义 |
|--------|------|
| 0 | 待支付 |
| 1 | 已取消 |
| 2 | 已支付 |
| 3 | 已核销 |
| 4 | 已退款 |

### POST /api/orders

创建订单。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | product_id | number | 是 | 商品 ID |
  | activity_id | number | 是 | 拼团活动 ID |
  | coupon_id | number | 否 | 使用的优惠券 ID |
- **Success 200**: 返回 `order_no`, `pay_amount` (已扣除优惠券), `verification_code`, `coupon_amount`。
- **备注**: 优惠券校验包括面值、最低消费金额、商家匹配、过期检查。

### GET /api/orders

获取用户订单列表（分页）。可按状态筛选。

- **Auth**: Yes
- **Query Params**: `page`, `pageSize`, `status`

### GET /api/orders/merchant

获取商家订单列表（商家后台）。需提供 `merchant_id`。

- **Auth**: Yes
- **Query Params**: `merchant_id` (必填), `status`, `start_date`, `end_date`, `page`, `pageSize`

### GET /api/orders/verification-stats

获取商家核销统计数据。

- **Auth**: Yes
- **Query Params**: `merchant_id` (必填)
- **Success 200**: 含 `total_orders`, `total_amount`, `verified_count`, `verified_amount`, `today_verified`, `month_verified`, `unsettled_commission`。

### POST /api/orders/verify

核销订单。可通过 `order_no` 或 `verification_code` 查找订单，核销后自动触发分润。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | order_no | string | 二选一 | 订单号 |
  | verification_code | string | 二选一 | 核销码 |
- **Success 200**: 含 `split_info` (佣金率、佣金金额、商家结算金额)。

### GET /api/orders/:id

获取订单详情，含商品、商家、活动、优惠券、分润信息。

- **Auth**: Yes (仅订单所有者)

### POST /api/orders/:id/pay

发起支付（V1 MVP 直接模拟支付成功）。支付后扣减优惠券、更新活动参与人数、发放同路值。

- **Auth**: Yes (仅订单所有者)
- **备注**: 若活动参与人数达到目标，自动标记为已成团并给所有参与者发放同路值。

### POST /api/orders/:id/refund

申请退款。已核销的订单不可退款；已成团活动的订单退款需管理员审核。

- **Auth**: Yes (仅订单所有者)
- **Body**: `reason` (string, 可选)
- **Success 200**: 普通订单 `{"message":"退款成功"}`；已成团活动 `{"need_approval": true, "message":"退款申请已提交，等待审核"}`

### GET /api/orders/:id/verify-code

获取订单核销码及二维码数据。

- **Auth**: Yes (仅订单所有者)
- **备注**: 仅 `status=2` (已支付) 的订单可获取。

### POST /api/orders/:id/split-profit

手动触发分润计算。根据商家等级对应的佣金率计算佣金和商家结算金额。

- **Auth**: Yes
- **佣金率**:
  | 商家等级 | 佣金率 |
  |---------|--------|
  | 1 (初级) | 10% |
  | 2 (银牌) | 8% |
  | 3 (金牌) | 6% |
  | 4 (钻石) | 5% |
  | 5 (战略伙伴) | 3% |

---

## 优惠券 (Coupon)

所有优惠券接口在 `/api/coupons` 路径下。

### GET /api/coupons/my

获取当前用户的优惠券列表。调用时自动过期已过期券。

- **Auth**: Yes
- **Query Params**: `status` -- 0=不可用 1=可用 2=已使用 3=已过期

### GET /api/coupons/available

获取支付时可用的优惠券列表。

- **Auth**: Yes
- **Query Params**: `merchant_id` -- 筛选该商家的券（含平台通用券）

### POST /api/coupons/use

使用优惠券。标记券状态为已使用。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | coupon_id | number | 是 | 优惠券 ID |
  | order_amount | number | 是 | 订单金额 |
  | order_id | number | 否 | 订单 ID |
- **Success 200**: 含 `face_value`, `final_amount`, `saved`。

### POST /api/coupons/return

退还优惠券（退款时）。恢复券为可用状态，有效期延长 7 天。

- **Auth**: Yes
- **Body**: `coupon_id` (必填), `order_id` (可选)

### POST /api/coupons/issue

批量发放优惠券给指定用户。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | template_id | number | 是 | 券模板 ID |
  | user_ids | number[] | 是 | 用户 ID 数组 |
- **备注**: 检查模板库存，生成唯一券码 (`prefix + uuid`)。

### POST /api/coupons/invite-reward

发放邀请奖励优惠券。根据用户邀请人数匹配奖励阶梯，防重复领取。

- **Auth**: Yes
- **Success 200**: 含 `coupon_code`, `face_value`, `tier_count`。

### GET /api/coupons/templates

获取优惠券模板列表（管理端）。支持按类型、商家、状态筛选。

- **Auth**: Yes
- **Query Params**: `page`, `pageSize`, `type`, `merchant_id`, `status`

### POST /api/coupons/templates

创建优惠券模板（管理端）。

- **Auth**: Yes
- **Body**: `name`, `type` (`discount`/`full_reduction`/`free_shipping`/`cash`), `face_value`, `min_amount`, `total_quantity`, `valid_days`, `prefix`, `description`, `merchant_id`, `start_time`, `end_time`

### PUT /api/coupons/templates/:id

更新优惠券模板（管理端）。

- **Auth**: Yes

---

## 商家 (Merchant)

所有商家接口在 `/api/merchants` 路径下。

### POST /api/merchants/apply

提交商家入驻申请。

- **Auth**: Yes
- **Body**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | name | string | 是 | 商家名称 |
  | type | string | 是 | `hotel`/`restaurant`/`gas`/`repair`/`camping`/`shop` |
  | phone | string | 是 | 联系电话 |
  | address | string | 是 | 地址 |
  | location | object | 是 | `{lng, lat}` |
  | description | string | 是 | 商家描述 |
  | qualifications | array | 是 | 资质证明图片数组 |
  | service_scope | string | 否 | 服务范围 (维修/救援类必填) |
- **Success 200**: `{"merchant_id": 1, "message": "申请已提交，请等待审核"}`
- **备注**: 申请后 `status=0` (待审核)，管理员通过 `POST /api/admin/merchants/:id/review` 审核。

### GET /api/merchants/my

获取当前用户拥有的商家信息，含产品数、活跃拼团数、今日订单统计。

- **Auth**: Yes

### PUT /api/merchants/my

更新商家信息（仅审核通过的商家）。

- **Auth**: Yes
- **Body**: `name`, `logo`, `images`, `phone`, `address`, `location`, `business_hours`, `description`, `service_scope`

### GET /api/merchants/products

获取商家的商品列表（分页）。

- **Auth**: Yes

### POST /api/merchants/products

创建商品。

- **Auth**: Yes (商家审核通过后)
- **Body**: `name`, `original_price`, `price_tiers` (数组), `description`, `images`, `min_count`, `max_quantity`, `expiry_hours`

### PUT /api/merchants/products/:id

更新商品（仅无可进行中活动的商品）。

- **Auth**: Yes

### PUT /api/merchants/products/:id/toggle

上架/下架商品。

- **Auth**: Yes

### GET /api/merchants/orders

获取商家订单列表（分页，可筛选）。

- **Auth**: Yes
- **Query Params**: `page`, `pageSize`, `status`, `start_date`, `end_date`

### GET /api/merchants/settlements

获取商家结算记录（分页）。

- **Auth**: Yes
- **Query Params**: `page`, `pageSize`, `status`

### GET /api/merchants/level

获取商家等级信息，含各维度评分（响应速度、服务质量、销售额、用户评分）及对应佣金率。

- **Auth**: Yes

### PUT /api/merchants/settings/invite-coupon

切换是否提供邀请优惠券。

- **Auth**: Yes

### PUT /api/merchants/settings/reward-pool

切换是否加入奖励池。

- **Auth**: Yes

### GET /api/merchants/promotion-code

获取商家推广码及推广用户列表、推广带来的订单统计。

- **Auth**: Yes

### GET /api/merchants/repair-services

获取附近的维修/救援服务商家（默认 50km）。

- **Auth**: No
- **Query Params**: `lng`, `lat` (必填), `radius` (可选, km)

### GET /api/merchants/:id

获取商家公开详情，含活跃商品列表、评分分布。

- **Auth**: Optional
- **注意**: 此路由必须在所有命名路由之后注册，防止 `/:id` 拦截 `/products` 等路径。

---

## 管理员 (Admin)

所有管理员接口在 `/api/admin` 路径下。全部需要 auth + adminAuth 双重认证。管理员通过环境变量 `ADMIN_USER_IDS`（逗号分隔的 ID 列表）或数据库中 `users.is_admin=1` 标识。

### GET /api/admin/dashboard

管理面板统计数据。

- **Auth**: Yes + Admin
- **Success 200**: 含 `total_users`, `new_users_today`, `total_trips`, `active_trips`, `total_merchants`, `total_orders`, `today_revenue`, `total_revenue`, `pending_certifications`, `pending_merchants`, `pending_refunds`, `hourly_orders_today[]`, `daily_revenue_7days[]`。

### GET /api/admin/users

用户列表（分页，支持多条件筛选）。

- **Auth**: Yes + Admin
- **Query Params**: `page`, `pageSize`, `keyword`, `is_certified`, `level`, `status`, `start_date`, `end_date`

### GET /api/admin/users/:id

用户详情（管理视图），含邀请关系树、近期订单、近期行程、操作日志。

- **Auth**: Yes + Admin

### PUT /api/admin/users/:id/status

启用/禁用用户。

- **Auth**: Yes + Admin
- **Body**: `status` -- 0=禁用, 1=启用

### POST /api/admin/certifications/:userId/review

审核车主认证（通过/驳回）。

- **Auth**: Yes + Admin
- **Body**: `approved` (boolean), `reject_reason` (string, 驳回时使用)
- **备注**: 通过后 `is_certified` -> 2，发放 100 点同路值；驳回后 `is_certified` -> 0。

### GET /api/admin/merchants

商家列表（分页，支持多条件筛选）。

- **Auth**: Yes + Admin
- **Query Params**: `page`, `pageSize`, `type`, `level`, `status`, `keyword`

### POST /api/admin/merchants/:id/review

审核商家入驻申请（通过/驳回）。

- **Auth**: Yes + Admin
- **Body**: `approved` (boolean), `reject_reason` (string)

### PUT /api/admin/merchants/:id/level

调整商家等级和评分。

- **Auth**: Yes + Admin
- **Body**: `level` (1-5), `score` (>=0)

### GET /api/admin/orders

全部订单列表（分页，支持多条件筛选）。

- **Auth**: Yes + Admin
- **Query Params**: `page`, `pageSize`, `status`, `merchant_id`, `start_date`, `end_date`, `keyword`

### POST /api/admin/orders/:id/refund

处理退款申请（通过/拒绝）。

- **Auth**: Yes + Admin
- **Body**: `approved` (boolean), `reject_reason` (string)
- **备注**: 通过后恢复优惠券、递减拼团活动计数。

### GET /api/admin/group-buys

全部拼团活动列表。

- **Auth**: Yes + Admin
- **Query Params**: `page`, `pageSize`, `status`, `merchant_id`

### POST /api/admin/group-buys/:id/end

管理员强制结束拼团（成功/失败）。

- **Auth**: Yes + Admin
- **Body**: `action` -- `"success"` (强制成团，所有待支付订单标记已支付) 或 `"fail"` (强制失败，已支付订单自动退款)

### GET /api/admin/settlements

全部结算记录列表（分页）。

- **Auth**: Yes + Admin

### POST /api/admin/settlements/trigger

手动触发订单结算。

- **Auth**: Yes + Admin
- **Body**: `order_id` (必填)

### GET /api/admin/coupons

优惠券数据总览，含模板列表和整体统计（活跃模板数、总发行/使用/可用/过期数、总优惠金额）。

- **Auth**: Yes + Admin

### POST /api/admin/coupons/config

创建优惠券模板（管理端配置）。

- **Auth**: Yes + Admin
- **Body**: `name`, `type` (0=满减, 1=折扣, 2=商家券, 3=邀请券), `condition_amount`, `discount_amount`, `discount_percent`, `total_quantity`, `daily_limit`, `valid_days`, `start_date`, `end_date`, `merchant_id`, `description`

### GET /api/admin/invites

邀请统计数据，含总邀请数、邀请率、转化率、Top 20 邀请者、30 天每日趋势。

- **Auth**: Yes + Admin

### GET /api/admin/invites/rewards

邀请奖励发放记录列表（分页）。

- **Auth**: Yes + Admin
- **Query Params**: `page`, `pageSize`, `inviter_id`, `status`

### GET /api/admin/growth/config

获取当前同路值（成长值）配置：等级阈值和各项因子。

- **Auth**: Yes + Admin

### PUT /api/admin/growth/config

更新同路值等级阈值和因子权重。

- **Auth**: Yes + Admin
- **Body**: `factors` (object, 可选), `levels` (array, 可选)

### GET /api/admin/logs

操作日志列表（分页，支持按用户/操作类型/目标类型/日期筛选）。

- **Auth**: Yes + Admin
- **Query Params**: `page`, `pageSize`, `user_id`, `action`, `target_type`, `start_date`, `end_date`

### GET /api/admin/statistics

详细统计数据（支持 daily/weekly/monthly 周期），含注册、订单、活跃用户、行程趋势及当日前汇总。

- **Auth**: Yes + Admin
- **Query Params**: `period` -- `daily`/`weekly`/`monthly`

---

## 地图 (Map)

所有地图接口在 `/api/map` 路径下。

### GET /api/map/traffic-events

获取附近交通事件。

- **Auth**: Optional
- **Query Params**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | lng | number | 是 | 经度 |
  | lat | number | 是 | 纬度 |
  | radius | number | 否 | 搜索半径(km)，默认 50 |
- **Success 200**: 含 `overall_traffic_status`, `events[]` (事故/拥堵等信息), `road_status`。
- **备注**: V1 返回占位数据；若配置了高德地图 API Key，会实时拉取交通态势数据。

### GET /api/map/route-info

获取两点间路线规划信息。

- **Auth**: Optional
- **Query Params**:
  | 参数 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | origin_lng | number | 是 | 起点经度 |
  | origin_lat | number | 是 | 起点纬度 |
  | origin_name | string | 否 | 起点名称 |
  | dest_lng | number | 是 | 终点经度 |
  | dest_lat | number | 是 | 终点纬度 |
  | dest_name | string | 否 | 终点名称 |
  | waypoints | string | 否 | 途经点 JSON 数组 |
  | strategy | string | 否 | 策略: 0=最快 1=最短 2=避免高速 |
- **Success 200**: 含 `summary` (直线距离、道路距离、预计时间、预估过路费), `segments[]`, `bounding_box`。
- **备注**: V1 使用简化的 Haversine 计算；若配置了高德 API Key，会请求高德路线规划 API 获取精确路线。

---

## WebSocket

WebSocket 连接地址: `wss://api.coroad.cn/ws`

### 连接事件

| 类型 | 方向 | 说明 |
|------|------|------|
| `connected` | Server -> Client | 连接成功 |
| `auth` | Client -> Server | 发送 `{type:"auth", userId:1}` 认证 |
| `auth_ok` | Server -> Client | 认证成功确认 |
| `ping` / `pong` | 双向 | 心跳检测 |
| `location_update` | Server -> Client | 车队成员位置广播 `{user_id, lng, lat, speed, direction, time}` |
| `chat_message` | Server -> Client | 新消息广播 `{session_id, message}` |

### 心跳

服务器每 30 秒 ping 一次，无响应的连接会被终止。

---

## 通用接口

### GET /health

健康检查接口。

- **Auth**: No
- **Response**: `{"status":"ok", "timestamp":"...", "message":"Server is running"}`

### GET /

根路径，返回 API 版本和端点目录。

- **Auth**: No

---

## 认证机制

- 使用 JWT (HS256)，默认有效期 7 天
- Token 通过 HTTP Header `Authorization: Bearer <token>` 传递
- 中间件:
  - `auth`: 强制认证，无有效 token 返回 401
  - `optionalAuth`: 可选认证，有 token 则解析 userId，无 token 也放行
  - `requireCertified`: 车主认证检查，`is_certified !== 2` 返回 403

## 限流策略

| 限流器 | 窗口 | 最大请求 | 作用范围 |
|--------|------|---------|---------|
| globalLimiter | 1 分钟 | 200 | `/api/*` |
| authLimiter | 15 分钟 | 20 | `/api/auth/login`, `/api/auth/register` |
| smsLimiter | 1 分钟 | 1 | `/api/auth/send-code` |

此外，短信接口还内置了 Redis 级别的 per-phone 60 秒冷却，登录接口内置了 Redis 级别的防暴力破解（30分钟内最多5次失败，超出后锁定60分钟）。
