<script setup>
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user.js'
import api from '@/utils/api.js'
import { buildWsUrl } from '@/utils/ws-url.js'

const userStore = useUserStore()

// D4: WebSocket 全局连接实例与重连控制
let socketTask = null
let reconnectTimer = null
let isManualClose = false

onLaunch(() => {
  console.log('CoRoad App Launch')
  console.log('[CoRoad] BUILD 2026-08-20-v4 local-image-fill')
  const token = uni.getStorageSync('token')
  if (!token) {
    // 无 token，同步跳转登录页（在页面渲染前完成，避免页面发起 API 请求）
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  // 有 token，异步验证
  restoreLoginState()
})

onShow(() => {
  console.log('CoRoad App Show')
  // D4: 切回前台时若已登录但 socket 未连接，尝试重连
  if (userStore.isLoggedIn && !socketTask) {
    initWebSocket()
  }
})

onHide(() => {
  console.log('CoRoad App Hide')
})

/**
 * 恢复登录态：验证存储的 token 是否有效
 */
async function restoreLoginState() {
  try {
    const profile = await api.request({
      url: '/users/profile',
      method: 'GET',
      showLoading: false,
      showError: false,
      skipAuthRedirect: true
    })
    // token 有效，恢复登录态
    const token = uni.getStorageSync('token')
    userStore.token = token
    userStore.profile = profile
    userStore.isLoggedIn = true
    console.log('Profile restored from server')
    // D4: 登录态恢复后建立 WebSocket
    initWebSocket()
  } catch (err) {
    // token 过期或无效，清除并跳转登录页
    console.warn('Token expired, redirecting to login:', err)
    try {
      uni.removeStorageSync('token')
      uni.removeStorageSync('userInfo')
    } catch (e) { /* ignore */ }
    uni.reLaunch({ url: '/pages/login/index' })
  }
}

/**
 * D4: 初始化全局 WebSocket 连接
 * - 收到 type==='system_notification' 的消息时交给 handleSystemNotification
 * - 断线后 5s 自动重连（仅当仍处于登录态）
 */
function initWebSocket() {
  // 已存在连接则先清理
  if (socketTask) {
    isManualClose = true
    try { socketTask.close({}) } catch (e) { /* ignore */ }
    socketTask = null
  }
  isManualClose = false

  const token = uni.getStorageSync('token')
  if (!token) return

  const url = buildWsUrl(token)
  console.log('[WebSocket] connecting to', url.replace(/token=[^&]+/, 'token=***'))

  try {
    socketTask = uni.connectSocket({
      url,
      complete: () => {}
    })
  } catch (e) {
    console.warn('[WebSocket] connectSocket failed:', e)
    scheduleReconnect()
    return
  }

  if (!socketTask) return

  socketTask.onOpen(() => {
    console.log('[WebSocket] connected')
  })

  socketTask.onMessage((res) => {
    if (!res || !res.data) return
    let msg
    try {
      msg = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
    } catch (e) {
      return
    }
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'system_notification') {
      handleSystemNotification(msg)
    }
  })

  socketTask.onError((err) => {
    console.warn('[WebSocket] error:', err)
  })

  socketTask.onClose((e) => {
    console.log('[WebSocket] closed', e && e.code)
    socketTask = null
    if (!isManualClose && userStore.isLoggedIn) {
      scheduleReconnect()
    }
  })
}

/**
 * D4: 断线重连（5s 间隔，仅登录态）
 */
function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (userStore.isLoggedIn && !socketTask) {
      console.log('[WebSocket] reconnecting...')
      initWebSocket()
    }
  }, 5000)
}

/**
 * D4: 处理系统通知
 * - 高优先级 + 当前在地图页 → 通过事件通道让地图页弹安全提醒 modal
 * - 高优先级 + 其他页 → uni.showModal 阻塞式提示
 * - 低优先级 → uni.showToast 非阻塞提示
 */
function handleSystemNotification(notification) {
  if (!notification) return
  const title = notification.title || '系统通知'
  const content = notification.content || ''
  const priority = notification.priority || 'low'

  let currentRoute = ''
  try {
    const pages = getCurrentPages()
    const last = pages[pages.length - 1]
    currentRoute = last ? last.route : ''
  } catch (e) { /* ignore */ }

  if (priority === 'high') {
    if (currentRoute === 'pages/map/index') {
      // 地图页通过事件通道接管展示
      uni.$emit('system_notification_high', notification)
    } else {
      uni.showModal({
        title,
        content,
        showCancel: false,
        confirmText: '我知道了'
      })
    }
  } else {
    uni.showToast({
      title: content ? `${title}: ${content}` : title,
      icon: 'none',
      duration: 3000
    })
  }
}
</script>

