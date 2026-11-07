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
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g)){let source=fs.readFileSync(path.join(root,'renderer',m[1]),'utf8');if(m[1]==='scene-editor-v113.js')source=source.replace('// New module is DM-only;','window.test215={wear:wearArmorOnTwentyV215,defense:incomingDefense119,state:itemRuntimeStateV138,mutate:mutateItemStateV138};\n// New module is DM-only;');vm.runInContext(source,context,{filename:m[1]});}



const pause=()=>new Promise(resolve=>setTimeout(resolve,30));
try {
run(`
  applyWorldData({
    equipment:{EQUIPMENT:{
      armor:{id:'armor',name:'Панцирь',type:'armor',durabilityMax:1,energyProtection:true,armorClass:3,damageReduction:2},
      gun:{id:'gun',name:'Карабин',type:'weapon',weaponSlot:'versatile',durabilityMax:5,rarity:'редкий'}
    }},
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
console.log('PASS real renderer: legacy migration, independent weapon copies, Lua break/damage by slot and ID, DM repair, natural 20 and loss of kinetic/energy armor, slot binding and save/reload metadata');
}finally{await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});}
