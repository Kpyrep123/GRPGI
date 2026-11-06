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
const A=(await import('../market-service/accounting-v213.js')).default;
w.serverProfile={id:'p',role:'player',displayName:'Player',credits:1000,stockPortfolio:{positions:{},shortPositions:{},ledger:[]}};
w.stockRequests=[];
w.electronAPI.getStockExchange=async()=>({ok:true,player:structuredClone(w.serverProfile)});
w.electronAPI.editStockPortfolio=async body=>{w.stockRequests.push(JSON.parse(JSON.stringify(body)));A.editPosition(w.serverProfile,body,100,1);return {ok:true,player:structuredClone(w.serverProfile)};};
const html=fs.readFileSync(path.join(root,'renderer/index.html'),'utf8');
w.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
// Every renderer script is evaluated unmodified, in index.html order, sharing
// browser-style lexical globals. Only OS/cloud/bootstrap boundaries are mocked.
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g))vm.runInContext(fs.readFileSync(path.join(root,'renderer',m[1]),'utf8'),context,{filename:m[1]});

try {
run(`
 App.state=makeDefaultState();
 applyWorldData({players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm',displayName:'GM'},p:{id:'p',role:'player',displayName:'Player',credits:1000}}},equipment:{EQUIPMENT:{alpha:{id:'alpha',type:'stock',name:'Alpha'}}}});
 App.state=makeDefaultState();App.currentUserId='gm';App.renderLive=()=>{};
 Configurator.selectedType='players';Configurator.selectedId='p';Configurator.render();
 Toast.show=()=>{};
`);
const pause=()=>new Promise(resolve=>setTimeout(resolve,30));await pause();
let panel=w.document.querySelector('[data-stock-config-v213]');assert(panel);
assert.equal(panel.previousElementSibling.getAttribute('data-wc-inventory-editor-v1068'),'');
const field=n=>panel.querySelector(`[data-stock-config-${n}-v213]`);
field('side').value='short';field('qty').value='6';field('leverage').value='3';field('price').value='100';field('save').click();await pause();
assert.equal(w.stockRequests[0].side,'short');assert.equal(w.serverProfile.stockPortfolio.shortPositions.alpha.quantity,6);
assert.equal(w.serverProfile.stockPortfolio.shortPositions.alpha.margin,200);
assert.equal(run('App.state.users.p.stockPortfolio.shortPositions.alpha.quantity'),6);
assert.equal(run('App.state.users.p.credits'),1000);
panel.querySelector('[data-stock-config-edit-v213]').click();field('qty').value='4';field('leverage').value='2';field('price').value='120';field('save').click();await pause();
assert.equal(w.serverProfile.stockPortfolio.shortPositions.alpha.quantity,4);
assert.equal(w.serverProfile.stockPortfolio.shortPositions.alpha.margin,240);
assert.equal(w.stockRequests[1].expected.quantity,6);
// Saving unrelated character fields retains the latest live portfolio.
assert.equal(run("Configurator.collectEntity('players',document.getElementById('config-editor-form')).stockPortfolio.shortPositions.alpha.quantity"),4);
// A newer player-sync tick must win over this editor's older loaded snapshot.
run('App.state.users.p.stockPortfolio.shortPositions.alpha.quantity=5');
assert.equal(run("Configurator.collectEntity('players',document.getElementById('config-editor-form')).stockPortfolio.shortPositions.alpha.quantity"),5);
run('App.state.users.p.stockPortfolio.shortPositions.alpha.quantity=4');
panel.querySelector('[data-stock-config-delete-v213]').click();await pause();
assert.equal(Object.keys(w.serverProfile.stockPortfolio.shortPositions).length,0);
// The service supplies the authoritative player version. Reject an older late response.
run(`PlayerSync.applyRemoteRow({playerId:'p',version:20,player:{id:'p',role:'player',credits:1000,stockPortfolio:{positions:{alpha:{itemId:'alpha',knownQty:7,costBasis:700,margin:700}},shortPositions:{},ledger:[]}}},{authoritative:true});`);
w.electronAPI.getStockExchange=async()=>({ok:true,playerVersion:19,player:structuredClone(w.serverProfile)});
field('refresh').click();await pause();
assert.equal(run('App.state.users.p.stockPortfolio.positions.alpha.knownQty'),7);
assert.match(panel.querySelector('[data-stock-config-list-v213]').textContent,/7 шт/);
// Credit grant reads the lexical Sync configuration. A stale blank-campaign retry is replaced.
assert.equal(w.Sync,undefined);
run(`Sync.config={enabled:true,campaignId:'backend'};PlayerSync.shouldIsolateUsersFromSnapshot=()=>true;
 PlayerSync.applyRemoteRow=row=>{App.state.users[row.playerId].credits=row.player.credits;};
 localStorage.setItem('grpg-credit-grants-v138',JSON.stringify({p:{operationId:'stale',amount:25,campaignId:''}}));`);
w.creditRequests=[];
w.electronAPI.patchPlayer=async body=>{w.creditRequests.push(body);return {ok:true,row:{playerId:'p',player:{id:'p',credits:1025}}};};
const granted=await run("GRPGFeaturePackV138.grantCredits('p',25)");assert.equal(granted.ok,true);
assert.equal(w.creditRequests[0].creditGrantV138.campaignId,'backend');assert.notEqual(w.creditRequests[0].operationId,'stale');
assert.equal(run('App.state.users.p.credits'),1025);
assert.deepEqual(errors,[]);
console.log('PASS full renderer DOM: stock editor below inventory, leveraged short grant/edit/delete, preserved live portfolio on character save, lexical campaign and stale credit retry');
} finally {await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}
