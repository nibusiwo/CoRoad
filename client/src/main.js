import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

// uview-plus 图标字体本地化。
// 原因：微信小程序渲染层直接加载网络字体（at.alicdn.com / ngrok）会失败
// （ERR_CACHE_MISS / network error），且 at.alicdn.com 无法配置为微信
// downloadFile 合法域名。因此 MP-WEIXIN 端把字体 base64 内嵌为 data URL
// （基础库 2.17.0+ 支持），由 uview-plus 的 u-icon 组件自己 loadFontFace，
// 开发者工具与真机都不依赖网络。其他端继续使用打包进 static 的本地字体。
import uviewConfig from 'uview-plus/libs/config/config'

// #ifdef MP-WEIXIN
import iconFontBase64 from './utils/icon-font-base64'
uviewConfig.iconUrl = 'data:font/truetype;charset=utf-8;base64,' + iconFontBase64
// #endif

// #ifndef MP-WEIXIN
uviewConfig.iconUrl = '/static/fonts/uicon-iconfont.ttf'
// #endif

export function createApp() {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  return { app, pinia }
}
