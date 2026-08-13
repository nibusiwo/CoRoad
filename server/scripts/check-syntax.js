const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = [path.resolve(__dirname, '..', 'src'), path.resolve(__dirname, '..', 'server.js')];
const files = [];

function collect(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (target.endsWith('.js')) files.push(target);
    return;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    collect(path.join(target, entry.name));
  }
}

roots.forEach(collect);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
}
console.log(`Syntax check passed for ${files.length} JavaScript files`);
