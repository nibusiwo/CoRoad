const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');

/**
 * 自动把 .vue 文件中的
 *   <local-image class="xxx" ... />
 * 转换为
 *   <view class="xxx">
 *     <local-image style="width:100%;height:100%;" ... />
 *   </view>
 *
 * 目的：微信小程序自定义组件存在样式隔离，页面 scoped class 无法直接作用到
 * 组件内部 <image>。把 class 移到外层 view 上控制尺寸，并让 local-image
 * 填满父容器，从而保证图片显示正常。
 */
function wrapLocalImageInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // 匹配两种形式：
  // 1. 自闭合 <local-image ... />
  // 2. 非自闭合 <local-image ...>...</local-image>
  const tagRegex = /(<local-image\b)([\s\S]*?)(\/>|<\/local-image>)/g;

  content = content.replace(tagRegex, (match, openTag, attrs, closeTag) => {
    // 只处理带 class= 的
    const classMatch = attrs.match(/(\sclass="([^"]*)")/);
    if (!classMatch) {
      return match;
    }

    const fullClassAttr = classMatch[1];
    const classValue = classMatch[2];

    // 移除 class 属性
    let newAttrs = attrs.replace(fullClassAttr, '');

    // 如果已有 style，合并；否则新增
    const styleMatch = newAttrs.match(/(\sstyle="([^"]*)")/);
    if (styleMatch) {
      const originalStyle = styleMatch[2].trim();
      const sep = originalStyle.endsWith(';') ? '' : ';';
      newAttrs = newAttrs.replace(
        styleMatch[1],
        ` style="${originalStyle}${sep}width:100%;height:100%;"`
      );
    } else {
      newAttrs = ` style="width:100%;height:100%;"${newAttrs}`;
    }

    // 计算缩进：取 local-image 所在行的缩进
    const beforeMatch = original.slice(0, original.indexOf(match));
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const indent = beforeMatch.slice(lastNewline + 1).match(/^(\s*)/)[1];
    const innerIndent = indent + '  ';

    const isSelfClosing = closeTag === '/>';

    if (isSelfClosing) {
      return `${indent}<view class="${classValue}">\n${innerIndent}<local-image${newAttrs} />\n${indent}</view>`;
    }

    // 非自闭合：把内容放到 local-image 标签内
    // 这里简化处理：把 </local-image> 替换为内容占位
    // 实际上当前项目里 local-image 都是自闭合，先不处理非自闭合
    return match;
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('✓', filePath);
  }
}

const EXCLUDED_FILES = [
  // 这两个文件已手动处理，避免重复包裹
  path.resolve(SRC_DIR, 'pages/mine/index.vue'),
  path.resolve(SRC_DIR, 'pages/user/home.vue'),
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.vue')) {
      if (EXCLUDED_FILES.includes(fullPath)) {
        continue;
      }
      wrapLocalImageInFile(fullPath);
    }
  }
}

walk(SRC_DIR);
console.log('Done.');
