ALTER TABLE group_buy_products
  ADD COLUMN sales_count INT NOT NULL DEFAULT 0 AFTER current_count,
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER sales_count;

ALTER TABLE group_buy_participants
  ADD COLUMN product_id BIGINT UNSIGNED DEFAULT NULL AFTER user_id,
  ADD COLUMN join_price DECIMAL(10,2) DEFAULT NULL AFTER product_id,
  ADD COLUMN paid_at DATETIME DEFAULT NULL AFTER status;

ALTER TABLE orders
  ADD COLUMN transaction_id VARCHAR(100) DEFAULT NULL AFTER wx_transaction_id;

ALTER TABLE coupon_templates
  ADD COLUMN condition_amount DECIMAL(10,2) DEFAULT NULL AFTER type,
  ADD COLUMN discount_amount DECIMAL(10,2) DEFAULT NULL AFTER condition_amount,
  ADD COLUMN discount_percent DECIMAL(5,2) DEFAULT NULL AFTER discount_amount,
  ADD COLUMN daily_limit INT DEFAULT NULL AFTER total_quantity,
  ADD COLUMN used_quantity INT NOT NULL DEFAULT 0 AFTER issued_quantity,
  ADD COLUMN start_date DATE DEFAULT NULL AFTER valid_days,
  ADD COLUMN end_date DATE DEFAULT NULL AFTER start_date;

UPDATE coupon_templates
SET discount_amount = COALESCE(discount_amount, face_value),
    condition_amount = COALESCE(condition_amount, min_amount),
    used_quantity = COALESCE(used_quantity, issued_quantity, 0);

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
