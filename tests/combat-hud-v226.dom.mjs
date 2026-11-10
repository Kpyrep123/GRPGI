// npm install --prefix /tmp/grpgi-test-dom happy-dom
// HAPPY_DOM_MODULE=/tmp/grpgi-test-dom/node_modules/happy-dom/lib/index.js node tests/combat-v225.dom.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const {Window}=await import(process.env.HAPPY_DOM_MODULE?pathToFileURL(process.env.HAPPY_DOM_MODULE):'happy-dom');
const root=process.cwd();
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
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g))vm.runInContext(fs.readFileSync(path.join(root,'renderer',m[1]),'utf8').replace('// New module is DM-only;', 'window.test225={local,applyStore,collectStoreFromRuntime,luaUnitRows119,applyLuaCommands119,runInteractiveLuaHookV138,requestAttackRolls119,playerVisionSources112,droneActions225,droneShareVision225,deviceCommandReason200,checkpointCombat120,conditionEvents225,positionEvents204,refreshRuntimeSources122,centerOf,updatePlayerHp105,mergeCombatProfile225,importCombatProfiles225,battleWeaponRows226};\n// New module is DM-only;'),context,{filename:m[1]});
const {Worker}=await import('node:worker_threads');
w.electronAPI.runCombatLuaHook=payload=>new Promise((resolve,reject)=>{
 const worker=new Worker(path.join(root,'lua-sandbox-worker.cjs'));
 const timer=setTimeout(()=>{worker.terminate();reject(Error('Lua timeout'));},10000);
 worker.once('message',message=>{clearTimeout(timer);worker.terminate();resolve(message.ok?{ok:true,...message.result}:{ok:false,message:message.message});});
 worker.once('error',error=>{clearTimeout(timer);worker.terminate();reject(error);});
 worker.postMessage(payload);
});
const wait=async predicate=>{
 for(let i=0;i<500;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}
 throw Error('DOM condition timed out');
};
const confirm=()=>{
 const form=w.document.querySelector('.scene-lua-overlay-v119 form');
 assert(form,'decision form missing');
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
};
try{
 w.world225={players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm'},p:{id:'p',role:'player',displayName:'Оператор',stats:{hpCurrent:8,hpMax:10},baseStats:{hpBase:10},traumaV195:{schema:195,degree:0},inventory:[{itemId:'gun',qty:1},{itemId:'sidearm',qty:1},{itemId:'round',qty:29}],equipmentSlots:{primaryWeapon:'gun',secondaryWeapon:'sidearm'},weaponMagazines:{gun:{loaded:4,ammoTypeId:'round'},sidearm:{loaded:2,ammoTypeId:'round'}},skills:['aim']}}},equipment:{EQUIPMENT:{gun:{id:'gun',type:'weapon',name:'Тестовая винтовка',damage:'2',range:16,ammoTypeId:'round',magazineSize:12},sidearm:{id:'sidearm',type:'weapon',name:'Пистолет',damage:'1',range:10,ammoTypeId:'round',magazineSize:6},round:{id:'round',name:'Патроны',type:'ammo',stackable:true,stackLimit:100}}},skills:{SKILLS:{aim:{id:'aim',name:'Прицеливание',activationType:'active',description:'Точное прицеливание.'}}}};
 run("applyWorldData(window.world225);App.state=makeDefaultState();App.currentUserId='gm';Sync.config={enabled:false};App.renderLive=()=>{};App.refreshAfterLocalWrite=()=>{};App.writeLocalMirrors=async()=>({ok:true});Persistence.save=async()=>({ok:true});Toast.show=()=>{};");
 const api=w.test225;
 api.applyStore({rangeSchema:109,cameraSchema:109,scenes:{s:{id:'s',name:'Сухой док Астериона',mode:'combat',width:24,height:20,fogMode:'off',assets:[],templates:[]}},runtimes:{s:{tokens:[{id:'a',playerId:'p',name:'Оператор',x:3,y:3,hpCurrent:8,hpMax:10,initiative:20,initiativeOverrideV147:true,weaponId:'gun',ownTurnV199:1,timedModifiersV122:[{id:'bonus',name:'Подавление',remainingTurns:2,effects:[]}]},{id:'b',name:'Охранник',x:10,y:10,hpCurrent:5,hpMax:6,initiative:10,initiativeOverrideV147:true}],initiativeOrder:['a','b'],turnIndex:0,battleStarted191:true}},selectedSceneId:'s'});
 api.local.loaded=true;await run("UI.openModule('combat')");
 const token=id=>run('Combat.getRuntime().tokens').find(row=>row.id===id),q=selector=>w.document.querySelector(selector);
 const click=selector=>{const node=q(selector);assert(node,'missing '+selector);assert(!node.disabled,'disabled '+selector);node.click();};
 assert(q('.scene-tactical-v226'),'battle presentation missing');
 assert(!q('.scene-command-deck-v118'),'editor action rows hidden in combat');
 assert(!q('.battle-tools-v226'),'DM drawer closed by default');
 assert.equal(q('.battle-order-unit-v226.is-current').dataset.battleUnit226,'a');
 assert(q('.battle-unit-v226').textContent.includes('8 / 10'));
 assert.equal(q('[data-battle-weapon226="gun"] strong').textContent,'4 / 12');
 assert(q('[data-battle-weapon226="gun"]').textContent.includes('29 патр. ≈ 2 полн. магаз.'));
 assert(q('.battle-effects-v226').textContent.includes('Подавление 2 ход.'));
 assert(q('[data-scene-skill-v118="aim"]'));
 click('[data-scene-skill-v118="aim"]');
 await wait(()=>token('a').actionUsed&&!q('#scene-next-turn-v104').disabled);
 assert(run('Combat.getRuntime().log').some(row=>row.text.includes('Прицеливание')),'skill card executes the existing ability command');
 token('a').actionUsed=false;run('Combat.render()');
 click('[data-battle-weapon226="sidearm"]');
 assert.equal(token('a').weaponId,'sidearm');
 assert(q('[data-battle-weapon226="sidearm"]').classList.contains('is-selected'));
 // Examining another unit must not redirect a map action to the current actor.
 click('[data-battle-unit226="b"]');assert.equal(run('Combat.selectedObject.id'),'b');
 assert(q('[data-scene-action-v104="attack"]').disabled,'off-turn attack must be disabled');
 click('[data-battle-current226]');assert.equal(run('Combat.selectedObject.id'),'a');
 token('a').actionUsed=true;token('a').reactionUsedV119=true;token('a').conditionsV138.prone=true;
 run('Combat.render()');
 assert(q('[data-scene-action-v104="attack"]').disabled);
 assert(q('[data-scene-skill-v118="aim"]').disabled);
 assert(q('.battle-effects-v226').textContent.includes('Лежит'));
 token('a').hpCurrent=3;run('Combat.render()');
 assert(q('.battle-unit-v226 .battle-health-v226').classList.contains('is-critical'));
 assert(q('.battle-unit-v226').textContent.includes('3 / 10'));
 assert(q('.battle-resources-v226').textContent.includes('Реакция 0'));
 token('a').actionUsed=false;token('a').burstStateV122={weaponId:'sidearm',nextShot:2,maxShots:3};run('Combat.render()');
 assert(q('[data-battle-weapon226="gun"]').disabled,'burst locks weapon changes');
 token('a').burstStateV122=null;token('a').weaponMagazinesV118.sidearm.loaded=0;run('Combat.render()');
 assert(q('[data-scene-action-v104="attack"]').disabled,'empty magazine cannot attack');
 assert(!q('[data-scene-reload-v118]').disabled,'reload uses existing reserve checks');
 click('[data-battle-tools226]');assert(q('.battle-tools-v226 [data-object-form-v104="token"]'));
 click('.battle-tools-v226 [data-battle-tools226]');assert(!q('.battle-tools-v226'));
 run('Combat.selectedObject=null;Combat.render()');assert(q('.battle-hud-v226.is-empty'),'cleared selection stays cleared for scene inspection');
 click('[data-battle-current226]');assert.equal(run('Combat.selectedObject.id'),'a');
 // A mode change is a real command, with the ordinary editor restored on pause.
 click('[data-battle-mode191]');await wait(()=>q('.scene-editor-v104'));
 assert(!q('.scene-tactical-v226'));assert(q('.scene-command-deck-v118'));
 run("Combat.getScene().mode='combat';Combat.render()");assert(q('.scene-tactical-v226'));
 // Save an actual rendered fixture for optional browser layout inspection.
 if(process.env.COMBAT_HUD_HTML){
  const styles=[...html.matchAll(/<link[^>]+href="\.\/([^"?]+)[^"]*"/g)].map(m=>fs.readFileSync(path.join(root,'renderer',m[1]),'utf8')).join('\n');
  fs.writeFileSync(process.env.COMBAT_HUD_HTML,'<!doctype html><meta charset="utf-8"><style>'+styles+'\nhtml,body{margin:0;height:100%;background:#080e15}#combat-content{height:100vh}</style><div id="combat-content">'+q('#combat-content').innerHTML+'</div>');
 }
 console.log('PASS real combat HUD: weapons and reserves, effects, selection, spent actions, burst locks, empty magazine, DM drawer and pause presentation');
}finally{await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}
