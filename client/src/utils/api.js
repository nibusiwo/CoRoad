/**
 * CoRoad API Utility Module
 * 同道 - 自驾社交平台 接口请求封装
 */

// ==================== 配置 ====================
// 开发环境使用本地地址，生产环境使用线上地址
// 微信小程序环境不支持 process.env，使用 Uni-App 条件编译 + import.meta.env 替代
/* #ifdef H5 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
/* #endif */

/* #ifdef MP-WEIXIN */
// 微信小程序 <image> 只支持 HTTPS 地址。
  // 默认使用 ngrok 静态域名（手机真机/体验版需访问公网域名）：
  //   https://patronage-native-impeding.ngrok-free.dev
  // 如需切换域名，通过环境变量注入：
  //   $env:VITE_API_BASE_URL='https://你的域名/api'; npm.cmd run build:mp-weixin
  // 注意：若默认值使用 localhost，手机真机上 localhost 指向手机本身，
  // 会导致接口无法访问、登录失败（仅微信开发者工具内可用）。
  const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'https://patronage-native-impeding.ngrok-free.dev/api').replace(/\/+$/, '');
/* #endif */

/* #ifndef H5 || MP-WEIXIN */
const BASE_URL = '/api';
/* #endif */

// 上传文件(头像/背景图/图片/语音)访问源
// H5 走 Vite 代理(/uploads -> 后端),保留相对路径即可;
// 微信小程序无法解析相对路径,必须拼上后端源地址。
/* #ifdef MP-WEIXIN */
// 上传/静态资源源地址：默认由 API 地址推导（去掉末尾 /api），也可单独覆盖
const UPLOAD_BASE_URL = import.meta.env.VITE_UPLOAD_BASE_URL || BASE_URL.replace(/\/api$/, '');
/* #endif */

/* #ifndef MP-WEIXIN */
const UPLOAD_BASE_URL = '';
/* #endif */

// 请求超时时间（毫秒）
const TIMEOUT = 30000;

// ngrok 免费版浏览器确认页跳过请求头
// 仅当 API 走 ngrok 域名时携带，其他环境不添加
const NGROK_SKIP_WARNING = BASE_URL.includes('ngrok') ? { 'ngrok-skip-browser-warning': 'true' } : {};

// 是否显示 loading 的阈值（毫秒），超过此时间的请求会显示 loading
const LOADING_THRESHOLD = 800;

// ==================== 工具函数 ====================

/**
 * 获取存储的 token
 */
function getToken() {
  try {
    const token = uni.getStorageSync('token');
    return token || '';
  } catch (e) {
    return '';
  }
}

/**
 * 并发 401 去重标志:同一时刻只允许一次 reLaunch,避免兄弟请求被多次中断
 * (reLaunch 会中止当前页所有进行中的 XHR/资源加载,产生大量 ERR_ABORTED 噪音)
 */
let isRedirecting = false;

/**
 * 清除登录态并跳转登录页
 * 多个并发请求同时收到 401 时,只由第一个触发 reLaunch,其余静默返回
 */
function clearAuthAndRedirect() {
  // 已在跳转中,静默返回,避免重复 reLaunch 中断兄弟请求
  if (isRedirecting) return;

  // 已在登录页,无需跳转
  const pages = getCurPages();
  const currentPage = pages[pages.length - 1];
  if (currentPage && currentPage.route === 'pages/login/index') {
    return;
  }

  isRedirecting = true;
  try {
    uni.removeStorageSync('token');
    uni.removeStorageSync('userInfo');
  } catch (e) {
    // ignore
  }
  // 兜底:2s 后强制重置,防止 complete 未回调导致标志永久卡死
  // (H5 下 reLaunch 会重建页面上下文,标志自然重置;小程序下 reLaunch 不重建 JS 上下文,需要此兜底)
  setTimeout(() => { isRedirecting = false; }, 2000);
  uni.reLaunch({
    url: '/pages/login/index',
    complete: () => {
      // 跳转结束(无论成功失败)重置标志,允许后续再次触发
      isRedirecting = false;
    }
  });
}

/**
 * 获取当前页面栈（安全封装）
 */
function getCurPages() {
  try {
    return uni.$currentPages || []
  } catch (e) {
    return []
  }
}

// ==================== 请求封装 ====================

/**
 * 显示 loading
 */
let loadingTimer = null;
let loadingVisible = false;

