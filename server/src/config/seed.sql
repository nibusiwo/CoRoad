-- ============================================================
-- 同道 CoRoad 自驾社交平台 - 开发/测试种子数据
-- ============================================================
-- 运行方式: mysql -u root -p coroad < seed.sql
-- 注意: 请在 schema.sql 执行完毕后运行此脚本。
-- ============================================================

USE coroad;

-- ============================================================
-- 前置操作：补充字段（兼容性）
-- ============================================================

-- 若 users 表缺少 is_admin 列则添加（管理员标记）
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'coroad' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_admin');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN is_admin TINYINT DEFAULT 0 COMMENT ''是否管理员 0否 1是'' AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 1. 示例用户
-- ============================================================

-- 清除已有测试数据（仅清除种子导致的重复数据，生产慎用）
DELETE FROM users WHERE phone IN ('13800000001', '13800000002', '13800000003');

INSERT INTO `users` (`id`, `phone`, `nickname`, `avatar`, `gender`, `vehicle_model`, `plate_number`,
  `is_certified`, `growth_value`, `level`, `credit_score`, `total_distance`, `total_teams`,
  `total_group_buy`, `total_invites`, `can_be_discovered`, `is_admin`, `status`,
  `last_login_at`, `created_at`, `updated_at`)
VALUES
  (1, '13800000001', '系统管理员',        '/avatars/admin.png',        1, '特斯拉 Model Y',   '京A00001', 0, 6800,  6, 100, 35000, 12, 8,  10, 1, 1, 1, NOW(), NOW(), NOW()),
  (2, '13800000002', '川藏老司机张哥',     '/avatars/user2.png',        1, '丰田普拉多',       '川A88888', 2, 4200,  4, 98,  28000, 8,  5,  8,  1, 0, 1, NOW(), NOW(), NOW()),
  (3, '13800000003', '自驾小白',           '/avatars/user3.png',        2, NULL,                NULL,       0, 320,   1, 100, 1500,  1,  1,  2,  1, 0, 1, NOW(), NOW(), NOW());

-- 密码都是 "123456" 的 bcrypt hash（$2a$10$...）
-- 实际登录使用短信验证码，此处仅作为参考

-- ============================================================
-- 2. 示例行程
-- ============================================================

DELETE FROM trips WHERE id IN (1, 2);

INSERT INTO `trips` (`id`, `leader_id`, `title`, `start_point`, `end_point`, `waypoints`,
  `departure_time`, `estimated_days`, `daily_distance`, `depth`, `tags`,
  `max_cars`, `current_cars`, `max_members`, `current_members`, `is_public`, `status`,
  `created_at`, `updated_at`)
VALUES
  (
    1, 2,
    '川藏318经典路线',
    '{"name":"成都天府广场","lng":104.065735,"lat":30.657403}',
    '{"name":"拉萨布达拉宫","lng":91.117212,"lat":29.656981}',
    '[{"name":"康定","lng":101.962,"lat":30.001},{"name":"新都桥","lng":101.742,"lat":30.033},{"name":"理塘","lng":100.270,"lat":30.008},{"name":"巴塘","lng":99.105,"lat":30.005},{"name":"然乌湖","lng":96.772,"lat":29.251},{"name":"波密","lng":95.770,"lat":29.859},{"name":"林芝","lng":94.362,"lat":29.654}]',
    '2026-08-15 07:00:00', 10, 350, 3,
    '["拍照圣地","美食探索","AA住宿","越野挑战"]',
    5, 3, 20, 5, 1, 1,
    NOW(), NOW()
  ),
  (
    2, 2,
    '广州→大理自驾',
    '{"name":"广州塔","lng":113.324520,"lat":23.106474}',
    '{"name":"大理古城","lng":100.162476,"lat":25.693609}',
    '[{"name":"桂林","lng":110.290,"lat":25.274},{"name":"贵阳","lng":106.713,"lat":26.647},{"name":"昆明","lng":102.712,"lat":25.040},{"name":"丽江","lng":100.233,"lat":26.875}]',
    '2026-08-20 06:30:00', 7, 400, 2,
    '["风光摄影","民族风情","美食之旅"]',
    4, 2, 16, 4, 1, 1,
    NOW(), NOW()
  );

-- 行程成员
DELETE FROM trip_members WHERE trip_id IN (1, 2);

INSERT INTO `trip_members` (`trip_id`, `user_id`, `role`, `status`, `joined_at`)
VALUES
  -- 川藏318: 队长 user2 + 队员 user1, user3 加入
  (1, 2, 1, 2, '2026-07-20 10:00:00'),
  (1, 1, 2, 2, '2026-07-21 14:00:00'),
  (1, 3, 2, 2, '2026-07-22 09:00:00'),
  -- 广州→大理: 队长 user2 + 队员 user1
  (2, 2, 1, 2, '2026-07-25 08:00:00'),
  (2, 1, 2, 2, '2026-07-26 11:00:00');

