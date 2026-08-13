/**
 * 腾讯云 IM（即时通信）服务封装
 *
 * 提供 UserSig 生成、群组管理、消息发送等 IM 能力。
 * TIM_APP_ID 未配置时，所有函数会抛出明确错误。
 */

const crypto = require('crypto');
const zlib = require('zlib');
const axios = require('axios');
const config = require('../config');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TIM_API_BASE = 'https://console.tim.qq.com';
const DEFAULT_ADMIN_ID = config.tim.adminId || 'admin';
const SDK_APP_ID = config.tim.appId;
const SECRET_KEY = config.tim.secretKey;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Ensure TIM is configured. Throws if APP_ID or SECRET_KEY is missing.
 */
function ensureConfig() {
  if (!SDK_APP_ID || !SECRET_KEY) {
    throw new Error(
      '腾讯云 IM 未配置。请在 .env 中设置 TIM_APP_ID 和 TIM_SECRET_KEY。'
    );
  }
}

/**
 * Generate a random 32-char hex string.
 */
function randomHex32() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Generate the query string suffix for IM REST API:
 * ?sdkappid=xxx&identifier=xxx&usersig=xxx&random=xxx&contenttype=json
 */
async function buildApiParams(identifier) {
  ensureConfig();
  const userSig = await generateAdminSig();
  const random = Math.floor(Math.random() * 4294967295);
  const params = new URLSearchParams();
  params.set('sdkappid', SDK_APP_ID);
  params.set('identifier', identifier || DEFAULT_ADMIN_ID);
  params.set('usersig', userSig);
  params.set('random', String(random));
  params.set('contenttype', 'json');
  return params.toString();
}

// ---------------------------------------------------------------------------
// UserSig generation
// ---------------------------------------------------------------------------

/**
 * Generate the admin UserSig for REST API authentication.
 * Uses the configured admin account.
 * @returns {Promise<string>} Base64-encoded UserSig
 */
async function generateAdminSig() {
  ensureConfig();
  return generateUserSig(DEFAULT_ADMIN_ID);
}

/**
 * Generate a TLS UserSig for a specific user.
 * This signature is used by the client-side IM SDK to login.
 *
 * Algorithm: IM UserSig generation using HMAC-SHA256.
 * The full algorithm involves compressing a JSON payload and signing it.
 *
 * @param {string} userId - The user identifier to generate sig for
 * @param {number} [expire=86400*180] - Expiry in seconds (default 180 days)
 * @returns {Promise<string>} Base64-encoded UserSig
 */
