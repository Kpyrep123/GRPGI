'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'world-sync-300-'));
const clean=require('../renderer/player-credentials-v212.js').clean;
const ctx={Date,Object,Array,process,stripPlayerCredentialsV212:clean,WORLD_FILE_NAMES:['equipment','npcs','players'],debugLog(){},writes:[],
 ensureWorldDataDir:async()=>tmp,path,
 localizeLegacyImageDataUrls:async value=>{if(value.image==='data:image/test')value.image='file:///localized.png';},
 backupWorldSectionFile:async()=>{},
 writeJsonAtomic:async(file,data)=>{ctx.writes.push(path.basename(file));fs.writeFileSync(file,JSON.stringify(data));},
 writeTradeJsonFilesV175:async()=>{ctx.tradeWrites=(ctx.tradeWrites||0)+1;}};
vm.createContext(ctx);
vm.runInContext(main.slice(main.indexOf('async function writeWorldSection('),main.indexOf('async function writeWorldData(')),ctx);
async function run(){
 fs.writeFileSync(path.join(tmp,'npcs.json'),'UNCHANGED BYTES');
 const result=await ctx.writeWorldSectionsV300({equipment:{EQUIPMENT:{gun:{id:'gun'}},image:'data:image/test',password:'secret'}});
 assert.deepEqual(ctx.writes,['equipment.json']);assert.equal(ctx.tradeWrites,1);
 assert.equal(result.world.equipment.image,'file:///localized.png');assert.equal(result.world.equipment.password,undefined);
 assert.equal(fs.readFileSync(path.join(tmp,'npcs.json'),'utf8'),'UNCHANGED BYTES');
 for(const bad of [{equipment:{},unknown:{}},{equipment:{},npcs:null},{}])await assert.rejects(ctx.writeWorldSectionsV300(bad));
 assert.equal(ctx.writes.length,1,'invalid batch rejected before any file write');

 let handler;const remote={world:{equipment:{EQUIPMENT:{old:{id:'old'}}},npcs:{NPCS:{unchanged:{id:'unchanged',image:'file:///must-not-upload.png'}}},players:{PLAYER_TEMPLATES:{gm:{role:'gm'}}}},state:{users:{gm:{role:'gm'}}},revision:4};
 Object.assign(ctx,{
  ipcMain:{handle(name,fn){assert.equal(name,'sync:push');handler=fn;}},
  loadSyncConfig:async()=>({enabled:true,campaignId:'campaign'}),
  fetchRemoteSnapshot:async()=>({exists:true,remote}),
  validateSyncBaselineGuard:()=>({ok:true,guard:{revision:4},token:'valid'}),
  requestedWorldSectionsV140:p=>p.worldSections||[],
  normalizeSnapshotImagesForCloud:async(_config,snapshot)=>{ctx.normalized=Object.keys(snapshot.world);return snapshot;},
  protectRemoteWorldV140:async(world,submitted,sections)=>({ok:true,world:{...world,...Object.fromEntries(sections.filter(n=>Object.hasOwn(submitted,n)).map(n=>[n,submitted[n]]))}}),
  worldSectionHashV140:value=>JSON.stringify(value),
  pushRemoteSnapshot:async(_config,data)=>{ctx.sent=data;return ctx.fail?{ok:false,status:'conflict'}:{ok:true,remote:{revision:5}};},
  notifyPlayerDisplayDataChanged(){},
  backupRemoteSnapshotBeforeGmWrite:async()=>'/backup.json',createSyncBaselineGuard:()=> 'renewed',
  writeWorldData:async world=>{ctx.fullPersisted=world;},
 });
 vm.runInContext(main.slice(main.indexOf("ipcMain.handle('sync:push'"),main.indexOf("ipcMain.handle('chat:pull'")),ctx);
 remote.state.users.gm.credits=42;
 const payload={reason:'world-config-save',gmWrite:true,actorId:'gm',baseRevision:4,baselineToken:'valid',worldSections:['equipment'],snapshot:{world:{equipment:{EQUIPMENT:{new:{id:'new'}}},npcs:{NPCS:{wrong:{id:'wrong'}}}},state:{users:{gm:{role:'gm'}}}}};
 const before=ctx.writes.length,saved=await handler(null,payload);
 assert.equal(saved.ok,true,saved.message);assert.deepEqual(ctx.normalized,['equipment']);
 assert.deepEqual(Array.from(ctx.sent.worldScope),['equipment']);
 assert.equal(ctx.sent.state.users.gm.credits,42,'WC must preserve server state');
 assert.equal(saved.normalizedUsers,null,'WC cannot replace versioned local profiles with snapshot users');
 assert.equal(ctx.sent.world.npcs,remote.world.npcs,'unchanged remote catalogue retained');
 assert.deepEqual(Object.keys(saved.worldPatch),['equipment']);
 assert.deepEqual(ctx.writes.slice(before),['equipment.json']);
 ctx.fail=true;const failed=await handler(null,payload);
 assert.equal(failed.ok,false);assert.equal(failed.worldPatch,null);assert.equal(ctx.writes.length,before+1,'failed cloud write cannot persist a normalized patch');
 ctx.fail=false;const stateOnly=await handler(null,{...payload,worldSections:[]});
 assert.equal(stateOnly.ok,true);assert.deepEqual(ctx.normalized,[]);assert.equal(stateOnly.worldPersisted,false);
 assert.equal(ctx.writes.length,before+1,'state-only sync does not rewrite any world files');
 remote.revision=5;
 const reconciled=await handler(null,{...payload,cloudHistory:{lastPulledAt:'2026-11-23'}});
 assert.equal(reconciled.ok,true,reconciled.message);assert.equal(reconciled.cloudBackupCreated,true);
 assert.equal(ctx.fullPersisted.npcs,remote.world.npcs);assert.equal(reconciled.worldPatch.npcs,remote.world.npcs,'newer remote sections reach renderer and disk before advancing baseline');
 const pushesBeforeRecovery=ctx.sent;
 ctx.fetchRemoteSnapshot=async()=>({ok:true,exists:true,remote,recovered:{operationId:'old-op',localEditVersion:3}});
 const recoveredBeforePush=await handler(null,payload);assert.equal(recoveredBeforePush.status,'confirmation-received');assert.equal(ctx.sent,pushesBeforeRecovery,'a late acknowledgement cannot be consumed by a new write');
 console.log('PASS scoped world sync: exact files, credential stripping, normalized return, validation, remote retention, conflict and state-only writes');
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(tmp,{recursive:true,force:true}));
