import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import net from 'node:net';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const exe=process.env.POCKETBASE_EXE;if(!exe)throw new Error('Set POCKETBASE_EXE to PocketBase 0.39+');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-stock-v148-')),data=path.join(temp,'data'),hooks=path.join(root,'pocketbase/pb_hooks');
const password=randomBytes(24).toString('hex'),email='stock-v148@example.invalid',workerToken=randomBytes(32).toString('hex');
assert.equal(spawnSync(exe,['superuser','upsert',email,password,'--dir',data],{encoding:'utf8'}).status,0);
const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
const base=`http://127.0.0.1:${port}`;let child,token='',log='';
async function request(route,body,method='POST',auth=token,headers={}){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});let json={};try{json=await response.json();}catch{}return{...json,httpStatus:response.status};}
const ok=value=>{assert.ok(value.httpStatus>=200&&value.httpStatus<300,JSON.stringify(value));return value;};
async function boot(){child=spawn(exe,['serve','--http',`127.0.0.1:${port}`,'--dir',data,'--hooksDir',hooks,'--migrationsDir',path.join(temp,'migrations'),'--automigrate=false'],{env:{...process.env,GRPGI_STOCK_WORKER_TOKEN:workerToken},stdio:['ignore','pipe','pipe']});child.stdout.on('data',chunk=>log+=chunk);child.stderr.on('data',chunk=>log+=chunk);for(let index=0;index<120;index++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(log);}
async function stop(){if(!child||child.exitCode!==null)return;const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}

try{
  await boot();token=ok(await request('/api/collections/_superusers/auth-with-password',{identity:email,password})).token;
  ok(await request('/api/collections',{name:'app_users',type:'auth'}));ok(await request('/api/collections/app_users/records',{email:'player@example.invalid',password,passwordConfirm:password}));
  const rules={listRule:'@request.auth.id != ""',viewRule:'@request.auth.id != ""',createRule:'@request.auth.id != ""',updateRule:'@request.auth.id != ""',deleteRule:null};
  const shared=[{name:'campaignId',type:'text'},{name:'updatedBy',type:'text'},{name:'clientUpdatedAt',type:'text'}];
  ok(await request('/api/collections',{name:'campaign_players',type:'base',...rules,fields:[...shared,{name:'playerId',type:'text'},{name:'version',type:'number'},{name:'deletedAt',type:'text'},{name:'playerJson',type:'json',maxSize:5000000}],indexes:['CREATE UNIQUE INDEX idx_stock_v148_players ON campaign_players (campaignId, playerId)']}));
  ok(await request('/api/collections',{name:'campaign_snapshots',type:'base',...rules,fields:[...shared,{name:'revision',type:'number'},{name:'worldJson',type:'json',maxSize:5000000},{name:'stateJson',type:'json',maxSize:5000000}]}));
  ok(await request('/api/collections/campaign_players/records',{campaignId:'test',playerId:'p',version:1,playerJson:{id:'p',role:'player',credits:1000,stockPortfolio:{positions:{},shortPositions:{},ledger:[]}}}));
  ok(await request('/api/collections/campaign_snapshots/records',{campaignId:'test',revision:1,worldJson:{equipment:{EQUIPMENT:{share:{id:'share',type:'stock',ticker:'SHR',stockMinPrice:25,stockVolatility:1}}}},stateJson:{}}));
  token=ok(await request('/api/collections/app_users/auth-with-password',{identity:'player@example.invalid',password})).token;
  assert.equal((await request('/api/grpgi/stock-exchange-v148?campaignId=test&playerId=p',undefined,'GET','')).httpStatus,401);
  const quote=ok(await request('/api/grpgi/stock-exchange-v148?campaignId=test&playerId=p',undefined,'GET'));assert.equal(quote.quotes[0].price,25);
  const bought=ok(await request('/api/grpgi/stock-exchange-v148/order',{campaignId:'test',playerId:'p',itemId:'share',operationId:'buy-1',type:'market',intent:'open_long',quantity:2,leverage:2}));assert.equal(bought.status,'filled');assert.equal(bought.player.stockPortfolio.positions.share.knownQty,2);
  const stopOrder=ok(await request('/api/grpgi/stock-exchange-v148/order',{campaignId:'test',playerId:'p',itemId:'share',operationId:'stop-1',type:'stop_loss',intent:'close_long',quantity:2,triggerPrice:1}));assert.equal(stopOrder.status,'pending');
  assert.equal((await request('/api/grpgi/stock-exchange-v148/tick',{},'POST','',{'X-GRPGI-Worker-Token':'wrong'})).httpStatus,401);
  const tick=ok(await request('/api/grpgi/stock-exchange-v148/tick',{},'POST','',{'X-GRPGI-Worker-Token':workerToken}));assert.deepEqual(tick.campaigns,['test']);
  console.log('PASS PocketBase v148 server-authoritative exchange');
}catch(error){console.error(error.stack);console.error(log.slice(-8000));process.exitCode=1;}finally{await stop();fs.rmSync(temp,{recursive:true,force:true});}
