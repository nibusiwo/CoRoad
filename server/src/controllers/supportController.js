const pool = require('../config/db');
const { ApiResponse } = require('../utils/helpers');

async function listNotifications(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(50, Math.max(1, Number(req.query.page_size || 20)));
    const offset = (page - 1) * pageSize;
    const [[{ total }]] = await pool.query('SELECT COUNT(*) total FROM notifications WHERE user_id = ?', [req.userId]);
    const [list] = await pool.query(
      `SELECT id, type, title, content, payload, read_at, created_at FROM notifications
       WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [req.userId, pageSize, offset]
    );
    res.json(ApiResponse.paginated(list, total, page, pageSize));
  } catch (err) { next(err); }
}

async function markNotificationRead(req, res, next) {
  try {
    await pool.query('UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json(ApiResponse.success(null, '通知已读'));
  } catch (err) { next(err); }
}

async function createTicket(req, res, next) {
  try {
    const { order_id, category, subject, content, priority } = req.body;
    if (!subject || !content) return res.status(422).json(ApiResponse.fail('请填写工单主题和内容'));
    const [result] = await pool.query(
      `INSERT INTO customer_service_tickets (user_id, order_id, category, subject, content, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.userId, order_id || null, category || 'other', subject.trim(), content.trim(), priority || 'normal']
    );
    res.status(201).json(ApiResponse.success({ id: result.insertId }, '工单已提交'));
  } catch (err) { next(err); }
}

async function listTickets(req, res, next) {
  try {
    const [list] = await pool.query(
      `SELECT id, order_id, category, subject, content, priority, status, assignee_id, resolved_at, created_at, updated_at
       FROM customer_service_tickets WHERE user_id = ? ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(ApiResponse.success({ list }));
  } catch (err) { next(err); }
}

module.exports = { listNotifications, markNotificationRead, createTicket, listTickets };
