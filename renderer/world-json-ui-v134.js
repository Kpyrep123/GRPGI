/* GRPGI v1.0.134 — independent World Config JSON controls */
(function(){
  'use strict';
  if(window.__GRPGWorldJsonTransferV132)return;
  window.__GRPGWorldJsonTransferV132=true;

  const Codec=window.GRPGWorldJsonCodecV132;
  if(!Codec){console.error('WORLD_JSON_V132_CODEC_MISSING');return;}
  const copy=value=>{try{return typeof deep==='function'?deep(value):structuredClone(value);}catch{return JSON.parse(JSON.stringify(value));}};
  const safe=value=>typeof esc==='function'?esc(value):String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let transferBusy=false;

  function sectionPayload(type){return Configurator.buildPayload(type);}
  function sectionEntries(type){return Codec.sectionEntries(type,WORLD_SECTIONS,sectionPayload(type));}

  function validatePlayerImport(entries,mode){
    const gm=entries.find(entity=>entity.id==='gm');
    if(mode==='replace'&&!gm)throw new Error('Полная замена персонажей должна содержать профиль gm');
    if(gm&&String(gm.role||'').toLowerCase()!=='gm')throw new Error('Профиль gm должен сохранять роль gm');
  }

  function chooseImportMode(type,fileName,summary){
    const meta=WORLD_SECTIONS[type];
    return new Promise(resolve=>{
      const overlay=document.createElement('div');
      overlay.className='world-json-modal-v132';
      overlay.setAttribute('role','dialog');
      overlay.setAttribute('aria-modal','true');
      overlay.setAttribute('aria-labelledby','world-json-title-v132');
      overlay.innerHTML=`<div class="world-json-modal-card-v132 card">
        <div class="section-title">JSON_IMPORT_PREVIEW</div>
        <h2 id="world-json-title-v132">${safe(meta.label)}</h2>
        <div class="small-note">${safe(fileName||`${type}.json`)}</div>
        <div class="world-json-summary-v132">
          <span><b>${summary.total}</b> в файле</span><span><b>${summary.added}</b> новых</span><span><b>${summary.updated}</b> изменённых</span><span><b>${summary.unchanged}</b> без изменений</span><span><b>${summary.missing}</b> отсутствуют в файле</span>
        </div>
        <div class="world-json-mode-list-v132">
          <button class="secondary" type="button" data-world-json-mode-v132="merge"><b>ОБЪЕДИНИТЬ</b><small>Добавить новые и полностью обновить совпадающие ID; остальные записи оставить.</small></button>
          <button class="danger" type="button" data-world-json-mode-v132="replace"><b>ЗАМЕНИТЬ РАЗДЕЛ</b><small>Сделать файл точной копией раздела; ${summary.missing} отсутствующих записей будут удалены.</small></button>
        </div>
        <div class="small-note world-json-warning-v132">Импортируется весь выбранный раздел. Несохранённые правки открытой карточки не входят в операцию.</div>
        <div class="row world-json-modal-actions-v132"><button class="ghost" type="button" data-world-json-mode-v132="cancel">ОТМЕНА</button></div>
      </div>`;
      const finish=mode=>{document.removeEventListener('keydown',onKey);overlay.remove();resolve(mode);};
      const onKey=event=>{if(event.key==='Escape')finish('cancel');};
      overlay.addEventListener('click',event=>{const button=event.target.closest?.('[data-world-json-mode-v132]');if(button)finish(button.dataset.worldJsonModeV132);else if(event.target===overlay)finish('cancel');});
      document.addEventListener('keydown',onKey);
      document.body.appendChild(overlay);
      overlay.querySelector('[data-world-json-mode-v132="merge"]')?.focus();
    });
  }

  function applyEntries(type,entries,mode){
    const current=sectionEntries(type);
    const incomingIds=new Set(entries.map(entity=>entity.id));
    for(const entity of current){
      if(mode==='replace'||incomingIds.has(entity.id))Configurator.removeEntity(type,entity.id);
    }
    for(const entity of entries)Configurator.insertEntity(type,copy(entity));
    if(type==='equipment'&&entries[0]?.type)Configurator.equipmentCategoryV1052=String(entries[0].type);
    const remaining=sectionEntries(type);
    Configurator.selectedId=entries[0]?.id||remaining[0]?.id||null;
    return {oldIds:current.map(entity=>entity.id),newIds:remaining.map(entity=>entity.id)};
  }

  async function syncPlayerRecords(entries,mode,oldIds){
    if(!PlayerSync?.shouldIsolateUsersFromSnapshot?.())return [];
    const failures=[];
    const importedIds=new Set(entries.map(entity=>entity.id));
    if(mode==='replace')for(const id of oldIds){
      if(importedIds.has(id))continue;
      try{
        const result=await PlayerSync.deletePlayer(id,{silentToast:true,rerender:false,writeLocalMirrors:false});
        if(!result?.ok&&result?.status!=='disabled')failures.push(`${id}: ${result?.message||'ошибка удаления'}`);
      }catch(error){failures.push(`${id}: ${error.message}`);}
    }
    for(const entity of entries){
      const player=App.state.users?.[entity.id];
      if(!player)continue;
      try{
        const result=await PlayerSync.pushPlayerRecord(entity.id,player,{rerender:false,writeLocalMirrors:false});
        if(!result?.ok&&result?.status!=='disabled')failures.push(`${entity.id}: ${result?.message||'ошибка записи'}`);
      }catch(error){failures.push(`${entity.id}: ${error.message}`);}
    }
    return failures;
  }

  async function persistImport(type,entries,mode,oldIds){
    if(type==='combatScenes'){
      const result=await Combat.saveJsonScenesV133();
      if(!result?.ok)throw new Error(result?.message||'Не удалось сохранить локальные сцены');
      return {cloudResult:{ok:true,status:'disabled'},playerFailures:[],stateError:''};
    }
    const nextSnapshot=buildWorldSnapshot();
    const result=await window.electronAPI.saveWorldSection(type,nextSnapshot[type]);
    if(!result?.ok)throw new Error(result?.message||'Не удалось записать раздел мира');
    const loaded=await window.electronAPI.loadWorldData();
    const savedWorld=loaded?.ok&&loaded.world?loaded.world:nextSnapshot;
    worldData=savedWorld;
    applyWorldData(savedWorld);
    if(type==='players')App.state.users=copy(PLAYER_TEMPLATES);
    App.state.meta.lastUpdatedAt=new Date().toISOString();
    const playerFailures=type==='players'?await syncPlayerRecords(entries,mode,oldIds):[];
    let cloudResult={ok:true,status:'disabled'};
    let stateError=loaded?.ok?'':String(loaded?.message||'Не удалось перечитать файлы мира после импорта');
    try{
      Sync.markLocalDirty(type==='players'?'WORLD_CONFIG_PLAYER_JSON_IMPORT':'WORLD_CONFIG_JSON_IMPORT');
      await Persistence.save(App.state);
      cloudResult=await Sync.pushCurrentSnapshot('world-config-json-import',{silent:true});
      App.state=await Persistence.load();
      if(type==='players')mirrorPlayersIntoWorld(App.state);
      App.refreshAfterLocalWrite();
    }catch(error){stateError=[stateError,error.message||String(error)].filter(Boolean).join('; ');cloudResult={ok:false,message:stateError};}
    return {cloudResult,playerFailures,stateError};
  }

  async function exportSelectedSection(type){
    if(!window.electronAPI?.exportWorldSectionJson)throw new Error('Экспорт JSON доступен только в приложении');
    const payload=Codec.canonicalExportPayload(type,WORLD_SECTIONS,sectionPayload(type));
    const result=await window.electronAPI.exportWorldSectionJson(type,payload);
    if(!result?.ok)throw new Error(result?.message||'Не удалось экспортировать JSON');
    if(!result.canceled)Toast.show(`Раздел «${WORLD_SECTIONS[type].label}» экспортирован: ${result.fileName}`,'ok');
  }

  async function importSelectedSection(type){
    if(!window.electronAPI?.importWorldSectionJson)throw new Error('Импорт JSON доступен только в приложении');
    const file=await window.electronAPI.importWorldSectionJson(type);
    if(!file?.ok)throw new Error(file?.message||'Не удалось открыть JSON');
    if(file.canceled)return;
    const entries=Codec.sectionEntries(type,WORLD_SECTIONS,file.payload);
    const summary=Codec.summarize(type,WORLD_SECTIONS,sectionPayload(type),entries);
    const mode=await chooseImportMode(type,file.fileName,summary);
    if(mode==='cancel')return;
    if(type==='players')validatePlayerImport(entries,mode);

    const beforeSnapshot=copy(buildWorldSnapshot());
    const beforeSection=copy(sectionEntries(type));
    const beforeUsers=copy(App.state.users||{});
    let changes;
    try{
      changes=applyEntries(type,entries,mode);
      const status=await persistImport(type,entries,mode,changes.oldIds);
      Configurator.render();
      const cloudFailed=!status.cloudResult?.ok&&status.cloudResult?.status!=='disabled';
      if(status.stateError)Toast.show(`Раздел импортирован в файлы мира, но состояние/облако не обновлено: ${status.stateError}`,'err');
      else if(status.playerFailures.length)Toast.show(`Импорт сохранён локально, но ${status.playerFailures.length} профильных записей не синхронизированы.`,'err');
      else if(cloudFailed)Toast.show(`Импорт сохранён локально, но облако не обновлено: ${status.cloudResult?.message||'unknown error'}`,'err');
      else Toast.show(`Импортирован раздел «${WORLD_SECTIONS[type].label}»: ${entries.length} записей`,'ok');
    }catch(error){
      App.state.users=beforeUsers;
      applyWorldData(beforeSnapshot);
      if(type==='combatScenes')applyEntries(type,beforeSection,'replace');
      Configurator.render();
      throw error;
    }
  }

  async function runTransfer(button,action,type){
    if(transferBusy)return;
    transferBusy=true;
    const previous=button.textContent;
    const panel=button.closest('.world-json-transfer-v132');
    panel?.querySelectorAll('button').forEach(node=>{node.disabled=true;});
    button.textContent=action==='export'?'EXPORT…':'IMPORT…';
    try{
      if(action==='export')await exportSelectedSection(type);
      else await importSelectedSection(type);
    }catch(error){console.error('WORLD_JSON_TRANSFER_V132',error);Toast.show(error.message||String(error),'err');}
    finally{
      transferBusy=false;
      if(button.isConnected)button.textContent=previous;
      if(panel?.isConnected)panel.querySelectorAll('button').forEach(node=>{node.disabled=false;});
    }
  }

  function injectTransferPanel(){
    const root=document.getElementById('config-content');
    const type=Configurator.selectedType;
    const meta=WORLD_SECTIONS[type];
    const list=root?.querySelector('.config-grid');
    if(!root||!list||!meta||meta.special||(!meta.mapKey&&!meta.arrayKey))return;
    root.querySelectorAll('.world-json-transfer-v132').forEach(node=>node.remove());
    const panel=document.createElement('section');
    panel.className='world-json-transfer-v132 card';
    panel.innerHTML=`<div class="section-title">JSON · ${safe(meta.label)}</div><div class="world-json-transfer-actions-v132"><button class="secondary" type="button" data-world-json-action-v132="export">ЭКСПОРТ JSON</button><button class="secondary" type="button" data-world-json-action-v132="import">ИМПОРТ JSON</button></div><div class="small-note">${safe(type)}.json · экспортируется весь раздел. После импорта данные сохраняются в рабочем хранилище и не заменяются шаблонами при запуске.</div>`;
    root.prepend(panel);
    panel.querySelectorAll('[data-world-json-action-v132]').forEach(button=>button.addEventListener('click',()=>runTransfer(button,button.dataset.worldJsonActionV132,type)));
  }

  const renderBeforeJson132=Configurator.render.bind(Configurator);
  Configurator.render=function(){const result=renderBeforeJson132();injectTransferPanel();return result;};
  window.GRPGWorldJsonTransferV132=Object.freeze({version:'1.0.134',applyEntries,sectionEntries});
})();

