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
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-apply307-'));
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
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g))vm.runInContext(fs.readFileSync(path.join(root,'renderer',m[1]),'utf8'),context,{filename:m[1]});

const stateFile=path.join(scratch,'state.json');
const counts={full:0,patch:[],worldReads:0,stateReads:0},logs=[];
let failPatch=false;
const originalFull=w.electronAPI.saveWorldData;
w.electronAPI.saveWorldData=async world=>{counts.full++;return originalFull(world);};
w.electronAPI.loadWorldData=async()=>{counts.worldReads++;return{ok:true,world:JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'))};};
w.electronAPI.saveWorldSections=async patch=>{
 counts.patch.push(Object.keys(patch));if(failPatch)return{ok:false,message:'patch disk failure'};
 const world=JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'));Object.assign(world,patch);
 fs.writeFileSync(path.join(scratch,'world.json'),JSON.stringify(world));return{ok:true,world:structuredClone(patch)};
};
w.electronAPI.loadState=async()=>{counts.stateReads++;return fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):null;};
w.electronAPI.saveState=async state=>{fs.writeFileSync(stateFile,JSON.stringify(state));return{ok:true};};
w.electronAPI.debugLog=async(label,payload)=>logs.push({label,payload});
run(`
 App.state=makeDefaultState();App.currentUserId='gm';UI.activeModuleId='sync';
 Sync.render=()=>{};Sync.refreshChip=()=>{};Sync.beginDataTransfer=()=>{};Sync.endDataTransfer=()=>{};
 Sync.config={enabled:true,provider:'pocketbase',campaignId:'main',url:'https://sync.test'};Sync.loadConfig=async function(){return this.config;};
 PlayerSync.shouldIsolateUsersFromSnapshot=()=>false;Toast.show=()=>{};
 window.render307=0;window.renderBefore307=rerenderActiveModuleV086;
 rerenderActiveModuleV086=(...args)=>{window.render307++;return window.renderBefore307(...args);};
`);
let revision=10,world={players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm'}}},equipment:{EQUIPMENT:{test:{id:'test',type:'gear',name:'Initial'}}},npcs:{NPCS:{}},planets:{PLANETS:{}}};
const state={users:{gm:{id:'gm',role:'gm',credits:0,inventory:[]}},meta:{sync:{remoteRevision:0}}};
const response=()=>({ok:true,status:'newer',newer:true,baselineToken:'baseline-'+revision,remote:{campaignId:'main',revision,updatedAt:'time-'+revision},payload:{world:structuredClone(world),state:structuredClone(state)}});
w.electronAPI.pullSync=async()=>response();
const tick=()=>new Promise(resolve=>setImmediate(resolve));
try{
 await run("Sync.checkForRemoteUpdates('manual-pull',{force:true,silent:true})");
 assert.equal(counts.full,1);assert.equal(counts.worldReads,0,'write response replaces redundant world reload');assert.equal(counts.stateReads,0,'no state save/load/normalize round trip');assert.equal(w.render307,1);
 run("App.state.directChats={'gm::p':[{id:'chat-local',text:'Keep chat'}]};App.state.users.gm.credits=42;App.state.users.gm.inventory=[{itemId:'local-item',qty:1}];PlayerSync.shouldIsolateUsersFromSnapshot=()=>true;");
 revision=11;world.equipment.EQUIPMENT.test.name='Changed';
 let release,pulls=0;w.electronAPI.pullSync=async()=>{pulls++;return new Promise(resolve=>{release=()=>resolve(response());});};
 const first=run("Sync.checkForRemoteUpdates('poll',{silent:true})"),duplicate=run("Sync.checkForRemoteUpdates('realtime',{silent:true})");
 await tick();assert.equal(pulls,1,'concurrent poll and realtime share the complete check/application');release();await Promise.all([first,duplicate]);
 assert.equal(counts.full,1);assert.deepEqual(counts.patch,[['equipment']]);assert.equal(w.render307,2);assert.equal(run('App.state.meta.sync.remoteRevision'),11);
 assert.equal(run('EQUIPMENT.test.name'),'Changed');assert.equal(run("App.state.directChats['gm::p'][0].text"),'Keep chat');assert.equal(run('App.state.users.gm.credits'),42);assert.equal(run('App.state.users.gm.inventory[0].itemId'),'local-item');
 assert.equal(JSON.parse(fs.readFileSync(stateFile,'utf8')).meta.sync.remoteRevision,11);
 // Two direct applications also serialize; only one performs IO/render.
 revision=12;world.npcs.NPCS.new={id:'new',name:'NPC'};const direct=response();w.direct307=direct;
 await Promise.all([run('Sync.applyRemoteSnapshot(direct307.payload,direct307.remote)'),run('Sync.applyRemoteSnapshot(direct307.payload,direct307.remote)')]);
 assert.deepEqual(counts.patch.at(-1),['npcs']);assert.equal(counts.patch.length,2);assert.equal(w.render307,3);
 // A normal update with the same revision/time but different contents still applies.
 world.equipment.EQUIPMENT.test.name='Legacy SQL update';w.direct307=response();
 await run('Sync.applyRemoteSnapshot(direct307.payload,direct307.remote)');assert.equal(counts.patch.length,3);assert.equal(run('EQUIPMENT.test.name'),'Legacy SQL update');
 // A failed section write advances neither durable revision nor the next diff baseline.
 revision=13;world.equipment.EQUIPMENT.test.name='Retry after failed write';failPatch=true;w.electronAPI.pullSync=async()=>response();
 await assert.rejects(run("Sync.checkForRemoteUpdates('poll',{silent:true})"),/patch disk failure/);
 assert.equal(run('App.state.meta.sync.remoteRevision'),12);assert.equal(JSON.parse(fs.readFileSync(stateFile,'utf8')).meta.sync.remoteRevision,12);assert.equal(run('Sync.baselineToken'),'baseline-11');
 failPatch=false;await run("Sync.checkForRemoteUpdates('poll',{silent:true})");assert.equal(run('App.state.meta.sync.remoteRevision'),13);assert.equal(run('EQUIPMENT.test.name'),'Retry after failed write');
 // The server can reject/normalize an edit back to the preceding world value.
 run("worldData.equipment.EQUIPMENT.test.name='Local rejected value';Sync.markLocalDirty('draft');");
 const generation=run('App.state.meta.sync.localEditVersion');revision=14;
 w.electronAPI.pullSync=async()=>({...response(),recovered:{operationId:'canonical',localEditVersion:generation,worldScope:['equipment']}});
 await run("Sync.checkForRemoteUpdates('recover',{silent:true})");assert.equal(run('EQUIPMENT.test.name'),'Retry after failed write');assert.deepEqual(counts.patch.at(-1),['equipment']);
 // Edits made DURING an outstanding pull must not be overwritten by its old receipt.
 run("Sync.markLocalDirty('old draft');");const oldGeneration=run('App.state.meta.sync.localEditVersion');revision=15;
 w.electronAPI.pullSync=async()=>new Promise(resolve=>{release=()=>resolve({...response(),recovered:{operationId:'old',localEditVersion:oldGeneration,worldScope:['equipment']}});});
 const racing=run("Sync.checkForRemoteUpdates('recover',{silent:true})");await tick();run("Sync.markLocalDirty('new draft');worldData.equipment.EQUIPMENT.test.name='Newer local edit';");const before=counts.patch.length;release();assert.equal((await racing).skipped,true);
 assert.equal(counts.patch.length,before);assert.equal(run('App.state.meta.sync.remoteRevision'),14);assert.equal(run('worldData.equipment.EQUIPMENT.test.name'),'Newer local edit');
 // A profile update received during asynchronous state IO remains authoritative.
 run("App.state.meta.sync.localDirty=false;");revision=16;world.equipment.EQUIPMENT.test.name='After profile update';
 const saveState=w.electronAPI.saveState;let releaseState,holdState=true;
 w.electronAPI.saveState=async value=>{if(holdState){holdState=false;await new Promise(resolve=>{releaseState=resolve;});}return saveState(value);};
 w.electronAPI.pullSync=async()=>response();const duringIO=run("Sync.checkForRemoteUpdates('poll',{silent:true})");
 while(!releaseState)await tick();run("App.state.users.gm.credits=123;App.state.users.gm.inventory=[{itemId:'received-during-save',qty:1}];");releaseState();await duringIO;
 assert.equal(run('App.state.users.gm.credits'),123);assert.equal(JSON.parse(fs.readFileSync(stateFile,'utf8')).users.gm.inventory[0].itemId,'received-during-save');w.electronAPI.saveState=saveState;
 // Forced restore retains the full recovery path and advances only after success.
 w.electronAPI.pullSync=async()=>response();await run("Sync.checkForRemoteUpdates('manual-pull',{force:true,silent:true})");assert.equal(counts.full,2);assert.equal(run('App.state.meta.sync.remoteRevision'),16);
 // State-only refreshes do not touch world files or run the world loader.
 const patchCount=counts.patch.length;revision=17;state.meta.serverFlag=true;
 await run("Sync.checkForRemoteUpdates('poll',{silent:true})");assert.equal(counts.patch.length,patchCount);assert.equal(counts.full,2);assert.equal(run('App.state.meta.sync.remoteRevision'),17);
 // Removing a whole section clears its local file through the same scoped API.
 revision=18;delete world.npcs;await run("Sync.checkForRemoteUpdates('poll',{silent:true})");assert.deepEqual(counts.patch.at(-1),['npcs']);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8')).npcs,{});
 w.stale307={world:structuredClone(world),state:structuredClone(state)};
 assert.equal((await run("Sync.applyRemoteSnapshot(stale307,{revision:16,updatedAt:'old'})")).status,'deferred-stale-snapshot');assert.equal(run('App.state.meta.sync.remoteRevision'),18);
 const stateBefore=JSON.parse(fs.readFileSync(stateFile,'utf8'));assert.equal(stateBefore.meta.sync.remoteRevision,18);
 assert(logs.some(row=>row.label==='SYNC_APPLY_REMOTE_DEDUPED'));assert(logs.some(row=>row.label==='SYNC_APPLY_REMOTE_TIMING'&&row.payload.mode==='sections'));
 console.log('PASS full renderer apply: concurrent checks, serialized/deduped apply, exact section IO, one final render, no reread, chat/inventory preservation, same-revision SQL, rollback/retry, canonical result and edits during pull');
}finally{await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}
process.exit(0);
