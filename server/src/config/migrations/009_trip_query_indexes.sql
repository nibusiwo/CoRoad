-- 行程列表查询优化：覆盖我的行程筛选与时间排序
ALTER TABLE trips
  ADD INDEX idx_status_created_id (status, created_at, id);

ALTER TABLE trip_members
  ADD INDEX idx_user_status_trip (user_id, status, trip_id);
