/* GRPGI v1.0.115 — profile/WC regression recovery */
(function(){
  'use strict';
  if(window.__GRPGStatsV115)return;
  window.__GRPGStatsV115=true;

  const PRIMARY=['strength','dexterity','endurance','intelligence','will','glory'];
  const n=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const i=(v,f=0)=>Math.trunc(n(v,f));
  const deepCopy=v=>{try{return typeof deep==='function'?deep(v):JSON.parse(JSON.stringify(v));}catch{return v;}};

  function modifiersFromForm(form){
    const normalize=window.GRPGStatsV113?.normalizeModifier;
    if(typeof normalize!=='function')return null;
    // If the editor is absent because an older/malformed renderer won the wrapper
    // chain, do not erase already saved modifiers during SAVE_PLAYER.
    if(!form?.querySelector?.('[data-modifier-editor-v113]'))return null;
    return Array.from(form?.querySelectorAll?.('[data-modifier-row-v113]')||[]).map(row=>normalize({
      target:row.querySelector('[data-mod-target-v113]')?.value,
      op:row.querySelector('[data-mod-op-v113]')?.value,
      value:row.querySelector('[data-mod-value-v113]')?.value,
      statRef:row.querySelector('[data-mod-stat-v113]')?.value,
      scope:row.querySelector('[data-mod-scope-v113]')?.value,
      scopeValue:row.querySelector('[data-mod-scope-value-v113]')?.value,
      priority:row.querySelector('[data-mod-priority-v113]')?.value,
      condition:row.querySelector('[data-mod-condition-v113]')?.value,
      conditionValue:row.querySelector('[data-mod-condition-value-v113]')?.value
    })).filter(Boolean);
  }

  function selectedPlayerRaw(){
    try{
      const selected=Configurator?.getSelectedEntity?.();
      if(selected)return deepCopy(selected);
      const id=String(Configurator?.selectedId||'');
      return deepCopy(PLAYER_TEMPLATES?.[id]||App?.state?.users?.[id]||{});
    }catch{return {};}
  }

  function parseInventoryState(form,entity){
    const raw=String(form?.querySelector?.('[name="wcInventoryStateV1068"]')?.value||'').trim();
    if(!raw)return entity;
    try{
      const state=JSON.parse(raw);
      if(Array.isArray(state.inventory))entity.inventory=deepCopy(state.inventory);
      if(state.equipmentSlots&&typeof state.equipmentSlots==='object')entity.equipmentSlots=deepCopy(state.equipmentSlots);
      if(Array.isArray(state.implantSlots))entity.implantSlots=state.implantSlots.map(v=>String(v||''));
      if(state.implantSlotCount!==undefined)entity.implantSlotCount=Math.max(0,i(state.implantSlotCount,0));
      if(state.inventorySize!==undefined)entity.inventorySize=Math.max(0,i(state.inventorySize,12));
      if(state.carryWeightMax!==undefined)entity.carryWeightMax=Math.max(0,n(state.carryWeightMax,12));
      entity.installedImplantIds=(entity.implantSlots||[]).filter(Boolean);
    }catch(error){console.warn('WC_PLAYER_INVENTORY_STATE_V115',error);}
    return entity;
  }

  function repairPlayerEditorLayout(){
    const main=document.querySelector('#config-content .config-main');
    const form=document.querySelector('#config-editor-form[data-entity-type="players"]');
    if(!form)return;
    form.classList.add('wc-player-editor-v115');

    // Stats must live before the inventory editor, not immediately before SAVE_PLAYER.
    const stats=form.querySelector('.wc-stats-section-v115')||main?.querySelector?.('.wc-stats-section-v115');
    const inventory=form.querySelector('[data-wc-inventory-editor-v1068]');
    if(stats){
      if(!form.contains(stats))form.appendChild(stats);
      if(inventory&&stats.nextElementSibling!==inventory)form.insertBefore(stats,inventory);
    }

    // If malformed legacy markup ever placed the modifier editor outside the form,
    // put it back into the stats section so FormData and SAVE_PLAYER remain complete.
    const misplaced=main?Array.from(main.querySelectorAll('[data-modifier-editor-v113]')).filter(node=>!form.contains(node)):[];
    misplaced.forEach(node=>(stats||form).appendChild(node));

    // SAVE_PLAYER must always be physically inside the player form.
    let save=Array.from(main?.querySelectorAll?.('button.primary[type="submit"]')||[]).find(btn=>/SAVE_PLAYER/i.test(btn.textContent||''));
    if(save&&!form.contains(save))form.appendChild(save);
    save=form.querySelector('button.primary[type="submit"]')||save;
    if(save&&save.dataset.boundV115!=='1'){
      save.dataset.boundV115='1';
      save.addEventListener('click',event=>{
        if(!form.contains(save))return;
        // The application already binds requestSubmit. This fallback is only used
        // when a previous malformed render prevented that binding.
        if(save.dataset.bound!=='1'){
          event.preventDefault();
          form.requestSubmit();
        }
      });
    }

    // Obsolete duplicate equipment selectors are hidden; the real inventory editor
    // is the single source of truth for equipped items.
    ['primaryWeapon','secondaryWeapon','armor'].forEach(name=>form.querySelector(`[name="${name}"]`)?.closest('.field')?.classList.add('wc-inventory-legacy-hidden-v1068'));
    form.querySelectorAll('.implant-slot-editor-v1067').forEach(node=>node.classList.add('wc-inventory-legacy-hidden-v1068'));
  }

  // app.js exposes Configurator as a global lexical binding, not window.Configurator.
  if(typeof Configurator!=='undefined'&&Configurator){
    const renderBefore115=Configurator.render?.bind(Configurator);
    if(renderBefore115){
      Configurator.render=function(){
        const result=renderBefore115();
        if(this.selectedType==='players')repairPlayerEditorLayout();
        return result;
      };
    }

    const collectBefore115=Configurator.collectEntity?.bind(Configurator);
    if(collectBefore115){
      Configurator.collectEntity=function(type,form,formData=new FormData(form)){
        if(type!=='players')return collectBefore115(type,form,formData);
        const original=selectedPlayerRaw();
        let collected={};
        try{collected=collectBefore115(type,form,formData)||{};}
        catch(error){
          console.error('WC_PLAYER_COLLECT_LEGACY_FAILED_V115',error);
          collected={};
        }
        let entity={...original,...deepCopy(collected)};

        // Core identity values are explicit so SAVE_PLAYER can never depend on a
        // hidden/removed legacy editor field.
        const value=name=>formData.get(name);
        const id=String(value('id')||entity.id||'').trim();
        if(id)entity.id=id;
        ['role','pass','shortName','displayName','rank','avatarGlyph','currentPlanetId'].forEach(key=>{
          const v=value(key); if(v!==null)entity[key]=String(v||'').trim();
        });
        if(value('credits')!==null)entity.credits=n(value('credits'),entity.credits||0);
        if(value('lore')!==null)entity.lore=String(value('lore')||'').trim();
        if(value('notes')!==null)entity.notes=String(value('notes')||'').trim();
        if(value('skillPoints')!==null)entity.skillPoints=Math.max(0,i(value('skillPoints'),entity.skillPoints||0));

        // Explicitly preserve/edit the visible runtime/resource fields even if one
        // of the legacy collectors in the wrapper chain fails. Max HP is derived.
        entity.stats={...(entity.stats||{})};
        const statFields={hpCurrent:'hpCurrent',energyCurrent:'energyCurrent',energyMax:'energyMax',shieldCurrent:'shieldCurrent',shieldMax:'shieldMax'};
        Object.entries(statFields).forEach(([field,key])=>{const v=value(field);if(v!==null)entity.stats[key]=Math.max(0,n(v,entity.stats[key]||0));});

        entity.abilityBase={...(entity.abilityBase||{})};
        PRIMARY.forEach(key=>{
          const v=value(`ability_${key}`);
          if(v!==null)entity.abilityBase[key]=Math.max(0,n(v,entity.abilityBase[key]||0));
        });

        entity.baseStats={...(entity.baseStats||{})};
        const baseMap={
          hpBase:['v113p_hpBase',1],movement:['v113p_movement',6],vision:['v113p_vision',6],
          armorClass:['v113p_armorClass',0],defense:['v113p_defense',0],initiative:['v113p_initiative',0],
          inventorySlots:['v113p_inventorySlots',12],carryBase:['v113p_carryBase',12],implantSlots:['v113p_implantSlots',0]
        };
        Object.entries(baseMap).forEach(([key,[name,fallback]])=>{
          const v=value(name); if(v!==null)entity.baseStats[key]=key.includes('Slots')?Math.max(0,i(v,fallback)):n(v,fallback);
        });
        entity.inventoryBaseSlots=Math.max(0,i(entity.baseStats.inventorySlots,entity.inventoryBaseSlots||12));
        entity.carryBase=Math.max(0,n(entity.baseStats.carryBase,entity.carryBase||12));
        entity.baseImplantSlots=Math.max(0,i(entity.baseStats.implantSlots,entity.baseImplantSlots||0));
        const formModifiers=modifiersFromForm(form);
        if(Array.isArray(formModifiers))entity.modifiers=formModifiers;
        entity=parseInventoryState(form,entity);

        try{return normalizePlayerProfileV2(entity);}catch(error){
          console.error('WC_PLAYER_NORMALIZE_FAILED_V115',error);
          return entity;
        }
      };
    }
  }

  document.addEventListener('DOMContentLoaded',repairPlayerEditorLayout,{once:true});
})();
