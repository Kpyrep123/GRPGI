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
  App.renderLive=()=>{};App.refreshAfterLocalWrite=()=>{};UI.renderProfile=()=>{};
  Sync.config={enabled:true,campaignId:'test'};
  Persistence.save=async state=>{window.persistedV135=JSON.parse(JSON.stringify(state));return{ok:true};};
  App._writeLocalMirrorsV135=async function(){await Persistence.save(this.state);return{ok:true};};
  window.notices=[];Toast.show=(message,type)=>window.notices.push({message,type});
`);
let server={playerId:'p',campaignId:'test',version:1,player:{
 id:'p',role:'player',displayName:'Test',credits:10000,skillPoints:3,skills:[],
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
try{
 phase='add';const tasks=[];
 for(let i=0;i<20;i++){
  w.addItemIdV135='item_'+i;
  tasks.push(run(`(()=>{
    const current=App.state.users.p;
    current.inventory=[...current.inventory,{itemId:window.addItemIdV135,qty:1,positions:[]}];
    return PlayerSync.pushPlayerPatch('p',{inventory:deep(current.inventory)},{rerender:false});
  })()`));
 }
 assert.equal(run('App.state.users.p.inventory.length'),20);
 const results=await Promise.all(tasks);assert.ok(results.every(r=>r.ok));
 assert.equal(server.player.inventory.length,20);assert.equal(visibleMin,20);assert.equal(maxActive,1);
 console.log('PASS desktop: 20 rapid writes stay visible; one request per player');
 phase='remove';
 const removals=[];
 for(let i=0;i<20;i++){
  w.removeItemIdV135='item_'+i;
  removals.push(run(`(()=>{
    const user=App.state.users.p;user.inventory=user.inventory.filter(row=>row.itemId!==window.removeItemIdV135);
    return PlayerSync.pushPlayerPatch('p',{inventory:deep(user.inventory)},{rerender:false});
  })()`));
 }
 await Promise.all(removals);assert.equal(server.player.inventory.length,0);
 incoming({...server,version:1,player:{...server.player,inventory:[{itemId:'resurrected',qty:1}]}});
 assert.equal(run('App.state.users.p.inventory.length'),0);
 console.log('PASS desktop: stale events cannot restore removed inventory');
 for(const ability of ['strength','dexterity','endurance']){
  const button=w.document.createElement('button');
  button.className='profile-upgrade-ability-btn-v51';button.dataset.ability=ability;
  w.document.body.append(button);button.click();button.remove();
 }
 assert.equal(run('App.state.users.p.skillPoints'),0);
 await run("PlayerSync._queueV135.run('p',async()=>{})");
 assert.equal(server.player.skillPoints,0);
 for(const key of ['strength','dexterity','endurance'])assert.equal(server.player.abilityBase[key],1,key);
 assert.equal(run('App.state.users.p.abilityBase.strength'),1);
 console.log('PASS desktop: actual ability buttons preserve all three upgrades and payments');
 // The GM opens a form, then another client buys stock before Save.
 run("PlayerSync._editorBaseV135.set('p',deep(PlayerSync.projectedPlayerV135('p')))");
 const staleForm=clone(server.player);
 server={...server,version:server.version+1,player:{...server.player,credits:9900,stockPortfolio:{positions:{stock_acme:{itemId:'stock_acme',knownQty:1,costBasis:100}},ledger:[]}}};
 incoming(server);w.formPlayerV135={...staleForm,notes:'edited from older form'};
 const formResult=await run("PlayerSync.pushPlayerRecord('p',window.formPlayerV135,{rerender:false})");
 assert.equal(formResult.ok,true);assert.equal(server.player.credits,9900);
 assert.equal(server.player.stockPortfolio.positions.stock_acme.knownQty,1);
 assert.equal(server.player.notes,'edited from older form');
 console.log('PASS desktop: saving an older form preserves a newer stock purchase');

 // A delayed event with the same version but older content must not erase the portfolio.
 const equalVersionStale=clone(server);delete equalVersionStale.player.stockPortfolio;
 incoming(equalVersionStale);
 assert.equal(run('App.state.users.p.stockPortfolio.positions.stock_acme.knownQty'),1);
 console.log('PASS desktop: conflicting equal-version realtime cannot erase shares');

 // Disk normalization must keep new profile fields even if the world player mirror is older.
 w.persistCandidateV140=clone(run('App.state'));
 run("delete PLAYER_TEMPLATES.p.stockPortfolio;window.persistNormalizedV140=Persistence.normalize(window.persistCandidateV140)");
 assert.equal(w.persistNormalizedV140.users.p.stockPortfolio.positions.stock_acme.knownQty,1);
 run('PLAYER_TEMPLATES.p=deep(App.state.users.p)');
 console.log('PASS desktop: state normalization preserves stockPortfolio from disk');
 
 // Combat keeps unsent HP damage while pending inventory survives incoming events.
 run("UI.activeModule='combat';document.body.classList.add('combat-stability-v108');App.state.users.p.stats.hpCurrent=4");
 const combatTasks=[];
 for(let i=0;i<4;i++){
  w.combatItemV135='combat_'+i;
  combatTasks.push(run("(()=>{const p=App.state.users.p;p.inventory=[...p.inventory,{itemId:window.combatItemV135,qty:1}];return PlayerSync.pushPlayerPatch('p',{inventory:deep(p.inventory)},{rerender:false});})()"));
 }
 await Promise.all(combatTasks);
 assert.equal(run('App.state.users.p.stats.hpCurrent'),4);
 assert.equal(run('App.state.users.p.inventory.length'),4);
 run("document.body.classList.remove('combat-stability-v108');UI.activeModule='profile'");
 console.log('PASS desktop: combat damage and queued inventory survive realtime');
 // A save waits on disk while a newer remote purchase arrives.
 run("Configurator.selectedType='players';Configurator.selectedId='p';PlayerSync._editorBaseV135.set('p',deep(PlayerSync.projectedPlayerV135('p')));App.state.users.p.notes='intent before disk wait';Sync.pushCurrentSnapshot=async()=>({ok:true})");
 const saveWorld=w.electronAPI.saveWorldData;let delayedOnce=false;
 w.electronAPI.saveWorldData=async world=>{
  if(!delayedOnce){delayedOnce=true;await pause(12);server={...server,version:server.version+1,player:{...server.player,credits:9800}};incoming(server);}
  return saveWorld(world);
 };
 await run("Configurator.persistAll('Saved',{playerSync:{playerId:'p'}})");
 assert.equal(server.player.notes,'intent before disk wait');
 assert.equal(server.player.credits,9800);
 assert.equal(run('App.state.users.p.credits'),9800);
 console.log('PASS desktop: real World Config save retains intent across disk and network delays');

 assert.equal(run('PlayerSync._pendingV135.size'),0);
 assert.equal(maxActive,1);
 assert.equal(errors.filter(x=>/ReferenceError|TypeError/.test(x)).length,0,errors.join('\n'));
 console.log('ALL DESKTOP CLIENT CHECKS PASSED');
}finally{await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}
