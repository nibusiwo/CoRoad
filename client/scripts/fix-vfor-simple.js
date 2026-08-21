const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');

/**
 * 修复：如果 <local-image> 标签上带有 v-for/:key，把它们移到外层 <view> 上。
 * 因为 local-image 已经被 wrap-local-image.js 包了一层 view。
 */
function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // 匹配被 view 包裹的 local-image，且 local-image 上带有 v-for
  // 格式：<view class="X">\n...<local-image ... v-for="..." ... :key="..." ... />\n...</view>
  const regex = /(<view\s+class="[^"]+"[^>]*)>([\s\S]*?)<local-image\b([\s\S]*?)\bv-for="([^"]+)"([\s\S]*?)\b:key="([^"]+)"([\s\S]*?)\/>/g;

  content = content.replace(regex, (match, viewOpen, betweenViewAndLocal, beforeVFor, vForExpr, betweenVForAndKey, keyExpr, afterKey) => {
    // 检查这个 view 是否紧包着 local-image（中间只有空白）
    if (!/^\s*$/.test(betweenViewAndLocal)) {
      return match;
    }

    const newViewOpen = `${viewOpen} v-for="${vForExpr}" :key="${keyExpr}">`;
    const newLocalImage = `<local-image${beforeVFor}${betweenVForAndKey}${afterKey}/>`;
    return `${newViewOpen}${newLocalImage}`;
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
      fixFile(fullPath);
    }
  }
}

walk(SRC_DIR);
console.log('Done.');
