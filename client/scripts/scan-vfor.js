const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // 匹配 <local-image ... />，检查是否包含 v-for
  const regex = /<local-image\b([\s\S]*?)\/>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const attrs = match[1];
    if (/\bv-for=/.test(attrs)) {
      console.log('FOUND v-for on local-image:');
      console.log('  File:', filePath);
      console.log('  Match:', match[0].replace(/\n/g, '\\n'));
      console.log();
    }
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.vue')) {
      scanFile(fullPath);
    }
  }
}

walk(SRC_DIR);
console.log('Scan complete.');
