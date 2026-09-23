// PLAYWRIGHT_MODULE=/path/playwright/index.mjs CHROMIUM_MODULE=/path/@sparticuz/chromium/build/index.js node tests/v137-browser.mjs
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL,fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE):'playwright');
const executable=process.env.CHROMIUM_MODULE?(await import(pathToFileURL(process.env.CHROMIUM_MODULE))).default:null;
const browser=await chromium.launch({headless:true,...(executable?{executablePath:await executable.executablePath(),args:executable.args}:{args:['--no-sandbox']})});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const page=await browser.newPage({viewport:{width:1500,height:1000}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());if(url.hostname!=='grpgi.test')return route.abort();
 const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));const file=path.resolve(root,'renderer',relative);
 if(!file.startsWith(path.join(root,'renderer')+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
 let body=fs.readFileSync(file);if(relative==='scene-editor-v113.js')body=body.toString().replace('// New module is DM-only;','window.__sceneTestV137={local,applyStore,renderSounds104,showLootOverlay118,transferLootV137};\n// New module is DM-only;');
 const ext=path.extname(file),type={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'}[ext]||'application/octet-stream';
 return route.fulfill({body,contentType:type});
});
await page.addInitScript(()=>{
 window.setInterval=()=>0;window.requestAnimationFrame=()=>0;
 const add=window.addEventListener.bind(window),docAdd=document.addEventListener.bind(document);
 window.addEventListener=(type,...args)=>{if(type!=='load')return add(type,...args);};
 document.addEventListener=(type,...args)=>{if(type!=='DOMContentLoaded')return docAdd(type,...args);};
 window.electronAPI={appVersion:'1.0.137',debugLog:async()=>{},saveWorldData:async world=>{window.savedWorld=structuredClone(world);return{ok:true,world:structuredClone(world)};},loadWorldData:async()=>({ok:true,world:structuredClone(window.savedWorld)})};
});
try{
 await page.goto('http://grpgi.test/',{waitUntil:'load'});
 await page.evaluate(()=>{
  applyWorldData({players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm'},p:{id:'p',role:'player'}}},equipment:{EQUIPMENT:{a:{id:'a',name:'Броня ёлка',type:'armor',mass:1},b:{id:'b',name:'Аптечка',type:'gear',mass:1}}},npcs:{NPCS:{n:{id:'n',name:'Unit',abilityBase:{strength:2},baseStats:{movement:6,vision:5},modifiers:[{target:'movement',op:'add',value:2},{target:'strength',op:'add',value:1}]}}}});
  App.state=makeDefaultState();App.currentUserId='gm';App.renderLive=()=>{};App.refreshAfterLocalWrite=()=>{};Sync.pushCurrentSnapshot=async()=>({ok:true,status:'disabled'});PlayerSync.shouldIsolateUsersFromSnapshot=()=>false;
  Persistence.save=async state=>{window.savedState=structuredClone(state);return{ok:true};};Persistence.load=async()=>structuredClone(window.savedState);Toast.show=()=>{};
  Configurator.selectedType='npcs';Configurator.selectedId='n';Configurator.render();
 });
 for(let i=0;i<5;i++){
  const values=await page.evaluate(()=>({base:document.querySelector('[name=v113n_movement]').value,mods:[...document.querySelectorAll('[data-mod-target-v113]')].map(s=>s.value),strength:document.querySelector('[name=npcAbility_strength]').value}));
  assert.equal(values.base,'6');assert.deepEqual(values.mods,['movement','strength']);assert.equal(values.strength,'2');
  await page.evaluate(async()=>{await Configurator.submit({preventDefault(){},currentTarget:document.getElementById('config-editor-form')});applyWorldData((await window.electronAPI.loadWorldData()).world);Configurator.render();});
  assert.deepEqual(await page.evaluate(()=>[NPCS.n.baseStats.movement,GRPGStatsV113.compute(NPCS.n,{kind:'npc'}).values.movement,NPCS.n.abilityBase.strength]),[6,8,2]);
 }
 console.log('PASS Chromium: actual modifier selects and repeated NPC saves preserve base movement and abilities');
 await page.evaluate(()=>{
  Configurator.selectedType='players';Configurator.selectedId='p';Configurator.render();
  const input=document.querySelector('[data-wc-inventory-pool-search-v1068]');input.value='елка';input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.wc-inventory-pool-item-v1068')].map(el=>[el.dataset.itemId,getComputedStyle(el).display])),[['b','none'],['a','grid']]);
 console.log('PASS Chromium: search removes nonmatching inventory items from layout');
 await page.evaluate(()=>{
  const api=window.__sceneTestV137;api.applyStore({scenes:{s:{id:'s',name:'Test',width:20,height:20,assets:[],templates:[]}},runtimes:{s:{tokens:[]}},selectedSceneId:'s'});api.local.loaded=true;api.local.ui.soundsOpen=true;
  window.CombatAudioV37={sections:Array.from({length:10},(_,i)=>({id:'s'+i,name:'Раздел звуков '+i,sounds:Array.from({length:25},(_,j)=>({id:`sound${i}_${j}`,name:'Длинное название звука '+j}))})),state:{},startAmbient(){}};
  // Render the real sound component with all shipped CSS, in a visible isolated host.
  const fixture=document.createElement('div');fixture.id='sound-fixture';fixture.style.cssText='position:fixed;inset:0;z-index:999999;background:#151719;padding:20px';fixture.innerHTML=`<header class="scene-top-v104" style="position:relative;height:80px">${api.renderSounds104({id:'s'})}</header>`;document.body.appendChild(fixture);
 });
 for(const [width,columns] of [[1500,3],[1100,2],[760,1]]){
  await page.setViewportSize({width,height:1000});
  const measure=await page.evaluate(()=>{
   const drawer=document.querySelector('#sound-fixture .scene-sound-drawer-v104'),grid=drawer.querySelector('.scene-sound-sections-v104');drawer.scrollTop=drawer.scrollHeight;
   return{columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,overflow:getComputedStyle(drawer).overflowY,height:drawer.clientHeight,scrollHeight:drawer.scrollHeight,top:drawer.scrollTop,width:drawer.clientWidth,scrollWidth:drawer.scrollWidth,rows:drawer.querySelectorAll('.scene-sound-row-v104').length,last:drawer.querySelector('.scene-sound-section-v104:last-child .scene-sound-row-v104:last-child').getBoundingClientRect().bottom,drawerBottom:drawer.getBoundingClientRect().bottom};
  });
  assert.equal(measure.columns,columns);assert.equal(measure.rows,250);assert.ok(measure.scrollHeight>measure.height);assert.ok(measure.top>0);assert.equal(measure.overflow,'auto');assert.ok(measure.scrollWidth<=measure.width+1,JSON.stringify(measure));assert.ok(measure.last<=measure.drawerBottom,JSON.stringify(measure));
 }
 console.log('PASS Chromium: 250 sounds remain reachable vertically at 3 / 2 / 1 columns without horizontal overflow');
 if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH});
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
