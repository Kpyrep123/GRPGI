import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const core=require('../pocketbase/pb_hooks/grpgi_stock_exchange_v148.js');
const routes=fs.readFileSync(new URL('../pocketbase/pb_hooks/grpgi_stock_exchange_v148.pb.js',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../stock-worker/worker.js',import.meta.url),'utf8');
const world={equipment:{EQUIPMENT:{share:{id:'share',type:'stock',ticker:'SHR',stockMinPrice:42,stockMaxPrice:900,stockVolatility:1.5}}}};
const start=core.createState(world,1_700_000_000_000);
assert.equal(start.quotes.share.price,42);
const left=core.advance(JSON.parse(JSON.stringify(start)),'campaign',world,1_700_000_010_000);
const right=core.advance(JSON.parse(JSON.stringify(start)),'campaign',world,1_700_000_010_000);
assert.deepEqual(left.quotes,right.quotes);
assert.match(routes,/\$apis\.requireAuth\(\)/);
assert.match(routes,/stock-exchange-v148\/tick/);
assert.match(worker,/X-GRPGI-Worker-Token/);
assert.match(fs.readFileSync(new URL('../pocketbase/pb_hooks/grpgi_stock_exchange_v148.js',import.meta.url),'utf8'),/runInTransaction/);
console.log('v148 PocketBase stock hooks: ok');
