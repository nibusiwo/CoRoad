/**
 * 分享海报生成工具
 * 使用 uni-app 旧版 canvas API 绘制 600x900 海报并导出。
 * 页面中需放置:
 *   <canvas canvas-id="posterCanvas" class="poster-canvas" style="width:600px;height:900px;"/>
 * 并给 canvas 设置 .poster-canvas { position: fixed; left: -9999px; top: 0; }
 */
import { drawQrOnCanvas } from '@/utils/qr.js';

/**
 * 在 canvas 上绘制海报
 * @param {Object} ctx - uni.createCanvasContext 返回的上下文
 * @param {Object} opts - { title, subtitle, priceText, bottomText, brand, qrText }
 */
export function drawPoster(ctx, opts = {}) {
  const W = 600;
  const H = 900;
  const title = opts.title || '同道 CoRoad';
  const subtitle = opts.subtitle || '';
  const priceText = opts.priceText || '';
  const bottomText = opts.bottomText || '';
  const brand = opts.brand || '同道 CoRoad · 自驾组队一起省钱';
  const qrText = opts.qrText || '';

  // 背景
  ctx.setFillStyle('#FFFFFF');
  ctx.fillRect(0, 0, W, H);

  // 顶部品牌区
  ctx.setFillStyle('#07C160');
  ctx.fillRect(0, 0, W, 240);
  ctx.setFillStyle('rgba(255,255,255,0.14)');
  ctx.beginPath();
  ctx.arc(520, 60, 130, 0, 2 * Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(60, 220, 90, 0, 2 * Math.PI);
  ctx.fill();

  // 标题
  ctx.setFillStyle('#FFFFFF');
  ctx.setFontSize(44);
  ctx.setTextAlign('center');
  ctx.fillText(title, W / 2, 130);

  // 副标题
  ctx.setFillStyle('rgba(255,255,255,0.85)');
  ctx.setFontSize(26);
  ctx.fillText(subtitle, W / 2, 185);

  // 中部卡片
  ctx.setFillStyle('#F7F8FA');
  ctx.fillRect(40, 300, W - 80, 360);
  ctx.setFillStyle('#07C160');
  ctx.fillRect(40, 300, 10, 360);

  // 价格
  if (priceText) {
    ctx.setFillStyle('#FF6B35');
    ctx.setFontSize(72);
    ctx.fillText(priceText, W / 2, 480);
  }

  // 底部品牌
  ctx.setFillStyle('#07C160');
  ctx.setFontSize(34);
  ctx.fillText(brand, W / 2, 740);

  ctx.setFillStyle('#999999');
  ctx.setFontSize(24);
  ctx.fillText(bottomText, W / 2, 810);

  ctx.setFillStyle('#CCCCCC');
  ctx.setFontSize(22);
  ctx.fillText(qrText ? '长按识别 / 扫码加入' : '', W / 2, 860);

  // 真实二维码(底部居中,120x120)
  if (qrText) {
    try {
      drawQrOnCanvas(ctx, qrText, (W - 150) / 2, H - 200, 150, '#1A1A1A');
    } catch (e) {
      console.warn('[Poster] draw qr failed:', e);
    }
  }

  ctx.draw();
}

/**
 * 导出海报:H5 新窗口打开,小程序预览后可保存
 * @param {Object} that - 页面实例(this)
 * @param {string} canvasId
 * @returns {Promise<string>} 临时文件路径
 */
export function exportPoster(that, canvasId) {
  return new Promise((resolve, reject) => {
    uni.canvasToTempFilePath({
      canvasId,
      success: (res) => {
        // #ifdef H5
        if (res.tempFilePath) {
          window.open(res.tempFilePath);
          uni.showToast({ title: '海报已生成，可在新窗口保存', icon: 'none', duration: 2000 });
        }
        // #endif
        // #ifndef H5
        uni.previewImage({
          urls: [res.tempFilePath],
          success: () => uni.showToast({ title: '长按图片可保存', icon: 'none' })
        });
        // #endif
        resolve(res.tempFilePath);
      },
      fail: (err) => {
        console.warn('[Poster] export failed:', err);
        reject(err);
      }
    }, that);
  });
}
