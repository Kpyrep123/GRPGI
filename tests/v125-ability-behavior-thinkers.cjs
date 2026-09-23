'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Worker}=require('node:worker_threads');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const workerSource=read('lua-sandbox-worker.cjs');
const scene=read('renderer/scene-editor-v113.js');
const feature=read('renderer/feature-pack-v119.js');
const skillNormalize=read('renderer/feature-pack-v120.js');
const docs=read('LUA_COMBAT_SCRIPTING.md');
const html=read('renderer/index.html');
const pkg=JSON.parse(read('package.json'));
const lock=JSON.parse(read('package-lock.json'));

assert.match(workerSource,/ABILITY_BEHAVIOR_UNIT_TARGET/);
assert.match(workerSource,/ABILITY_BEHAVIOR_PERSISTENT_AREA/);
assert.match(workerSource,/CreateThinker/);
assert.match(workerSource,/OnThinkerInterval/);
assert.match(feature,/name="abilityBehavior"/);
assert.match(feature,/toggle_aura/);
assert.match(skillNormalize,/abilityBehavior/);
assert.match(scene,/resolveAbilityTargets125/);
assert.match(scene,/processThinkers125/);
assert.match(scene,/thinkerZoneModels125/);
assert.match(scene,/if\(!combat\.scenes\[id\]&&local\.loaded&&local\.store\?\.runtimes\?\.\[id\]\)combat\.scenes\[id\]=clone\(local\.store\.runtimes\[id\]\)/);
assert.match(scene,/Configurator\.persistAll=async function/);
assert.match(docs,/ABILITY_BEHAVIOR_AREA/);
assert.match(docs,/OnThinkerDestroyed/);
assert.match(html,/APP: v1\.0\.132/);
assert.equal(pkg.version,'1.0.132');
assert.equal(pkg.buildVersion,'1.0.132.0');
assert.equal(pkg.build.buildVersion,'1.0.132.0');
assert.equal(lock.version,'1.0.132');
assert.equal(lock.packages[''].version,'1.0.132');

function runWorker(payload){return new Promise((resolve,reject)=>{const worker=new Worker(path.join(root,'lua-sandbox-worker.cjs'));const timer=setTimeout(()=>{worker.terminate();reject(new Error('worker timeout'));},3000);worker.once('message',message=>{clearTimeout(timer);worker.terminate();resolve(message);});worker.once('error',reject);worker.postMessage(payload);});}

(async()=>{
  const script=`
function GetBehavior(self) return ABILITY_BEHAVIOR_AREA end
function GetCastRange(self) return 6 end
function GetAOERadius(self) return 2 end
function GetThinkerDuration(self) return 4 end
function GetThinkerInterval(self) return 1 end
function OnAbilityExecuted(self, params)
  CreateThinker(self:GetCaster(), {
    id = 'field', name = 'Field', position = params.position,
    radius = 2, durationRounds = 4, intervalRounds = 1,
    relation = 'enemy', units = true
  })
end
function OnThinkerInterval(self, params)
  for _, target in ipairs(params.targets) do target:Heal(1, self:GetCaster()) end
end`;
  const input={source:{id:'field_skill',name:'Field',kind:'skill',ownerId:'p1'},units:[{id:'p1',kind:'player',teamId:'players',hpCurrent:5,hpMax:5,x:1,y:1,stats:{}},{id:'n1',kind:'npc',teamId:'npcs',hpCurrent:3,hpMax:5,x:4,y:5,stats:{}}],params:{casterId:'p1',position:{x:4,y:5},targetIds:['n1']}};
  const metadata=await runWorker({mode:'metadata',script,input});
  assert.equal(metadata.ok,true);
  assert.deepEqual(metadata.result.metadata,{GetBehavior:'area',GetCastRange:6,GetAOERadius:2,GetThinkerDuration:4,GetThinkerInterval:1});
  const created=await runWorker({mode:'execute',hook:'OnAbilityExecuted',script,input});
  assert.equal(created.ok,true);
  assert.equal(created.result.commands[0].kind,'create_thinker');
  assert.equal(created.result.commands[0].x,4);
  assert.equal(created.result.commands[0].durationRounds,4);
  const ticked=await runWorker({mode:'execute',hook:'OnThinkerInterval',script,input:{...input,params:{...input.params,thinker:{id:'field',position:{x:4,y:5},radius:2}}}});
  assert.equal(ticked.ok,true);
  assert.equal(ticked.result.commands[0].kind,'heal');
  assert.equal(ticked.result.commands[0].targetId,'n1');
  console.log('V125_ABILITY_BEHAVIOR_THINKERS_OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
