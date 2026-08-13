/**
 * WebSocket 地址构建（H5 / 微信小程序共用）
 * - H5: 走 Vite/Nginx 同域代理 /ws
 * - 微信小程序: 由线上 API 域名推导 wss://domain/ws
 */
import { BASE_URL_CONFIG } from './api'

export function getWsBase() {
  // #ifdef H5
  if (typeof location !== 'undefined') {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
  }
  // #endif
  // #ifndef H5
  const origin = BASE_URL_CONFIG.replace(/\/+$/, '').replace(/\/api$/, '')
  return origin.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/ws'
  // #endif
}

export function buildWsUrl(token) {
  return `${getWsBase()}?token=${encodeURIComponent(token)}`
}
