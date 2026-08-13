CREATE TABLE IF NOT EXISTS group_buy_price_tiers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id BIGINT UNSIGNED NOT NULL,
  target_count INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_target (product_id, target_count),
  KEY idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='拼团阶梯价格';

CREATE TABLE IF NOT EXISTS user_blocks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  blocker_id BIGINT UNSIGNED NOT NULL,
  blocked_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_block (blocker_id, blocked_id),
  KEY idx_blocked (blocked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户黑名单';

CREATE TABLE IF NOT EXISTS refund_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  activity_id BIGINT UNSIGNED DEFAULT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason VARCHAR(500) DEFAULT NULL,
  status TINYINT NOT NULL DEFAULT 0 COMMENT '0待审核 1通过 2拒绝',
  reviewer_id BIGINT UNSIGNED DEFAULT NULL,
  review_reason VARCHAR(500) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_open_order (order_id, status),
  KEY idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='退款申请';

CREATE TABLE IF NOT EXISTS settlement_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  merchant_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  commission_rate DECIMAL(6,4) NOT NULL,
  commission_amount DECIMAL(10,2) NOT NULL,
  settlement_amount DECIMAL(10,2) NOT NULL,
  status TINYINT NOT NULL DEFAULT 0 COMMENT '0待结算 1已结算 2失败',
  provider_transaction_id VARCHAR(100) DEFAULT NULL,
  settled_at DATETIME DEFAULT NULL,
  remark VARCHAR(500) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order (order_id),
  KEY idx_merchant_status (merchant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分账结算记录';

CREATE TABLE IF NOT EXISTS order_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  merchant_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT NOT NULL,
  content VARCHAR(1000) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_user (order_id, user_id),
  KEY idx_merchant_rating (merchant_id, rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单评价';

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content VARCHAR(1000) DEFAULT NULL,
  payload JSON DEFAULT NULL,
  read_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_read (user_id, read_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内通知';

CREATE TABLE IF NOT EXISTS customer_service_tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED DEFAULT NULL,
  category VARCHAR(50) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  assignee_id BIGINT UNSIGNED DEFAULT NULL,
  resolved_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status_priority (status, priority, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客服投诉工单';

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(50) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  relationship VARCHAR(30) DEFAULT NULL,
  is_primary TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='紧急联系人';

CREATE TABLE IF NOT EXISTS sos_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  trip_id BIGINT UNSIGNED DEFAULT NULL,
  location JSON NOT NULL,
  message VARCHAR(500) DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  resolved_by BIGINT UNSIGNED DEFAULT NULL,
  resolved_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status_created (status, created_at),
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='SOS事件';

CREATE TABLE IF NOT EXISTS admin_user_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(30) NOT NULL COMMENT 'super_admin/operator/reviewer/finance/support',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_role (user_id, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='后台角色';

CREATE TABLE IF NOT EXISTS platform_configs (
  config_key VARCHAR(100) NOT NULL,
  config_value JSON NOT NULL,
  updated_by BIGINT UNSIGNED DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='平台动态配置';

CREATE TABLE IF NOT EXISTS integration_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider VARCHAR(30) NOT NULL,
  event_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  payload JSON DEFAULT NULL,
  processed_at DATETIME DEFAULT NULL,
  result VARCHAR(30) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_provider_event (provider, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='第三方回调幂等记录';

ALTER TABLE users
  ADD COLUMN certification_status TINYINT NOT NULL DEFAULT 0 AFTER is_certified,
  ADD COLUMN certification_reject_reason VARCHAR(500) DEFAULT NULL AFTER certification_data,
  ADD COLUMN certification_reviewed_at DATETIME DEFAULT NULL AFTER certification_reject_reason,
  ADD COLUMN faceid_ticket VARCHAR(128) DEFAULT NULL AFTER certification_reviewed_at;

UPDATE users
SET certification_status = CASE WHEN is_certified = 1 THEN 2 ELSE 0 END;

ALTER TABLE merchants
  ADD COLUMN avg_response_time INT DEFAULT NULL AFTER rating,
  ADD COLUMN promotion_code VARCHAR(32) DEFAULT NULL AFTER service_scope;

ALTER TABLE group_buy_activities
  ADD COLUMN final_price DECIMAL(10,2) DEFAULT NULL AFTER current_count,
  ADD COLUMN completed_at DATETIME DEFAULT NULL AFTER expire_at;

ALTER TABLE orders
  ADD COLUMN quantity INT NOT NULL DEFAULT 1 AFTER activity_id,
  ADD COLUMN refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER refunded_at,
  ADD COLUMN refund_reason VARCHAR(500) DEFAULT NULL AFTER refund_amount,
  ADD COLUMN commission_rate DECIMAL(6,4) DEFAULT NULL AFTER split_status,
  ADD COLUMN commission_amount DECIMAL(10,2) DEFAULT NULL AFTER commission_rate,
  ADD COLUMN price_adjustment_refund DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER commission_amount;

ALTER TABLE orders ALTER COLUMN status SET DEFAULT 0;

INSERT IGNORE INTO group_buy_price_tiers (product_id, target_count, price)
SELECT p.id, jt.target_count, jt.price
FROM group_buy_products p
JOIN JSON_TABLE(
  p.price_tiers,
  '$[*]' COLUMNS(
    target_count INT PATH '$.count',
    price DECIMAL(10,2) PATH '$.price'
  )
) AS jt ON TRUE;

INSERT INTO platform_configs (config_key, config_value)
VALUES
  ('growth_rules', JSON_OBJECT('drive_distance', 1, 'trip_complete', 200, 'team_leader', 100, 'invite_user', 150, 'daily_checkin', 5, 'review_merchant', 20, 'group_buy_count', 50)),
  ('integration_mode', JSON_OBJECT('environment', 'sandbox'))
ON DUPLICATE KEY UPDATE config_key = VALUES(config_key);
