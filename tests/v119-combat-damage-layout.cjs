'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {Worker}=require('node:worker_threads');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const rulesSource=read('renderer/combat-rules-v119.js');
const sceneSource=read('renderer/scene-editor-v113.js');
const featureSource=read('renderer/feature-pack-v119.js');
const cssSource=read('renderer/feature-pack-v119.css');
const htmlSource=read('renderer/index.html');
const mainSource=read('main.js');
const preloadSource=read('preload.js');
const pkg=JSON.parse(read('package.json'));

const context={console,Math};context.window=context;context.globalThis=context;
vm.createContext(context);vm.runInContext(rulesSource,context,{filename:'combat-rules-v119.js'});
const Rules=context.GRPGCombatRulesV119;

assert.equal(Rules.requiresManualDamage('2d6+1'),true);
assert.equal(Rules.requiresManualDamage('4'),false);
assert.equal(Rules.suggestedDamage('4'),4);
assert.doesNotMatch(rulesSource,/Math\.random|rollDie|rollDamage/);

const hit=Rules.resolveManualAttack({attackRoll:15,defenseRoll:3,attackBonus:4,defenseBonus:2,damageRoll:4,damageBonus:2,damageReduction:1});
assert.equal(hit.hit,true);assert.equal(hit.attackTotal,19);assert.equal(hit.defenseTotal,5);assert.equal(hit.rawDamage,6);assert.equal(hit.damageApplied,5);
const miss=Rules.resolveManualAttack({attackRoll:2,defenseRoll:18,attackBonus:0,defenseBonus:8,damageRoll:20});
assert.equal(miss.hit,false);assert.equal(miss.damageApplied,0);
const naturalOneByTotal=Rules.resolveManualAttack({attackRoll:1,defenseRoll:1,attackBonus:12,defenseBonus:0,damageRoll:4});
assert.equal(naturalOneByTotal.hit,false);assert.equal(naturalOneByTotal.fumble,true);assert.equal(naturalOneByTotal.damageApplied,0);
const critical=Rules.resolveManualAttack({attackRoll:20,defenseRoll:20,attackBonus:0,defenseBonus:99,damageRoll:3,damageReduction:1});
assert.equal(critical.critical,true);assert.equal(critical.defenseCritical,true);assert.equal(critical.hit,true);assert.equal(critical.damageApplied,3);
const target={hpCurrent:12,hpMax:12};assert.deepEqual(JSON.parse(JSON.stringify(Rules.applyDamage(target,5))),{before:12,after:7,applied:5});assert.equal(Rules.applyHeal(target,2).after,9);

function runWorker(payload){return new Promise((resolve,reject)=>{const worker=new Worker(path.join(root,'lua-sandbox-worker.cjs'));const timer=setTimeout(()=>{worker.terminate();reject(new Error('worker test timeout'));},3000);worker.once('message',message=>{clearTimeout(timer);worker.terminate();resolve(message);});worker.once('error',reject);worker.postMessage(payload);});}

