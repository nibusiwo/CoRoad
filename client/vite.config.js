import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  server: {
    port: 8080,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      // 上传文件(头像/图片/语音)通过后端 /uploads 静态目录访问
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      // D4: WebSocket 代理 - H5 端 /ws 转发到后端 ws server
      '/ws': {
        target: 'ws://localhost:3000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path
      }
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 仅注入 uview-plus 主题变量(不注入全量样式),避免每个页面 wxss 膨胀 100KB+
        additionalData: '@import "uview-plus/theme.scss";'
      }
    }
  }
})
