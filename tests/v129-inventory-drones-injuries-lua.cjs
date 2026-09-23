const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Worker}=require('node:worker_threads');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const app=read('renderer/app.js');
const feature=read('renderer/feature-pack-v120.js');
const stats=read('renderer/stats-engine-v113.js');
const scene=read('renderer/scene-editor-v113.js');
const workerSource=read('lua-sandbox-worker.cjs');
const docs=read('LUA_COMBAT_SCRIPTING.md');
const pkg=JSON.parse(read('package.json'));

assert.equal(pkg.version,'1.0.132');
assert.equal(pkg.buildVersion,'1.0.132.0');
assert.match(app,/data-wc-inventory-qty-v129/);
assert.match(app,/wcInventoryCloneAndValidateV1068\(state\)/);
assert.match(feature,/hasStackSetting/);
assert.match(feature,/entity\.unitHp=Math\.max/);
assert.match(feature,/rapidFireShotsV129/);
assert.match(feature,/activeUseV129/);
assert.match(feature,/freeDroneControlV129/);
assert.doesNotMatch(stats,/name="rapidFireShotsV122"[^>]*max="3"/);
assert.match(scene,/!isDroneToken129\(token\)/);
assert.match(scene,/operatorIntelligence129\(operator\)\+operatorDroneSkill129\(operator\)/);
assert.match(scene,/distance>30/);
assert.match(scene,/injuryMinimumDegree129/);
assert.match(scene,/injurySpeed129/);
assert.match(scene,/data-scene-deploy-v129="turret"/);
assert.match(scene,/data-scene-command-drone-v129/);
assert.match(scene,/burstPenalty=-\(shotIndex-1\)/);
assert.match(scene,/completeDroneModule129/);
assert.match(scene,/function activeEquipmentForToken129\(token=selectedToken104\(\)\)\{if\(!token\)return\[\]/);
assert.match(scene,/token=token&&typeof token==='object'\?token:\{\}/);
assert.match(workerSource,/function FindUnitInLine/);
assert.match(workerSource,/function Unit:GetItemCount/);
assert.match(workerSource,/function Unit:HasEquippedType/);
assert.match(docs,/## Поиск юнита на линии/);

function runWorker(payload){return new Promise((resolve,reject)=>{const worker=new Worker(path.join(root,'lua-sandbox-worker.cjs'));const timer=setTimeout(()=>{worker.terminate();reject(new Error('worker timeout'));},3000);worker.once('message',message=>{clearTimeout(timer);worker.terminate();resolve(message);});worker.once('error',reject);worker.postMessage(payload);});}

(async()=>{
  const script=`
function OnAbilityExecuted(self, params)
  local caster = self:GetCaster()
  if caster:HasItem('medkit', 2)
    and caster:HasItemType('gear', 2)
    and caster:HasEquippedItem('armor_x')
    and caster:HasEquippedType('armor')
    and caster:GetEquippedItem('armor') == 'armor_x' then
    local target = FindUnitInLine(Vector(0, 0), Vector(5, 0), {
      origin = caster,
      relation = 'enemy',
      players = true,
      npcs = true,
      units = true,
      alive = true,
      ignore = { caster }
    })
    if target then InflictDamage(caster, target, caster:GetItemCount('medkit') + 5) end
  end
end`;
  const input={source:{id:'scanner',name:'Scanner',kind:'equipment',ownerId:'p1'},units:[
    {id:'p1',name:'Operator',kind:'player',teamId:'players',hpCurrent:8,hpMax:8,x:0,y:0,stats:{intelligence:4},abilities:[],items:['medkit','armor_x'],inventory:[{itemId:'medkit',name:'Medkit',type:'gear',qty:2,tags:[]}],equipped:[{itemId:'armor_x',name:'Armor',type:'armor',slot:'armor',tags:[]}],distances:{n1:2,n2:4}},
    {id:'n1',name:'Near enemy',kind:'npc',teamId:'npcs',hpCurrent:5,hpMax:5,x:2,y:0,stats:{},abilities:[],items:[],inventory:[],equipped:[],distances:{p1:2,n2:2}},
    {id:'n2',name:'Far enemy',kind:'npc',teamId:'npcs',hpCurrent:5,hpMax:5,x:4,y:0,stats:{},abilities:[],items:[],inventory:[],equipped:[],distances:{p1:4,n1:2}}
  ],params:{casterId:'p1'}};
  const result=await runWorker({mode:'execute',hook:'OnAbilityExecuted',script,input});
  assert.equal(result.ok,true,result.message);
  assert.equal(result.result.commands.length,1);
  assert.equal(result.result.commands[0].kind,'damage');
  assert.equal(result.result.commands[0].targetId,'n1');
  assert.equal(result.result.commands[0].amount,7);
  console.log('V129_INVENTORY_DRONES_INJURIES_LUA_OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
