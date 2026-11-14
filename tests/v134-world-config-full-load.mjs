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
for(const m of html.matchAll(/<script src="\.\/([^"?]+)[^"]*"/g))vm.runInContext(fs.readFileSync(path.join(root,'renderer',m[1]),'utf8'),context,{filename:m[1]});
assert.equal(run('!!window.GRPGFeaturePackV120'),true);
assert.equal(run('!!window.GRPGWorldJsonTransferV132'),true);
assert.equal(run('!!window.GRPGFeaturePackV131'),true);
run(`
 App.state=makeDefaultState();
 applyWorldData({players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm',displayName:'Test GM'}}},equipment:{EQUIPMENT:{}},skills:{SKILLS:{test_skill:{id:'test_skill',name:'Test',visibility:{playerIds:[],campaignIds:['c'],eraIds:['technological']},modifiers:[{stat:'max_hp',op:'add',value:2}]}}}});
 App.state=makeDefaultState();App.currentUserId='gm';
 App.renderLive=()=>{};
 Sync.pushCurrentSnapshot=async()=>({ok:true,status:'disabled'});
 PlayerSync.shouldIsolateUsersFromSnapshot=()=>false;
 Persistence.save=async state=>{window.savedState=JSON.stringify(state)};
 Persistence.load=async()=>JSON.parse(window.savedState);
 window.notices=[];Toast.show=(message,type)=>window.notices.push({message,type});
`);
assert.equal(run("Data.getSkill('test_skill').visibility.campaignIds[0]"),'c');
function render(type,id){run(`Configurator.selectedType=${JSON.stringify(type)};Configurator.equipmentCategoryV1052=${JSON.stringify(type==='equipment'?id:'gear')};Configurator.selectedId=${JSON.stringify(id)};Configurator.render()`)}
function checkToolbar(){assert.equal(w.document.querySelectorAll('[data-world-json-action-v132="import"]').length,1);assert.equal(w.document.querySelectorAll('[data-world-json-action-v132="export"]').length,1);assert.ok(w.document.querySelector('#config-content').firstElementChild.classList.contains('world-json-transfer-v132'));}
const expected={damage:'6',range:13,hitBonus:-3,unitHp:31,unitArmorClass:0,unitInitiative:-2,unitVisionRange:0,unitMoveRange:9,rapidFireShots:4};
for(const type of ['drone','turret']){
 run(`Configurator.insertEntity('equipment',{id:${JSON.stringify(type)},type:${JSON.stringify(type)},name:'Test unit',unitHp:10,unitArmorClass:10});`);render('equipment',type);checkToolbar();
 const form=w.document.getElementById('config-editor-form');form.querySelector('[name=type]').value=type;const block=form.querySelector(`[data-for-item="${type}"]`);assert.ok(block);
 for(const [name,value] of Object.entries(expected)){const field=name==='rapidFireShots'?'rapidFireShotsV129':name;const input=block.querySelector(`[name="${field}"]`);assert.ok(input,field);input.value=String(value);}
 // Prove the hidden earlier panel disagrees with the visible one.
 assert.notEqual(new w.FormData(form).get('damage'),expected.damage);
 w.currentForm=form;
 await run('Configurator.submit({preventDefault(){},currentTarget:window.currentForm})');
 const saved=JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8')).equipment.EQUIPMENT[type];
 for(const [name,value] of Object.entries(expected))assert.equal(saved[name],value,`${type}.${name} on disk`);
 await run('window.electronAPI.loadWorldData().then(result=>applyWorldData(result.world))');render('equipment',type);checkToolbar();
 const reopened=w.document.querySelector(`[data-for-item="${type}"]`);
 for(const [name,value] of Object.entries(expected)){const field=name==='rapidFireShots'?'rapidFireShotsV129':name;assert.equal(reopened.querySelector(`[name="${field}"]`).value,String(value),`${type}.${name} reopened`);}
}
for(const type of ['ammo','weapon']){
 run(`Configurator.insertEntity('equipment',{id:${JSON.stringify(type)},type:${JSON.stringify(type)},name:'Test ammo',ammoFamily:'old'});`);render('equipment',type);checkToolbar();
 const form=w.document.getElementById('config-editor-form');form.querySelector('[name=type]').value=type;const input=form.querySelector(`[data-v118-for-item="${type}"] [name="ammoFamily"]`);assert.ok(input);
 input.value='.22 Win Mag';w.currentForm=form;await run('Configurator.submit({preventDefault(){},currentTarget:window.currentForm})');
 const saved=JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8')).equipment.EQUIPMENT[type];assert.equal(saved.ammoFamily,'.22 Win Mag');
 await run('window.electronAPI.loadWorldData().then(result=>applyWorldData(result.world))');render('equipment',type);
 assert.equal(w.document.querySelector(`[data-v118-for-item="${type}"] [name="ammoFamily"]`).value,'.22 Win Mag');
}
// Actual export button invokes its bound handler with the selected whole section.
w.document.querySelector('[data-world-json-action-v132="export"]').click();await new Promise(r=>setImmediate(r));
assert.equal(JSON.parse(fs.readFileSync(path.join(scratch,'equipment.json'),'utf8')).EQUIPMENT.ammo.ammoFamily,'.22 Win Mag');
// Actual import button, file boundary and preview confirmation.
w.electronAPI.importWorldSectionJson=async()=>({ok:true,fileName:'equipment.json',payload:{EQUIPMENT:{ammo:{id:'ammo',type:'ammo',name:'Imported ammo',ammoFamily:'7.62x39'}}}});
w.document.querySelector('[data-world-json-action-v132="import"]').click();await new Promise(r=>setImmediate(r));
assert.ok(w.document.querySelector('[data-world-json-mode-v132="merge"]'));
w.document.querySelector('[data-world-json-mode-v132="merge"]').click();await new Promise(r=>setTimeout(r,30));
assert.equal(JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8')).equipment.EQUIPMENT.ammo.ammoFamily,'7.62x39');
for(const type of ['npcs','articles','players','skills']){render(type,type==='players'?'gm':type==='skills'?'test_skill':null);checkToolbar();}
// The task editor persists its destination and existing article selection together.
run(`
 Configurator.insertEntity('planets', {id:'task_planet',name:'Планета задания'});
 Configurator.insertEntity('articles', {id:'task_article',name:'Статья задания',title:'Статья задания'});
 Configurator.insertEntity('tasks', {id:'task_example',name:'Задание',status:'active'});
`);
render('tasks','task_example');
w.currentForm=w.document.getElementById('config-editor-form');
w.currentForm.querySelector('[name="destinationPlanetId"]').value='task_planet';
w.currentForm.querySelector('[name="relatedArticleIds"][value="task_article"]').checked=true;
await run('Configurator.submit({preventDefault(){},currentTarget:window.currentForm})');
let savedTask=JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8')).tasks.TASKS.task_example;
assert.equal(savedTask.destinationPlanetId,'task_planet');
assert.deepEqual(savedTask.relatedArticleIds,['task_article']);
await run('window.electronAPI.loadWorldData().then(result=>applyWorldData(result.world))');
render('tasks','task_example');
assert.equal(w.document.querySelector('[name="destinationPlanetId"]').value,'task_planet');
run('UI.renderTasks()');
const taskTile=w.document.querySelector('#tasks-content [data-task-id="task_example"]');
assert.match(taskTile.textContent,/Планета задания/);
assert(!w.document.querySelector('#tasks-content [data-entity="article"]'));
taskTile.click();
const taskReader=w.document.querySelector('#task-reader');
assert(taskReader.open);
assert(taskReader.querySelector('[data-entity="planet"][data-id="task_planet"]'));
assert(taskReader.querySelector('[data-entity="article"][data-id="task_article"]'));
taskReader.querySelector('[data-action="close-task-reader"]').click();
assert(!taskReader.open);
assert.equal(run("Configurator.worldSectionsForEntityChange('planets','task_planet').includes('tasks')"),true);
assert.equal(run("Configurator.worldSectionsForEntityChange('articles','task_article').includes('tasks')"),true);
run("Configurator.remapReferences('planets','task_planet','new_planet'); Configurator.remapReferences('articles','task_article','new_article')");
assert.equal(run('buildWorldSnapshot().tasks.TASKS.task_example.destinationPlanetId'),'new_planet');
assert.equal(run('buildWorldSnapshot().tasks.TASKS.task_example.relatedArticleIds[0]'),'new_article');
run("Configurator.cleanupReferences('planets','new_planet'); Configurator.cleanupReferences('articles','new_article')");
assert.equal(run('buildWorldSnapshot().tasks.TASKS.task_example.destinationPlanetId'),'');
assert.equal(run('buildWorldSnapshot().tasks.TASKS.task_example.relatedArticleIds.length'),0);
const selectCatalog=value=>w.document.querySelector(`[data-type="${value}"].config-type-btn`).click();
const choose=(selector,value)=>{const el=w.document.querySelector(selector);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));};
selectCatalog('equipment');
assert(w.document.querySelector('.config-entity-list'),'quick list remains visible');
assert(w.document.querySelector('[data-catalog-id="drone"]'));
assert(w.document.querySelector('[data-catalog-id="ammo"]'),'catalog includes all equipment types at once');
choose('[data-catalog-group]','Тип');
choose('[data-catalog-filter]',run("itemTypeLabelV2('drone')"));
assert.deepEqual([...w.document.querySelectorAll('[data-catalog-id]')].map(node=>node.dataset.catalogId),['drone']);
w.document.querySelector('[data-catalog-id="drone"]').click();
assert(w.document.querySelector('#config-editor-form[data-entity-type="equipment"]'));
w.document.querySelector('[data-catalog-back]').click();
assert.equal(w.document.querySelector('[data-catalog-group]').value,'Тип');
w.document.querySelector('.config-entity-list [data-config-id="drone"]').click();
assert(w.document.querySelector('#config-editor-form'));
run("Configurator.insertEntity('npcs',{id:'catalog_npc',name:'Механик',location:'Купрум'})");
selectCatalog('npcs');
choose('[data-catalog-group]','Локация');
assert(w.document.querySelector('.config-catalog h3').textContent.includes('Купрум'));
// A pending drag survives a refresh. Later refreshes use the latest inventory
// and restore the pool filter and position even when it has lost focus.
run(`
  Configurator.insertEntity('players',{id:'pool_player',role:'player',displayName:'Игрок'});
  Configurator.insertEntity('equipment',{id:'pool_item',type:'gear',name:'Ёмкость',mass:1});
`);
render('players','pool_player');
const poolSearch='[data-wc-inventory-pool-search-v1068]';
const poolList='.wc-inventory-pool-list-v1068';
let search=w.document.querySelector(poolSearch);
assert.ok(search);
search.value='емкость';
search.dispatchEvent(new w.Event('input',{bubbles:true}));
w.document.querySelector(poolList).scrollTop=79;
const poolItem=w.document.querySelector(`${poolList} [data-item-id="pool_item"]`);
const dragStart=new w.Event('dragstart',{bubbles:true});
Object.defineProperty(dragStart,'dataTransfer',{value:{setData(){}}});
poolItem.dispatchEvent(dragStart);
run('Configurator.render()');
assert.equal(w.document.querySelector(poolSearch),search);
poolItem.dispatchEvent(new w.Event('dragend',{bubbles:true}));
const name=w.document.querySelector('#config-editor-form input[name="displayName"]');
assert.ok(name);
name.value='Черновик имени';
name.dispatchEvent(new w.Event('input',{bubbles:true}));
run("App.state.users.pool_player.inventory=[{itemId:'pool_item',qty:2}]; Configurator.render()");
search=w.document.querySelector(poolSearch);
assert.equal(search.value,'емкость');
assert.equal(w.document.querySelector(poolList).scrollTop,79);
assert.equal(w.document.querySelector(`${poolList} [data-item-id="pool_item"]`).hidden,false);
assert.equal(w.document.querySelector('#config-editor-form input[name="displayName"]').value,'Черновик имени');
assert.equal(JSON.parse(w.document.querySelector('[name="wcInventoryStateV1068"]').value).inventory.find(row=>row.itemId==='pool_item').qty,2);
// A profile update must write only players.json and leave the loaded catalog intact.
const saveWorldData = w.electronAPI.saveWorldData;
const saveWorldSection = w.electronAPI.saveWorldSection;
const sectionsWritten = [];
w.electronAPI.saveWorldData = async () => { throw Error('Unexpected full-world write'); };
w.electronAPI.saveWorldSection = async (section, payload) => {
 sectionsWritten.push(section);
 return saveWorldSection(section, payload);
};
const diskBeforeMirror = JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'));
run("window.catalogBeforeMirror=EQUIPMENT; App.state.users.pool_player.credits=429");
assert.equal((await run('App.writeLocalMirrors()')).ok,true);
const diskAfterMirror = JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8'));
assert.deepEqual(sectionsWritten,['players']);
assert.deepEqual(diskAfterMirror.equipment,diskBeforeMirror.equipment);
assert.equal(diskAfterMirror.players.PLAYER_TEMPLATES.pool_player.credits,429);
assert.equal(run('window.catalogBeforeMirror===EQUIPMENT'),true);
w.electronAPI.saveWorldData = saveWorldData;
w.electronAPI.saveWorldSection = saveWorldSection;
// Move a worn instance into the private stash and return it after rerendering.
run(`
 Configurator.insertEntity('equipment',{id:'stash_armor',type:'armor',name:'Тестовая броня',durabilityMax:15,mass:1});
 App.state.users.pool_player.inventory=[{itemId:'stash_armor',qty:1,instancesV215:[{id:'worn-armor',durabilityMax:15,durability:6}]}];
 Configurator.render();
`);
const stash = () => w.document.querySelector('[data-wc-stash-drop]');
const armor = w.document.querySelector('[data-wc-inventory-stage-v1068] [data-item-id="stash_armor"][draggable]');
assert.ok(armor);
assert.match(stash().textContent,/Тайник пуст/);
armor.dispatchEvent(dragStart);
stash().dispatchEvent(new w.Event('drop',{bubbles:true,cancelable:true}));
await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(run('App.state.users.pool_player.inventory.length'),0);
assert.match(stash().textContent,/6\/15/);
assert.doesNotMatch(JSON.stringify(JSON.parse(fs.readFileSync(path.join(scratch,'world.json'),'utf8')).players),/worn-armor/);
run('Configurator.render()');
assert.match(stash().textContent,/6\/15/);
stash().querySelector('[data-wc-stash-return]').click();
await new Promise(resolve=>setTimeout(resolve,30));
assert.match(stash().textContent,/Тайник пуст/);
assert.equal(run('App.state.users.pool_player.inventory[0].instancesV215[0].id'),'worn-armor');
assert.equal(run('App.state.users.pool_player.inventory[0].instancesV215[0].durability'),6);
const openArmorMenu=()=>{
 const tile=w.document.querySelector('[data-wc-inventory-stage-v1068] [data-item-id="stash_armor"][draggable]');
 tile.dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:10,clientY:10}));
 return w.document.querySelector('.wc-item-menu');
};
let menu=openArmorMenu();
assert.ok(menu);
const pick=async label=>{
 const button=[...menu.querySelectorAll('button')].find(node=>node.textContent===label);
 assert.ok(button,label);
 button.click();
 await new Promise(resolve=>setTimeout(resolve,30));
};
await pick('Починить полностью');
assert.equal(run('App.state.users.pool_player.inventory[0].instancesV215[0].durability'),15);
menu=openArmorMenu();
await pick('Надеть · Броня');
assert.equal(run('App.state.users.pool_player.equipmentSlots.armor'),'stash_armor');
menu=openArmorMenu();
await pick('Снять');
assert.equal(run('App.state.users.pool_player.equipmentSlots.armor'),'');
menu=openArmorMenu();
await pick('Переложить в тайник');
assert.equal(run('App.state.users.pool_player.inventory.length'),0);
stash().querySelector('[data-wc-stash-return]').click();
await new Promise(resolve=>setTimeout(resolve,30));
menu=openArmorMenu();
w.confirm=()=>true;
await pick('Удалить один экземпляр');
assert.equal(run('App.state.users.pool_player.inventory.length'),0);
assert.equal(run(`
 (()=>{const check=GRPGMarketCategoriesV144.compatible;
 const player={inventory:[{itemId:'owned-gun',qty:1}]};
 const lookup=()=>({type:'weapon',ammoFamily:' 6.5 ',ammoTypeId:'exact'});
 return check({id:'matching',type:'ammo',caliber:'6.5'},player,lookup)
   && check({id:'exact',type:'ammo',caliber:'other'},player,lookup)
   && !check({id:'different',type:'ammo',caliber:'7.62'},player,lookup)
   && !check({id:'matching',type:'gear',caliber:'6.5'},player,lookup);
 })()
`),true);

