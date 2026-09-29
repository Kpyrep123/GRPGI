import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../market-service/server.js', import.meta.url), 'utf8');
const web = fs.readFileSync(new URL('../deploy/site/app/app.js', import.meta.url), 'utf8');
const electron = fs.readFileSync(new URL('../renderer/stock-exchange-v148.js', import.meta.url), 'utf8');

const source = server.match(/const MARKET_PATTERNS = (\[[\s\S]*?\n\]);/)?.[1];
assert.ok(source, 'MARKET_PATTERNS is missing');
const patterns = Function(`"use strict"; return (${source});`)();
assert.ok(patterns.length >= 10, 'not enough market patterns');
for (const pattern of patterns) {
  assert.equal(pattern.length, 8);
  assert.ok(!pattern[0].startsWith('trend-'));
  assert.ok(!pattern.at(-1).startsWith('trend-'));
  let run = 0;
  let direction = '';
  for (const phase of pattern) {
    const next = phase.startsWith('trend-') ? phase : '';
    run = next && next === direction ? run + 1 : next ? 1 : 0;
    direction = next;
    assert.ok(run <= 2, `trend lasts longer than 30 minutes: ${pattern.join(',')}`);
  }
}

assert.match(server, /const MAX_ORDER_QUANTITY = 1_000_000/);
assert.match(server, /1,MAX_ORDER_QUANTITY/);
assert.match(web, /max="1000000"[^>]+data-web-stock-order-quantity-v148/);
assert.match(electron, /max="1000000"[^>]+data-stock-order-quantity-v148/);
assert.match(web, /tile\.classList\.remove\('up','down','flat'\)/);
assert.match(web, /box\.classList\.remove\('up','down','flat'\)/);
assert.match(electron, /tile\.classList\.remove\('up','down','flat'\)/);
assert.match(electron, /price\.classList\.remove\('up','down','flat'\)/);

console.log('v152 market patterns and colors tests: ok');