function showLoading(title) {
  loadingTimer = setTimeout(() => {
    uni.showLoading({
      title: title || '加载中...',
      mask: true
    });
    loadingVisible = true;
  }, LOADING_THRESHOLD);
}

function hideLoading() {
  if (loadingTimer) {
    clearTimeout(loadingTimer);
    loadingTimer = null;
  }
  if (loadingVisible) {
    uni.hideLoading();
    loadingVisible = false;
  }
}

/**
 * 构建完整 URL
 */
function buildUrl(url) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return BASE_URL + url;
}

/**
 * 将后端返回的相对资源路径(如 /uploads/xxx.png)解析为可访问的绝对 URL。
 * 微信小程序中 <image> 无法加载相对路径,必须拼接完整源地址。
 * @param {string} url
 * @returns {string}
 */
function resolveAssetUrl(url) {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/static/')) {
    return url;
  }
  if (url.startsWith('/uploads/')) {
    return UPLOAD_BASE_URL + url;
  }
  return url;
}

/**
 * 核心请求方法
 * @param {Object} options 请求配置
 * @param {string} options.url 请求地址
 * @param {string} options.method 请求方法 GET/POST/PUT/DELETE
 * @param {Object} options.data 请求数据
 * @param {Object} options.header 自定义请求头
 * @param {boolean} options.showLoading 是否显示 loading，默认 true
 * @param {string} options.loadingText loading 文案
 * @param {boolean} options.showError 是否显示错误提示，默认 true
 * @param {boolean} options.auth 是否需要携带 token，默认 true
 * @returns {Promise}
 */
function request(options) {
  const {
    url,
    method = 'GET',
    data = {},
    header = {},
    showLoading: shouldShowLoading = false,
    loadingText = '加载中...',
    showError = true,
    auth = true,
    skipAuthRedirect = false
  } = options;

  return new Promise((resolve, reject) => {
    // 显示 loading
    if (shouldShowLoading) {
      showLoading(loadingText);
    }

    // 构建请求头
    const headers = {
      'Content-Type': 'application/json',
      ...NGROK_SKIP_WARNING,
      ...header
    };

    // 添加 Authorization
    if (auth) {
      const token = getToken();
      if (token) {
        headers['Authorization'] = 'Bearer ' + token;
      }
    }

    uni.request({
      url: buildUrl(url),
      method: method.toUpperCase(),
      data: data,
      header: headers,
      timeout: TIMEOUT,
      success: (res) => {
        hideLoading();

        const statusCode = res.statusCode;
        const responseData = res.data;

        // HTTP 状态码处理
        if (statusCode === 200) {
          // 业务状态码处理
          const code = responseData.code;
          if (code === 0 || code === 200) {
            resolve(responseData.data !== undefined ? responseData.data : responseData);
          } else if (code === 401) {
            // token 过期或无效
            if (auth && !skipAuthRedirect) {
              clearAuthAndRedirect();
            }
            if (showError) {
              uni.showToast({
                title: responseData.message || '登录已过期，请重新登录',
                icon: 'none',
                duration: 2000
              });
            }
            reject(responseData);
          } else {
            // 其他业务错误
            if (showError) {
              uni.showToast({
                title: responseData.message || '请求失败',
                icon: 'none',
                duration: 2000
              });
            }
            reject(responseData);
          }
        } else if (statusCode === 401) {
          if (auth && !skipAuthRedirect) {
            clearAuthAndRedirect();
          }
          if (showError) {
            uni.showToast({
              title: '登录已过期，请重新登录',
              icon: 'none',
              duration: 2000
            });
          }
          reject(responseData);
        } else if (statusCode === 500) {
          if (showError) {
            uni.showToast({
              title: '服务器繁忙，请稍后再试',
              icon: 'none',
              duration: 2000
            });
          }
          reject(responseData);
        } else {
          // 处理 429、422、403 等业务状态码
          const errorMsg = responseData?.message || '请求失败，请重试';
          if (showError) {
            uni.showToast({
              title: errorMsg,
              icon: 'none',
              duration: 2000
            });
          }
          reject(responseData || { message: errorMsg });
        }
      },
      fail: (err) => {
        hideLoading();
        console.error('[API] request failed:', requestUrl, err);
        if (showError) {
          uni.showToast({
            title: '网络异常，请检查网络连接',
            icon: 'none',
            duration: 2000
          });
        }
        reject(err);
      }
    });
  });
}

