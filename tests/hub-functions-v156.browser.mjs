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
  for(const file of ['hub-core-v156.js','hub-spatial-v157.js','dialog-view-v161.js','hub-runtime-v156.js','hub-authoring-v156.js','dialog-editor-v161.js','hub-v153.js'])await page.addScriptTag({url:'https://hub.test/renderer/'+file});
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
  // Draw, duplicate, undo and restore a wall in the independent map draft.
  await page.locator('[data-tool="wall"]').click();
  const stageRect=await page.locator('[data-builder-stage]').boundingBox(),wallStart={x:stageRect.x+stageRect.width*.45,y:stageRect.y+stageRect.height*.75},wallEnd={x:stageRect.x+stageRect.width*.7,y:wallStart.y};
  await page.mouse.move(wallStart.x,wallStart.y);await page.mouse.down();await page.mouse.move(wallEnd.x,wallEnd.y,{steps:10});await page.mouse.up();
  assert.equal(await page.locator('[data-wall]').count(),1);await page.locator('[data-duplicate-wall]').click();assert.equal(await page.locator('[data-wall]').count(),2);await page.locator('[data-undo]').click();assert.equal(await page.locator('[data-wall]').count(),1);await page.locator('[data-redo]').click();assert.equal(await page.locator('[data-wall]').count(),2);await page.locator('[data-delete-wall]').click();assert.equal(await page.locator('[data-wall]').count(),1);
  await page.locator('[data-map-fog]').check();await page.locator('[data-fog-preview]').check();assert.equal(await page.locator('[data-editor-fog]').count(),1);const preview=await page.locator('[data-editor-fog]').evaluate(c=>{const x=c.getContext('2d');return{start:x.getImageData(100,300,1,1).data[3],far:x.getImageData(1190,710,1,1).data[3]};});assert.equal(preview.start,0);assert.ok(preview.far>100);if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'hub-wall-editor.png')});}await page.locator('[data-map-fog]').uncheck();
  await page.locator('[data-dialogs]').click();await page.locator('[data-new-dialog]').click();
  await page.locator('[data-ref="dialog"][data-field="name"]').fill('New action');
  await page.locator('[data-add-column]').click();assert.equal(await page.locator('[data-column]').count(),2);
  await page.locator('[data-column]').first().locator('[data-add-choice]').click();
  await page.locator('[data-inspector] [data-field="text"]').fill('Continue');
  const next=await page.locator('[data-column]').last().getAttribute('data-column');
  const fromPort=page.locator('[data-node-output]').first(),toPort=page.locator('[data-node-input="'+next+'"]');
  await fromPort.scrollIntoViewIfNeeded();await toPort.scrollIntoViewIfNeeded();
  const fromRect=await fromPort.boundingBox(),toRect=await toPort.boundingBox();
  await page.mouse.move(fromRect.x+fromRect.width/2,fromRect.y+fromRect.height/2);await page.mouse.down();await page.mouse.move(toRect.x+toRect.width/2,toRect.y+toRect.height/2,{steps:14});await page.mouse.up();
  await page.waitForSelector('[data-edge]',{state:'attached'});assert.equal(await page.locator('[data-edge]').count(),1);
  // Moving a node preserves its link; disconnecting and reconnecting update the underlying response.
  const handle=page.locator('[data-node-handle]').last(),handleRect=await handle.boundingBox(),nodeBefore=await page.locator('[data-column]').last().evaluate(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top)}));
  await page.mouse.move(handleRect.x+120,handleRect.y+20);await page.mouse.down();await page.mouse.move(handleRect.x+180,handleRect.y+60,{steps:10});await page.mouse.up();
  const nodeAfter=await page.locator('[data-column]').last().evaluate(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top)}));assert.ok(nodeAfter.x>nodeBefore.x+50);assert.ok(nodeAfter.y>nodeBefore.y+30);
  await page.locator('[data-select-reply]').first().click();await page.locator('[data-destination]').selectOption('unset');assert.equal(await page.locator('[data-edge]').count(),0);
  await page.locator('[data-node-output]').focus();await page.keyboard.press('Enter');await page.locator('[data-node-input="'+next+'"]').focus();await page.keyboard.press('Enter');await page.waitForSelector('[data-edge]',{state:'attached'});await page.locator('.dlg-editor-v161 [data-zoom-out]').click();assert.equal(await page.locator('[data-graph-scale]').textContent(),'83%');await page.locator('.dlg-editor-v161 [data-zoom-in]').click();await page.waitForSelector('[data-edge]',{state:'attached'});assert.equal(await page.locator('[data-edge]').count(),1);
  await page.locator('[data-column]').last().locator('[data-select-node]').click();await page.locator('[data-inspector] [data-field="terminal"]').check();await page.locator('[data-inspector] [data-field="once"]').check();
  await page.locator('[data-inspector] summary').filter({hasText:'Maps and speakers'}).click();
  await page.locator('[data-inspector] [data-multi-field="mapIds"]').selectOption('main');
  await page.locator('[data-inspector] [data-multi-field="objectIds"]').selectOption('sign');
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
  const saved=await page.evaluate(()=>({planet:window.saved.planets.PLANETS.h,sections:lastSections}));assert.equal(saved.planet.otherMetadata,'keep');assert.deepEqual(saved.sections,['planets']);assert.equal(saved.planet.hub.maps[0].objects[0].trader,true);assert.equal(saved.planet.hub.flags.length,2);assert.equal(saved.planet.hub.maps[0].walls.length,1);const savedGraph=saved.planet.hub.dialogs.at(-1);assert.equal(savedGraph.nodes[0].choices[0].nextNodeId,savedGraph.nodes[1].id);assert.ok(savedGraph.nodes[1].editorPosition.x>500);assert.ok(saved.planet.hub.maps[0].objects.find(o=>o.id==='sign').image.startsWith('https://'));assert.ok(await page.evaluate(()=>uploads.includes('/fixture/legacy-sign.png')));
  await page.locator('#hub-builder-open-v153').evaluate(n=>n.click());await page.locator('[data-dialogs]').click();await page.locator('[data-select-dialog]').last().click();assert.equal(await page.locator('[data-column]').count(),2);await page.waitForSelector('[data-edge]',{state:'attached'});assert.equal(await page.locator('[data-edge]').count(),1);await page.locator('[data-close-authoring]').click();await page.locator('[data-close]').click();
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
  // Desktop hex animation reveals and persists exploration after each confirmed step.
  await page.evaluate(()=>{
    const S=GRPGHubSpatialV157,m={id:'walk',name:'Hex walk',width:900,height:720,hexSize:28,fogEnabled:true,visionRange:2,objects:[],walls:[{id:'wall',points:[{x:650,y:0},{x:650,y:720}],thickness:8,blockSight:true,blockMovement:true}],spawnPoints:[]};
    const start=S.center(m,{q:1,r:4});m.spawnPoints=[{id:'entry',...start}];PLANETS.h.hub={maps:[m],dialogs:[],defaultMapId:'walk'};window.walkFixture=deep(PLANETS.h);App.currentUser.image='https://hub.test/media/portrait.png';App.currentUser.hubState=null;App.currentUser.hubProgress={};window.stepSnapshots=[];const original=PlayerSync.pushPlayerPatch;PlayerSync.pushPlayerPatch=async(id,patch,...args)=>{const result=await original(id,patch,...args);if(result.ok)stepSnapshots.push(deep(patch.hubState));return result;};UI.openModule('hub-v153');
  });
  assert.equal(await page.locator('.hub-player-v153 img').getAttribute('src'),'https://hub.test/media/portrait.png');
  const walkData=await page.evaluate(()=>{const S=GRPGHubSpatialV157,m=PLANETS.h.hub.maps[0],s=S.center(m,{q:1,r:4}),goal=S.center(m,{q:5,r:4}),first=S.center(m,{q:2,r:4});return{start:s,goal,first};});
  const walkMap=await page.locator('[data-runtime-map]').boundingBox();await page.mouse.click(walkMap.x+walkData.goal.x,walkMap.y+walkData.goal.y);
  await page.waitForFunction(()=>stepSnapshots.length>=1);
  const intermediate=await page.locator('.hub-player-v153').evaluate(n=>({x:parseFloat(getComputedStyle(n).left),dest:parseFloat(n.style.left)}));assert.ok(Math.abs(intermediate.dest-walkData.first.x)<.01);assert.ok(intermediate.x<walkData.first.x,'token animates instead of teleporting');
  await page.waitForFunction(()=>stepSnapshots.length===4&&!document.querySelector('.hub-walking-v157'));
  const steps=await page.evaluate(()=>stepSnapshots);assert.equal(steps.length,4);assert.equal(steps.at(-1).x,walkData.goal.x);assert.ok(steps.at(-1).exploration.walk.cells.length>steps[0].exploration.walk.cells.length);
  const fogSample=await page.locator('[data-fog]').evaluate((canvas,point)=>[...canvas.getContext('2d').getImageData(Math.round(point.x),Math.round(point.y),1,1).data],walkData.goal);assert.equal(fogSample[3],0,'destination uncovered');
  const seen=await page.evaluate(()=>App.currentUser.hubState.exploration.walk.cells);await page.evaluate(()=>GRPGHubV153.render());assert.deepEqual(await page.evaluate(()=>App.currentUser.hubState.exploration.walk.cells),seen);
  const positionBefore=await page.evaluate(()=>({x:App.currentUser.hubState.x,y:App.currentUser.hubState.y}));await page.evaluate(()=>playerFail=true);
  const failingGoal=await page.evaluate(()=>GRPGHubSpatialV157.center(PLANETS.h.hub.maps[0],{q:6,r:4}));const remap=await page.locator('[data-runtime-map]').boundingBox();await page.mouse.click(remap.x+failingGoal.x,remap.y+failingGoal.y);await page.waitForFunction(()=>toasts.some(t=>t.m==='player failure')&&!document.querySelector('.hub-walking-v157'));assert.deepEqual(await page.evaluate(()=>({x:App.currentUser.hubState.x,y:App.currentUser.hubState.y})),positionBefore);await page.evaluate(()=>playerFail=false);
  if(snap)await page.screenshot({path:path.join(snap,'hub-hex-fog.png')});
  // Restore interaction fixture before running it through the web adapter.
  await page.evaluate(()=>{PLANETS.h.hub=saved.planets.PLANETS.h.hub;App.currentUser.hubState=null;App.currentUser.hubProgress={};});
  // Web adapter uses the same rules and checked commit path.
  const fixture=await page.evaluate(()=>({planet:PLANETS.h,player:deep(App.currentUser)}));
  await page.setContent('<div id="screen-hub-v153" class="screen"></div><button id="nav-hub-v153" class="nav-btn"></button>');
  await page.addStyleTag({url:'https://hub.test/deploy/site/app/hub-v153.css'});
  await page.evaluate(({planet,player})=>{player.hubState=null;player.hubProgress={};window.webPlayer=player;window.webPlanet=planet;window.GRPGHubBridgeV153={app:{ui:{}},currentPlayer:()=>webPlayer,currentPlanet:()=>webPlanet,canAdd:()=>({ok:true}),item:id=>EQUIPMENT[id],article:()=>null,openArticle(){},openStocks(){},notify(){},async commit(mutator){const next=deep(webPlayer);await mutator(next);webPlayer=next;}};},fixture);
  for(const file of ['hub-core-v156.js','hub-spatial-v157.js','dialog-view-v161.js','hub-runtime-v156.js','hub-v153.js'])await page.addScriptTag({url:'https://hub.test/deploy/site/app/'+file});
  await page.locator('#nav-hub-v153').click();await page.locator('[data-object="sign"]').click();await page.locator('[data-dialog="intro"]').click();await page.locator('[data-finish]').click();await page.waitForSelector('[data-dialog="erase"]');await page.locator('[data-dialog="erase"]').click();await page.locator('[data-choice="erase"]').click();await page.waitForSelector('.hub-modal-v153',{state:'detached'});assert.equal(await page.evaluate(()=>webPlayer.hubState.flags.erased),true);
  await page.locator('[data-trade]').click();await page.locator('[data-buy="key"]').click();await page.waitForFunction(()=>webPlayer.credits===4);
  // Web uses the same step animation and stops on save failure or leaving the hub.
  await page.locator('.hub-modal-v153 [data-close]').click();
  await page.evaluate(()=>{webPlanet=deep(walkFixture);webPlayer.hubState=null;webPlayer.hubProgress={};webPlayer.image='https://hub.test/media/portrait.png';window.webSteps=[];window.webNotices=[];GRPGHubBridgeV153.notify=(m,t)=>webNotices.push({m,t});GRPGHubBridgeV153.commit=async(mutator)=>{if(window.webFail)throw new Error('web step failure');const next=deep(webPlayer);await mutator(next);webPlayer=next;webSteps.push(deep(next.hubState));};});
  // Reload the adapter to capture the instrumented bridge.
  await page.addScriptTag({url:'https://hub.test/deploy/site/app/hub-v153.js'});await page.evaluate(()=>GRPGHubV153.show());
  const webMap=await page.locator('[data-runtime-map]').boundingBox(),webGoal=await page.evaluate(()=>GRPGHubSpatialV157.center(webPlanet.hub.maps[0],{q:3,r:4}));await page.mouse.click(webMap.x+webGoal.x,webMap.y+webGoal.y);await page.waitForFunction(()=>webSteps.length===2&&!document.querySelector('.hub-walking-v157'));assert.equal(await page.locator('.hub-player-v153 img').count(),1);assert.ok((await page.evaluate(()=>webPlayer.hubState.exploration.walk.cells.length))>0);
  await page.evaluate(()=>webFail=true);const webBefore=await page.evaluate(()=>deep(webPlayer.hubState)),webNext=await page.evaluate(()=>GRPGHubSpatialV157.center(webPlanet.hub.maps[0],{q:4,r:4}));await page.mouse.click(webMap.x+webNext.x,webMap.y+webNext.y);await page.waitForFunction(()=>webNotices.some(n=>n.m==='web step failure')&&!document.querySelector('.hub-walking-v157'));assert.deepEqual(await page.evaluate(()=>webPlayer.hubState),webBefore);
  await page.evaluate(()=>webFail=false);const laterGoal=await page.evaluate(()=>GRPGHubSpatialV157.center(webPlanet.hub.maps[0],{q:7,r:4}));await page.mouse.click(webMap.x+laterGoal.x,webMap.y+laterGoal.y);await page.waitForFunction(()=>webSteps.length===3);await page.evaluate(()=>GRPGHubBridgeV153.app.ui.screen='profile');await page.waitForFunction(()=>!document.querySelector('.hub-walking-v157'));assert.equal(await page.evaluate(()=>webSteps.length),3,'navigation stops remaining steps');
  assert.deepEqual(errors,[]);console.log('Hub browser: walls, fog, animated hex steps, portraits, draggable node graph, layout, circular units, authoring, detached saves, failures/retry, cancel, desktop/web dialogues and purchases passed');
}finally{await browser.close();}
