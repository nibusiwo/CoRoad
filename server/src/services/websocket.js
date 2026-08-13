/**
 * WebSocket 实时通信服务
 *
 * 提供通过 WebSocket 向客户端实时推送消息的能力。
 * 所有函数在 wss 不可用时都会优雅降级（no-op），不会抛出异常。
 */

const pool = require('../config/db');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Serialize data to JSON string. Returns null on failure.
 * @param {*} data
 * @returns {string|null}
 */
function safeJson(data) {
  try {
    return JSON.stringify(data);
  } catch (_) {
    return null;
  }
}

/**
 * Send a JSON payload to a single WebSocket client.
 * Handles disconnected / closing sockets gracefully.
 * @param {import('ws').WebSocket} ws
 * @param {*} data
 * @returns {boolean} Whether the send succeeded
 */
function send(ws, data) {
  if (!ws || ws.readyState !== 1) return false; // 1 = OPEN
  const payload = safeJson(data);
  if (payload === null) return false;
  try {
    ws.send(payload);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Iterate all clients in a WSS instance and call `fn(client)` for each.
 * Safe to call when wss is not available.
 * @param {import('ws').WebSocketServer|null|undefined} wss
 * @param {(client: import('ws').WebSocket) => void} fn
 */
function forEachClient(wss, fn) {
  if (!wss || !wss.clients || typeof wss.clients.forEach !== 'function') return;
  wss.clients.forEach((client) => {
    try {
      fn(client);
    } catch (_) {
      // Ignore errors on individual client iteration
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a JSON payload to a specific WebSocket connection.
 * @param {import('ws').WebSocket} ws - The WebSocket client instance
 * @param {*} data - The data to send (will be JSON-serialized)
 */
function broadcast(ws, data) {
  send(ws, data);
}

/**
 * Send a message to all connected members of a trip (team).
 * Looks up members in trip_members and finds their active ws connections by userId.
 *
 * @param {number} tripId - The trip ID
 * @param {*} message - The message/data to send
 * @param {import('ws').WebSocketServer|null|undefined} wss
 */
async function notifyTeam(tripId, message, wss) {
  if (!wss) return;

  try {
    const [members] = await pool.query(
      'SELECT user_id FROM trip_members WHERE trip_id = ? AND status = 2',
      [tripId]
    );
    const memberIds = new Set(members.map((m) => m.user_id));

    if (memberIds.size === 0) return;

    forEachClient(wss, (client) => {
      if (client.userId && memberIds.has(client.userId)) {
        send(client, message);
      }
    });
  } catch (err) {
    console.error('[WebSocket] notifyTeam 失败:', err.message);
  }
}

/**
 * Send a message to a specific user's active WebSocket connection(s).
 *
 * @param {number} userId
 * @param {*} message
 * @param {import('ws').WebSocketServer|null|undefined} wss
 */
function notifyUser(userId, message, wss) {
  if (!wss || !userId) return;

  forEachClient(wss, (client) => {
    if (client.userId === userId) {
      send(client, message);
    }
  });
}

/**
 * Broadcast a location update from one team member to all other members in the same team.
 * Looks up the user's active trip, then notifies the rest of the team.
 *
 * @param {number} userId - The user sending the location update
 * @param {object} locationData - The location payload { lng, lat, altitude, speed, direction, accuracy, time }
 * @param {import('ws').WebSocketServer|null|undefined} wss
 */
async function notifyTripLocation(userId, locationData, wss) {
  if (!wss || !userId) return;

  try {
    // Find active trips for this user (status = 2 '已加入')
    const [memberships] = await pool.query(
      'SELECT trip_id FROM trip_members WHERE user_id = ? AND status = 2',
      [userId]
    );

    if (memberships.length === 0) return;

    const tripIds = memberships.map((m) => m.trip_id);

    // Get all active members of those trips (excluding the sender)
    const [allMembers] = await pool.query(
      'SELECT DISTINCT user_id FROM trip_members WHERE trip_id IN (?) AND status = 2 AND user_id != ?',
      [tripIds, userId]
    );
    const recipientIds = new Set(allMembers.map((m) => m.user_id));

    if (recipientIds.size === 0) return;

    const payload = {
      type: 'location_update',
      userId,
      data: locationData,
    };

    forEachClient(wss, (client) => {
      if (client.userId && recipientIds.has(client.userId)) {
        send(client, payload);
      }
    });
  } catch (err) {
    console.error('[WebSocket] notifyTripLocation 失败:', err.message);
  }
}

/**
 * Notify members of a chat session about a new message.
 *
 * @param {number} sessionId - The chat session ID
 * @param {number} senderId - The sender's user ID
 * @param {*} message - The message payload (content, type, etc.)
 * @param {import('ws').WebSocketServer|null|undefined} wss
 */
async function notifyNewMessage(sessionId, senderId, message, wss) {
  if (!wss || !sessionId) return;

  try {
    const [members] = await pool.query(
      'SELECT user_id FROM chat_session_members WHERE session_id = ? AND left_at IS NULL AND user_id != ?',
      [sessionId, senderId]
    );
    const recipientIds = new Set(members.map((m) => m.user_id));

    if (recipientIds.size === 0) return;

    const payload = {
      type: 'new_message',
      sessionId,
      senderId,
      message,
    };

    forEachClient(wss, (client) => {
      if (client.userId && recipientIds.has(client.userId)) {
        send(client, payload);
      }
    });
  } catch (err) {
    console.error('[WebSocket] notifyNewMessage 失败:', err.message);
  }
}

/**
 * Send a system notification to a list of specific users.
 *
 * @param {number[]} userIds - Array of user IDs to notify
 * @param {object} notification - The notification payload { title, content, type, data }
 * @param {import('ws').WebSocketServer|null|undefined} wss
 */
function sendSystemNotification(userIds, notification, wss) {
  if (!wss || !userIds || !Array.isArray(userIds) || userIds.length === 0) return;

  const targetSet = new Set(userIds);

  const payload = {
    type: 'system_notification',
    ...notification,
    timestamp: new Date().toISOString(),
  };

  forEachClient(wss, (client) => {
    if (client.userId && targetSet.has(client.userId)) {
      send(client, payload);
    }
  });
}

module.exports = {
  send,
  forEachClient,
  broadcast,
  notifyTeam,
  notifyUser,
  notifyTripLocation,
  notifyNewMessage,
  sendSystemNotification,
};
