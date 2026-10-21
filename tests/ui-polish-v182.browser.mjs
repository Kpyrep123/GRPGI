import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_CORE_PATH||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const gm={id:'gm',role:'gm',displayName:'DM'},player={id:'p',role:'player',displayName:'Player',inventoryBaseSlots:20,inventorySize:20,carryBase:100,carryWeightMax:100,implantSlotCount:2,equipmentSlots:{},inventory:[{itemId:'gun',qty:1},{itemId:'armor',qty:1},{itemId:'pack',qty:1}],currentPlanetId:'home'};
const world={players:{PLAYER_TEMPLATES:{gm,p:player}},npcs:{NPCS:{a:{id:'a',name:'Alpha'},m:{id:'m',name:'Middle'},z:{id:'z',name:'Zulu'}}},planets:{PLANETS:{home:{id:'home',name:'Home',locationType:'hub'},other:{id:'other',name:'Other'}}}};
const errors=[];let server,release,fail=false;
async function routeFixture(route){
 const u=new URL(route.request().url());
 if(server&&u.pathname==='/api/grpgi/players/mutate'){
  const body=route.request().postDataJSON();assert.equal(body.baseVersion,server.version);
  await new Promise(r=>release=r);
  if(fail){fail=false;return route.fulfill({status:400,contentType:'application/json',body:'{"ok":false,"message":"Fixture rejected"}'});}
  server={...server,version:server.version+1,playerJson:body.player};return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,row:server})});
 }
 if(server&&u.pathname.includes('/campaign_players/records'))return route.fulfill({contentType:'application/json',body:JSON.stringify({items:[server],page:1,perPage:1,totalPages:1,totalItems:1})});
 if(!['desktop182.test','web182.test'].includes(u.hostname))return route.fulfill({status:503,contentType:'application/json',body:'{"message":"fixture offline"}'});
 const base=path.resolve(u.hostname==='desktop182.test'?'renderer':'deploy/site/app'),file=path.resolve(base,decodeURIComponent(u.pathname.slice(1))||'index.html');
 if(!file.startsWith(base+path.sep)||! /\.(html|js|css)$/.test(file))return route.abort();
 try{await route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});}catch{return route.abort();}
}
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',routeFixture);
 await page.addInitScript(()=>{
  window.setInterval=()=>0;
  if(location.hostname==='desktop182.test'){
   const da=document.addEventListener.bind(document),wa=window.addEventListener.bind(window);
   document.addEventListener=(t,...a)=>t==='DOMContentLoaded'&&!String(a[0]).includes('playerRuntime=window.GRPGHubRuntimeV156')?undefined:da(t,...a);
   window.addEventListener=(t,...a)=>t==='load'?undefined:wa(t,...a);
   window.electronAPI={appVersion:'1.0.155',debugLog:async()=>{},saveWorldData:async world=>({ok:true,world})};
  }
 });
 async function desktop(){await page.evaluate(world=>{applyWorldData(structuredClone(world));App.state=makeDefaultState();App.currentUserId='gm';App.activeCampaignId='main';Sync.config={enabled:false};Persistence.save=async()=>({ok:true});document.getElementById('login-screen').classList.remove('open');Configurator.selectedType='npcs';Configurator.selectedId='a';UI.openModule('config');},world);}
 await page.goto('https://desktop182.test/');await desktop();
 const row=id=>page.locator(`.config-entity-list [data-config-id="${id}"]`),star=id=>row(id).locator('[data-config-favorite-v182]');
 const name=page.locator('#config-editor-form [name="name"]').first();await name.fill('Unsaved Alpha');
 await page.evaluate(()=>window.sameForm=document.getElementById('config-editor-form'));
 await star('z').click();assert.equal(await row('z').getAttribute('data-config-id'),'z');assert.equal(await star('z').getAttribute('aria-pressed'),'true');
 assert.deepEqual(await page.locator('.config-entity-list [data-config-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.configId)),['z','a','m']);
 assert.equal(await name.inputValue(),'Unsaved Alpha');assert(await page.evaluate(()=>sameForm===document.getElementById('config-editor-form')));assert.equal(await page.evaluate(()=>Configurator.selectedId),'a');
 await star('m').focus();await page.keyboard.press('Space');assert.equal(await star('m').getAttribute('aria-pressed'),'true');
 await star('z').click();assert.deepEqual(await page.locator('.config-entity-list [data-config-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.configId)),['m','a','z']);
 await page.locator('#config-search-input').fill('Zulu');assert.equal(await page.locator('.config-entity-list [data-config-id]').count(),1);await star('z').click();await page.locator('#config-search-input').fill('');
 await page.reload();await desktop();assert.equal(await star('m').getAttribute('aria-pressed'),'true');assert.equal(await star('z').getAttribute('aria-pressed'),'true');
 await page.locator('.config-entity-list').screenshot({path:'/tmp/v182-favorites.png',animations:'disabled'});
 const isolation=await page.evaluate(()=>{
  App.activeCampaignId='other';Configurator.render();const campaign=!GRPGConfigFavoritesV182.has('npcs','z');App.activeCampaignId='main';App.currentUserId='p';Configurator.render();const player=!document.querySelector('[data-config-favorite-v182]');App.currentUserId='gm';Configurator.render();const type=!GRPGConfigFavoritesV182.has('planets','z');Configurator.remapReferences('npcs','z','renamed');const renamed=GRPGConfigFavoritesV182.has('npcs','renamed')&&!GRPGConfigFavoritesV182.has('npcs','z');Configurator.cleanupReferences('npcs','renamed');return {campaign,player,type,renamed,deleted:!GRPGConfigFavoritesV182.has('npcs','renamed')};
 });assert(Object.values(isolation).every(Boolean));
 const layers=await page.evaluate(async()=>{App.currentUserId='p';document.getElementById('dock').style.display='flex';UI.openModule('hub-v153');await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);const dock=document.getElementById('dock').getBoundingClientRect(),hit=document.elementFromPoint(dock.x+dock.width/2,dock.y+dock.height/2);return {hit:hit?.outerHTML.slice(0,160),z:getComputedStyle(document.getElementById('mod-hub-v153')).zIndex,above:!!hit?.closest('#mod-hub-v153'),close:!!document.querySelector('#mod-hub-v153 .module-close')};});assert(layers.above,JSON.stringify(layers));assert(layers.close);
 // Full web app: hold the server response to inspect the actual optimistic render.
 await page.goto('https://web182.test/index.html');await page.waitForFunction(()=>window.GRPGHubBridgeV153);
 await page.evaluate(player=>{const A=GRPGHubBridgeV153.app;A.data.items=new Map([['gun',{id:'gun',name:'Gun',type:'weapon',weaponSlot:'primary',inventoryWidth:1,inventoryHeight:1,mass:1}],['armor',{id:'armor',name:'Armor',type:'armor',inventoryWidth:1,inventoryHeight:1,mass:1}],['pack',{id:'pack',name:'Pack',type:'backpack',inventoryWidth:1,inventoryHeight:1,mass:1}]]);A.data.players.set('p',player);A.session={userId:'p',role:'player',campaignId:'main'};A.ui.boot='app';A.ui.screen='profile';document.getElementById('login-screen').classList.add('hidden');document.getElementById('app-shell').classList.remove('hidden');},player);
 server={id:'row',campaignId:'main',playerId:'p',version:0,playerJson:structuredClone(player)};
 await page.locator('[data-screen="profile"]').click();
 async function widths(){return page.evaluate(()=>({grouped:!!document.querySelector('#screen-profile .sheet-loadout .character-sheet-gear-v142'),widths:[...document.querySelectorAll('#screen-profile .character-sheet-gear-v142>[data-slot-type]')].map(n=>n.getBoundingClientRect().width)}));}
 for(const [id,slot] of [['gun','primaryWeapon'],['armor','armor'],['pack','backpack']]){
  const baseline=await widths();assert(baseline.grouped);assert.equal(baseline.widths.length,4);
  await page.locator(`#screen-profile .web-inventory-tile-v1067[data-item-id="${id}"]`).click();
  release=null;await page.locator('.sheet-item-dialog button').filter({hasText:'Надеть:'}).first().click();
  await page.waitForFunction(()=>document.body.classList.contains('web-player-write-pending-v120'));
  for(let frame=0;frame<8;frame++){const next=await widths();assert(next.grouped,'optimistic render keeps sheet grouping');assert.deepEqual(next.widths,baseline.widths,'no single-frame full-width equipment');await page.evaluate(()=>new Promise(requestAnimationFrame));}
  while(!release)await new Promise(r=>setTimeout(r,10));release();await page.waitForFunction(()=>!document.body.classList.contains('web-player-write-pending-v120'));assert.equal(server.playerJson.equipmentSlots[slot],id);
 }
 await page.screenshot({path:'/tmp/v182-inventory.png'});
 await page.setViewportSize({width:390,height:844});
 const narrow=await widths();assert(narrow.widths.every(w=>w<150));
 // Failed unequip restores confirmed loadout, with identical geometry during the wait.
 await page.locator('#screen-profile .character-sheet-gear-v142 [data-item-id="gun"]').click();fail=true;release=null;await page.locator('.sheet-item-dialog button').filter({hasText:'Снять'}).click();await page.waitForFunction(()=>document.body.classList.contains('web-player-write-pending-v120'));assert((await widths()).grouped);assert.deepEqual((await widths()).widths,narrow.widths);while(!release)await new Promise(r=>setTimeout(r,10));release();await page.waitForFunction(()=>!document.body.classList.contains('web-player-write-pending-v120'));assert.equal(await page.locator('#screen-profile .character-sheet-gear-v142 [data-item-id="gun"]').count(),1);assert((await widths()).grouped);
 assert.deepEqual(errors,[]);assert.equal(await fs.readFile('renderer/profile-sheet-v142.js','utf8'),await fs.readFile('deploy/site/app/profile-sheet-v142.js','utf8'));
 console.log('PASS v182: WC favorites order/toggle/search/keyboard/drafts/reload/scope/remap/delete; desktop Hub above dock; real web optimistic equip (weapon/armor/backpack) and failed-save rollback keep compact slot geometry.');
}finally{await browser.close();}
