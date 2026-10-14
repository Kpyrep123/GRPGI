import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:1900,height:916}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Real init binds navigation after this async service-worker cleanup, reproducing the observed ordering.
 await page.addInitScript(()=>{if(navigator.serviceWorker)Object.defineProperty(navigator.serviceWorker,'getRegistrations',{value:()=>new Promise(resolve=>setTimeout(()=>resolve([]),300))});});
 await page.route('https://sync.grpg-sync.ru/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"message":"fixture offline"}'}));
 await page.route('https://web168.test/**',async route=>{
  const relative='deploy/site/app'+decodeURIComponent(new URL(route.request().url()).pathname),file=path.resolve(relative);
  if(!file.startsWith(path.resolve('deploy/site/app')+path.sep))return route.abort();
  try{const body=process.env.SOURCE_REF?execFileSync('git',['show',process.env.SOURCE_REF+':'+relative],{stdio:['ignore','pipe','ignore']}):await fs.readFile(file);const ext=path.extname(file);await route.fulfill({body,contentType:ext==='.html'?'text/html':ext==='.js'?'text/javascript':ext==='.css'?'text/css':'application/octet-stream'});}catch{await route.abort();}
 });
 await page.goto('https://web168.test/index.html');await page.waitForFunction(()=>window.GRPGHubBridgeV153&&document.querySelector('#login-status').textContent.includes('Не удалось'));
 await page.evaluate(()=>{
  const B=GRPGHubBridgeV153,A=B.app,S=GRPGHubSpatialV157;
  const map={id:'main',name:'Основная карта',width:2000,height:1200,hexSize:28,objects:[],spawnPoints:[],walls:[]},start=S.center(map,{q:12,r:14});map.spawnPoints=[{id:'entry',...start}];
  map.objects=[{id:'sign',name:'Надпись',type:'decor',x:start.x+35,y:start.y-24,width:48,height:48,dialogIds:['read']}];
  const planet={id:'h',name:'Сухой док',locationType:'hub',hub:{maps:[map],defaultMapId:'main',dialogs:[{id:'read',name:'Прочитать',startNodeId:'n',nodes:[{id:'n',text:'Надпись',choices:[]}]}]}},player={id:'p',displayName:'Тест',currentPlanetId:'h',credits:0,inventory:[],campaignIds:['main'],role:'player'};
  A.data.planets.set('h',planet);A.data.players.set('p',player);A.session={userId:'p',role:'player'};A.ui.boot='app';A.ui.screen='profile';
  document.getElementById('login-screen').classList.add('hidden');document.getElementById('app-shell').classList.remove('hidden');document.getElementById('nav-hub-v153').classList.remove('hidden');
 });
 await page.locator('[data-screen="profile"]').click();assert.equal(await page.locator('#screen-title').textContent(),'Профиль');
 const hub=page.locator('#nav-hub-v153');await hub.click();await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>GRPGHubBridgeV153.app.ui.screen),'hub-v153');assert.equal(await page.locator('#screen-hub-v153').isVisible(),true);assert.equal(await page.locator('[data-runtime-map]').isVisible(),true);assert.equal(await page.locator('#screen-title').textContent(),'Хаб');assert.equal(await page.locator('.screen.active').count(),1);
 assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('grpg.web.navigation.v149')).screen),'hub-v153');
 await page.locator('[data-object="sign"]').click();await page.locator('[data-interact-toggle]').click();await page.locator('[data-dialog="read"]').click();assert.equal(await page.locator('[data-leave]').isVisible(),true);await page.locator('[data-leave]').click();
 await page.locator('[data-screen="profile"]').click();await hub.click();await page.goBack();await page.waitForFunction(()=>GRPGHubBridgeV153.app.ui.screen==='profile');await page.goForward();await page.waitForFunction(()=>GRPGHubBridgeV153.app.ui.screen==='hub-v153');assert.equal(await page.locator('[data-runtime-map]').isVisible(),true);
 for(let i=0;i<2;i++){await page.locator('[data-screen="profile"]').click();await hub.click();assert.equal(await page.locator('[data-runtime-map]').isVisible(),true);}
 await page.waitForTimeout(250);await fs.mkdir('/tmp/hub168-shots',{recursive:true});await page.screenshot({path:'/tmp/hub168-shots/web-hub.png'});assert.deepEqual(errors,[]);
 await page.evaluate(()=>{delete window.GRPGHubV153;GRPGHubBridgeV153.openHub();});assert.equal(await page.locator('#screen-hub-v153').textContent(),'Хаб загружается…');await page.addScriptTag({url:'https://web168.test/hub-v153.js?v=late-load'});assert.equal(await page.locator('[data-runtime-map]').isVisible(),true);
 // Compatibility fallback protects against a still-cached pre-v168 app bundle's generic listener.
 await page.evaluate(()=>{delete GRPGHubBridgeV153.openHub;const button=document.getElementById('nav-hub-v153');button.removeAttribute('data-screen');button.addEventListener('click',()=>{GRPGHubBridgeV153.app.ui.screen=undefined;document.querySelectorAll('.screen').forEach(n=>n.classList.remove('active'));});});
 await page.addScriptTag({url:'https://web168.test/hub-v153.js?v=fallback'});await hub.click();assert.equal(await page.evaluate(()=>GRPGHubBridgeV153.app.ui.screen),'hub-v153');assert.equal(await page.locator('[data-runtime-map]').isVisible(),true);
 console.log('PASS: real web startup with delayed nav binding, Profile→Hub, map/actions, repeated switching, history Back/Forward, saved hub route and cached-app fallback');
}finally{await browser.close();}
