// npm install --prefix /tmp/grpgi-test-dom happy-dom
// HAPPY_DOM_MODULE=/tmp/grpgi-test-dom/node_modules/happy-dom/lib/index.js node tests/v134-world-config-full-load.mjs
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const {Window}=await import(process.env.HAPPY_DOM_MODULE?pathToFileURL(process.env.HAPPY_DOM_MODULE):'happy-dom');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-v134-'));
const errors=[];
const w=new Window({url:'https://grpgi.test',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true,disableComputedStyleRendering:true}});
const context=vm.isContext(w)?w:vm.createContext(w);
const run=code=>vm.runInContext(code,context);
w.setInterval=()=>0;w.requestAnimationFrame=()=>0;
const windowAdd=w.addEventListener.bind(w),documentAdd=w.document.addEventListener.bind(w.document);
w.addEventListener=(type,...args)=>{if(type!=='load')return windowAdd(type,...args)};
w.document.addEventListener=(type,...args)=>{if(type!=='DOMContentLoaded')return documentAdd(type,...args)};
w.console={...console,log(){},debug(){},warn(...args){errors.push(args.map(String).join(' '))},error(...args){errors.push(args.map(String).join(' '))}};
w.electronAPI={appVersion:'1.0.134',debugLog:async()=>{},saveWorldData:async world=>{
 fs.writeFileSync(path.join(scratch,'world.json'),JSON.stringify(world));return{ok:true,world:JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'))};
},loadWorldData:async()=>({ok:true,world:JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'))}),saveWorldSection:async(type,payload)=>{
 const world=JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'));world[type]=payload;fs.writeFileSync(path.join(scratch,'world.json'),JSON.stringify(world));return{ok:true};
},exportWorldSectionJson:async(type,payload)=>{fs.writeFileSync(path.join(scratch,type+'.json'),JSON.stringify(payload));return{ok:true,fileName:type+'.json'}}};
const html=fs.readFileSync(path.join(root,'renderer/index.html'),'utf8');
w.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
// Every renderer script is evaluated unmodified, in index.html order, sharing
// browser-style lexical globals. Only OS/cloud/bootstrap boundaries are mocked.
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g)){let source=fs.readFileSync(path.join(root,'renderer',m[1]),'utf8');if(m[1]==='scene-editor-v113.js')source=source.replace('// New module is DM-only;','window.test215={wear:wearArmorOnTwentyV215,defense:incomingDefense119,state:itemRuntimeStateV138,mutate:mutateItemStateV138,meleeOutcome:meleeOutcome256,attackFailure:attackFailure256,requestAttackRolls:requestAttackRolls119,applyDelayedHits:applyDelayedHits256,damageType:damageType202,applyWeaponHit:applyWeaponHit261,absorb:applyAbsorptionV138,cancelImmuneAttack:cancelImmuneAttack263,showLoot:showLootOverlay118,renderSearch:renderSearchAction118,jamOnHit:jamOnHit258,jamState:jamState258,reload:reloadUnitV138,bonusDie:bonusDie258,secondaryHit:secondaryHit258,fitToken:fitTokenToHex107,center:centerOf,normalizeToken:normalizeCombatToken};\n// New module is DM-only;');vm.runInContext(source,context,{filename:m[1]});}



