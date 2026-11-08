const fs = require('node:fs');
const path = require('node:path');
const modules = require('./shared-client-files.json');

function syncSharedClient(root, destination, { check = false } = {}) {
  const stale = [];
  for (const name of modules) {
    const source = fs.readFileSync(path.join(root, 'renderer', name));
    const target = path.join(destination, name);
    if (fs.existsSync(target) && fs.readFileSync(target).equals(source)) continue;
    if (check) stale.push(name);
    else fs.writeFileSync(target, source);
  }
  if (stale.length) throw new Error(`Shared web files are out of date: ${stale.join(', ')}. Run npm run sync:shared.`);
}

if (require.main === module) {
  const root = path.join(__dirname, '..');
  syncSharedClient(root, path.join(root, 'deploy', 'site', 'app'), { check: process.argv.includes('--check') });
}
module.exports = { syncSharedClient };
