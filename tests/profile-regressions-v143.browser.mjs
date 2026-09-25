import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE):'playwright');
const root=path.resolve(process.argv[2]||'.');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || undefined,args:['--no-sandbox']});
const fixture={id:'p',displayName:'Теодор Солвиц',role:'player',rank:'Доктор',approvalStatus:'approved',credits:195140,lore:'<p>История персонажа — ниже репутации.</p>',personalityTrait:'Наблюдательный',ideal:'Знания',weakness:'Недоверие',inventory:[{itemId:'drone',qty:1},{itemId:'cell',qty:7},{itemId:'rifle',qty:1},{itemId:'armor',qty:1},{itemId:'pack',qty:1},{itemId:'implant',qty:1}],equipmentSlots:{armor:'armor',backpack:'pack'},implantSlots:['','','',''],baseImplantSlots:4,implantSlotCount:4,inventoryBaseSlots:57,carryBase:100,inventorySize:57,carryWeightMax:100,baseStats:{inventorySlots:57,carryBase:100},stats:{hpCurrent:8,hpMax:10,shieldCurrent:20,shieldMax:30,energyCurrent:1,energyMax:2},abilities:{strength:2,dexterity:3,endurance:2,intelligence:4,will:2,glory:1},combat:{moveRange:6,visionRange:6},social:{reputation:[{orgId:'org_test_id',value:12,status:'Союзник'}]}};
const items=Object.fromEntries([{id:'drone',name:'Дрон',type:'drone',inventoryWidth:2,inventoryHeight:2,mass:1},{id:'cell',name:'Инструмент',type:'gear',inventoryWidth:1,inventoryHeight:1,mass:0.1},{id:'rifle',name:'M-97 Viper',type:'weapon',weaponSlot:'primary',mass:2,inventoryWidth:3,inventoryHeight:2,damage:'3',rapidFireShots:3},{id:'armor',name:'Бронекостюм',type:'armor',mass:3,inventoryWidth:2,inventoryHeight:2},{id:'pack',name:'Рюкзак',type:'backpack',mass:1,inventoryWidth:1,inventoryHeight:1},{id:'implant',name:'Нейроинтерфейс',type:'implant',mass:0.2,inventoryWidth:1,inventoryHeight:1}].map(i=>[i.id,i]));
try{
for(const [surface,width] of [['web',1440],['web',390],['web',320],['desktop',1440],['desktop',390],['android',390]]){
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
   applyWorldData({players:{PLAYER_TEMPLATES:{p:fixture}},equipment:{EQUIPMENT:items},factions:{FACTIONS:{org_test_id:{id:'org_test_id',name:'Тестовая организация',visibility:{playerIds:['p']}}}}});
   App.state=makeDefaultState();App.state.users.p=normalizePlayerProfileV2(PLAYER_TEMPLATES.p);App.state.users.p.social=structuredClone(fixture.social);PLAYER_TEMPLATES.p.social=structuredClone(fixture.social);App.currentUserId='p';Sync.config={enabled:false};
   PlayerSync.pushPlayerPatch=async()=>{window.testSaves++;UI.renderProfile();};
   document.querySelector('#login-screen')?.classList.remove('open');document.querySelector('#mod-profile').classList.add('open');UI.renderProfile();
  }else{
   const t=window.profileTest;t.App.data.factions=new Map([['org_test_id',{id:'org_test_id',name:'Тестовая организация',visibility:{playerIds:['p']}}]]);t.App.data.items=new Map(Object.entries(items));t.App.data.players=new Map([['p',fixture]]);t.App.session={userId:'p',role:'player'};
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
 const geometry=await page.evaluate(()=>{
  const grid=document.querySelector('.web-inventory-grid-v1067,.inventory-grid-v1067');
  const cells=[...grid.querySelectorAll('.web-inventory-cell-v1067,.inventory-grid-cell-v1067')],tiles=[...grid.querySelectorAll('.web-inventory-tile-v1067,.inventory-tile-v1067')];
  const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
  const rs=tiles.map(rect),cs=cells.map(rect),g=rect(grid);
  const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
  window.previousGrid=grid;window.previousCell=cells[0];
  return {cells:cs.length,rows:getComputedStyle(grid).gridTemplateRows.split(' ').length,
   overlap:rs.some((r,i)=>rs.slice(i+1).some(b=>overlap(r,b))),cellOverlap:cs.some((r,i)=>cs.slice(i+1).some(b=>overlap(r,b))),
   contains:rs.every(r=>r.x>=g.x && r.right<=g.right+1 && r.bottom<=g.bottom+1),
   scrollers:[grid,grid.parentElement,grid.closest('.web-profile-inventory-v1067,.inventory-profile-card-v1067')].filter(Boolean).some(el=>['auto','scroll'].includes(getComputedStyle(el).overflowY)),
   art:document.querySelectorAll('.sheet-ability-art').length,
   obsolete:[...document.querySelectorAll('.sheet-hero .info-card .k')].some(el=>['Локация','Последнее обновление'].includes(el.textContent.trim())),
   rep:document.querySelector('.web-reputation-list-v120')?.textContent || ''};
 });
 assert.equal(geometry.overlap,false,'items overlap');assert.equal(geometry.cellOverlap,false,'cells overlap');
 assert.equal(geometry.contains,true);assert.equal(geometry.scrollers,false);assert.equal(geometry.art,6);assert.equal(geometry.obsolete,false);
 assert.equal(geometry.cells,57);assert.equal(geometry.rows,12);assert.ok(geometry.rep.includes('Тестовая организация'));assert.ok(!geometry.rep.includes('org_test_id'));assert.ok(geometry.rep.includes('+12'));assert.ok(geometry.rep.includes('Союзник'));
 if(surface==='desktop'){
  await page.locator('[data-profile-section-v1103="lore"]').first().click();assert.equal(await page.locator('.profile-lore-shell-v1103').count(),1);
  await page.locator('[data-profile-section-v1103="profile"]').first().click();assert.equal(await page.locator('.sheet-tools details').count(),2);
  await page.locator('.sheet-tools summary').first().click();assert.equal(await page.locator('#profile-edit-form').isVisible(),true);
  await page.locator('.sheet-tools summary').first().click();
  await page.evaluate(()=>{window.previousGrid=document.querySelector('.inventory-grid-v1067');window.previousCell=window.previousGrid.firstElementChild;});
 }else{
  await page.evaluate(()=>{document.querySelector('#screen-profile').classList.remove('active');document.querySelector('#screen-market').classList.add('active');});
  assert.equal(await page.locator('#screen-profile').isVisible(),false);
  await page.evaluate(()=>{document.querySelector('#screen-market').classList.remove('active');document.querySelector('#screen-profile').classList.add('active');});
 }
 const selector=surface==='desktop'?'[data-inv113-drag-grid][data-item-id="rifle"]':'[data-web-inventory-drag-v1067][data-source="grid"][data-item-id="rifle"]';
 await page.locator(selector).first().click();await page.getByRole('button',{name:'Надеть: Основное оружие',exact:true}).click();
 assert.equal(await page.evaluate(()=>document.querySelector('.web-inventory-grid-v1067,.inventory-grid-v1067')===window.previousGrid),true);
 assert.equal(await page.evaluate(()=>window.previousCell.isConnected),true);
 const equipped=surface==='desktop'?'[data-inv113-drag-slot][data-item-id="rifle"]':'[data-web-inventory-drag-v1067][data-source="slot"][data-item-id="rifle"]';
 await page.locator(equipped).first().click();await page.getByRole('button',{name:'Снять',exact:true}).click();assert.equal(await page.evaluate(()=>window.testSaves),2);
 if(surface!=='desktop'){
  await page.evaluate(()=>{
   const tile=document.querySelector('[data-web-inventory-drag-v1067][data-source="grid"][data-item-id="rifle"]'),grid=document.querySelector('.web-inventory-grid-v1067'),cell=grid.querySelectorAll('.web-inventory-cell-v1067')[30],rect=cell.getBoundingClientRect(),dataTransfer=new DataTransfer();
   tile.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer}));
   grid.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer,clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2}));
   tile.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer}));
  });
  await page.waitForFunction(()=>document.querySelector('[data-web-inventory-drag-v1067][data-source="grid"][data-item-id="rifle"]')?.style.gridRowStart==='7');
 }
 const growth=await page.evaluate(surface=>{
  const selector='.web-inventory-grid-v1067,.inventory-grid-v1067',before=document.querySelector(selector).getBoundingClientRect().height;
  if(surface==='desktop'){App.state.users.p.inventoryBaseSlots=62;App.state.users.p.baseStats.inventorySlots=62;PLAYER_TEMPLATES.p.inventoryBaseSlots=62;PLAYER_TEMPLATES.p.baseStats.inventorySlots=62;UI.renderProfile();}
  else {const t=window.profileTest;t.App.data.players.get('p').inventoryBaseSlots=62;t.App.data.players.get('p').baseStats.inventorySlots=62;t.renderProfile();}
  const grid=document.querySelector(selector);return {before,after:grid.getBoundingClientRect().height,rows:getComputedStyle(grid).gridTemplateRows.split(' ').length,cells:grid.querySelectorAll('.inventory-grid-cell-v1067,.web-inventory-cell-v1067').length};
 },surface);
 assert.equal(growth.cells,62);assert.equal(growth.rows,13);assert.ok(growth.after>growth.before);
 if(surface==='desktop'){
  await page.evaluate(()=>{App.state.users.p.role='gm';PLAYER_TEMPLATES.p.role='gm';UI.renderProfile();});assert.equal(await page.locator('.sheet-tools details').count(),3);
  await page.getByRole('tab',{name:'ПРОЧИТАТЬ ЛОР',exact:true}).click();assert.equal(await page.locator('.profile-lore-shell-v1103').count(),1);assert.equal(await page.locator('#profile-lore-form-v1103').count(),0);
  await page.getByRole('tab',{name:'ПРОФИЛЬ',exact:true}).click();await page.locator('.sheet-tools').scrollIntoViewIfNeeded();
  if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,`desktop-tools-${width}.png`)});
 }
 await page.close();
}
}finally{await browser.close();}
console.log('PASS v143 overlap, capacity growth, reputation, lore, compact tools, grid retention and drag; actual web, desktop and generated Android profiles; equip/unequip once, 9 icons, square implants, no horizontal overflow');
