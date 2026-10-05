// PLAYWRIGHT_MODULE=/path/index.mjs CHROMIUM_PATH=/path/chromium node tests/hub-functions-v156.browser.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE):'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const app=fs.readFileSync(path.join(root,'renderer/app.js'),'utf8');
const persist=app.slice(app.indexOf('  async persistAll(message, options = {})'),app.indexOf('  async resetWorldDefaults()',app.indexOf('  async persistAll(message, options = {})'))).trim().replace(/,$/,'');
await page.route('https://hub.test/**',route=>{const f=path.join(root,new URL(route.request().url()).pathname);if(new URL(route.request().url()).pathname.startsWith('/media/'))return route.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="orange"/></svg>',contentType:'image/svg+xml'});if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return route.abort();const ext=path.extname(f);return route.fulfill({body:ext==='.html'?fs.readFileSync(f,'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''):fs.readFileSync(f),contentType:ext==='.css'?'text/css':ext==='.js'?'text/javascript':'text/html'});});
try{
  await page.goto('https://hub.test/renderer/index.html');

  await page.evaluate(()=>{
    document.querySelectorAll('.modal.open').forEach(n=>n.classList.remove('open'));window.toasts=[];window.saveFail=false;window.cloudFail=false;window.playerFail=false;window.commits=0;
    window.PLANETS={h:{id:'h',name:'Test hub',locationType:'hub',otherMetadata:'keep',hub:{maps:[{id:'main',name:'Main',width:1200,height:720,spawnPoints:[{id:'entry',name:'Entry',x:100,y:300}],objects:[{id:'unit',kind:'unit',type:'npc',name:'Unit',npcId:'n',x:150,y:150,width:80,height:100,image:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="orange"/%3E%3C/svg%3E'},{id:'sign',kind:'asset',type:'decor',name:'Sign',image:'file:///fixture/legacy-sign.png',x:350,y:150,width:100,height:80,dialogIds:['intro','erase'],trader:true,merchantItemIds:['key']}]}],dialogs:[{id:'intro',name:'Read inscription',startNodeId:'start',nodes:[{id:'start',text:'Test inscription',choices:[]}]},{id:'erase',name:'Erase sticker',once:true,startNodeId:'start',conditions:[{type:'dialog',id:'intro'},{type:'item',id:'key',location:'equipped'}],nodes:[{id:'start',text:'Sticker',once:true,choices:[{id:'erase',text:'Erase',setFlag:'erased',nextNodeId:''}]}]}],flags:[{id:'erased',name:'Sticker erased'}]}}};
    window.NPCS={n:{id:'n',name:'NPC'}};window.EQUIPMENT={key:{id:'key',name:'Key',price:3,type:'item'}};window.ARTICLES={};window.PLAYER_TEMPLATES={};
    window.App={state:{users:{p:{id:'p',displayName:'Player',role:'gm',currentPlanetId:'h',credits:10,inventory:[{itemId:'key',qty:1}],equipmentSlots:{weapon:'key'}}},meta:{}},get currentUser(){return this.state.users.p;},uiHoverLock:false,renderLive(){},async writeLocalMirrors(){},refreshAfterLocalWrite(){}};
    window.Data={getPlanet:id=>PLANETS[id],getItem:id=>EQUIPMENT[id]};window.UI={activeModuleId:'',openModule(id){this.activeModuleId=id;},closeModule(){},selectedPlanetId:null};window.Wiki={showEntity(){}};
    window.Toast={show:(m,t)=>toasts.push({m,t})};window.Debug={log(){},error(){}};window.deep=x=>JSON.parse(JSON.stringify(x));window.isEntityVisible=()=>true;
    window.worldData={};window.buildWorldSnapshot=()=>({planets:{PLANETS:deep(PLANETS)}});window.applyWorldData=w=>{PLANETS=deep(w.planets.PLANETS);};
    window.electronAPI={chooseCombatMedia:async()=>({filePaths:['/fixture/unit.png']}),saveWorldImageFile:async args=>{(window.uploads||=[]).push(args.filePath);return{ok:true,cloudUrl:'https://hub.test/media/'+args.preferredStem};},saveWorldData:async snapshot=>{if(saveFail)return{ok:false,message:'disk failure'};window.saved=deep(snapshot);return{ok:true,world:deep(snapshot)};}};
    window.Persistence={save:async()=>{},load:async()=>App.state};window.Sync={markLocalDirty(){},pushCurrentSnapshot:async(reason,opts)=>{window.lastSections=opts.worldSections;if(window.cloudThrow)throw new Error('network failure');return cloudFail?{ok:false,message:'offline'}:{ok:true};}};
    window.PlayerSync={projectedPlayerV135:id=>deep(App.state.users[id]),async pushPlayerPatch(id,patch){if(playerFail)return{ok:false,message:'player failure'};Object.assign(App.state.users[id],deep(patch));commits++;return{ok:true};}};
    window.GRPGInventoryV1067={canAddItem:()=>({ok:!window.inventoryFull,reason:'Inventory full'})};
    window.Configurator={selectedType:'planets',selectedId:'h',getSelectedEntity:()=>PLANETS.h,renderPlanetEditor:()=>'<div class="section-title">Локация</div>',collectEntity:()=>({id:'h'}),render(){document.getElementById('config-content').innerHTML=this.renderPlanetEditor(PLANETS.h);}};
  });
  await page.evaluate(src=>{Configurator.persistAll=eval('({'+src+'})').persistAll;},persist);
  for(const file of ['hub-core-v156.js','hub-runtime-v156.js','hub-authoring-v156.js','hub-v153.js'])await page.addScriptTag({url:'https://hub.test/renderer/'+file});
  await page.evaluate(()=>Configurator.render());await page.locator('#hub-builder-open-v153').evaluate(n=>n.click());
  await page.waitForSelector('#hub-builder-v153');
  for(const width of [1440,1000,760]){
    await page.setViewportSize({width,height:1000});
    const rect=await page.locator('[data-builder-viewport]').boundingBox();assert.ok(rect.height>800,JSON.stringify(rect));assert.ok(rect.width>(width===760?700:width===1000?400:700),JSON.stringify(rect));
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-hub-object-v153="unit"]').click();
  const round=await page.locator('[data-hub-object-v153="unit"]').evaluate(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,r:getComputedStyle(n).borderRadius,img:getComputedStyle(n.querySelector('img')).borderRadius}));assert.ok(Math.abs(round.w-round.h)<1);assert.equal(round.r,'50%');assert.equal(round.img,'50%');
  await page.locator('[data-prop="name"]').fill('Saved unit');
  await page.locator('[data-pick-object-image]').click();await page.waitForFunction(()=>uploads?.length===1);
  await page.locator('[data-bool="trader"]').check();await page.locator('[data-multi="merchantItemIds"]').selectOption(['key']);
  await page.locator('[data-edit-flags]').click();await page.locator('[data-new-flag]').fill('door_unlocked');await page.locator('[data-new-name]').fill('Door unlocked');await page.locator('[data-add-flag]').click();await page.locator('[data-close-authoring]').click();
  await page.locator('[data-condition-add]').click();await page.locator('[data-condition-field="id"]').selectOption('door_unlocked');
  await page.locator('[data-dialogs]').click();await page.locator('[data-new-dialog]').click();
  await page.locator('[data-ref="dialog"][data-field="name"]').fill('New action');
  await page.locator('[data-add-column]').click();assert.equal(await page.locator('[data-column]').count(),2);
  await page.locator('[data-column]').first().locator('[data-add-choice]').click();
  await page.locator('[data-choice-row] [data-field="text"]').fill('Continue');
  const next=await page.locator('[data-column]').last().getAttribute('data-column');
  await page.locator('[data-choice-row] [data-field="nextNodeId"]').selectOption(next);
  await page.locator('[data-column]').last().locator('[data-field="once"]').check();
  await page.locator('[data-column]').last().locator('summary').filter({hasText:'Карты и собеседники'}).click();
  await page.locator('[data-column]').last().locator('[data-multi-field="mapIds"]').selectOption('main');
  await page.locator('[data-column]').last().locator('[data-multi-field="objectIds"]').selectOption('sign');
  if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'hub-dialog-editor.png')});}
  await page.locator('[data-close-authoring]').click();
  // Refresh replaces every planet reference while the independent editor draft remains open.
  await page.evaluate(()=>{PLANETS=deep(PLANETS);saveFail=true;});
  await page.locator('[data-save]').click();await page.waitForFunction(()=>!document.getElementById('hub-builder-v153').inert);
  assert.equal(await page.locator('#hub-builder-v153').count(),1);assert.equal(await page.evaluate(()=>PLANETS.h.hub.maps[0].objects[0].name),'Unit');
  await page.evaluate(()=>{saveFail=false;cloudFail=true;});await page.locator('[data-save]').click();await page.waitForFunction(()=>!document.getElementById('hub-builder-v153').inert);
  assert.equal(await page.locator('#hub-builder-v153').count(),1);assert.equal(await page.evaluate(()=>saved.planets.PLANETS.h.hub.maps[0].objects[0].name),'Saved unit');
  await page.evaluate(()=>{cloudFail=false;cloudThrow=true;});await page.locator('[data-save]').click();await page.waitForFunction(()=>!document.getElementById('hub-builder-v153').inert);assert.equal(await page.locator('#hub-builder-v153').count(),1);
  await page.evaluate(()=>cloudThrow=false);await page.locator('[data-save]').click();await page.waitForSelector('#hub-builder-v153',{state:'detached'});
  const saved=await page.evaluate(()=>({planet:window.saved.planets.PLANETS.h,sections:lastSections}));assert.equal(saved.planet.otherMetadata,'keep');assert.deepEqual(saved.sections,['planets']);assert.equal(saved.planet.hub.maps[0].objects[0].trader,true);assert.equal(saved.planet.hub.flags.length,2);assert.ok(saved.planet.hub.maps[0].objects.find(o=>o.id==='sign').image.startsWith('https://'));assert.ok(await page.evaluate(()=>uploads.includes('/fixture/legacy-sign.png')));
  await page.locator('#hub-builder-open-v153').evaluate(n=>n.click());await page.locator('[data-dialogs]').click();await page.locator('[data-select-dialog]').last().click();assert.equal(await page.locator('[data-column]').count(),2);await page.locator('[data-close-authoring]').click();await page.locator('[data-close]').click();
  // Cancel must not leak the draft into the live planet.
  await page.locator('#hub-builder-open-v153').evaluate(n=>n.click());await page.locator('[data-prop="map.name"]').fill('Cancelled');await page.locator('[data-close]').click();assert.equal(await page.evaluate(()=>PLANETS.h.hub.maps[0].name),'Main');
  await page.evaluate(()=>UI.openModule('hub-v153'));await page.locator('#mod-hub-v153').evaluate(n=>n.classList.add('open'));
  await page.locator('[data-object="sign"]').click();assert.equal(await page.locator('[data-dialog="erase"]').count(),0);
  await page.locator('[data-dialog="intro"]').click();await page.locator('[data-finish]').click();await page.waitForSelector('[data-dialog="erase"]');
  assert.equal(await page.evaluate(()=>App.currentUser.hubState.completedDialogs.intro),true);
  await page.locator('[data-dialog="erase"]').click();await page.locator('[data-choice="erase"]').click();await page.waitForSelector('.hub-modal-v153',{state:'detached'});
  assert.equal(await page.evaluate(()=>App.currentUser.hubState.flags.erased),true);assert.equal(await page.locator('[data-dialog="erase"]').count(),0);
  await page.locator('[data-trade]').click();await page.evaluate(()=>playerFail=true);await page.locator('[data-buy="key"]').click();await page.waitForFunction(()=>document.querySelector('.hub-modal-v153 [data-status]').textContent==='player failure');assert.equal(await page.evaluate(()=>App.currentUser.credits),10);
  await page.evaluate(()=>{playerFail=false;inventoryFull=true;});await page.locator('[data-buy="key"]').click();await page.waitForFunction(()=>document.querySelector('.hub-modal-v153 [data-status]').textContent==='Inventory full');assert.equal(await page.evaluate(()=>App.currentUser.credits),10);
  await page.evaluate(()=>inventoryFull=false);await page.locator('[data-buy="key"]').click();await page.waitForFunction(()=>App.currentUser.credits===7);assert.equal(await page.evaluate(()=>App.currentUser.inventory[0].qty),2);
  await page.locator('.hub-modal-v153 [data-close]').click();
  const snap=process.env.SCREENSHOT_DIR;if(snap){fs.mkdirSync(snap,{recursive:true});await page.screenshot({path:path.join(snap,'hub-runtime.png')});}
  // Web adapter uses the same rules and checked commit path.
  const fixture=await page.evaluate(()=>({planet:PLANETS.h,player:deep(App.currentUser)}));
  await page.setContent('<div id="screen-hub-v153" class="screen"></div><button id="nav-hub-v153" class="nav-btn"></button>');
  await page.addStyleTag({url:'https://hub.test/deploy/site/app/hub-v153.css'});
  await page.evaluate(({planet,player})=>{player.hubState=null;player.hubProgress={};window.webPlayer=player;window.webPlanet=planet;window.GRPGHubBridgeV153={app:{ui:{}},currentPlayer:()=>webPlayer,currentPlanet:()=>webPlanet,canAdd:()=>({ok:true}),item:id=>EQUIPMENT[id],article:()=>null,openArticle(){},openStocks(){},notify(){},async commit(mutator){const next=deep(webPlayer);await mutator(next);webPlayer=next;}};},fixture);
  for(const file of ['hub-core-v156.js','hub-runtime-v156.js','hub-v153.js'])await page.addScriptTag({url:'https://hub.test/deploy/site/app/'+file});
  await page.locator('#nav-hub-v153').click();await page.locator('[data-object="sign"]').click();await page.locator('[data-dialog="intro"]').click();await page.locator('[data-finish]').click();await page.waitForSelector('[data-dialog="erase"]');await page.locator('[data-dialog="erase"]').click();await page.locator('[data-choice="erase"]').click();await page.waitForSelector('.hub-modal-v153',{state:'detached'});assert.equal(await page.evaluate(()=>webPlayer.hubState.flags.erased),true);
  await page.locator('[data-trade]').click();await page.locator('[data-buy="key"]').click();await page.waitForFunction(()=>webPlayer.credits===4);
  assert.deepEqual(errors,[]);console.log('Hub browser: layout, circular units, authoring, detached saves, failures/retry, cancel, desktop/web dialogues and purchases passed');
}finally{await browser.close();}
