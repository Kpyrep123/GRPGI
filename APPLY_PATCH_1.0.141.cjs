#!/usr/bin/env node
/* Applies the client-only 1.0.141 changes on top of the exact 1.0.140 source tree.
   Validates every source anchor before writing and backs up each replaced file. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const source=__dirname;
const args=process.argv.slice(2);
const root=path.resolve(args[0]||'');
const test139=args.includes('--test-base-139');
const dry=args.includes('--check');
if(!args[0]||!fs.existsSync(path.join(root,'package.json'))){
  console.error('Укажите путь к исходникам 1.0.140: node APPLY_PATCH_1.0.141.cjs <каталог> [--check]');process.exit(2);
}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(pkg.version!=='1.0.140'&&!(test139&&pkg.version==='1.0.139')){
  console.error(`Ожидается исходник 1.0.140; найден ${pkg.version}. Повторная установка запрещена.`);process.exit(2);
}
if(!test139&&!fs.existsSync(path.join(root,'pocketbase/pb_hooks/grpgi_integrity_v140.js'))){
  console.error('Отсутствует серверный hook 1.0.140. Нужен полный исходник 1.0.140, а не 1.0.139.');process.exit(2);
}
const updates=new Map();
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function put(file,contents){updates.set(file,contents);}
function once(file,text,before,after){
  const count=text.split(before).length-1;
  if(count!==1)throw new Error(`${file}: ожидается ровно один фрагмент (${count}). Исходник не изменён.`);
  return text.replace(before,after);
}
function asset(file){
  const data=fs.readFileSync(path.join(source,file));
  if(fs.existsSync(path.join(root,file)))throw new Error(`${file} уже существует в исходнике; установка остановлена.`);
  updates.set(file,data);
}
try{
  let file='renderer/app.js',text=read(file);
  const marketEnd='<span class="pill">Масса ${mass}</span></div><p class="market-selection-description-v1071">';
  text=once(file,text,marketEnd,
    '<span class="pill">Масса ${mass}</span>${window.GRPGItemFactsV141?.pills(item,{excludeLabels:[\'Тип\',\'Редкость\',\'Размер\',\'Масса\']})||\'\'}</div><p class="market-selection-description-v1071">');
  put(file,text);

  file='renderer/feature-pack-v120.js';text=read(file);
  text=once(file,text,'  function equipmentFactsMarkupV131(item={}){\n    const facts=equipmentFactsV131(item);',
    '  function equipmentFactsMarkupV131(item={}){\n    if(window.GRPGItemFactsV141)return window.GRPGItemFactsV141.table(item);\n    const facts=equipmentFactsV131(item);');
  put(file,text);

  file='deploy/site/app/app.js';text=read(file);
  text=once(file,text,'  function archiveEquipmentFactsWebV131(item = {}) {\n    item=normalizeItemWeb118(item);',
    '  function archiveEquipmentFactsWebV131(item = {}) {\n    if(window.GRPGItemFactsV141)return window.GRPGItemFactsV141.pills(item);\n    item=normalizeItemWeb118(item);');
  const webFacts="${facts.filter(Boolean).map(fact=>`<span class=\"pill\">${esc(fact)}</span>`).join('')}</div><p class=\"market-selection-description-v1071\">";
  text=once(file,text,webFacts,
    "${facts.filter(Boolean).map(fact=>`<span class=\"pill\">${esc(fact)}</span>`).join('')}${window.GRPGItemFactsV141?.pills(item,{excludeLabels:facts})||''}</div><p class=\"market-selection-description-v1071\">");
  text=once(file,text,
    "bg0: '#102b49', bg1: '#071526', bg2: '#020610', stars: '#dff7ff', orbit: 'rgba(96,201,255,.16)'",
    "bg0: '#1c1912', bg1: '#0e0d0a', bg2: '#040403', stars: '#d2bb90', orbit: 'rgba(185,147,88,.18)'");
  text=once(file,text,
    "ctx.filter = medievalBackdrop ? 'sepia(.88) saturate(.48) brightness(.78) contrast(.92)' : 'none';",
    "ctx.filter = medievalBackdrop ? 'sepia(.88) saturate(.48) brightness(.78) contrast(.92)' : String(document.documentElement?.dataset?.eraTheme || '') === 'technological' ? 'sepia(.78) saturate(.50) brightness(.66) contrast(1.10)' : 'none';");
  // Every enabled modifier is visible, including an explicitly configured +0.
  text=once(file,text,
    "    item.modifiers=(Array.isArray(item.modifiers)?item.modifiers:[]).filter(mod=>{\n      if(!mod?.target)return false;\n      return !(String(mod.op||'add')==='add'&&Number(mod.value||0)===0&&!mod.statRef);\n    });",
    "    item.modifiers=(Array.isArray(item.modifiers)?item.modifiers:[]).filter(mod=>mod?.target);");
  put(file,text);

  for(const [file,css] of [
    ['renderer/index.html','technology-theme-v141.css'],
    ['deploy/site/app/index.html','technology-theme-v141.css']
  ]){
    let html=read(file);
    const oldTheme=html.match(/<link rel="stylesheet" href="\.\/technology-theme-v139\.css\?v=1\.0\.(?:139|140)" \/>/g)?.[0];
    if(!oldTheme)throw new Error(`${file}: не найдена таблица стилей 1.0.139.`);
    html=once(file,html,oldTheme,oldTheme+`\n  <link rel="stylesheet" href="./${css}?v=1.0.141" />`);
    const appSrc=html.match(/<script src="\.\/app\.js\?v=1\.0\.(?:139|140)"><\/script>/g)?.[0];
    if(!appSrc)throw new Error(`${file}: не найдена загрузка app.js.`);
    html=once(file,html,appSrc,
      '<script src="./item-facts-v141.js?v=1.0.141"></script>\n  <script src="./app.js?v=1.0.141"></script>');
    html=html.replaceAll(`?v=${pkg.version}`, '?v=1.0.141').replace(`версия ${pkg.version}`,'версия 1.0.141');
    put(file,html);
  }
  const manifest={...pkg,version:'1.0.141',buildVersion:'1.0.141.0'};
  if(manifest.build)manifest.build={...manifest.build,buildVersion:'1.0.141.0'};
  put('package.json',JSON.stringify(manifest,null,2)+'\n');
  asset('renderer/item-facts-v141.js');asset('renderer/technology-theme-v141.css');
  asset('deploy/site/app/item-facts-v141.js');asset('deploy/site/app/technology-theme-v141.css');
  if(dry){console.log(`Проверено: ${updates.size} клиентских файлов. Изменения не записаны.`);process.exit(0);}
  const backup=path.join(root,`.backup-before-v141-${new Date().toISOString().replace(/[:.]/g,'-')}`);
  fs.mkdirSync(backup,{recursive:true});
  const existing=new Set([...updates.keys()].filter(file=>fs.existsSync(path.join(root,file))));
  for(const file of existing){
    const dest=path.join(backup,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,file),dest);
  }
  const written=[];
  try{
    for(const [file,contents] of updates){
      const dest=path.join(root,file);fs.mkdirSync(path.dirname(dest),{recursive:true});
      const temp=dest+'.v141-tmp';fs.writeFileSync(temp,contents);fs.renameSync(temp,dest);written.push(file);
    }
  }catch(error){
    for(const file of written.reverse()){
      const dest=path.join(root,file);
      if(existing.has(file))fs.copyFileSync(path.join(backup,file),dest);else fs.rmSync(dest,{force:true});
    }
    throw error;
  }
  console.log(`Готово: ${updates.size} клиентских файлов; исходники сохранены в ${backup}`);
  console.log('Серверные pb_hooks и файлы данных не изменялись.');
}catch(error){console.error(error.message);process.exit(1);}
