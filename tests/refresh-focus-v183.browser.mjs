import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>window.setInterval=()=>0);
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url()),base=path.resolve('deploy/site/app');if(u.hostname!=='focus183.test')return route.fulfill({status:503,contentType:'application/json',body:'{"message":"offline fixture"}'});
  const file=path.resolve(base,decodeURIComponent(u.pathname.slice(1))||'index.html');if(!file.startsWith(base+path.sep)||! /\.(html|css|js)$/.test(file))return route.abort();
  try{let body=await fs.readFile(file);if(file.endsWith('/app.js'))body=body.toString().replace('  init().catch(error => {',`window.test183={App,config:normalizeConfig,compileData,normalizePlayerRow,render:()=>renderCurrentScreen(),incoming:changed=>renderAffectedScreens(changed),threads:()=>buildThreads(),chat:key=>openWebChatMasterV1068(key),patch:()=>patchStockExchangeWebV149({forceOrders:true}),stock(){marketTabWebV1073='stocks';stockSelectionWebV1074={source:'market',itemId:'s'};stockExchangeWebV148={quotes:[{itemId:'s',price:650.1234,indicators:{}}],candles:{s:Array.from({length:360},(_,i)=>({open:640+i/50,close:641+i/50,high:643+i/50,low:638+i/50}))}};},period:v=>{stockTimeframeWebV148=v;patchStockExchangeWebV149();}};bindGlobalEvents();if(false) init().catch(error => {`);await route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}catch{return route.abort();}
 });
 await page.goto('https://focus183.test/');
 await page.evaluate(()=>{
  const T=test183,A=T.App;A.config=T.config({campaignId:'main'});A.session={userId:'p',role:'player',campaignId:'main'};
  const player={id:'p',role:'player',name:'Player',displayName:'Player',campaignIds:['main'],credits:100000,currentPlanetId:'home',inventory:[]};
  const world={players:{PLAYER_TEMPLATES:{p:player}},campaigns:{CAMPAIGNS:{main:{id:'main',name:'Campaign'}}},planets:{PLANETS:{home:{id:'home',name:'Home',stockMarketEnabled:true,visibility:{playerIds:['p']}}}},equipment:{EQUIPMENT:{s:{id:'s',name:'Stock',type:'stock',stockTicker:'TEST',basePrice:650,visibility:{playerIds:['p']}}}},articles:{ARTICLES:{a:{id:'a',name:'Alpha',description:'First',visibility:{playerIds:['p']}}}}};
  T.compileData({world_json:world,state_json:{}},[],[],null);A.ui.boot='app';A.ui.screen='archive';document.getElementById('login-screen').classList.add('hidden');document.getElementById('app-shell').classList.remove('hidden');T.render();
 });
 const search=page.locator('#archive-search-input');await search.fill('Alpha');await search.evaluate(el=>el.setSelectionRange(1,4,'backward'));
 for(let i=0;i<5;i++)await page.evaluate(()=>test183.incoming({snapshot:true}));
 assert.deepEqual(await search.evaluate(el=>({focus:document.activeElement===el,value:el.value,start:el.selectionStart,end:el.selectionEnd,direction:el.selectionDirection})),{focus:true,value:'Alpha',start:1,end:4,direction:'backward'});
 await search.evaluate(el=>el.setSelectionRange(2,2));await page.keyboard.insertText('x');assert.equal(await search.inputValue(),'Alxpha');assert.equal(await search.evaluate(el=>el.selectionStart),3);
 // Native composition is deferred, retaining the original input until it finishes.
 await search.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));window.composingInput183=el;el.value='Alpha';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'a'}));test183.incoming({snapshot:true});});assert(await page.evaluate(()=>composingInput183.isConnected));await search.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));await page.waitForFunction(()=>document.activeElement?.id==='archive-search-input');assert.equal(await search.inputValue(),'Alpha');
 await page.evaluate(()=>{test183.App.ui.screen='chat';test183.render();const thread=test183.threads()[0];if(!thread)throw Error('No campaign thread');test183.chat(thread.key);});
 const message=page.locator('#chat-compose-form textarea[name="body"]');await message.fill('First line\nSecond line');await message.evaluate(el=>{el.setSelectionRange(3,10,'backward');el.scrollTop=4;});
 for(let i=0;i<3;i++){await page.evaluate(()=>test183.incoming({chat:true}));await page.evaluate(()=>new Promise(requestAnimationFrame));}
 assert.deepEqual(await message.evaluate(el=>({focus:document.activeElement===el,value:el.value,start:el.selectionStart,end:el.selectionEnd,direction:el.selectionDirection})),{focus:true,value:'First line\nSecond line',start:3,end:10,direction:'backward'});
 // An explicit navigation must not put the caret back into a hidden conversation.
 await page.evaluate(()=>{test183.App.ui.screen='market';test183.App.ui.chatMasterOpenV1068=false;document.getElementById('chat-master-modal-v1068')?.classList.add('hidden');test183.stock();test183.render();});
 const qty=page.locator('[data-web-stock-order-quantity-v148]');assert.equal(await qty.count(),1);await qty.fill('17');
 const limit=page.locator('[data-web-stock-order-limit-v148]');await page.selectOption('[data-web-stock-order-type-v148]','limit');await limit.fill('615.25');await limit.focus();assert.equal(await qty.inputValue(),'17','before incoming');
 for(let i=0;i<5;i++)await page.evaluate(()=>test183.incoming({players:true}));assert.equal(await qty.inputValue(),'17');assert.equal(await limit.inputValue(),'615.25');assert(await limit.evaluate(el=>document.activeElement===el));
 await page.evaluate(()=>test183.patch());assert.equal(await qty.inputValue(),'17');assert.equal(await limit.inputValue(),'615.25');assert(await limit.evaluate(el=>document.activeElement===el));
 const ticks=await page.locator('.stock-grid-v183 text').allTextContents();assert.equal(ticks.length,5);assert(ticks.every(t=>/\d+,\d{2,4}/.test(t)));const prices=ticks.map(t=>Number(t.replace(/\s/g,'').replace(',','.')));assert(prices.every((v,i)=>i===0||v<prices[i-1]));
 await page.locator('.stock-ta-v148').screenshot({path:'/tmp/stock-scale-v183.png'});
 for(const period of ['3h','6h','1h']){await page.locator(`[data-web-stock-timeframe-v148="${period}"]`).click();assert.equal(await page.locator('.stock-grid-v183 text').count(),5);}
 // Generic rich editor selection and multi-field form restoration use the same helper.
 const rich=await page.evaluate(()=>{
  const K=GRPGFocusKeeperV183;K.run(()=>{},()=> 'rich-test');const box=document.createElement('form');box.id='rich-form';box.innerHTML='<input name="title" value="Draft"><div id="rich-editor" contenteditable="true"><p>First <b>second</b> third</p></div>';document.body.append(box);const ed=document.getElementById('rich-editor');ed.focus();const range=document.createRange();range.setStart(ed.querySelector('b').firstChild,1);range.setEnd(ed.querySelector('b').firstChild,5);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);K.run(()=>box.outerHTML='<form id="rich-form"><input name="title" value="Remote"><div id="rich-editor" contenteditable="true">Remote</div></form>',()=> 'rich-test');return {text:getSelection().toString(),html:document.getElementById('rich-editor').innerHTML,title:document.querySelector('#rich-form input').value};
 });assert.equal(rich.text,'econ');assert.equal(rich.title,'Draft');assert(rich.html.includes('<b>second</b>'));
 await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.stock-grid-v183 text').count(),5);assert.deepEqual(errors,[]);
 console.log('PASS v183 real web: repeated incoming updates preserve archive/chat/stock form focus, draft values and selection; mid-string typing, IME, forced patch, rich editor range and navigation; five numeric candle ticks for all timeframes and mobile.');
}finally{await browser.close();}
