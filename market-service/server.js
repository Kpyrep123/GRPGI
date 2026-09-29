'use strict';

const http = require('node:http');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

const PORT = Number(process.env.MARKET_PORT || 8091);
const HOST = process.env.MARKET_HOST || '127.0.0.1';
const MARKET_DB = process.env.MARKET_DB || '/var/lib/grpgi-market/market.sqlite';
const POCKETBASE_DB = process.env.POCKETBASE_DB || '/opt/pocketbase/pb_data/data.db';
const TICK_SECONDS = Math.max(10, Number(process.env.MARKET_TICK_SECONDS || 10));
const MAX_CANDLES = Math.max(60, Number(process.env.MARKET_MAX_CANDLES || 360));
const DEFAULT_CAMPAIGN = process.env.MARKET_CAMPAIGN_ID || 'main';
const ADMIN_TOKEN = String(process.env.GRPGI_STOCK_WORKER_TOKEN || '');
const MIN_PRICE = 0.01;
const MAX_ORDER_QUANTITY = 1_000_000;
const MARKET_PATTERNS = [
 ['calm','trend-up','trend-up','range','trend-down','volatile','trend-up','calm'],
 ['range','trend-down','trend-down','volatile','trend-up','range','trend-down','calm'],
 ['calm','trend-up','trend-down','trend-up','trend-down','range','volatile','calm'],
 ['range','calm','breakout-up','trend-up','range','trend-down','volatile','calm'],
 ['calm','volatile','breakout-down','trend-down','range','trend-up','volatile','range'],
 ['range','trend-up','range','trend-up','trend-down','trend-down','volatile','calm'],
 ['calm','trend-down','range','trend-down','trend-up','trend-up','volatile','range'],
 ['volatile','range','calm','breakout-up','trend-down','range','trend-up','calm'],
 ['range','volatile','calm','breakout-down','trend-up','range','trend-down','calm'],
 ['calm','trend-up','volatile','trend-down','range','trend-up','trend-down','range'],
 ['range','trend-down','volatile','trend-up','calm','breakout-up','range','calm'],
 ['calm','range','trend-up','trend-down','volatile','breakout-down','range','calm']
];

const market = new DatabaseSync(MARKET_DB);
const pocketbase = new DatabaseSync(POCKETBASE_DB);
market.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=3000;');
pocketbase.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=3000;');
market.exec(`
CREATE TABLE IF NOT EXISTS quotes(
 campaign_id TEXT NOT NULL,item_id TEXT NOT NULL,ticker TEXT NOT NULL,price REAL NOT NULL,
 previous_price REAL NOT NULL,volatility REAL NOT NULL,regime TEXT NOT NULL,last_tick INTEGER NOT NULL,
 anchor REAL NOT NULL,PRIMARY KEY(campaign_id,item_id));
CREATE TABLE IF NOT EXISTS candles(
 campaign_id TEXT NOT NULL,item_id TEXT NOT NULL,bucket_time INTEGER NOT NULL,
 open REAL NOT NULL,high REAL NOT NULL,low REAL NOT NULL,close REAL NOT NULL,volume REAL NOT NULL,
 PRIMARY KEY(campaign_id,item_id,bucket_time));
CREATE INDEX IF NOT EXISTS candles_lookup ON candles(campaign_id,item_id,bucket_time DESC);
CREATE TABLE IF NOT EXISTS orders(
 id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL,player_id TEXT NOT NULL,item_id TEXT NOT NULL,
 type TEXT NOT NULL,intent TEXT NOT NULL,quantity INTEGER NOT NULL,leverage REAL NOT NULL,
 trigger_price REAL NOT NULL,limit_price REAL NOT NULL,trailing_percent REAL NOT NULL,
 peak REAL NOT NULL,status TEXT NOT NULL,fill_price REAL,message TEXT,created_at TEXT NOT NULL,
 filled_at TEXT,cancelled_at TEXT);
CREATE INDEX IF NOT EXISTS pending_orders ON orders(campaign_id,status,item_id);
CREATE TABLE IF NOT EXISTS events(
 id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL,item_id TEXT NOT NULL,percent REAL NOT NULL,
 start_tick INTEGER NOT NULL,end_tick INTEGER NOT NULL,start_price REAL,target_price REAL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS active_events ON events(campaign_id,item_id,start_tick,end_tick);
CREATE TABLE IF NOT EXISTS meta(campaign_id TEXT PRIMARY KEY,last_tick INTEGER NOT NULL,world_hash TEXT NOT NULL);
`);
for(const column of ['start_price REAL','target_price REAL']){try{market.exec(`ALTER TABLE events ADD COLUMN ${column}`);}catch(error){if(!String(error.message).includes('duplicate column name'))throw error;}}

