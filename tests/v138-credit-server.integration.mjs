import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import net from 'node:net';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),exe=process.env.POCKETBASE_EXE;
if(!exe)throw new Error('Set POCKETBASE_EXE to PocketBase 0.39+');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-credit-v138-')),data=path.join(temp,'data'),hooks=path.join(root,'pocketbase/pb_hooks'),password=randomBytes(24).toString('hex'),email='credit-test@example.invalid';
assert.equal(spawnSync(exe,['superuser','upsert',email,password,'--dir',data],{encoding:'utf8'}).status,0);
const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});}),base=`http://127.0.0.1:${port}`;
let child,token='',log='';
async function request(route,body,method='POST',auth=token){const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});let json={};try{json=await response.json();}catch{}return{...json,httpStatus:response.status};}
const ok=value=>{assert.ok(value.httpStatus>=200&&value.httpStatus<300,JSON.stringify(value));return value;};
async function boot(){child=spawn(exe,['serve','--http',`127.0.0.1:${port}`,'--dir',data,'--hooksDir',hooks,'--migrationsDir',path.join(temp,'migrations'),'--automigrate=false'],{stdio:['ignore','pipe','pipe']});child.stdout.on('data',data=>log+=data);child.stderr.on('data',data=>log+=data);for(let index=0;index<120;index++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(log);}
async function stop(){if(!child||child.exitCode!==null)return;const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}
const id=()=>`credit_${randomBytes(16).toString('hex')}`;
const grant=(amount,operationId=id())=>request('/api/grpgi/credits/grant',{campaignId:'test',playerId:'p',operationId,creditGrantV138:{amount,reason:'test'}});
const readPlayer=async()=>ok(await request('/api/collections/campaign_players/records?filter=playerId%3D%22p%22',undefined,'GET')).items[0];
let adminToken,playersCollection,snapshotCollection;
try{
  await boot();adminToken=ok(await request('/api/collections/_superusers/auth-with-password',{identity:email,password})).token;token=adminToken;
  ok(await request('/api/collections',{name:'app_users',type:'auth'}));ok(await request('/api/collections/app_users/records',{email:'gm@example.invalid',password,passwordConfirm:password}));
  const rules={listRule:'@request.auth.id != ""',viewRule:'@request.auth.id != ""',createRule:'@request.auth.id != ""',updateRule:'@request.auth.id != ""',deleteRule:null},shared=[{name:'campaignId',type:'text'},{name:'updatedBy',type:'text'},{name:'clientUpdatedAt',type:'text'},{name:'updated',type:'autodate',onCreate:true,onUpdate:true}];
  playersCollection=ok(await request('/api/collections',{name:'campaign_players',type:'base',...rules,fields:[...shared,{name:'playerId',type:'text'},{name:'version',type:'number'},{name:'deletedAt',type:'text'},{name:'playerJson',type:'json',maxSize:5000000}],indexes:['CREATE UNIQUE INDEX idx_credit_players_key ON campaign_players (campaignId, playerId)']}));
  snapshotCollection=ok(await request('/api/collections',{name:'campaign_snapshots',type:'base',...rules,fields:[...shared,{name:'revision',type:'number'},{name:'worldJson',type:'json',maxSize:5000000},{name:'stateJson',type:'json',maxSize:5000000}]}));
  ok(await request('/api/collections/campaign_players/records',{campaignId:'test',playerId:'p',version:1,playerJson:{id:'p',role:'player',credits:100}}));ok(await request('/api/collections/campaign_snapshots/records',{campaignId:'test',revision:1,worldJson:{},stateJson:{}}));
  token=ok(await request('/api/collections/app_users/auth-with-password',{identity:'gm@example.invalid',password})).token;
  assert.equal((await request('/api/grpgi/credits/grant',{campaignId:'test',playerId:'p',operationId:id(),creditGrantV138:{amount:5}},'POST','')).httpStatus,401);
  const operation=id(),retries=await Promise.all(Array.from({length:12},()=>grant(25,operation)));retries.forEach(ok);assert.equal(retries.filter(row=>row.status==='committed').length,1);assert.equal((await readPlayer()).playerJson.credits,125);assert.equal((await readPlayer()).version,2);
  console.log('PASS concurrent retries add credits exactly once');
  assert.equal((await grant(26,operation)).httpStatus,400);assert.equal((await grant(0)).httpStatus,400);assert.equal((await grant(-1)).httpStatus,400);
  const distinct=await Promise.all([grant(7),grant(8),grant(9)]);distinct.forEach(ok);assert.equal((await readPlayer()).playerJson.credits,149);assert.equal((await readPlayer()).version,5);
  console.log('PASS distinct concurrent operations are atomic');
  ok(await request('/api/collections/'+playersCollection.id,{updateRule:null},'PATCH',adminToken));assert.equal((await grant(1)).httpStatus,403);ok(await request('/api/collections/'+playersCollection.id,{updateRule:rules.updateRule},'PATCH',adminToken));
  ok(await request('/api/collections/'+snapshotCollection.id,{updateRule:null},'PATCH',adminToken));assert.equal((await grant(1)).httpStatus,403);ok(await request('/api/collections/'+snapshotCollection.id,{updateRule:rules.updateRule},'PATCH',adminToken));
  console.log('PASS player and campaign write permissions are enforced');
  await stop();await boot();const replay=await grant(25,operation);ok(replay);assert.equal(replay.status,'replayed');assert.equal((await readPlayer()).playerJson.credits,149);
  console.log('PASS idempotence ledger survives restart');
  console.log('ALL V138 CREDIT SERVER CHECKS PASSED');
}catch(error){console.error(error.stack);console.error(log.slice(-6000));process.exitCode=1;}finally{await stop();fs.rmSync(temp,{recursive:true,force:true});}
