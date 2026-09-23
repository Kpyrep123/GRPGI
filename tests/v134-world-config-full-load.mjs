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
assert.equal(w.notices.some(n=>n.type==='err'),false,JSON.stringify(w.notices));
assert.deepEqual(errors,[]);
await w.happyDOM.abort();fs.rmSync(scratch,{recursive:true,force:true});
console.log('v134 PASS: all renderer scripts load; real World Config forms/submit/save/reload for drones, turrets, ammo, weapons; zero and negative stats; actual JSON buttons/export/import; toolbar across sections.');
process.exit(0);
