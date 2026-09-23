// npm install --prefix /tmp/grpgi-test-dom happy-dom
// HAPPY_DOM_MODULE=/tmp/grpgi-test-dom/node_modules/happy-dom/lib/index.js node tests/v134-world-config-full-load.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const {Window}=await import(process.env.HAPPY_DOM_MODULE?pathToFileURL(process.env.HAPPY_DOM_MODULE):'happy-dom');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-v134-'));
const errors=[];
const w=new Window({url:'https://grpgi.test',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,disableComputedStyleRendering:true}});
const context=vm.isContext(w)?w:vm.createContext(w);
const run=code=>vm.runInContext(code,context);
w.setInterval=()=>0;w.requestAnimationFrame=()=>0;
const windowAdd=w.addEventListener.bind(w),documentAdd=w.document.addEventListener.bind(w.document);
w.addEventListener=(type,...args)=>{if(type!=='load')return windowAdd(type,...args)};
w.document.addEventListener=(type,...args)=>{if(type!=='DOMContentLoaded')return documentAdd(type,...args)};
w.console={...console,log(){},debug(){},warn(...args){errors.push(args.map(String).join(' '))},error(...args){errors.push(args.map(String).join(' '))}};
w.electronAPI={appVersion:'1.0.134',debugLog:async()=>{},saveWorldData:async world=>{
 fs.writeFileSync(path.join(scratch,'world.json'),JSON.stringify(world));return{ok:true,world:JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'))};
},loadWorldData:async()=>({ok:true,world:JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'))}),saveWorldSection:async(type,payload)=>{
 const world=JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'));world[type]=payload;fs.writeFileSync(path.join(scratch,'world.json'),JSON.stringify(world));return{ok:true};
},exportWorldSectionJson:async(type,payload)=>{fs.writeFileSync(path.join(scratch,type+'.json'),JSON.stringify(payload));return{ok:true,fileName:type+'.json'}}};
const html=fs.readFileSync(path.join(root,'renderer/index.html'),'utf8');
w.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
// Every renderer script is evaluated unmodified, in index.html order, sharing
// browser-style lexical globals. Only OS/cloud/bootstrap boundaries are mocked.
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g))(()=>{let source=fs.readFileSync(path.join(root,'renderer',m[1]),'utf8');if(m[1]==='scene-editor-v113.js')source=source.replace('// New module is DM-only;', 'window.__sceneTestV137={local,applyStore,visibleHexCells112,showLootOverlay118,startBoardPointer104,moveBoardPointer104,endBoardPointer104,renderSounds104,transferLootV137,scenePlayersV137,placeUnit104,tokenMoveCells,lootContextMenuV137};\n  // New module is DM-only;');vm.runInContext(source,context,{filename:m[1]});})();


