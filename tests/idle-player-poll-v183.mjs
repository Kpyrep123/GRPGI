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
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g))vm.runInContext(fs.readFileSync(path.join(root,'renderer',m[1]),'utf8'),context,{filename:m[1]});

const clone=value=>JSON.parse(JSON.stringify(value));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
run(`
  applyWorldData({players:{PLAYER_TEMPLATES:{}},equipment:{EQUIPMENT:{}},skills:{SKILLS:{}}});
  App.state=makeDefaultState();App.currentUserId='p';
  window.renders183=0;App.renderLive=()=>{window.renders183++};App.refreshAfterLocalWrite=()=>{window.renders183++};UI.renderProfile=()=>{};
  Sync.config={enabled:true,campaignId:'test'};
  Persistence.save=async state=>{window.persistedV135=JSON.parse(JSON.stringify(state));return{ok:true};};
  App._writeLocalMirrorsV135=async function(){await Persistence.save(this.state);return{ok:true};};
  window.notices=[];Toast.show=(message,type)=>window.notices.push({message,type});
`);

let row={playerId:'p',version:1,updatedAt:'2026-10-23T12:00:00Z',player:{id:'p',role:'player',displayName:'Test',inventory:[],image:'data:image/png;base64,'+'a'.repeat(200000),baseStats:{hpBase:10,inventorySlots:12,carryBase:12},skills:[]}};
w.electronAPI.pullPlayers=async()=>({ok:true,rows:[clone(row)]});
w.row183=clone(row);run('PlayerSync.applyRemoteRow(window.row183,{authoritative:true})');
run(`window.saves183=0;window.mirrors183=0;window.normalizations183=0;
 Persistence.save=async()=>{window.saves183++;return {ok:true};};
 App._writeLocalMirrorsV135=async()=>{window.mirrors183++;return {ok:true};};
 const normalizeBefore183=normalizePlayerProfileV2;normalizePlayerProfileV2=function(...args){window.normalizations183++;return normalizeBefore183(...args);};`);
try{
 for(let i=0;i<20;i++)await run("PlayerSync.pullUpdates('fast-poll',{silent:true})");
 assert.equal(w.normalizations183,0);assert.equal(w.mirrors183,0);assert.equal(w.saves183,0);assert.equal(w.renders183,0);
 w.electronAPI.pullPlayers=async()=>({ok:true,rows:[]});for(let i=0;i<10;i++)await run("PlayerSync.pullUpdates('fast-poll')");assert.equal(w.saves183,0);
 w.electronAPI.pullPlayers=async()=>({ok:true,rows:[clone(row)]});row={...row,version:2,player:{...row.player,credits:123}};
 await run("PlayerSync.pullUpdates('fast-poll')");assert.equal(run('App.state.users.p.credits'),123);assert.equal(w.mirrors183,1);assert.equal(w.renders183,1);assert(w.normalizations183>0);
 w.mirrors183=0;w.normalizations183=0;run("UI.activeModuleId='combat'");for(let i=0;i<10;i++)await run('GRPGCombatInventorySyncV113.pullNow()');assert.equal(w.mirrors183,0);assert.equal(w.normalizations183,0);run('UI.activeModuleId=null');
 let requests=0,resolve;w.electronAPI.pullPlayers=()=>{requests++;return new Promise(r=>resolve=r);};w.setInterval=callback=>{w.tick183=callback;return 1;};run('PlayerSync.startPolling()');w.tick183();w.tick183();w.tick183();assert.equal(requests,1);resolve({ok:true,rows:[]});await pause(0);assert.equal(run('PlayerSync._pollInFlightV183'),false);
 console.log('PASS v183: 20 repeated three-second replies + 10 empty replies cause zero normalization/mirror/state writes/renders; changed version still applies; combat inventory echoes are idle; slow polls cannot overlap.');
}finally{await w.happyDOM.abort();}
