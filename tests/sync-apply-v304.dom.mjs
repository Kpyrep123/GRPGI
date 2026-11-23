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
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-apply304-'));
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
w.electronAPI.loadState=async()=>fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):null;
w.electronAPI.saveState=async state=>{fs.writeFileSync(stateFile,JSON.stringify(state));return{ok:true};};
run(`
 App.state=makeDefaultState();App.currentUserId='gm';UI.activeModuleId='sync';
 App.renderLive=()=>{};Sync.render=()=>{};Sync.refreshChip=()=>{};Sync.beginDataTransfer=()=>{};Sync.endDataTransfer=()=>{};
 Sync.config={enabled:true,provider:'pocketbase',campaignId:'main',url:'https://sync.test'};
 Sync.loadConfig=async function(){return this.config;};
 PlayerSync.shouldIsolateUsersFromSnapshot=()=>false;
 Toast.show=()=>{};
`);
const remoteWorld={players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm',displayName:'DM'}}},equipment:{EQUIPMENT:{test:{id:'test',type:'gear',name:'Server item'}}}};
const remoteState={users:{gm:{id:'gm',role:'gm',displayName:'DM',inventory:[]}},meta:{sync:{remoteRevision:0}}};
let revision=2474;
w.electronAPI.pullSync=async()=>({ok:true,status:'newer',newer:true,baselineToken:'baseline-'+revision,remote:{campaignId:'main',revision,updatedAt:'2026-11-23T21:16:00Z'},payload:{world:structuredClone(remoteWorld),state:structuredClone(remoteState)}});
try{
 await run("Sync.checkForRemoteUpdates('manual-pull',{force:true,silent:true})");
 assert.equal(run('App.state.meta.sync.remoteRevision'),2474,'actual complete wrapper chain must preserve server metadata');
 assert.equal(JSON.parse(fs.readFileSync(stateFile,'utf8')).meta.sync.remoteRevision,2474,'applied revision is durable');
 assert.equal(run('EQUIPMENT.test.name'),'Server item');assert.equal(run('Sync.baselineToken'),'baseline-2474');
 await run('Persistence.load().then(state=>{App.state=state;})');assert.equal(run('App.state.meta.sync.remoteRevision'),2474);
 let outgoing;
 w.electronAPI.pushSync=async payload=>{outgoing=payload;return{ok:false,status:'pending',operationId:'pending-test',pendingEditVersion:payload.localEditVersion,message:'Awaiting'};};
 await run("Sync.pushCurrentSnapshot('world-config-save',{silent:true,preparedWorld:{equipment:worldData.equipment},worldSections:['equipment']})");
 assert.equal(outgoing.baseRevision,2474,'next WC save uses the applied revision, not zero');assert.equal(run('App.state.meta.sync.remoteRevision'),2474);
 const saveWorld=w.electronAPI.saveWorldData;revision=2475;
 w.electronAPI.saveWorldData=async()=>({ok:false,message:'disk failure'});
 await assert.rejects(run("Sync.checkForRemoteUpdates('manual-pull',{force:true,silent:true})"),/disk failure/);
 assert.equal(run('App.state.meta.sync.remoteRevision'),2474,'failed application must not advance baseline');
 assert.equal(run('Sync.baselineToken'),'baseline-2474');
 w.electronAPI.saveWorldData=saveWorld;
 await run("Sync.checkForRemoteUpdates('manual-pull',{force:true,silent:true})");
 assert.equal(run('App.state.meta.sync.remoteRevision'),2475);
 console.log('PASS real remote-apply chain: forced load, durable revision, reload, next save and failed local write');
}finally{await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}
process.exit(0);
