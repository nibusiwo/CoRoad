const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');

/**
 * 找出所有外层包裹 <local-image> 的 view class，
 * 检查这些 class 是否有 border-radius 但缺少 overflow: hidden，
 * 自动为它们补上 overflow: hidden。
 */
function scanAndFix(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = false;

  // 收集被 wrap 后包裹 local-image 的 view class
  const wrapRegex = /<view\s+class="([^"]+)">\s*\n\s*<local-image/g;
  const wrappedClasses = new Set();
  let m;
  while ((m = wrapRegex.exec(content)) !== null) {
    // class 可能是多个类名，取第一个
    const cls = m[1].trim().split(/\s+/)[0];
    if (cls) wrappedClasses.add(cls);
  }

  if (wrappedClasses.size === 0) return;

  // 对每个 class，找到 style 中的定义
  for (const cls of wrappedClasses) {
    // 匹配 .cls { ... } 或 .cls, .other { ... } 或 .parent .cls { ... }
    const styleRegex = new RegExp(`\\.${cls}\\b[^{]*\\{([^}]*)\\}`);
    const styleMatch = content.match(styleRegex);
    if (!styleMatch) continue;

    const block = styleMatch[1];
    const hasBorderRadius = /border-radius\s*:\s*[^0]/.test(block);
    const hasOverflowHidden = /overflow\s*:\s*hidden/.test(block);

    if (hasBorderRadius && !hasOverflowHidden) {
      // 在块末尾添加 overflow: hidden
      const newBlock = block.replace(/;?\s*$/, ';\n    overflow: hidden;\n  ');
      content = content.replace(styleMatch[0], styleMatch[0].replace(block, newBlock));
      changed = true;
      console.log(`  + overflow:hidden -> .${cls} (${path.basename(filePath)})`);
    }
  }

  if (changed) {
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
      scanAndFix(fullPath);
    }
  }
}

walk(SRC_DIR);
console.log('Done.');
