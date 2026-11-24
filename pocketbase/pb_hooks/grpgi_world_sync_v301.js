'use strict';
const codec=require(__hooks+'/world-sync-v301.js');
function query(app,sql,args){return app.db().newQuery(sql).bind(args||{});}
function all(app,sql,args,shape){const rows=arrayOf(new DynamicModel(shape));query(app,sql,args).all(rows);return rows;}
function head(app,campaign){return all(app,'SELECT * FROM grpgi_world_heads_v301 WHERE campaign={:campaign}',{campaign},{campaign:'',epoch:'',dirty:0,indexed:0,seq:0,remote:''})[0]||null;}
function rows(app,campaign,since){return all(app,'SELECT key,data,version,seq,deleted FROM grpgi_world_entities_v301 WHERE campaign={:campaign} AND seq>{:since} ORDER BY seq',{campaign,since},{key:'',data:'',version:0,seq:0,deleted:0});}
function snapshot(app,campaign){return app.findRecordsByFilter('campaign_snapshots','campaignId={:campaign}','',1,0,{campaign})[0]||null;}
function field(record,name){return JSON.parse(record.getString(name)||'{}');}
function metadata(record){return {_id:record.id,campaignId:record.getString('campaignId'),revision:record.getInt('revision'),updatedAt:record.getString('updated'),updatedBy:record.getString('updatedBy'),clientUpdatedAt:record.getString('clientUpdatedAt')};}
function bootstrap(e){
 e.next();const app=e.app;
 query(app,'CREATE TABLE IF NOT EXISTS grpgi_world_heads_v301(campaign TEXT PRIMARY KEY,epoch TEXT NOT NULL,dirty INTEGER NOT NULL DEFAULT 1,indexed INTEGER NOT NULL DEFAULT 0,seq INTEGER NOT NULL DEFAULT 0,remote TEXT NOT NULL DEFAULT \'{}\')').execute();
 query(app,'CREATE TABLE IF NOT EXISTS grpgi_world_entities_v301(campaign TEXT NOT NULL,key TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL,seq INTEGER NOT NULL,deleted INTEGER NOT NULL,PRIMARY KEY(campaign,key))').execute();
 query(app,'CREATE INDEX IF NOT EXISTS grpgi_world_changes_v301 ON grpgi_world_entities_v301(campaign,seq)').execute();
 query(app,'CREATE TABLE IF NOT EXISTS grpgi_world_receipts_v301(campaign TEXT NOT NULL,operation TEXT NOT NULL,fingerprint TEXT NOT NULL,timings TEXT NOT NULL DEFAULT \'{}\',PRIMARY KEY(campaign,operation))').execute();
 const timingColumn=all(app,"SELECT name FROM pragma_table_info('grpgi_world_receipts_v301') WHERE name='timings'",{}, {name:''});
 if(!timingColumn.length)query(app,"ALTER TABLE grpgi_world_receipts_v301 ADD COLUMN timings TEXT NOT NULL DEFAULT '{}' ").execute();
 query(app,'CREATE TABLE IF NOT EXISTS grpgi_world_sections_v305(campaign TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(campaign,key))').execute();
 // Rebuild once after startup, including when the credential cleaning policy changes.
 query(app,'DELETE FROM grpgi_world_sections_v305').execute();
 const exists=all(app,"SELECT name FROM sqlite_master WHERE type='table' AND name='campaign_snapshots'",{}, {name:''});if(!exists.length)return;
 // SQL triggers cover legacy routes, stock ticks and direct SQL writes in the same transaction.
 const touch="INSERT INTO grpgi_world_heads_v301(campaign,epoch) VALUES(NEW.campaignId,lower(hex(randomblob(16)))) ON CONFLICT(campaign) DO UPDATE SET dirty=dirty+1;";
 query(app,'CREATE TRIGGER IF NOT EXISTS grpgi_world_insert_v301 AFTER INSERT ON campaign_snapshots BEGIN '+touch+' END').execute();
 query(app,'CREATE TRIGGER IF NOT EXISTS grpgi_world_update_v301 AFTER UPDATE ON campaign_snapshots BEGIN '+touch+' END').execute();
 query(app,'CREATE TRIGGER IF NOT EXISTS grpgi_world_delete_v301 AFTER DELETE ON campaign_snapshots BEGIN DELETE FROM grpgi_world_entities_v301 WHERE campaign=OLD.campaignId; DELETE FROM grpgi_world_receipts_v301 WHERE campaign=OLD.campaignId; DELETE FROM grpgi_world_heads_v301 WHERE campaign=OLD.campaignId; END').execute();
 query(app,'CREATE TRIGGER IF NOT EXISTS grpgi_world_sections_delete_v305 AFTER DELETE ON campaign_snapshots BEGIN DELETE FROM grpgi_world_sections_v305 WHERE campaign=OLD.campaignId; END').execute();
 query(app,'INSERT OR IGNORE INTO grpgi_world_heads_v301(campaign,epoch) SELECT campaignId,lower(hex(randomblob(16))) FROM campaign_snapshots').execute();
 query(app,'UPDATE grpgi_world_heads_v301 SET dirty=dirty+1 WHERE campaign IN (SELECT campaignId FROM campaign_snapshots)').execute();
}
function write(app,campaign,fn){
 try{let result;app.runInTransaction(tx=>{
  // Reserve the writer before taking a read snapshot (avoids WAL BUSY_SNAPSHOT upgrades).
  query(tx,'UPDATE grpgi_world_heads_v301 SET dirty=dirty WHERE campaign={:campaign}',{campaign}).execute();
  result=fn(tx);
 });return result;}catch(error){if(/database is locked|SQLITE_BUSY/i.test(String(error)))throw new ApiError(503,'База занята. Повторите синхронизацию.');throw error;}
}
// Build exactly the legacy codec index, reusing documents only for sections whose
// raw persisted value has not changed. Fingerprints contain no plaintext secrets.
function sectionIndex(raw,previous,cached,auth,stats){
 const shape={},fingerprints=new Map(),unchanged=new Set();
 stats.reusedSections=0;stats.packedSections=0;
 for(const root of ['world','state']){
  const value=raw[root];
  if(!value||typeof value!=='object'||Array.isArray(value)){
   stats.fullFallback=true;return {target:codec.pack(auth.clean(raw)),fingerprints};
  }
  shape[root]=Object.fromEntries(Object.keys(value).map(key=>[key,null]));
 }
 const safeShape=auth.clean(shape),target=new Map();
 // The three outer containers must always reflect added/removed section names.
 for(const [key,value] of codec.pack(safeShape))if(JSON.parse(key).length<2)target.set(key,value);
 for(const root of ['world','state'])for(const section of Object.keys(safeShape[root])){
  const key=JSON.stringify([root,section]),value=raw[root][section];
  const fingerprint=$security.sha256(JSON.stringify(value));fingerprints.set(key,fingerprint);
  if(cached.get(key)===fingerprint&&previous.has(key)&&!previous.get(key).deleted){unchanged.add(key);stats.reusedSections++;continue;}
  stats.packedSections++;
  for(const [doc,data] of codec.pack({[root]:{[section]:auth.clean(value)}}))if(JSON.parse(doc).length>=2)target.set(doc,data);
 }
 for(const [key,row] of previous){
  if(row.deleted)continue;
  const path=JSON.parse(key);
  if(path.length>=2&&unchanged.has(JSON.stringify(path.slice(0,2))))target.set(key,row.data);
 }
 if(target.size>200000)throw Error('World document limit exceeded');
 return {target,fingerprints};
}
function reconcile(app,campaign,stats={}){
 let phase=Date.now();const record=snapshot(app,campaign);if(!record)return null;
 let h=head(app,campaign);if(!h)throw new ApiError(503,'Индекс мира не инициализирован. Перезапустите PocketBase.');
 if(h.dirty===h.indexed){stats.clean=true;return h;}
 const raw={world:field(record,'worldJson'),state:field(record,'stateJson')};stats.loadParseMs=Date.now()-phase;phase=Date.now();
 const previous=new Map(rows(app,campaign,-1).map(row=>[row.key,row]));
 const cached=new Map(all(app,'SELECT key,fingerprint FROM grpgi_world_sections_v305 WHERE campaign={:campaign}',{campaign},{key:'',fingerprint:''}).map(row=>[row.key,row.fingerprint]));
 stats.readIndexMs=Date.now()-phase;phase=Date.now();
 const auth=require(__hooks+'/grpgi_auth_v212.js'),{target,fingerprints}=sectionIndex(raw,previous,cached,auth,stats);
 stats.planMs=Date.now()-phase;phase=Date.now();let seq=h.seq;stats.writtenDocuments=0;
 function save(key,data,deleted,old){
  query(app,'INSERT INTO grpgi_world_entities_v301(campaign,key,data,version,seq,deleted) VALUES({:campaign},{:key},{:data},{:version},{:seq},{:deleted}) ON CONFLICT(campaign,key) DO UPDATE SET data=excluded.data,version=excluded.version,seq=excluded.seq,deleted=excluded.deleted')
   .bind({campaign,key,data,version:(old?.version||0)+1,seq:++seq,deleted}).execute();stats.writtenDocuments++;
 }
 for(const [key,data] of target){const old=previous.get(key);if(!old||old.deleted||old.data!==data)save(key,data,0,old);}
 for(const [key,old] of previous)if(!old.deleted&&!target.has(key))save(key,'',1,old);
 for(const [key,fingerprint] of fingerprints)if(cached.get(key)!==fingerprint)query(app,'INSERT INTO grpgi_world_sections_v305(campaign,key,fingerprint) VALUES({:campaign},{:key},{:fingerprint}) ON CONFLICT(campaign,key) DO UPDATE SET fingerprint=excluded.fingerprint',{campaign,key,fingerprint}).execute();
 for(const key of cached.keys())if(!fingerprints.has(key))query(app,'DELETE FROM grpgi_world_sections_v305 WHERE campaign={:campaign} AND key={:key}',{campaign,key}).execute();
 query(app,'UPDATE grpgi_world_heads_v301 SET indexed=dirty,seq={:seq},remote={:remote} WHERE campaign={:campaign}',{campaign,seq,remote:JSON.stringify(metadata(record))}).execute();
 stats.writeIndexMs=Date.now()-phase;return head(app,campaign);
}
function envelope(app,campaign,epoch,since){
 const h=head(app,campaign);if(!h)return {ok:true,schema:301,exists:false};
 const reset=epoch!==h.epoch||!Number.isSafeInteger(since)||since<0||since>h.seq;
 return {ok:true,schema:301,exists:true,epoch:h.epoch,seq:h.seq,reset,remote:JSON.parse(h.remote),changes:rows(app,campaign,reset?-1:since).map(row=>({key:row.key,data:row.data,version:row.version,seq:row.seq,deleted:!!row.deleted}))};
}
function identity(e,body,dm){
 const user=require(__hooks+'/grpgi_auth_v212.js').actor(e),campaign=String(body.campaignId||'');
 if(!campaign||campaign!==user.getString('campaignId')||(dm&&!user.getBool('dm')))throw new ForbiddenError('Недостаточно прав для этой кампании');
 const record=snapshot(e.app,campaign);if(record&&!e.app.canAccessRecord(record,e.requestInfo(),dm?record.collection().updateRule:record.collection().viewRule))throw new ForbiddenError('Нет доступа к кампании');
 return {campaign,record};
}
function pull(e){
 const body=e.requestInfo().body||{},who=identity(e,body,false),campaign=who.campaign;
 if(!who.record)return e.json(200,{ok:true,schema:301,exists:false});
 // Consistent read transaction; clean reads do not acquire the SQLite writer.
 for(let attempt=0;attempt<3;attempt++){
  let result,dirty=false;
  e.app.runInTransaction(tx=>{const h=head(tx,campaign);dirty=!!h&&h.dirty!==h.indexed;if(!dirty)result=envelope(tx,campaign,body.epoch,body.since);});
  if(!dirty)return e.json(200,result);
  write(e.app,campaign,tx=>reconcile(tx,campaign));
 }
 throw new ApiError(503,'Мир обновляется. Повторите синхронизацию.');
}
function operationStatus(e){
 const body=e.requestInfo().body||{},campaign=identity(e,body,true).campaign;
 if(!/^[-a-zA-Z0-9_]{8,120}$/.test(String(body.operationId||'')))throw new BadRequestError('Некорректный ID операции');
 let result;
 e.app.runInTransaction(tx=>{
  const receipt=all(tx,'SELECT fingerprint,timings FROM grpgi_world_receipts_v301 WHERE campaign={:campaign} AND operation={:operation}',{campaign,operation:body.operationId},{fingerprint:'',timings:''})[0];
  result={ok:true,status:receipt?'committed':'unconfirmed',timings:receipt?JSON.parse(receipt.timings||'{}'):null};
 });return e.json(200,result);
}
function push(e){
 const started=Date.now(),timings={};
 const body=e.requestInfo().body||{},campaign=identity(e,body,true).campaign;
 if(!/^[-a-zA-Z0-9_]{8,120}$/.test(String(body.operationId||''))||!Number.isSafeInteger(body.baseRevision)||!Array.isArray(body.changes)||body.changes.length>100000||JSON.stringify(body.changes).length>16*1024*1024)throw new BadRequestError('Некорректная операция синхронизации');
 const fingerprint=$security.sha256(JSON.stringify([body.epoch,body.baseRevision,body.changes]));
 timings.authorizeMs=Date.now()-started;const transactionStarted=Date.now();
 const result=write(e.app,campaign,tx=>{
  timings.writerWaitMs=Date.now()-transactionStarted;let phase=Date.now();
  const h=reconcile(tx,campaign,timings.indexBefore={});if(!h)return {ok:false,status:'remote-empty-protected'};
  timings.indexBeforeMs=Date.now()-phase;phase=Date.now();
  const receipt=all(tx,'SELECT fingerprint FROM grpgi_world_receipts_v301 WHERE campaign={:campaign} AND operation={:operation}',{campaign,operation:body.operationId},{fingerprint:''})[0];
  if(receipt){if(receipt.fingerprint!==fingerprint)throw new BadRequestError('Идентификатор операции уже использован');return {...envelope(tx,campaign,body.epoch,body.since),status:'replayed'};}
  const record=snapshot(tx,campaign);
  if(!tx.canAccessRecord(record,e.requestInfo(),record.collection().updateRule))throw new ForbiddenError('Нет доступа к кампании');
  if(body.epoch!==h.epoch||body.baseRevision!==record.getInt('revision'))return {ok:false,status:'conflict',message:'Кампания уже изменена на сервере'};
  const stored=new Map(rows(tx,campaign,-1).map(row=>[row.key,row])),documents=new Map([...stored].filter(([,row])=>!row.deleted).map(([key,row])=>[key,row.data])),seen=new Set();
  for(const change of body.changes){
   if(!change||typeof change.key!=='string'||change.key.length>10000||seen.has(change.key)||!Number.isSafeInteger(change.version)||change.version<0||(!change.deleted&&typeof change.data!=='string'))throw new BadRequestError('Некорректная запись мира');
   let path;try{path=JSON.parse(change.key);}catch(error){throw new BadRequestError('Некорректный путь записи');}
   if(!Array.isArray(path)||path.length>4||path.some(part=>typeof part!=='string'))throw new BadRequestError('Некорректный путь записи');
   seen.add(change.key);const old=stored.get(change.key);
   if((old?.version||0)!==change.version)return {ok:false,status:'conflict',message:'Сущность уже изменена на сервере',conflict:{path,expectedVersion:change.version,actualVersion:old?.version||0}};
   if(change.deleted)documents.delete(change.key);else documents.set(change.key,change.data);
  }
  let data;try{data=codec.unpack(documents);}catch(error){throw new BadRequestError('Неполный набор изменений мира');}
  if(!data||Object.keys(data).sort().join(',')!=='state,world'||!data.world||!data.state||Array.isArray(data.world)||Array.isArray(data.state)||typeof data.world!=='object'||typeof data.state!=='object')throw new BadRequestError('Некорректная структура кампании');
  timings.applyMs=Date.now()-phase;
  if(body.changes.length){
   phase=Date.now();record.set('worldJson',data.world);record.set('stateJson',data.state);record.set('revision',record.getInt('revision')+1);
   record.set('updatedBy',String(body.updatedBy||'world-sync-v301').slice(0,200));record.set('clientUpdatedAt',new Date().toISOString());timings.prepareSnapshotMs=Date.now()-phase;phase=Date.now();tx.save(record);timings.saveSnapshotMs=Date.now()-phase;phase=Date.now();reconcile(tx,campaign,timings.indexAfter={});timings.indexAfterMs=Date.now()-phase;
  }
  query(tx,'INSERT INTO grpgi_world_receipts_v301(campaign,operation,fingerprint,timings) VALUES({:campaign},{:operation},{:fingerprint},{:timings})',{campaign,operation:body.operationId,fingerprint,timings:JSON.stringify(timings)}).execute();
  return {...envelope(tx,campaign,body.epoch,body.since),status:body.changes.length?'updated':'noop'};
 });timings.totalMs=Date.now()-started;return e.json(200,{...result,timings});
}
module.exports={bootstrap,pull,push,operationStatus,sectionIndex};
