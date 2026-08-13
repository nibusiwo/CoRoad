/**
 * 真实二维码生成工具(H5 / 微信小程序通用)
 * 使用 qrcode 库计算二维码矩阵,再用 uni canvas API 绘制,
 * 不依赖 DOM,可在 uni-app 两端运行。
 */
import QRCode from 'qrcode';

/**
 * 计算二维码模块矩阵
 * @param {string} text 编码内容
 * @returns {{ size: number, data: Uint8Array }} size=边长, data[row*size+col]=1 表示深色
 */
export function qrMatrix(text) {
  const qr = QRCode.create(String(text || ''), {
    errorCorrectionLevel: 'M',
    margin: 1
  });
  const modules = qr.modules;
  return {
    size: modules.size,
    data: modules.data
  };
}

/**
 * 在 uni canvas 上下文上绘制二维码
 * @param {Object} ctx uni.createCanvasContext 返回的上下文
 * @param {string} text 编码内容
 * @param {number} x 左上角 x
 * @param {number} y 左上角 y
 * @param {number} size 绘制边长(px)
 * @param {string} [dark] 深色块颜色
 */
export function drawQrOnCanvas(ctx, text, x, y, size, dark) {
  const { size: n, data } = qrMatrix(text);
  const cell = size / (n + 2); // 四周各留 1 模块白边
  const offsetX = x + cell;
  const offsetY = y + cell;
  ctx.setFillStyle(dark || '#1A1A1A');
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (data[r * n + c]) {
        ctx.fillRect(offsetX + c * cell, offsetY + r * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }
}

/**
 * 将 canvas 导出为图片路径
 * @param {Object} that 页面实例
 * @param {string} canvasId
 * @returns {Promise<string>}
 */
export function canvasToImage(that, canvasId) {
  return new Promise((resolve, reject) => {
    uni.canvasToTempFilePath({
      canvasId,
      success: (res) => resolve(res.tempFilePath),
      fail: reject
    }, that);
  });
}
