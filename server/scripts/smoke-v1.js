/* eslint-disable no-console */
require('dotenv').config();

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'sandbox';

const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const pool = require('../src/config/db');
const redis = require('../src/config/redis');
const config = require('../src/config');
const scheduler = require('../src/jobs/scheduler');

const runId = `codex_smoke_${Date.now()}`;
const ids = {
  users: [],
  trips: [],
  drafts: [],
  merchants: [],
  products: [],
  activities: [],
  participants: [],
  orders: [],
  couponTemplates: [],
  userCoupons: [],
  contacts: [],
  sosEvents: [],
  topics: [],
  sessions: [],
  messages: [],
  notifications: [],
  tickets: []
};

const results = [];

function pass(name, detail) {
  results.push({ ok: true, name, detail });
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ''}`);
}

function fail(name, detail) {
  const error = new Error(`${name}${detail ? ` - ${detail}` : ''}`);
  error.smokeName = name;
  throw error;
}

function assert(condition, name, detail) {
  if (!condition) {
    fail(name, detail);
  }
  pass(name, detail);
}

async function startServer() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function request(baseUrl, method, path, { token, body, qs } = {}) {
  const url = new URL(path, baseUrl);
  if (qs) {
    for (const [key, value] of Object.entries(qs)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  let json = null;
  const text = await response.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  return { status: response.status, body: json };
}

function tokenFor(user) {
  return jwt.sign(
    { userId: user.id, phone: user.phone },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

async function createUser(suffix, overrides = {}) {
  const phone = overrides.phone || `139${String(Date.now()).slice(-4)}${String(ids.users.length + 1).padStart(4, '0')}`;
  const [result] = await pool.query(
    `INSERT INTO users
      (phone, nickname, avatar, gender, vehicle_model, plate_number, signature,
       is_certified, growth_value, level, credit_score, status, is_admin,
       can_be_discovered, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      phone,
      `${runId}_${suffix}`,
      `https://example.com/${runId}_${suffix}.png`,
      1,
      'Codex SUV',
      `A${String(ids.users.length + 10000).slice(-5)}`,
      'created by smoke test',
      overrides.is_certified ?? 2,
      overrides.growth_value ?? 0,
      overrides.level ?? 0,
      100,
      overrides.status ?? 1,
      overrides.is_admin ? 1 : 0,
      overrides.can_be_discovered ?? 1
    ]
  );

  const user = { id: result.insertId, phone };
  ids.users.push(user.id);
  return { ...user, token: tokenFor(user) };
}

async function markMerchantApproved(merchantId) {
  await pool.query('UPDATE merchants SET status = 1, updated_at = NOW() WHERE id = ?', [merchantId]);
}

function futureDate(hours = 24) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function jsonOk(baseUrl, method, path, options, name) {
  const res = await request(baseUrl, method, path, options);
  if (res.status < 200 || res.status >= 300 || res.body?.code !== 0) {
    fail(name, `HTTP ${res.status}: ${JSON.stringify(res.body)}`);
  }
  pass(name);
  return res.body.data;
}

