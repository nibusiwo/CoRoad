-- 账号安全 + 哨兵模式

ALTER TABLE `users`
  ADD COLUMN `password_hash` VARCHAR(255) DEFAULT NULL COMMENT '登录密码哈希(可选)',
  ADD COLUMN `sentinel_enabled` TINYINT DEFAULT 0 COMMENT '哨兵模式 0关 1开';
