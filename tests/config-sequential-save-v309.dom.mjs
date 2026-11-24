// npm install --prefix /tmp/grpgi-test-dom happy-dom
// HAPPY_DOM_MODULE=/tmp/grpgi-test-dom/node_modules/happy-dom/lib/index.js node tests/v134-world-config-full-load.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
import codec from '../renderer/world-sync-v301.js';
const {Window}=await import(process.env.HAPPY_DOM_MODULE?pathToFileURL(process.env.HAPPY_DOM_MODULE):'happy-dom');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-submit309-'));
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

// Reuse the SQLite boundary fixture; run the real server routes, codec, main IPC
// handlers and every renderer wrapper. No save/apply/confirmation logic is stubbed.
const sqlTest=path.join(root,'tests/world-sync-v301.cjs'),fixture=fs.readFileSync(sqlTest,'utf8').split('async function run(){')[0];
const sql=Function('require','__dirname',fixture+'\nstripProof=true;return {db,invoke,server,event};')(createRequire(sqlTest),path.dirname(sqlTest));
const stateFile=path.join(scratch,'state.json'),pendingFile=path.join(scratch,'pending.json');
w.electronAPI.loadState=async()=>fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):null;
w.electronAPI.saveState=async state=>{fs.writeFileSync(stateFile,JSON.stringify(state));return{ok:true};};
w.electronAPI.saveWorldSections=async patch=>{
 const file=path.join(scratch,'world.json'),world=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 Object.assign(world,patch);fs.writeFileSync(file,JSON.stringify(world));return{ok:true,world:structuredClone(patch)};
};
let release=null,hold=true,operation=0;const sent=[];
const request=async(action,body)=>{
 if(action==='push'){
  sent.push(structuredClone(body));
  if(hold){hold=false;return new Promise(resolve=>{release=()=>resolve(sql.invoke('push',body));});}
 }
 return sql.invoke(action==='status'?'operationStatus':action,body);
};
const client=codec.createClient({backgroundWrites:true,loadPending:async()=>fs.existsSync(pendingFile)?JSON.parse(fs.readFileSync(pendingFile,'utf8')):null,savePending:async(key,value)=>{if(value)fs.writeFileSync(pendingFile,JSON.stringify(value));else if(fs.existsSync(pendingFile))fs.unlinkSync(pendingFile);}});
const config={enabled:true,provider:'pocketbase',url:'https://sync.test',campaignId:'main',deviceLabel:'test'};
const main=fs.readFileSync(path.join(root,'main.js'),'utf8'),handlers=new Map();
const mainCtx={console,Date,Object,Array,JSON,process,crypto,debugLog(){},WORLD_FILE_NAMES:['players','skills'],
 ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},loadSyncConfig:async()=>config,
 fetchRemoteSnapshot:async(config,options={})=>client.pull('test',request,'main',{force:options.force,retryPending:options.retryPending}),
 validateSyncBaselineGuard:(config,token,revision)=>({ok:true,guard:{revision},token}),createSyncBaselineGuard:(config,revision)=>'token-'+revision,
 invalidateSyncBaselineGuards(){},backupRemoteSnapshotBeforeGmWrite:async()=>'/backup',
 normalizeSnapshotImagesForCloud:async(config,snapshot)=>structuredClone(snapshot),
 pushRemoteSnapshot:async(config,payload)=>client.push('test',request,'main',payload,'operation-'+(++operation)),
 writeWorldSectionsV300:patch=>w.electronAPI.saveWorldSections(patch),writeWorldData:world=>w.electronAPI.saveWorldData(world),notifyPlayerDisplayDataChanged(){}
};
vm.createContext(mainCtx);
vm.runInContext(main.slice(main.indexOf("ipcMain.handle('sync:pull'"),main.indexOf("ipcMain.handle('chat:pull'")),mainCtx);
w.electronAPI.pullSync=payload=>handlers.get('sync:pull')(null,payload);
w.electronAPI.pushSync=payload=>handlers.get('sync:push')(null,payload);
run(`
 App.state=makeDefaultState();App.currentUserId='gm';UI.activeModuleId='sync';
 Sync.render=()=>{};Sync.refreshChip=()=>{};Sync.beginDataTransfer=()=>{};Sync.endDataTransfer=()=>{};
 Sync.config={enabled:true,provider:'pocketbase',campaignId:'main',url:'https://sync.test'};Sync.loadConfig=async function(){return this.config;};
 PlayerSync.shouldIsolateUsersFromSnapshot=()=>false;
 window.notices=[];Toast.show=(message,type)=>window.notices.push({message,type});
`);
const world={players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm',displayName:'DM'}}},skills:{SKILLS:{a:{id:'a',name:'First',description:'Original A'},b:{id:'b',name:'Second',description:'Original B'}}}},state={users:{gm:{id:'gm',role:'gm',displayName:'DM'}},meta:{sync:{remoteRevision:0}}};
sql.db.prepare('INSERT INTO campaign_snapshots VALUES (?,?,?,?,?,?,?,?)').run('snapshot','main',JSON.stringify(world),JSON.stringify(state),1,'initial','gm','initial');sql.server.bootstrap(sql.event({}));
const currentWorld=()=>JSON.parse(sql.db.prepare('SELECT worldJson FROM campaign_snapshots').get().worldJson);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function edit(id,text){
 run(`UI.activeModuleId='config';Configurator.selectedType='skills';Configurator.selectedId=${JSON.stringify(id)};Configurator.render();`);
 const form=w.document.getElementById('config-editor-form');assert(form);const field=form.querySelector('[name=description]');assert(field);field.value=text;field.dispatchEvent(new w.Event('input',{bubbles:true}));field.focus();w.form309=form;return form;
}
const submit=()=>run('Configurator.submit({preventDefault(){},currentTarget:form309})');
try{
 await run("Sync.checkForRemoteUpdates('startup',{force:true,silent:true})");
 edit('a','Saved A');await submit();assert.equal(sent.length,1);assert.equal(run('App.state.meta.sync.pendingOperationId'),'operation-1');
 const secondForm=edit('b','Saved B');const second=submit();await tick();assert.equal(sent.length,1,'never send second operation before resolving first');
 assert.equal(secondForm.querySelector('[name=description]').value,'Saved B');
 release();const unrelated=currentWorld();unrelated.skills.SKILLS.b.name='Other editor name';sql.db.prepare('UPDATE campaign_snapshots SET worldJson=?,revision=revision+1').run(JSON.stringify(unrelated));await second;await tick();
 assert.equal(sent.length,2,'one click submits second skill after receipt without retyping');
 assert.equal(currentWorld().skills.SKILLS.a.description,'Saved A');assert.equal(currentWorld().skills.SKILLS.b.description,'Saved B');assert.equal(currentWorld().skills.SKILLS.b.name,'Other editor name');assert.equal(w.document.querySelector('#config-editor-form [name=name]').value,'Other editor name');
 assert.equal(JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8')).skills.SKILLS.b.description,'Saved B');
 assert(!w.notices.some(row=>row.message.includes('Проверьте форму перед новым сохранением')));
 w.document.activeElement?.blur();await run("Sync.checkForRemoteUpdates('confirm-second',{silent:true})");assert.equal(run('App.state.meta.sync.localDirty'),false);
 // Wait expiry retains the submitted form durably; the next click needs no re-entry.
 hold=true;edit('a','Next A');await submit();const waitingForm=edit('b','Next B');
 const now=w.Date.now;let clock=now();w.Date.now=()=>clock+=31000;await submit();w.Date.now=now;
 assert.equal(sent.length,3);assert.equal(waitingForm.querySelector('[name=description]').value,'Next B');
 const durableKey=run("FormDrafts.durableKeyV309(FormDrafts.configKey('skills','b'))");assert.equal(JSON.parse(w.localStorage.getItem(durableKey)).description,'Next B');
 run("FormDrafts.store={};Configurator.render();");assert.equal(w.document.querySelector('#config-editor-form [name=description]').value,'Next B','render restores persisted submitted draft');
 w.form309=w.document.getElementById('config-editor-form');release();await tick();await submit();await tick();
 assert.equal(sent.length,4);assert.equal(currentWorld().skills.SKILLS.a.description,'Next A');assert.equal(currentWorld().skills.SKILLS.b.description,'Next B');
 assert.equal(w.localStorage.getItem(durableKey),null,'clear only after local persistence');
 w.document.activeElement?.blur();await run("Sync.checkForRemoteUpdates('confirm-fourth',{silent:true})");
 // Typing after pressing Save creates a newer draft, not data that an old
 // acknowledgement may silently discard or replace with the earlier click.
 hold=true;edit('a','A before newer draft');await submit();edit('b','Earlier clicked B');
 const newer=submit();await tick();const field=w.form309.querySelector('[name=description]');field.value='Typed B during wait';field.dispatchEvent(new w.Event('input',{bubbles:true}));release();await newer;await tick();
 assert.equal(sent.length,5);assert.equal(JSON.parse(w.localStorage.getItem(durableKey)).description,'Typed B during wait');
 assert.equal(w.document.querySelector('#config-editor-form [name=description]').value,'Typed B during wait');
 w.form309=w.document.getElementById('config-editor-form');await submit();await tick();assert.equal(sent.length,6);assert.equal(currentWorld().skills.SKILLS.b.description,'Typed B during wait');
 w.document.activeElement?.blur();await run("Sync.checkForRemoteUpdates('confirm-newer',{silent:true})");
 // A real concurrent edit of the same field must retain the draft and reject it.
 hold=true;edit('a','Third A');await submit();edit('b','Conflicting B');const conflict=submit();await tick();release();
 const concurrent=currentWorld();concurrent.skills.SKILLS.b.description='Other editor B';sql.db.prepare('UPDATE campaign_snapshots SET worldJson=?,revision=revision+1').run(JSON.stringify(concurrent));
 await conflict;await tick();assert.equal(sent.length,7,'same-field conflict cannot submit a replacement operation');
 assert.equal(currentWorld().skills.SKILLS.b.description,'Other editor B');assert.equal(JSON.parse(w.localStorage.getItem(durableKey)).description,'Conflicting B');
 assert(w.notices.some(row=>row.type==='err'&&row.message.includes('description')));
 // Submitted drafts never cross connections or users.
 w.document.activeElement?.blur();run("Sync.config={...Sync.config,campaignId:'another'};FormDrafts.store={};Configurator.render();");
 assert.notEqual(w.document.querySelector('#config-editor-form [name=description]').value,'Conflicting B');
 const beforeStorageFailure=sent.length;edit('b','Cannot store');const storageDescriptor=Object.getOwnPropertyDescriptor(w,'localStorage'),storage=w.localStorage;
 Object.defineProperty(w,'localStorage',{configurable:true,value:{getItem:storage.getItem.bind(storage),removeItem:storage.removeItem.bind(storage),setItem(){throw Error('draft storage unavailable');}}});
 await submit();Object.defineProperty(w,'localStorage',storageDescriptor);
 assert.equal(sent.length,beforeStorageFailure);assert(w.notices.some(row=>row.type==='err'&&row.message.includes('draft storage unavailable')));
 console.log('PASS real sequential skill saves: SQLite routes + codec + main IPC + complete renderer, pending receipt, focused form, automatic continuation, durable draft/timeout/retry, same-field conflict and context isolation');
}finally{sql.db.close();await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}
process.exit(0);
