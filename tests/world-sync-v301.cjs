'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const codec=require('../renderer/world-sync-v301.js'),clean=require('../renderer/player-credentials-v212.js').clean;
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE campaign_snapshots(id TEXT PRIMARY KEY,campaignId TEXT UNIQUE,worldJson TEXT,stateJson TEXT,revision INTEGER,updated TEXT,updatedBy TEXT,clientUpdatedAt TEXT)');
let writes=0,failSave=false,stripProof=false;
function query(sql){let args={};const statement=()=>db.prepare(sql.replace(/\{:([a-zA-Z0-9_]+)\}/g,':$1'));return {bind(value){args=value;return this;},execute(){writes++;return statement().run(args);},all(out){out.push(...statement().all(args));},one(out){const row=statement().get(args);if(!row)throw Error('sql: no rows');Object.assign(out,row);}};}
function record(row){return row&&{id:row.id,getString(key){const value=row[key];return typeof value==='string'?value:JSON.stringify(value??{});},getInt:key=>Number(row[key]||0),set(key,value){row[key]=value;},collection:()=>({viewRule:'view',updateRule:'update'}),row};}
const app={db:()=>({newQuery:query}),runInTransaction(fn){db.exec('BEGIN');try{const result=fn(app);db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}},findRecordsByFilter(name,filter,sort,limit,offset,args){assert.equal(name,'campaign_snapshots');const row=db.prepare('SELECT * FROM campaign_snapshots WHERE campaignId=?').get(args.campaign);return row?[record(row)]:[];},canAccessRecord(record,info){return !info.deny;},save(r){if(failSave)throw Error('injected save failure');const row=r.row,savedState=clean(row.stateJson);if(stripProof)delete savedState.__worldWriteV140;db.prepare('UPDATE campaign_snapshots SET worldJson=?,stateJson=?,revision=?,updated=?,updatedBy=?,clientUpdatedAt=? WHERE id=?').run(JSON.stringify(clean(row.worldJson)),JSON.stringify(savedState),row.revision,'now',row.updatedBy,row.clientUpdatedAt,row.id);}};
class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
class ForbiddenError extends ApiError{constructor(message){super(403,message);}}
class BadRequestError extends ApiError{constructor(message){super(400,message);}}
const auth={clean,actor(e){if(!e.who)throw new ForbiddenError('Missing session');return {getString:key=>e.who[key]||'',getBool:key=>!!e.who[key]};}};
const ctx={module:{exports:{}},require(name){if(name.endsWith('/world-sync-v301.js'))return codec;if(name.endsWith('/grpgi_auth_v212.js'))return auth;throw Error(name);},__hooks:'.',DynamicModel:class{constructor(data){Object.assign(this,data);}},arrayOf:()=>[],ApiError,ForbiddenError,BadRequestError,$security:{sha256:value=>crypto.createHash('sha256').update(value).digest('hex')}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../pocketbase/pb_hooks/grpgi_world_sync_v301.js'),'utf8'),ctx);const server=ctx.module.exports;
function event(body,who={campaignId:'main',dm:true},deny=false){return {app,who,requestInfo:()=>({body,deny}),json:(status,body)=>({status,body}),next(){}};}
function invoke(action,body,who,deny){return server[action](event(body,who,deny)).body;}
const json=value=>JSON.parse(JSON.stringify(value));
async function run(){
 const world={equipment:{EQUIPMENT:{},EQUIPMENT_LIST:[]},npcs:{NPCS:{}},campaigns:{RAIDS_V290:{main:{enabled:true}},ABERRATION_FORGE:{main:[{id:'recipe'}]}}};
 for(let i=0;i<600;i++){const item={id:'gun'+i,name:'Gun '+i,script:'-- '+ 'large script '.repeat(80),image:'https://assets.test/'+i+'.png'};world.equipment.EQUIPMENT[item.id]=item;world.equipment.EQUIPMENT_LIST.push(item);}
 const state={users:{gm:{id:'gm',role:'gm',password:'must be stripped'}},empty:[],nested:{empty:{}}};
 db.prepare('INSERT INTO campaign_snapshots VALUES (?,?,?,?,?,?,?,?)').run('snapshot','main',JSON.stringify(world),JSON.stringify(state),5,'old','gm','old');
 db.exec("CREATE TABLE grpgi_world_receipts_v301(campaign TEXT NOT NULL,operation TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(campaign,operation))");
 server.bootstrap(event({}));
 assert(db.prepare("SELECT name FROM pragma_table_info('grpgi_world_receipts_v301') WHERE name='timings'").get());
 const initial=invoke('pull',{campaignId:'main',since:0,epoch:''});
 assert(initial.reset);assert.equal(initial.remote.revision,5);assert(initial.changes.length>1200);
 const documents=new Map(initial.changes.filter(row=>!row.deleted).map(row=>[row.key,row.data]));
 assert.deepEqual(codec.unpack(documents),clean({world,state}));
 const beforePoll=writes;const same=invoke('pull',{campaignId:'main',since:initial.seq,epoch:initial.epoch});assert.equal(same.changes.length,0);assert.equal(writes,beforePoll,'clean reads acquire no writer and do not rewrite index');
 assert.throws(()=>invoke('pull',{campaignId:'other',since:0}, {campaignId:'main'}),error=>error.status===403);
 assert.throws(()=>invoke('pull',{campaignId:'main'},null),error=>error.status===403);
 assert.throws(()=>invoke('pull',{campaignId:'main'},undefined,true),error=>error.status===403);
 const client=codec.createClient(),calls=[];
 // Deterministic injected validation failures use a 400 response in this API adapter.
 const request=async(action,body)=>{calls.push(json({action,body}));try{return json(invoke(action,body));}catch(error){error.status=error.status||400;throw error;}};
 const pulled=await client.pull('session',request,'main');assert.equal(pulled.remote.world.equipment.EQUIPMENT.gun33.name,'Gun 33');
 const next=json(pulled.remote);next.world.equipment.EQUIPMENT.gun33.name='Edited';next.world.equipment.EQUIPMENT_LIST[33].name='Edited';
 const payload={world:next.world,state:next.state,baseRevision:5,updatedBy:'device'};
 const saved=await client.push('session',request,'main',payload,'operation-first');assert(saved.ok);assert.equal(saved.remote.revision,6);
 const sent=calls.at(-1).body;assert.equal(sent.changes.length,2,'one entity and its legacy list alias, not whole catalogue');
 assert(JSON.stringify(sent).length<JSON.stringify({world,state}).length/100,'wire payload stays small');
 const stored=json(db.prepare('SELECT worldJson FROM campaign_snapshots').get());assert.equal(JSON.parse(stored.worldJson).equipment.EQUIPMENT.gun33.name,'Edited');
 const replay=invoke('push',sent);assert.equal(replay.status,'replayed');assert.equal(db.prepare('SELECT revision FROM campaign_snapshots').get().revision,6,'lost response does not duplicate operation');
 assert.throws(()=>invoke('push',{...sent,changes:[]}),error=>error.status===400);
 assert.throws(()=>invoke('push',sent,{campaignId:'main',dm:false}),error=>error.status===403);
 const stale=invoke('push',{...sent,operationId:'operation-stale'});assert.equal(stale.status,'conflict');
 const current=await client.pull('session',request,'main');
 // A legacy raw SQL update with the SAME revision must still invalidate the index.
 const legacy=json(current.remote.world);delete legacy.equipment.EQUIPMENT.gun7;legacy.equipment.EQUIPMENT_LIST.splice(7,1);
 db.prepare('UPDATE campaign_snapshots SET worldJson=? WHERE campaignId=?').run(JSON.stringify(legacy),'main');
 const changed=await client.pull('session',request,'main');assert.equal(changed.changed,true,'raw SQL changes must reach Electron even at an equal revision');assert.equal(changed.remote.world.equipment.EQUIPMENT.gun7,undefined);assert.equal(changed.remote.revision,6);assert.equal(changed.remote.world.equipment.EQUIPMENT_LIST.length,599);
 const delta=invoke('pull',{campaignId:'main',epoch:initial.epoch,since:initial.seq});assert(delta.changes.some(row=>row.deleted),'deletion tombstones survive offline gaps');
 assert.equal(invoke('pull',{campaignId:'main',epoch:'wrong',since:999999}).reset,true);
 const indexBefore=db.prepare('SELECT * FROM grpgi_world_heads_v301').get();const snapshotBefore=db.prepare('SELECT * FROM campaign_snapshots').get();
 const modified=json(changed.remote);modified.world.equipment.EQUIPMENT.gun8.name='Never saved';failSave=true;
 await assert.rejects(client.push('session',request,'main',{...payload,world:modified.world,state:modified.state,baseRevision:6},'operation-failure'),/injected/);failSave=false;
 assert.deepEqual(db.prepare('SELECT * FROM campaign_snapshots').get(),snapshotBefore);assert.deepEqual(db.prepare('SELECT * FROM grpgi_world_heads_v301').get(),indexBefore);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM grpgi_world_receipts_v301 WHERE operation=?').get('operation-failure').n,0);
 // Check per-entity CAS independently of campaign revision.
 const badVersion={...calls.at(-1).body,operationId:'operation-bad-version'};badVersion.changes[0].version=999;assert.equal(invoke('push',badVersion).status,'conflict');
 const malformed={...calls.at(-1).body,operationId:'operation-malformed',changes:[{key:'[]',version:1,data:'{}'}]};assert.throws(()=>invoke('push',malformed),error=>error.status===400);
 db.exec("CREATE TRIGGER fail_world_receipt BEFORE INSERT ON grpgi_world_receipts_v301 WHEN NEW.operation='operation-after-save' BEGIN SELECT RAISE(ABORT,'receipt failure'); END");
 await assert.rejects(client.push('session',request,'main',{...payload,world:modified.world,state:modified.state,baseRevision:6},'operation-after-save'),/receipt failure/);
 assert.deepEqual(db.prepare('SELECT * FROM campaign_snapshots').get(),snapshotBefore,'snapshot rolls back after save');
 assert.deepEqual(db.prepare('SELECT * FROM grpgi_world_heads_v301').get(),indexBefore,'index and sequence roll back after save');
 db.exec('DROP TRIGGER fail_world_receipt');
 // Exercise the actual Electron transport functions against the same SQLite-backed routes.
 const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8'),network=[];
 const desktop={WorldSyncV301:codec,worldSyncClientV301:codec.createClient(),playerSessionV212:'desktop-session',DEFAULT_SYNC_TABLE:'campaign_snapshots',crypto,
  getPocketBaseBaseUrl:()=> 'https://sync.test',pocketbaseCollection:()=> 'campaign_snapshots',pocketbaseEq:()=>'',encodePathPart:encodeURIComponent,
  pocketbaseFetch:async(config,url,options)=>{network.push(url);return json(invoke(url.endsWith('/pull')?'pull':'push',options.json));},
  pocketbaseList:async(config,key,options)=>{assert(options.fields&&!options.fields.includes('worldJson'));return [db.prepare('SELECT id,campaignId,revision,updated,updatedBy,clientUpdatedAt FROM campaign_snapshots').get()];}
 };
 vm.createContext(desktop);vm.runInContext(main.slice(main.indexOf('function normalizePocketBaseSnapshotRecord('),main.indexOf('function normalizePocketBasePlayerRecord(')),desktop);
 const desktopConfig={campaignId:'main'},desktopFirst=await desktop.fetchPocketBaseSnapshot(desktopConfig,{includePayload:true});
 assert.equal(desktopFirst.remote.world.equipment.EQUIPMENT.gun33.name,'Edited');
 const desktopMeta=await desktop.fetchPocketBaseSnapshot(desktopConfig,{includePayload:false});assert.equal(desktopMeta.remote.world,null);
 const desktopWorld=json(desktopFirst.remote.world);desktopWorld.npcs.NPCS.new_npc={id:'new_npc',name:'Test'};
 const desktopSaved=await desktop.pushPocketBaseSnapshot(desktopConfig,{world:desktopWorld,state:desktopFirst.remote.state,baseRevision:6,updatedBy:'desktop'});
 assert(desktopSaved.ok);assert.equal(desktopSaved.remote.revision,7);assert.equal(desktopSaved.remote.world,null);
 const desktopLatest=await desktop.fetchPocketBaseSnapshot(desktopConfig,{includePayload:true});assert.equal(desktopLatest.remote.world.npcs.NPCS.new_npc.name,'Test');
 assert(network.every(url=>url.includes('/world-v301/')),'Electron uses no legacy full snapshot read or write');
 // A pull during editing must not turn stale local fields into intended changes.
 const editorA=codec.createClient(),editorB=codec.createClient();
 const aBase=await editorA.pull('a',request,'main'),bBase=await editorB.pull('b',request,'main');
 const aIntent=json(aBase.remote),bIntent=json(bBase.remote);
 aIntent.world.equipment.EQUIPMENT.gun1.name='Editor A';bIntent.world.equipment.EQUIPMENT.gun2.name='Editor B';
 const aSaved=await editorA.push('a',request,'main',{world:aIntent.world,state:aIntent.state,baseRevision:7},'operation-editor-a');assert(aSaved.ok);
 const bRefreshed=await editorB.pull('b',request,'main');
 const bSaved=await editorB.push('b',request,'main',{world:bIntent.world,state:bIntent.state,baseRevision:bRefreshed.remote.revision,intentBaseRevision:7},'operation-editor-b');assert(bSaved.ok);
 assert.equal(bSaved.canonicalWorldPatch.equipment.EQUIPMENT.gun1.name,'Editor A','canonical result preserves another editor');
 const merged=JSON.parse(db.prepare('SELECT worldJson FROM campaign_snapshots').get().worldJson);assert.equal(merged.equipment.EQUIPMENT.gun1.name,'Editor A');assert.equal(merged.equipment.EQUIPMENT.gun2.name,'Editor B');
 const conflictEditor=codec.createClient(),conflictBase=await conflictEditor.pull('c',request,'main'),conflictIntent=json(conflictBase.remote);
 conflictIntent.world.equipment.EQUIPMENT.gun1.name='Conflicting edit';
 const outside=json(conflictBase.remote.world);outside.equipment.EQUIPMENT.gun1.name='New server edit';db.prepare('UPDATE campaign_snapshots SET worldJson=?,revision=revision+1').run(JSON.stringify(outside));
 const conflictCurrent=await conflictEditor.pull('c',request,'main');
 const conflict=await conflictEditor.push('c',request,'main',{world:conflictIntent.world,state:conflictIntent.state,baseRevision:conflictCurrent.remote.revision,intentBaseRevision:conflictBase.remote.revision},'operation-editor-conflict');assert.equal(conflict.status,'conflict');
 assert.equal(JSON.parse(db.prepare('SELECT worldJson FROM campaign_snapshots').get().worldJson).equipment.EQUIPMENT.gun1.name,'New server edit');
 // Regression: a WC save must not conflict with GG's unrelated state/proof update.
 const seedState=JSON.parse(db.prepare('SELECT stateJson FROM campaign_snapshots').get().stateJson);
 seedState.meta={lastUpdatedAt:'baseline'};seedState.__worldWriteV140={createdAt:'baseline',reason:'state-save'};
 db.prepare('UPDATE campaign_snapshots SET stateJson=?,revision=revision+1').run(JSON.stringify(seedState));
 const wc=codec.createClient(),wcBase=await wc.pull('wc',request,'main'),wcIntent=json(wcBase.remote);
 const gg=json(wcBase.remote.state);gg.meta.lastUpdatedAt='GG-new';gg.__worldWriteV140.createdAt='GG-new';gg.users.gm.credits=42;
 db.prepare('UPDATE campaign_snapshots SET stateJson=?,revision=revision+1').run(JSON.stringify(gg));
 const fresh=await wc.pull('wc',request,'main');
 wcIntent.world.equipment.EQUIPMENT.gun3.name='WC after GG';wcIntent.state.meta.lastUpdatedAt='local-clock';wcIntent.state.users.gm.credits=-999;
 wcIntent.state.__worldWriteV140={createdAt:'new-WC-proof',reason:'world-config-save'};
 const unscoped=await wc.push('wc',request,'main',{world:wcIntent.world,state:wcIntent.state,baseRevision:fresh.remote.revision,intentBaseRevision:wcBase.remote.revision},'operation-wc-unscoped');
 assert.equal(unscoped.status,'conflict');assert.equal(unscoped.conflict.path[0],'state','reproduced false conflict before scoping');
 const wcSaved=await wc.push('wc',request,'main',{world:wcIntent.world,state:wcIntent.state,worldScope:['equipment'],baseRevision:fresh.remote.revision,intentBaseRevision:wcBase.remote.revision},'operation-wc-after-gg');
 assert.equal(wcSaved.ok,true,wcSaved.message);
 const wcSent=calls.at(-1).body;assert(wcSent.changes.every(change=>{const path=JSON.parse(change.key);return path[0]==='world'&&(!path[1]||path[1]==='equipment')||path[0]==='state'&&(path.length===1||path[1]==='__worldWriteV140');}));
 const afterWc=JSON.parse(db.prepare('SELECT stateJson FROM campaign_snapshots').get().stateJson);
 assert.equal(afterWc.meta.lastUpdatedAt,'GG-new');assert.equal(afterWc.users.gm.credits,42);assert.equal(afterWc.__worldWriteV140.createdAt,'new-WC-proof');
 assert.equal(JSON.parse(db.prepare('SELECT worldJson FROM campaign_snapshots').get().worldJson).equipment.EQUIPMENT.gun3.name,'WC after GG');
 assert(Array.isArray(conflict.conflict.path));assert(conflict.conflict.actualVersion>conflict.conflict.expectedVersion);
 // Real receipt recovery: server commits, network drops the response, then the app restarts.
 const os=require('node:os'),folder=fs.mkdtempSync(path.join(os.tmpdir(),'world-pending-303-'));
 const pendingFile=path.join(folder,'pending.json');
 const disk={loadPending:async()=>fs.existsSync(pendingFile)?JSON.parse(fs.readFileSync(pendingFile,'utf8')):null,savePending:async(key,value)=>{if(value){fs.writeFileSync(pendingFile+'.tmp',JSON.stringify(value));fs.renameSync(pendingFile+'.tmp',pendingFile);}else if(fs.existsSync(pendingFile))fs.unlinkSync(pendingFile);}};
 try{
  stripProof=true; // Match the installed legacy integrity hook's removal of the write marker.
  const transportCalls=[];let loss='after';
  const unreliable=async(action,body)=>{
   transportCalls.push(json({action,body}));
   if(action==='push'&&loss==='before'){loss='';throw Error('PocketBase timeout before processing');}
   const result=json(invoke(action==='status'?'operationStatus':action,body));
   if(action==='push'&&loss==='after'){loss='';throw Error('PocketBase timeout after commit');}
   return result;
  };
  const firstProcess=codec.createClient(disk),firstBase=await firstProcess.pull('gm',unreliable,'main'),lostIntent=json(firstBase.remote);
  lostIntent.world.equipment.EQUIPMENT.gun4.name='Committed before timeout';
  const lost=await firstProcess.push('gm',unreliable,'main',{world:lostIntent.world,state:lostIntent.state,baseRevision:firstBase.remote.revision,localEditVersion:3,worldScope:['equipment']},'operation-lost-response');
  assert.equal(lost.status,'pending');assert.equal(lost.operationId,'operation-lost-response');assert(fs.existsSync(pendingFile));
  const pushes=transportCalls.filter(row=>row.action==='push').length;
  const blocked=await firstProcess.push('gm',unreliable,'main',{world:{},state:{},baseRevision:0},'operation-must-not-send');assert.equal(blocked.status,'pending');
  assert.equal(transportCalls.filter(row=>row.action==='push').length,pushes,'unknown outcome blocks new operation IDs');
  const restarted=codec.createClient(disk),recovered=await restarted.pull('gm',unreliable,'main');
  assert.equal(recovered.recovered.operationId,'operation-lost-response');assert.equal(recovered.recovered.localEditVersion,3);
  assert.equal(recovered.remote.world.equipment.EQUIPMENT.gun4.name,'Committed before timeout');assert.equal(recovered.remote.state.__worldWriteV140,undefined);assert(!fs.existsSync(pendingFile));
  assert.equal(transportCalls.filter(row=>row.action==='push').length,pushes,'confirmed write is never replayed');
  assert.equal(typeof recovered.serverTimings.saveSnapshotMs,'number');assert.equal(typeof recovered.serverTimings.indexAfterMs,'number');
  assert.throws(()=>invoke('operationStatus',{campaignId:'main',operationId:'operation-lost-response'},{campaignId:'other',dm:true}),error=>error.status===403);
  assert.throws(()=>invoke('operationStatus',{campaignId:'main',operationId:'operation-lost-response'},{campaignId:'main',dm:false}),error=>error.status===403);
  const retryIntent=json(recovered.remote);retryIntent.world.equipment.EQUIPMENT.gun5.name='Explicit retry';loss='before';
  const unsent=await restarted.push('gm',unreliable,'main',{world:retryIntent.world,state:retryIntent.state,baseRevision:recovered.remote.revision,localEditVersion:4},'operation-unsent');assert.equal(unsent.status,'pending');
  const originalBody=JSON.parse(fs.readFileSync(pendingFile,'utf8')).body;
  assert.equal((await restarted.pull('gm',unreliable,'main')).status,'pending','unconfirmed never means not saved');
  assert.equal(transportCalls.filter(row=>row.action==='push').length,pushes+1,'poll does not retry writes');
  const secondRestart=codec.createClient(disk),retried=await secondRestart.pull('gm',unreliable,'main',{retryPending:true});assert(retried.ok);assert.equal(retried.remote.world.equipment.EQUIPMENT.gun5.name,'Explicit retry');
  assert.deepEqual(transportCalls.filter(row=>row.action==='push').at(-1).body,originalBody,'retry sends identical body and ID after restart');
  let sentWithoutJournal=false;
  const brokenJournal=codec.createClient({loadPending:async()=>null,savePending:async()=>{throw Error('disk full');}});
  await brokenJournal.pull('disk',unreliable,'main');
  await assert.rejects(brokenJournal.push('disk',async()=>{sentWithoutJournal=true;},'main',{world:retried.remote.world,state:retried.remote.state,baseRevision:retried.remote.revision},'operation-disk-full'),/disk full/);assert.equal(sentWithoutJournal,false);
  let releaseNetwork,settledResolve;const settled=new Promise(resolve=>{settledResolve=resolve;});
  const backgroundRequest=async(action,body)=>action==='push'?new Promise(resolve=>{releaseNetwork=()=>resolve(json(invoke('push',body)));}):json(invoke(action==='status'?'operationStatus':action,body));
  const background=codec.createClient({...disk,backgroundWrites:true,onPendingSettled:()=>settledResolve()});
  const bgBase=await background.pull('bg',backgroundRequest,'main'),bgIntent=json(bgBase.remote);bgIntent.world.equipment.EQUIPMENT.gun6.name='Background write';
  let returned=false;const queued=background.push('bg',backgroundRequest,'main',{world:bgIntent.world,state:bgIntent.state,baseRevision:bgBase.remote.revision,worldScope:['equipment'],localEditVersion:5},'operation-background').then(result=>{returned=true;return result;});
  await new Promise(resolve=>setImmediate(resolve));
  assert(returned,'durably queued WC save returns before the network completes');assert.equal((await queued).status,'pending');assert(fs.existsSync(pendingFile));
  assert.equal(JSON.parse(db.prepare('SELECT worldJson FROM campaign_snapshots').get().worldJson).equipment.EQUIPMENT.gun6.name,bgBase.remote.world.equipment.EQUIPMENT.gun6.name);
  releaseNetwork();await settled;
  const bgConfirmed=await background.pull('bg',backgroundRequest,'main');assert.equal(bgConfirmed.recovered.operationId,'operation-background');assert.equal(bgConfirmed.remote.world.equipment.EQUIPMENT.gun6.name,'Background write');assert(!fs.existsSync(pendingFile));
  const staleRetryClient=codec.createClient(disk),staleRetryBase=await staleRetryClient.pull('stale-retry',unreliable,'main');loss='before';
  assert.equal((await staleRetryClient.push('stale-retry',unreliable,'main',{world:staleRetryBase.remote.world,state:staleRetryBase.remote.state,baseRevision:staleRetryBase.remote.revision},'operation-stale-retry')).status,'pending');
  db.exec('UPDATE campaign_snapshots SET revision=revision+1');
  const rejectedRetry=await staleRetryClient.pull('stale-retry',unreliable,'main',{retryPending:true});assert.equal(rejectedRetry.status,'conflict');assert.equal(rejectedRetry.definitive,true);assert(!fs.existsSync(pendingFile));
  let failedSettled;const failureDone=new Promise(resolve=>{failedSettled=resolve;});
  const rejected=codec.createClient({...disk,backgroundWrites:true,onPendingSettled:()=>failedSettled()});
  const rejectRequest=async(action,body)=>action==='push'?{ok:false,status:'conflict',message:'Server conflict'}:json(invoke(action==='status'?'operationStatus':action,body));
  const rejectBase=await rejected.pull('reject',rejectRequest,'main');
  assert.equal((await rejected.push('reject',rejectRequest,'main',{world:rejectBase.remote.world,state:rejectBase.remote.state,baseRevision:rejectBase.remote.revision,worldScope:['equipment']},'operation-bg-rejected')).status,'pending');await failureDone;
  const rejectRestored=await codec.createClient(disk).pull('reject',rejectRequest,'main');assert.equal(rejectRestored.status,'conflict');assert.equal(rejectRestored.definitive,true);assert(!fs.existsSync(pendingFile));
  fs.writeFileSync(pendingFile,'{"schema":0}');
  await assert.rejects(codec.createClient(disk).pull('gm',unreliable,'main'),/Повреждён/);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
 // Delete/recreate resets the epoch so an old cursor cannot silently skip a new campaign.
 db.exec("DELETE FROM campaign_snapshots WHERE campaignId='main'");
 assert.equal(invoke('pull',{campaignId:'main',epoch:initial.epoch,since:initial.seq}).exists,false);
 db.prepare('INSERT INTO campaign_snapshots VALUES (?,?,?,?,?,?,?,?)').run('replacement','main','{}','{}',1,'new','gm','new');
 const replacement=invoke('pull',{campaignId:'main',epoch:initial.epoch,since:initial.seq});assert(replacement.reset);assert.notEqual(replacement.epoch,initial.epoch);
 const offline=codec.createClient();let attempts=0;
 const missing=async()=>{attempts++;throw Object.assign(Error('missing route'),{status:404});};
 assert.equal(await offline.pull('old',missing,'main'),null);assert.equal(await offline.pull('old',missing,'main'),null);assert.equal(attempts,1,'old servers probed once per session');
 const broken=codec.createClient();await assert.rejects(broken.pull('new',async()=>{throw Object.assign(Error('timeout'),{status:503});},'main'),/timeout/);
 assert.deepEqual(codec.unpack(codec.pack({world:{a:[],b:{},c:null},state:{list:[false,0,'',null]}})),{world:{a:[],b:{},c:null},state:{list:[false,0,'',null]}});
 assert.throws(()=>codec.pack(JSON.parse('{"__proto__":{"polluted":true}}')),/Unsafe/);
 assert.equal({}.polluted,undefined);
 for(const file of ['deploy/site/app/world-sync-v301.js','pocketbase/pb_hooks/world-sync-v301.js'])assert.equal(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),fs.readFileSync(path.join(__dirname,'../renderer/world-sync-v301.js'),'utf8'));
 console.log('PASS world entity sync: real SQLite triggers, two-record edit, small wire payload, auth, CAS, receipts, rollback, legacy writes, deletions, epochs, exact reconstruction and safe fallback');
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
