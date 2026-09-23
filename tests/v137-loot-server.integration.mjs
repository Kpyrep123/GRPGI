import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const exe=process.env.POCKETBASE_EXE;
if(!exe)throw new Error('Set POCKETBASE_EXE to a PocketBase 0.39+ executable');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-loot-v137-'));
const data=path.join(temp,'data'),hooks=path.join(root,'pocketbase/pb_hooks');
const password=randomBytes(24).toString('hex'),email='sync-test@example.invalid';
const seed=spawnSync(exe,['superuser','upsert',email,password,'--dir',data],{encoding:'utf8'});
assert.equal(seed.status,0,seed.stderr);
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const base='http://127.0.0.1:'+port;
let child,log='',token='';
async function request(route,body,method='POST',auth=token){
  const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const json=await r.json();return{...json,httpStatus:r.status};
}
async function boot(){
  child=spawn(exe,['serve','--http','127.0.0.1:'+port,'--dir',data,'--hooksDir',hooks,'--migrationsDir',path.join(temp,'migrations'),'--automigrate=false'],{stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  for(let i=0;i<100;i++){try{const h=await fetch(base+'/api/health');if(h.ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}
  throw new Error('PocketBase failed to start: '+log);
}
async function stop(){if(!child||child.exitCode!==null)return;const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}
const ok=r=>{assert.ok(r.httpStatus>=200&&r.httpStatus<300,JSON.stringify(r));return r;};
const id=()=> 'test_'+randomBytes(16).toString('hex');
let adminToken;
const readPlayer=async()=>ok(await request('/api/collections/campaign_players/records?filter=playerId%3D%22p%22',undefined,'GET')).items[0];
const mutate=(baseRow,player,operationId=id())=>request('/api/grpgi/players/mutate',{
  campaignId:'test',playerId:'p',baseVersion:baseRow.version,basePlayer:baseRow.playerJson,player,operationId});
try{
  await boot();
  adminToken=ok(await request('/api/collections/_superusers/auth-with-password',{identity:email,password})).token;token=adminToken;
  ok(await request('/api/collections',{name:'app_users',type:'auth'}));
  ok(await request('/api/collections/app_users/records',{email:'player@example.invalid',password,passwordConfirm:password}));
  const rules={listRule:'@request.auth.id != ""',viewRule:'@request.auth.id != ""',createRule:'@request.auth.id != ""',updateRule:'@request.auth.id != ""',deleteRule:null};
  const fields=[{name:'campaignId',type:'text'},{name:'updatedBy',type:'text'},{name:'clientUpdatedAt',type:'text'},{name:'updated',type:'autodate',onCreate:true,onUpdate:true}];
  const players=ok(await request('/api/collections',{name:'campaign_players',type:'base',...rules,fields:[...fields,{name:'playerId',type:'text'},{name:'version',type:'number'},{name:'deletedAt',type:'text'},{name:'playerJson',type:'json',maxSize:5000000}],indexes:['CREATE UNIQUE INDEX idx_players_key ON campaign_players (campaignId, playerId)']}));
  const snapshots=ok(await request('/api/collections',{name:'campaign_snapshots',type:'base',...rules,fields:[...fields,{name:'revision',type:'number'},{name:'worldJson',type:'json',maxSize:5000000},{name:'stateJson',type:'json',maxSize:5000000}]}));
  const player={id:'p',role:'player',baseStats:{inventorySlots:1,carryBase:10},abilityBase:{strength:0},inventory:[],equipmentSlots:{},implantSlots:[]};
  ok(await request('/api/collections/campaign_players/records',{campaignId:'test',playerId:'p',version:1,playerJson:player}));
  const world={equipment:{EQUIPMENT:{a:{id:'a',type:'gear',mass:1,inventoryWidth:1,inventoryHeight:1},b:{id:'b',type:'gear',mass:1,inventoryWidth:1,inventoryHeight:1},heavy:{id:'heavy',type:'gear',mass:20},ammo:{id:'ammo',type:'ammo',mass:.1,stackLimit:5},wide:{id:'wide',mass:1,inventoryWidth:3,inventoryHeight:2},paper:{id:'paper',name:'Document',legacyTextOnlyInventoryV131:true,mass:0}}}};
  ok(await request('/api/collections/campaign_snapshots/records',{campaignId:'test',revision:1,worldJson:world,stateJson:{}}));
  token=ok(await request('/api/collections/app_users/auth-with-password',{identity:'player@example.invalid',password})).token;
  const grant=(itemId,operationId=id(),qty=1)=>({campaignId:'test',playerId:'p',operationId,lootTransferV137:{itemId,qty,source:'scene/token'}});
  const send=body=>request('/api/grpgi/loot/transfer',body);
  assert.equal((await request('/api/grpgi/loot/transfer',grant('a'),'POST','')).httpStatus,401);
  let before=await readPlayer();const heavy=await send(grant('heavy'));assert.equal(heavy.status,'capacity',JSON.stringify(heavy));assert.equal((await readPlayer()).version,before.version);
  console.log('PASS overweight grant changes neither inventory nor version');
  const first=grant('a'),second=grant('b');
  const results=await Promise.all([send(first),send(second)]);results.forEach(ok);
  assert.equal(results.filter(r=>r.ok).length,1,JSON.stringify(results));assert.equal(results.filter(r=>r.status==='capacity').length,1);
  let row=await readPlayer();assert.equal(row.playerJson.inventory.length,1);assert.equal(row.version,2);
  const winning=results[0].ok?first:second;
  for(const r of await Promise.all(Array.from({length:8},()=>send(winning))))assert.equal(r.status,'replayed',JSON.stringify(r));
  assert.equal((await readPlayer()).version,2);
  console.log('PASS concurrent last-slot race and eight retries grant exactly once');
  assert.equal((await send({...winning,lootTransferV137:{...winning.lootTransferV137,qty:2}})).httpStatus,400);
  ok(await request('/api/collections/'+players.id,{updateRule:null},'PATCH',adminToken));
  assert.equal((await send(grant('a'))).httpStatus,403);
  ok(await request('/api/collections/'+players.id,{updateRule:rules.updateRule},'PATCH',adminToken));
  ok(await request('/api/collections/'+snapshots.id,{updateRule:null},'PATCH',adminToken));
  assert.equal((await send(grant('a'))).httpStatus,403);
  ok(await request('/api/collections/'+snapshots.id,{updateRule:rules.updateRule},'PATCH',adminToken));
  console.log('PASS player and campaign access rules; operation cannot be repurposed');
  await stop();await boot();assert.equal((await send(winning)).status,'replayed');assert.equal((await readPlayer()).version,2);
  console.log('PASS receipt survives PocketBase restart');
  // Reset only the isolated fixture through the superuser API.
  const seedPlayer=async changes=>{const row=await readPlayer();ok(await request('/api/collections/campaign_players/records/'+row.id,{playerJson:{...player,...changes},version:row.version+1},'PATCH',adminToken));};
  await seedPlayer({baseStats:{inventorySlots:6,carryBase:10},inventory:[]});
  assert.equal((await send(grant('wide'))).status,'capacity');
  await seedPlayer({baseStats:{inventorySlots:1,carryBase:10},inventory:[{itemId:'ammo',qty:4,positions:[]}]});
  assert.equal((await send(grant('ammo'))).ok,true);assert.equal((await send(grant('ammo'))).status,'capacity');
  await seedPlayer({baseStats:{inventorySlots:0,carryBase:0},inventory:[]});
  assert.equal((await send(grant('paper',id(),5))).ok,true);
  row=await readPlayer();assert.equal(row.playerJson.inventory.length,0);assert.equal(row.playerJson.textInventoryItems[0].qty,5);
  console.log('PASS rectangular fit, stack boundary, and legacy weightless loot uses text inventory');

  console.log('ALL V137 SERVER CHECKS PASSED');
}catch(error){console.error(error.stack);console.error(log.slice(-6000));process.exitCode=1;}finally{await stop();fs.rmSync(temp,{recursive:true,force:true});}
