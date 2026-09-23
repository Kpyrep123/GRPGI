import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import net from 'node:net';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const exe=process.env.POCKETBASE_EXE;if(!exe)throw new Error('Set POCKETBASE_EXE to a PocketBase 0.39+ executable');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-integrity-v140-')),data=path.join(temp,'data'),legacyHooks=path.join(temp,'legacy-hooks'),hooks=path.join(root,'pocketbase/pb_hooks');
fs.mkdirSync(legacyHooks,{recursive:true});
for(const name of ['grpgi_loot_core_v137.js','grpgi_market_v139.js','grpgi_market_v139.pb.js'])fs.copyFileSync(path.join(hooks,name),path.join(legacyHooks,name));
const password=randomBytes(24).toString('hex'),email='integrity-v140@example.invalid';
assert.equal(spawnSync(exe,['superuser','upsert',email,password,'--dir',data],{encoding:'utf8'}).status,0);
const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
const base=`http://127.0.0.1:${port}`;let child,token='',log='';
async function request(route,body,method='POST',auth=token){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});let json={};try{json=await response.json();}catch{}return{...json,httpStatus:response.status};}
async function boot(hooksDir){child=spawn(exe,['serve','--http',`127.0.0.1:${port}`,'--dir',data,'--hooksDir',hooksDir,'--migrationsDir',path.join(temp,'migrations'),'--automigrate=false'],{stdio:['ignore','pipe','pipe']});child.stdout.on('data',chunk=>log+=chunk);child.stderr.on('data',chunk=>log+=chunk);for(let index=0;index<160;index+=1){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('PocketBase failed to start: '+log);}
async function stop(){if(!child||child.exitCode!==null)return;const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;child=null;}
const ok=result=>{assert.ok(result.httpStatus>=200&&result.httpStatus<300,JSON.stringify(result));return result;};
const operation=()=>`integrity_${randomBytes(12).toString('hex')}`;
const trade=(itemId,action,quantity)=>request('/api/grpgi/market/transaction-v139',{campaignId:'test',playerId:'p',planetId:'port',itemId,action,quantity,operationId:operation(),updatedBy:'integration-v140'});
const readPlayer=async()=>ok(await request('/api/collections/campaign_players/records?filter=playerId%3D%22p%22',undefined,'GET')).items[0];
const readSnapshot=async()=>ok(await request('/api/collections/campaign_snapshots/records?filter=campaignId%3D%22test%22',undefined,'GET')).items[0];

try{
  await boot(legacyHooks);
  const admin=ok(await request('/api/collections/_superusers/auth-with-password',{identity:email,password})).token;token=admin;
  ok(await request('/api/collections',{name:'app_users',type:'auth'}));ok(await request('/api/collections/app_users/records',{email:'player@example.invalid',password,passwordConfirm:password}));
  const rules={listRule:'@request.auth.id != ""',viewRule:'@request.auth.id != ""',createRule:'@request.auth.id != ""',updateRule:'@request.auth.id != ""',deleteRule:null};
  const fields=[{name:'campaignId',type:'text'},{name:'updatedBy',type:'text'},{name:'clientUpdatedAt',type:'text'},{name:'updated',type:'autodate',onCreate:true,onUpdate:true}];
  ok(await request('/api/collections',{name:'campaign_players',type:'base',...rules,fields:[...fields,{name:'playerId',type:'text'},{name:'version',type:'number'},{name:'deletedAt',type:'text'},{name:'playerJson',type:'json',maxSize:5000000}],indexes:['CREATE UNIQUE INDEX idx_players_key ON campaign_players (campaignId, playerId)']}));
  ok(await request('/api/collections',{name:'campaign_snapshots',type:'base',...rules,fields:[...fields,{name:'revision',type:'number'},{name:'worldJson',type:'json',maxSize:5000000},{name:'stateJson',type:'json',maxSize:5000000}]}));
  const player={id:'p',role:'player',credits:1000,inventory:[],equipmentSlots:{},implantSlots:[],inventorySize:10,carryWeightMax:10,currentPlanetId:'port'};
  const defaults=JSON.parse(fs.readFileSync(path.join(root,'renderer/data/equipment.json'),'utf8'));
  const defaultEquipment=structuredClone(defaults.EQUIPMENT);defaultEquipment.stock_adr={...(defaultEquipment.stock_adr||{}),id:'stock_adr',name:'ADR',type:'stock',stockMinPrice:10,stockMaxPrice:10,priceMin:10,priceMax:10};
  const custom={id:'custom_server_blaster_v140',name:'Серверный бластер',type:'weapon'};
  const world={planets:{PLANETS:{port:{id:'port',stockMarketEnabled:true,market:[]}}},campaigns:{CAMPAIGNS:{test:{id:'test',marketDate:'3616-01-01'}}},equipment:{EQUIPMENT:{...defaultEquipment,[custom.id]:custom}}};
  const state={users:{gm:{id:'gm',role:'gm',displayName:'GM'}}};
  ok(await request('/api/collections/campaign_players/records',{campaignId:'test',playerId:'p',version:1,playerJson:player}));
  ok(await request('/api/collections/campaign_snapshots/records',{campaignId:'test',revision:1,worldJson:world,stateJson:state}));
  token=ok(await request('/api/collections/app_users/auth-with-password',{identity:'player@example.invalid',password})).token;

  ok(await trade('stock_adr','buy',3));let row=await readPlayer();const debitedCredits=row.playerJson.credits;assert.equal(row.playerJson.stockPortfolio.positions.stock_adr.knownQty,3);
  const damaged=structuredClone(row.playerJson);delete damaged.stockPortfolio;
  ok(await request(`/api/collections/campaign_players/records/${row.id}`,{playerJson:damaged,version:row.version+1,updatedBy:'legacy-stale-client'},'PATCH'));
  row=await readPlayer();assert.equal(row.playerJson.stockPortfolio,undefined);assert.equal(row.playerJson.credits,debitedCredits);
  console.log('PASS fixture reproduces debited credits with missing portfolio before v140');

  await stop();await boot(hooks);
  row=await readPlayer();assert.equal(row.playerJson.stockPortfolio.positions.stock_adr.knownQty,3);assert.equal(row.playerJson.credits,debitedCredits);
  console.log('PASS startup recovery rebuilds v139 holdings without changing credits');

  const stale=structuredClone(row.playerJson);delete stale.stockPortfolio;
  ok(await request(`/api/collections/campaign_players/records/${row.id}`,{playerJson:stale,version:row.version+1,updatedBy:'stale-client-after-v140'},'PATCH'));
  row=await readPlayer();assert.equal(row.playerJson.stockPortfolio.positions.stock_adr.knownQty,3);assert.equal(row.playerJson.credits,debitedCredits);
  console.log('PASS portfolio guard blocks later destructive full-profile writes');

  ok(await trade('stock_adr','sell',1));row=await readPlayer();assert.equal(row.playerJson.stockPortfolio.positions.stock_adr.knownQty,2);
  console.log('PASS legitimate market sale remains allowed');

  let snapshot=await readSnapshot();const resetWorld=structuredClone(snapshot.worldJson);resetWorld.equipment={EQUIPMENT:defaultEquipment};
  ok(await request(`/api/collections/campaign_snapshots/records/${snapshot.id}`,{worldJson:resetWorld,stateJson:snapshot.stateJson,revision:snapshot.revision+1,updatedBy:'legacy-default-reset'},'PATCH'));
  snapshot=await readSnapshot();assert.ok(snapshot.worldJson.equipment.EQUIPMENT[custom.id]);
  console.log('PASS bundled World Config reset cannot delete server-only equipment');

  const legitimateWorld=structuredClone(snapshot.worldJson);legitimateWorld.equipment.EQUIPMENT.custom_second_v140={id:'custom_second_v140',name:'Второй предмет',type:'gear'};
  ok(await request(`/api/collections/campaign_snapshots/records/${snapshot.id}`,{worldJson:legitimateWorld,stateJson:snapshot.stateJson,revision:snapshot.revision+1,updatedBy:'gm-explicit-edit'},'PATCH'));
  snapshot=await readSnapshot();assert.ok(snapshot.worldJson.equipment.EQUIPMENT.custom_second_v140);assert.ok(snapshot.worldJson.equipment.EQUIPMENT[custom.id]);
  console.log('PASS normal World Config equipment edits remain allowed');
  console.log('ALL V140 INTEGRITY SERVER CHECKS PASSED');
}catch(error){console.error(error.stack);console.error(log.slice(-12000));process.exitCode=1;}finally{await stop();fs.rmSync(temp,{recursive:true,force:true});}