async function expectStatus(baseUrl, method, path, expectedStatus, options, name) {
  const res = await request(baseUrl, method, path, options);
  if (res.status !== expectedStatus) {
    fail(name, `expected ${expectedStatus}, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  pass(name);
  return res.body;
}

async function runHealthAndAuth(baseUrl) {
  const anonProfile = await request(baseUrl, 'GET', '/api/users/profile');
  assert(anonProfile.status === 401, 'auth guard rejects missing token');

  const health = await request(baseUrl, 'GET', '/health');
  assert(health.status === 200 && health.body?.status === 'ok', 'health endpoint responds');
}

async function runUserAndTripFlow(baseUrl, users) {
  await expectStatus(
    baseUrl,
    'POST',
    '/api/trips',
    403,
    {
      token: users.uncertified.token,
      body: {
        title: `${runId} should fail`,
        start_point: { name: '上海', lng: 121.47, lat: 31.23 },
        end_point: { name: '杭州', lng: 120.16, lat: 30.25 },
        departure_time: futureDate(48)
      }
    },
    'uncertified user cannot publish trip'
  );

  const draft = await jsonOk(
    baseUrl,
    'POST',
    '/api/trips/next',
    {
      token: users.leader.token,
      body: {
        start_point: { name: '上海', lng: 121.47, lat: 31.23 },
        end_point: { name: '杭州', lng: 120.16, lat: 30.25 },
        departure_time: futureDate(48)
      }
    },
    'next trip draft can be created'
  );
  ids.drafts.push(draft.draft_id);

  await jsonOk(
    baseUrl,
    'PUT',
    `/api/trips/next/${draft.draft_id}`,
    {
      token: users.leader.token,
      body: { departure_time: futureDate(72) }
    },
    'next trip draft can be edited'
  );

  const published = await jsonOk(
    baseUrl,
    'POST',
    `/api/trips/next/${draft.draft_id}/publish`,
    {
      token: users.leader.token,
      body: {
        title: `${runId} 上海到杭州`,
        max_cars: 3,
        max_members: 6,
        route_data: {
          path: [
            { lng: 121.47, lat: 31.23 },
            { lng: 120.16, lat: 30.25 }
          ]
        }
      }
    },
    'next trip draft can be published'
  );
  ids.trips.push(published.trip_id);
  ids.sessions.push(published.session_id);

  await jsonOk(baseUrl, 'GET', `/api/trips/${published.trip_id}`, { token: users.leader.token }, 'trip detail loads');
  await jsonOk(
    baseUrl,
    'PUT',
    `/api/trips/${published.trip_id}`,
    { token: users.leader.token, body: { title: `${runId} 更新标题`, tags: ['自驾', '露营'] } },
    'trip can be edited by leader'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/trips/${published.trip_id}/join`,
    { token: users.member.token },
    'member can apply to join trip'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/trips/${published.trip_id}/approve/${users.member.id}`,
    { token: users.leader.token },
    'leader can approve trip member'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/trips/${published.trip_id}/join`,
    { token: users.kicked.token },
    'second member can apply to join trip'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/trips/${published.trip_id}/approve/${users.kicked.id}`,
    { token: users.leader.token },
    'leader can approve second member'
  );
  await jsonOk(
    baseUrl,
    'DELETE',
    `/api/trips/${published.trip_id}/members/${users.kicked.id}`,
    { token: users.leader.token },
    'leader can remove trip member'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/trips/${published.trip_id}/leave`,
    { token: users.member.token },
    'member can leave trip'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/trips/${published.trip_id}/join`,
    { token: users.member.token },
    'member can re-apply after leaving'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/trips/${published.trip_id}/approve/${users.member.id}`,
    { token: users.leader.token },
    'leader can re-approve returning member'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/trips/${published.trip_id}/start`,
    { token: users.leader.token },
    'leader can start trip'
  );
  await jsonOk(
    baseUrl,
    'POST',
    '/api/locations/report',
    {
      token: users.leader.token,
      body: { lng: 121.47, lat: 31.23, altitude: 8, speed: 60, direction: 180, accuracy: 10 }
    },
    'leader location can be reported'
  );
  await jsonOk(
    baseUrl,
    'POST',
    '/api/locations/report',
    {
      token: users.member.token,
      body: { lng: 121.46, lat: 31.22, altitude: 9, speed: 58, direction: 180, accuracy: 12 }
    },
    'member location can be reported'
  );
  await jsonOk(baseUrl, 'GET', '/api/locations/team', { token: users.leader.token }, 'team locations load');
  await jsonOk(
    baseUrl,
    'GET',
    '/api/locations/nearby-teams',
    { token: users.leader.token, qs: { lng: 121.47, lat: 31.23, radius: 50 } },
    'nearby teams load'
  );
  await jsonOk(
    baseUrl,
    'GET',
    '/api/locations/map-data',
    { token: users.leader.token, qs: { lng: 121.47, lat: 31.23, zoom: 12 } },
    'map aggregate data loads'
  );
  await jsonOk(
    baseUrl,
    'GET',
    '/api/map/route-info',
    {
      qs: {
        origin_lng: 121.47,
        origin_lat: 31.23,
        dest_lng: 120.16,
        dest_lat: 30.25
      }
    },
    'map route snake_case contract works'
  );
  await jsonOk(
    baseUrl,
    'GET',
    '/api/map/route-info',
    {
      qs: {
        originLng: 121.47,
        originLat: 31.23,
        destLng: 120.16,
        destLat: 30.25
      }
    },
    'map route camelCase compatibility works'
  );

  return published;
}

async function runChatFlow(baseUrl, users, trip) {
  await jsonOk(baseUrl, 'GET', '/api/messages/sessions', { token: users.leader.token }, 'chat sessions list loads');

  const sessions = await jsonOk(
    baseUrl,
    'GET',
    '/api/messages/sessions',
    { token: users.leader.token, qs: { type: 'team_group' } },
    'team chat sessions filter loads'
  );
  const sessionList = sessions.list || sessions.active || [];
  const teamSession = sessionList.find((s) => Number(s.trip_id) === Number(trip.trip_id));
  if (!teamSession) {
    fail('team chat session exists for trip', `trip_id=${trip.trip_id}`);
  }
  pass('team chat session exists for trip');

  await jsonOk(
    baseUrl,
    'POST',
    `/api/messages/sessions/${teamSession.id}/messages`,
    { token: users.leader.token, body: { type: 'text', content: `${runId} team hello` } },
    'team chat text can be sent'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/messages/sessions/${teamSession.id}/share`,
    {
      token: users.leader.token,
      body: {
        share_type: 'location',
        share_data: { name: '集合点', lng: 121.47, lat: 31.23 }
      }
    },
    'chat location share can be sent'
  );
  await jsonOk(
    baseUrl,
    'GET',
    `/api/messages/sessions/${teamSession.id}`,
    { token: users.member.token },
    'team chat detail loads for member'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/messages/sessions/${teamSession.id}/read`,
    { token: users.member.token },
    'chat read state can be marked'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/messages/sessions/${teamSession.id}/mute`,
    { token: users.member.token },
    'chat can be muted'
  );
  await jsonOk(
    baseUrl,
    'DELETE',
    `/api/messages/sessions/${teamSession.id}/mute`,
    { token: users.member.token },
    'chat can be unmuted'
  );

  await expectStatus(
    baseUrl,
    'POST',
    '/api/messages/sessions/private',
    403,
    { token: users.leader.token, body: { target_user_id: users.stranger.id } },
    'private chat rejects strangers'
  );

  await jsonOk(
    baseUrl,
    'POST',
    '/api/users/follow',
    { token: users.leader.token, body: { followee_id: users.oneWay.id, follow_type: 1 } },
    'user can follow another user'
  );
  const limited = await jsonOk(
    baseUrl,
    'POST',
    '/api/messages/sessions/private',
    { token: users.leader.token, body: { target_user_id: users.oneWay.id } },
    'private chat opens for one-way follow'
  );
  ids.sessions.push(limited.session.id);
  for (let i = 1; i <= 3; i++) {
    await jsonOk(
      baseUrl,
      'POST',
      `/api/messages/sessions/${limited.session.id}/messages`,
      { token: users.leader.token, body: { type: 'text', content: `${runId} limited ${i}` } },
      `one-way private message ${i} allowed`
    );
  }
  await expectStatus(
    baseUrl,
    'POST',
    `/api/messages/sessions/${limited.session.id}/messages`,
    403,
    { token: users.leader.token, body: { type: 'text', content: `${runId} limited 4` } },
    'one-way private message limit is enforced'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/messages/sessions/${limited.session.id}/messages`,
    { token: users.oneWay.token, body: { type: 'text', content: `${runId} reply unlock` } },
    'target can reply in one-way private chat'
  );
  await expectStatus(
    baseUrl,
    'POST',
    `/api/messages/sessions/${limited.session.id}/messages`,
    200,
    { token: users.leader.token, body: { type: 'text', content: `${runId} after reply should unlock` } },
    'reply unlocks private chat limit'
  );

  await jsonOk(
    baseUrl,
    'POST',
    '/api/users/follow',
    { token: users.mutualA.token, body: { followee_id: users.mutualB.id, follow_type: 1 } },
    'mutual follow A->B can be created'
  );
  await jsonOk(
    baseUrl,
    'POST',
    '/api/users/follow',
    { token: users.mutualB.token, body: { followee_id: users.mutualA.id, follow_type: 1 } },
    'mutual follow B->A can be created'
  );
  const mutual = await jsonOk(
    baseUrl,
    'POST',
    '/api/messages/sessions/private',
    { token: users.mutualA.token, body: { target_user_id: users.mutualB.id } },
    'private chat opens for mutual follow'
  );
  ids.sessions.push(mutual.session.id);
  for (let i = 1; i <= 4; i++) {
    await jsonOk(
      baseUrl,
      'POST',
      `/api/messages/sessions/${mutual.session.id}/messages`,
      { token: users.mutualA.token, body: { type: 'text', content: `${runId} mutual ${i}` } },
      `mutual private message ${i} allowed`
    );
  }

  await jsonOk(
    baseUrl,
    'POST',
    '/api/users/block',
    { token: users.mutualA.token, body: { blocked_id: users.mutualB.id } },
    'user can block another user'
  );
  await expectStatus(
    baseUrl,
    'POST',
    `/api/messages/sessions/${mutual.session.id}/messages`,
    403,
    { token: users.mutualB.token, body: { type: 'text', content: `${runId} blocked send` } },
    'block prevents private message in both directions'
  );
  await jsonOk(
    baseUrl,
    'DELETE',
    `/api/users/block/${users.mutualB.id}`,
    { token: users.mutualA.token },
    'user can unblock another user'
  );
}

async function runLocationTopicFlow(baseUrl, users) {
  const topic = await jsonOk(
    baseUrl,
    'POST',
    '/api/messages/location-topics',
    {
      token: users.leader.token,
      body: {
        poi_id: `${runId}_poi`,
        poi_name: `${runId} 服务区`,
        poi_location: { lng: 121.48, lat: 31.22 },
        topic_name: `${runId} 路况讨论`
      }
    },
    'location topic can be created'
  );
  ids.topics.push(topic.id);
  ids.sessions.push(topic.session_id);

  await jsonOk(
    baseUrl,
    'GET',
    '/api/messages/location-topics/nearby',
    { qs: { lng: 121.48, lat: 31.22, radius: 10 } },
    'nearby location topics can be browsed without auth'
  );
  await jsonOk(
    baseUrl,
    'GET',
    `/api/messages/location-topics/${topic.id}`,
    { token: users.leader.token },
    'location topic detail loads for creator'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/messages/location-topics/${topic.id}/join`,
    { token: users.member.token },
    'user can join location topic'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/messages/sessions/${topic.session_id}/messages`,
    { token: users.member.token, body: { type: 'text', content: `${runId} location room hello` } },
    'location topic message can be sent'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/messages/location-topics/${topic.id}/follow`,
    { token: users.oneWay.token },
    'user can follow location topic'
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/messages/location-topics/${topic.id}/leave`,
    { token: users.member.token },
    'user can leave location topic'
  );

  await pool.query(
    "UPDATE location_topics SET status = 'archived', updated_at = NOW() WHERE id = ?",
    [topic.id]
  );
  await jsonOk(
    baseUrl,
    'POST',
    `/api/messages/location-topics/${topic.id}/join`,
    { token: users.stranger.token },
    'archived location topic can be revived by joining'
  );

  return topic;
}

async function runSecurityAndSupportFlow(baseUrl, users) {
  const contact = await jsonOk(
    baseUrl,
    'POST',
    '/api/security/contacts',
    {
      token: users.leader.token,
      body: { name: `${runId} emergency`, phone: '13911112222', relationship: '朋友', is_primary: true }
    },
    'emergency contact can be saved'
  );
  ids.contacts.push(contact.id);
  await jsonOk(baseUrl, 'GET', '/api/security/contacts', { token: users.leader.token }, 'emergency contacts list loads');

  const sos = await jsonOk(
    baseUrl,
    'POST',
    '/api/security/sos',
    {
      token: users.leader.token,
      body: {
        location: { lng: 121.47, lat: 31.23 },
        message: `${runId} SOS smoke`
      }
    },
    'SOS event can be created'
  );
  ids.sosEvents.push(sos.id);
  await jsonOk(
    baseUrl,
    'POST',
    `/api/security/sos/${sos.id}/resolve`,
    { token: users.leader.token },
    'SOS event can be resolved'
  );

  const [notificationResult] = await pool.query(
    `INSERT INTO notifications (user_id, type, title, content, payload, created_at)
     VALUES (?, 'system', ?, ?, ?, NOW())`,
    [users.leader.id, `${runId} notice`, `${runId} content`, JSON.stringify({ run_id: runId })]
  );
  ids.notifications.push(notificationResult.insertId);

  await jsonOk(baseUrl, 'GET', '/api/support/notifications', { token: users.leader.token }, 'notifications list loads');
  await jsonOk(
    baseUrl,
    'POST',
    `/api/support/notifications/${notificationResult.insertId}/read`,
    { token: users.leader.token },
    'notification can be marked read'
  );

  const ticket = await jsonOk(
    baseUrl,
    'POST',
    '/api/support/tickets',
    {
      token: users.leader.token,
      body: {
        category: 'bug',
        subject: `${runId} ticket`,
        content: `${runId} ticket content`,
        priority: 'normal'
      }
    },
    'support ticket can be created'
  );
  ids.tickets.push(ticket.id);
  await jsonOk(baseUrl, 'GET', '/api/support/tickets', { token: users.leader.token }, 'support tickets list loads');

  await jsonOk(
    baseUrl,
    'DELETE',
    `/api/security/contacts/${contact.id}`,
    { token: users.leader.token },
    'emergency contact can be deleted'
  );
}

async function runCouponsFlow(baseUrl, users) {
  const template = await jsonOk(
    baseUrl,
    'POST',
    '/api/coupons/templates',
    {
      token: users.admin.token,
      body: {
        name: `${runId} 平台券`,
        type: 'discount',
        face_value: 10,
        min_amount: 0,
        total_quantity: 10,
        valid_days: 7,
        prefix: 'SM',
        description: 'smoke coupon'
      }
    },
    'coupon template can be created'
  );
  ids.couponTemplates.push(template.id);

  await jsonOk(
    baseUrl,
    'PUT',
    `/api/coupons/templates/${template.id}`,
    {
      token: users.admin.token,
      body: { description: 'smoke coupon updated', total_quantity: 20 }
    },
    'coupon template can be updated'
  );
  await jsonOk(baseUrl, 'GET', '/api/coupons/templates', { token: users.admin.token }, 'coupon templates list loads');

  const issue = await jsonOk(
    baseUrl,
    'POST',
    '/api/coupons/issue',
    {
      token: users.admin.token,
      body: { template_id: template.id, user_ids: [users.buyer.id] }
    },
    'coupon can be issued to user'
  );
  const couponCode = issue.details.find((item) => item.user_id === users.buyer.id)?.coupon_code;
  const [[coupon]] = await pool.query('SELECT id FROM user_coupons WHERE coupon_code = ?', [couponCode]);
  ids.userCoupons.push(coupon.id);

  await jsonOk(baseUrl, 'GET', '/api/coupons/my', { token: users.buyer.token }, 'user coupon wallet loads');
  await jsonOk(baseUrl, 'GET', '/api/coupons/available', { token: users.buyer.token }, 'available coupons load');

  await jsonOk(
    baseUrl,
    'POST',
    '/api/coupons/use',
    {
      token: users.buyer.token,
      body: { coupon_id: coupon.id, order_amount: 100, order_id: 99999999 }
    },
    'coupon can be used'
  );
  await jsonOk(
    baseUrl,
    'POST',
    '/api/coupons/return',
    {
      token: users.buyer.token,
      body: { coupon_id: coupon.id, order_id: 99999999 }
    },
    'coupon can be returned'
  );

  return coupon.id;
}

async function runMerchantGroupBuyOrderFlow(baseUrl, users, couponId) {
  const merchant = await jsonOk(
    baseUrl,
    'POST',
    '/api/merchants/apply',
    {
      token: users.merchant.token,
      body: {
        name: `${runId} 营地商家`,
        type: 'camping',
        logo: `https://example.com/${runId}.png`,
        images: [`https://example.com/${runId}-1.png`],
        phone: '13922223333',
        address: `${runId} 地址`,
        location: { lng: 121.49, lat: 31.21 },
        business_hours: { open: '09:00', close: '18:00' },
        description: `${runId} merchant`,
        qualifications: [`https://example.com/${runId}-license.png`]
      }
    },
    'merchant application can be submitted'
  );
  const merchantId = merchant.merchant_id || merchant.id;
  ids.merchants.push(merchantId);
  await markMerchantApproved(merchantId);
  await jsonOk(baseUrl, 'GET', '/api/merchants/my', { token: users.merchant.token }, 'approved merchant dashboard loads');

  const product = await jsonOk(
    baseUrl,
    'POST',
    '/api/merchants/products',
    {
      token: users.merchant.token,
      body: {
        name: `${runId} 露营套餐`,
        original_price: 199,
        price_tiers: [
          { count: 2, price: 159 },
          { count: 3, price: 139 }
        ],
        description: `${runId} product`,
        images: [`https://example.com/${runId}-product.png`],
        max_quantity: 20,
        expiry_hours: 24,
        min_count: 2
      }
    },
    'merchant can create group-buy product'
  );
  const productId = product.product_id || product.id;
  ids.products.push(productId);

  await jsonOk(baseUrl, 'GET', '/api/group-buy/products', {}, 'group-buy product list loads');
  await jsonOk(baseUrl, 'GET', `/api/group-buy/products/${productId}`, {}, 'group-buy product detail loads');

  const activity = await jsonOk(
    baseUrl,
    'POST',
    '/api/group-buy/activities',
    {
      token: users.leader.token,
      body: { product_id: productId, target_count: 2 }
    },
    'group-buy activity can be created'
  );
  ids.activities.push(activity.activity_id);

  const joined = await jsonOk(
    baseUrl,
    'POST',
    `/api/group-buy/activities/${activity.activity_id}/join`,
    { token: users.buyer.token },
    'buyer can join group-buy and receive pending order'
  );
  ids.participants.push(joined.participant_id);
  ids.orders.push(joined.order.id);

  const [[prePayActivity]] = await pool.query(
    'SELECT current_count, status FROM group_buy_activities WHERE id = ?',
    [activity.activity_id]
  );
  assert(Number(prePayActivity.current_count) === 1 && Number(prePayActivity.status) === 1, 'group-buy count waits for paid callback');

  await jsonOk(baseUrl, 'GET', `/api/group-buy/activities/${activity.activity_id}`, { token: users.buyer.token }, 'group-buy activity detail loads');
  await jsonOk(baseUrl, 'GET', `/api/group-buy/activities/${activity.activity_id}/share`, { token: users.buyer.token }, 'group-buy share data loads');
  await jsonOk(baseUrl, 'GET', '/api/group-buy/activities/my', { token: users.buyer.token }, 'my group-buy activities load');
  await jsonOk(baseUrl, 'GET', '/api/orders', { token: users.buyer.token }, 'user order list loads');
  await jsonOk(baseUrl, 'GET', `/api/orders/${joined.order.id}`, { token: users.buyer.token }, 'order detail loads');
  await jsonOk(baseUrl, 'POST', `/api/orders/${joined.order.id}/pay`, { token: users.buyer.token }, 'sandbox order pay endpoint returns payment params');

  const unsafeCallback = await request(
    baseUrl,
    'POST',
    '/api/orders/payment-callback',
    { body: { order_no: joined.order.order_no, transaction_id: `${runId}_official_should_fail` } }
  );
  const [[stillPending]] = await pool.query(
    'SELECT status FROM orders WHERE id = ?',
    [joined.order.id]
  );
  assert(
    unsafeCallback.status >= 400 && Number(stillPending.status) === 0,
    'unsigned payment callback is rejected and does not mark order paid'
  );

  process.env.INTEGRATION_MODE = 'sandbox';
  await jsonOk(
    baseUrl,
    'POST',
    '/api/orders/payment-callback',
    { body: { sandbox: true, order_no: joined.order.order_no, transaction_id: `${runId}_sandbox_tx` } },
    'sandbox payment callback marks order paid'
  );
  await jsonOk(
    baseUrl,
    'POST',
    '/api/orders/payment-callback',
    { body: { sandbox: true, order_no: joined.order.order_no, transaction_id: `${runId}_sandbox_tx_replay` } },
    'payment callback replay is idempotent'
  );

  const [[paidOrder]] = await pool.query(
    'SELECT status, transaction_id FROM orders WHERE id = ?',
    [joined.order.id]
  );
  assert(Number(paidOrder.status) === 2, 'order is paid after verified callback');

  const verify = await jsonOk(
    baseUrl,
    'GET',
    `/api/orders/${joined.order.id}/verify-code`,
    { token: users.buyer.token },
    'buyer can get verification code for paid order'
  );
  await jsonOk(
    baseUrl,
    'POST',
    '/api/orders/verify',
    {
      token: users.merchant.token,
      body: { verify_code: verify.verification_code }
    },
    'merchant can verify paid order'
  );
  await expectStatus(
    baseUrl,
    'POST',
    '/api/orders/verify',
    400,
    {
      token: users.merchant.token,
      body: { verify_code: verify.verification_code }
    },
    'duplicate order verification is rejected'
  );
  await jsonOk(baseUrl, 'GET', '/api/orders/merchant', { token: users.merchant.token }, 'merchant order list loads');
  await jsonOk(baseUrl, 'GET', '/api/merchants/orders', { token: users.merchant.token }, 'merchant route order list loads');
  await jsonOk(baseUrl, 'GET', '/api/orders/verification-stats', { token: users.merchant.token }, 'verification stats load');
  await jsonOk(baseUrl, 'GET', '/api/merchants/products', { token: users.merchant.token }, 'merchant product list loads');
  await jsonOk(baseUrl, 'GET', '/api/merchants/settlements', { token: users.merchant.token }, 'merchant settlements list loads');
  await jsonOk(baseUrl, 'GET', '/api/merchants/promotion-code', { token: users.merchant.token }, 'merchant promotion code loads');
  await jsonOk(baseUrl, 'GET', '/api/merchants/repair-services', { qs: { lng: 121.49, lat: 31.21 } }, 'repair service discovery loads');

  const directOrder = await jsonOk(
    baseUrl,
    'POST',
    '/api/orders',
    {
      token: users.buyer.token,
      body: {
        product_id: productId,
        activity_id: activity.activity_id,
        coupon_id: couponId
      }
    },
    'order can be created with coupon discount'
  );
  ids.orders.push(directOrder.id);
}

