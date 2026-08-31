-- ============================================================
-- 同道 CoRoad 自驾社交平台 - 数据库初始化脚本
-- ============================================================

CREATE DATABASE IF NOT EXISTS coroad DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE coroad;

-- ============================================================
-- 用户系统
-- ============================================================

-- 用户表
CREATE TABLE `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `wx_openid` VARCHAR(64) DEFAULT NULL COMMENT '微信OpenID',
  `wx_unionid` VARCHAR(64) DEFAULT NULL COMMENT '微信UnionID',
  `phone` VARCHAR(20) DEFAULT NULL COMMENT '手机号',
  `nickname` VARCHAR(50) DEFAULT NULL COMMENT '昵称',
  `avatar` VARCHAR(500) DEFAULT NULL COMMENT '头像URL',
  `gender` TINYINT DEFAULT 0 COMMENT '性别 0未知 1男 2女',
  `vehicle_model` VARCHAR(100) DEFAULT NULL COMMENT '车型',
  `plate_number` VARCHAR(20) DEFAULT NULL COMMENT '车牌号',
  `signature` VARCHAR(200) DEFAULT NULL COMMENT '个性签名',
  `is_certified` TINYINT DEFAULT 0 COMMENT '是否车主认证 0否 1审核中 2已认证',
  `certification_data` JSON DEFAULT NULL COMMENT '认证数据(行驶证/人脸)',
  `growth_value` INT DEFAULT 0 COMMENT '同路值',
  `level` TINYINT DEFAULT 0 COMMENT '等级 0-6',
  `credit_score` INT DEFAULT 100 COMMENT '信用分 0-100',
  `total_distance` BIGINT DEFAULT 0 COMMENT '累计驾驶里程(km)',
  `total_teams` INT DEFAULT 0 COMMENT '累计组队次数',
  `total_group_buy` INT DEFAULT 0 COMMENT '累计拼团次数',
  `total_invites` INT DEFAULT 0 COMMENT '累计邀请人数',
  `can_be_discovered` TINYINT DEFAULT 1 COMMENT '是否可被其他车队发现 0否 1是',
  `status` TINYINT DEFAULT 1 COMMENT '状态 1正常 0禁用',
  `last_position` JSON DEFAULT NULL COMMENT '最后位置 {lng, lat, altitude, updateTime}',
  `last_login_at` DATETIME DEFAULT NULL COMMENT '最后登录时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wx_openid` (`wx_openid`),
  UNIQUE KEY `uk_phone` (`phone`),
  KEY `idx_level` (`level`),
  KEY `idx_certified` (`is_certified`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 用户邀请关系表
CREATE TABLE `user_invites` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `inviter_id` BIGINT UNSIGNED NOT NULL COMMENT '邀请人ID',
  `invitee_id` BIGINT UNSIGNED NOT NULL COMMENT '被邀请人ID',
  `bind_type` TINYINT NOT NULL COMMENT '绑定方式 1链接 2二维码 3手机号补填',
  `reward_claimed` TINYINT DEFAULT 0 COMMENT '是否已发放奖励 0未发放 1已发放',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invitee` (`invitee_id`),
  KEY `idx_inviter` (`inviter_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户邀请关系表';

-- ============================================================
-- 行程系统
-- ============================================================

-- 行程表
CREATE TABLE `trips` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `leader_id` BIGINT UNSIGNED NOT NULL COMMENT '队长ID',
  `title` VARCHAR(100) NOT NULL COMMENT '行程标题',
  `start_point` JSON NOT NULL COMMENT '起点 {name, lng, lat}',
  `end_point` JSON NOT NULL COMMENT '终点 {name, lng, lat}',
  `waypoints` JSON DEFAULT NULL COMMENT '途经点 [{name, lng, lat}]',
  `route_data` JSON DEFAULT NULL COMMENT '路线数据(高德路线规划结果)',
  `departure_time` DATETIME NOT NULL COMMENT '出发时间',
  `estimated_days` INT DEFAULT 1 COMMENT '预计天数',
  `daily_distance` INT DEFAULT NULL COMMENT '每日里程(km)',
  `depth` TINYINT DEFAULT 1 COMMENT '同路深度 1浅(仅同行) 2中(AA) 3深(全程)',
  `tags` JSON DEFAULT NULL COMMENT '标签 ["拍照","美食","AA住"]',
  `max_cars` INT DEFAULT 4 COMMENT '最大车数 1-20',
  `current_cars` INT DEFAULT 1 COMMENT '当前车数',
  `max_members` INT DEFAULT 20 COMMENT '最大人数',
  `current_members` INT DEFAULT 1 COMMENT '当前人数',
  `is_public` TINYINT DEFAULT 1 COMMENT '是否公开 0否 1是',
  `status` TINYINT DEFAULT 1 COMMENT '状态 1招募中 2已出发 3已结束 0已取消',
  `started_at` DATETIME DEFAULT NULL COMMENT '实际出发时间',
  `finished_at` DATETIME DEFAULT NULL COMMENT '实际结束时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_leader` (`leader_id`),
  KEY `idx_departure` (`departure_time`),
  KEY `idx_status` (`status`),
  KEY `idx_status_created_id` (`status`, `created_at`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='行程表';

-- 行程成员表
CREATE TABLE `trip_members` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `trip_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role` TINYINT DEFAULT 2 COMMENT '角色 1队长 2队员',
  `status` TINYINT DEFAULT 1 COMMENT '状态 1申请中 2已加入 3已退出 4被移除',
  `joined_at` DATETIME DEFAULT NULL COMMENT '加入时间',
  `left_at` DATETIME DEFAULT NULL COMMENT '退出时间',
  `left_reason` VARCHAR(50) DEFAULT NULL COMMENT '退出原因: leave/kicked/detour/timeout',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_trip_user` (`trip_id`, `user_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_user_status_trip` (`user_id`, `status`, `trip_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='行程成员表';

-- 下一趟行程草稿表
CREATE TABLE `next_trip_drafts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `start_point` JSON DEFAULT NULL COMMENT '起点',
  `end_point` JSON DEFAULT NULL COMMENT '终点',
  `departure_time` DATETIME DEFAULT NULL COMMENT '预计出发时间',
  `status` TINYINT DEFAULT 1 COMMENT '1草稿 2已发布 0已删除',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='下一趟行程草稿表';

-- ============================================================
-- 位置上报
-- ============================================================

CREATE TABLE `location_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `lng` DOUBLE NOT NULL COMMENT '经度',
  `lat` DOUBLE NOT NULL COMMENT '纬度',
  `altitude` DOUBLE DEFAULT NULL COMMENT '海拔(m)',
  `speed` DOUBLE DEFAULT NULL COMMENT '速度(km/h)',
  `direction` DOUBLE DEFAULT NULL COMMENT '方向(° 0-360)',
  `accuracy` DOUBLE DEFAULT NULL COMMENT '精度(m)',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_time` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='位置上报记录表';

-- ============================================================
-- 社交系统
-- ============================================================

-- 关注关系表
CREATE TABLE `follows` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `follower_id` BIGINT UNSIGNED NOT NULL COMMENT '关注者ID',
  `followee_id` BIGINT UNSIGNED NOT NULL COMMENT '被关注者ID',
  `follow_type` TINYINT DEFAULT 1 COMMENT '关注类型 1用户 2车队',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_follow` (`follower_id`, `followee_id`, `follow_type`),
  KEY `idx_followee` (`followee_id`, `follow_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='关注关系表';

-- 聊天会话表（群聊/私聊统一管理）
CREATE TABLE `chat_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(20) NOT NULL COMMENT '类型: team_group/private/location_room/system',
  `name` VARCHAR(100) DEFAULT NULL COMMENT '会话名称',
  `avatar` VARCHAR(500) DEFAULT NULL COMMENT '会话头像',
  `trip_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '关联行程ID(车队群聊)',
  `poi_id` VARCHAR(100) DEFAULT NULL COMMENT '关联POI ID(地点聊天室)',
  `poi_name` VARCHAR(200) DEFAULT NULL COMMENT 'POI名称',
  `poi_location` JSON DEFAULT NULL COMMENT 'POI位置 {lng, lat}',
  `creator_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '创建者ID',
  `member_count` INT DEFAULT 0 COMMENT '成员数',
  `last_message` JSON DEFAULT NULL COMMENT '最后一条消息 {content, sender_id, time}',
  `is_active` TINYINT DEFAULT 1 COMMENT '是否活跃 0已归档 1活跃中',
  `auto_created` TINYINT DEFAULT 0 COMMENT '是否系统自动创建 0否 1是',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_trip` (`trip_id`),
  KEY `idx_poi` (`poi_id`),
  KEY `idx_type_active` (`type`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天会话表';

-- 聊天会话成员表
CREATE TABLE `chat_session_members` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `unread_count` INT DEFAULT 0 COMMENT '未读消息数',
  `is_muted` TINYINT DEFAULT 0 COMMENT '是否免打扰',
  `joined_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `left_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session_user` (`session_id`, `user_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天会话成员表';

-- 聊天消息表
CREATE TABLE `chat_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `sender_id` BIGINT UNSIGNED NOT NULL,
  `type` VARCHAR(20) DEFAULT 'text' COMMENT '消息类型: text/image/location/voice/system',
  `content` TEXT COMMENT '消息内容',
  `extra` JSON DEFAULT NULL COMMENT '额外数据',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_session_time` (`session_id`, `created_at`),
  KEY `idx_sender` (`sender_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='聊天消息表';

-- ============================================================
-- 地点聊天室
-- ============================================================

CREATE TABLE `location_topics` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `poi_id` VARCHAR(100) NOT NULL COMMENT 'POI唯一标识',
  `poi_name` VARCHAR(200) NOT NULL COMMENT 'POI名称',
  `poi_location` JSON NOT NULL COMMENT 'POI位置 {lng, lat}',
  `topic_name` VARCHAR(200) DEFAULT NULL COMMENT '话题名称',
  `session_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '关联聊天会话ID',
  `creator_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '创建者ID',
  `create_type` VARCHAR(20) DEFAULT 'user' COMMENT '创建方式: user/event/platform',
  `event_type` VARCHAR(50) DEFAULT NULL COMMENT '事件类型(如 traffic_accident/road_work)',
  `online_count` INT DEFAULT 0 COMMENT '当前在线人数',
  `total_messages` INT DEFAULT 0 COMMENT '总消息数',
  `status` VARCHAR(20) DEFAULT 'active' COMMENT '状态: active/quiet/archived',
  `last_message_at` DATETIME DEFAULT NULL COMMENT '最后消息时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_poi_topic` (`poi_id`, `topic_name`),
  KEY `idx_poi` (`poi_id`),
  KEY `idx_status` (`status`),
  KEY `idx_location` ((CAST(JSON_EXTRACT(poi_location, '$.lng') AS DOUBLE)), (CAST(JSON_EXTRACT(poi_location, '$.lat') AS DOUBLE)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='地点聊天室话题表';

-- ============================================================
-- 拼团系统
-- ============================================================

-- 商家表
CREATE TABLE `merchants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_id` BIGINT UNSIGNED NOT NULL COMMENT '商家拥有者ID',
  `name` VARCHAR(100) NOT NULL COMMENT '商家名称',
  `type` VARCHAR(50) NOT NULL COMMENT '类型: hotel/restaurant/gas/repair/camping/shop',
  `logo` VARCHAR(500) DEFAULT NULL COMMENT 'Logo URL',
  `images` JSON DEFAULT NULL COMMENT '商家图片',
  `phone` VARCHAR(20) DEFAULT NULL COMMENT '联系电话',
  `address` VARCHAR(300) DEFAULT NULL COMMENT '地址',
  `location` JSON NOT NULL COMMENT '位置 {lng, lat}',
  `business_hours` JSON DEFAULT NULL COMMENT '营业时间 {open:"08:00", close:"22:00"}',
  `description` TEXT COMMENT '商家描述',
  `qualifications` JSON DEFAULT NULL COMMENT '资质证明',
  `bank_account` JSON DEFAULT NULL COMMENT '结算银行卡 {bank, account, name}',
  `level` TINYINT DEFAULT 1 COMMENT '商家等级 1-5',
  `level_score` INT DEFAULT 0 COMMENT '等级评分',
  `total_sales` INT DEFAULT 0 COMMENT '累计销量',
  `rating` DECIMAL(2,1) DEFAULT 5.0 COMMENT '评分 1.0-5.0',
  `can_provide_invite_coupon` TINYINT DEFAULT 0 COMMENT '是否提供拉新券',
  `can_join_reward_pool` TINYINT DEFAULT 0 COMMENT '是否加入奖励池',
  `service_scope` JSON DEFAULT NULL COMMENT '修车救援服务范围 {repair:true, rescue:true, areas:[...]}',
  `status` TINYINT DEFAULT 1 COMMENT '审核状态 0待审 1已通过 2已拒绝 3禁用',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`),
  KEY `idx_level` (`level`),
  KEY `idx_status` (`status`),
  KEY `idx_location` ((CAST(JSON_EXTRACT(location, '$.lng') AS DOUBLE)), (CAST(JSON_EXTRACT(location, '$.lat') AS DOUBLE)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='商家表';

-- 拼团商品表
CREATE TABLE `group_buy_products` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `merchant_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(200) NOT NULL COMMENT '商品名称',
  `images` JSON DEFAULT NULL COMMENT '商品图片',
  `original_price` DECIMAL(10,2) NOT NULL COMMENT '原价',
  `description` TEXT COMMENT '商品描述',
  `price_tiers` JSON NOT NULL COMMENT '阶梯价格 [{count:3, price:90, discount:0.9}, {count:6, price:80, discount:0.8}]',
  `max_quantity` INT DEFAULT 50 COMMENT '最大可拼数量',
  `expiry_hours` INT DEFAULT 24 COMMENT '拼团有效期(小时)',
  `min_count` INT DEFAULT 1 COMMENT '最低成团人数',
  `current_count` INT DEFAULT 0 COMMENT '当前参团人数',
  `status` TINYINT DEFAULT 1 COMMENT '状态 1上架 0下架',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_merchant` (`merchant_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼团商品表';

-- 拼团活动表
CREATE TABLE `group_buy_activities` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `initiator_id` BIGINT UNSIGNED NOT NULL COMMENT '发起人ID',
  `trip_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '关联行程ID',
  `target_count` INT NOT NULL COMMENT '目标人数',
  `current_count` INT DEFAULT 1 COMMENT '当前人数',
  `status` TINYINT DEFAULT 1 COMMENT '状态 1进行中 2已成团 3已失败 4已核销',
  `expire_at` DATETIME NOT NULL COMMENT '过期时间',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_product` (`product_id`),
  KEY `idx_initiator` (`initiator_id`),
  KEY `idx_status_expire` (`status`, `expire_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼团活动表';

-- 拼团参与者表
CREATE TABLE `group_buy_participants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `activity_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `order_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '关联订单ID',
  `status` TINYINT DEFAULT 1 COMMENT '状态 1已参团 2已退出',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_activity_user` (`activity_id`, `user_id`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼团参与者表';

-- ============================================================
-- 支付与订单系统
-- ============================================================

-- 订单表
CREATE TABLE `orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no` VARCHAR(32) NOT NULL COMMENT '订单号',
  `user_id` BIGINT UNSIGNED NOT NULL,
  `merchant_id` BIGINT UNSIGNED NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `activity_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '拼团活动ID',
  `original_amount` DECIMAL(10,2) NOT NULL COMMENT '原价',
  `discount_amount` DECIMAL(10,2) DEFAULT 0 COMMENT '优惠金额(券)',
  `pay_amount` DECIMAL(10,2) NOT NULL COMMENT '实付金额',
  `coupon_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '使用的券ID',
  `status` TINYINT DEFAULT 1 COMMENT '状态 1待支付 2已支付 3已核销 4已退款 5已取消',
  `paid_at` DATETIME DEFAULT NULL COMMENT '支付时间',
  `verified_at` DATETIME DEFAULT NULL COMMENT '核销时间',
  `refunded_at` DATETIME DEFAULT NULL COMMENT '退款时间',
  `verification_code` VARCHAR(20) DEFAULT NULL COMMENT '核销码',
  `wx_transaction_id` VARCHAR(64) DEFAULT NULL COMMENT '微信交易号',
  `split_status` TINYINT DEFAULT 0 COMMENT '分账状态 0未分账 1分账中 2已分账',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_user` (`user_id`),
  KEY `idx_merchant` (`merchant_id`),
  KEY `idx_activity` (`activity_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表';

-- ============================================================
-- 券系统
-- ============================================================

-- 券模板表
CREATE TABLE `coupon_templates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL COMMENT '券名称',
  `type` VARCHAR(30) NOT NULL COMMENT '券类型: invite/platform/merchant/reward',
  `face_value` DECIMAL(10,2) NOT NULL COMMENT '面额',
  `min_amount` DECIMAL(10,2) DEFAULT 0 COMMENT '最低消费金额',
  `merchant_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '关联商家ID(商家券)',
  `total_quantity` INT DEFAULT NULL COMMENT '总发行量(NULL不限)',
  `issued_quantity` INT DEFAULT 0 COMMENT '已发行数量',
  `valid_days` INT DEFAULT 30 COMMENT '有效天数',
  `description` VARCHAR(500) DEFAULT NULL COMMENT '使用说明',
  `status` TINYINT DEFAULT 1 COMMENT '状态 1启用 0禁用',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`),
  KEY `idx_merchant` (`merchant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='券模板表';

-- 用户券表
CREATE TABLE `user_coupons` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `template_id` BIGINT UNSIGNED NOT NULL,
  `coupon_code` VARCHAR(32) NOT NULL COMMENT '券码',
  `status` TINYINT DEFAULT 1 COMMENT '状态 1未使用 2已使用 3已过期',
  `used_at` DATETIME DEFAULT NULL COMMENT '使用时间',
  `used_order_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '使用订单ID',
  `expire_at` DATETIME NOT NULL COMMENT '过期时间',
  `source` VARCHAR(30) DEFAULT NULL COMMENT '来源: invite/platform/merchant/reward',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`coupon_code`),
  KEY `idx_user_status` (`user_id`, `status`),
  KEY `idx_template` (`template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户券表';

-- ============================================================
-- 勋章系统
-- ============================================================

-- 勋章定义表
CREATE TABLE `badges` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL COMMENT '勋章名称',
  `icon` VARCHAR(500) DEFAULT NULL COMMENT '勋章图标',
  `description` VARCHAR(200) DEFAULT NULL COMMENT '获取条件描述',
  `type` VARCHAR(30) NOT NULL COMMENT '类型: distance/trip/invite/group_buy/special',
  `condition_json` JSON NOT NULL COMMENT '获取条件 {key: value}',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='勋章定义表';

-- 用户勋章表
CREATE TABLE `user_badges` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `badge_id` BIGINT UNSIGNED NOT NULL,
  `earned_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_badge` (`user_id`, `badge_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户勋章表';

-- ============================================================
-- 操作日志
-- ============================================================

CREATE TABLE `operation_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED DEFAULT NULL,
  `action` VARCHAR(50) NOT NULL COMMENT '操作类型',
  `target_type` VARCHAR(30) DEFAULT NULL COMMENT '目标类型',
  `target_id` VARCHAR(50) DEFAULT NULL COMMENT '目标ID',
  `detail` JSON DEFAULT NULL COMMENT '详情',
  `ip` VARCHAR(50) DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_time` (`user_id`, `created_at`),
  KEY `idx_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志表';

-- ============================================================
-- 初始数据：默认勋章
-- ============================================================

INSERT INTO `badges` (`name`, `icon`, `description`, `type`, `condition_json`) VALUES
('初次上路', 'first_trip', '完成第一次行程', 'trip', '{"trip_count": 1}'),
('百里行者', 'hundred_km', '累计行驶100km', 'distance', '{"total_distance": 100}'),
('千里马', 'thousand_km', '累计行驶1000km', 'distance', '{"total_distance": 1000}'),
('万里长征', 'ten_thousand_km', '累计行驶10000km', 'distance', '{"total_distance": 10000}'),
('老司机', 'old_driver', '完成10次行程', 'trip', '{"trip_count": 10}'),
('车队领袖', 'team_leader', '带领过5次车队', 'trip', '{"leader_count": 5}'),
('社交达人', 'social', '邀请10位好友', 'invite', '{"invite_count": 10}'),
('省钱能手', 'saver', '参与10次拼团', 'group_buy', '{"group_buy_count": 10}');
