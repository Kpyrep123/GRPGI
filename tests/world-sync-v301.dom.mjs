import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import codec from '../renderer/world-sync-v301.js';
const {Window}=await import(process.env.HAPPY_DOM_MODULE?pathToFileURL(process.env.HAPPY_DOM_MODULE):'happy-dom');
const w=new Window({url:'https://grpgi.test/app/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),ctx=vm.createContext(w);
const run=source=>vm.runInContext(source,ctx),read=name=>fs.readFileSync('deploy/site/app/'+name,'utf8');
w.setInterval=()=>0;w.requestAnimationFrame=()=>0;
w.document.write(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
for(const file of ['item-instances-v215.js','rich-text-scope.js','market-engine.js','player-sync-core.js','damage-types-v202.js','weapon-handling-v203.js','player-credentials-v212.js','player-auth-v212.js','world-sync-v301.js'])run(read(file));
run(read('app.js').replace('  init().catch(error => {',`window.sync301={App,apiPullSnapshot,applyRealtimeRecord};saveCache=async()=>{};renderAffectedScreens=()=>{};if(false) init().catch(error => {`));
const api=w.sync301;api.App.config={url:'https://sync.test',campaignId:'main',tableName:'campaign_snapshots',playerTableName:'campaign_players'};api.App.session={userId:'p',role:'player',authTokenV212:'session-token'};
let seq=0,revision=1,records=new Map(),missing=false,legacyCalls=0;const calls=[];
let data={world:{equipment:{EQUIPMENT:{gun:{id:'gun',name:'Initial'}}},npcs:{NPCS:{}},planets:{PLANETS:{}}},state:{users:{p:{id:'p',role:'player',inventory:[]}}}};
function index(){const target=codec.pack(data);for(const [key,value] of target){const old=records.get(key);if(!old||old.deleted||old.data!==value)records.set(key,{key,data:value,seq:++seq,version:(old?.version||0)+1,deleted:false});}for(const [key,old] of records)if(!old.deleted&&!target.has(key))records.set(key,{key,data:'',seq:++seq,version:old.version+1,deleted:true});}
index();
w.fetch=async(url,options={})=>{
 if(!url.includes('/world-v301/')){legacyCalls++;return {ok:true,text:async()=>JSON.stringify({items:[{id:'snapshot',campaignId:'main',revision,worldJson:data.world,stateJson:data.state}]})};}
 const body=JSON.parse(options.body);calls.push(body);
 if(missing)return {ok:false,status:404,text:async()=>JSON.stringify({message:'Not found'})};
 const reset=body.epoch!=='epoch';return {ok:true,text:async()=>JSON.stringify({ok:true,schema:301,exists:true,epoch:'epoch',seq,reset,remote:{_id:'snapshot',campaignId:'main',revision},changes:[...records.values()].filter(row=>reset||row.seq>body.since)})};
};
try{
 const initial=await api.apiPullSnapshot(api.App.config);assert.equal(initial.world_json.equipment.EQUIPMENT.gun.name,'Initial');assert.equal(legacyCalls,0);
 const previousSeq=seq;data.world.equipment.EQUIPMENT.gun.name='Changed';revision++;index();
 const changed=await api.apiPullSnapshot(api.App.config);assert.equal(changed.world_json.equipment.EQUIPMENT.gun.name,'Changed');assert.equal(calls.at(-1).since,previousSeq);assert(!Object.hasOwn(calls.at(-1),'world'));
 // A metadata-only SSE record must pull changes before replacing the displayed cache.
 api.App.cache.snapshot=initial;api.App.data.playerRows=new Map();api.App.data.chatRows=[];api.App.data.combatRuntime=null;
 await api.applyRealtimeRecord('campaign_snapshots','update',{id:'snapshot',campaignId:'main',revision});
 assert.equal(api.App.cache.snapshot.world_json.equipment.EQUIPMENT.gun.name,'Changed');
 delete data.world.equipment.EQUIPMENT.gun;revision++;index();
 assert.equal((await api.apiPullSnapshot(api.App.config)).world_json.equipment.EQUIPMENT.gun,undefined);
 assert.equal(legacyCalls,0);
 // Only route absence enables the old server path, and only for that session.
 api.App.session.authTokenV212='old-server-token';missing=true;
 assert.equal((await api.apiPullSnapshot(api.App.config)).revision,revision);assert.equal(legacyCalls,1);
 const attempts=calls.length;await api.apiPullSnapshot(api.App.config);assert.equal(calls.length,attempts);assert.equal(legacyCalls,2);
 const options=JSON.parse(decodeURIComponent(codec.topic('campaign_snapshots').split('?options=')[1]));assert(!options.query.fields.includes('worldJson'));assert(options.query.fields.includes('campaignId'));
 console.log('PASS web entity sync: initial baseline, cursor updates, metadata-only realtime, deletion and per-session legacy fallback');
}finally{await w.happyDOM.abort();}
