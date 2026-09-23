import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE):'playwright');
const root=path.resolve(process.argv[2]||path.join(path.dirname(fileURLToPath(import.meta.url)),'../../grpgi-v137'));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1320,height:960}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),surface=url.pathname.startsWith('/web/')?'deploy/site/app':'renderer';
  const rel=surface==='renderer'?url.pathname.slice(1):url.pathname.slice('/web/'.length);
  const file=path.resolve(root,surface,rel||'index.html'),base=path.resolve(root,surface);
  if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const ext=path.extname(file),type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'}[ext]||'application/octet-stream';
  const body=surface==='deploy/site/app'&&ext==='.html'?fs.readFileSync(file,'utf8').replace(/<script\b[^>]*>\s*<\/script>/gi,'') :fs.readFileSync(file);
  return route.fulfill({body,contentType:type});
});
try{
  await page.addInitScript(()=>{
    window.setInterval=()=>0;window.requestAnimationFrame=()=>0;
    const add=window.addEventListener.bind(window),docAdd=document.addEventListener.bind(document);
    window.addEventListener=(kind,...rest)=>kind==='load'?undefined:add(kind,...rest);
    document.addEventListener=(kind,...rest)=>kind==='DOMContentLoaded'?undefined:docAdd(kind,...rest);
    window.electronAPI={appVersion:'1.0.141',debugLog:async()=>{}};
  });
  await page.goto('http://grpgi.test/',{waitUntil:'load'});
  await page.evaluate(()=>{
    document.documentElement.dataset.eraTheme='technological';
    applyWorldData({
      players:{PLAYER_TEMPLATES:{p:{id:'p',role:'player',displayName:'Игрок',approvalStatus:'approved',currentPlanetId:'port',credits:9000,inventory:[{itemId:'rifle',qty:1}],equipmentSlots:{},implantSlots:[],baseStats:{inventorySlots:20,carryBase:100}}}},
      planets:{PLANETS:{port:{id:'port',name:'Торговый порт',market:[{itemId:'rifle',enabled:true,appearanceChance:100,minPrice:100,maxPrice:100}]}}},
      equipment:{EQUIPMENT:{rifle:{id:'rifle',name:'Винтовка',type:'weapon',visibility:{playerIds:['p']},rapidFireShots:6,magazineSize:30,ammoPerShot:2,damage:'2d6',mass:1,inventoryWidth:1,inventoryHeight:1,modifiers:[{target:'carry_capacity',op:'add',value:5},{target:'inventory_slots',op:'set',value:0}]}}},
      campaigns:{CAMPAIGNS:{test:{id:'test',marketDate:'3616-09-21'}}}
    });
    App.state=makeDefaultState();App.state.users.p=normalizePlayerProfileV2(PLAYER_TEMPLATES.p);
    App.currentUserId='p';App.activeCampaignId='test';Sync.config={enabled:false,campaignId:'test'};
    UI.selectedPlanetId='port';document.getElementById('login-screen').classList.remove('open');
    document.getElementById('mod-market').classList.add('open');UI.renderMarket();
  });
  await page.locator('[data-market-v1074][data-item-id="rifle"]').first().click();
  const selection=await page.locator('.market-selection-facts-v1071').innerText();
  for(const word of ['Скорострельность','6 выстр.','Переносимый вес','+5','Ячейки инвентаря','установить 0'])assert.ok(selection.includes(word),word+': '+selection);
  const archive=await page.evaluate(()=>{Wiki.showEntity('item','rifle');return document.querySelector('#wiki-detail .archive-equipment-facts-v131')?.textContent||document.querySelector('#wiki-detail')?.innerHTML||'';});
  for(const word of ['Скорострельность','6 выстр.','Переносимый вес','+5','Ячейки инвентаря','установить 0'])assert.ok(archive.includes(word),word+': '+archive);
  const style=await page.evaluate(()=>{
    const tile=document.querySelector('.market-shop-tile-v1071'),button=document.querySelector('#return-to-center');
    const canvas=document.querySelector('#galaxy');
    return{tile:getComputedStyle(tile).backgroundImage,button:getComputedStyle(button).color,route:getComputedStyle(document.documentElement).getPropertyValue('--map-route').trim(),canvas:!!canvas};
  });
  assert.match(style.tile,/75, 59, 38/);assert.equal(style.route,'#957349');assert.equal(style.canvas,true);
  assert.ok(errors.length===0,errors.join('\n'));
  // The web map and web item card colors are evaluated with production style sheets.
  await page.goto('http://grpgi.test/web/',{waitUntil:'load'});
  const webStyle=await page.evaluate(()=>{
    document.documentElement.dataset.eraTheme='technological';
    const stage=document.createElement('div');stage.className='web-galaxy-stage';
    const inv=document.createElement('div');inv.className='web-inventory-tile-v1067';
    const row=document.createElement('div');row.className='galaxy-planet-row';
    document.body.append(stage,inv,row);
    return{stage:getComputedStyle(stage).backgroundColor,inv:getComputedStyle(inv).backgroundImage,row:getComputedStyle(row).color,route:getComputedStyle(document.documentElement).getPropertyValue('--map-route').trim()};
  });
  assert.match(webStyle.inv,/45, 38, 27/);assert.match(webStyle.stage,/8, 8, 6/);assert.equal(webStyle.route,'#ae8b55');
  assert.ok(errors.length===0,errors.join('\n'));
  console.log('PASS browser: desktop terminal shows all modifiers; desktop and web styles use warm map and item surfaces');
}finally{await browser.close();}