async function runAdminAndSchedulerFlow(baseUrl, users) {
  await jsonOk(baseUrl, 'GET', '/api/admin/dashboard', { token: users.admin.token }, 'admin dashboard loads');
  await jsonOk(baseUrl, 'GET', '/api/admin/users', { token: users.admin.token }, 'admin users list loads');
  await jsonOk(baseUrl, 'GET', `/api/admin/users/${users.leader.id}`, { token: users.admin.token }, 'admin user detail loads');
  await jsonOk(baseUrl, 'GET', '/api/admin/merchants', { token: users.admin.token }, 'admin merchant list loads');
  await jsonOk(baseUrl, 'GET', '/api/admin/orders', { token: users.admin.token }, 'admin order list loads');
  await jsonOk(baseUrl, 'GET', '/api/admin/group-buys', { token: users.admin.token }, 'admin group-buy list loads');
  await jsonOk(baseUrl, 'GET', '/api/admin/coupons', { token: users.admin.token }, 'admin coupon dashboard loads');
  await jsonOk(baseUrl, 'GET', '/api/admin/invites', { token: users.admin.token }, 'admin invite stats load');
  await jsonOk(baseUrl, 'GET', '/api/admin/growth/config', { token: users.admin.token }, 'admin growth config loads');
  await jsonOk(baseUrl, 'GET', '/api/admin/logs', { token: users.admin.token }, 'admin operation logs load');
  await jsonOk(baseUrl, 'GET', '/api/admin/health', { token: users.admin.token }, 'admin health check loads');

  const archiveResult = await scheduler.archiveLocationTopicsOnce();
  assert(typeof archiveResult.archived_count === 'number', 'scheduler location topic archive can run once');
  const expireCoupons = await scheduler.expireCouponsOnce();
  assert(typeof expireCoupons.expired_count === 'number', 'scheduler coupon expiry can run once');
  const detachResult = await scheduler.checkDetachedMembersOnce();
  assert(typeof detachResult.detached_count === 'number', 'scheduler auto-detach can run once');
}

