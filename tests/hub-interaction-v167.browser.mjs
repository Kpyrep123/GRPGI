import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{for(const folder of ['renderer','deploy/site/app']){
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://hub167.test/**',async route=>{
  const file=path.resolve(new URL(route.request().url()).pathname.slice(1));
  try{let body=await fs.readFile(file);if(file.endsWith('.html'))body=body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');await route.fulfill({body,contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html'});}catch{await route.abort();}
 });
 await page.setViewportSize({width:1370,height:716});await page.goto('https://hub167.test/'+folder+'/index.html');
 for(const file of ['hub-core-v156.js','hub-spatial-v157.js','hub-runtime-v156.js'])await page.addScriptTag({url:'https://hub167.test/'+folder+'/'+file});
 await page.evaluate(web=>{
  document.querySelectorAll('.modal.open').forEach(n=>n.classList.remove('open'));
  const root=web?document.getElementById('screen-hub-v153'):document.getElementById('hub-content-v153');
  if(web){document.getElementById('app-shell').classList.remove('hidden');document.querySelectorAll('.screen').forEach(n=>n.classList.toggle('active',n===root));}else document.getElementById('mod-hub-v153').classList.add('open');
  const S=GRPGHubSpatialV157,C=GRPGHubCoreV156;window.map={id:'a',name:'Основная карта',width:2000,height:1200,hexSize:28,objects:[],walls:[],spawnPoints:[]};
  const start=S.center(map,{q:12,r:14}),at=S.center(map,{q:13,r:14}),far=S.center(map,{q:15,r:14});map.spawnPoints=[{id:'entry',...start}];map.objects=[{id:'door',name:'Дверь',type:'door',x:at.x-24,y:at.y-24,width:48,height:48},{id:'far',name:'Дальняя дверь',type:'door',x:far.x-24,y:far.y-24,width:48,height:48}];
  window.planet={id:'h',name:'Сухой док',locationType:'hub',hub:{maps:[map],defaultMapId:'a',dialogs:[]}};window.player={id:'p',displayName:'Персонаж',currentPlanetId:'h',inventory:[]};C.storeState(player,C.stateFor(player,planet,planet.hub));window.calls=[];window.notices=[];
  window.runtime=GRPGHubRuntimeV156.create({root:()=>root,currentPlayer:()=>player,currentPlanet:()=>planet,isActive:()=>true,activate(){},notify:m=>notices.push(m),openStocks(){},article(){},async commit(m){const next=structuredClone(player);await m(next);player=next;calls.push(structuredClone(next));}});runtime.show();
 },folder!=='renderer');
 await page.waitForTimeout(150);const initial=await page.locator('.hub-camera-v164').boundingBox(),token=await page.locator('.hub-player-v153').boundingBox();assert.ok(token.x+token.width/2>=initial.x&&token.x+token.width/2<=initial.x+initial.width);assert.ok(token.y+token.height/2>=initial.y&&token.y+token.height/2<=initial.y+initial.height);
 for(const viewport of [{width:1370,height:716},{width:980,height:700},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.waitForTimeout(150);await page.evaluate(()=>runtime.show());await page.waitForTimeout(150);await page.locator('[data-camera-center]').click();await page.waitForTimeout(100);
  const camera=await page.locator('.hub-camera-v164').boundingBox();assert.ok(camera.height>viewport.height*.45,JSON.stringify({folder,viewport,camera}));assert.ok(camera.y+camera.height<=viewport.height);
  if(folder!=='renderer'){const dock=await page.locator('.bottom-nav').boundingBox();assert.ok(camera.y+camera.height<=dock.y);}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const baseline=await page.evaluate(()=>calls.length);await page.locator('[data-object="door"]').click();assert.equal(await page.locator('[data-interact-toggle]').isVisible(),true);assert.equal(await page.locator('[data-use]').isVisible(),false);assert.equal(await page.locator('[data-info] button').count(),0);
  const size=await page.locator('[data-interact-toggle]').boundingBox();await page.locator('[data-camera-in]').click();await page.waitForTimeout(100);const zoomed=await page.locator('[data-interact-toggle]').boundingBox();assert.ok(zoomed);assert.equal(Math.round(size.width),Math.round(zoomed.width));
  await page.locator('[data-interact-toggle]').click();assert.equal(await page.locator('[data-use]').isVisible(),true);assert.equal(await page.evaluate(()=>calls.length),baseline);
  const menu=await page.locator('[data-interaction-popover]').boundingBox(),area=await page.locator('.hub-camera-v164').boundingBox();assert.ok(menu.x>=area.x&&menu.x+menu.width<=area.x+area.width+1);assert.ok(menu.y>=area.y&&menu.y+menu.height<=area.y+area.height+1);
  await fs.mkdir('/tmp/hub167-shots',{recursive:true});await page.screenshot({path:'/tmp/hub167-shots/'+folder.replaceAll('/','-')+'-'+viewport.width+'.png'});
  await page.locator('[data-interact-toggle]').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('[data-interaction-popover]').count(),0);
  await page.evaluate(()=>runtime.select('far'));await page.locator('[data-interact-toggle]').click();assert.equal(await page.locator('[data-use]').isDisabled(),true);assert.ok((await page.locator('[data-interaction-options]').textContent()).includes('2 гексов'));
  await page.evaluate(()=>runtime.select('door'));await page.locator('[data-interact-toggle]').click();await page.locator('[data-use]').click();await page.waitForFunction(n=>calls.length>n,baseline);assert.ok(['open','closed'].includes(await page.evaluate(()=>player.hubState.objectStates.door)));
 }
 assert.deepEqual(errors,[]);console.log(folder+': full-height workspace at 1370/980/390px, anchored unscaled popup, edge clamp, configured actions, Escape, range guard and saved use passed');await page.close();
}}finally{await browser.close();}