(async()=>{
  const script=`
function CanBeforeDamage(self, params)
  local caster = self:GetCaster()
  return params.target:IsAlly(caster) and caster:DistanceTo(params.target) <= 2 and caster:HasAbility('sample') and params.target:IsPlayer()
end
function BeforeDamage(self, params)
  local caster = self:GetCaster()
  MoveBetween(caster, params.attacker, params.target, 1)
  ReduceDamage(caster:GetDexterity())
  Heal(caster, params.target, 2)
  CreateParticle('shield', { unit = params.target })
  EmitSound('shield')
end
function OnAbilityPhaseStart(self, params)
  ShowArea(self:GetCaster(), { shape = 'circle', radius = 3 })
  RequestTargets({ origin = self:GetCaster(), radius = 3, max = 2, relation = 'enemy', players = false, npcs = true })
  RequestRoll('damage', 'Итог броска урона')
end
function OnAbilityExecuted(self, params)
  for _, unit in ipairs(params.targets) do InflictDamage(self:GetCaster(), unit, params:GetInput('damage') + self:GetCaster():GetIntelligence()) end
end`;
  const input={source:{id:'shield',name:'Shield',kind:'skill',ownerId:'p1'},units:[{id:'p1',name:'Player',kind:'player',teamId:'players',hpCurrent:8,hpMax:10,x:1,y:1,stats:{dexterity:4,intelligence:3},abilities:['sample'],items:[],distances:{p2:1,n1:2}},{id:'p2',name:'Ally',kind:'player',teamId:'players',hpCurrent:4,hpMax:10,x:2,y:1,stats:{dexterity:2},abilities:[],items:[],distances:{p1:1,n1:1}},{id:'n1',name:'Enemy',kind:'npc',teamId:'npcs',hpCurrent:9,hpMax:9,x:3,y:1,stats:{dexterity:1},abilities:[],items:[],distances:{p1:2,p2:1}}],params:{attackerId:'n1',targetId:'p2',casterId:'p1',targetIds:['p2'],damage:5,inputs:{damage:7}}};
  const check=await runWorker({mode:'check',hook:'BeforeDamage',script,input});assert.equal(check.ok,true);assert.equal(check.result.eligible,true);assert.equal(check.result.commands.length,0);
  const reaction=await runWorker({mode:'execute',hook:'BeforeDamage',script,input});assert.equal(reaction.ok,true);assert.deepEqual(reaction.result.commands.map(row=>row.kind),['move_between','reduce_damage','heal','particle','sound']);assert.equal(reaction.result.commands[1].amount,4);
  const ability=await runWorker({mode:'execute',hook:'OnAbilityExecuted',script,input:{...input,params:{...input.params,targetIds:['n1']}}});assert.equal(ability.result.commands[0].kind,'damage');assert.equal(ability.result.commands[0].amount,10);
  const unsafe=await runWorker({mode:'validate',script:`if os ~= nil or io ~= nil or require ~= nil or debug ~= nil or package ~= nil or math.random ~= nil or math.randomseed ~= nil then error('unsafe globals') end\nfunction OnHit() end`,input:{}});assert.equal(unsafe.ok,true);assert.deepEqual(unsafe.result.hooks,['OnHit']);

  assert.match(sceneSource,/reactionUsedV119/);assert.match(sceneSource,/resolveManualAttack/);assert.match(sceneSource,/requestAttackRolls119/);assert.match(sceneSource,/chooseReaction119/);assert.match(sceneSource,/OnAbilityPhaseStart/);assert.match(sceneSource,/RequestTargets|request_targets/);assert.match(sceneSource,/HP \$\{hpChange\.before\} → \$\{hpChange\.after\}/);
  assert.match(featureSource,/name=\"luaScript\"/);assert.match(featureSource,/data-validate-lua-v119/);assert.match(featureSource,/luaTriggerMode/);
  assert.match(mainSource,/runCombatLuaWorker/);assert.match(mainSource,/worker\.terminate/);assert.match(preloadSource,/runCombatLuaHook/);assert.ok(pkg.dependencies.wasmoon);assert.ok(pkg.build.files.includes('lua-sandbox-worker.cjs'));assert.ok(pkg.build.files.includes('LUA_COMBAT_SCRIPTING.md'));
  assert.match(cssSource,/grid-template-rows:minmax\(0,1fr\) clamp\(88px,24vh,190px\)!important/);assert.match(cssSource,/scene-lua-overlay-v119/);assert.match(cssSource,/overflow-y:auto!important/);
  assert.ok(htmlSource.indexOf('combat-rules-v119.js')<htmlSource.indexOf('scene-editor-v113.js'));assert.ok(htmlSource.indexOf('feature-pack-v118.js')<htmlSource.indexOf('feature-pack-v119.js'));
  assert.ok(Number(pkg.version.split('.').at(-1))>=119);assert.equal(pkg.buildVersion,`${pkg.version}.0`);
  console.log('v1.0.119+ manual combat, Lua sandbox and layout checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