<style lang="scss">
/* ==================== 全局 CSS 变量 ==================== */
page {
  --color-primary: #07C160;
  --color-primary-dark: #06AD56;
  --color-primary-light: #E8F8EF;
  --color-warning: #FF6B35;
  --color-danger: #E74C3C;
  --color-info: #4A90D9;
  --color-text-primary: #1A1A1A;
  --color-text-secondary: #666666;
  --color-text-hint: #999999;
  --color-bg: #F5F5F5;
  --color-bg-white: #FFFFFF;
  --color-border: #EEEEEE;
  --color-divider: #F0F0F0;

  /* 圆角 */
  --radius-sm: 8rpx;
  --radius-md: 16rpx;
  --radius-lg: 24rpx;
  --radius-round: 50%;

  /* 阴影 */
  --shadow-sm: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4rpx 16rpx rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 8rpx 24rpx rgba(0, 0, 0, 0.12);

  /* 字号 */
  --font-xs: 22rpx;
  --font-sm: 26rpx;
  --font-md: 28rpx;
  --font-lg: 32rpx;
  --font-xl: 36rpx;
  --font-xxl: 44rpx;

  /* 间距 */
  --spacing-xs: 8rpx;
  --spacing-sm: 16rpx;
  --spacing-md: 24rpx;
  --spacing-lg: 32rpx;
  --spacing-xl: 48rpx;

  /* 全局基础样式 */
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
    'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 28rpx;
  color: var(--color-text-primary);
  background-color: var(--color-bg-white);
  line-height: 1.6;
  box-sizing: border-box;
}

/* 所有组件元素统一 border-box,避免 width:100% + padding 把容器撑出视口 */
view,
text,
image,
scroll-view,
uni-view {
  box-sizing: border-box;
}

/* ==================== 通用工具类 ==================== */

