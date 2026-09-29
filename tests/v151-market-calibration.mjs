import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync(new URL('../market-service/server.js', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8');

assert.match(server, /Math\.floor\(tick\/900\)/);
assert.match(server, /\*\.00035\*q\.volatility/);
assert.doesNotMatch(server, /delta=\([^\n]+\)\*TICK_SECONDS\+eventImpulse/);
assert.match(server, /start_price REAL,target_price REAL/);
assert.match(server, /Math\.log\(target\/start\)\/steps/);
assert.match(server, /regime:'dm-impulse'/);
assert.match(server, /anchor:finish\?price:null/);
assert.match(server, /DELETE FROM events WHERE campaign_id=\? AND item_id=\?/);

assert.match(renderer, /<label>Стартовая цена<\/label>/);
assert.match(renderer, /name="stockVolatility"/);
assert.match(renderer, /0,5 — стабильная акция; 1 — стандартная; 2 — высокая; 3 — экстремальная/);
assert.match(renderer, /stockMaxPrice: itemType === 'stock' \? Math\.max\(0\.01, Number\(formData\.get\('stockMinPrice'\)/);
assert.match(renderer, /stockVolatility: itemType === 'stock' \? clamp\(Number\(formData\.get\('stockVolatility'\) \|\| 1\), 0\.05, 3\)/);

const start = 321;
const target = start * 1.1;
const steps = 60;
let price = start;
for (let index = 0; index < steps; index += 1) price *= Math.exp(Math.log(target / start) / steps);
assert.ok(Math.abs(price - target) < 1e-9, `impulse ended at ${price}, expected ${target}`);

console.log('v151 market calibration tests: ok');
