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
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g)){let source=fs.readFileSync(path.join(root,'renderer',m[1]),'utf8');if(m[1]==='scene-editor-v113.js')source=source.replace('// New module is DM-only;','window.test287={local,captureCombatState093,restoreCombatState093,updatePlayerHp105,applyStore,collectStoreFromRuntime,ensureNpcGear287,entityForToken,itemRuntimeStateV138,incomingDefense119,weaponAberrationEffects257,attackCover287,applyAbsorptionV138,wearArmorFromBlast093,secondaryHit258,movementState198,processTimedModifiers122,searchNpc118,performLootTransferV137,deleteSelected104,issueForge287,fitTokenToHex107,normalizeCombatToken,unbind287,renderUnbind287,canCombatAct129,canMechanicalMove108};\n// New module is DM-only;');vm.runInContext(source,context,{filename:m[1]});}





const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
try{
 run(`applyWorldData({equipment:{EQUIPMENT:{med:{id:'med',type:'gear',name:'Med',mass:1}}},planets:{PLANETS:{planet:{id:'planet',name:'Planet',locationType:'hub',hub:{maps:[{id:'hub',name:'Hub',objects:[{id:'npc',npcId:'n',name:'NPC'}]}],dialogs:[{id:'dialog',name:'Dialog',nodes:[{id:'start',text:'Mission',terminal:true,choices:[]}]}]}}}},players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm'}}}});App.state=makeDefaultState();App.currentUserId='gm';Sync.config={enabled:false};App.renderLive=()=>{};App.refreshAfterLocalWrite=()=>{};App.writeLocalMirrors=async()=>({ok:true});Persistence.save=async()=>({ok:true});window.notices290=[];Toast.show=(s)=>notices290.push(s);window.saved290=[];Configurator.persistAll=async()=>{saved290.push(buildWorldSnapshot());return{localSaved:true}};`);
 const api=w.test287;
 const bridgeToken={id:'scene-state',hpCurrent:0,hpMax:8,conditionsV138:{},ownTurnV199:2};api.restoreCombatState093(bridgeToken,{schema:1,ownTurn:2,conditions:{dying:true,unconscious:true},critical:{damage:8,fallTurn:1},lua204:{schema:1,ownerId:'a',resources:{charge:{value:1,max:3,reset:'manual',epoch:'manual'}},sourceData:{'skill:counter':{count:2}},modifiers:[]}});const roundtrip=api.captureCombatState093(bridgeToken);assert.equal(roundtrip.dying,true);assert.equal(roundtrip.unconscious,true);assert.equal(roundtrip.critical.damage,8);assert.equal(roundtrip.lua204.resources.charge.value,1);assert.equal(roundtrip.lua204.sourceData['skill:counter'].count,2);
 run(`App.state=makeDefaultState();App.state.users.lua291={id:'lua291',role:'player',abilityBase:{endurance:2},stats:{hpCurrent:8,hpMax:8},inventory:[]};`);api.updatePlayerHp105({id:'ordinary-token',playerId:'lua291',hpCurrent:8,hpMax:8,conditionsV138:{},luaState204:{'skill:test':{uses:1}},luaResources204:{pool:{value:1,max:3,reset:'manual',epoch:'manual'}}});assert.equal(run(`App.state.users.lua291.combatState093.lua204.resources.pool.value`),1,'resource-only state is saved even before the first injury');


 api.applyStore({rangeSchema:109,cameraSchema:109,scenes:{map:{id:'map',name:'Raid map',mode:'normal',width:20,height:20,assets:[],templates:[{id:'spawn',shape:'polygon',raidZone290:'spawn',points:[{x:1,y:1},{x:6,y:1},{x:6,y:6},{x:1,y:6}]},{id:'evac',shape:'polygon',raidZone290:'evacuation',points:[{x:1,y:1},{x:6,y:1},{x:6,y:6},{x:1,y:6}]}]}},runtimes:{map:{tokens:[]}},selectedSceneId:'map'});api.local.loaded=true;
 run("App.state.users.locked={id:'locked',role:'player',raidLock290:'run',stats:{hpCurrent:8,hpMax:8},inventory:[]}");assert.equal(api.canCombatAct129({id:'locked',playerId:'locked',hpCurrent:8}),false);assert.equal(api.canMechanicalMove108({id:'locked',playerId:'locked',hpCurrent:8}),false);
 const exported=w.GRPGRaidSceneExport290();assert.equal(exported[0].templates[0].raidZone290,'spawn');
 run("UI.openModule('config');Configurator.render()");const tab=w.document.querySelector('[data-raids-tab290]');assert(tab);tab.click();const form=w.document.querySelector('[data-raids-config290]');assert(form);
 form.elements.namedItem('name').value='Weekly test';form.elements.namedItem('enabled').checked=true;for(const o of form.elements.namedItem('maps').options)o.selected=o.value==='map';form.elements.namedItem('startMap').value='map';form.elements.namedItem('credits').value='5';form.elements.namedItem('skillPoints').value='2';
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause();assert.equal(run('saved290.length'),1,run('notices290').join(';'));
 const config=run('saved290[0].campaigns.RAIDS_V290.main');assert.equal(config.enabled,true);assert.equal(config.missions.length,1);assert.equal(config.missions[0].maps[0].templates[1].raidZone290,'evacuation');assert.equal(config.missions[0].reward.credits,5);assert.equal(config.missions[0].reward.skillPoints,2);assert.equal(config.missions[0].entry.objectId,'npc');
 console.log('PASS real raid authoring: WC section, shared multiselect, scene snapshot, zone metadata, rewards and campaign save');
}finally{await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}

