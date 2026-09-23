'use strict';
// PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node tests/v134-world-config-browser.cjs
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'grpgi-browser-'));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.stack));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes("'frame-ancestors' is ignored"))errors.push(m.text())});
await page.exposeFunction('saveWorldTest',world=>{fs.writeFileSync(path.join(temp,'world.json'),JSON.stringify(world));return{ok:true,world:JSON.parse(fs.readFileSync(path.join(temp,'world.json'),'utf8'))}});
await page.exposeFunction('loadWorldTest',()=>({ok:true,world:JSON.parse(fs.readFileSync(path.join(temp,'world.json'),'utf8'))}));
await page.exposeFunction('exportWorldTest',(type,payload)=>{fs.writeFileSync(path.join(temp,type+'.json'),JSON.stringify(payload));return{ok:true,fileName:type+'.json'}});
await page.exposeFunction('saveSectionTest',(type,payload)=>{const file=path.join(temp,'world.json'),w=JSON.parse(fs.readFileSync(file,'utf8'));w[type]=payload;fs.writeFileSync(file,JSON.stringify(w));return{ok:true}});
await page.addInitScript(()=>{
const addWindow=window.addEventListener.bind(window),addDocument=document.addEventListener.bind(document);
window.addEventListener=(type,...args)=>{if(type!=='load')return addWindow(type,...args)};
document.addEventListener=(type,...args)=>{if(type!=='DOMContentLoaded')return addDocument(type,...args)};
window.setInterval=()=>0;
window.electronAPI={appVersion:'1.0.134',debugLog:async()=>{},saveWorldData:window.saveWorldTest,loadWorldData:window.loadWorldTest,saveWorldSection:window.saveSectionTest,exportWorldSectionJson:window.exportWorldTest};
});
await page.route('**/*',async route=>{
const url=new URL(route.request().url());if(url.hostname!=='grpgi.test')return route.abort();
const pathname=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
const target=path.resolve(root,'renderer',pathname);if(!target.startsWith(path.join(root,'renderer')+path.sep)||!fs.existsSync(target))return route.fulfill({status:200,body:''});
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png'}[path.extname(target)]||'application/octet-stream';return route.fulfill({contentType:mime,body:fs.readFileSync(target)});
});
await page.goto('https://grpgi.test/',{waitUntil:'load'});
assert.deepEqual(errors,[]);
await page.evaluate(()=>{
if(!window.GRPGFeaturePackV120||!window.GRPGWorldJsonTransferV132)throw Error('Required modules did not initialize');
App.state=makeDefaultState();applyWorldData({players:{PLAYER_TEMPLATES:{gm:{id:'gm',role:'gm',displayName:'Test GM'}}},equipment:{EQUIPMENT:{}}});App.state=makeDefaultState();App.currentUserId='gm';
App.renderLive=()=>{};App.refreshAfterLocalWrite=()=>{};
Sync.pushCurrentSnapshot=async()=>({ok:true,status:'disabled'});PlayerSync.shouldIsolateUsersFromSnapshot=()=>false;
Persistence.save=async s=>{window.savedState=JSON.stringify(s)};Persistence.load=async()=>JSON.parse(window.savedState);
window.notices=[];Toast.show=(message,type)=>window.notices.push({message,type});
document.getElementById('mod-config').classList.add('open');document.getElementById('mod-config').style.zIndex=20000;
});
const expected={damage:'6',range:13,hitBonus:-3,unitHp:31,unitArmorClass:0,unitInitiative:-2,unitVisionRange:0,unitMoveRange:9,rapidFireShots:4};
for(const type of ['drone','turret','ammo','weapon']){
 await page.evaluate(type=>{Configurator.insertEntity('equipment',{id:type,type,name:'Test '+type,ammoFamily:'old'});Configurator.selectedType='equipment';Configurator.equipmentCategoryV1052=type;Configurator.selectedId=type;Configurator.render()},type);
 const form=page.locator('#config-editor-form');assert.equal(await form.locator('[name=type]').inputValue(),type);
 const toolbar=page.locator('[data-world-json-action-v132="import"]');assert.equal(await toolbar.count(),1);assert.ok(await toolbar.isVisible());
 if(['drone','turret'].includes(type)){
  for(const [key,value] of Object.entries(expected)){const name=key==='rapidFireShots'?'rapidFireShotsV129':key;await form.locator(`[data-for-item="${type}"] [name="${name}"]`).fill(String(value));}
 }else await form.locator(`[data-v118-for-item="${type}"] [name="ammoFamily"]`).fill('.22 Win Mag');
 // Capture completion without replacing the actual submit implementation.
 await page.evaluate(()=>{window.submitDone=false;const original=Configurator.submit;Configurator.submit=async function(e){try{return await original.call(this,e)}finally{window.submitDone=true;Configurator.submit=original}}});
 await form.locator('button[type=submit]').click();await page.waitForFunction(()=>window.submitDone);
 const world=JSON.parse(fs.readFileSync(path.join(temp,'world.json'),'utf8')),saved=world.equipment.EQUIPMENT[type];
 for(const [key,value] of Object.entries(['drone','turret'].includes(type)?expected:{ammoFamily:'.22 Win Mag'}))assert.equal(saved[key],value,`${type}.${key} persisted`);
 await page.evaluate(async type=>{applyWorldData((await electronAPI.loadWorldData()).world);Configurator.equipmentCategoryV1052=type;Configurator.selectedId=type;Configurator.render()},type);
 for(const [key,value] of Object.entries(['drone','turret'].includes(type)?expected:{ammoFamily:'.22 Win Mag'})){
  const name=key==='rapidFireShots'?'rapidFireShotsV129':key,block=['drone','turret'].includes(type)?`[data-for-item="${type}"]`:`[data-v118-for-item="${type}"]`;
  assert.equal(await page.locator(`${block} [name="${name}"]`).inputValue(),String(value),`${type}.${key} reopened`);
 }
}
await page.locator('[data-world-json-action-v132="export"]').click();await page.waitForFunction(()=>window.notices.some(n=>n.message.includes('экспортирован')));
assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'equipment.json'),'utf8')).EQUIPMENT.drone.damage,'6');
await page.evaluate(()=>{electronAPI.importWorldSectionJson=async()=>({ok:true,fileName:'equipment.json',payload:{EQUIPMENT:{ammo:{id:'ammo',type:'ammo',name:'Imported',ammoFamily:'7.62x39'}}}})});
await page.locator('[data-world-json-action-v132="import"]').click();await page.locator('[data-world-json-mode-v132="merge"]').click();await page.waitForFunction(()=>window.notices.some(n=>n.message.startsWith('Импортирован раздел')));
assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'world.json'),'utf8')).equipment.EQUIPMENT.ammo.ammoFamily,'7.62x39');
await page.evaluate(()=>{Configurator.render();Configurator.render()});assert.equal(await page.locator('.world-json-transfer-v132').count(),1);
await page.evaluate(()=>document.getElementById('mod-config').scrollTop=0);
if(process.env.GRP_GI_SCREENSHOT)await page.screenshot({path:process.env.GRP_GI_SCREENSHOT});
assert.deepEqual(await page.evaluate(()=>window.notices.filter(n=>n.type==='err')),[]);assert.deepEqual(errors,[]);
await browser.close();fs.rmSync(temp,{recursive:true,force:true});console.log('v134 Chromium PASS: full unmodified renderer load, native form selection, click Save, disk/reload, drone/turret zero & negative stats, ammo/weapon family, visible working JSON export/import controls.');
})().catch(e=>{console.error(e);process.exit(1)});