// The desktop profile uses the Stats Engine's own renderer, separate from World Config.
run(`
 Configurator.insertEntity('equipment',{id:'stack_ammo',type:'ammo',name:'Патроны',stackLimit:30,mass:0.01});
 const stackPlayer=App.state.users.pool_player;
 stackPlayer.inventory=[{itemId:'stack_ammo',qty:31}];
 window.checkProfileStacks=()=>{
   const account=App.currentUserId;
   App.currentUserId='pool_player';
   try { UI.renderProfile(); }
   finally { App.currentUserId=account; }
 };
 Configurator.render();
 window.checkProfileStacks();
`);
for (const rootSelector of ['#profile-content','#config-editor-form']) {
 const tiles=w.document.querySelectorAll(rootSelector+' [data-item-id="stack_ammo"] .inventory-stack-count');
 assert.deepEqual(Array.from(tiles,node=>node.textContent),['30/30','1/30'],rootSelector);
}
// The compact sheet CSS must suppress ordinary metadata while leaving counts visible.
const profileCss = fs.readFileSync(path.join(root,'renderer/profile-sheet-v142.css'),'utf8');
assert.equal(profileCss,fs.readFileSync(path.join(root,'deploy/site/app/profile-sheet-v142.css'),'utf8'));
const tile = w.document.querySelector('#profile-content [data-inv113-drag-grid][data-item-id="stack_ammo"]');
tile.closest('#profile-content').classList.add('character-sheet-v142');
const count = tile.querySelector('.inventory-stack-count');
const metadata = w.document.createElement('small');
tile.appendChild(metadata);
const hideMetadata = profileCss.split('\n').find(line=>line.includes('.item-modifiers-v118,small')).split('{')[0];
assert.equal(metadata.matches(hideMetadata),true);
assert.equal(count.matches(hideMetadata),false);
metadata.remove();

run("App.currentUserId='pool_player'; Wiki.showEntity=(...args)=>{window.itemDescriptionArgs=args;}");
tile.click();
const descriptionButton = [...w.document.querySelectorAll('.sheet-item-actions button')].find(button=>button.textContent==='Описание');
assert.ok(descriptionButton);
descriptionButton.click();
assert.deepEqual(Array.from(w.itemDescriptionArgs),['item','stack_ammo',true]);
run("App.currentUserId='gm'");
assert.equal(w.notices.some(n=>n.type==='err'),false,JSON.stringify(w.notices));
assert.deepEqual(errors,[]);
await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});
console.log('v134 PASS: all renderer scripts load; real World Config forms/submit/save/reload for drones, turrets, ammo, weapons; zero and negative stats; actual JSON buttons/export/import; toolbar across sections.');
process.exit(0);
