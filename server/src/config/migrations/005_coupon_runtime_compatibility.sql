ALTER TABLE coupon_templates
  ADD COLUMN prefix VARCHAR(12) DEFAULT 'CO' AFTER valid_days,
  ADD COLUMN start_time DATETIME DEFAULT NULL AFTER end_date,
  ADD COLUMN end_time DATETIME DEFAULT NULL AFTER start_time;

ALTER TABLE user_coupons
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

UPDATE coupon_templates
SET prefix = COALESCE(prefix, 'CO'),
    face_value = COALESCE(face_value, discount_amount, 0),
    min_amount = COALESCE(min_amount, condition_amount, 0),
    discount_amount = COALESCE(discount_amount, face_value),
    condition_amount = COALESCE(condition_amount, min_amount);
