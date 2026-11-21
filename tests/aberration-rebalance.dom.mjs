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
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g)){let source=fs.readFileSync(path.join(root,'renderer',m[1]),'utf8');if(m[1]==='scene-editor-v113.js')source=source.replace('// New module is DM-only;','window.test287={local,applyStore,collectStoreFromRuntime,ensureNpcGear287,entityForToken,itemRuntimeStateV138,incomingDefense119,weaponAberrationEffects257,attackCover287,applyAbsorptionV138,wearArmorFromBlast093,secondaryHit258,movementState198,processTimedModifiers122,searchNpc118,performLootTransferV137,deleteSelected104,issueForge287,fitTokenToHex107,normalizeCombatToken,unbind287,renderUnbind287};\n// New module is DM-only;');vm.runInContext(source,context,{filename:m[1]});}




const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await pause();}throw Error('UI timeout');};
const submit=()=>w.document.querySelector('.scene-lua-modal-v119').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
try {
 run(`applyWorldData({equipment:{EQUIPMENT:{
 gun:{id:'gun',name:'Carbine',type:'weapon',weaponCategory:'light',damage:'2',range:20,mass:1,durabilityMax:12,mounts:['optic']},
 armor:{id:'armor',name:'Armor',type:'armor',mass:1,durabilityMax:12,modifiers:[{target:'armor_class',op:'add',value:3},{target:'defense',op:'add',value:4},{target:'carry_capacity',op:'add',value:5}]},
 pack:{id:'pack',type:'backpack',durabilityMax:0,mass:1}
 }},npcs:{NPCS:{soldier:{id:'soldier',name:'Soldier',npcKind:'template',dangerLevel:9,abilityBase:{dexterity:1},equipmentSlots:{primaryWeapon:'gun',armor:'armor'},inventory:[],lootTable:[]}}},
 players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm'},p:{id:'p',role:'player',displayName:'Player',inventory:[],baseStats:{inventorySlots:30,carryBase:100}}}}});
 App.state=makeDefaultState();App.currentUserId='gm';Sync.config={enabled:false};App.renderLive=()=>{};App.refreshAfterLocalWrite=()=>{};App.writeLocalMirrors=async()=>({ok:true});Persistence.save=async()=>({ok:true});window.notices287=[];Toast.show=(message)=>notices287.push(message);
 window.saved287=[];Configurator.persistAll=async()=>{saved287.push(buildWorldSnapshot());return{localSaved:true};};`);
 const api=w.test287,I=w.GRPGItemInstancesV215;
 // Shared weaponAttack powers manual attacks, opportunity attacks and StandardAttack.
 const bare={id:'__unarmed_v122',type:'weapon',name:'Безоружная атака',weaponCategory:'melee',isUnarmedV122:true,damage:'1'};
 for(const kind of ['player','npc'])for(let strength=0;strength<=5;strength++){
   const actor={id:'bare',abilityBase:{strength},inventory:[],modifiers:[{target:'strength',op:'add',value:1},{target:'damage_bonus',op:'add',value:2}]};
   const attack=w.GRPGStatsV113.weaponAttack(actor,bare,{kind});
   assert.equal(Number(attack.damage)+attack.damageBonus,1+strength+1+2);
   assert.equal(w.GRPGStatsV113.weaponAttack(actor,{...bare,isUnarmedV122:false},{kind}).damageBonus,2);
 }
 const gasActor={inventory:[],modifiers:[{target:'gas_protection_flat',op:'add',value:2},{target:'gas_protection_percent',op:'add',value:50},{target:'gas_protection_percent',op:'add',value:50}]};
 const gasStats=w.GRPGStatsV113.compute(gasActor).values;
 assert.equal(gasStats.gasProtectionPercent,75);assert.equal(gasStats.gasProtectionFlat,2);
 const gasDefense={damageType:'gas',gasProtectionPercent:gasStats.gasProtectionPercent,gasProtectionFlat:gasStats.gasProtectionFlat,damageReduction:100};
 assert.equal(api.applyAbsorptionV138({damage:9},gasDefense).applied,2,'flat protection first, then 75% of remaining seven');
 assert.equal(api.applyAbsorptionV138({damage:9,damagePartsV138:[{amount:9,absorptionSource:'none'}]},gasDefense).applied,9,'Lua ignore-protection remains intact');
 assert.equal(api.applyAbsorptionV138({damage:9,damagePartsV138:[{amount:9,absorptionSource:'all',ignorePercent:100}]},gasDefense).applied,9);

 api.applyStore({rangeSchema:109,cameraSchema:109,scenes:{s:{id:'s',name:'Test',mode:'normal',width:30,height:20,assets:[],templates:[]}},runtimes:{s:{tokens:[]}},selectedSceneId:'s'});
 api.local.loaded=true;run("UI.openModule('combat')");
 assert.doesNotThrow(()=>run('Combat.selectedObject=null;Combat.render()'),'entering an empty scene must render without a selected actor');
 assert.equal(api.renderUnbind287(),'','no actor selected means no unbind button');
 run("Combat.selectedObject={kind:'token',id:'removed-token'}");assert.equal(api.renderUnbind287(),'','stale selection also has no unbind button');
 assert.equal(w.document.querySelector('[data-unbind287]'),null,'empty selection has no unbind action');
 run("Combat.getScene().assets.push(normalizeCombatAsset({id:'entry-crate',name:'Crate',x:1,y:1,w:1,h:1}));Combat.selectedObject={kind:'asset',id:'entry-crate'}");
 assert.doesNotThrow(()=>run('Combat.render()'),'a selected map asset has no actor turn counter');
 assert.equal(api.renderUnbind287(),'','a selected crate has no unbind action');
 run("Combat.getScene().assets=[];Combat.selectedObject=null");

 let first=run("createNpcCombatToken('soldier')");first.id='first';api.ensureNpcGear287(first);
 let second=run("createNpcCombatToken('soldier')");second.id='second';api.ensureNpcGear287(second);
 const instances=t=>t.combatInventoryV120.flatMap(row=>row.instancesV215||[]);
 assert.equal(instances(first).length,2);
 assert(instances(first).every(copy=>copy.durability>=Math.ceil(copy.durabilityMax/4)&&copy.durability<=copy.durabilityMax));
 assert(instances(first).every(copy=>!instances(second).some(other=>other.id===copy.id)));
 const before=JSON.stringify(first);api.ensureNpcGear287(first);assert.equal(JSON.stringify(first),before,'gear is not rerolled');
 const canonical=run("Data.getNpc('soldier')");assert.equal(canonical.inventory.length,0,'template remains independent');
 run('Combat.getRuntime().tokens=[];');run('Combat.getRuntime().tokens').push(first,second,run("createPlayerCombatToken('p')"));
 const armor=I.instance(api.entityForToken(first),'armor',-1,'armor');
 armor.aberration252={rarity:'uncommon',budget:1,effects:['armor-24-5','armor-23-4']};
 let gun=I.instance(api.entityForToken(first),'gun',-1,'primaryWeapon');
 gun.aberration252={rarity:'rare',budget:4,effects:['weapon-59-2','weapon-60-2']};
 const cover={armorBonus:3,hardness:7,blocksAttack:false};
 const pierced=api.attackCover287(first,{id:'gun'},cover,'primaryWeapon');assert.equal(pierced.armorBonus,1);assert.equal(pierced.hardness,7);assert.equal(cover.armorBonus,3);
 const defense=api.incomingDefense119(first,'light',cover,'explosive');assert.equal(defense.wornArmorAbsorption,4);
 const reduced=api.applyAbsorptionV138({damage:12,weaponPenetration287:2,damagePartsV138:[{amount:12,absorptionSource:'all'}]},defense);
 assert.equal(reduced.explosiveArmorBlocked,2);assert.equal(reduced.absorbed,9);
 armor.durability=1;api.wearArmorFromBlast093(first,reduced);assert.equal(armor.durability,0);
 const after=api.incomingDefense119(first,'light',null,'kinetic');assert.equal(after.armorAbsorption,0);assert.equal(after.baseArmorClass,1);
 const computed=w.GRPGStatsV113.compute(api.entityForToken(first),{kind:'npc'});assert.equal(computed.values.carryCapacity,18,'destroyed armor still grants carry bonus and aberration');assert.equal(computed.values.movement,3,'permanent armor debuff survives destruction');
 first.hpCurrent=0;run("Combat.selectedObject={kind:'token',id:'first'}");api.searchNpc118('first');
 const loot=first.lootStateV118.items.find(row=>row.itemId==='armor');assert.equal(loot.copiesV287[0].id,armor.id);assert.equal(loot.copiesV287[0].durability,0);
 const granted=await api.performLootTransferV137('s','first','armor','p');assert.equal(granted.ok,true,JSON.stringify(granted));
 const player=run('App.state.users.p');assert.equal(player.inventory.find(row=>row.itemId==='armor').instancesV215[0].id,armor.id);
 assert.equal(first.combatInventoryV120.some(row=>row.itemId==='armor'),false,'ownership moves from NPC to player');
 // Saved token snapshots retain the NPC's rolled gear and never reroll after normalization.
 const reloaded=api.normalizeCombatToken(JSON.parse(JSON.stringify(second)));assert.deepEqual(JSON.parse(JSON.stringify(reloaded.combatInventoryV120)),JSON.parse(JSON.stringify(second.combatInventoryV120)));
 // Optional push can be declined without moving a target. Root succeeds exactly on 15.
 first=run("Combat.getRuntime().tokens.find(row=>row.id==='first')");second=run("Combat.getRuntime().tokens.find(row=>row.id==='second')");gun=I.instance(api.entityForToken(first),'gun',-1,'primaryWeapon');
 gun.aberration252.effects=['weapon-12-1'];first.hpCurrent=10;second.hpCurrent=10;
 const position=JSON.stringify([second.x,second.y]);
 const push=api.secondaryHit258(first,{id:'gun',name:'Carbine'},second,'kinetic','primaryWeapon');
 await wait(()=>w.document.querySelector('.scene-lua-modal-v119'));w.document.querySelector('[data-lua-decline-v119]')?.click();
 // Use the rendered decline control, preserving normal modal cancellation semantics.
 if(w.document.querySelector('.scene-lua-modal-v119'))w.document.querySelector('.scene-lua-overlay-v119 button[data-lua-cancel-v119]')?.click();
 await push;assert.equal(JSON.stringify([second.x,second.y]),position);
 gun.aberration252.effects=['weapon-57-1'];
 const failedRoot=api.secondaryHit258(first,{id:'gun',name:'Carbine'},second,'kinetic','primaryWeapon');
 await wait(()=>w.document.querySelector('[name=rootRoll]'));w.document.querySelector('[name=rootRoll]').value='14';submit();await failedRoot;
 assert.equal(second.aberrationControl287?.rootUntil,undefined);
 gun.aberration252.effects=['weapon-57-1','weapon-58-2'];
 const control=api.secondaryHit258(first,{id:'gun',name:'Carbine'},second,'kinetic','primaryWeapon');
 await wait(()=>w.document.querySelector('[name=rootRoll]'));w.document.querySelector('[name=rootRoll]').value='15';submit();await control;
 assert.equal(api.movementState198(second,run('Combat.getScene()')).speed,0);
 run("Combat.selectedObject={kind:'token',id:'second'}");assert.match(api.renderUnbind287(),/data-unbind287/,'rooted actor retains the unbind action');
 run("Combat.selectedObject={kind:'token',id:'first'}");assert.equal(api.renderUnbind287(),'','unrooted actor has no unbind action');
 second.ownTurnV199=(second.ownTurnV199||0)+1;await api.processTimedModifiers122(second,'end');assert.equal(second.aberrationControl287,undefined);
 // A deleted NPC cannot remain in the persistent session participant registry.
 run("Combat.selectedObject={kind:'token',id:'second'}");api.local.store.session193={...api.local.store.session193,participants:{test:JSON.parse(JSON.stringify(second))},order:['second']};
 api.deleteSelected104();assert.equal(Object.values(api.local.store.session193.participants).some(actor=>actor.id==='second'),false);
 assert.equal(player.inventory.find(row=>row.itemId==='armor').instancesV215[0].id,armor.id,'deleting source preserves transferred loot');
 // Open the real World Config forge and save a recipe through its controls.
 run("UI.openModule('config');Configurator.render();");
 const forgeTab=w.document.querySelector('[data-aberration-forge-tab]');assert(forgeTab);forgeTab.click();
 const form=w.document.querySelector('[data-aberration-forge]');assert(form);
 form.elements.namedItem('name').value='Prepared';form.elements.namedItem('item').value='gun';form.elements.namedItem('item').dispatchEvent(new w.Event('change'));
 const effectSelect=form.elements.namedItem('effects');
 assert(effectSelect.options.length>0,JSON.stringify({item:form.elements.namedItem('item').value,choices:w.GRPGAberrationWeapons.choices(run("Data.getItem('gun')")).length}));
 for(const option of effectSelect.options)option.selected=['weapon-1-6','weapon-59-3','weapon-60-3'].includes(option.value);
 assert.equal(Array.from(effectSelect.options).filter(option=>option.selected).length,3,Array.from(effectSelect.options,o=>o.value).join(','));
 effectSelect.dispatchEvent(new w.Event('change'));form.elements.namedItem('durability').value='4';form.querySelector('[data-forge-stage]').click();
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause();
 const recipes=w.GRPGAberrationForge.list();assert.equal(recipes.length,1,JSON.stringify(run('notices287')));assert.equal(recipes[0].copy.aberration252.budget,21,'manual budgets are unlimited');
 const issuedA=w.GRPGAberrationForge.instantiate(recipes[0]),issuedB=w.GRPGAberrationForge.instantiate(recipes[0]);assert.notEqual(issuedA.copy.id,issuedB.copy.id);assert.equal(issuedA.copy.durability,4);
 assert.equal(run('saved287.length'),1);
 run("UI.openModule('combat')");
 const give=async(kind,id,slot='')=>{
   run(`Combat.selectedObject={kind:${JSON.stringify(kind)},id:${JSON.stringify(id)}}`);
   const pending=api.issueForge287();
   await wait(()=>w.document.querySelector('.scene-lua-modal-v119 [name=recipe]'));
   const modal=w.document.querySelector('.scene-lua-modal-v119');
   modal.elements.recipe.value=recipes[0].id;modal.elements.slot.value=slot;submit();await pending;
 };
 await give('token','first','primaryWeapon');
 const npcNow=run("Combat.getRuntime().tokens.find(row=>row.id==='first')");
 const prepared=I.instance(api.entityForToken(npcNow),'gun',-1,'primaryWeapon');
 assert.equal(prepared.aberration252.budget,21);assert.equal(prepared.durability,4);
 assert.notEqual(prepared.id,recipes[0].copy.id);
 assert.equal(api.entityForToken(npcNow).dangerLevel,9,'manual issues do not modify danger');
 run("Combat.getScene().assets.push(normalizeCombatAsset({id:'crate',name:'Crate',x:5,y:5,w:1,h:1}))");
 await give('asset','crate');
 const crate=run("Combat.getScene().assets.find(row=>row.id==='crate')");
 const crateCopy=crate.lootStateV118.items[0].copiesV287[0];assert.equal(crateCopy.durability,4);assert.notEqual(crateCopy.id,prepared.id);
 const crateGrant=await api.performLootTransferV137('s','crate','gun','p');assert.equal(crateGrant.ok,true,JSON.stringify(crateGrant));
 assert(run('App.state.users.p').inventory.some(row=>row.instancesV215?.some(copy=>copy.id===crateCopy.id)));
 const playerToken=run("Combat.getRuntime().tokens.find(row=>row.playerId==='p')");
 await give('token',playerToken.id);
 const playerCopies=run('App.state.users.p').inventory.flatMap(row=>row.instancesV215||[]);
 assert.equal(playerCopies.filter(copy=>copy.aberration252?.budget===21).length,2);
 assert.equal(new Set(playerCopies.map(copy=>copy.id)).size,playerCopies.length);
 // Repeated spawn/delete cycles release per-NPC inventories and participant snapshots.
 for(let index=0;index<25;index++){
   const token=run("createNpcCombatToken('soldier')");token.id='discard-'+index;api.ensureNpcGear287(token);
   run('Combat.getRuntime().tokens').push(token);
   api.local.store.session193.participants['discard-'+index]=token;
   run(`Combat.selectedObject={kind:'token',id:${JSON.stringify(token.id)}}`);api.deleteSelected104();
 }
 assert(!Object.keys(api.local.store.session193.participants).some(id=>id.startsWith('discard-')));
 assert(!run('Combat.getRuntime().tokens').some(token=>token.id.startsWith('discard-')));

 console.log('PASS NPC instance ownership, random durability, actual gear loot, penetration, destroyed armor utility, optional push, root/slow, deletion cleanup and forge persistence');
} finally {await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}
