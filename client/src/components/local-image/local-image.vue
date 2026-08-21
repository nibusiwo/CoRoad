<template>
  <image :src="displaySrc" :mode="mode" :style="imageStyle" />
</template>

<script>
import { resolveAssetUrl } from '@/utils/api.js';
import { downloadImage } from '@/utils/remote-image.js';

/**
 * 本地化图片组件（easycom 全局自动注册，可直接替代 <image> 使用）
 *
 * 背景：ngrok 免费版的浏览器确认页会拦截不带 ngrok-skip-browser-warning
 * 请求头的请求，而微信小程序 <image> 无法携带自定义请求头，导致远程图片
 * 在手机上加载失败（开发者工具因 cookie 可正常显示）。
 *
 * 处理逻辑（仅微信小程序端生效）：
 *  1. 相对路径 /uploads/xxx 先解析为完整 URL
 *  2. 通过 uni.downloadFile（支持 header）携带跳过请求头下载到本地
 *  3. 使用本地临时文件路径展示，带内存缓存避免重复下载
 * 其他端（H5 等）直接透传原地址，行为不变。
 *
 * 微信小程序尺寸处理：
 *  自定义组件存在样式隔离 + 组件节点高度为 auto，导致内部 <image> 的
 *  height:100% 无法正确继承，图片会按默认高度渲染并超出外层容器。
 *  因此组件通过 JS（createSelectorQuery 的 :host 选择器）测量宿主节点
 *  的实际宽高，再以内联 style 设置为固定 px，保证图片尺寸与容器一致。
 *  使用方式：外层用 <view class="xxx"> 控制尺寸，<local-image> 填满父级。
 */
export default {
  name: 'LocalImage',

  props: {
    src: {
      type: String,
      default: ''
    },
    mode: {
      type: String,
      default: 'scaleToFill'
    }
  },

  data() {
    return {
      displaySrc: '',
      hostWidth: 0,
      hostHeight: 0,
      measureTimer: null
    };
  },

  computed: {
    imageStyle() {
      // #ifdef MP-WEIXIN
      // 测量成功后使用宿主节点实际尺寸（px）
      if (this.hostWidth > 0 && this.hostHeight > 0) {
        return `width:${this.hostWidth}px;height:${this.hostHeight}px;display:block;`;
      }
      // 测量前先用 100% 占位，避免首次渲染撑爆布局
      return 'width:100%;height:100%;display:block;';
      // #endif
      // #ifndef MP-WEIXIN
      // 其他端：class/style 正常继承，无需处理
      return '';
      // #endif
    }
  },

  watch: {
    src: {
      immediate: true,
      handler(val) {
        this.load(val);
        // #ifdef MP-WEIXIN
        // 数据异步加载后宿主节点可能刚拿到尺寸，重新测量
        this.$nextTick(() => {
          this.measureHost();
        });
        // #endif
      }
    }
  },

  mounted() {
    // #ifdef MP-WEIXIN
    this.measureHost();
    // #endif
  },

  beforeUnmount() {
    // #ifdef MP-WEIXIN
    if (this.measureTimer) {
      clearTimeout(this.measureTimer);
    }
    // #endif
  },

  methods: {
    load(url) {
      if (!url) {
        this.displaySrc = '';
        return;
      }

      // 相对上传路径解析为完整 URL（http/https 原样返回）
      const resolved = url.startsWith('/uploads/') ? resolveAssetUrl(url) : url;

      // #ifdef MP-WEIXIN
      // 小程序：先下载到本地临时文件再展示，避开 ngrok 确认页
      downloadImage(resolved).then((local) => {
        this.displaySrc = local;
      });
      // #endif

      // #ifndef MP-WEIXIN
      // 其他端：直接使用原地址
      this.displaySrc = resolved;
      // #endif
    },

    measureHost(retry = 0) {
      // #ifdef MP-WEIXIN
      const query = uni.createSelectorQuery().in(this);
      query
        .select(':host')
        .boundingClientRect((rect) => {
          if (rect && rect.width > 0 && rect.height > 0) {
            this.hostWidth = rect.width;
            this.hostHeight = rect.height;
          } else if (retry < 15) {
            // 宿主节点尚未布局完成，稍后重试
            this.measureTimer = setTimeout(() => {
              this.measureHost(retry + 1);
            }, 100);
          }
        })
        .exec();
      // #endif
    }
  }
};
</script>
