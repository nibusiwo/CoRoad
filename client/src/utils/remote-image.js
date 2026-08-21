/**
 * 远程图片本地化加载工具
 * 解决 ngrok 免费版浏览器确认页拦截图片的问题：
 * 微信小程序 <image> 无法携带自定义请求头，导致加载远程图片时被 ngrok
 * 返回确认页 HTML。这里先通过 uni.downloadFile（支持 header）把图片下载到
 * 本地临时文件，再交给 <image> 展示，并带内存缓存避免重复下载。
 */

// 内存缓存：远程 URL -> 本地临时文件路径
const downloadCache = new Map();

/**
 * 判断 URL 是否为 ngrok 域名（ngrok 确认页只影响 ngrok 域名）
 */
function isNgrokUrl(url) {
  return /ngrok(-free)?\.(dev|app|io)/.test(url);
}

/**
 * 下载远程图片到本地临时文件
 * @param {string} url 远程图片 URL
 * @param {Object} [options]
 * @param {boolean} [options.fallbackToRemote=true] 下载失败时是否回退返回原 URL
 * @returns {Promise<string>} 本地临时文件路径；失败时按 fallbackToRemote 决定
 */
export function downloadImage(url, options = {}) {
  const { fallbackToRemote = true } = options;
  // 非远程地址（本地/静态/临时文件）直接返回
  if (!url || !/^https?:\/\//i.test(url)) {
    return Promise.resolve(url);
  }

  // 命中缓存直接返回本地文件
  if (downloadCache.has(url)) {
    return Promise.resolve(downloadCache.get(url));
  }

  return new Promise((resolve) => {
    const header = isNgrokUrl(url) ? { 'ngrok-skip-browser-warning': 'true' } : {};
    uni.downloadFile({
      url,
      header,
      success: (res) => {
        if (res.statusCode === 200 && res.tempFilePath) {
          downloadCache.set(url, res.tempFilePath);
          resolve(res.tempFilePath);
        } else {
          // 下载失败：按配置决定回退原地址或返回空（避免渲染异常内容撑爆布局）
          resolve(fallbackToRemote ? url : '');
        }
      },
      fail: () => {
        resolve(fallbackToRemote ? url : '');
      }
    });
  });
}
