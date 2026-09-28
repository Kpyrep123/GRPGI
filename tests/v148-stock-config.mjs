import assert from 'node:assert/strict';
import fs from 'node:fs';

const moduleSource=fs.readFileSync(new URL('../renderer/stock-exchange-v148.js',import.meta.url),'utf8');
const packageJson=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

assert.equal(packageJson.version,'1.0.148');
assert.equal(packageJson.build.buildVersion,'1.0.148.0');
assert.match(moduleSource,/Стартовая цена/);
assert.match(moduleSource,/name="stockVolatility"/);
assert.match(moduleSource,/entity\.stockMaxPrice=Number\(entity\.stockMinPrice/);
assert.match(moduleSource,/entity\.stockVolatility=Math\.max\(\.05,Math\.min\(8/);

console.log('v148 stock config and version tests: ok');
