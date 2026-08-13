const pool = require('../config/db');
const { ApiResponse } = require('../utils/helpers');

async function listContacts(req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, phone, relationship, is_primary, created_at, updated_at FROM emergency_contacts WHERE user_id = ? ORDER BY is_primary DESC, id ASC',
      [req.userId]
    );
    res.json(ApiResponse.success({ list: rows }));
  } catch (err) { next(err); }
}

async function saveContact(req, res, next) {
  try {
    const { name, phone, relationship, is_primary } = req.body;
    if (!name || !/^1[3-9]\d{9}$/.test(phone || '')) return res.status(422).json(ApiResponse.fail('请提供有效的联系人和手机号'));
    const [result] = await pool.query(
      `INSERT INTO emergency_contacts (user_id, name, phone, relationship, is_primary)
       VALUES (?, ?, ?, ?, ?)`,
      [req.userId, name.trim(), phone, relationship || null, is_primary ? 1 : 0]
    );
    if (is_primary) await pool.query('UPDATE emergency_contacts SET is_primary = 0 WHERE user_id = ? AND id != ?', [req.userId, result.insertId]);
    res.json(ApiResponse.success({ id: result.insertId }, '紧急联系人已保存'));
  } catch (err) { next(err); }
}

async function deleteContact(req, res, next) {
  try {
    await pool.query('DELETE FROM emergency_contacts WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
    res.json(ApiResponse.success(null, '紧急联系人已删除'));
  } catch (err) { next(err); }
}

async function createSos(req, res, next) {
  try {
    const { trip_id, location, message } = req.body;
    if (!location || location.lng == null || location.lat == null) return res.status(422).json(ApiResponse.fail('请提供当前位置'));
    const [result] = await pool.query(
      `INSERT INTO sos_events (user_id, trip_id, location, message, status) VALUES (?, ?, ?, ?, 'active')`,
      [req.userId, trip_id || null, JSON.stringify(location), message || null]
    );
    res.status(201).json(ApiResponse.success({ id: result.insertId, sandbox: process.env.INTEGRATION_MODE === 'sandbox' }, 'SOS 已触发'));
  } catch (err) { next(err); }
}

async function resolveSos(req, res, next) {
  try {
    await pool.query(
      `UPDATE sos_events SET status = 'resolved', resolved_by = ?, resolved_at = NOW()
       WHERE id = ? AND status = 'active'`,
      [req.userId, req.params.id]
    );
    res.json(ApiResponse.success(null, 'SOS 事件已处理'));
  } catch (err) { next(err); }
}

module.exports = { listContacts, saveContact, deleteContact, createSos, resolveSos };