// ==================== 请求快捷方法 ====================

function get(url, data, options) {
  return request({ url, method: 'GET', data, ...options });
}

function post(url, data, options) {
  return request({ url, method: 'POST', data, ...options });
}

function put(url, data, options) {
  return request({ url, method: 'PUT', data, ...options });
}

function del(url, data, options) {
  return request({ url, method: 'DELETE', data, ...options });
}

/**
 * 文件上传
 * @param {string} url 上传地址
 * @param {string} filePath 文件路径
 * @param {Object} formData 额外表单数据
 * @param {Object} options 其他配置
 */
function upload(url, filePath, formData, options) {
  const {
    showLoading: shouldShowLoading = false,
    loadingText = '上传中...',
    showError = true,
    auth = true,
    name = 'file'
  } = options || {};

  return new Promise((resolve, reject) => {
    if (shouldShowLoading) {
      showLoading(loadingText);
    }

    const headers = {
      ...NGROK_SKIP_WARNING
    };
    if (auth) {
      const token = getToken();
      if (token) {
        headers['Authorization'] = 'Bearer ' + token;
      }
    }

    uni.uploadFile({
      url: buildUrl(url),
      filePath: filePath,
      name: name,
      formData: formData || {},
      header: headers,
      timeout: TIMEOUT * 2,
      success: (res) => {
        hideLoading();
        try {
          const responseData = JSON.parse(res.data);
          const statusCode = res.statusCode;

          if (statusCode === 200) {
            const code = responseData.code;
            if (code === 0 || code === 200) {
              resolve(responseData.data !== undefined ? responseData.data : responseData);
            } else if (code === 401) {
              if (auth) clearAuthAndRedirect();
              if (showError) {
                uni.showToast({
                  title: responseData.message || '登录已过期',
                  icon: 'none',
                  duration: 2000
                });
              }
              reject(responseData);
            } else {
              if (showError) {
                uni.showToast({
                  title: responseData.message || '上传失败',
                  icon: 'none',
                  duration: 2000
                });
              }
              reject(responseData);
            }
          } else {
            if (showError) {
              uni.showToast({
                title: '上传失败，请重试',
                icon: 'none',
                duration: 2000
              });
            }
            reject(responseData || { message: '上传失败' });
          }
        } catch (e) {
          if (showError) {
            uni.showToast({
              title: '数据解析失败',
              icon: 'none',
              duration: 2000
            });
          }
          reject(e);
        }
      },
      fail: (err) => {
        hideLoading();
        if (showError) {
          uni.showToast({
            title: '上传失败，请检查网络',
            icon: 'none',
            duration: 2000
          });
        }
        reject(err);
      }
    });
  });
}

// ==================== API 接口函数 ====================

// ---- Auth 认证模块 ----

const authApi = {
  /** 发送验证码（公共接口，不需要登录态） */
  sendCode(phone) {
    return post('/auth/send-code', { phone }, { auth: false, showLoading: false });
  },

  /** 微信登录 */
  wechatLogin(code, userInfo) {
    return post('/auth/wechat-login', {
      code,
      nickname: userInfo?.nickName || '',
      avatar: userInfo?.avatarUrl || ''
    }, { auth: false, showLoading: true, loadingText: '登录中...' });
  },

  /** 手机号验证码登录 */
  phoneLogin(phone, code) {
    return post('/auth/phone-login', { phone, code }, { auth: false, showLoading: true, loadingText: '登录中...' });
  },

  /** 手机号密码登录 */
  passwordLogin(phone, password) {
    return post('/auth/password-login', { phone, password }, { auth: false, showLoading: true, loadingText: '登录中...' });
  },

  /** 手机号注册（验证码 + 密码） */
  register(phone, code, password, nickname) {
    return post('/auth/register', { phone, code, password, nickname }, { auth: false, showLoading: true, loadingText: '注册中...' });
  },

  /** 刷新 token（需要携带有效 token） */
  refreshToken() {
    return post('/auth/refresh-token', {}, { auth: true, showError: false });
  },

  /** 修改手机号（需验证码） */
  changePhone(phone, code) {
    return post('/auth/change-phone', { phone, code });
  },

  /** 修改密码（首次设置可不传旧密码） */
  changePassword(old_password, new_password) {
    return post('/auth/change-password', { old_password, new_password });
  },

  /** 注销账号 */
  deactivate() {
    return post('/auth/deactivate');
  }
};