let ticking = false;
const streams = new Set();
const nowSec = () => Math.floor(Date.now()/1000);
const iso = value => new Date((value == null ? nowSec() : value)*1000).toISOString();
const clamp = (v,min,max) => Math.min(max,Math.max(min,Number(v)||0));
const round = (v,d=4) => { const n=10**d; return Math.round((Number(v)||0)*n)/n; };
function hash32(value){let hash=0x811c9dc5;for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,0x01000193);}return hash>>>0;}
const random = seed => hash32(seed)/0x100000000;
const parseJson = value => { try{return JSON.parse(String(value||'{}'));}catch{return{};} };
function readBody(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',chunk=>{raw+=chunk;if(raw.length>1e6)req.destroy();});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch(error){reject(error);}});req.on('error',reject);});}
function send(res,status,payload){const body=JSON.stringify(payload);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'content-type,x-grpgi-worker-token','access-control-allow-methods':'GET,POST,OPTIONS'});res.end(body);}
function findStocks(world){const result=new Map();const visit=value=>{if(Array.isArray(value)){value.forEach(visit);return;}if(!value||typeof value!=='object')return;const type=String(value.type||value.category||'').toLowerCase(),id=String(value.id||'');if(id&&(type==='stock'||type==='stocks'||id.startsWith('stock_')))result.set(id,value);Object.values(value).forEach(visit);};visit(world);return [...result.values()];}
function initialPrice(item){return Math.max(MIN_PRICE,Number(item.stockMinPrice??item.stockPriceMin??item.marketMinPrice??item.priceMin??item.minPrice??item.stockPrice??item.basePrice??100)||100);}
function volatility(item){return clamp(item.stockVolatility??item.volatility??1,.05,3);}
function ticker(item){return String(item.ticker||item.symbol||item.id||'STOCK').toUpperCase().replace(/[^A-ZА-Я0-9._-]/g,'').slice(0,12);}
function worldSnapshot(campaign){const row=pocketbase.prepare('SELECT worldJson FROM campaign_snapshots WHERE campaignId=? LIMIT 1').get(campaign);if(!row)throw Error('Campaign snapshot not found');return parseJson(row.worldJson);}
function syncStocks(campaign){
 const world=worldSnapshot(campaign),stocks=findStocks(world),hash=crypto.createHash('sha1').update(JSON.stringify(stocks.map(x=>[x.id,x.stockMinPrice,x.stockVolatility]))).digest('hex');
 const meta=market.prepare('SELECT world_hash FROM meta WHERE campaign_id=?').get(campaign);
 if(meta?.world_hash===hash)return;
 const tick=Math.floor(nowSec()/TICK_SECONDS)*TICK_SECONDS;
 const insert=market.prepare(`INSERT INTO quotes(campaign_id,item_id,ticker,price,previous_price,volatility,regime,last_tick,anchor)
 VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(campaign_id,item_id) DO UPDATE SET ticker=excluded.ticker,volatility=excluded.volatility`);
 market.exec('BEGIN IMMEDIATE');
 try{
  for(const item of stocks){const price=initialPrice(item);insert.run(campaign,String(item.id),ticker(item),price,price,volatility(item),'calm',tick,price);}
  market.prepare('INSERT INTO meta(campaign_id,last_tick,world_hash) VALUES(?,?,?) ON CONFLICT(campaign_id) DO UPDATE SET world_hash=excluded.world_hash').run(campaign,tick,hash);
  market.exec('COMMIT');
 }catch(error){market.exec('ROLLBACK');throw error;}
}
function regime(campaign,itemId,tick){const phaseBlock=Math.floor(tick/900),cycle=Math.floor(phaseBlock/8),phase=phaseBlock%8,patternIndex=Math.floor(random(`${campaign}|${itemId}|pattern|${cycle}`)*MARKET_PATTERNS.length),mode=MARKET_PATTERNS[patternIndex][phase];if(mode==='trend-up')return[mode,.00001,.00008,1];if(mode==='trend-down')return[mode,-.000009,.00008,1];if(mode==='volatile')return[mode,0,.00004,1.8];if(mode==='range')return[mode,0,.0005,.65];if(mode==='breakout-up')return[mode,.000025,.00003,1.35];if(mode==='breakout-down')return[mode,-.000025,.00003,1.35];return['calm',.000001,.00025,.35];}
function activeImpulses(campaign,itemId,tick){return market.prepare('SELECT percent,start_tick,end_tick,start_price,target_price FROM events WHERE campaign_id=? AND item_id=? AND start_tick<=? AND end_tick>?').all(campaign,itemId,tick,tick);}
function eventImpulse(rows){return rows.reduce((sum,event)=>{const steps=Math.max(1,Math.ceil((event.end_tick-event.start_tick)/TICK_SECONDS)),start=Math.max(MIN_PRICE,Number(event.start_price)||1),target=Math.max(MIN_PRICE,Number(event.target_price)||start*(1+Number(event.percent||0)/100));return sum+Math.log(target/start)/steps;},0);}
function nextPrice(campaign,q,tick){const impulses=activeImpulses(campaign,q.item_id,tick);if(impulses.length){const delta=eventImpulse(impulses),price=Math.max(MIN_PRICE,round(q.price*Math.exp(delta))),finish=impulses.some(event=>tick+TICK_SECONDS>=event.end_tick);return{price,regime:'dm-impulse',anchor:finish?price:null};}const [name,drift,reversion,noiseScale]=regime(campaign,q.item_id,tick),noise=(random(`${campaign}|${q.item_id}|noise|${tick}`)-.5)*.00035*q.volatility*noiseScale,deviation=(q.anchor-q.price)/Math.max(q.anchor,MIN_PRICE),shockRoll=random(`${campaign}|${q.item_id}|shock|${tick}`),shock=shockRoll>.99985?(random(`${campaign}|${q.item_id}|shock-dir|${tick}`)<.5?-1:1)*(.002+random(`${campaign}|${q.item_id}|shock-size|${tick}`)*.004)*q.volatility:0,delta=drift*q.volatility+noise+deviation*reversion+shock;return{price:Math.max(MIN_PRICE,round(q.price*Math.exp(delta))),regime:name,anchor:null};}
function writeCandle(campaign,itemId,tick,price){const bucket=Math.floor(tick/60)*60,volume=round(random(`${itemId}|volume|${tick}`)*40+1,2);market.prepare(`INSERT INTO candles(campaign_id,item_id,bucket_time,open,high,low,close,volume) VALUES(?,?,?,?,?,?,?,?)
 ON CONFLICT(campaign_id,item_id,bucket_time) DO UPDATE SET high=max(high,excluded.high),low=min(low,excluded.low),close=excluded.close,volume=volume+excluded.volume`).run(campaign,itemId,bucket,price,price,price,price,volume);market.prepare(`DELETE FROM candles WHERE campaign_id=? AND item_id=? AND bucket_time NOT IN (SELECT bucket_time FROM candles WHERE campaign_id=? AND item_id=? ORDER BY bucket_time DESC LIMIT ?)`).run(campaign,itemId,campaign,itemId,MAX_CANDLES);}
