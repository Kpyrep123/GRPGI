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
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g)){let source=fs.readFileSync(path.join(root,'renderer',m[1]),'utf8');if(m[1]==='app.js')source=source.replace('  function bindPlayerRealtimeV1092(){','  window.testRealtime214=applyPlayerRealtimeEventV1092;\n  function bindPlayerRealtimeV1092(){');if(m[1]==='scene-editor-v113.js')source=source.replace('// New module is DM-only;','window.testCombat214={persist:persistCombatProfiles105,local};\n// New module is DM-only;');vm.runInContext(source,context,{filename:m[1]});}


const pause=()=>new Promise(resolve=>setImmediate(resolve));
try{
run(`applyWorldData({players:{PLAYER_TEMPLATES:{p:{id:'p',role:'player'}}},equipment:{EQUIPMENT:{}}});App.state=makeDefaultState();App.currentUserId='p';Sync.config={enabled:true,campaignId:'test'};window.mirrors214=0;App._writeLocalMirrorsV135=async()=>{window.mirrors214++;return{ok:true};};`);
await Promise.all(Array.from({length:30},()=>run('App.writeLocalMirrors()')));assert.equal(w.mirrors214,1);
let release;w.wait214=new Promise(resolve=>release=resolve);run('App._writeLocalMirrorsV135=async()=>{window.mirrors214++;await window.wait214;return{ok:true};};');
const first=run('App.writeLocalMirrors()');await pause();const second=run('App.writeLocalMirrors()');release();await Promise.all([first,second]);assert.equal(w.mirrors214,3);
run(`window.mirrors214=0;window.renders214=0;App._writeLocalMirrorsV135=async()=>{window.mirrors214++;return{ok:true};};window.savedRefresh214=App.refreshAfterLocalWrite;App.refreshAfterLocalWrite=()=>window.renders214++;`);
w.row214={playerId:'p',version:10,player:{id:'p',role:'player',credits:10,inventory:[]}};
run('PlayerSync.applyRemoteRow(window.row214,{authoritative:true});');
for(let i=0;i<25;i++)await run('window.testRealtime214({row:window.row214})');assert.equal(w.mirrors214,0);assert.equal(w.renders214,0);
w.row214={...w.row214,version:11,player:{...w.row214.player,credits:20}};await run('window.testRealtime214({row:window.row214})');assert.equal(w.mirrors214,1);assert.equal(w.renders214,1);
run(`UI.activeModuleId=null;App.fillLoginSelect=()=>{};Sync.refreshChip=()=>{};window.mod214=document.createElement('div');mod214.id='scroll214';mod214.className='fs-module open';document.body.append(mod214);mod214.scrollTop=450;App.renderLive=()=>{mod214.scrollTop=0};window.savedRefresh214.call(App);`);assert.equal(w.document.getElementById('scroll214').scrollTop,450);
// Three independent profile queues must start together; full-world mirrors happen twice, not per player.
run(`applyWorldData({players:{PLAYER_TEMPLATES:Object.fromEntries(['a','b','c'].map(id=>[id,{id,role:'player',inventory:[],stats:{hpMax:10,hpCurrent:9},baseStats:{hpBase:10}}]))},equipment:{EQUIPMENT:{}}});App.state=makeDefaultState();Combat.getRuntime=()=>({tokens:['a','b','c'].map(playerId=>({playerId}))});App.writeLocalMirrors=async()=>{window.mirrors214++;return{ok:true};};window.mirrors214=0;`);
const requests=[],resolvers=[];
w.push214=(id,patch,options)=>{requests.push({id,options});return new Promise(resolve=>resolvers.push(resolve));};run('PlayerSync.pushPlayerPatch=(...args)=>window.push214(...args);');
const pending=run('testCombat214.persist("test",{immediate:true})');await pause();assert.equal(requests.length,3);assert(requests.every(r=>r.options.writeLocalMirrors===false));resolvers.forEach(resolve=>resolve({ok:true}));assert.equal((await pending).ok,true);assert.equal(w.mirrors214,2);
// A retry sends only the failed profile, and still persists successful responses.
run('testCombat214.local.combatProfileHashesV120.clear()');let count=0;w.push214=async id=>{count++;return id==='b'?{ok:false,message:'offline'}:{ok:true};};assert.equal((await run('testCombat214.persist("failure",{immediate:true})')).ok,false);assert.equal(count,3);
const retryIds=[];w.push214=async id=>{retryIds.push(id);return{ok:true};};assert.equal((await run('testCombat214.persist("retry",{immediate:true})')).ok,true);assert.deepEqual(retryIds,['b']);
console.log('PASS v214 full renderer: batched durable mirrors, trailing write, duplicate realtime noop, scroll preserved, 3 parallel profile queues, two mirrors/checkpoint and failure-only retry');
}finally{await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}
