'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const codec=require('../renderer/world-sync-v301.js'),clean=require('../renderer/player-credentials-v212.js').clean;
const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE campaign_snapshots(id TEXT PRIMARY KEY,campaignId TEXT UNIQUE,worldJson TEXT,stateJson TEXT,revision INTEGER,updated TEXT,updatedBy TEXT,clientUpdatedAt TEXT)');
let writes=0,failSave=false;
function query(sql){let args={};const statement=()=>db.prepare(sql.replace(/\{:([a-zA-Z0-9_]+)\}/g,':$1'));return {bind(value){args=value;return this;},execute(){writes++;return statement().run(args);},all(out){out.push(...statement().all(args));},one(out){const row=statement().get(args);if(!row)throw Error('sql: no rows');Object.assign(out,row);}};}
function record(row){return row&&{id:row.id,getString(key){const value=row[key];return typeof value==='string'?value:JSON.stringify(value??{});},getInt:key=>Number(row[key]||0),set(key,value){row[key]=value;},collection:()=>({viewRule:'view',updateRule:'update'}),row};}
const app={db:()=>({newQuery:query}),runInTransaction(fn){db.exec('BEGIN');try{const result=fn(app);db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}},findRecordsByFilter(name,filter,sort,limit,offset,args){assert.equal(name,'campaign_snapshots');const row=db.prepare('SELECT * FROM campaign_snapshots WHERE campaignId=?').get(args.campaign);return row?[record(row)]:[];},canAccessRecord(record,info){return !info.deny;},save(r){if(failSave)throw Error('injected save failure');const row=r.row;db.prepare('UPDATE campaign_snapshots SET worldJson=?,stateJson=?,revision=?,updated=?,updatedBy=?,clientUpdatedAt=? WHERE id=?').run(JSON.stringify(clean(row.worldJson)),JSON.stringify(clean(row.stateJson)),row.revision,'now',row.updatedBy,row.clientUpdatedAt,row.id);}};
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
 server.bootstrap(event({}));
 const initial=invoke('pull',{campaignId:'main',since:0,epoch:''});
 assert(initial.reset);assert.equal(initial.remote.revision,5);assert(initial.changes.length>1200);
 const documents=new Map(initial.changes.filter(row=>!row.deleted).map(row=>[row.key,row.data]));
 assert.deepEqual(codec.unpack(documents),clean({world,state}));
 const beforePoll=writes;const same=invoke('pull',{campaignId:'main',since:initial.seq,epoch:initial.epoch});assert.equal(same.changes.length,0);assert.equal(writes,beforePoll,'clean reads acquire no writer and do not rewrite index');
 assert.throws(()=>invoke('pull',{campaignId:'other',since:0}, {campaignId:'main'}),error=>error.status===403);
 assert.throws(()=>invoke('pull',{campaignId:'main'},null),error=>error.status===403);
 assert.throws(()=>invoke('pull',{campaignId:'main'},undefined,true),error=>error.status===403);
 const client=codec.createClient(),calls=[];
 const request=async(action,body)=>{calls.push(json({action,body}));return json(invoke(action,body));};
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