// ---- User 用户模块 ----

const userApi = {
  /** 获取个人信息 */
  getProfile() {
    return get('/users/profile');
  },

  /** 更新个人信息 */
  updateProfile(data) {
    return put('/users/profile', data);
  },

  /** 车主认证 */
  certifyVehicle(data) {
    return post('/users/certify', data);
  },

  /** 获取成长值 */
  getGrowth() {
    return get('/users/growth');
  },

  /** 获取徽章 */
  getBadges() {
    return get('/users/badges');
  },

  /** 获取用户主页 */
  getUserHome(userId) {
    return get('/users/home/' + userId);
  },

  /** 获取邀请信息 */
  getInviteInfo() {
    return get('/users/invite');
  },

  /** 绑定邀请人 */
  bindInviter(phone) {
    return post('/users/invite/bind', { phone });
  },

  /** 切换可见状态 */
  toggleDiscoverable() {
    return put('/users/privacy/discoverable');
  },

  /** 获取哨兵模式状态 */
  getSentinel() {
    return get('/users/sentinel');
  },

  /** 开启/关闭哨兵模式 */
  updateSentinel(enabled) {
    return put('/users/sentinel', { enabled });
  },

  /** 获取关注列表(type=1 用户,type=2 车队) */
  getFollowing(page, followType) {
    return get('/users/following', { page: page || 1, type: followType || 1 });
  },

  /** 获取粉丝列表 */
  getFollowers(page) {
    return get('/users/followers', { page: page || 1 });
  },

  /** 关注用户 */
  follow(followeeId, followType) {
    return post('/users/follow', { followeeId, followType: followType || 1 });
  },

  /** 取消关注 */
  unfollow(followeeId, followType) {
    return del('/users/follow/' + followeeId, { type: followType || 1 });
  },

  /** 屏蔽用户 */
  blockUser(blockedId) {
    return post('/users/block', { blocked_id: blockedId });
  },

  /** 取消屏蔽 */
  unblockUser(userId) {
    return del('/users/block/' + userId);
  },

  /** 每日签到 */
  dailyCheckin() {
    return post('/users/checkin');
  }
};

// ---- Trip 行程模块 ----

const tripApi = {
  /** 创建行程 */
  createTrip(data) {
    return post('/trips', data);
  },

  /** 获取行程列表 */
  getTripList(params, options) {
    return get('/trips', params, options);
  },

  /** 获取附近行程 */
  getNearbyTrips(lng, lat) {
    return get('/trips/nearby', { lng, lat }, { skipAuthRedirect: true });
  },

  /** 获取行程详情 */
  getTripDetail(id) {
    return get('/trips/' + id);
  },

  /** 更新行程 */
  updateTrip(id, data) {
    return put('/trips/' + id, data);
  },

  /** 开始行程 */
  startTrip(id) {
    return post('/trips/' + id + '/start');
  },

  /** 结束行程 */
  finishTrip(id) {
    return post('/trips/' + id + '/finish');
  },

  /** 取消行程 */
  cancelTrip(id) {
    return del('/trips/' + id);
  },

  /** 申请加入行程 */
  applyJoin(id) {
    return post('/trips/' + id + '/join');
  },

  /** 同意成员加入 */
  approveMember(tripId, userId) {
    return post('/trips/' + tripId + '/approve/' + userId);
  },

  /** 拒绝成员加入 */
  rejectMember(tripId, userId) {
    return post('/trips/' + tripId + '/reject/' + userId);
  },

  /** 移除成员 */
  removeMember(tripId, userId) {
    return del('/trips/' + tripId + '/members/' + userId);
  },

  /** 退出行程 */
  leaveTrip(id) {
    return post('/trips/' + id + '/leave');
  },

  /** 获取行程成员列表 */
  getTripMembers(id) {
    return get('/trips/' + id + '/members');
  },

  // ---- 下一段行程(草稿) ----

  /** 创建行程草稿 */
  createDraft(data) {
    return post('/trips/next', data);
  },

  /** 获取草稿列表 */
  getDrafts(options) {
    return get('/trips/next', {}, options);
  },

  /** 更新草稿 */
  updateDraft(id, data) {
    return put('/trips/next/' + id, data);
  },

  /** 删除草稿 */
  deleteDraft(id) {
    return del('/trips/next/' + id);
  },

  /** 发布草稿 */
  publishDraft(id) {
    return post('/trips/next/' + id + '/publish');
  }
};

