/* GRPGI v1.0.117 — activate player save transaction + single implant system */
(function(){
  'use strict';
  if(window.__GRPGStatsV116)return;
  window.__GRPGStatsV116=true;

  const VERSION='1.0.117';
  const copy=v=>{try{return typeof deep==='function'?deep(v):JSON.parse(JSON.stringify(v));}catch{return v;}};
  const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const integer=(v,f=0)=>Math.trunc(num(v,f));
  const configuratorAvailable=typeof Configurator!=='undefined'&&Boolean(Configurator);

  function itemIsImplant(id){
    if(!id)return false;
    try{return String(normalizeEquipmentItemV2(EQUIPMENT?.[id]||Data?.getItem?.(id)||{}).type||'').toLowerCase()==='implant';}
    catch{return false;}
  }

  function inventoryQty(user,itemId){
    return Math.max(0,integer((user?.inventory||[]).find(row=>String(row?.itemId||'')===String(itemId||''))?.qty,0));
  }

  function canonicalImplantSlots(raw={}){
    const source=raw&&typeof raw==='object'?raw:{};
    let slots;
    // implantSlots is the only modern source of truth. installedImplantIds is read
    // only as a migration fallback for a genuinely old profile that has no slot array.
    if(Array.isArray(source.implantSlots))slots=source.implantSlots.map(v=>String(v||'').trim());
    else if(Array.isArray(source.installedImplantIds))slots=source.installedImplantIds.map(v=>String(v||'').trim());
    else slots=[];
    const requested=Math.max(0,integer(source.implantSlotCount,slots.length));
    slots=Array.from({length:requested},(_,idx)=>String(slots[idx]||'').trim());

    // A slot can only contain a real owned implant. This retires the old checkbox/text
    // systems that were able to install an item without an inventory instance.
    const used=new Map();
    return slots.map(id=>{
      if(!id||!itemIsImplant(id))return '';
      const count=(used.get(id)||0)+1;
      used.set(id,count);
      return inventoryQty(source,id)>=count?id:'';
    });
  }

  if(typeof normalizePlayerProfileV2==='function'){
    const normalizeBefore116=normalizePlayerProfileV2;
    normalizePlayerProfileV2=function(raw={}){
      const source={...(raw||{})};
      const next=normalizeBefore116(source);
      // The final slot count comes from Stats Engine after base values and modifiers
      // are calculated. Raw legacy implantSlotCount must not override that result.
      const canonicalSource={
        ...next,
        inventory:Array.isArray(source.inventory)?source.inventory:next.inventory,
        implantSlots:Array.isArray(source.implantSlots)?source.implantSlots:next.implantSlots,
        implantSlotCount:Math.max(0,integer(next.implantSlotCount,0))
      };
      const slots=canonicalImplantSlots(canonicalSource);
      next.implantSlotCount=slots.length;
      next.implantSlots=slots;
      next.installedImplantIds=slots.filter(Boolean); // compatibility alias only
      next.implants=[]; // retire the original free-text implant system
      return next;
    };
  }

  function fieldByLabel(form,matcher){
    return Array.from(form?.querySelectorAll?.('.field')||[]).filter(field=>{
      const label=field.querySelector(':scope > label');
      const text=String(label?.textContent||'').trim();
      return typeof matcher==='function'?matcher(text):text===matcher;
    });
  }

  function sanitizePlayerEditorDom(form){
    if(!form||form.dataset.entityType!=='players')return;
    form.classList.add('wc-player-editor-v116');

    // Generation 1: textual implants array (name|status / name|energy|description).
    fieldByLabel(form,text=>/^Импланты\s*\(/i.test(text)).forEach(node=>node.remove());
    form.querySelectorAll('[name="implants"]').forEach(node=>node.closest('.field')?.remove());

    // Generation 2: installedImplantIds checkboxes.
    fieldByLabel(form,text=>/^Установленные импланты$/i.test(text)).forEach(node=>node.remove());
    form.querySelectorAll('[name="installedImplantIds"]').forEach(node=>node.closest('.field,.selector-card')?.remove());

    // Generation 3: implantSlot_0... dropdowns. The inventory slot strip is the only editor.
    form.querySelectorAll('.implant-slot-editor-v1067').forEach(node=>node.remove());
    form.querySelectorAll('select[name^="implantSlot_"]').forEach(node=>node.closest('.field,.dynamic-row')?.remove());

    // Old raw inventory settings duplicate the Stats Engine bases and can disagree with it.
    // Keep the hidden JSON state and the visual inventory editor; remove only obsolete controls.
    fieldByLabel(form,text=>text==='Слотов имплантов').forEach(node=>node.remove());

    const inventoryEditors=form.querySelectorAll('[data-wc-inventory-editor-v1068]');
    inventoryEditors.forEach((node,index)=>{if(index>0)node.remove();});

    // Make the canonical model explicit for diagnostics and future patches.
    const editor=form.querySelector('[data-wc-inventory-editor-v1068]');
    if(editor)editor.dataset.implantSourceV116='inventory-only';
  }

  function sanitizePlayerEditorHtml(html){
    try{
      const tpl=document.createElement('template');
      tpl.innerHTML=String(html||'').trim();
      const form=tpl.content.querySelector('#config-editor-form[data-entity-type="players"]');
      if(form)sanitizePlayerEditorDom(form);
      return tpl.innerHTML;
    }catch(error){
      console.error('WC_PLAYER_SANITIZE_HTML_V116',error);
      return html;
    }
  }

  function sanitizeProfileImplantsDom(root=document.getElementById('profile-content')){
    if(!root)return;
    // v1052 bundled origin information and a second installed-implant list into the
    // same block. Keep profession/origin, remove only the duplicate list; the actual
    // inventory slot strip remains the sole player-facing implant representation.
    root.querySelectorAll('[data-origins-v1052] .section-title').forEach(title=>{
      if(String(title.textContent||'').trim()!=='Установленные импланты')return;
      const list=title.nextElementSibling;
      if(list?.classList?.contains?.('result-stack'))list.remove();
      title.remove();
    });
  }

  // Configurator is a top-level const in app.js. It must be accessed through the
  // shared global lexical environment; window.Configurator is always undefined.
  if(typeof Configurator!=='undefined'&&Configurator?.renderPlayerEditor){
    const renderPlayerBefore116=Configurator.renderPlayerEditor.bind(Configurator);
    Configurator.renderPlayerEditor=function(raw){
      return sanitizePlayerEditorHtml(renderPlayerBefore116(raw));
    };
  }

  if(typeof Configurator!=='undefined'&&Configurator?.render){
    const renderBefore116=Configurator.render.bind(Configurator);
    Configurator.render=function(){
      const result=renderBefore116();
      if(this.selectedType==='players')sanitizePlayerEditorDom(document.getElementById('config-editor-form'));
      return result;
    };
  }

  if(typeof UI!=='undefined'&&UI?.renderProfile){
    const renderProfileBefore116=UI.renderProfile.bind(UI);
    UI.renderProfile=function(...args){
      const result=renderProfileBefore116(...args);
      sanitizeProfileImplantsDom(document.getElementById('profile-content'));
      return result;
    };
  }

  function inventoryStateFromForm(form,entity){
    const hidden=form?.querySelector?.('[name="wcInventoryStateV1068"]');
    if(!hidden?.value)return entity;
    try{
      const state=JSON.parse(hidden.value);
      if(Array.isArray(state.inventory))entity.inventory=copy(state.inventory);
      if(state.equipmentSlots&&typeof state.equipmentSlots==='object')entity.equipmentSlots=copy(state.equipmentSlots);
      if(Array.isArray(state.implantSlots))entity.implantSlots=state.implantSlots.map(v=>String(v||''));
      if(state.implantSlotCount!==undefined)entity.implantSlotCount=Math.max(0,integer(state.implantSlotCount,0));
      if(state.inventorySize!==undefined)entity.inventorySize=Math.max(0,integer(state.inventorySize,entity.inventorySize||0));
      if(state.carryWeightMax!==undefined)entity.carryWeightMax=Math.max(0,num(state.carryWeightMax,entity.carryWeightMax||0));
    }catch(error){
      console.error('WC_PLAYER_INVENTORY_PARSE_V116',error);
      throw new Error('Не удалось прочитать состояние инвентаря. Сохранение отменено, чтобы не повредить профиль.');
    }
    return entity;
  }

  function canonicalizePlayerForSave(entity,form){
    let next=copy(entity||{});
    next=inventoryStateFromForm(form,next);
    next.implants=[];
    const slots=canonicalImplantSlots(next);
    next.implantSlotCount=slots.length;
    next.implantSlots=slots;
    next.installedImplantIds=slots.filter(Boolean);
    try{return normalizePlayerProfileV2(next);}catch{return next;}
  }

  if(typeof Configurator!=='undefined'&&Configurator?.collectEntity){
    const collectBefore116=Configurator.collectEntity.bind(Configurator);
    Configurator.collectEntity=function(type,form,formData=new FormData(form)){
      const entity=collectBefore116(type,form,formData);
      if(type!=='players'||!entity)return entity;
      return canonicalizePlayerForSave(entity,form);
    };
  }

  async function savePlayerTransaction(form){
    const current=Configurator.getSelectedEntity?.();
    const oldId=String(current?.id||Configurator.selectedId||'').trim();
    if(typeof waitForPendingImageTasks==='function')await waitForPendingImageTasks(form);
    const fd=new FormData(form);
    let entity=Configurator.collectEntity('players',form,fd);
    entity=canonicalizePlayerForSave(entity,form);
    if(!entity?.id)throw new Error('Не удалось собрать ID персонажа');
    if(oldId==='gm'&&entity.role!=='gm')throw new Error('Профиль ведущего должен оставаться ролью gm');

    // Phase 1: durable local world write. Cloud failures after this point can never
    // invalidate the save the user just made. Keep a complete rollback image because
    // replaceEntity also remaps references when the player ID changes.
    const previousWorld=copy(buildWorldSnapshot());
    const previousUsers=copy(App.state?.users||{});
    const previousSelectedId=Configurator.selectedId;
    let local;
    try{
      // Update both in-memory player stores before the candidate snapshot is built.
      // buildWorldSnapshot mirrors App.state into world data.
      Configurator.replaceEntity('players',oldId,entity);
      App.state.users=App.state.users||{};
      if(oldId&&oldId!==entity.id)delete App.state.users[oldId];
      App.state.users[entity.id]=copy(entity);
      PLAYER_TEMPLATES[entity.id]=copy(entity);
      if(oldId&&oldId!==entity.id)delete PLAYER_TEMPLATES[oldId];
      Configurator.selectedId=entity.id;

      const snapshot=buildWorldSnapshot();
      local=await window.electronAPI?.saveWorldData?.(snapshot);
      if(!local?.ok||!local.world)throw new Error(`Ошибка локальной записи мира: ${local?.message||'unknown'}`);
    }catch(error){
      // A failed disk write must not leave an unsaved profile (or renamed references)
      // in memory and must not discard the user's form draft.
      try{
        applyWorldData(previousWorld);
        App.state.users=copy(previousUsers);
      }catch(rollbackError){console.error('WC_PLAYER_LOCAL_ROLLBACK_FAILED_V117',rollbackError);}
      Configurator.selectedId=previousSelectedId;
      throw error;
    }

    worldData=local.world;
    applyWorldData(local.world);
    App.state.users=copy(PLAYER_TEMPLATES);
    App.state.meta=App.state.meta||{};
    App.state.meta.lastUpdatedAt=new Date().toISOString();
    await Persistence.save(App.state);

    FormDrafts?.clear?.(FormDrafts.configKey('players',oldId||entity.id));
    FormDrafts?.clear?.(FormDrafts.configKey('players',entity.id));

    // Phase 2: player record and world snapshot are best-effort sync. Do not reload
    // stale state afterwards; keep the locally committed entity in memory.
    let playerSync={ok:true,status:'disabled'};
    try{
      playerSync=await PlayerSync.pushPlayerRecord(entity.id,App.state.users[entity.id],{oldId,rerender:false});
    }catch(error){playerSync={ok:false,message:error?.message||String(error)};}

    let snapshotSync={ok:true,status:'disabled'};
    try{
      Sync.markLocalDirty('WORLD_CONFIG_PLAYER_PENDING_SYNC');
      await Persistence.save(App.state);
      snapshotSync=await Sync.pushCurrentSnapshot('world-config-player-save',{silent:true});
    }catch(error){snapshotSync={ok:false,message:error?.message||String(error)};}

    // Reassert the local committed record in case a sync implementation applied an
    // older returned row. The explicit player push above is the authoritative remote write.
    const committed=normalizePlayerProfileV2({...copy(entity),id:entity.id});
    App.state.users[entity.id]=committed;
    PLAYER_TEMPLATES[entity.id]=copy(committed);
    await Persistence.save(App.state);
    await persistPlayerWorldMirror(App.state);
    App.refreshAfterLocalWrite();

    if(!playerSync?.ok&&playerSync?.status!=='disabled'){
      Toast.show(`Персонаж сохранён локально. Профильная синхронизация не выполнена: ${playerSync?.message||'unknown'}`,'info');
    }else if(!snapshotSync?.ok&&snapshotSync?.status!=='disabled'){
      Toast.show(`Персонаж сохранён локально. Снимок кампании не синхронизирован: ${snapshotSync?.message||'unknown'}`,'info');
    }else{
      Toast.show(`Персонаж сохранён: ${committed.displayName||committed.id}`,'ok');
    }
    Configurator.render();
    return {ok:true,entity:committed,playerSync,snapshotSync};
  }

  if(typeof Configurator!=='undefined'&&Configurator?.submit){
    const submitBefore116=Configurator.submit.bind(Configurator);
    Configurator.submit=async function(event){
      if(this.selectedType!=='players')return submitBefore116(event);
      event?.preventDefault?.();
      event?.stopImmediatePropagation?.();
      const form=event?.currentTarget?.matches?.('#config-editor-form')?event.currentTarget:document.getElementById('config-editor-form');
      if(!form)return;
      try{
        if(form.dataset.savingV116==='1')return;
        form.dataset.savingV116='1';
        form.querySelectorAll('button[type="submit"]').forEach(btn=>btn.disabled=true);
        await savePlayerTransaction(form);
      }catch(error){
        console.error('WC_PLAYER_SAVE_FAILED_V116',error);
        Toast.show(`Не удалось сохранить персонажа: ${error?.message||String(error)}`,'err');
      }finally{
        const currentForm=document.getElementById('config-editor-form');
        if(currentForm){delete currentForm.dataset.savingV116;currentForm.querySelectorAll('button[type="submit"]').forEach(btn=>btn.disabled=false);}
      }
    };
  }

  // Capture fallback: if an old render produced a submit button without the normal
  // Configurator binding, route it through the same transaction.
  document.addEventListener('click',event=>{
    const button=event.target?.closest?.('#config-editor-form[data-entity-type="players"] button[type="submit"]');
    if(!button)return;
    const form=button.closest('form');
    if(!form)return;
    if(button.dataset.bound==='1')return; // normal Configurator binding will call the overridden submit
    event.preventDefault();
    void Configurator.submit({
      preventDefault(){},
      stopImmediatePropagation(){},
      currentTarget:form
    });
  },true);

  // Clean persisted runtime objects in memory without deleting inventory ownership.
  try{
    Object.entries(PLAYER_TEMPLATES||{}).forEach(([id,raw])=>PLAYER_TEMPLATES[id]=normalizePlayerProfileV2(raw));
    Object.entries(App.state?.users||{}).forEach(([id,raw])=>App.state.users[id]=normalizePlayerProfileV2(raw));
  }catch(error){console.warn('IMPLANT_CANONICALIZE_V116',error);}

  if(!configuratorAvailable)console.error('WC_PLAYER_BOOTSTRAP_FAILED_V117: Configurator lexical binding is unavailable');
  window.GRPGStatsV116={version:VERSION,configuratorBound:configuratorAvailable,canonicalImplantSlots,sanitizePlayerEditorDom,sanitizeProfileImplantsDom,savePlayerTransaction};
})();
