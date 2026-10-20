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
  applyWorldData({players:{PLAYER_TEMPLATES:{}},equipment:{EQUIPMENT:{kit:{id:'kit',name:'Набор',width:1,height:1,weight:0}}},skills:{SKILLS:{basic178:{id:'basic178',isBasic:true}}},socialOrigins:{SOCIAL_ORIGINS:{doctor:{id:'doctor',startingItems:[{itemId:'kit',qty:1}]}}}});
  App.state=makeDefaultState();App.currentUserId='p';
  App.renderLive=()=>{};App.refreshAfterLocalWrite=()=>{};UI.renderProfile=()=>{};
  Sync.config={enabled:true,campaignId:'test'};
  Persistence.save=async state=>{window.persistedV135=JSON.parse(JSON.stringify(state));return{ok:true};};
  App._writeLocalMirrorsV135=async function(){await Persistence.save(this.state);return{ok:true};};
  window.notices=[];Toast.show=(message,type)=>window.notices.push({message,type});
`);
let server={playerId:'p',campaignId:'test',version:1,player:{
 id:'p',role:'player',socialOriginId:'doctor',displayName:'Test',credits:10000,skillPoints:3,skills:[],
 abilityBase:{strength:0,dexterity:0,endurance:0,intellect:0,will:0,glory:0},
 abilities:{strength:0,dexterity:0,endurance:0,intellect:0,will:0,glory:0},
 baseStats:{hpBase:10,inventorySlots:100,carryBase:1000,implantSlots:0},
 inventory:[],equipmentSlots:{},implantSlots:[],stats:{hpCurrent:10,hpMax:10}
}};
let active=0,maxActive=0,visibleMin=Infinity,phase='',requests=[];
function incoming(row){w.incomingV135=clone(row);run('PlayerSync.applyRemoteRow(window.incomingV135)');}
w.electronAPI.pullPlayers=async()=>({ok:true,rows:[clone(server)]});
w.electronAPI.patchPlayer=async request=>{
 active++;maxActive=Math.max(maxActive,active);requests.push(clone(request));
 await pause(12);
 try{
  let next;
  try{next=w.GRPGPlayerSyncCoreV135.mergePatch(request.basePlayer,request.player,server.player);}
  catch(error){return{ok:false,status:'conflict',remote:clone(server),message:error.message};}
  next.__syncReceiptsV135={...(next.__syncReceiptsV135||{}),[request.operationId]:{at:Date.now()}};
  server={...server,version:server.version+1,player:clone(next)};
  const accepted=clone(server);incoming(accepted);
  if(phase==='add')visibleMin=Math.min(visibleMin,run("App.state.users.p.inventory.length"));
  await pause(6);return{ok:true,row:accepted};
 }finally{active--;}
};
w.electronAPI.pushPlayer=w.electronAPI.patchPlayer;
incoming(server);
try {
 assert.equal(run('normalizePlayerProfileV2(App.state.users.p).inventory.length'),0);
 await run(`PlayerSync.pushPlayerPatch('p',{inventory:[]},{rerender:false})`);
 assert.equal(server.player.inventory.length,0);
 assert.ok(server.player.skills.includes('basic178'));
 assert.equal(server.player.characterGrants178.items.length,0);
 incoming(server);
 assert.equal(run('normalizePlayerProfileV2(App.state.users.p).inventory.length'),0);
 // Legacy profiles have no item receipt: reads/writes must not issue starter goods.
 await run(`PlayerSync.pushPlayerPatch('p',{displayName:'После выдачи'},{rerender:false})`);
 incoming(server);assert.equal(run('App.state.users.p.inventory.length'),0);
 assert.equal(server.player.skillPoints,3);
 console.log('PASS: real desktop sync queue persists automatic skills without issuing starting items to legacy profiles; empty inventories stay empty across reloads and unrelated edits');
}finally{w.happyDOM.cancelAsync();w.close();fs.rmSync(scratch,{recursive:true,force:true});}
