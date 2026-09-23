const assert=require('node:assert/strict');
const path=require('node:path');
const {Worker}=require('node:worker_threads');

const root=path.resolve(__dirname,'..');
function runWorker(payload){return new Promise((resolve,reject)=>{const worker=new Worker(path.join(root,'lua-sandbox-worker.cjs'));const timer=setTimeout(()=>{worker.terminate();reject(new Error('worker timeout'));},5000);worker.once('message',message=>{clearTimeout(timer);worker.terminate();resolve(message);});worker.once('error',reject);worker.postMessage(payload);});}

const units=[
  {id:'p1',name:'Medic',kind:'player',teamId:'players',hpCurrent:8,hpMax:8,x:0,y:0,stats:{armorClass:14,baseArmorClass:12,shieldArmorClass:2,absorption:5,baseAbsorption:1,armorAbsorption:2,shieldAbsorption:2},abilities:['first_aid'],trained:['medicine'],reactionAvailable:true,movementMode:'swim',conditions:{dying:false,stabilized:false,prone:false,stunned:false,grappled:false,unconscious:false,handsBusy:false},inventory:[{itemId:'medkit',id:'medkit',type:'gear',qty:1,charges:3,chargesMax:3}],equipped:[],distances:{n1:2}},
  {id:'n1',name:'Guard',kind:'npc',teamId:'npcs',hpCurrent:6,hpMax:6,x:2,y:0,stats:{armorClass:15,baseArmorClass:13,shieldArmorClass:2,absorption:4,baseAbsorption:0,armorAbsorption:2,shieldAbsorption:2},abilities:[],trained:[],reactionAvailable:true,movementMode:'ground',conditions:{dying:false,stabilized:false,prone:false,stunned:false,grappled:false,unconscious:false,handsBusy:false},inventory:[],equipped:[{itemId:'rifle',id:'rifle',name:'Rifle',type:'weapon',slot:'primaryWeapon',qty:1,ammo:0,magazineSize:6,ammoTypeId:'round'},{itemId:'shield',id:'shield',name:'Shield',type:'armor',slot:'secondaryWeapon',qty:1,durability:4,durabilityMax:5,broken:false}],distances:{p1:2}}
];
const input={source:{id:'reaction_reload',name:'Reaction reload',kind:'skill',ownerId:'p1'},units,params:{attackerId:'n1',targetId:'p1',casterId:'p1',targetIds:['p1'],damage:7,damageType:'light'}};

(async()=>{
  const apiScript=`
function OnAttackDeclared(self, params)
  local caster = self:GetCaster()
  local enemy = params.attacker
  if caster:HasReaction() and caster:IsTrained('medicine') and caster:HasAbility('first_aid')
    and caster:IsSwimming() and caster:GetArmorAbsorption() == 2 and caster:GetShieldArmorClass() == 2
    and enemy:IsNPC() and enemy:HasItem('rifle') and enemy:HasItemType('weapon')
    and enemy:IsWeaponEmpty('primaryWeapon') and not enemy:IsShieldDestroyed('secondaryWeapon')
    and caster:GetCharges('medkit') == 3 then
    SpendReaction(caster)
    Reload(enemy, 'primaryWeapon')
    SetHandsBusy(enemy, true)
    SetMovementMode(enemy, 'climb')
    DamageItem(enemy, 'secondaryWeapon', 2)
    SpendCharges(caster, 'medkit', 1)
    CreateVisionZone(caster, { id='smoke', radius=3, durationRounds=2 })
    SetVisionThroughZone('old_smoke', true)
    SetArmorPenetration(2, 'armor')
    AddDamage(3, { absorptionSource='shield', ignorePercent=50 })
    StandardAttack(caster, enemy, { slot='primaryWeapon', consumeAction=false })
    AddCredits(caster, 25, 'lua_credit_test')
  end
end`;
  const first=await runWorker({mode:'execute',hook:'OnAttackDeclared',script:apiScript,input});
  assert.equal(first.ok,true,first.message);
  assert.deepEqual(first.result.commands.map(row=>row.kind),['spend_reaction','reload','set_condition','set_movement_mode','damage_item','spend_charges','create_thinker','set_thinker_vision','set_armor_penetration','add_damage','standard_attack','add_credits']);
  assert.equal(first.result.commands[6].blockSight,true);
  assert.equal(first.result.commands[9].absorptionSource,'shield');
  assert.equal(first.result.commands[9].ignorePercent,50);

  const interactiveScript=`
function OnHit(self, params)
  local targets = RequestTargets({ key='combo_targets', origin=params.attacker, relation='enemy', max=1, min=1, title='Комбо щитом' })
  local roll = RequestRoll('combo_roll', 'Бросок комбо', { min=1, max=20 })
  if #targets > 0 then
    StandardAttack(params.attacker, targets[1], { consumeAction=false })
    if roll >= 10 then SetStunned(targets[1], true) end
  end
end`;
  const request=await runWorker({mode:'execute',hook:'OnHit',script:interactiveScript,input});
  assert.equal(request.ok,true,request.message);
  assert.deepEqual(request.result.commands.map(row=>row.kind),['request_targets','request_number']);
  assert.equal(request.result.commands[0].key,'combo_targets');
  const resolved=await runWorker({mode:'execute',hook:'OnHit',script:interactiveScript,input:{...input,params:{...input.params,targetRequests:{combo_targets:['n1']},inputs:{combo_roll:14}}}});
  assert.equal(resolved.ok,true,resolved.message);
  assert.deepEqual(resolved.result.commands.map(row=>row.kind),['standard_attack','set_condition']);
  assert.equal(resolved.result.commands[1].name,'stunned');
  console.log('ALL V138 LUA COMBAT API CHECKS PASSED');
})().catch(error=>{console.error(error);process.exitCode=1;});