function resolveChatTargetUserId(target) {
  if (!target) return '';
  if (typeof target !== 'object') return target;
  const leaderInfo = target.leaderInfo || target.leader_info || {};
  return target.userId || target.user_id || target.id ||
    target.captainId || target.captain_id ||
    target.leaderId || target.leader_id ||
    leaderInfo.id || '';
}

// ---- Chat 聊天模块 ----

const chatApi = {
  /** 获取会话列表 */
  getSessions(type) {
    return get('/messages/sessions', { type: type || 'all' });
  },

  /** 获取会话详情（消息列表） */
  getSessionDetail(id, page) {
    return get('/messages/sessions/' + id, { page: page || 1 });
  },

  /** 发送消息 */
  sendMessage(sessionId, data) {
    return post('/messages/sessions/' + sessionId + '/messages', data);
  },

  /** 创建私聊会话 */
  createPrivateSession(userId) {
    const targetUserId = resolveChatTargetUserId(userId);
    if (!targetUserId) {
      return Promise.reject({ message: '目标用户ID缺失' });
    }
    return post('/messages/sessions/private', { target_user_id: targetUserId }, { showError: false });
  },

  /** 获取未读消息数 */
  getUnreadCount() {
    return get('/messages/unread', {}, { showLoading: false, showError: false });
  },

  /** 标记已读 */
  markAsRead(sessionId) {
    return post('/messages/sessions/' + sessionId + '/read', {}, { showLoading: false, showError: false });
  },

  /** 清空会话聊天记录 */
  clearSession(sessionId) {
    return post('/messages/sessions/' + sessionId + '/clear');
  },

  /** 退出群聊/删除会话 */
  leaveSession(sessionId) {
    return post('/messages/sessions/' + sessionId + '/leave');
  },

  /** 获取会话成员列表 */
  getSessionMembers(sessionId) {
    return get('/messages/sessions/' + sessionId + '/members');
  },

  // ---- 话题组 ----

  /** 获取附近话题 */
  getNearbyTopics(lng, lat) {
    return get('/messages/location-topics/nearby', { lng, lat });
  },

  /** 获取我的话题 */
  getMyTopics() {
    return get('/messages/location-topics/my');
  },

  /** 创建话题 */
  createTopic(data) {
    return post('/messages/location-topics', data);
  },

  /** 加入话题 */
  joinTopic(id) {
    return post('/messages/location-topics/' + id + '/join');
  },

  /** 退出话题 */
  leaveTopic(id) {
    return post('/messages/location-topics/' + id + '/leave');
  }
};

// ---- Location 位置模块 ----

const locationApi = {
  /** 上报位置 */
  reportLocation(lng, lat, altitude, speed, direction) {
    return post('/locations/report', {
      lng, lat, altitude: altitude || 0,
      speed: speed || 0, direction: direction || 0
    }, { showLoading: false, showError: false });
  },

  /** 获取队伍位置 */
  getTeamLocations() {
    return get('/locations/team');
  },

  /** 获取附近队伍 */
  getNearbyTeams(lng, lat) {
    return get('/locations/nearby-teams', { lng, lat });
  },

  /** 获取地图数据 */
  getMapData(lng, lat, zoom) {
    return get('/locations/map-data', { lng, lat, zoom: zoom || 12 }, { auth: false });
  }
};

// ---- GroupBuy 团购模块 ----

const groupBuyApi = {
  /** 获取团购商品列表 */
  getProducts(params) {
    return get('/group-buy/products', params);
  },

  /** 获取商品详情 */
  getProductDetail(id) {
    return get('/group-buy/products/' + id);
  },

  /** 发起拼团活动 */
  createActivity(data) {
    return post('/group-buy/activities', data);
  },

  /** 获取拼团活动详情 */
  getActivityDetail(id) {
    return get('/group-buy/activities/' + id);
  },

  /** 参与拼团 */
  joinActivity(id, data) {
    return post('/group-buy/activities/' + id + '/join', data || {});
  },

  /** 获取用户参与的活动 */
  getUserActivities(page) {
    return get('/group-buy/activities/my', { page: page || 1 });
  },

  /** 分享活动 */
  shareActivity(id) {
    return get('/group-buy/activities/' + id + '/share');
  }
};

// ---- Order 订单模块 ----