const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
try {
run(`
  applyWorldData({
    equipment:{EQUIPMENT:{
      armor:{id:'armor',name:'Панцирь',type:'armor',durabilityMax:1,energyProtection:true,armorClass:3,damageReduction:2},
      gun:{id:'gun',name:'Карабин',type:'weapon',weaponSlot:'versatile',durabilityMax:5,rarity:'редкий'}
    }},
    campaigns:{ABERRATION_SETTINGS:{main:{variants:{"weapon-6-1":{value:"energy",cost:3}}}}},
    players:{PLAYER_TEMPLATES:{
      gm:{id:'gm',role:'gm',displayName:'GM'},
      p:{id:'p',role:'player',displayName:'Player',abilityBase:{dexterity:1},baseStats:{hpBase:10,armorClass:0,defense:0,inventorySlots:20,carryBase:50},
         inventory:[{itemId:'gun',qty:3},{itemId:'armor',qty:1}],
         equipmentSlots:{primaryWeapon:'gun',secondaryWeapon:'gun',armor:'armor'},
         itemStateV138:{gun:{itemId:'gun',slot:'secondaryWeapon',durabilityMax:5,durability:1}}}
    }}
  });
  App.state=makeDefaultState();App.currentUserId='gm';App.renderLive=()=>{};
  PlayerSync.shouldIsolateUsersFromSnapshot=()=>false;
  App._writeLocalMirrorsV135=async()=>({ok:true});
  window.notices215=[];Toast.show=(message,type)=>notices215.push([message,type]);
  window.target215={id:'p-token',playerId:'p',name:'Player',hpCurrent:10,hpMax:10};
  window.enemy215={id:'npc-token',npcId:'enemy'};
  window.runtime215={tokens:[target215,enemy215],log:[]};
  Combat.getRuntime=()=>runtime215;
`);
const I=w.GRPGItemInstancesV215, profile=()=>run('App.state.users.p');
const copies=()=>profile().inventory.find(r=>r.itemId==='gun').instancesV215;
assert.equal(copies().length,3);
assert.equal(new Set(copies().map(c=>c.id)).size,3);
const primary=copies().find(c=>c.slot==='primaryWeapon'),secondary=copies().find(c=>c.slot==='secondaryWeapon');
assert.equal(primary.durability,5);
assert.equal(secondary.durability,1,'legacy wear goes to the identified equipped copy');
run(`test215.mutate(target215,'primaryWeapon','damage_item',2)`);
assert.equal(copies().find(c=>c.id===primary.id).durability,3);
assert.equal(copies().find(c=>c.id===secondary.id).durability,1);
w.secondary215=secondary.id;run(`test215.mutate(target215,secondary215,'break_item')`);
assert(copies().find(c=>c.id===secondary.id).broken);
assert(!copies().find(c=>c.id===primary.id).broken);
run(`Configurator.selectedType='players';Configurator.selectedId='p';Configurator.render();`);
const button=Array.from(w.document.querySelectorAll('[data-wc-durability-save-v215]')).find(b=>b.dataset.wcDurabilitySaveV215===secondary.id);
assert(button,'WC lists the actual copy');
button.closest('[data-wc-durability-row-v215]').querySelector('input').value='4';button.click();await pause();
assert.equal(copies().find(c=>c.id===secondary.id).durability,4);
assert(!copies().find(c=>c.id===secondary.id).broken);
assert.equal(copies().find(c=>c.id===primary.id).durability,3);
assert.deepEqual(JSON.parse(JSON.stringify(w.notices215.filter(n=>n[1]==='err'))),[]);
const before=run("test215.defense(target215,'light',null,'energy')");
assert(before.armorAbsorption>0);assert(before.baseArmorClass>1);
assert.equal(run("test215.wear(enemy215,target215,19)"),false);
assert.equal(run("test215.wear({id:'ally',playerId:'q'},target215,20)"),false);
assert.equal(run("test215.wear(enemy215,target215,20)"),true);
const after=run("test215.defense(target215,'light',null,'energy')");
assert.equal(after.armorAbsorption,0);assert(after.baseArmorClass<before.baseArmorClass);
assert.equal(run("test215.defense(target215,'light',null,'kinetic').armorAbsorption"),0);
assert.equal(run("test215.wear(enemy215,target215,20)"),false);
assert.match(run('runtime215.log[0].text'),/СЛОМАНА/);
const stored=JSON.parse(JSON.stringify(profile()));
const armor=stored.inventory.find(row=>row.itemId==='armor').instancesV215[0];
assert.equal(armor.durability,0);assert(armor.broken);
const gun=stored.inventory.find(row=>row.itemId==='gun'),free=gun.instancesV215.find(c=>!c.slot);
free.modifiers=[{target:'attack_bonus',op:'add',value:2}];
I.bind(stored,'gun','secondaryWeapon',free.id);
w.persisted215=stored;
const normalized=run('normalizePlayerProfileV2(persisted215)');
assert.equal(normalized.inventory.find(row=>row.itemId==='gun').instancesV215[1].id,free.id);
assert.equal(normalized.inventory.find(row=>row.itemId==='gun').instancesV215[1].modifiers[0].value,2);
assert.equal(normalized.inventory.find(row=>row.itemId==='gun').instancesV215.find(c=>c.id===secondary.id).durability,4);
assert.equal(fs.readFileSync('renderer/item-instances-v215.js','utf8'),fs.readFileSync('deploy/site/app/item-instances-v215.js','utf8'));
assert.equal(fs.readFileSync('renderer/item-instances-v215.js','utf8'),fs.readFileSync('pocketbase/pb_hooks/item-instances-v215.js','utf8'));
run(`
  Combat.getScene=()=>({id:'aberration-test',mode:'combat'});
  runtime215.round=1;
  Object.assign(enemy215,{name:'Enemy',hpCurrent:10,hpMax:10,ownTurnV199:1});
  const equippedCopy215=GRPGItemInstancesV215.instance(App.state.users.p,'gun',-1,'primaryWeapon');
  equippedCopy215.aberration252={rarity:'epic',budget:6,effects:['weapon-14-1','weapon-17-1']};
  window.melee215={id:'gun',weaponCategory:'melee'};
  equippedCopy215.aberration252.effects.push('weapon-6-2','weapon-7-1');
  test215.meleeOutcome(target215,melee215,enemy215,{hit:false},3);
`);
assert.equal(run("test215.damageType(melee215,null,target215,'primaryWeapon')"),'energy');
assert.equal(run("test215.damageType(melee215,{damageType:'gas'},target215,'primaryWeapon')"),'gas');
assert.equal(run("test215.damageType(melee215,null,target215,'secondaryWeapon')"),'kinetic');
assert.equal(run("GRPGInventoryV113.weight(App.state.users.p)"),4.3);
assert.equal(run("GRPGCombatMovementV198.weight(App.state.users.p.inventory,['gun'],id=>GRPGInventoryV113.item(id))"),4.3);
assert.equal(run('test215.attackFailure(target215,enemy215)?.amount'),1);
assert.equal(run('test215.attackFailure(target215,target215)'),null);
const requestAttack=()=>run('test215.requestAttackRolls({attacker:enemy215,target:target215,weapon:melee215,ammo:null,attackBonus:0,defenseBonus:0,damageBonus:0})');
const waitAttackForm=async()=>{
  for(let attempt=0;attempt<10;attempt++){
    const form=w.document.querySelector('.scene-lua-modal-v119');
    if(form)return form;
    await pause();
  }
  assert.fail('missing attack roll form');
};
const canceled=requestAttack();
(await waitAttackForm()).querySelector('[data-lua-decline-v119]').click();
assert.equal(await canceled,null);
assert.equal(run('test215.attackFailure(target215,enemy215)?.amount'),1);
const confirmed=requestAttack();
const attackForm=await waitAttackForm();
for(const [field,value] of [['attackRoll','13'],['defenseRoll','10'],['damageRoll','3']])attackForm.elements[field].value=value;
attackForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
assert.equal((await confirmed).attackBonusDelta204,1);
assert.equal(run('test215.attackFailure(target215,enemy215)'),null);
run('test215.meleeOutcome(target215,melee215,enemy215,{hit:false},3);');
assert.equal(run('test215.attackFailure(target215,enemy215)'),null,'a second miss on the same round cannot reapply the bonus');
run('runtime215.round++;test215.meleeOutcome(target215,melee215,enemy215,{hit:false},3);');
assert.equal(run('test215.attackFailure(target215,enemy215)?.amount'),1);
run('target215.ownTurnV199=1;');
assert.equal(run('test215.attackFailure(target215,enemy215)'),null,'expires at the start of the next turn');
run(`
  test215.meleeOutcome(target215,melee215,enemy215,{hit:true,critical:true},3);
  test215.meleeOutcome(target215,melee215,enemy215,{hit:true},6);
  runtime215.tokens[1]=window.enemy215=test215.normalizeToken(enemy215);
  enemy215.equipmentType='drone';
`);
assert.equal(run('enemy215.aberrationDelayedHits256.length'),1);
await run('test215.applyDelayedHits(enemy215)');
assert.equal(run('enemy215.hpCurrent'),10,'no damage before the next turn');
run('enemy215.ownTurnV199++;');
await run('test215.applyDelayedHits(enemy215)');
assert.equal(run('enemy215.hpCurrent'),7,'only the base damage repeats');
await run('test215.applyDelayedHits(enemy215)');
assert.equal(run('enemy215.hpCurrent'),7,'the pending hit is consumed once');
run(`
  window.scene258={id:'aberration-test',mode:'combat',width:60,height:40,assets:[],templates:[]};
  Combat.getScene=()=>scene258;
  Combat.getSceneIdForView=()=>scene258.id;
  target215.lootStateV118={searched:true,items:[{itemId:'gun',qty:2,aberrations:[
    {rarity:'common',budget:0,effects:[]},{rarity:'rare',budget:4,effects:['weapon-5-1']}
  ]}]};
  test215.showLoot(target215);
`);
const loot=w.document.querySelector('.scene-loot-overlay-v118');
assert.equal(loot.parentElement,w.document.body);
assert.match(loot.textContent,/Обычное/);
assert.match(loot.textContent,/Редкое.*1d4/);
loot.querySelector('[data-loot-item-v137] b').click();
assert(w.document.querySelector('.scene-loot-menu-v137'),'click opens the transfer menu');
loot.querySelector('[data-scene-loot-close-v118]').click();
assert.equal(w.document.querySelector('.scene-loot-overlay-v118'),null);
run(`
  Data.getItem('gun').magazineSize=4;
  Data.getItem('gun').ammoTypeId='ammo';
  window.ranged258={...Data.getItem('gun'),id:'gun',weaponCategory:'light'};
  window.copy258=GRPGItemInstancesV215.instance(App.state.users.p,'gun',-1,'primaryWeapon');
  copy258.aberration252.effects=['weapon-15-1','weapon-5-3'];
`);
assert.equal(run("test215.jamOnHit(target215,ranged258,{attackDie:19,defenseFumble:true},'primaryWeapon')"),false);
assert.equal(run("test215.jamOnHit(target215,ranged258,{attackDie:20,defenseFumble:true},'primaryWeapon')"),true);
assert.equal(run("test215.jamState(target215,ranged258,'secondaryWeapon')"),null);
assert.equal(run("test215.normalizeToken(target215).aberrationJams258[copy258.id].jammed"),true);
assert.equal(run("test215.reload(target215,'primaryWeapon').state.loaded"),4);
assert.equal(run("test215.jamState(target215,ranged258,'primaryWeapon').jammed"),false);
assert.equal(run("test215.jamOnHit(target215,ranged258,{attackDie:20,defenseFumble:true},'primaryWeapon')"),false);
run('window.damage258={damage:3,damagePartsV138:[{amount:3,absorptionSource:"all"}]};');
const die=run("test215.bonusDie(target215,ranged258,damage258,'kinetic','primaryWeapon')");
const dieForm=await waitAttackForm();
dieForm.elements.value.value='6';
dieForm.elements.damageType.value='energy';
dieForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
await die;
assert.equal(run('damage258.damage'),9);
assert.equal(run('damage258.damagePartsV138[1].damageType258'),'energy');
run(`
  copy258.aberration252.effects=['weapon-12-1'];
  test215.fitToken(target215,scene258,{x:10,y:10});
  test215.fitToken(enemy215,scene258,{x:11,y:10});
  window.beforePush258=test215.center(enemy215);
`);
await run("test215.secondaryHit(target215,melee215,enemy215,'kinetic','primaryWeapon')");
assert(run('test215.center(enemy215).x>beforePush258.x'),'push displaces the target away from the attacker');
run(`
  copy258.aberration252.effects=['weapon-11-1'];
  window.ricochet258=test215.normalizeToken({id:'ricochet-victim',name:'Second target',hpCurrent:10,hpMax:10});
  ricochet258.equipmentType='turret';
  runtime215.tokens.push(ricochet258);
  const origin258=test215.center(enemy215);
  test215.fitToken(ricochet258,scene258,{x:origin258.x,y:origin258.y+1});
`);
const ricochet=run("test215.secondaryHit(target215,ranged258,enemy215,'kinetic','primaryWeapon')");
const ricochetForm=await waitAttackForm();
ricochetForm.querySelector('input').checked=true;
ricochetForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
await ricochet;
assert.equal(run('ricochet258.hpCurrent'),9);
run(`
  scene258.mode='normal';
  enemy215.npcId='loot-npc';
  enemy215.hpCurrent=0;
  enemy215.lootStateV118={searched:false,items:[]};
  const originalGetNpc258=Data.getNpc.bind(Data);
  Data.getNpc=id=>id==='loot-npc'?{dangerLevel:9,lootTable:[{itemId:'gun',chance:100,minQty:1,maxQty:1}]}:originalGetNpc258(id);
  Combat.render=()=>{};
  Combat.selectedObject={kind:'token',id:enemy215.id};
  const combatHost259=document.createElement('div');
  combatHost259.id='mod-combat';
  combatHost259.className='fs-module over-login open';
  document.body.append(combatHost259);
  window.renderSearch258=()=>{
    const host=combatHost259;
    host.innerHTML=test215.renderSearch();
    return host.querySelector('button');
  };
  const originalRandom258=Math.random;
  try{Math.random=()=>.999;renderSearch258().click();}finally{Math.random=originalRandom258;}
`);
assert.equal(run("enemy215.lootStateV118.items[0].aberrations[0].rarity"),'legendary');
assert.match(w.document.querySelector('.scene-loot-overlay-v118').textContent,/Легендарное/);
w.document.querySelector('[data-scene-loot-close-v118]').click();
assert.equal(w.document.querySelector('.scene-loot-overlay-v118'),null);
const reopen=run('renderSearch258()');
assert.equal(reopen.textContent,'ПОКАЗАТЬ ЛУТ');
reopen.click();
assert.match(w.document.querySelector('.scene-loot-overlay-v118').textContent,/Легендарное/);
w.document.querySelector('[data-loot-item-v137]').click();
const layers=new Window({settings:{disableCSSFileLoading:true}});
try{
  for(const match of html.matchAll(/<link rel="stylesheet" href="\.\/([^"?]+)[^"]*"/g)){
    const style=layers.document.createElement('style');
    style.textContent=fs.readFileSync(path.join(root,'renderer',match[1]),'utf8');
    layers.document.head.append(style);
  }
  layers.document.body.innerHTML=w.document.querySelector('#mod-combat').outerHTML
    +w.document.querySelector('.scene-loot-overlay-v118').outerHTML
    +w.document.querySelector('.scene-loot-menu-v137').outerHTML;
  const z=selector=>Number(layers.getComputedStyle(layers.document.querySelector(selector)).zIndex);
  assert(z('.scene-loot-overlay-v118')>z('#mod-combat'),'loot overlay must appear above the combat module');
  assert(z('.scene-loot-menu-v137')>z('.scene-loot-overlay-v118'),'transfer menu must appear above the loot overlay');
}finally{await layers.happyDOM.abort();}
run(`
  window.passiveGear260={armor:['armor-18-4','armor-19-3','armor-23-4'],shield:['shield-32-3'],
    backpack:['backpack-38-4','backpack-39-4','backpack-42-3'],implant:['implant-47-4','implant-50-3','implant-52-2']};
  window.equipment260={armor:{id:'armor',type:'armor'},shield:{id:'shield',type:'shield'},
    backpack:{id:'backpack',type:'backpack'},implant:{id:'implant',type:'implant'}};
  window.profile260={equipmentSlots:{armor:'armor',primaryWeapon:'shield',backpack:'backpack'},implantSlots:['implant'],
    baseStats:{inventorySlots:12,carryBase:10,movement:6,vision:6,hpBase:10},inventory:[]};
  for(const [type,slot] of [['armor','armor'],['shield','primaryWeapon'],['backpack','backpack'],['implant','implant:0']]){
    EQUIPMENT[type]=equipment260[type];
    profile260.inventory.push({itemId:type,qty:1,instancesV215:[{id:type,slot,aberration252:{effects:passiveGear260[type]}}]});
  }
  window.passives260=GRPGStatsV113.compute(profile260,{kind:'player'}).values;
`);
for(const [stat,value] of Object.entries({armorClass:1,defense:1,carryCapacity:12,inventorySlots:13,movement:8,vision:8,maxHp:11,droneActions:1})){
  assert.equal(run('passives260.'+stat),value,stat);
}
run("profile260.equipmentSlots.armor='';profile260.implantSlots=[];profile260.installedImplantIds=[];");
assert.equal(run("GRPGStatsV113.compute(profile260).values.defense"),0);
assert.equal(run("GRPGStatsV113.compute(profile260).values.droneActions"),0);
run(`
  scene258.mode='combat';
  runtime215.round=8;
  EQUIPMENT.armor={id:'armor',type:'armor',durabilityMax:10};
  window.reactiveArmor261=GRPGItemInstancesV215.instance(App.state.users.p,'armor',-1,'armor');
  GRPGItemInstancesV215.repair(reactiveArmor261,EQUIPMENT.armor,10);
  reactiveArmor261.aberration252={effects:['armor-25-2','armor-26-1']};
  enemy215.hpCurrent=10;
  enemy215.equipmentType='drone';
  enemy215.npcId='';
`);
const armorHit=(critical,hit=true)=>run(`test215.applyWeaponHit(target215,0,enemy215,{name:'Attack',weaponCategory:'melee'},{hit:${hit},critical:${critical}})`);
await armorHit(false,false);
assert.equal(run('enemy215.hpCurrent'),10);
await armorHit(true);
assert.equal(run('enemy215.hpCurrent'),8);
assert.equal(run("GRPGItemInstancesV215.instance(App.state.users.p,'armor',-1,'armor').durability"),9);
run("runtime215.tokens[0]=window.target215=test215.normalizeToken(target215);");
await armorHit(true);
assert.equal(run('enemy215.hpCurrent'),8);
assert.equal(run("GRPGItemInstancesV215.instance(App.state.users.p,'armor',-1,'armor').durability"),9);
run('runtime215.round++;');
await armorHit(true);
assert.equal(run('enemy215.hpCurrent'),6);
assert.equal(run("GRPGItemInstancesV215.instance(App.state.users.p,'armor',-1,'armor').durability"),9);
run(`
  const copy262=GRPGItemInstancesV215.instance(App.state.users.p,'armor',-1,'armor');
  copy262.aberration252.effects=['armor-20-1:kinetic','armor-27-1:energy'];
  window.kinetic262=test215.defense(target215,'light',null,'kinetic');
  window.energy262=test215.defense(target215,'light',null,'energy');
  window.mixed262=test215.absorb({damage:7,damagePartsV138:[
    {amount:1},{amount:2},{amount:4,damageType258:'energy'}
  ]},kinetic262,()=>energy262);
`);
assert.match(run("GRPGAberrationWeapons.describe('armor-20-1:kinetic')"),/Кинетический/);
assert.equal(run('kinetic262.typedArmorDelta'),2);
assert.equal(run('energy262.typedArmorImmune'),true);
assert.equal(run('mixed262.applied'),5,'vulnerability applies once and immunity removes only its own type');
assert.equal(run('mixed262.absorbed'),4);
assert.equal(run('test215.absorb({damage:0},kinetic262).applied'),0);
run(`
  GRPGItemInstancesV215.instance(App.state.users.p,'armor',-1,'armor').aberration252.effects=['armor-20-4:energy'];
  window.resistant262=test215.defense(target215,'light',null,'energy');
`);
assert.equal(run('test215.absorb({damage:3},resistant262).applied'),1);
run(`
  GRPGItemInstancesV215.instance(App.state.users.p,'armor',-1,'armor').aberration252.effects=['armor-28-1:ranged'];
  window.queue263=[];
  window.result263={hit:true,critical:true,damageApplied:4};
`);
assert.equal(run("test215.cancelImmuneAttack(target215,{weaponCategory:'melee'},result263,queue263)"),false);
assert.equal(run("test215.cancelImmuneAttack(target215,ranged258,{hit:false},queue263)"),false);
assert.equal(run("test215.cancelImmuneAttack(target215,ranged258,result263,queue263)"),true);
assert.equal(run('result263.damageApplied'),0);
assert.equal(run('result263.critical'),false);
assert.equal(run("test215.cancelImmuneAttack(enemy215,ranged258,{hit:true},queue263)"),false);
run(`window.queue263=test215.normalizeToken({...enemy215,burstStateV122:{immuneTargets263:queue263}}).burstStateV122.immuneTargets263;`);
assert.equal(run("test215.cancelImmuneAttack(target215,ranged258,{hit:true},queue263)"),true);
assert.equal(run("test215.cancelImmuneAttack(target215,ranged258,{hit:true},[])"),false);
console.log('PASS armor cancels only the matching attack and retains immunity across burst target switches');
console.log('PASS typed armor effects, mixed damage, and one delta per damage type');
console.log('PASS armor reflection once per round and fragility once per battle, including normalization');
console.log('PASS equipped armor, shield, backpack and implant aberrations contribute their own stats');
console.log('PASS loot overlay, extra damage die, per-copy jam and reload, forced movement and ricochet');
console.log('PASS melee aberrations: failure bonus and expiry; delayed damage survives normalization and applies once');
console.log('PASS real renderer: legacy migration, independent weapon copies, Lua break/damage by slot and ID, DM repair, natural 20 and loss of kinetic/energy armor, slot binding and save/reload metadata');
}finally{await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}
