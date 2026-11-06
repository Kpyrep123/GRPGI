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
for (const file of ['stock-ticket-v214.js','rich-text-scope.js','market-engine.js','player-sync-core.js','damage-types-v202.js','weapon-handling-v203.js','player-credentials-v212.js','player-auth-v212.js']) run(read(file));
const source = read('app.js').replace('  init().catch(error => {', `
  window.stockTest={App,ticket:stockOrderPanelWebV148};stockExchangeWebV148={fees:{tradeRate:.001,borrowDailyRate:.0003,custodyDailyRate:.0001},quotes:[],orders:[],candles:{}};
  renderCurrentScreen=()=>{};startRealtimeSync=()=>{};notify=()=>{};
  if(false) init().catch(error => {`);
run(source);

const api=w.stockTest,requests=[],pause=()=>new Promise(resolve=>setImmediate(resolve));
w.fetch=async(url,options)=>{requests.push({url:String(url),body:options.body?JSON.parse(options.body):null,headers:options.headers});return new w.Response(JSON.stringify({ok:true,quotes:[],orders:[],candles:{}}));};
try {
 api.App.config={url:'https://sync.test',campaignId:'backend'};
 api.App.session={userId:'p',authTokenV212:'session'};
 api.App.data.players.set('p',{id:'p',role:'player',credits:10000});
 const ticket=w.document.createElement('section');ticket.innerHTML=api.ticket({id:'alpha'});w.document.body.append(ticket);
 const field=n=>ticket.querySelector(`[data-web-stock-${n}]`);
 assert.deepEqual(Array.from(field('order-type-v148').options).map(o=>o.value),['market','limit']);
 assert.match(ticket.textContent,/0,1%/);assert.match(ticket.textContent,/0,03%/);assert.match(ticket.textContent,/0,01%/);
 field('stop-loss-v213').value='90';field('take-profit-v213').value='120';field('order-quantity-v148').value='3';field('order-leverage-v148').value='3';field('submit-v148').click();await pause();await pause();
 let sent=requests.find(r=>r.url.endsWith('/order'));assert(sent);assert.equal(sent.body.stopLoss,90);assert.equal(sent.body.takeProfit,120);assert.equal(sent.body.leverage,3);assert.equal(sent.headers['X-GRPGI-Session'],'session');
 field('order-intent-v148').value='close_long';field('order-intent-v148').dispatchEvent(new w.Event('change',{bubbles:true}));
 assert(field('stop-loss-v213').disabled);assert.equal(field('stop-loss-v213').value,'');assert(field('take-profit-v213').disabled);
 console.log('PASS actual web ticket: only market/limit, optional stop/take submitted with session, closing clears protection, server fee disclosure');
} finally {await w.happyDOM.abort();}
