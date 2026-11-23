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
 w.archived299={main:{enabled:true,windowMode:'open',missions:[{id:'kept',maps:[{id:'map',backgroundImage:'file:///local.png'}],reward:{items:[{itemId:'med',qty:1}]}}]}};
 run("applyWorldData({campaigns:{RAIDS_V290:archived299},equipment:{EQUIPMENT:{med:{id:'med',type:'gear'}}},players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm'},p:{id:'p',role:'player',raidLock290:'run',stats:{hpCurrent:8,hpMax:8},inventory:[]}}}});App.state=makeDefaultState();App.currentUserId='gm';Sync.config={enabled:false};App.renderLive=()=>{};App.refreshAfterLocalWrite=()=>{};Persistence.save=async()=>({ok:true});Toast.show=()=>{};");
 const api=w.test287;api.applyStore({rangeSchema:109,cameraSchema:109,scenes:{map:{id:'map',name:'Scene',mode:'normal',width:20,height:20,assets:[],templates:[{id:'zone',shape:'polygon',raidZone290:'spawn',targetMap290:'other',targetZone290:'arrive',points:[{x:1,y:1},{x:4,y:1},{x:4,y:4}]}]}},runtimes:{map:{tokens:[]}},selectedSceneId:'map'});api.local.loaded=true;
 run("UI.openModule('config');Configurator.render()");assert.equal(w.document.querySelector('[data-raids-tab290]'),null);assert(w.document.querySelector('[data-aberration-forge-tab]'),'forge stays available');assert.equal(w.document.querySelector('[data-raids-config290]'),null);
 assert.deepEqual(JSON.parse(run('JSON.stringify(buildWorldSnapshot().campaigns.RAIDS_V290)')),JSON.parse(JSON.stringify(w.archived299)),'ordinary saves preserve dormant missions');
 run("UI.openModule('combat');Combat.selectedObject={kind:'zone',id:'zone'};Combat.render()");assert.equal(w.document.querySelector('[name=raidZone290]'),null);assert.equal(w.document.querySelector('[name=targetMap290]'),null);
 run("Combat.getScene().mode='normal'");assert.equal(api.canCombatAct129({id:'p',playerId:'p',hpCurrent:8}),true,'stale local lock does not block ordinary combat');assert.equal(api.canMechanicalMove108({id:'p',playerId:'p',hpCurrent:8}),true);
 const stored=api.collectStoreFromRuntime();assert.equal(stored.scenes.map.templates[0].raidZone290,'spawn');assert.equal(stored.scenes.map.templates[0].targetMap290,'other');
 const hub={maps:[],dialogs:[{id:'d',name:'Dialogue',startNodeId:'start',nodes:[{id:'start',text:'Text',choices:[{id:'dormant',text:'Вступить в вылазку',target:'raid'},{id:'normal',text:'Continue',target:'end'}]}]}]};const editor=w.GRPGDialogEditorV161.open({hub});assert(!editor.root.textContent.includes('вылазк'));editor.root.querySelector('[data-select-reply]').click();assert.equal(editor.root.querySelector('[data-destination] option[value=raid]'),null);editor.close();assert.equal(hub.dialogs[0].nodes[0].choices.length,2,'hidden replies stay in the stored graph');
 console.log('PASS suspended desktop: no module UI, preserved missions/zone metadata, forge and ordinary combat remain available');
}finally{await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}
const cw=new Window({url:'https://grpgi.test/app/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),ctx=vm.createContext(cw);
try{
 let timers=0;cw.setInterval=()=>{timers++;throw Error('retired client scheduled timer');};cw.fetch=()=>{throw Error('retired client issued request');};cw.document.body.innerHTML='<div class="raid290"></div><button class="raid-resume290"></button>';
 vm.runInContext(fs.readFileSync(path.join(root,'deploy/site/app/raids-v290.js'),'utf8'),ctx);assert.equal(timers,0);assert.equal(cw.GRPGRaidsV290,undefined);assert.equal(cw.document.querySelector('.raid290,.raid-resume290'),null);
 const webHtml=fs.readFileSync(path.join(root,'deploy/site/app/index.html'),'utf8');assert(!/raids-v290\.(?:js|css)/.test(webHtml));assert(!fs.readFileSync(path.join(root,'deploy/site/app/app.js'),'utf8').includes('raidRequest:'));
 for(const file of ['hub-core-v156.js','dialog-view-v161.js'])vm.runInContext(fs.readFileSync(path.join(root,'renderer',file),'utf8'),ctx);
 const C=cw.GRPGHubCoreV156,planet={id:'planet',hub:{maps:[{id:'map',objects:[{id:'npc',npcId:'n',dialogIds:['d']}]}],dialogs:[{id:'d',startNodeId:'node',nodes:[{id:'node',terminal:false,choices:[{id:'r',text:'Вступить в вылазку',target:'raid'}]}]}]}},hub=C.hubOf(planet),player={id:'p',inventory:[]},state=C.stateFor(player,planet,hub),dialog=hub.dialogs[0],object=hub.maps[0].objects[0];
 assert(C.choiceReason(dialog,dialog.nodes[0],dialog.nodes[0].choices[0],player,state,object));
 cw.GRPGDialogViewV161.open({snapshot:()=>({dialog,node:dialog.nodes[0],object,player,state}),choose:async(id,node)=>C.advance(hub,'npc','d',node,id,player,state)});assert(!cw.document.body.textContent.includes('вылазк'));assert.equal(cw.document.querySelector('[data-choice]'),null);assert(cw.document.querySelector('[data-finish]'),'an archived-only node remains finishable');cw.document.querySelector('[data-finish]').click();await pause();assert.equal(cw.document.querySelector('.hub-conversation-v161'),null);

 console.log('PASS suspended web: no loader, timers, API bridge, legacy button or dormant reply; ordinary dialogue completion works');
}finally{cw.GRPGDialogViewV161?.active?.leave();await cw.happyDOM.abort();}
