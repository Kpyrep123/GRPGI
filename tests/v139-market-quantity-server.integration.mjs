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
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-market-v139-')),data=path.join(temp,'data'),hooks=path.join(root,'pocketbase/pb_hooks');
const password=randomBytes(24).toString('hex'),email='market-v139@example.invalid';
assert.equal(spawnSync(exe,['superuser','upsert',email,password,'--dir',data],{encoding:'utf8'}).status,0);
const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
const base=`http://127.0.0.1:${port}`;let child,token='',log='';
async function request(route,body,method='POST',auth=token){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});let json={};try{json=await response.json();}catch{}return{...json,httpStatus:response.status};}
async function boot(){child=spawn(exe,['serve','--http',`127.0.0.1:${port}`,'--dir',data,'--hooksDir',hooks,'--migrationsDir',path.join(temp,'migrations'),'--automigrate=false'],{stdio:['ignore','pipe','pipe']});child.stdout.on('data',chunk=>log+=chunk);child.stderr.on('data',chunk=>log+=chunk);for(let index=0;index<120;index+=1){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('PocketBase failed to start: '+log);}
async function stop(){if(!child||child.exitCode!==null)return;const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}
const ok=result=>{assert.ok(result.httpStatus>=200&&result.httpStatus<300,JSON.stringify(result));return result;};
const operation=()=>`market_${randomBytes(12).toString('hex')}`;
const trade=(itemId,action,quantity,operationId=operation())=>request('/api/grpgi/market/transaction-v139',{campaignId:'test',playerId:'p',planetId:'port',itemId,action,quantity,operationId,updatedBy:'integration'});
const readPlayer=async()=>ok(await request('/api/collections/campaign_players/records?filter=playerId%3D%22p%22',undefined,'GET')).items[0];

try{
  await boot();const admin=ok(await request('/api/collections/_superusers/auth-with-password',{identity:email,password})).token;token=admin;
  ok(await request('/api/collections',{name:'app_users',type:'auth'}));ok(await request('/api/collections/app_users/records',{email:'player@example.invalid',password,passwordConfirm:password}));
  const rules={listRule:'@request.auth.id != ""',viewRule:'@request.auth.id != ""',createRule:'@request.auth.id != ""',updateRule:'@request.auth.id != ""',deleteRule:null};
  const fields=[{name:'campaignId',type:'text'},{name:'updatedBy',type:'text'},{name:'clientUpdatedAt',type:'text'},{name:'updated',type:'autodate',onCreate:true,onUpdate:true}];
  ok(await request('/api/collections',{name:'campaign_players',type:'base',...rules,fields:[...fields,{name:'playerId',type:'text'},{name:'version',type:'number'},{name:'deletedAt',type:'text'},{name:'playerJson',type:'json',maxSize:5000000}],indexes:['CREATE UNIQUE INDEX idx_players_key ON campaign_players (campaignId, playerId)']}));
  ok(await request('/api/collections',{name:'campaign_snapshots',type:'base',...rules,fields:[...fields,{name:'revision',type:'number'},{name:'worldJson',type:'json',maxSize:5000000},{name:'stateJson',type:'json',maxSize:5000000}]}));
  const player={id:'p',role:'player',credits:1000,inventory:[],equipmentSlots:{},implantSlots:[],inventorySize:10,carryWeightMax:10,currentPlanetId:'port'};
  const equipment={
    stock_acme:{id:'stock_acme',name:'Acme',type:'stock',ticker:'ACME',priceMin:10,priceMax:10},
    medkit:{id:'medkit',name:'Аптечка',type:'gear',mass:1,inventoryWidth:1,inventoryHeight:1,stackable:true,stackLimit:99},
    relic:{id:'relic',name:'Реликвия',type:'gear',rarity:'уникальный',mass:1,inventoryWidth:1,inventoryHeight:1}
  };
  const world={planets:{PLANETS:{port:{id:'port',stockMarketEnabled:true,market:[{itemId:'medkit',minPrice:25,maxPrice:25,appearanceChance:100},{itemId:'relic',minPrice:100,maxPrice:100,appearanceChance:100,unique:true}]}}},campaigns:{CAMPAIGNS:{test:{id:'test',marketDate:'3616-01-01'}}},equipment:{EQUIPMENT:equipment}};
  ok(await request('/api/collections/campaign_players/records',{campaignId:'test',playerId:'p',version:1,playerJson:player}));ok(await request('/api/collections/campaign_snapshots/records',{campaignId:'test',revision:1,worldJson:world,stateJson:{}}));
  token=ok(await request('/api/collections/app_users/auth-with-password',{identity:'player@example.invalid',password})).token;
  assert.equal((await trade('stock_acme','buy',1)).httpStatus,200);
  let row=await readPlayer();const firstCredits=row.playerJson.credits;
  const buyId=operation(),bought=ok(await trade('stock_acme','buy',7,buyId));assert.equal(bought.quantity,7);assert.equal(bought.total,70);
  row=await readPlayer();assert.equal(row.playerJson.stockPortfolio.positions.stock_acme.knownQty,8);assert.equal(row.playerJson.credits,firstCredits-70);assert.equal(row.playerJson.stockPortfolio.ledger.at(-1).quantity,7);
  const replay=ok(await trade('stock_acme','buy',7,buyId));assert.equal(replay.status,'replayed');row=await readPlayer();assert.equal(row.playerJson.stockPortfolio.positions.stock_acme.knownQty,8);assert.equal(row.playerJson.credits,firstCredits-70);
  assert.equal((await trade('stock_acme','buy',8,buyId)).httpStatus,400);
  console.log('PASS atomic stock batch purchase and idempotent replay');

  const goods=ok(await trade('medkit','buy',3));assert.equal(goods.quantity,3);assert.equal(goods.total,75);row=await readPlayer();assert.equal(row.playerJson.inventory.find(entry=>entry.itemId==='medkit').qty,3);assert.equal(row.playerJson.credits,firstCredits-145);
  const beforeCapacity=JSON.stringify(row.playerJson);assert.equal((await trade('medkit','buy',20)).httpStatus,400);row=await readPlayer();assert.equal(JSON.stringify(row.playerJson),beforeCapacity);
  assert.equal((await trade('relic','buy',2)).httpStatus,400);
  console.log('PASS inventory quantity, weight/slot validation and unique limit');

  const sold=ok(await trade('stock_acme','sell',4));assert.equal(sold.quantity,4);assert.equal(sold.total,40);row=await readPlayer();assert.equal(row.playerJson.stockPortfolio.positions.stock_acme.knownQty,4);assert.equal(row.playerJson.credits,firstCredits-105);assert.equal(row.playerJson.stockPortfolio.ledger.at(-1).quantity,4);
  console.log('PASS stock batch sale uses one transaction');
  console.log('ALL V139 MARKET SERVER CHECKS PASSED');
}catch(error){console.error(error.stack);console.error(log.slice(-8000));process.exitCode=1;}finally{await stop();fs.rmSync(temp,{recursive:true,force:true});}