-- ============================================================
-- 3. 示例商家
-- ============================================================

DELETE FROM merchants WHERE id IN (1, 2, 3, 4, 5);

INSERT INTO `merchants` (`id`, `owner_id`, `name`, `type`, `logo`, `images`, `phone`,
  `address`, `location`, `business_hours`, `description`, `qualifications`,
  `bank_account`, `level`, `level_score`, `total_sales`, `rating`,
  `can_provide_invite_coupon`, `can_join_reward_pool`, `service_scope`, `status`,
  `created_at`, `updated_at`)
VALUES
  (
    1, 1,
    '川藏加油站',
    'gas',
    '/uploads/merchants/gas_1.png',
    '["/uploads/merchants/gas_1_detail.jpg"]',
    '028-88881001',
    '四川省甘孜州康定市折多山318国道旁',
    '{"lng":101.962,"lat":30.001}',
    '{"open":"06:00","close":"23:00"}',
    '川藏线康定段最大的加油站，油品齐全，提供92#、95#、0#柴油。支持车队加油优惠。',
    '["/uploads/qualifications/gas_1.jpg"]',
    '{"bank":"建设银行","account":"6217000010000000001","name":"川藏加油站"}',
    3, 85, 1200, 4.6,
    0, 1, NULL, 1,
    NOW(), NOW()
  ),
  (
    2, 1,
    '318客栈',
    'hotel',
    '/uploads/merchants/hotel_1.png',
    '["/uploads/merchants/hotel_1_lobby.jpg","/uploads/merchants/hotel_1_room.jpg"]',
    '028-88881002',
    '四川省甘孜州新都桥镇318国道旁',
    '{"lng":101.742,"lat":30.033}',
    '{"open":"00:00","close":"23:59"}',
    '318国道上的精品客栈，提供干净舒适的客房、藏式餐饮和免费停车。车队入住可享团体优惠。',
    '["/uploads/qualifications/hotel_1.jpg"]',
    '{"bank":"农业银行","account":"6217000010000000002","name":"318客栈"}',
    4, 92, 800, 4.8,
    1, 1, NULL, 1,
    NOW(), NOW()
  ),
  (
    3, 1,
    '藏区美食城',
    'restaurant',
    '/uploads/merchants/food_1.png',
    '["/uploads/merchants/food_1_dishes.jpg"]',
    '028-88881003',
    '四川省甘孜州理塘县高城镇幸福路88号',
    '{"lng":100.270,"lat":30.008}',
    '{"open":"07:00","close":"22:00"}',
    '理塘最大的藏式餐饮城，提供正宗藏餐、川菜和特色牦牛肉火锅。食材新鲜，份量十足。',
    '["/uploads/qualifications/food_1.jpg"]',
    '{"bank":"工商银行","account":"6217000010000000003","name":"藏区美食城"}',
    3, 78, 2500, 4.5,
    0, 0, NULL, 1,
    NOW(), NOW()
  ),
  (
    4, 1,
    '高原维修站',
    'repair',
    '/uploads/merchants/repair_1.png',
    '["/uploads/merchants/repair_1_shop.jpg"]',
    '028-88881004',
    '西藏自治区昌都市芒康县318国道旁',
    '{"lng":98.583,"lat":29.675}',
    '{"open":"08:00","close":"20:00"}',
    '川藏线专业汽车维修站，可处理发动机、底盘、轮胎等常见故障。提供24小时救援服务。',
    '["/uploads/qualifications/repair_1.jpg"]',
    '{"bank":"中国银行","account":"6217000010000000004","name":"高原维修站"}',
    4, 90, 600, 4.7,
    0, 0,
    '{"repair":true,"rescue":true,"areas":["康定","理塘","巴塘","芒康","八宿","波密"]}',
    1,
    NOW(), NOW()
  ),
  (
    5, 1,
    '星空露营地',
    'camping',
    '/uploads/merchants/camping_1.png',
    '["/uploads/merchants/camping_1_view.jpg","/uploads/merchants/camping_1_tent.jpg"]',
    '028-88881005',
    '西藏自治区林芝市巴宜区鲁朗镇',
    '{"lng":94.362,"lat":29.654}',
    '{"open":"10:00","close":"23:00"}',
    '林芝鲁朗最美露营基地，背靠雪山，面朝花海。提供帐篷租赁、篝火晚会和星空观测设备。',
    '["/uploads/qualifications/camping_1.jpg"]',
    '{"bank":"邮政储蓄","account":"6217000010000000005","name":"星空露营地"}',
    2, 65, 400, 4.4,
    0, 0, NULL, 1,
    NOW(), NOW()
  );