/* Flex 布局 */
.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.flex-start {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.flex-end {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.flex-column {
  display: flex;
  flex-direction: column;
}

.flex-column-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.flex-wrap {
  display: flex;
  flex-wrap: wrap;
}

.flex-1 {
  flex: 1;
}

/* 文字省略 */
.text-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-ellipsis-2 {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.text-ellipsis-3 {
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

/* 文字对齐 */
.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }

/* 文字颜色 */
.text-primary { color: var(--color-primary); }
.text-warning { color: var(--color-warning); }
.text-danger { color: var(--color-danger); }
.text-info { color: var(--color-info); }
.text-secondary { color: var(--color-text-secondary); }
.text-hint { color: var(--color-text-hint); }

/* 文字加粗 */
.font-bold { font-weight: 700; }
.font-medium { font-weight: 500; }
.font-normal { font-weight: 400; }

/* 安全区 */
.safe-area-bottom {
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}

.safe-area-top {
  padding-top: constant(safe-area-inset-top);
  padding-top: env(safe-area-inset-top);
}

/* ==================== 按钮样式 ==================== */

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 88rpx;
  background: var(--color-primary);
  color: #FFFFFF;
  font-size: var(--font-lg);
  font-weight: 500;
  border-radius: var(--radius-md);
  border: none;

  &:active {
    opacity: 0.85;
  }

  &[disabled] {
    opacity: 0.5;
  }
}

.btn-outline {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 88rpx;
  background: transparent;
  color: var(--color-primary);
  font-size: var(--font-lg);
  font-weight: 500;
  border-radius: var(--radius-md);
  border: 2rpx solid var(--color-primary);

  &:active {
    background: rgba(7, 193, 96, 0.05);
  }
}

.btn-danger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 88rpx;
  background: var(--color-danger);
  color: #FFFFFF;
  font-size: var(--font-lg);
  font-weight: 500;
  border-radius: var(--radius-md);
  border: none;

  &:active {
    opacity: 0.85;
  }

  &[disabled] {
    opacity: 0.5;
  }
}

.btn-sm {
  height: 60rpx;
  font-size: var(--font-sm);
  padding: 0 24rpx;
  width: auto;
  border-radius: var(--radius-sm);
}

.btn-lg {
  height: 96rpx;
  font-size: var(--font-xl);
}

/* ==================== 卡片样式 ==================== */

.card {
  background: var(--color-bg-white);
  border-radius: var(--radius-md);
  padding: 24rpx;
  margin: 16rpx 24rpx;
  box-shadow: var(--shadow-sm);
}

.card-no-margin {
  background: var(--color-bg-white);
  border-radius: var(--radius-md);
  padding: 24rpx;
  box-shadow: var(--shadow-sm);
}

.card-flat {
  background: var(--color-bg-white);
  border-radius: var(--radius-md);
  padding: 24rpx;
}

/* ==================== 标签样式 ==================== */

.tag {
  display: inline-flex;
  align-items: center;
  padding: 4rpx 12rpx;
  font-size: var(--font-xs);
  border-radius: var(--radius-sm);
  line-height: 1.4;
}

.tag-primary {
  background: var(--color-primary-light);
  color: var(--color-primary);
}

.tag-warning {
  background: #FFF3ED;
  color: var(--color-warning);
}

.tag-danger {
  background: #FDEAEA;
  color: var(--color-danger);
}

.tag-info {
  background: #EDF4FC;
  color: var(--color-info);
}

.tag-gray {
  background: var(--color-divider);
  color: var(--color-text-secondary);
}

/* ==================== 分隔线 ==================== */

.divider {
  height: 1rpx;
  background: var(--color-divider);
}

.divider-thick {
  height: 16rpx;
  background: var(--color-bg);
}

/* ==================== 间距工具类 ==================== */

.mt-8 { margin-top: 8rpx; }
.mt-16 { margin-top: 16rpx; }
.mt-24 { margin-top: 24rpx; }
.mt-32 { margin-top: 32rpx; }
.mt-48 { margin-top: 48rpx; }

.mb-8 { margin-bottom: 8rpx; }
.mb-16 { margin-bottom: 16rpx; }
.mb-24 { margin-bottom: 24rpx; }
.mb-32 { margin-bottom: 32rpx; }
.mb-48 { margin-bottom: 48rpx; }

.ml-8 { margin-left: 8rpx; }
.ml-16 { margin-left: 16rpx; }
.ml-24 { margin-left: 24rpx; }

.mr-8 { margin-right: 8rpx; }
.mr-16 { margin-right: 16rpx; }
.mr-24 { margin-right: 24rpx; }

.p-8 { padding: 8rpx; }
.p-16 { padding: 16rpx; }
.p-24 { padding: 24rpx; }
.p-32 { padding: 32rpx; }

.px-16 { padding-left: 16rpx; padding-right: 16rpx; }
.px-24 { padding-left: 24rpx; padding-right: 24rpx; }

.py-8 { padding-top: 8rpx; padding-bottom: 8rpx; }
.py-16 { padding-top: 16rpx; padding-bottom: 16rpx; }
.py-24 { padding-top: 24rpx; padding-bottom: 24rpx; }

/* ==================== 宽高工具类 ==================== */

.w-full { width: 100%; }
.h-full { height: 100%; }

/* ==================== 背景工具类 ==================== */

.bg-white { background: var(--color-bg-white); }
.bg-gray { background: var(--color-bg); }
.bg-primary { background: var(--color-primary); }

/* ==================== 圆角工具类 ==================== */

.rounded-sm { border-radius: var(--radius-sm); }
.rounded-md { border-radius: var(--radius-md); }
.rounded-lg { border-radius: var(--radius-lg); }
.rounded-round { border-radius: 50%; }

/* ==================== 页面过渡动画 ==================== */

/* 页面进入 */
.page-enter-active {
  animation: pageFadeIn 0.3s ease-out;
}

/* 页面离开 */
.page-leave-active {
  animation: pageFadeOut 0.2s ease-in;
}

@keyframes pageFadeIn {
  from {
    opacity: 0;
    transform: translateY(20rpx);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pageFadeOut {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-20rpx);
  }
}

/* 底部弹出动画 */
.slide-up-enter-active {
  animation: slideUpIn 0.3s ease-out;
}

.slide-up-leave-active {
  animation: slideUpOut 0.25s ease-in;
}

@keyframes slideUpIn {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes slideUpOut {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}

/* 淡入淡出 */
.fade-enter-active {
  animation: fadeIn 0.3s ease-out;
}

.fade-leave-active {
  animation: fadeOut 0.2s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
</style>
