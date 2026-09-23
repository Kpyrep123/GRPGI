import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const {Window}=await import(process.env.HAPPY_DOM_MODULE?pathToFileURL(process.env.HAPPY_DOM_MODULE):'happy-dom');
const root=path.resolve(process.argv[2]||path.join(path.dirname(fileURLToPath(import.meta.url)),'../../grpgi-v137'));
const dir=path.join(root,'deploy/site/app');
const w=new Window({url:'https://grpgi.test',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
const context=vm.isContext(w)?w:vm.createContext(w),run=source=>vm.runInContext(source,context);
w.setInterval=()=>0;w.requestAnimationFrame=()=>0;w.fetch=async()=>{throw Error('Unexpected network')};
try{
  w.document.write(fs.readFileSync(path.join(dir,'index.html'),'utf8').replace(/<script\b[^>]*>\s*<\/script>/gi,''));
  for(const file of ['rich-text-scope.js','market-engine.js','player-sync-core.js','item-facts-v141.js'])run(fs.readFileSync(path.join(dir,file),'utf8'));
  let app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
  const marker='  init().catch(error => {';assert.equal(app.split(marker).length,2);
  app=app.replace(marker,`window.testV141={archiveEquipmentFactsWebV131,marketItemDetailsWebV1071,normalizeItemWeb118,galaxyEraPaletteV1050};\nif(false) init().catch(error => {`);
  run(app);
  const item={type:'weapon',name:'Винтовка',rapidFireShots:6,magazineSize:30,ammoPerShot:2,durabilityMax:7,chargesMax:4,modifiers:[
    {target:'carry_capacity',op:'add',value:5,enabled:true},
    {target:'inventory_slots',op:'set',value:0,enabled:true},
    {target:'vision',op:'add',value:0,enabled:true},
    {target:'defense',op:'add',value:999,enabled:false}
  ]};
  assert.equal(w.testV141.normalizeItemWeb118(item).rapidFireShots,6);
  assert.equal(w.testV141.normalizeItemWeb118(item).modifiers.length,4);
  for(const html of [w.testV141.archiveEquipmentFactsWebV131(item),w.testV141.marketItemDetailsWebV1071(item,{})]){
    for(const value of ['6 выстр./действие','Переносимый вес','+5','Ячейки инвентаря','установить 0','Обзор','+0','Максимум зарядов'])assert.ok(html.includes(value),value+' in '+html);
    assert.ok(!html.includes('999'));
  }
  w.document.documentElement.dataset.eraTheme='technological';
  const palette=w.testV141.galaxyEraPaletteV1050();
  assert.equal(palette.bg0,'#1c1912');assert.equal(palette.stars,'#d2bb90');
  console.log('PASS web archive, terminal and map: active modifiers incl. zero and shots >3, warm canvas');
}finally{await w.happyDOM.abort();}
