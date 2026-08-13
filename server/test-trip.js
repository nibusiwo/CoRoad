const pool = require('./src/config/db');

async function test() {
  try {
    const [result] = await pool.query(
      `INSERT INTO trips
        (leader_id, title, start_point, end_point, waypoints, route_data,
         departure_time, estimated_days, daily_distance, depth, tags,
         max_cars, current_cars, max_members, current_members, is_public,
         status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, 1, NOW(), NOW())`,
      [
        2,
        '测试行程',
        JSON.stringify({ name: '广州', lng: 113.26, lat: 23.13 }),
        JSON.stringify({ name: '深圳', lng: 114.06, lat: 22.55 }),
        null,
        null,
        '2026-08-03 21:00:00',
        3,
        null,
        1,
        null,
        5,
        20,
        1
      ]
    );
    console.log('Trip insert OK, id:', result.insertId);

    const [chatResult] = await pool.query(
      `INSERT INTO chat_sessions
        (type, name, avatar, trip_id, creator_id, member_count, is_active, created_at, updated_at)
       VALUES ('team_group', ?, ?, ?, ?, 1, 1, NOW(), NOW())`,
      ['测试行程', null, result.insertId, 2]
    );
    console.log('Chat session insert OK, id:', chatResult.insertId);

    await pool.query(
      `INSERT INTO trip_members (trip_id, user_id, role, status, joined_at, created_at)
       VALUES (?, ?, 1, 2, NOW(), NOW())`,
      [result.insertId, 2]
    );
    console.log('Trip member insert OK');

    // Cleanup
    await pool.query('DELETE FROM trip_members WHERE trip_id = ?', [result.insertId]);
    await pool.query('DELETE FROM chat_sessions WHERE trip_id = ?', [result.insertId]);
    await pool.query('DELETE FROM trips WHERE id = ?', [result.insertId]);
    console.log('Cleanup OK');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    console.error('SQL State:', err.sqlState);
    console.error('SQL Message:', err.sqlMessage);
    process.exit(1);
  }
}

test();
