const schedule = require('node-schedule');
const pool = require('../config/db');
const config = require('../config');
const groupBuyController = require('../controllers/groupBuyController');

const jobs = {};

function toMysqlDatetime(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

async function archiveLocationTopicsOnce() {
  const archiveHours = config.chatRoomArchiveHours || 24;
  const cutoffTime = toMysqlDatetime(new Date(Date.now() - archiveHours * 60 * 60 * 1000));

  // A12: 归档任务只处理 quiet → archived,active → quiet 由 quietLocationTopicsOnce 处理
  const [topicsToArchive] = await pool.query(
    `SELECT id, session_id
     FROM location_topics
     WHERE status = 'quiet'
       AND (
         (last_message_at IS NOT NULL AND last_message_at < ?)
         OR (last_message_at IS NULL AND created_at < ?)
       )`,
    [cutoffTime, cutoffTime]
  );

  let archivedCount = 0;

  for (const topic of topicsToArchive) {
    await pool.query(
      "UPDATE location_topics SET status = 'archived', updated_at = NOW() WHERE id = ?",
      [topic.id]
    );

    if (topic.session_id) {
      await pool.query(
        'UPDATE chat_sessions SET is_active = 0, updated_at = NOW() WHERE id = ?',
        [topic.session_id]
      );
    }

    archivedCount++;
  }

  return { archived_count: archivedCount };
}

/**
 * A12: 地点话题 quiet 状态转移定时任务
 * active → quiet: 2小时无新消息
 * quiet → archived: 24小时无新消息(由 archiveLocationTopicsOnce 处理)
 */
async function quietLocationTopicsOnce() {
  const quietHours = (config.chatRoomQuietHours || 2);
  const quietCutoff = toMysqlDatetime(new Date(Date.now() - quietHours * 60 * 60 * 1000));

  // active → quiet: 超过 quietHours 无新消息
  const [result] = await pool.query(
    `UPDATE location_topics
     SET status = 'quiet', updated_at = NOW()
     WHERE status = 'active'
       AND (
         (last_message_at IS NOT NULL AND last_message_at < ?)
         OR (last_message_at IS NULL AND created_at < ?)
       )`,
    [quietCutoff, quietCutoff]
  );

  return { quieted_count: result.affectedRows || 0 };
}

async function checkExpiredGroupBuysOnce() {
  return groupBuyController.checkExpiredActivities(
    {},
    null,
    (err) => {
      if (err) {
        console.error('[Scheduler] checkExpiredGroupBuys callback error:', err.message);
      }
    }
  );
}

async function checkDetachedMembersOnce() {
  const silenceMinutes = config.detachThreshold?.maxSilence || 12 * 60;
  const silenceCutoff = new Date(Date.now() - silenceMinutes * 60 * 1000);
  const noDataCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [members] = await pool.query(
    `SELECT tm.id, tm.trip_id, tm.user_id, tm.joined_at
     FROM trip_members tm
     JOIN trips t ON t.id = tm.trip_id AND t.status = 2
     WHERE tm.status = 2`
  );

  let detachedCount = 0;

  for (const member of members) {
    const [[userRow]] = await pool.query(
      'SELECT last_position FROM users WHERE id = ?',
      [member.user_id]
    );

    let shouldDetach = false;
    let detachReason = '';

    if (userRow?.last_position) {
      let lastPosition = userRow.last_position;
      if (typeof lastPosition === 'string') {
        try {
          lastPosition = JSON.parse(lastPosition);
        } catch {
          lastPosition = null;
        }
      }

      const rawUpdateTime = lastPosition?.updateTime || lastPosition?.timestamp;
      const joinedAt = member.joined_at ? new Date(member.joined_at) : null;
      // 新成员宽限期:加入行程不足24小时不判"超时退队",
      // 避免用户在创建行程/刚加入时因旧位置数据被立即误踢。
      if (joinedAt && joinedAt > noDataCutoff) {
        // 刚加入的成员(24小时内):不因旧 last_position 立即退队
        shouldDetach = false;
      } else if (rawUpdateTime && new Date(rawUpdateTime) < silenceCutoff) {
        shouldDetach = true;
        detachReason = 'timeout';
      }
    } else if (member.joined_at && new Date(member.joined_at) < noDataCutoff) {
      shouldDetach = true;
      detachReason = 'timeout';
    }

    if (!shouldDetach) {
      continue;
    }

    await pool.query(
      `UPDATE trip_members
       SET status = 4, left_reason = ?, left_at = NOW()
       WHERE id = ? AND status = 2`,
      [detachReason, member.id]
    );

    const [chatSessions] = await pool.query(
      `SELECT id FROM chat_sessions
       WHERE type = 'team_group' AND trip_id = ? AND is_active = 1`,
      [member.trip_id]
    );

    for (const session of chatSessions) {
      await pool.query(
        `UPDATE chat_session_members
         SET left_at = NOW()
         WHERE session_id = ? AND user_id = ? AND left_at IS NULL`,
        [session.id, member.user_id]
      );

      await pool.query(
        `UPDATE chat_sessions
         SET member_count = GREATEST(member_count - 1, 0), updated_at = NOW()
         WHERE id = ?`,
        [session.id]
      );
    }

    await pool.query(
      `INSERT INTO operation_logs (user_id, action, target_type, target_id, detail, created_at)
       VALUES (?, 'auto_detach', 'trip_member', ?, ?, NOW())`,
      [
        member.user_id,
        String(member.id),
        JSON.stringify({ trip_id: member.trip_id, reason: detachReason })
      ]
    );

    // 站内通知:告知用户已自动退队
    try {
      const title = detachReason === 'timeout' ? '⏰ 长时间未同步位置自动退队' : '⚠️ 已自动退队';
      const content = detachReason === 'timeout'
        ? '你已超过12小时未同步位置，系统已自动将你移出车队群聊。'
        : '你已偏离队伍路线，系统已自动将你移出车队群聊。';
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, content, payload, read_at, created_at)
         VALUES (?, 'trip_detach', ?, ?, ?, NULL, NOW())`,
        [member.user_id, title, content, JSON.stringify({ trip_id: member.trip_id, reason: detachReason })]
      );
    } catch (notifyErr) {
      console.warn('[Scheduler] detach notify failed:', notifyErr.message);
    }

    detachedCount++;
  }

  return { checked_count: members.length, detached_count: detachedCount };
}

async function expireCouponsOnce() {
  const [result] = await pool.query(
    `UPDATE user_coupons
     SET status = 3
     WHERE status = 1 AND expire_at < NOW()`
  );

  return { expired_count: result.affectedRows || 0 };
}

async function cleanupOldLocationRecordsOnce() {
  const cutoffDate = toMysqlDatetime(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [result] = await pool.query(
    'DELETE FROM location_records WHERE created_at < ?',
    [cutoffDate]
  );

  return { deleted_count: result.affectedRows || 0 };
}

/**
 * 哨兵模式:进行中行程里开启了哨兵的用户,位置超过阈值未更新则发安全提醒(每24小时最多一次)
 */
async function checkSentinelOnce() {
  const staleHours = config.sentinel?.staleHours || 6;
  const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);
  const [members] = await pool.query(
    `SELECT tm.user_id, tm.trip_id, u.last_position, t.title AS trip_title
     FROM trip_members tm
     JOIN users u ON u.id = tm.user_id
     JOIN trips t ON t.id = tm.trip_id
     WHERE tm.status = 2 AND t.status = 2 AND u.sentinel_enabled = 1`
  );

  let alerted = 0;
  for (const m of members) {
    let lastPos = null;
    if (m.last_position) {
      try {
        lastPos = typeof m.last_position === 'string' ? JSON.parse(m.last_position) : m.last_position;
      } catch { lastPos = null; }
    }
    const updateTime = lastPos?.updateTime || lastPos?.timestamp;
    const isStale = !updateTime || new Date(updateTime) < cutoff;
    if (!isStale) continue;

    // 24小时内已提醒过则跳过
    const [[recent]] = await pool.query(
      `SELECT id FROM notifications
       WHERE user_id = ? AND type = 'sentinel_alert' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
       LIMIT 1`,
      [m.user_id]
    );
    if (recent) continue;

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, content, payload, read_at, created_at)
       VALUES (?, 'sentinel_alert', '🛡 哨兵模式提醒', ?, ?, NULL, NOW())`,
      [m.user_id,
        `你在「${m.trip_title || '行程'}」中的位置已超过${staleHours}小时未更新，请确认安全。`,
        JSON.stringify({ trip_id: m.trip_id })]
    );
    alerted++;
  }

  return { checked: members.length, alerted };
}