-- ============================================================
-- 4. 示例拼团商品（每个商家1个）
-- ============================================================

DELETE FROM group_buy_products WHERE id IN (1, 2, 3, 4, 5);

INSERT INTO `group_buy_products` (`id`, `merchant_id`, `name`, `images`, `original_price`,
  `description`, `price_tiers`, `max_quantity`, `expiry_hours`, `min_count`, `current_count`, `status`,
  `created_at`, `updated_at`)
VALUES
  (
    1, 1,
    '92#汽油团购加油卡（100L）',
    '["/uploads/products/gas_card.jpg"]',
    850.00,
    '100升92#汽油团购加油卡，适用于川藏加油站所有站点。拼团越多越便宜！',
    '[{"count":3,"price":800,"discount":0.94},{"count":5,"price":765,"discount":0.90},{"count":10,"price":722,"discount":0.85}]',
    50, 24, 3, 0, 1,
    NOW(), NOW()
  ),
  (
    2, 2,
    '标准双人间（含双早）',
    '["/uploads/products/hotel_room.jpg"]',
    288.00,
    '318客栈标准双人间一晚，含双份藏式早餐。干净舒适，24小时热水，WiFi覆盖。',
    '[{"count":3,"price":258,"discount":0.90},{"count":5,"price":230,"discount":0.80},{"count":8,"price":200,"discount":0.70}]',
    30, 24, 3, 0, 1,
    NOW(), NOW()
  ),
  (
    3, 3,
    '藏式牦牛肉火锅（4人餐）',
    '["/uploads/products/hotpot.jpg"]',
    388.00,
    '正宗藏式牦牛肉火锅，4人份。含牦牛肉1斤、高原菌菇拼盘、青稞饼4份、酥油茶一壶。',
    '[{"count":3,"price":350,"discount":0.90},{"count":5,"price":310,"discount":0.80},{"count":10,"price":271,"discount":0.70}]',
    40, 24, 3, 0, 1,
    NOW(), NOW()
  ),
  (
    4, 4,
    '全车安全检查+机油更换（SUV/越野）',
    '["/uploads/products/repair_check.jpg"]',
    599.00,
    'SUV/越野车全车安全检查套餐：包含底盘检查、轮胎检测、刹车系统检查、机油更换（含机油滤芯）。适用于川藏线长途。',
    '[{"count":3,"price":540,"discount":0.90},{"count":5,"price":480,"discount":0.80},{"count":8,"price":419,"discount":0.70}]',
    20, 24, 3, 0, 1,
    NOW(), NOW()
  ),
  (
    5, 5,
    '星空营地双人帐篷套装（含装备）',
    '["/uploads/products/camping_set.jpg"]',
    198.00,
    '双人帐篷一晚：含专业登山帐篷、防潮垫、睡袋x2、露营灯、篝火免费使用。观星设备可租赁。',
    '[{"count":3,"price":178,"discount":0.90},{"count":5,"price":158,"discount":0.80},{"count":10,"price":138,"discount":0.70}]',
    30, 24, 3, 0, 1,
    NOW(), NOW()
  );

-- ============================================================
-- 5. 示例券模板
-- ============================================================

DELETE FROM coupon_templates WHERE id IN (1, 2, 3);

INSERT INTO `coupon_templates` (`id`, `name`, `type`, `face_value`, `min_amount`,
  `merchant_id`, `total_quantity`, `issued_quantity`, `valid_days`, `description`, `status`,
  `created_at`, `updated_at`)
VALUES
  (
    1,
    '新人20元邀请券',
    'invite',
    20.00,
    0.00,
    NULL,
    10000, 0, 30,
    '邀请新用户注册即可获得20元无门槛优惠券。适用于平台所有商家拼团商品。',
    1,
    NOW(), NOW()
  ),
  (
    2,
    '平台50元通用券',
    'platform',
    50.00,
    200.00,
    NULL,
    5000, 0, 90,
    '平台发放的50元优惠券，满200元可用。适用于全部拼团商品，不可与其他券叠加使用。',
    1,
    NOW(), NOW()
  ),
  (
    3,
    '商家10元立减券',
    'merchant',
    10.00,
    50.00,
    2,
    2000, 0, 60,
    '318客栈专属10元优惠券，消费满50元可用。本券由318客栈提供，仅限该商家使用。',
    1,
    NOW(), NOW()
  );