function playerRow(campaign,playerId){return pocketbase.prepare('SELECT id,playerJson,version FROM campaign_players WHERE campaignId=? AND playerId=? LIMIT 1').get(campaign,playerId);}
function playerProfile(campaign,playerId){const row=playerRow(campaign,playerId);if(!row)throw Error('Player not found');return{row,profile:parseJson(row.playerJson)};}
function savePlayer(campaign,playerId,profile,expectedVersion){const writer=new DatabaseSync(POCKETBASE_DB);writer.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');try{const result=writer.prepare(`UPDATE campaign_players SET playerJson=?,version=version+1,updatedBy='market-service-v2',clientUpdatedAt=? WHERE campaignId=? AND playerId=? AND version=?`).run(JSON.stringify(profile),new Date().toISOString(),campaign,playerId,expectedVersion);if(Number(result.changes)!==1)throw Error('Player changed concurrently');writer.exec('COMMIT');}catch(error){writer.exec('ROLLBACK');throw error;}finally{writer.close();}}
function portfolio(profile){profile.stockPortfolio=profile.stockPortfolio&&typeof profile.stockPortfolio==='object'?profile.stockPortfolio:{};profile.stockPortfolio.positions=profile.stockPortfolio.positions||{};profile.stockPortfolio.shortPositions=profile.stockPortfolio.shortPositions||{};profile.stockPortfolio.ledger=Array.isArray(profile.stockPortfolio.ledger)?profile.stockPortfolio.ledger:[];return profile.stockPortfolio;}
function executeOrder(order,price,tick){
 const {row,profile}=playerProfile(order.campaign_id,order.player_id),book=portfolio(profile);
 if(book.ledger.some(x=>x.id===order.id))return;
 const qty=order.quantity,total=round(price*qty),lev=clamp(order.leverage,1,3),margin=round(total/lev),credits=Math.max(0,Number(profile.credits)||0);let p,average,share,pnl=0,cashFlow=0;
 if(order.intent==='open_long'){if(credits+1e-9<margin)throw Error(`Недостаточно средств: требуется обеспечение ${margin}`);profile.credits=round(credits-margin);p=book.positions[order.item_id]||{itemId:order.item_id,knownQty:0,costBasis:0,margin:0,leverage:lev};p.knownQty+=qty;p.costBasis=round(Number(p.costBasis||0)+total);p.margin=round(Number(p.margin||0)+margin);p.leverage=round(p.costBasis/Math.max(MIN_PRICE,p.margin),2);book.positions[order.item_id]=p;cashFlow=-margin;}
 else if(order.intent==='close_long'){p=book.positions[order.item_id];if(!p||p.knownQty<qty)throw Error('Недостаточно акций');average=p.costBasis/p.knownQty;const positionMargin=Number(p.margin??p.costBasis);share=positionMargin*qty/p.knownQty;pnl=(price-average)*qty;cashFlow=Math.max(0,share+pnl);profile.credits=round(credits+cashFlow);p.knownQty-=qty;p.costBasis=round(p.costBasis-average*qty);p.margin=round(positionMargin-share);if(p.knownQty<=0)delete book.positions[order.item_id];}
 else if(order.intent==='open_short'){if(credits+1e-9<margin)throw Error(`Недостаточно средств: требуется обеспечение ${margin}`);profile.credits=round(credits-margin);p=book.shortPositions[order.item_id]||{itemId:order.item_id,quantity:0,costBasis:0,margin:0,leverage:lev};p.quantity+=qty;p.costBasis=round(Number(p.costBasis||0)+total);p.margin=round(Number(p.margin||0)+margin);p.leverage=round(p.costBasis/Math.max(MIN_PRICE,p.margin),2);book.shortPositions[order.item_id]=p;cashFlow=-margin;}
 else if(order.intent==='close_short'){p=book.shortPositions[order.item_id];if(!p||p.quantity<qty)throw Error('Недостаточно акций в шорте');average=p.costBasis/p.quantity;const positionMargin=Number(p.margin??p.costBasis);share=positionMargin*qty/p.quantity;pnl=(average-price)*qty;cashFlow=Math.max(0,share+pnl);profile.credits=round(credits+cashFlow);p.quantity-=qty;p.costBasis=round(p.costBasis-average*qty);p.margin=round(positionMargin-share);if(p.quantity<=0)delete book.shortPositions[order.item_id];}
 else throw Error('Неизвестная операция');
 book.ledger.push({id:order.id,type:order.intent,itemId:order.item_id,quantity:qty,unitPrice:price,total,leverage:lev,margin:round(share||margin),cashFlow:round(cashFlow),realizedPnl:round(pnl),createdAt:iso(tick)});if(book.ledger.length>500)book.ledger.splice(0,book.ledger.length-500);
 savePlayer(order.campaign_id,order.player_id,profile,row.version);
}
function shouldFill(order,price){if(order.type==='market')return true;if(order.type==='limit')return ['open_long','close_short'].includes(order.intent)?price<=order.limit_price:price>=order.limit_price;if(order.type==='stop_loss')return order.intent==='close_long'?price<=order.trigger_price:price>=order.trigger_price;if(order.type==='take_profit')return order.intent==='close_long'?price>=order.trigger_price:price<=order.trigger_price;if(order.type==='trailing_stop'){const peak=order.intent==='close_long'?Math.max(order.peak||price,price):Math.min(order.peak||price,price);market.prepare('UPDATE orders SET peak=? WHERE id=?').run(peak,order.id);return order.intent==='close_long'?price<=peak*(1-order.trailing_percent/100):price>=peak*(1+order.trailing_percent/100);}return false;}
function processOrders(campaign,tick){for(const order of market.prepare("SELECT * FROM orders WHERE campaign_id=? AND status='pending'").all(campaign)){const q=market.prepare('SELECT price FROM quotes WHERE campaign_id=? AND item_id=?').get(campaign,order.item_id);if(!q||!shouldFill(order,q.price))continue;try{executeOrder(order,q.price,tick);market.prepare("UPDATE orders SET status='filled',fill_price=?,filled_at=? WHERE id=? AND status='pending'").run(q.price,iso(tick),order.id);}catch(error){market.prepare("UPDATE orders SET status='rejected',message=? WHERE id=?").run(String(error.message||error),order.id);}}}
function processLiquidations(campaign,tick){
 const prices=new Map(market.prepare('SELECT item_id,price FROM quotes WHERE campaign_id=?').all(campaign).map(row=>[row.item_id,Number(row.price)]));
 for(const row of pocketbase.prepare('SELECT playerId,playerJson,version FROM campaign_players WHERE campaignId=?').all(campaign)){
  const profile=parseJson(row.playerJson),book=portfolio(profile);let changed=false;
  for(const [itemId,position] of Object.entries(book.positions||{})){
   const qty=Math.max(0,Number(position.knownQty||0)),basis=Math.max(0,Number(position.costBasis||0)),margin=Math.max(0,Number(position.margin??basis)),price=prices.get(itemId);if(!qty||!basis||!Number.isFinite(price))continue;
   const average=basis/qty,equity=margin+(price-average)*qty;if(equity>0)continue;
   delete book.positions[itemId];changed=true;book.ledger.push({id:`liquidation-long-${itemId}-${tick}`,type:'liquidation_long',itemId,quantity:qty,unitPrice:price,total:round(price*qty),averagePrice:round(average),leverage:round(basis/Math.max(MIN_PRICE,margin),2),margin,cashFlow:0,realizedPnl:round(-margin),createdAt:iso(tick)});
   market.prepare("UPDATE orders SET status='rejected',message='Позиция ликвидирована' WHERE campaign_id=? AND player_id=? AND item_id=? AND intent='close_long' AND status='pending'").run(campaign,row.playerId,itemId);
  }
  for(const [itemId,position] of Object.entries(book.shortPositions||{})){
   const qty=Math.max(0,Number(position.quantity||0)),basis=Math.max(0,Number(position.costBasis||0)),margin=Math.max(0,Number(position.margin??basis)),price=prices.get(itemId);if(!qty||!basis||!Number.isFinite(price))continue;
   const average=basis/qty,equity=margin+(average-price)*qty;if(equity>0)continue;
   delete book.shortPositions[itemId];changed=true;book.ledger.push({id:`liquidation-short-${itemId}-${tick}`,type:'liquidation_short',itemId,quantity:qty,unitPrice:price,total:round(price*qty),averagePrice:round(average),leverage:round(basis/Math.max(MIN_PRICE,margin),2),margin,cashFlow:0,realizedPnl:round(-margin),createdAt:iso(tick)});
   market.prepare("UPDATE orders SET status='rejected',message='Позиция ликвидирована' WHERE campaign_id=? AND player_id=? AND item_id=? AND intent='close_short' AND status='pending'").run(campaign,row.playerId,itemId);
  }
  if(changed){if(book.ledger.length>500)book.ledger.splice(0,book.ledger.length-500);try{savePlayer(campaign,row.playerId,profile,row.version);}catch(error){console.error(new Date().toISOString(),'liquidation',row.playerId,error);}}
 }
}
function tick(campaign=DEFAULT_CAMPAIGN){
 if(ticking)return false;ticking=true;
 try{
  syncStocks(campaign);
  const target=Math.floor(nowSec()/TICK_SECONDS)*TICK_SECONDS,meta=market.prepare('SELECT last_tick FROM meta WHERE campaign_id=?').get(campaign);
  if(meta&&meta.last_tick>=target)return false;
  const start=Math.max(meta?.last_tick||target-TICK_SECONDS,target-TICK_SECONDS*120);
  market.exec('BEGIN IMMEDIATE');
  try{for(let time=start+TICK_SECONDS;time<=target;time+=TICK_SECONDS){for(const q of market.prepare('SELECT * FROM quotes WHERE campaign_id=?').all(campaign)){const next=nextPrice(campaign,q,time);market.prepare('UPDATE quotes SET previous_price=price,price=?,regime=?,last_tick=?,anchor=CASE WHEN ? IS NULL THEN anchor ELSE ? END WHERE campaign_id=? AND item_id=?').run(next.price,next.regime,time,next.anchor,next.anchor,campaign,q.item_id);writeCandle(campaign,q.item_id,time,next.price);}market.prepare('UPDATE meta SET last_tick=? WHERE campaign_id=?').run(time,campaign);}market.prepare('DELETE FROM events WHERE campaign_id=? AND end_tick<=?').run(campaign,target);market.exec('COMMIT');}catch(error){market.exec('ROLLBACK');throw error;}
  processLiquidations(campaign,target);processOrders(campaign,target);broadcast(campaign);return true;
 }finally{ticking=false;}
}
function indicators(rows){const closes=rows.map(x=>Number(x.close)),avg=n=>closes.length<n?null:round(closes.slice(-n).reduce((a,b)=>a+b,0)/n),sample=closes.slice(-15);let gains=0,losses=0;for(let i=1;i<sample.length;i++){const d=sample[i]-sample[i-1];d>=0?gains+=d:losses-=d;}return{sma5:avg(5),sma20:avg(20),rsi14:sample.length<15?null:round(100-100/(1+(losses?gains/losses:100)),2)};}
function publicState(campaign,playerId,itemId){syncStocks(campaign);const quotes=market.prepare('SELECT item_id AS itemId,ticker,price,previous_price AS previousPrice,price-previous_price AS change,CASE WHEN previous_price>0 THEN (price-previous_price)*100/previous_price ELSE 0 END AS changePercent,volatility,regime,last_tick AS tick FROM quotes WHERE campaign_id=? ORDER BY ticker').all(campaign);const candles={};if(itemId){const rows=market.prepare('SELECT bucket_time AS time,open,high,low,close,volume FROM candles WHERE campaign_id=? AND item_id=? ORDER BY bucket_time DESC LIMIT ?').all(campaign,itemId,MAX_CANDLES).reverse();candles[itemId]=rows;const q=quotes.find(x=>x.itemId===itemId);if(q)q.indicators=indicators(rows);}const orders=market.prepare("SELECT id,item_id AS itemId,type,intent,quantity,leverage,trigger_price AS triggerPrice,limit_price AS limitPrice,trailing_percent AS trailingPercent,status,fill_price AS fillPrice,message,created_at AS createdAt,filled_at AS filledAt,cancelled_at AS cancelledAt FROM orders WHERE campaign_id=? AND player_id=? ORDER BY created_at DESC LIMIT 100").all(campaign,playerId);return{ok:true,version:200,serverTime:new Date().toISOString(),lastTick:market.prepare('SELECT last_tick FROM meta WHERE campaign_id=?').get(campaign)?.last_tick||0,quotes,candles,orders,player:playerProfile(campaign,playerId).profile};}
function broadcast(campaign){const data=`event: quotes\ndata: ${JSON.stringify({campaignId:campaign,lastTick:market.prepare('SELECT last_tick FROM meta WHERE campaign_id=?').get(campaign)?.last_tick||0})}\n\n`;for(const client of streams){try{client.write(data);}catch{streams.delete(client);}}}
async function route(req,res){
 if(req.method==='OPTIONS')return send(res,204,{});
 const url=new URL(req.url,`http://${req.headers.host||'localhost'}`),path=url.pathname;
 try{
  if(path==='/health')return send(res,200,{ok:true,service:'grpgi-market-v2',tickSeconds:TICK_SECONDS,ticking});
  if(path.endsWith('/stream')){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','access-control-allow-origin':'*'});res.write('retry: 5000\n\n');streams.add(res);req.on('close',()=>streams.delete(res));return;}
  if(req.method==='GET'&&path.endsWith('/stock-exchange-v148')){const campaign=url.searchParams.get('campaignId')||DEFAULT_CAMPAIGN,playerId=url.searchParams.get('playerId')||'',itemId=url.searchParams.get('itemId')||'';if(!playerId)return send(res,400,{ok:false,message:'playerId required'});return send(res,200,publicState(campaign,playerId,itemId));}
  const body=await readBody(req),campaign=String(body.campaignId||DEFAULT_CAMPAIGN);
  if(req.method==='POST'&&path.endsWith('/order')){const id=String(body.operationId||crypto.randomUUID()),type=['market','limit','stop_loss','take_profit','trailing_stop'].includes(body.type)?body.type:'market',intent=['open_long','close_long','open_short','close_short'].includes(body.intent)?body.intent:'open_long';market.prepare(`INSERT OR IGNORE INTO orders(id,campaign_id,player_id,item_id,type,intent,quantity,leverage,trigger_price,limit_price,trailing_percent,peak,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,campaign,String(body.playerId),String(body.itemId),type,intent,clamp(Math.trunc(body.quantity||1),1,MAX_ORDER_QUANTITY),clamp(body.leverage||1,1,3),Math.max(0,Number(body.triggerPrice)||0),Math.max(0,Number(body.limitPrice)||0),clamp(body.trailingPercent||1,.1,50),0,'pending',new Date().toISOString());const orderTick=market.prepare('SELECT last_tick FROM meta WHERE campaign_id=?').get(campaign)?.last_tick||nowSec();processLiquidations(campaign,orderTick);processOrders(campaign,orderTick);return send(res,200,publicState(campaign,String(body.playerId),String(body.itemId)));}
  if(req.method==='POST'&&path.endsWith('/cancel')){const result=market.prepare("UPDATE orders SET status='cancelled',cancelled_at=? WHERE id=? AND campaign_id=? AND player_id=? AND status='pending'").run(new Date().toISOString(),String(body.orderId),campaign,String(body.playerId));return send(res,result.changes?200:404,{ok:Boolean(result.changes),status:result.changes?'cancelled':'not_found'});}
  if(req.method==='POST'&&path.endsWith('/impulse')){const {profile}=playerProfile(campaign,String(body.playerId)),role=String(profile.role||'').toLowerCase();if(!['gm','dm','master'].includes(role))return send(res,403,{ok:false,message:'Доступно ведущему'});const itemId=String(body.itemId),target=Number(body.targetPrice)||0,q=market.prepare('SELECT price FROM quotes WHERE campaign_id=? AND item_id=?').get(campaign,itemId);if(!q)return send(res,404,{ok:false,message:'Акция не найдена'});if(target>0){market.prepare('DELETE FROM events WHERE campaign_id=? AND item_id=?').run(campaign,itemId);market.prepare('UPDATE quotes SET previous_price=price,price=?,anchor=? WHERE campaign_id=? AND item_id=?').run(Math.max(MIN_PRICE,target),Math.max(MIN_PRICE,target),campaign,itemId);return send(res,200,{ok:true,status:'price-set'});}const start=(market.prepare('SELECT last_tick FROM meta WHERE campaign_id=?').get(campaign)?.last_tick||nowSec())+TICK_SECONDS,duration=Math.ceil(clamp(body.duration||60,TICK_SECONDS,3600)/TICK_SECONDS)*TICK_SECONDS,percent=clamp(body.percent,-50,50),startPrice=Math.max(MIN_PRICE,Number(q.price)),targetPrice=Math.max(MIN_PRICE,round(startPrice*(1+percent/100)));market.prepare('DELETE FROM events WHERE campaign_id=? AND item_id=?').run(campaign,itemId);market.prepare('INSERT INTO events(id,campaign_id,item_id,percent,start_tick,end_tick,start_price,target_price,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),campaign,itemId,percent,start,start+duration,startPrice,targetPrice,new Date().toISOString());return send(res,200,{ok:true,status:'scheduled',startPrice,targetPrice,duration});}
  if(req.method==='POST'&&path.endsWith('/tick')){if(!ADMIN_TOKEN||String(req.headers['x-grpgi-worker-token']||'')!==ADMIN_TOKEN)return send(res,401,{ok:false});return send(res,200,{ok:true,advanced:tick(campaign)});}
  return send(res,404,{ok:false,message:'Not found'});
 }catch(error){console.error(new Date().toISOString(),error);return send(res,500,{ok:false,message:String(error.message||error)});}
}
syncStocks(DEFAULT_CAMPAIGN);
tick(DEFAULT_CAMPAIGN);
setInterval(()=>{try{tick(DEFAULT_CAMPAIGN);}catch(error){console.error(new Date().toISOString(),error);}},TICK_SECONDS*1000).unref();
http.createServer(route).listen(PORT,HOST,()=>console.log(`GRPGI market service listening on http://${HOST}:${PORT}; tick=${TICK_SECONDS}s`));