function scheduleJob(name, cron, handler) {
  jobs[name] = schedule.scheduleJob(cron, async () => {
    const startTime = Date.now();
    console.log(`[Scheduler] ${name} started`);
    try {
      const result = await handler();
      console.log(`[Scheduler] ${name} completed in ${Date.now() - startTime}ms`, result || {});
    } catch (err) {
      console.error(`[Scheduler] ${name} failed:`, err.message);
    }
  });
  console.log(`[Scheduler] ${name} registered (${cron})`);
}

function startAll() {
  console.log('[Scheduler] starting scheduled jobs');
  scheduleJob('quietLocationTopics', '*/15 * * * *', quietLocationTopicsOnce);
  scheduleJob('archiveLocationTopics', '*/30 * * * *', archiveLocationTopicsOnce);
  scheduleJob('checkExpiredGroupBuys', '*/5 * * * *', checkExpiredGroupBuysOnce);
  scheduleJob('checkDetachedMembers', '*/15 * * * *', checkDetachedMembersOnce);
  scheduleJob('expireCoupons', '0 0 * * *', expireCouponsOnce);
  scheduleJob('cleanupOldLocationRecords', '0 3 * * *', cleanupOldLocationRecordsOnce);
  scheduleJob('checkSentinel', '*/10 * * * *', checkSentinelOnce);
  console.log(`[Scheduler] ${Object.keys(jobs).length} job(s) started`);
}

function stopAll() {
  let cancelled = 0;
  for (const [name, job] of Object.entries(jobs)) {
    if (job) {
      job.cancel();
      delete jobs[name];
      cancelled++;
    }
  }
  console.log(`[Scheduler] ${cancelled} job(s) stopped`);
}

module.exports = {
  startAll,
  stopAll,
  archiveLocationTopicsOnce,
  checkExpiredGroupBuysOnce,
  checkDetachedMembersOnce,
  expireCouponsOnce,
  cleanupOldLocationRecordsOnce
};