const cw=new Window({url:'https://grpgi.test/app/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});const ctx=vm.createContext(cw),evalWeb=s=>vm.runInContext(s,ctx);cw.setInterval=()=>0;
let current={id:'a'},calls=[],networkFailure=false;
let snapshot={phase:'lobby',id:'main|2026-11-20',week:'2026-11-20',revision:0,serverNow:Date.now(),mission:{name:'Weekly',reward:{credits:5,skillPoints:2,items:[]}},lobby:{leader:'',invited:[],ready:[]},roster:[{id:'a',name:'A'},{id:'b',name:'B'}]};
cw.GRPGHubBridgeV153={currentPlayer:()=>current,app:{config:{campaignId:'main'}},item:id=>({id,name:id}),raidRequest:async data=>{calls.push(JSON.parse(JSON.stringify(data)));if(data.type==='attack'&&networkFailure){networkFailure=false;throw Error('Network disconnected');}if(data.type!=='status')snapshot={...snapshot,revision:snapshot.revision+1};return JSON.parse(JSON.stringify(snapshot));}};
try{
 evalWeb(fs.readFileSync(path.join(root,'renderer/checkbox-picker-v172.js'),'utf8'));evalWeb(fs.readFileSync(path.join(root,'deploy/site/app/raids-v290.js'),'utf8'));
 await cw.GRPGRaidsV290.open({planetId:'planet',objectId:'npc',dialogId:'dialog'});assert(cw.document.querySelector('.raid290'));const select=cw.document.querySelector('[data-party]');for(const o of select.options)o.selected=true;cw.document.querySelector('[data-action=party]').click();await pause();const party=calls.find(c=>c.type==='party');assert.deepEqual(party.members,['a','b']);assert.equal(party.entry.objectId,'npc');assert(party.operationId);
 snapshot={...snapshot,phase:'running',revision:3,round:1,deadline:Date.now()+60000,turnActor:'a',map:{id:'map',name:'Map',width:20,height:20,assets:[],templates:[]},me:{profile:{id:'a',inventory:[]},weapons:[{slot:'primaryWeapon',name:'Gun'}],abilities:[]},units:[{id:'a',playerId:'a',name:'A',x:2,y:2,hpCurrent:8,hpMax:8,conditions:{},moveRemaining:6},{id:'enemy',name:'Enemy',x:4,y:2,hpCurrent:4,hpMax:4,conditions:{}}],log:[]};
 cw.GRPGRaidsV290.close();await cw.GRPGRaidsV290.open();cw.document.querySelector('[data-unit=enemy]').dispatchEvent(new cw.MouseEvent('click',{bubbles:true}));networkFailure=true;cw.document.querySelector('[data-action=attack]').click();await pause();const attack=calls.find(c=>c.type==='attack');assert.equal(attack.target,'enemy');assert.equal(attack.attackRoll,undefined);assert.equal(attack.damage,undefined);assert(cw.localStorage.getItem('grpgi-raid-operation290:main:a'));
 const retry=Array.from(cw.document.querySelectorAll('button')).find(b=>b.textContent==='Повторить запрос');assert(retry);retry.click();await pause();const attacks=calls.filter(c=>c.type==='attack');assert.equal(attacks.length,2);assert.equal(attacks[0].operationId,attacks[1].operationId);assert.equal(cw.localStorage.getItem('grpgi-raid-operation290:main:a'),null);
 snapshot={...snapshot,revision:snapshot.revision+1,resolving:true,areas:[{id:'area',name:'Cloud',color:'#123456',points:[{x:1,y:1},{x:2,y:1},{x:2,y:2}]}],pending:{id:'ability-point',kind:'abilityPoint292',title:'Point',until:Date.now()+25000}};cw.GRPGRaidsV290.close();await cw.GRPGRaidsV290.open();assert.equal(cw.document.querySelector('polygon title')?.textContent,'Cloud');assert(cw.document.querySelector('[data-pending]').textContent.includes('точку'));const svg=cw.document.querySelector('[data-map]');svg.createSVGPoint=()=>({x:0,y:0,matrixTransform:()=>({x:3,y:3})});svg.getScreenCTM=()=>({inverse:()=>({})});svg.dispatchEvent(new cw.MouseEvent('click',{bubbles:true,clientX:3,clientY:3}));await pause();const pointCall=calls.find(c=>c.type==='point');assert.equal(pointCall.pendingId,'ability-point');assert.equal(pointCall.x,3);
 snapshot={...snapshot,revision:snapshot.revision+1,resolving:false,pending:null};cw.GRPGRaidsV290.close();await cw.GRPGRaidsV290.open();cw.document.querySelector('[data-unit=enemy]').dispatchEvent(new cw.MouseEvent('click',{bubbles:true}));cw.document.querySelector('[data-help]').value='defense';cw.document.querySelector('[data-action=help]').click();await pause();assert.equal(calls.find(c=>c.type==='help').checkType,'defense');assert(cw.document.querySelector('[data-action=disengage]'));
 snapshot={...snapshot,revision:snapshot.revision+1,pending:{id:'opp',kind:'opportunity',options:[{id:'unarmed',name:'Безоружная атака'}],until:Date.now()+25000}};cw.GRPGRaidsV290.close();await cw.GRPGRaidsV290.open();cw.document.querySelector('[data-action=opportunity][data-source]').click();await pause();assert.equal(calls.find(c=>c.type==='opportunity').sourceId,'unarmed');
 snapshot={...snapshot,revision:snapshot.revision+1,pending:{id:'panic',kind:'panic',options:[{id:'fall',name:'Лечь на месте'}],until:Date.now()+25000}};cw.GRPGRaidsV290.close();await cw.GRPGRaidsV290.open();cw.document.querySelector('[data-action=panic]').click();await pause();assert.equal(calls.find(c=>c.type==='panic').value,'fall');
 snapshot={...snapshot,revision:snapshot.revision+1,pending:null,units:[...snapshot.units,{id:'device',operatorId:'a',equipmentType:'drone',name:'Drone',x:2,y:3,hpCurrent:3,hpMax:3,conditions:{},deviceCommand:{kindV200:'complex',completed:false,moduleUsed:false}}]};cw.GRPGRaidsV290.close();await cw.GRPGRaidsV290.open();const control=cw.document.querySelector('[data-control]');control.value='device';control.dispatchEvent(new cw.Event('change'));cw.document.querySelector('[data-unit=enemy]').dispatchEvent(new cw.MouseEvent('click',{bubbles:true}));cw.document.querySelector('[data-action=attack]').click();await pause();assert.equal(calls.filter(c=>c.type==='attack').at(-1).deviceId,'device');
 console.log('PASS raid web UI: NPC entry, party intent, automatic server rolls, controlled actor and persistent retry operation ID');
}finally{cw.GRPGRaidsV290?.close();await cw.happyDOM.abort();}