async function generateUserSig(userId, expire) {
  ensureConfig();

  if (!userId) {
    throw new Error('userId 不能为空');
  }

  expire = expire || 86400 * 180; // 180 days default

  const currTime = Math.floor(Date.now() / 1000);
  const sigDoc = {
    'TLS.ver': '2.0',
    'TLS.identifier': String(userId),
    'TLS.sdkappid': parseInt(SDK_APP_ID, 10),
    'TLS.expire': expire,
    'TLS.time': currTime,
  };

  // Serialize and deflate the sig document
  const sigDocStr = JSON.stringify(sigDoc);
  let base64UserBuf;
  try {
    const compressed = zlib.deflateSync(Buffer.from(sigDocStr, 'utf-8'));
    // URL-safe base64 encode
    base64UserBuf = compressed
      .toString('base64')
      .replace(/\+/g, '*')
      .replace(/\//g, '-')
      .replace(/=/g, '_');
  } catch (err) {
    throw new Error('压缩 UserSig 文档失败: ' + err.message);
  }

  // Generate signature using HMAC-SHA256 over the compressed doc
  const hmac = crypto.createHmac('sha256', Buffer.from(SECRET_KEY, 'utf-8'));
  hmac.update(Buffer.from(base64UserBuf, 'utf-8'));

  const base64Sig = hmac
    .digest('base64')
    .replace(/\+/g, '*')
    .replace(/\//g, '-')
    .replace(/=/g, '_');

  // Assemble the final sig string
  const sig = base64Sig + '.' + base64UserBuf;

  // URL-safe base64 encode the whole thing
  const userSig = sig
    .replace(/\+/g, '*')
    .replace(/\//g, '-')
    .replace(/=/g, '_');

  return userSig;
}

// ---------------------------------------------------------------------------
// Group management
// ---------------------------------------------------------------------------

/**
 * Create an IM group (chat room).
 *
 * @param {string} groupId    - Custom group ID (max 48 chars, letters/digits/underscore)
 * @param {string} groupName  - Group name (max 30 chars)
 * @param {string} [type]     - Group type: 'Public', 'Private', 'ChatRoom', 'AVChatRoom'
 * @param {Array<{Member_Account: string}>} [memberList] - Initial member accounts
 * @returns {object} API response data
 */
async function createGroup(groupId, groupName, type, memberList) {
  const apiParams = await buildApiParams(DEFAULT_ADMIN_ID);

  const body = {
    Owner_Account: DEFAULT_ADMIN_ID,
    Type: type || 'Public',
    GroupId: groupId,
    Name: groupName,
    MaxMemberCount: 200,
    ApplyJoinOption: 'FreeAccess',
  };

  if (memberList && Array.isArray(memberList) && memberList.length > 0) {
    body.MemberList = memberList.map((m) => ({
      Member_Account: String(m.Member_Account || m),
    }));
  }

  try {
    const response = await axios.post(
      `${TIM_API_BASE}/v4/group_open_http_svc/create_group?${apiParams}`,
      body,
      { timeout: 10000 }
    );

    const data = response.data;
    if (data.ErrorCode !== 0) {
      throw new Error(
        `创建 IM 群组失败: [${data.ErrorCode}] ${data.ErrorInfo || '未知错误'}`
      );
    }

    return data;
  } catch (err) {
    if (err.response?.data) {
      const d = err.response.data;
      throw new Error(`创建 IM 群组失败: [${d.ErrorCode}] ${d.ErrorInfo || '请求失败'}`);
    }
    throw err;
  }
}

/**
 * Send a message to an IM group.
 *
 * @param {string} groupId     - Target group ID
 * @param {string} fromAccount - Sender account
 * @param {object} msgBody     - Message body (IM message format)
 * @returns {object} API response data
 */
async function sendGroupMsg(groupId, fromAccount, msgBody) {
  const apiParams = await buildApiParams(DEFAULT_ADMIN_ID);

  const body = {
    GroupId: groupId,
    From_Account: String(fromAccount),
    Random: Math.floor(Math.random() * 4294967295),
    MsgBody: Array.isArray(msgBody) ? msgBody : [msgBody],
  };

  try {
    const response = await axios.post(
      `${TIM_API_BASE}/v4/group_open_http_svc/send_group_msg?${apiParams}`,
      body,
      { timeout: 10000 }
    );

    const data = response.data;
    if (data.ErrorCode !== 0) {
      throw new Error(
        `发送群消息失败: [${data.ErrorCode}] ${data.ErrorInfo || '未知错误'}`
      );
    }

    return data;
  } catch (err) {
    if (err.response?.data) {
      const d = err.response.data;
      throw new Error(`发送群消息失败: [${d.ErrorCode}] ${d.ErrorInfo || '请求失败'}`);
    }
    throw err;
  }
}

/**
 * Get the member list of an IM group.
 *
 * @param {string} groupId - Target group ID
 * @param {number} [limit=100] - Max members per page
 * @param {number} [offset=0] - Page offset
 * @returns {object} API response data with MemberList array
 */
async function getGroupMemberList(groupId, limit, offset) {
  const apiParams = await buildApiParams(DEFAULT_ADMIN_ID);

  const body = {
    GroupId: groupId,
    Limit: limit || 100,
    Offset: offset || 0,
  };

  try {
    const response = await axios.post(
      `${TIM_API_BASE}/v4/group_open_http_svc/get_group_member_info?${apiParams}`,
      body,
      { timeout: 10000 }
    );

    const data = response.data;
    if (data.ErrorCode !== 0) {
      throw new Error(
        `获取群成员列表失败: [${data.ErrorCode}] ${data.ErrorInfo || '未知错误'}`
      );
    }

    return data;
  } catch (err) {
    if (err.response?.data) {
      const d = err.response.data;
      throw new Error(`获取群成员列表失败: [${d.ErrorCode}] ${d.ErrorInfo || '请求失败'}`);
    }
    throw err;
  }
}

/**
 * Add a member to an IM group.
 *
 * @param {string} groupId  - Target group ID
 * @param {string} memberId - Member account to add
 * @param {string} [silence] - '1' = silent join (no notification)
 * @returns {object} API response data
 */
async function addGroupMember(groupId, memberId, silence) {
  const apiParams = await buildApiParams(DEFAULT_ADMIN_ID);

  const body = {
    GroupId: groupId,
    MemberList: [{ Member_Account: String(memberId) }],
    Silence: silence === '1' ? 1 : 0,
  };

  try {
    const response = await axios.post(
      `${TIM_API_BASE}/v4/group_open_http_svc/add_group_member?${apiParams}`,
      body,
      { timeout: 10000 }
    );

    const data = response.data;
    if (data.ErrorCode !== 0) {
      throw new Error(
        `添加群成员失败: [${data.ErrorCode}] ${data.ErrorInfo || '未知错误'}`
      );
    }

    return data;
  } catch (err) {
    if (err.response?.data) {
      const d = err.response.data;
      throw new Error(`添加群成员失败: [${d.ErrorCode}] ${d.ErrorInfo || '请求失败'}`);
    }
    throw err;
  }
}

/**
 * Remove a member from an IM group.
 *
 * @param {string} groupId  - Target group ID
 * @param {string} memberId - Member account to remove
 * @returns {object} API response data
 */
async function deleteGroupMember(groupId, memberId) {
  const apiParams = await buildApiParams(DEFAULT_ADMIN_ID);

  const body = {
    GroupId: groupId,
    MemberToDel_Account: [String(memberId)],
  };

  try {
    const response = await axios.post(
      `${TIM_API_BASE}/v4/group_open_http_svc/delete_group_member?${apiParams}`,
      body,
      { timeout: 10000 }
    );

    const data = response.data;
    if (data.ErrorCode !== 0) {
      throw new Error(
        `删除群成员失败: [${data.ErrorCode}] ${data.ErrorInfo || '未知错误'}`
      );
    }

    return data;
  } catch (err) {
    if (err.response?.data) {
      const d = err.response.data;
      throw new Error(`删除群成员失败: [${d.ErrorCode}] ${d.ErrorInfo || '请求失败'}`);
    }
    throw err;
  }
}

/**
 * Destroy (delete) an IM group.
 *
 * @param {string} groupId - Target group ID
 * @returns {object} API response data
 */
async function destroyGroup(groupId) {
  const apiParams = await buildApiParams(DEFAULT_ADMIN_ID);

  const body = {
    GroupId: groupId,
  };

  try {
    const response = await axios.post(
      `${TIM_API_BASE}/v4/group_open_http_svc/destroy_group?${apiParams}`,
      body,
      { timeout: 10000 }
    );

    const data = response.data;
    if (data.ErrorCode !== 0) {
      throw new Error(
        `销毁群组失败: [${data.ErrorCode}] ${data.ErrorInfo || '未知错误'}`
      );
    }

    return data;
  } catch (err) {
    if (err.response?.data) {
      const d = err.response.data;
      throw new Error(`销毁群组失败: [${d.ErrorCode}] ${d.ErrorInfo || '请求失败'}`);
    }
    throw err;
  }
}

module.exports = {
  generateUserSig,
  generateAdminSig,
  createGroup,
  sendGroupMsg,
  getGroupMemberList,
  addGroupMember,
  deleteGroupMember,
  destroyGroup,
};