async function cleanup() {
  function marks(values) {
    return values.map(() => '?').join(', ');
  }

  async function del(table, column, values) {
    const unique = [...new Set(values.filter(Boolean).map(Number))];
    if (unique.length === 0) return;
    await pool.query(`DELETE FROM ${table} WHERE ${column} IN (${marks(unique)})`, unique);
  }

  try {
    await del('chat_messages', 'session_id', ids.sessions);
    await del('chat_messages', 'id', ids.messages);
    await del('chat_session_members', 'session_id', ids.sessions);
    await del('location_topics', 'id', ids.topics);
    await del('chat_sessions', 'id', ids.sessions);
    await del('location_records', 'user_id', ids.users);
    await del('trip_members', 'trip_id', ids.trips);
    await del('next_trip_drafts', 'id', ids.drafts);
    await del('trips', 'id', ids.trips);
    await del('settlement_records', 'order_id', ids.orders);
    await del('refund_requests', 'order_id', ids.orders);
    await del('group_buy_participants', 'activity_id', ids.activities);
    await del('group_buy_participants', 'id', ids.participants);
    await del('orders', 'id', ids.orders);
    await del('group_buy_activities', 'id', ids.activities);
    await del('group_buy_price_tiers', 'product_id', ids.products);
    await del('group_buy_products', 'id', ids.products);
    await del('user_coupons', 'id', ids.userCoupons);
    await del('coupon_templates', 'id', ids.couponTemplates);
    await del('notifications', 'id', ids.notifications);
    await del('customer_service_tickets', 'id', ids.tickets);
    await del('emergency_contacts', 'user_id', ids.users);
    await del('sos_events', 'id', ids.sosEvents);
    await del('follows', 'follower_id', ids.users);
    await del('follows', 'followee_id', ids.users);
    await del('user_blocks', 'blocker_id', ids.users);
    await del('user_blocks', 'blocked_id', ids.users);
    await del('admin_user_roles', 'user_id', ids.users);
    await del('operation_logs', 'user_id', ids.users);
    await del('merchants', 'id', ids.merchants);
    await del('users', 'id', ids.users);
  } catch (error) {
    console.warn('[Smoke] cleanup warning:', error.message);
  }
}

