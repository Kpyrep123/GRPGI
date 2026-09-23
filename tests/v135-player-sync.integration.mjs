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
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-sync-v135-'));
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
  const collection=ok(await request('/api/collections',{name:'campaign_players',type:'base',...rules,fields:[...fields,{name:'playerId',type:'text'},{name:'version',type:'number'},{name:'deletedAt',type:'text'},{name:'playerJson',type:'json',maxSize:5000000}],indexes:['CREATE UNIQUE INDEX idx_players_key ON campaign_players (campaignId, playerId)']}));
  ok(await request('/api/collections',{name:'campaign_snapshots',type:'base',...rules,fields:[...fields,{name:'revision',type:'number'},{name:'worldJson',type:'json',maxSize:5000000},{name:'stateJson',type:'json',maxSize:5000000}]}));
  const player={id:'p',credits:10000,skillPoints:3,skills:[],abilityBase:{strength:0,endurance:0},abilities:{strength:0,endurance:0},inventory:[],equipmentSlots:{},implantSlots:[],inventorySize:100,carryWeightMax:10000,currentPlanetId:'port'};
  ok(await request('/api/collections/campaign_players/records',{campaignId:'test',playerId:'p',version:1,playerJson:player}));
  const world={planets:{PLANETS:{port:{id:'port',stockMarketEnabled:true,market:[]}}},campaigns:{CAMPAIGNS:{test:{id:'test',marketDate:'3616-01-01'}}},equipment:{EQUIPMENT:{stock_acme:{id:'stock_acme',name:'Acme',type:'stock',ticker:'ACME',marketMinPrice:10,marketMaxPrice:10,priceMin:10,priceMax:10}}}};
  ok(await request('/api/collections/campaign_snapshots/records',{campaignId:'test',revision:1,worldJson:world,stateJson:{}}));
  token=ok(await request('/api/collections/app_users/auth-with-password',{identity:'player@example.invalid',password})).token;
  assert.equal((await request('/api/grpgi/players/mutate',{campaignId:'test',playerId:'p',operationId:id()},'POST','')).httpStatus,401);
  let row=await readPlayer();
  let outcomes=await Promise.all(Array.from({length:20},(_,i)=>mutate(row,{inventory:[{itemId:'item_'+i,qty:1,positions:[]}]})));
  outcomes.forEach(r=>{ok(r);assert.equal(r.ok,true,JSON.stringify(r));});
  row=await readPlayer();assert.equal(row.playerJson.inventory.length,20);assert.equal(row.version,21);
  console.log('PASS concurrent independent inventory additions (20 writers)');
  outcomes=await Promise.all(row.playerJson.inventory.map(item=>mutate(row,{inventory:row.playerJson.inventory.filter(x=>x.itemId!==item.itemId)})));
  outcomes.forEach(r=>assert.equal(r.ok,true,JSON.stringify(r)));
  row=await readPlayer();assert.equal(row.playerJson.inventory.length,0);
  console.log('PASS concurrent inventory removals persist after reload');
  const before=row;
  const skillOps=await Promise.all(['skill_a','skill_b'].map(skill=>mutate(before,{skillPoints:2,skills:[skill]})));
  assert.equal(skillOps.filter(r=>r.ok).length,1);assert.equal(skillOps.filter(r=>r.httpStatus===200&&!r.ok).length,1);
  row=await readPlayer();assert.equal(row.playerJson.skillPoints,2);assert.equal(row.playerJson.skills.length,1);
  console.log('PASS competing skill purchases commit skill and cost together');
  const abilityRequest={campaignId:'test',playerId:'p',baseVersion:row.version,basePlayer:row.playerJson,player:{abilityBase:{strength:1,endurance:0},abilities:{strength:1,endurance:0},skillPoints:1},operationId:id()};
  const retries=await Promise.all(Array.from({length:8},()=>request('/api/grpgi/players/mutate',abilityRequest)));
  retries.forEach(r=>assert.equal(r.ok,true,JSON.stringify(r)));
  const version=row.version;row=await readPlayer();assert.equal(row.version,version+1);assert.equal(row.playerJson.abilityBase.strength,1);assert.equal(row.playerJson.skillPoints,1);
  console.log('PASS lost-response retries charge ability points once');
  const trade={campaignId:'test',playerId:'p',planetId:'port',itemId:'stock_acme',action:'buy',operationId:id()};
  const credits=row.playerJson.credits;
  const bought=ok(await request('/api/grpgi/market/transaction',trade));assert.equal(bought.ok,true,JSON.stringify(bought));
  const afterBuy=await readPlayer();assert.equal(afterBuy.playerJson.stockPortfolio.positions.stock_acme.knownQty,1);assert.equal(afterBuy.playerJson.credits,credits-bought.price);
  const staleInventory=await mutate(row,{inventory:[{itemId:'gift',qty:1,positions:[]}]});assert.equal(staleInventory.ok,true,JSON.stringify(staleInventory));
  row=await readPlayer();assert.equal(row.playerJson.stockPortfolio.positions.stock_acme.knownQty,1);assert.equal(row.playerJson.credits,credits-bought.price);assert.equal(row.playerJson.inventory.length,1);
  console.log('PASS stale inventory edit preserves purchased shares and debit');
  const learned=row.playerJson.skills;
  assert.equal((await mutate(row,{notes:'notes only'})).ok,true);
  row=await readPlayer();assert.equal(row.playerJson.inventory.length,1);assert.deepEqual(row.playerJson.skills,learned);
  console.log('PASS partial profile update does not clear inventory or skills');
  const legacy=await request('/api/collections/campaign_players/records/'+row.id,{playerJson:player,version:row.version+1},'PATCH');
  assert.equal(legacy.httpStatus,426);
  console.log('PASS old clients cannot overwrite transactional player data');
  ok(await request('/api/collections/'+collection.id,{updateRule:null},'PATCH',adminToken));
  const denied=await mutate(row,{notes:'denied'});assert.equal(denied.httpStatus,403);
  ok(await request('/api/collections/'+collection.id,{updateRule:rules.updateRule},'PATCH',adminToken));
  console.log('PASS existing collection access rules remain enforced');
  await stop();await boot();
  const replay=ok(await request('/api/grpgi/market/transaction',trade));assert.equal(replay.status,'replayed');
  row=await readPlayer();assert.equal(row.playerJson.stockPortfolio.positions.stock_acme.knownQty,1);assert.equal(row.playerJson.credits,credits-bought.price);
  console.log('PASS market retry after server restart does not duplicate purchase');
  console.log('ALL SERVER INTEGRATION CHECKS PASSED');
}catch(error){console.error(error.stack);console.error(log.slice(-6000));process.exitCode=1;}finally{await stop();fs.rmSync(temp,{recursive:true,force:true});}