-- ============================================================
-- 6. 示例用户券（分发给测试用户）
-- ============================================================

DELETE FROM user_coupons WHERE id IN (1, 2, 3, 4);

INSERT INTO `user_coupons` (`id`, `user_id`, `template_id`, `coupon_code`,
  `status`, `expire_at`, `source`, `created_at`)
VALUES
  (1, 3, 1, 'NEWUSER20260801001', 1, '2026-08-30 23:59:59', 'invite', NOW()),
  (2, 1, 2, 'PLATFORM20260730001', 1, '2026-10-28 23:59:59', 'platform', NOW()),
  (3, 2, 2, 'PLATFORM20260730002', 1, '2026-10-28 23:59:59', 'platform', NOW()),
  (4, 2, 3, 'MERCHANT20260730001', 1, '2026-09-28 23:59:59', 'merchant', NOW());

-- ============================================================
-- 7. 勋章定义（INSERT IGNORE — schema.sql 已包含 8 条基础勋章）
-- ============================================================

INSERT IGNORE INTO `badges` (`name`, `icon`, `description`, `type`, `condition_json`) VALUES
('初次上路', 'first_trip', '完成第一次行程', 'trip', '{"trip_count": 1}'),
('百里行者', 'hundred_km', '累计行驶100km', 'distance', '{"total_distance": 100}'),
('千里马', 'thousand_km', '累计行驶1000km', 'distance', '{"total_distance": 1000}'),
('万里长征', 'ten_thousand_km', '累计行驶10000km', 'distance', '{"total_distance": 10000}'),
('老司机', 'old_driver', '完成10次行程', 'trip', '{"trip_count": 10}'),
('车队领袖', 'team_leader', '带领过5次车队', 'trip', '{"leader_count": 5}'),
('社交达人', 'social', '邀请10位好友', 'invite', '{"invite_count": 10}'),
('省钱能手', 'saver', '参与10次拼团', 'group_buy', '{"group_buy_count": 10}');

-- ============================================================
-- 8. 示例用户勋章（已获得的）
-- ============================================================

DELETE FROM user_badges WHERE id BETWEEN 1 AND 6;

INSERT INTO `user_badges` (`id`, `user_id`, `badge_id`, `earned_at`) VALUES
  (1, 2, 1, '2026-01-15 10:00:00'),   -- 初次上路
  (2, 2, 2, '2026-02-10 08:00:00'),   -- 百里行者
  (3, 2, 3, '2026-04-20 12:00:00'),   -- 千里马
  (4, 2, 4, '2026-07-01 16:00:00'),   -- 万里长征
  (5, 2, 5, '2026-06-15 09:00:00'),   -- 老司机
  (6, 2, 6, '2026-07-15 14:00:00');   -- 车队领袖

-- ============================================================
-- 9. 示例聊天会话（车队群聊）
-- ============================================================

DELETE FROM chat_sessions WHERE id IN (1, 2);

INSERT INTO `chat_sessions` (`id`, `type`, `name`, `avatar`, `trip_id`, `creator_id`,
  `member_count`, `auto_created`, `is_active`, `created_at`, `updated_at`)
VALUES
  (1, 'team_group', '川藏318车队群', '/uploads/groups/trip1.png', 1, 2, 5, 1, 1, NOW(), NOW()),
  (2, 'team_group', '广州→大理车队群', '/uploads/groups/trip2.png', 2, 2, 4, 1, 1, NOW(), NOW());

DELETE FROM chat_session_members WHERE session_id IN (1, 2);

INSERT INTO `chat_session_members` (`session_id`, `user_id`, `joined_at`) VALUES
  (1, 1, NOW()), (1, 2, NOW()), (1, 3, NOW()),
  (2, 1, NOW()), (2, 2, NOW());

-- ============================================================
-- 10. 示例邀请关系
-- ============================================================

DELETE FROM user_invites WHERE id IN (1, 2);

INSERT INTO `user_invites` (`id`, `inviter_id`, `invitee_id`, `bind_type`, `reward_claimed`, `created_at`) VALUES
  (1, 1, 3, 2, 1, '2026-07-20 10:00:00'),
  (2, 2, 1, 1, 1, '2026-01-10 08:00:00');

-- ============================================================
-- 完成
-- ============================================================
SELECT 'Seed data loaded successfully!' AS message;
SELECT COUNT(*) AS user_count FROM users;
SELECT COUNT(*) AS trip_count FROM trips;
SELECT COUNT(*) AS merchant_count FROM merchants;
SELECT COUNT(*) AS product_count FROM group_buy_products;
SELECT COUNT(*) AS coupon_template_count FROM coupon_templates;
