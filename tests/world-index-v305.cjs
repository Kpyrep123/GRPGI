'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const codec=require('../renderer/world-sync-v301.js'),clean=require('../renderer/player-credentials-v212.js').clean;
const context={module:{exports:{}},__hooks:'.',require:()=>codec,$security:{sha256:value=>crypto.createHash('sha256').update(value).digest('hex')}};
vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../pocketbase/pb_hooks/grpgi_world_sync_v301.js'),'utf8'),context);
const {sectionIndex}=context.module.exports;
let previous=new Map(),cached=new Map(),seq=0;
function step(raw){
 const stats={},plan=sectionIndex(raw,previous,cached,{clean},stats);
 const expected=codec.pack(clean(raw));
 assert.equal(JSON.stringify([...plan.target].sort()),JSON.stringify([...expected].sort()),'incremental index equals full cleaned codec output');
 for(const [key,data] of plan.target){const old=previous.get(key);if(!old||old.deleted||old.data!==data)previous.set(key,{data,version:(old?.version||0)+1,seq:++seq,deleted:0});}
 for(const [key,row] of previous)if(!row.deleted&&!plan.target.has(key))previous.set(key,{data:'',version:row.version+1,seq:++seq,deleted:1});
 cached=plan.fingerprints;return stats;
}
let raw={world:{equipment:{EQUIPMENT:{one:{id:'one',name:'First',password:'secret'}}},planets:{PLANETS:{a:{name:'A'}}}},state:{users:{gm:{role:'gm',passwordHash:'secret'}},empty:[]}};
let stats=step(raw);assert.equal(stats.packedSections,4);assert.equal(stats.reusedSections,0);
const unchangedSeq=seq;stats=step(raw);assert.equal(stats.packedSections,0);assert.equal(stats.reusedSections,4);assert.equal(seq,unchangedSeq);
raw.world.equipment.EQUIPMENT.one.name='Edited';stats=step(raw);assert.equal(stats.packedSections,1);assert.equal(stats.reusedSections,3);
// Secrets can change without leaking into indexed data or increasing entity versions.
const secretSeq=seq;raw.state.users.gm.passwordHash='new secret';stats=step(raw);assert.equal(stats.packedSections,1);assert.equal(seq,secretSeq);
raw.world.extra={empty:{},list:[null,{},[],false,0,'']};step(raw);delete raw.world.planets;step(raw);raw.world.planets={PLANETS:{b:{name:'B'}}};step(raw);
raw.state.users=null;step(raw);raw.state.users=[];step(raw);raw.state.users={};step(raw);
raw.world=JSON.parse('{"password":{"secret":true},"__proto__":{"polluted":true},"valid":{"constructor":{"hidden":true},"safe":1}}');step(raw);assert.equal({}.polluted,undefined);
for(const value of [null,[],['a',{},[]],false,'legacy',{}]){raw={world:value,state:{users:{}}};step(raw);}
// Deterministic mixed additions, replacements, nested list changes and removals.
raw={world:{},state:{}};
for(let i=0;i<120;i++){
 const root=i%2?'world':'state',key='section'+(i%9);
 if(i%4===0)delete raw[root][key];else raw[root][key]=i%3===0?[i,null,{empty:{},password:'secret'}]:{id:i,list:[i,false],empty:{}};
 step(raw);
}
console.log('PASS section index: exact full-codec parity, unchanged section reuse, secrets, tombstones, empty/legacy shapes and 120 mixed edits');

// Run the actual auth snapshot hook: timing must neither bypass cleaning nor
// swallow downstream failures. No world/state data is included in diagnostics.
const logs=[];let clock=0;
const authContext={module:{exports:{}},Date:{now:()=>clock+=120},console:{log:value=>logs.push(value)}};
vm.createContext(authContext);vm.runInContext(fs.readFileSync(require.resolve('../pocketbase/pb_hooks/grpgi_auth_v212.js'),'utf8'),authContext);
const fields={campaignId:'test',revision:7,worldJson:{equipment:{password:'never log this',name:'Item'}},stateJson:{users:{gm:{passwordHash:'never log this',role:'gm'}}}};
const event={record:{get:key=>JSON.stringify(fields[key]),set:(key,value)=>{fields[key]=value;},getString:key=>String(fields[key]),getInt:key=>fields[key]},next(){assert.equal(fields.worldJson.equipment.password,undefined);assert.equal(fields.stateJson.users.gm.passwordHash,undefined);}};
authContext.module.exports.protectSnapshot(event);assert.equal(logs.length,1);assert(!logs[0].includes('never log this'));
const timing=JSON.parse(logs[0].slice(logs[0].indexOf('{')));assert.equal(timing.authCleanMs,120);assert.equal(timing.downstreamMs,120);assert.equal(timing.failed,false);
event.next=()=>{throw Error('database failure');};assert.throws(()=>authContext.module.exports.protectSnapshot(event),/database failure/);assert(logs[1].includes('"failed":true'));assert(!logs[1].includes('database failure'));
authContext.console.log=()=>{throw Error('log failure');};event.next=()=>{};assert.doesNotThrow(()=>authContext.module.exports.protectSnapshot(event));
console.log('PASS actual auth hook: credential cleaning, downstream execution/failure and payload-free phase timings');
