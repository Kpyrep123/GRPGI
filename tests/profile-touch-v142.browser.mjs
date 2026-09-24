import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE):'playwright');
const root=path.resolve(process.argv[2]||'.');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const fixture={id:'p',displayName:'Теодор Солвиц',role:'player',rank:'Доктор',approvalStatus:'approved',credits:195140,lore:'<p>История персонажа — ниже репутации.</p>',personalityTrait:'Наблюдательный',ideal:'Знания',weakness:'Недоверие',inventory:[{itemId:'rifle',qty:1},{itemId:'armor',qty:1},{itemId:'pack',qty:1},{itemId:'implant',qty:1}],equipmentSlots:{armor:'armor',backpack:'pack'},implantSlots:['','','',''],baseImplantSlots:4,implantSlotCount:4,inventoryBaseSlots:20,carryBase:100,inventorySize:20,carryWeightMax:100,baseStats:{inventorySlots:20,carryBase:100},stats:{hpCurrent:8,hpMax:10,shieldCurrent:20,shieldMax:30,energyCurrent:1,energyMax:2},abilities:{strength:2,dexterity:3,endurance:2,intellect:4,will:2,glory:1},combat:{moveRange:6,visionRange:6},social:{reputation:[]}};
const items=Object.fromEntries([{id:'rifle',name:'M-97 Viper',type:'weapon',weaponSlot:'primary',mass:2,inventoryWidth:1,inventoryHeight:2,damage:'3',rapidFireShots:3},{id:'armor',name:'Бронекостюм',type:'armor',mass:3,inventoryWidth:2,inventoryHeight:2},{id:'pack',name:'Рюкзак',type:'backpack',mass:1,inventoryWidth:1,inventoryHeight:1},{id:'implant',name:'Нейроинтерфейс',type:'implant',mass:0.2,inventoryWidth:1,inventoryHeight:1}].map(i=>[i.id,i]));
try{
for(const [surface,width] of [['web',1440],['web',390],['web',320],['desktop',1440],['android',390]]){
 const page=await browser.newPage({viewport:{width,height:1050},isMobile:width<500,hasTouch:width<500});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.setInterval=()=>0;window.electronAPI={appVersion:'1.0.142',debugLog:async()=>{}};});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.hostname!=='grpgi.test')return route.abort();
  const base=path.join(root,surface==='desktop'?'renderer':surface==='android'?'mobile/generated-www':'deploy/site/app');
  const file=path.resolve(base,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(base+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  let body=fs.readFileSync(file);if(path.basename(file)==='app.js'){
   let s=body.toString();s=surface==='desktop'?s.replace('App.init().catch(error => {','if(false) App.init().catch(error => {'):s.replace('  init().catch(error => {',`window.profileTest={App,renderProfile,normalizeInventoryPlayerWebV1067,buildInventoryLayoutWebV1067,slotAcceptsWebV1067,itemWebV1067,setCommit:f=>commitPlayerMutation=f};if(false) init().catch(error => {`);body=Buffer.from(s);
  }
  return route.fulfill({body,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream'});
 });
 await page.goto('http://grpgi.test/',{waitUntil:'load'});
 await page.evaluate(({fixture,items,surface})=>{
  window.testSaves=0;
  if(surface==='desktop'){
   applyWorldData({players:{PLAYER_TEMPLATES:{p:fixture}},equipment:{EQUIPMENT:items}});
   App.state=makeDefaultState();App.state.users.p=normalizePlayerProfileV2(PLAYER_TEMPLATES.p);App.currentUserId='p';Sync.config={enabled:false};
   PlayerSync.pushPlayerPatch=async()=>{window.testSaves++;UI.renderProfile();};
   document.querySelector('#login-screen')?.classList.remove('open');document.querySelector('#mod-profile').classList.add('open');UI.renderProfile();
  }else{
   const t=window.profileTest;t.App.data.items=new Map(Object.entries(items));t.App.data.players=new Map([['p',fixture]]);t.App.session={userId:'p',role:'player'};
   // Match the production campaign player record shape.
   t.App.data.playerRows=new Map([['p',{payload:fixture,version:1}]]);
   t.App.ui.screen='profile';t.App.ui.profileTab='profile';
   t.setCommit(async mutate=>{mutate(fixture);window.testSaves++;t.renderProfile();});
   document.querySelector('#app-shell').classList.remove('hidden');document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));document.querySelector('#screen-profile').classList.add('active');
   document.querySelectorAll('.boot-overlay,.login-overlay').forEach(e=>e.remove());t.renderProfile();
  }
 },{fixture,items,surface});
 await page.waitForTimeout(200);
 const report=await page.evaluate(()=>({icons:document.querySelectorAll('.sheet-metric img').length,text:document.querySelector('#screen-profile')?.textContent?.slice(0,100),implants:[...document.querySelectorAll('.character-sheet-implants-v142>[data-slot-type]')].map(el=>({w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height})),overflow:document.documentElement.scrollWidth>innerWidth}));
 console.log(surface,width,report,errors);
 if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`${surface}-${width}.png`),fullPage:true});}
 assert.equal(report.icons,9);assert.equal(report.implants.length,4);assert.ok(report.implants.every(s=>Math.abs(s.w-s.h)<2));assert.equal(report.overflow,false);assert.deepEqual(errors,[]);
 const selector=surface==='desktop'?'[data-inv113-drag-grid][data-item-id="rifle"]':'[data-web-inventory-drag-v1067][data-source="grid"][data-item-id="rifle"]';
 await page.locator(selector).first().click();await page.getByRole('button',{name:'Надеть: Основное оружие',exact:true}).click();
 const equipped=surface==='desktop'?'[data-inv113-drag-slot][data-item-id="rifle"]':'[data-web-inventory-drag-v1067][data-source="slot"][data-item-id="rifle"]';
 await page.locator(equipped).first().click();await page.getByRole('button',{name:'Снять',exact:true}).click();assert.equal(await page.evaluate(()=>window.testSaves),2);
 await page.close();
}
}finally{await browser.close();}
console.log('PASS actual web, desktop and generated Android profiles; equip/unequip once, 9 icons, square implants, no horizontal overflow');
