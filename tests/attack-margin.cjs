const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {Worker} = require('node:worker_threads');
const context = {};
context.window = context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../renderer/combat-rules-v119.js'),'utf8'),context);
const R = context.GRPGCombatRulesV119;
const normal=R.resolveManualAttack({attackRoll:12,defenseRoll:10,attackBonus:5,defenseBonus:2,damageRoll:1,damageReduction:50});
assert.equal(normal.attackTotal,17);
assert.equal(normal.defenseTotal,12);
assert.equal(normal.attackMargin,5);
assert.equal(normal.hit,true);
assert.equal(normal.damageApplied,0);
const critical=R.resolveManualAttack({attackRoll:20,defenseRoll:20,attackBonus:0,defenseBonus:30,damageRoll:1});
assert.equal(critical.critical,true);
assert.equal(critical.attackMargin,-30);
const next=R.resolveManualAttack({attackRoll:8,defenseRoll:10,attackBonus:5,defenseBonus:2});
assert.equal(next.attackMargin,1);
assert.equal(R.resolveManualAttack({attackRoll:12}).attackMargin,undefined);
function run(params,kind) {
  return new Promise((resolve,reject)=>{
    const w=new Worker(path.join(__dirname,'../lua-sandbox-worker.cjs'));
    const timer=setTimeout(()=>{w.terminate();reject(Error('timeout'));},5000);
    w.once('error',reject);
    w.once('message',r=>{clearTimeout(timer);w.terminate();resolve(r);});
    w.postMessage({mode:'execute',hook:'OnHit',script:`function OnHit(self,p)
      assert(p.attackRoll == 12 and p.defenseRoll == 10)
      if p.attackMargin ~= nil then
        assert(p.attackMargin == p.attackTotal-p.defenseTotal)
        if p.attackMargin >= 5 then Log('threshold') end
      end
    end`,input:{source:{id:'margin',kind,ownerId:'a'},units:[{id:'a'}],params:{attackRoll:12,defenseRoll:10,...params}}});
  });
}
(async()=>{
  for(const kind of ['equipment','ammo','skill','implant']) {
    const r=await run({attackTotal:17,defenseTotal:12,attackMargin:5},kind);
    assert.equal(r.ok,true,r.message);
    assert.equal(r.result.commands[0].text,'threshold');
  }
  for(const params of [{},{attackTotal:0,defenseTotal:0,attackMargin:0},{attackTotal:20,defenseTotal:50,attackMargin:-30}]) {
    const r=await run(params,'skill');assert.equal(r.ok,true,r.message);assert.equal(r.result.commands.length,0);
  }
  console.log('PASS attack margin, inclusive threshold, blocked damage, critical below threshold, fresh shot, no defense, Lua source kinds and legacy rolls');
})().catch(e=>{console.error(e);process.exitCode=1;});
