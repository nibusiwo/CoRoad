ALTER TABLE users
  ADD COLUMN certification_status TINYINT NOT NULL DEFAULT 0 AFTER is_certified,
  ADD COLUMN certification_reject_reason VARCHAR(500) DEFAULT NULL AFTER certification_data,
  ADD COLUMN certification_reviewed_at DATETIME DEFAULT NULL AFTER certification_reject_reason,
  ADD COLUMN faceid_ticket VARCHAR(128) DEFAULT NULL AFTER certification_reviewed_at,
  ADD COLUMN is_admin TINYINT NOT NULL DEFAULT 0 AFTER status;

ALTER TABLE merchants
  ADD COLUMN avg_response_time INT DEFAULT NULL AFTER rating,
  ADD COLUMN promotion_code VARCHAR(32) DEFAULT NULL AFTER service_scope,
  ADD COLUMN score INT NOT NULL DEFAULT 0 AFTER level_score;

ALTER TABLE group_buy_products
  ADD COLUMN image VARCHAR(500) DEFAULT NULL AFTER images;

ALTER TABLE group_buy_activities
  ADD COLUMN final_price DECIMAL(10,2) DEFAULT NULL AFTER current_count,
  ADD COLUMN completed_at DATETIME DEFAULT NULL AFTER expire_at;

ALTER TABLE orders
  ADD COLUMN quantity INT NOT NULL DEFAULT 1 AFTER activity_id,
  ADD COLUMN refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER refunded_at,
  ADD COLUMN refund_reason VARCHAR(500) DEFAULT NULL AFTER refund_amount,
  ADD COLUMN commission_rate DECIMAL(6,4) DEFAULT NULL AFTER split_status,
  ADD COLUMN commission_amount DECIMAL(10,2) DEFAULT NULL AFTER commission_rate,
  ADD COLUMN price_adjustment_refund DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER commission_amount,
  ADD COLUMN amount DECIMAL(10,2) DEFAULT NULL AFTER pay_amount,
  ADD COLUMN coupon_amount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER discount_amount,
  ADD COLUMN coupon_discount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER coupon_amount,
  ADD COLUMN verify_code VARCHAR(20) DEFAULT NULL AFTER verification_code,
  ADD COLUMN pay_at DATETIME DEFAULT NULL AFTER paid_at,
  ADD COLUMN refund_at DATETIME DEFAULT NULL AFTER refunded_at,
  ADD COLUMN split_at DATETIME DEFAULT NULL AFTER split_status;

UPDATE group_buy_products
SET image = JSON_UNQUOTE(JSON_EXTRACT(images, '$[0]'))
WHERE image IS NULL AND JSON_TYPE(images) = 'ARRAY' AND JSON_LENGTH(images) > 0;

UPDATE orders
SET amount = COALESCE(amount, pay_amount),
    coupon_amount = COALESCE(coupon_amount, discount_amount, 0),
    coupon_discount = COALESCE(coupon_discount, discount_amount, 0),
    verify_code = COALESCE(verify_code, verification_code),
    pay_at = COALESCE(pay_at, paid_at),
    refund_at = COALESCE(refund_at, refunded_at)
WHERE amount IS NULL OR verify_code IS NULL OR pay_at IS NULL OR refund_at IS NULL;

INSERT INTO platform_configs (config_key, config_value)
VALUES ('integration_mode', JSON_OBJECT('environment', 'sandbox'))
ON DUPLICATE KEY UPDATE config_key = VALUES(config_key);
