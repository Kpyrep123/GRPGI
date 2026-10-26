const assert=require('node:assert/strict'),path=require('node:path'),{Worker}=require('node:worker_threads');
function run(script,units){return new Promise((resolve,reject)=>{const w=new Worker(path.join(__dirname,'../lua-sandbox-worker.cjs')),timer=setTimeout(()=>{w.terminate();reject(Error('Lua worker timeout'));},5000);w.once('message',message=>{clearTimeout(timer);w.terminate();resolve(message);});w.once('error',reject);w.postMessage({mode:'execute',hook:'OnAbilityExecuted',script,input:{source:{id:'medic',ownerId:'p'},units,params:{casterId:'p'}}});});}
(async()=>{
 const units=[{id:'p',name:'Medic',hpCurrent:8,hpMax:10,injuryDegree:5,checkPenalty:5,checkDisadvantage:true,heavyWeaponRestricted:false,reactionAvailable:true,stats:{strength:3}}];
 const result=await run(`function OnAbilityExecuted(self, params)
 local p=self:GetCaster()
 if p:GetInjuryDegree()==5 and p:GetCheckPenalty()==5 and p:HasCheckDisadvantage() and not p:IsHeavyWeaponRestricted() and p:HasReaction() and p:GetStrength()==3 then
   Heal(p,p,2)
   HealInjury(p,1)
   p:HealInjury(2)
 end
end`,units);
 assert.equal(result.ok,true,result.message);assert.deepEqual(result.result.commands.map(c=>[c.kind,c.amount]),[['heal',2],['heal_injury',1],['heal_injury',2]]);
 for(const value of ['0','-1','1.5']){const r=await run(`function OnAbilityExecuted(self, params) HealInjury(self:GetCaster(), ${value}) end`,units);assert.equal(r.ok,false);assert.match(r.message,/положительное целое/);}
 const missing=await run('function OnAbilityExecuted(self, params) HealInjury("missing",1) end',units);assert.equal(missing.ok,false);assert.match(missing.message,/цель не найдена/);
 console.log('PASS actual Lua worker: injury/check getters, unchanged attributes, HP heal versus injury treatment, method/global API and invalid treatment rejection');
})().catch(error=>{console.error(error);process.exitCode=1;});