const orderApi = {
  /** 创建订单 */
  createOrder(data) {
    return post('/orders', data);
  },

  /** 获取订单列表 */
  getOrders(params) {
    return get('/orders', params);
  },

  /** 获取订单详情 */
  getOrderDetail(id) {
    return get('/orders/' + id);
  },

  /** 发起支付 */
  payOrder(id) {
    return post('/orders/' + id + '/pay');
  },

  /** 申请退款 */
  refundOrder(id) {
    return post('/orders/' + id + '/refund');
  },

  /** 获取核销码 */
  getVerificationCode(id) {
    return get('/orders/' + id + '/verify-code');
  }
};

// ---- Coupon 优惠券模块 ----

const couponApi = {
  /** 获取我的优惠券 */
  getMyCoupons(status) {
    return get('/coupons/my', { status: status || 'all' });
  },

  /** 获取商户可用优惠券 */
  getAvailableCoupons(merchantId) {
    return get('/coupons/available', { merchantId });
  }
};

// ---- Merchant 商户模块 ----

const merchantApi = {
  getMyMerchant() {
    return get('/merchants/my');
  },
  updateMerchant(data) {
    return put('/merchants/my', data);
  },
  getProducts(params) {
    return get('/merchants/products', params);
  },
  createProduct(data) {
    return post('/merchants/products', data);
  },
  updateProduct(id, data) {
    return put('/merchants/products/' + id, data);
  },
  toggleProduct(id, status) {
    return put('/merchants/products/' + id + '/toggle', { status });
  },
  getOrders(params) {
    return get('/merchants/orders', params);
  },
  getSettlements(params) {
    return get('/merchants/settlements', params);
  },
  getLevel() {
    return get('/merchants/level');
  },
  toggleInviteCoupon(enabled) {
    return put('/merchants/settings/invite-coupon', { enabled });
  },
  toggleRewardPool(enabled) {
    return put('/merchants/settings/reward-pool', { enabled });
  },
  getPromotionCode() {
    return get('/merchants/promotion-code');
  },
  /** 获取商户详情 */
  getMerchantDetail(id) {
    return get('/merchants/' + id);
  },

  /** 获取附近维修服务 */
  getRepairServices(lng, lat) {
    return get('/merchants/repair-services', { lng, lat });
  }
};

// ---- Security 安全模块 ----

const securityApi = {
  /** 获取紧急联系人列表 */
  getContacts() {
    return get('/security/contacts');
  },

  /** 保存紧急联系人 */
  addContact(data) {
    return post('/security/contacts', data);
  },

  /** 删除紧急联系人 */
  deleteContact(id) {
    return del('/security/contacts/' + id);
  }
};

// ---- Map 地图模块 ----

const mapApi = {
  /** 获取路况事件 */
  getTrafficEvents(lng, lat) {
    return get('/map/traffic-events', { lng, lat });
  },

  /** 获取路线信息 */
  getRouteInfo(origin, destination) {
    return get('/map/route-info', {
      origin_lng: origin.lng,
      origin_lat: origin.lat,
      dest_lng: destination.lng,
      dest_lat: destination.lat
    });
  }
};

// ==================== 导出 ====================

// 默认导出
export default {
  // 配置
  BASE_URL,
  TIMEOUT,

  // 请求方法
  request,
  get,
  post,
  put,
  del,
  upload,
  resolveAssetUrl,

  // API 模块
  auth: authApi,
  user: userApi,
  trip: tripApi,
  chat: chatApi,
  location: locationApi,
  groupBuy: groupBuyApi,
  order: orderApi,
  coupon: couponApi,
  merchant: merchantApi,
  map: mapApi,
  security: securityApi
};

// 同时导出各模块，方便按需解构导入
export {
  authApi,
  userApi,
  tripApi,
  chatApi,
  locationApi,
  groupBuyApi,
  orderApi,
  couponApi,
  merchantApi,
  mapApi,
  securityApi,
  upload,
  resolveAssetUrl
};

// Backward-compatible aliases for pages written against the first API module
// shape. New code should use the explicit `*Api` names above.
export const auth = authApi;
export const user = userApi;
export const trip = tripApi;
export const chat = chatApi;
export const location = locationApi;
export const groupBuy = groupBuyApi;
export const order = orderApi;
export const coupon = couponApi;
export const merchant = merchantApi;
export const security = securityApi;

// 命名导出配置项（供 WebSocket 等工具模块复用线上域名）
export const BASE_URL_CONFIG = BASE_URL;
