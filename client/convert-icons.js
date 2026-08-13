/**
 * SVG 转 PNG 批量转换脚本
 */
const fs = require('fs');
const path = require('path');

// 图标尺寸配置
const ICON_SIZE = 81; // 微信小程序推荐尺寸

// SVG 文件目录
const svgDir = path.join(__dirname, 'src/static/tab');

// 读取所有 SVG 文件
const svgFiles = fs.readdirSync(svgDir).filter(file => file.endsWith('.svg'));

console.log(`找到 ${svgFiles.length} 个 SVG 文件`);

// 简单的 SVG 转 PNG 实现（使用 canvas）
async function convertSvgToPng() {
  try {
    // 检查是否安装了必要的包
    let sharp;
    try {
      sharp = require('sharp');
    } catch (e) {
      console.log('正在安装 sharp 库...');
      const { execSync } = require('child_process');
      execSync('npm install sharp', { cwd: __dirname, stdio: 'inherit' });
      sharp = require('sharp');
    }

    console.log('开始转换...\n');

    for (const svgFile of svgFiles) {
      const svgPath = path.join(svgDir, svgFile);
      const pngFile = svgFile.replace('.svg', '.png');
      const pngPath = path.join(svgDir, pngFile);

      try {
        await sharp(svgPath)
          .resize(ICON_SIZE, ICON_SIZE)
          .png()
          .toFile(pngPath);

        console.log(`✓ ${svgFile} -> ${pngFile}`);
      } catch (err) {
        console.error(`✗ 转换失败: ${svgFile}`, err.message);
      }
    }

    console.log('\n转换完成！');
    console.log(`PNG 文件已保存到: ${svgDir}`);

  } catch (err) {
    console.error('转换过程出错:', err.message);
    console.log('\n请手动安装依赖后重试:');
    console.log('  cd client');
    console.log('  npm install sharp');
    console.log('  node convert-icons.js');
  }
}

// 执行转换
convertSvgToPng();