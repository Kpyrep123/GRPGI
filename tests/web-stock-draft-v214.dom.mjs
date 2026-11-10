import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

const {Window} = await import(process.env.HAPPY_DOM_MODULE ? pathToFileURL(process.env.HAPPY_DOM_MODULE) : 'happy-dom');
const w = new Window({url:'https://grpgi.test/app/', settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
const context = vm.createContext(w), run = text => vm.runInContext(text, context);
w.setInterval=()=>0;w.requestAnimationFrame=()=>0;
const read = name => fs.readFileSync('deploy/site/app/' + name, 'utf8');
w.document.write(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
for (const file of ['item-facts-v141.js','stock-ticket-v214.js','rich-text-scope.js','market-engine.js','player-sync-core.js','damage-types-v202.js','weapon-handling-v203.js','player-credentials-v212.js','player-auth-v212.js']) run(read(file));
const source = read('app.js').replace('  init().catch(error => {', `
  window.ticket214={App,compileData,currentPlayer,patch:patchStockExchangeWebV149,render:()=>renderMarket(),stock:id=>{marketTabWebV1073='stocks';stockSelectionWebV1074={source:'market',itemId:id};stockExchangeWebV148={fees:{tradeRate:.001},quotes:[{itemId:'s',price:100},{itemId:'b',price:1000}],orders:[],candles:{}};renderMarket();}};
  renderCurrentScreen=()=>{};startRealtimeSync=()=>{};notify=()=>{};
  if(false) init().catch(error => {`);
run(source);

try{
const T=w.ticket214,A=T.App;A.config={url:'https://test',campaignId:'main'};A.session={userId:'p',role:'player',campaignId:'main',authTokenV212:'fixture-session'};A.ui.screen='market';
const player={id:'p',role:'player',name:'Player',displayName:'Player',campaignIds:['main'],credits:1000,currentPlanetId:'home',inventory:[]};
T.compileData({world_json:{players:{PLAYER_TEMPLATES:{p:player}},campaigns:{CAMPAIGNS:{main:{id:'main',name:'Campaign'}}},planets:{PLANETS:{home:{id:'home',name:'Home',stockMarketEnabled:true,visibility:{playerIds:['p']}}}},equipment:{EQUIPMENT:{s:{id:'s',name:'Stock',type:'stock',stockTicker:'TEST',basePrice:100,visibility:{playerIds:['p']}},b:{id:'b',name:'Big',type:'stock',basePrice:1000,visibility:{playerIds:['p']}}}}},state_json:{}},[],[],null);
T.stock('s');const selector='[data-web-stock-order-quantity-v148]',intent='[data-web-stock-order-intent-v148]';
let field=w.document.querySelector(selector);assert(field);field.value='5';field.dispatchEvent(new w.Event('input',{bubbles:true}));let op=w.document.querySelector(intent);op.value='open_short';op.dispatchEvent(new w.Event('change',{bubbles:true}));
T.render();assert.equal(w.document.querySelector(selector).value,'5');assert.equal(w.document.querySelector(intent).value,'open_short');
const tile=w.document.querySelector('[data-web-stock-v1074][data-item-id="b"]');assert(tile);tile.click();assert.equal(w.document.querySelector(selector).value,'0');assert.equal(w.document.querySelector(intent).value,'open_short');
w.document.querySelector('[data-web-stock-v1074][data-item-id="s"]').click();field=w.document.querySelector(selector);field.value='999';field.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(field.value,'9');
const holdings={positions:{s:{itemId:'s',knownQty:5,unpricedQty:2,costBasis:500}},
 shortPositions:{s:{itemId:'s',quantity:3,costBasis:300}},ledger:[]};
T.currentPlayer().stockPortfolio=holdings;
T.render();
const pause=()=>new Promise(resolve=>setImmediate(resolve)),requests=[];
let failFirst=true;
w.fetch=async(url,options)=>{
 assert.match(String(url),/stock-exchange-v148\/order$/);
 assert.equal(options.headers['X-GRPGI-Session'],'fixture-session');
 const body=JSON.parse(options.body);requests.push(body);
 if(failFirst){failFirst=false;throw Error('lost response');}
 if(body.intent==='close_short')holdings.shortPositions.s.quantity-=body.quantity;
 else holdings.positions.s.knownQty-=body.quantity;
 if(!holdings.shortPositions.s?.quantity)delete holdings.shortPositions.s;
 return new w.Response(JSON.stringify({ok:true,status:'filled',player:{...T.currentPlayer(),stockPortfolio:holdings},
  fees:{tradeRate:.001},quotes:[{itemId:'s',price:100}],orders:[],candles:{}}));
};
const holding=side=>w.document.querySelector(`[data-source="portfolio"][data-position-side="${side}"][data-item-id="s"]`);
const close=()=>w.document.querySelector('[data-stock-position-close]');
const submit=()=>close().dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
holding('short').click();
assert(holding('short').classList.contains('selected')&&!holding('long').classList.contains('selected'));
assert.equal(close().previousElementSibling,holding('short'));
let quantity=close().querySelector('input'),button=close().querySelector('[type=submit]');
assert.equal(quantity.max,'3');assert.match(button.textContent,/Закрыть шорт/);
quantity.value='4';quantity.dispatchEvent(new w.Event('input',{bubbles:true}));
assert(button.disabled);submit();assert.equal(requests.length,0);
quantity.value='2';quantity.dispatchEvent(new w.Event('input',{bubbles:true}));
T.render();
assert.equal(close().querySelector('input').value,'2');
submit();submit();await pause();await pause();
assert.equal(requests.length,1);
submit();await pause();await pause();
assert.equal(requests[0].operationId,requests[1].operationId);
assert.deepEqual({...requests[1],operationId:null},{campaignId:'main',playerId:'p',itemId:'s',intent:'close_short',type:'market',quantity:2,operationId:null});
assert.equal(close().querySelector('input').max,'1');
T.patch();
assert.match(holding('short').textContent,/1 шт/);
close().querySelector('[data-close-all]').click();submit();await pause();await pause();
assert.equal(requests[2].quantity,1);
assert(!holding('short')&&!close());
holding('long').click();
assert.equal(close().querySelector('input').max,'5','unpriced legacy shares are excluded');
assert.match(close().querySelector('[type=submit]').textContent,/Закрыть лонг/);
submit();await pause();await pause();
assert.equal(requests[3].intent,'close_long');
assert.equal(close().querySelector('input').max,'4');
assert.match(holding('long').textContent,/6 шт/);
console.log('PASS actual web market render/stock click wiring: retained draft across rerender, switch to expensive stock clamps to zero, input cap includes commission, independent long/short close, retries and remaining quantity');
}finally{await w.happyDOM.abort();}