async function main() {
  const server = await startServer();
  try {
    const users = {
      admin: await createUser('admin', { is_admin: true }),
      leader: await createUser('leader', { is_certified: 2 }),
      member: await createUser('member', { is_certified: 2 }),
      kicked: await createUser('kicked', { is_certified: 2 }),
      uncertified: await createUser('uncertified', { is_certified: 0 }),
      stranger: await createUser('stranger', { is_certified: 2 }),
      oneWay: await createUser('one_way', { is_certified: 2 }),
      mutualA: await createUser('mutual_a', { is_certified: 2 }),
      mutualB: await createUser('mutual_b', { is_certified: 2 }),
      merchant: await createUser('merchant', { is_certified: 2 }),
      buyer: await createUser('buyer', { is_certified: 2 })
    };

    await runHealthAndAuth(server.baseUrl);
    await jsonOk(server.baseUrl, 'GET', '/api/users/profile', { token: users.leader.token }, 'user profile loads');
    await jsonOk(server.baseUrl, 'PUT', '/api/users/profile', { token: users.leader.token, body: { signature: `${runId} signature` } }, 'user profile can be updated');
    await jsonOk(server.baseUrl, 'GET', '/api/users/growth', { token: users.leader.token }, 'user growth loads');
    await jsonOk(server.baseUrl, 'GET', '/api/users/badges', { token: users.leader.token }, 'user badges load');
    await jsonOk(server.baseUrl, 'GET', `/api/users/home/${users.member.id}`, { token: users.leader.token }, 'public user home loads');
    await jsonOk(server.baseUrl, 'GET', '/api/users/invite', { token: users.leader.token }, 'invite info loads');
    await jsonOk(server.baseUrl, 'PUT', '/api/users/privacy/discoverable', { token: users.leader.token, body: { discoverable: false } }, 'discoverable privacy can be toggled');

    const trip = await runUserAndTripFlow(server.baseUrl, users);
    await runChatFlow(server.baseUrl, users, trip);
    await runLocationTopicFlow(server.baseUrl, users);
    await runSecurityAndSupportFlow(server.baseUrl, users);
    const couponId = await runCouponsFlow(server.baseUrl, users);
    await runMerchantGroupBuyOrderFlow(server.baseUrl, users, couponId);
    await runAdminAndSchedulerFlow(server.baseUrl, users);

    console.log(JSON.stringify({
      run_id: runId,
      passed: results.length,
      failed: 0
    }, null, 2));
  } finally {
    await cleanup();
    await server.close();
    await redis.quit().catch(() => {});
    await pool.end();
  }
}

main().catch(async (error) => {
  console.error(`FAIL ${error.smokeName || 'smoke-v1'} - ${error.message}`);
  console.error(JSON.stringify({
    run_id: runId,
    passed: results.length,
    failed: 1,
    error: error.message
  }, null, 2));
  process.exitCode = 1;
});
