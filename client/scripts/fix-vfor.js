const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');

/**
 * 修复 wrap-local-image.js 处理 v-for 时的问题：
 * 如果 <local-image> 上带有 v-for/:key，需要把它们移到外层 <view> 上。
 */
function fixVForInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // 匹配模式：<view class="...">\n  <local-image ... v-for="..." :key="..." ... />\n</view>
  // 把 v-for 和 :key 从 local-image 移到 view 上
  const regex = /(<view\s+class="([^"]+)"[^>]*>\s*\n\s*)<local-image([^\n]*\n(?:[^\n]*\n)*?)\s*(v-for="[^"]+")\s*([^\n]*\n(?:[^\n]*\n)*?)\s*(:key="[^"]+")\s*([^\n]*\n(?:[^\n]*\n)*?)\/>\s*\n\s*(<\/view>)/g;

  content = content.replace(regex, (match, viewOpen, viewClass, beforeVFor, vFor, betweenVForAndKey, key, afterKey, viewClose) => {
    const indent = viewOpen.match(/\n(\s*)<local-image/)[1];
    const newViewOpen = viewOpen.replace(/<view\s+class="([^"]+)"/, `<view class="$1" ${vFor} ${key}`);
    const newLocalImage = `<local-image${beforeVFor}${betweenVForAndKey}${afterKey}/>`;
    return `${newViewOpen}${newLocalImage}\n${indent}${viewClose}`;
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('✓', filePath);
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.vue')) {
      fixVForInFile(fullPath);
    }
  }
}

walk(SRC_DIR);
console.log('Done.');
