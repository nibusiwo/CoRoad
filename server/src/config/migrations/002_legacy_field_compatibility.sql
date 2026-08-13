ALTER TABLE users
  ADD COLUMN is_admin TINYINT NOT NULL DEFAULT 0 AFTER status;

ALTER TABLE group_buy_products
  ADD COLUMN image VARCHAR(500) DEFAULT NULL AFTER images;

ALTER TABLE merchants
  ADD COLUMN score INT NOT NULL DEFAULT 0 AFTER level_score;

ALTER TABLE orders
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
SET amount = pay_amount,
    coupon_amount = discount_amount,
    coupon_discount = discount_amount,
    verify_code = verification_code,
    pay_at = paid_at,
    refund_at = refunded_at
WHERE amount IS NULL;