const pause=ms=>new Promise(r=>setTimeout(r,ms));
const clone=x=>JSON.parse(JSON.stringify(x));
run(`
 applyWorldData({players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm'},p:{id:'p',role:'player'},off:{id:'off',role:'player'}}},equipment:{EQUIPMENT:{a:{id:'a',name:'Броня ёлка',type:'armor',mass:1},b:{id:'b',name:'Аптечка',type:'gear',mass:2},ammo:{id:'ammo',name:'Патрон',type:'ammo',mass:.1,stackLimit:5},pack:{id:'pack',name:'Рюкзак',type:'backpack',mass:1,modifiers:[{target:'inventory_slots',op:'add',value:3}]},paper:{id:'paper',name:'Документ',textOnlyInventory:true},wide:{id:'wide',name:'Широкий',inventoryWidth:3,inventoryHeight:2,mass:1}}},npcs:{NPCS:{n:{id:'n',name:'Unit',abilityBase:{strength:2},baseStats:{movement:6,vision:5},modifiers:[{target:'movement',op:'add',value:2},{target:'vision',op:'add',value:1}]}}}});
 App.state=makeDefaultState();App.currentUserId='gm';
 App.renderLive=()=>{};App.refreshAfterLocalWrite=()=>{};Sync.pushCurrentSnapshot=async()=>({ok:true,status:'disabled'});
 PlayerSync.shouldIsolateUsersFromSnapshot=()=>false;
 Persistence.save=async state=>{window.savedState=JSON.stringify(state);return{ok:true};};
 Persistence.load=async()=>JSON.parse(window.savedState);
 window.notices=[];Toast.show=(message,type)=>window.notices.push({message,type});
`);
// Real form -> collector -> save -> reload, repeated with a movement modifier.
for(let i=0;i<6;i++){
 run("Configurator.selectedType='npcs';Configurator.selectedId='n';Configurator.render()");
 // happy-dom loses selected state while wrapper renderers move form nodes.
 // v137-browser.mjs independently checks untouched native Chromium selection.
 const form=w.document.querySelector('#config-editor-form');for(const select of form.querySelectorAll('select')){const selected=select.querySelector('option[selected]');if(selected&&!select.multiple)select.value=selected.value;}assert.ok(form.querySelector('[name=v113n_movement]'));
 assert.equal(form.querySelector('[name=combatMoveRange]'),null);
 assert.equal(form.querySelector('[name=v113n_movement]').value,'6');
 w.currentForm=form;await run('Configurator.submit({preventDefault(){},currentTarget:window.currentForm})');
 await run('window.electronAPI.loadWorldData().then(r=>applyWorldData(r.world))');
 assert.equal(run('NPCS.n.baseStats.movement'),6);assert.equal(run('window.GRPGStatsV113.compute(NPCS.n,{kind:"npc"}).values.movement'),8);
}
console.log('PASS NPC movement base 6 / effective 8 across six real saves and reloads');
run("App.state.users.p=normalizePlayerProfileV2({...App.state.users.p,abilityBase:{strength:0},baseStats:{movement:0,inventorySlots:10,carryBase:10},modifiers:[]});Configurator.selectedType='players';Configurator.selectedId='p';Configurator.render()");
assert.equal(w.document.querySelector('[name=v113p_movement]').value,'0');
assert.equal(w.document.querySelector('[name=combatMoveRange]'),null);
const search=w.document.querySelector('[data-wc-inventory-pool-search-v1068]');assert.ok(search);
search.value=' ЕЛКА  броня ';search.dispatchEvent(new w.Event('input',{bubbles:true}));
const pool=()=>[...w.document.querySelectorAll('.wc-inventory-pool-item-v1068')];
assert.deepEqual(pool().filter(el=>!el.hidden).map(el=>el.dataset.itemId),['a']);
search.value='ПАТРОНЫ';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.deepEqual(pool().filter(el=>!el.hidden).map(el=>el.dataset.itemId),['ammo']);
search.value='нет совпадений';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(pool().filter(el=>!el.hidden).length,0);
search.value='';search.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(pool().filter(el=>!el.hidden).length,6);
console.log('PASS available-items search: case, ё/е, multiple terms, localized type, no match and reset');
// Server packing and capacity must match actual renderer rules.
const {createRequire}=await import('node:module');const require=createRequire(import.meta.url),core=require('../pocketbase/pb_hooks/grpgi_loot_core_v137.js');
const world=clone(run('worldData'));
const rules=core.engine(world);
for(const test of [
 {baseStats:{inventorySlots:1,carryBase:10},inventory:[{itemId:'a',qty:1}],item:'b',qty:1},
 {baseStats:{inventorySlots:6,carryBase:10},inventory:[],item:'wide',qty:1},
 {baseStats:{inventorySlots:10,carryBase:1},inventory:[],item:'b',qty:1},
 {baseStats:{inventorySlots:0,carryBase:0},inventory:[],item:'paper',qty:5},
 {baseStats:{inventorySlots:1,carryBase:10},inventory:[{itemId:'ammo',qty:4}],item:'ammo',qty:1},
 {baseStats:{inventorySlots:1,carryBase:10},inventory:[{itemId:'ammo',qty:5}],item:'ammo',qty:1},
 {baseStats:{inventorySlots:1,carryBase:10},equipmentSlots:{backpack:'pack'},inventory:[{itemId:'pack',qty:1}],item:'b',qty:3},
 {baseStats:{inventorySlots:1,carryBase:1},abilityBase:{strength:0},modifiers:[{target:'carry_capacity',op:'add_stat',statRef:'intelligence'}],abilities:{intelligence:2},inventory:[],item:'b',qty:2}
]){
 const user={id:'p',abilityBase:{strength:0},equipmentSlots:{},implantSlots:[],...test};delete user.item;delete user.qty;
 w.fixture=user;const client=run(`window.GRPGInventoryV113.canAdd(window.fixture,${JSON.stringify(test.item)},${test.qty})`),server=rules.canAdd(user,test.item,test.qty);
 assert.equal(server.ok,client.ok,JSON.stringify({test,client,server}));
 assert.equal(rules.layout(user).weight,run('window.GRPGInventoryV113.layout(window.fixture).weight'));
}
console.log('PASS client/server parity: weight, geometry, stacking, equipped backpack, zero-size documents and stat modifiers');
run(`window.__sceneTestV137.applyStore({scenes:{s:{id:'s',name:'Test',width:40,height:30,fogMode:'off',assets:[],templates:[]}},runtimes:{s:{tokens:[{id:'corpse',npcId:'n',name:'Corpse',x:2,y:2,hpCurrent:0,hpMax:5,combatInventoryV120:[{itemId:'b',qty:1}],lootStateV118:{searched:true,items:[{itemId:'a',qty:1},{itemId:'a',qty:1}]}},{id:'player',playerId:'p',name:'Player',x:4,y:4,hpCurrent:10,hpMax:10},{id:'player2',playerId:'p',name:'Player duplicate',x:5,y:4,hpCurrent:10,hpMax:10}]}},selectedSceneId:'s',rangeSchema:109,cameraSchema:109});window.__sceneTestV137.local.loaded=true;window.__sceneTestV137.local.ui.palette='units';Combat.render();`);
assert.deepEqual(clone(run('window.__sceneTestV137.scenePlayersV137("s").map(u=>u.id)')),['p']);
let scroll=w.document.querySelector('.scene-unit-scroll-v105');scroll.scrollTop=317;
run("window.__sceneTestV137.placeUnit104('npc','n',{x:8,y:8})");assert.equal(w.document.querySelector('.scene-unit-scroll-v105').scrollTop,317);
console.log('PASS unit palette retains scroll after placement; recipients only unique players on scene');
// Real pointer handlers: Shift click does nothing; Shift drag makes an independent copy; cancel rolls back.
function eventFor(id,x,y,shiftKey=true,type='pointerdown'){
 const node=w.document.querySelector(`[data-scene-kind-v104="token"][data-scene-id-v104="${id}"]`);assert.ok(node);
 const stage=w.document.getElementById('combat-stage');stage.getBoundingClientRect=()=>({left:0,top:0,width:400,height:300});
 return{target:node,clientX:x,clientY:y,button:0,pointerId:1,shiftKey,type,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}};
}
const api=w.__sceneTestV137;api.local.ui.pendingPlacement=null;api.local.ui.action='select';
let count=run('Combat.getRuntime().tokens.length'),original=clone(run('Combat.getRuntime().tokens.find(t=>t.id==="corpse")'));
api.startBoardPointer104(eventFor('corpse',20,20));api.endBoardPointer104({type:'pointerup',pointerId:1});assert.equal(run('Combat.getRuntime().tokens.length'),count);
api.startBoardPointer104(eventFor('corpse',20,20));api.moveBoardPointer104(eventFor('corpse',100,80));api.endBoardPointer104({type:'pointerup',pointerId:1});
assert.equal(run('Combat.getRuntime().tokens.length'),count+1);const copyId=run('Combat.selectedObject.id');assert.notEqual(copyId,'corpse');
assert.equal(run('Combat.getRuntime().tokens.find(t=>t.id==="corpse").x'),original.x);
run(`Combat.getRuntime().tokens.find(t=>t.id===${JSON.stringify(copyId)}).combatInventoryV120[0].qty=99`);
assert.equal(run('Combat.getRuntime().tokens.find(t=>t.id==="corpse").combatInventoryV120[0].qty'),1);
api.startBoardPointer104(eventFor('corpse',20,20));api.moveBoardPointer104(eventFor('corpse',140,80));api.endBoardPointer104({type:'pointercancel',pointerId:1});assert.equal(run('Combat.getRuntime().tokens.length'),count+1);
console.log('PASS Shift click, Shift drag deep copy and cancelled drag');
// Offline capacity rejection leaves the corpse unchanged.
run("App.state.users.p=normalizePlayerProfileV2({...App.state.users.p,inventory:[],baseStats:{inventorySlots:1,carryBase:10}})");
let result=await api.transferLootV137('s','corpse','a','p');assert.equal(result.status,'capacity');assert.equal(run('Combat.getRuntime().tokens.find(t=>t.id==="corpse").lootStateV118.items.length'),2);
run("App.state.users.p=normalizePlayerProfileV2({...App.state.users.p,inventory:[],baseStats:{inventorySlots:10,carryBase:10}})");
result=await api.transferLootV137('s','corpse','a','p');assert.equal(result.ok,true);assert.equal(run('App.state.users.p.inventory.find(r=>r.itemId==="a").qty'),2);assert.equal(run('Combat.getRuntime().tokens.find(t=>t.id==="corpse").lootStateV118.items.length'),0);
console.log('PASS local transfer aggregates duplicate loot rows and removes only after durable grant');
// Remote unknown outcome: persist original operation through scene reload and replay it once.
run("PlayerSync.shouldIsolateUsersFromSnapshot=()=>true;Combat.getRuntime().tokens.find(t=>t.id==='corpse').lootStateV118={searched:true,items:[{itemId:'b',qty:1}]};");
let requests=[],lost=true,remote=clone(run('App.state.users.p')),commits=0;
w.electronAPI.patchPlayer=async request=>{
 requests.push(clone(request));if(!remote.__syncReceiptsV135?.[request.operationId]){commits++;remote.inventory.push({itemId:'b',qty:1,positions:[]});remote.__syncReceiptsV135={[request.operationId]:'ok'};}
 if(lost)return{ok:false,status:'error',message:'Lost reply'};
 return{ok:true,status:'committed',row:{playerId:'p',version:10,player:clone(remote)}};
};
result=await api.transferLootV137('s','corpse','b','p');assert.equal(result.ok,false);assert.equal(commits,1);assert.equal(requests.length,3);
run('window.__sceneTestV137.applyStore(JSON.parse(localStorage.getItem("grpg-scene-editor-local-v2")))');
assert.equal(run('Combat.getRuntime().tokens.find(t=>t.id==="corpse").lootStateV118.items[0].qty'),1);
lost=false;result=await api.transferLootV137('s','corpse','b','p');assert.equal(result.ok,true);assert.equal(commits,1);assert.equal(new Set(requests.map(r=>r.operationId)).size,1);
assert.equal(run('Combat.getRuntime().tokens.find(t=>t.id==="corpse").lootStateV118.items.length'),0);
console.log('PASS lost response and scene reload reuse durable operation ID; no double grant');
run("Combat.getRuntime().tokens.find(t=>t.id==='corpse').lootStateV118={searched:true,items:[{itemId:'a',qty:1}]};");
w.electronAPI.patchPlayer=async request=>({ok:true,status:'disabled',row:request});
result=await api.transferLootV137('s','corpse','a','p');assert.equal(result.ok,false);
assert.equal(run('Combat.getRuntime().tokens.find(t=>t.id==="corpse").lootStateV118.items[0].qty'),1);
console.log('PASS disabled IPC response is not mistaken for a successful grant');
run("PlayerSync.shouldIsolateUsersFromSnapshot=()=>false;Combat.getRuntime().tokens.find(t=>t.id==='corpse').lootStateV118={searched:true,items:[{itemId:'a',qty:1},{itemId:'b',qty:1}]};");
const quick=await Promise.all([api.transferLootV137('s','corpse','a','p'),api.transferLootV137('s','corpse','b','p')]);assert.ok(quick.every(r=>r.ok));
assert.equal(run('Combat.getRuntime().tokens.find(t=>t.id==="corpse").lootStateV118.items.length'),0);
console.log('PASS rapid transfers from one corpse serialize through confirmation and scene save');


await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});
