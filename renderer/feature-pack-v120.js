/* GRPGI v1.0.132 — stable profiles, configurable equipment and World Config JSON transfer */
(function(){
  'use strict';
  if(window.__GRPGFeaturePackV120)return;
  window.__GRPGFeaturePackV120=true;

  const copy=value=>{try{return typeof deep==='function'?deep(value):structuredClone(value);}catch{try{return JSON.parse(JSON.stringify(value));}catch{return value;}}};
  const text=value=>String(value??'').trim();
  const plain=value=>text(value).replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
  const safe=value=>typeof esc==='function'?esc(value):String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const list=value=>Array.isArray(value)?value:[];
  const unique=value=>Array.from(new Set(list(value).map(entry=>String(entry?.id||entry||'').trim()).filter(Boolean)));
  const activation=value=>['active','passive','reaction'].includes(String(value||'').toLowerCase())?String(value).toLowerCase():'passive';
  const skillVisibility126=raw=>{
    const source=raw?.visibility&&typeof raw.visibility==='object'?raw.visibility:{};
    return {...copy(source),playerIds:unique(source.playerIds),campaignIds:unique(source.campaignIds||source.campaigns),eraIds:unique(source.eraIds||source.eras||source.epochs)};
  };

  /* Ammunition compatibility is family based. ammoTypeId remains a preferred
     initial load and a backwards-compatible exact match. */
  const normalizeEquipmentBefore120=normalizeEquipmentItemV2;
  normalizeEquipmentItemV2=function(raw={}){
    const source={...(raw||{})},next=normalizeEquipmentBefore120(source);
    next.ammoFamily=text(source.ammoFamily??source.caliber??source.ammunitionFamily??next.ammoFamily);
    next.showNameToPlayers=source.showNameToPlayers!==false;
    const hasStackSetting=Object.prototype.hasOwnProperty.call(source,'stackable');
    next.stackable=hasStackSetting?(source.stackable===true||String(source.stackable||'').toLowerCase()==='true'):String(next.type||'').toLowerCase()==='ammo';
    next.stackLimit=next.stackable?Math.max(2,Math.trunc(Number(source.stackLimit??next.stackLimit??99)||99)):1;
    if(['weapon','turret','drone'].includes(String(next.type||'').toLowerCase()))next.rapidFireShots=Math.max(1,Math.trunc(Number(source.rapidFireShots??source.burstShots??next.rapidFireShots??1)||1));
    next.activeUse=source.activeUse===true||String(source.activeUse||'').toLowerCase()==='true';
    next.activeUseLabel=text(source.activeUseLabel||next.activeUseLabel).slice(0,120);
    next.freeDroneControl=String(next.type||'').toLowerCase()==='implant'&&(source.freeDroneControl===true||String(source.freeDroneControl||'').toLowerCase()==='true');
    if(['turret','drone'].includes(String(next.type||'').toLowerCase())){
      next.damage=text(source.damage??next.damage);
      next.hitBonus=Number(source.hitBonus??source.attackBonus??next.hitBonus??0)||0;
      next.range=Math.max(0,Number(source.range??source.attackRange??next.range??0)||0);
      next.unitHp=Math.max(1,Number(source.unitHp??source.hpMax??next.unitHp??10)||10);
      next.unitArmorClass=Math.max(0,Number(source.unitArmorClass??source.armorClass??next.unitArmorClass??10)||0);
      next.unitInitiative=Number(source.unitInitiative??source.initiative??next.unitInitiative??0)||0;
      next.unitVisionRange=Math.max(0,Number(source.unitVisionRange??source.visionRange??next.unitVisionRange??0)||0);
      next.unitMoveRange=Math.max(0,Number(source.unitMoveRange??source.moveRange??next.unitMoveRange??0)||0);
    }
    return next;
  };

  function ammoFamilyField120(item,weapon=false){
    return `<div class="field ammo-family-field-v120"><label>Калибр / семейство патронов</label><input class="input" name="ammoFamily" value="${safe(item?.ammoFamily||'')}" placeholder="Например: 12.7x55"/><div class="small-note">${weapon?'Оружие принимает любой тип патронов с таким же значением. Выбранный тип патронов остаётся предпочтительным для первой зарядки.':'Все патроны одного семейства взаимозаменяемы для совместимого оружия; их собственные модификаторы применяются к выстрелу.'}</div></div>`;
  }
  function publicUnitNameField128(entity={}){return `<label class="consent-line public-unit-name-v128"><input type="checkbox" name="showNameToPlayersV128" ${entity.showNameToPlayers!==false?'checked':''}/><span><b>Показывать имя юнита игрокам</b><small>Если выключено, на втором экране остаётся только изображение или нейтральный маркер. Имя также скрывается из инициативы.</small></span></label>`;}
  function activeEquipmentFields129(item={}){return `<section class="active-equipment-v129"><div class="section-title">Активное использование</div><label class="consent-line"><input type="checkbox" name="activeUseV129" ${item.activeUse?'checked':''}/><span><b>Добавить действие в боевую сцену</b><small>При нажатии выполняются OnAbilityPhaseStart и OnAbilityExecuted из Lua-кода предмета.</small></span></label><div class="field"><label>Название действия</label><input class="input" name="activeUseLabelV129" value="${safe(item.activeUseLabel||'')}" placeholder="Использовать предмет"/></div></section>`;}
  function unitRapidFireField129(item={}){return `<div class="field unit-rapid-fire-v129"><label>Скорострельность (выстрелов за действие)</label><input class="input" type="number" min="1" step="1" name="rapidFireShotsV129" value="${Math.max(1,Math.trunc(Number(item.rapidFireShots||1)))}"/><div class="small-note">Каждый выстрел выбирает свою цель и получает штраф 0, −1, −2…</div></div>`;}
  function freeDroneControlField129(item={}){return `<label class="consent-line free-drone-control-v129"><input type="checkbox" name="freeDroneControlV129" ${item.freeDroneControl?'checked':''}/><span><b>Управление дроном не тратит действие</b><small>Одна команда дрону за ход оператора становится бесплатной.</small></span></label>`;}
  const renderEquipmentBefore120=Configurator.renderEquipmentEditor.bind(Configurator);
  Configurator.renderEquipmentEditor=function(raw){
    const item=normalizeEquipmentItemV2(raw||{}),markup=renderEquipmentBefore120(item);
    try{
      const template=document.createElement('template');template.innerHTML=markup;
      const form=template.content.querySelector('#config-editor-form')||template.content.querySelector('form');
      const weapon=form?.querySelector('[data-v118-for-item="weapon"]');
      const ammo=form?.querySelector('[data-v118-for-item="ammo"]');
      if(weapon&&!weapon.querySelector('[name="ammoFamily"]'))(weapon.querySelector('.cols3')||weapon).insertAdjacentHTML('beforeend',ammoFamilyField120(item,true));
      if(ammo&&!ammo.querySelector('[name="ammoFamily"]'))ammo.insertAdjacentHTML('beforeend',ammoFamilyField120(item,false));
      const stackToggle=form?.querySelector('[name="stackableV113"]'),stackLimit=form?.querySelector('[name="stackLimitV113"]');
      if(stackToggle){
        stackToggle.checked=item.stackable===true;stackToggle.disabled=false;
        const label=stackToggle.closest('label');if(label){delete label.dataset.stackPolicyV120;const title=label.querySelector('b');const note=label.querySelector('small');if(title)title.textContent='Можно складывать в стопку';if(note)note.textContent='Количество в одной стопке задаётся соседним полем.';}
      }
      if(stackLimit){stackLimit.disabled=!item.stackable;stackLimit.min='2';stackLimit.removeAttribute('max');stackLimit.value=String(Math.max(2,Number(item.stackLimit||99)));}
      for(const unitType of ['turret','drone']){
        const block=form?.querySelector(`[data-for-item="${unitType}"]`);
        if(block&&!block.querySelector('[name="rapidFireShotsV129"]'))block.insertAdjacentHTML('beforeend',unitRapidFireField129(item));
        if(block&&!block.querySelector('[name="showNameToPlayersV128"]'))block.insertAdjacentHTML('beforeend',publicUnitNameField128(item));
      }
      const ammoCost=form?.querySelector('[name="ammoPerShot"]')?.closest('.field')?.querySelector('label');if(ammoCost)ammoCost.textContent='Расход боеприпасов за один выстрел';
      const implant=form?.querySelector('[data-for-item="implant"]');if(implant&&!implant.querySelector('[name="freeDroneControlV129"]'))implant.insertAdjacentHTML('beforeend',freeDroneControlField129(item));
      const lua=form?.querySelector('[data-lua-editor-v119]');if(lua&&!form.querySelector('[name="activeUseV129"]'))lua.insertAdjacentHTML('beforebegin',activeEquipmentFields129(item));
      return template.innerHTML;
    }catch(error){console.error('FEATURE_PACK_V120_AMMO_EDITOR',error);return markup;}
  };

  function injectPublicUnitName128(markup,entity,saveLabel){
    if(String(markup).includes('name="showNameToPlayersV128"'))return markup;
    const button=`<button class="primary" type="submit">${saveLabel}</button>`;
    return String(markup).includes(button)?String(markup).replace(button,publicUnitNameField128(entity)+button):markup;
  }
  const renderPlayerNameBefore128=Configurator.renderPlayerEditor?.bind(Configurator);
  if(renderPlayerNameBefore128)Configurator.renderPlayerEditor=function(raw){const entity=normalizePlayerProfileV2(raw||{});return injectPublicUnitName128(renderPlayerNameBefore128(entity),entity,'SAVE_PLAYER');};
  const renderNpcNameBefore128=Configurator.renderNpcEditorV60?.bind(Configurator);
  if(renderNpcNameBefore128)Configurator.renderNpcEditorV60=function(raw){const entity={...(raw||{}),showNameToPlayers:raw?.showNameToPlayers!==false};return injectPublicUnitName128(renderNpcNameBefore128(entity),entity,'SAVE_NPC');};

  /* Retire the old skill/specialization split. A skill is now represented only
     by presence in player.skills; old positive specialization values migrate to
     learned skill IDs and are retained in a legacy backup for reversibility. */
  const skillModel=window.GRPGSkillModelV50;
  const normalizeSkillBefore120=skillModel.normalize;
  const normalizeSkillV50=raw=>skillModel.normalize(raw);
  skillModel.normalize=function(raw={}){
    const source={...(raw||{})},oldType=String(source.skillType||source.type||'skill').toLowerCase();
    const next=normalizeSkillBefore120({...source,skillType:'skill',type:'skill'});
    next.skillType='skill';next.type='skill';next.activationType=activation(source.activationType||next.activationType);
    // Legacy skill normalizers kept only playerIds. Reapply the complete access
    // scope after every normalization, including save, reload and world export.
    next.visibility=skillVisibility126(source);
    next.specializationIncreases=[];
    if(oldType==='specialization')next.legacySkillTypeV120='specialization';
    if(Array.isArray(source.modifiers))next.modifiers=copy(source.modifiers);
    ['luaScript','luaEnabled','luaTriggerMode','luaReactionLabel','abilityBehavior','castRange','areaRadius','thinkerDuration','thinkerInterval','targetRelation','targetPlayers','targetNpcs','targetUnits','targetAlive','includeSelf','thinkerVisibleToPlayers','thinkerColor'].forEach(key=>{if(source[key]!==undefined)next[key]=copy(source[key]);});
    return next;
  };
  // Every consumer of the former predicate now sees one binary skill model.
  skillModel.isSpecialization=function(){return false;};

  const normalizePlayerBefore120=normalizePlayerProfileV2;
  normalizePlayerProfileV2=function(raw={}){
    const source={...(raw||{})},next=normalizePlayerBefore120(source),legacy=source.specializations&&typeof source.specializations==='object'?source.specializations:{};
    const migrated=Object.entries(legacy).filter(([,value])=>Number(value||0)>0).map(([id])=>id);
    next.skills=unique([...(next.skills||[]),...migrated]);
    next.showNameToPlayers=source.showNameToPlayers!==false;
    if(migrated.length)next.legacySpecializationsV120={...(source.legacySpecializationsV120||{}),...copy(legacy)};
    next.specializations={};
    return next;
  };

  function normalizeRuntimeData120(){
    try{
      Object.entries(EQUIPMENT||{}).forEach(([id,item])=>{EQUIPMENT[id]=normalizeEquipmentItemV2(item);});
      Object.entries(skillModel.records||{}).forEach(([id,skill])=>{skillModel.records[id]=normalizeSkillV50(skill);});
      skillModel.sync();
      Object.entries(PLAYER_TEMPLATES||{}).forEach(([id,player])=>{PLAYER_TEMPLATES[id]=normalizePlayerProfileV2(player);});
      Object.entries(App.state?.users||{}).forEach(([id,player])=>{App.state.users[id]=normalizePlayerProfileV2(player);});
    }catch(error){console.warn('FEATURE_PACK_V120_RUNTIME_NORMALIZE',error);}
  }
  normalizeRuntimeData120();

  function cleanSkillEditor120(markup){
    try{
      const template=document.createElement('template');template.innerHTML=markup;
      const form=template.content.querySelector('#config-editor-form[data-entity-type="skills"]');if(!form)return markup;
      form.querySelector('[name="skillType"]')?.closest('.field')?.remove();
      const specField=form.querySelector('[name="specializationIncreaseIds"]')?.closest('.field');specField?.remove();
      form.querySelectorAll('.field>label').forEach(label=>{if(/навыки и специализации/i.test(label.textContent||''))label.textContent='Условие: изученные навыки';});
      const headerNote=form.querySelector('.config-editor-subtitle,.small-note');
      if(headerNote&&/специализац/i.test(headerNote.textContent||''))headerNote.textContent='Навык изучается один раз и затем считается прокачанным.';
      return template.innerHTML;
    }catch(error){console.error('FEATURE_PACK_V120_SKILL_EDITOR',error);return markup;}
  }
  const renderSkillBefore120=Configurator.renderSkillEditor?.bind(Configurator);
  if(renderSkillBefore120)Configurator.renderSkillEditor=function(raw){return cleanSkillEditor120(renderSkillBefore120(normalizeSkillV50(raw||{})));};

  function removeSpecializationControls120(root){
    if(!root?.querySelectorAll)return;
    root.querySelectorAll('[data-skill-add-v63="specialization"],.profile-specializations-wrap-v55,.profile-specialization-node-value-v56,.profile-specialization-node-kicker-v56').forEach(node=>node.remove());
    root.querySelectorAll('[name="skillType"],[name="specializationIncreaseIds"],[name^="specialization_"]').forEach(input=>input.closest('.field')?.remove());
    root.querySelectorAll('.section-title,.profile-specializations-title-v55').forEach(title=>{
      if(!/^Специализации$/i.test(String(title.textContent||'').trim()))return;
      const next=title.nextElementSibling;
      if(next&&(/specialization|spec-grid/i.test(next.className)||next.querySelector?.('[name^="specialization_"]')))next.remove();
      title.remove();
    });
  }
  function cleanPlayerEditor120(root){
    const form=root?.matches?.('#config-editor-form')?root:root?.querySelector?.('#config-editor-form[data-entity-type="players"]');if(!form)return;
    removeSpecializationControls120(form);
  }

  const collectBefore120=Configurator.collectEntity.bind(Configurator);
  Configurator.collectEntity=function(type,form,fd=new FormData(form)){
    if(type==='equipment'){
      const itemType=String(fd.get('type')||'').trim().toLowerCase(),activeBlock=form?.querySelector?.(`[data-for-item="${itemType}"]`),activeDamage=activeBlock?.querySelector?.('[name="damage"]');
      // Several historical item panels contain an input called "damage". FormData.get
      // returned the first hidden panel, so grenade damage appeared not to save.
      if(activeDamage)fd.set('damage',activeDamage.value);
      // Hidden weapon/ammunition panels both contain ammoFamily. Read the
      // selected category explicitly instead of the first FormData entry.
      const ammoBlock=form?.querySelector?.(`[data-v118-for-item="${itemType}"]`);
      const family=ammoBlock?.querySelector?.('[name="ammoFamily"]');
      if(family)fd.set('ammoFamily',family.value);
      for(const name of ['range','hitBonus','unitHp','unitArmorClass','unitInitiative','unitVisionRange','unitMoveRange']){const input=activeBlock?.querySelector?.(`[name="${name}"]`);if(input)fd.set(name,input.value);}
    }
    let entity=collectBefore120(type,form,fd);if(!entity)return entity;
    if(type==='equipment'){
      const itemType=String(fd.get('type')||entity.type||'').trim().toLowerCase(),activeBlock=form?.querySelector?.(`[data-for-item="${itemType}"]`),nameToggle=activeBlock?.querySelector?.('[name="showNameToPlayersV128"]');
      entity.ammoFamily=text(fd.get('ammoFamily')??entity.ammoFamily);
      entity.showNameToPlayers=['turret','drone'].includes(itemType)?nameToggle?.checked!==false:true;
      entity.stackable=fd.get('stackableV113')==='on';
      entity.stackLimit=entity.stackable?Math.max(2,Math.trunc(Number(fd.get('stackLimitV113')||99))):1;
      entity.activeUse=fd.get('activeUseV129')==='on';
      entity.activeUseLabel=text(fd.get('activeUseLabelV129')).slice(0,120);
      entity.freeDroneControl=itemType==='implant'&&fd.get('freeDroneControlV129')==='on';
      if(['turret','drone'].includes(itemType)){
        entity.damage=text(fd.get('damage'));
        entity.range=Math.max(0,Number(fd.get('range')||0));
        entity.hitBonus=Number(fd.get('hitBonus')||0);
        entity.unitHp=Math.max(1,Number(fd.get('unitHp')||10));
        entity.unitArmorClass=Math.max(0,Number(fd.get('unitArmorClass')??10));
        entity.unitInitiative=Number(fd.get('unitInitiative')||0);
        entity.unitVisionRange=Math.max(0,Number(fd.get('unitVisionRange')||0));
        entity.unitMoveRange=Math.max(0,Number(fd.get('unitMoveRange')||0));
        entity.rapidFireShots=Math.max(1,Math.trunc(Number(activeBlock?.querySelector?.('[name="rapidFireShotsV129"]')?.value||1)));
      }
      entity=normalizeEquipmentItemV2(entity);
    }
    if(type==='skills'){entity=normalizeSkillV50({...entity,skillType:'skill',type:'skill',specializationIncreases:[],activationType:fd.get('activationType')||entity.activationType});}
    if(type==='players'){entity.showNameToPlayers=fd.get('showNameToPlayersV128')==='on';entity=normalizePlayerProfileV2(entity);}
    if(type==='npcs'){
      entity.showNameToPlayers=fd.get('showNameToPlayersV128')==='on';
      const legacy=entity.specializations&&typeof entity.specializations==='object'?entity.specializations:{};
      const migrated=Object.entries(legacy).filter(([,value])=>Number(value||0)>0).map(([id])=>id);
      entity.skills=unique([...(entity.skills||[]),...migrated]);
      if(migrated.length)entity.legacySpecializationsV120={...(entity.legacySpecializationsV120||{}),...copy(legacy)};
      entity.specializations={};
    }
    return entity;
  };

  const insertBefore120=Configurator.insertEntity.bind(Configurator);
  Configurator.insertEntity=function(type,entity){return insertBefore120(type,type==='skills'?normalizeSkillV50(entity):type==='equipment'?normalizeEquipmentItemV2(entity):type==='players'?normalizePlayerProfileV2(entity):entity);};
  const applyWorldBefore120=applyWorldData;
  applyWorldData=function(payload={}){const result=applyWorldBefore120(payload);normalizeRuntimeData120();return result;};
  const buildWorldBefore120=buildWorldSnapshot;
  buildWorldSnapshot=function(){const snap=buildWorldBefore120();if(snap?.equipment?.EQUIPMENT)Object.entries(snap.equipment.EQUIPMENT).forEach(([id,row])=>{snap.equipment.EQUIPMENT[id]=normalizeEquipmentItemV2(row);});if(snap?.skills?.SKILLS)Object.entries(snap.skills.SKILLS).forEach(([id,row])=>{snap.skills.SKILLS[id]=normalizeSkillV50(row);});if(snap?.players?.PLAYER_TEMPLATES)Object.entries(snap.players.PLAYER_TEMPLATES).forEach(([id,row])=>{snap.players.PLAYER_TEMPLATES[id]=normalizePlayerProfileV2(row);});return snap;};

  function itemById120(id){try{return normalizeEquipmentItemV2(EQUIPMENT?.[id]||Data?.getItem?.(id)||null);}catch{return null;}}
  function refreshItemCards120(root=document){
    const selector='[data-item-id].inventory-slot-item-v1067,[data-item-id].inventory-tile-v1067,.wc-inventory-slot-item-v1068[data-item-id],.wc-inventory-tile-v1068[data-item-id]';
    const nodes=[...(root?.matches?.(selector)?[root]:[]),...Array.from(root?.querySelectorAll?.(selector)||[])],user=App.currentUser?normalizePlayerProfileV2(App.currentUser):null,api=window.GRPGFeaturePackV118;
    nodes.forEach(node=>{
      const item=itemById120(node.dataset.itemId||node.dataset.id);if(!item||!api?.itemInfoMarkup)return;
      const compact=node.classList.contains('inventory-tile-v1067')||node.classList.contains('wc-inventory-tile-v1068');
      const infoMarkup=api.itemInfoMarkup(item,user,compact);
      const description=plain(item.desc||item.description||item.summary);
      const mechanics=[item.weaponSkillId?`Оружейный навык: ${item.weaponSkillId}${Number(item.weaponSkillBonus||0)?` (${Number(item.weaponSkillBonus)>0?'+':''}${Number(item.weaponSkillBonus)} к попаданию)`:''}`:'',item.armorWeightClass==='heavy'?'Тяжёлая броня: без Ловкости к активной защите':'',Number(item.shieldCoverBonus||0)>0?`Физический щит: +${Number(item.shieldCoverBonus)}; не складывается с укрытием`:'',item.shieldDexterityCap!=null?`Предел Ловкости от щита: ${Number(item.shieldDexterityCap)}`:''];
      const title=[item.name,description,...mechanics,...list(item.modifiers).filter(mod=>!(String(mod.op||'add')==='add'&&Number(mod.value||0)===0&&!mod.statRef)).map(api.modifierText)].filter(Boolean).join('\n');
      const signature=JSON.stringify([String(item.id||''),compact,infoMarkup,description,title]);
      const expectedDescription=!compact;
      const hasInfo=Boolean(node.querySelector(':scope > .item-card-info-v118'));
      const hasDescription=Boolean(node.querySelector(':scope > .item-card-description-v120'));
      if(node.dataset.itemCardSignatureV123===signature&&hasInfo&&hasDescription===expectedDescription){node.title=title;return;}
      node.querySelectorAll(':scope > small,:scope > .item-card-info-v118,:scope > .item-card-description-v120').forEach(child=>child.remove());
      node.dataset.enhancedV118='1';node.classList.add('item-card-v118','item-card-v120');
      node.insertAdjacentHTML('beforeend',infoMarkup);
      if(!compact)node.insertAdjacentHTML('beforeend',`<div class="item-card-description-v120"${description?'':' aria-hidden="true"'}>${safe(description)}</div>`);
      node.title=title;
      node.dataset.itemCardSignatureV123=signature;
    });
  }

  function profileRenderSignature123(){
    const user=App.currentUser?normalizePlayerProfileV2(App.currentUser):null;if(!user)return'';
    const itemIds=unique([...(user.inventory||[]).map(row=>row?.itemId),...Object.values(user.equipmentSlots||{}),...(user.implantSlots||[]),...(user.installedImplantIds||[])]);
    const skillIds=unique([...(user.skills||[]),...Object.keys(user.skillLevels||{}),...Object.keys(user.specializations||{})]);
    const npcIds=unique(user.social?.npcIds||[]);
    const originIds=unique([user.socialOriginId,user.geographicOriginId]);
    const items=itemIds.map(id=>itemById120(id)).filter(Boolean);
    const skills=skillIds.map(id=>{try{return Data?.getSkill?.(id)||null;}catch{return null;}}).filter(Boolean);
    const npcs=npcIds.map(id=>{try{return Data?.getNpc?.(id)||null;}catch{return null;}}).filter(Boolean);
    const origins=originIds.map(id=>{try{return Data?.getSocialOrigin?.(id)||Data?.getGeographicOrigin?.(id)||null;}catch{return null;}}).filter(Boolean);
    return JSON.stringify({user,items,skills,npcs,origins,factions:Data.factions,theme:document.documentElement?.dataset?.eraTheme||''});
  }

  function cleanProfile120(){
    const root=document.getElementById('profile-content');if(!root)return;
    // Keep the detailed "Боевые показатели" block; remove only the old duplicate plaque.
    root.querySelectorAll('[data-armor-class-v1052]').forEach(node=>node.remove());
    root.querySelectorAll('.profile-specialization-node-v56').forEach(node=>node.classList.remove('profile-specialization-node-v56'));
    removeSpecializationControls120(root);
    refreshItemCards120(root);
  }
  const renderConfigBefore120=Configurator.render.bind(Configurator);
  Configurator.render=function(){const result=renderConfigBefore120(),root=document.getElementById('config-content');if(this.selectedType==='players')cleanPlayerEditor120(root);removeSpecializationControls120(root);refreshItemCards120(root||document);return result;};
  const renderProfileBefore120=UI.renderProfile.bind(UI);
  UI.renderProfile=function(...args){
    const root=document.getElementById('profile-content'),signature=profileRenderSignature123();
    if(root&&signature&&root.dataset.profileRenderSignatureV123===signature&&root.childElementCount){
      window.GRPGDevOpsV64?.ensurePanel?.();refreshItemCards120(root);return root;
    }
    const result=renderProfileBefore120(...args);cleanProfile120();
    const nextRoot=document.getElementById('profile-content');if(nextRoot&&signature)nextRoot.dataset.profileRenderSignatureV123=signature;
    return result;
  };

  if(typeof UiSyncGuard!=='undefined'&&UiSyncGuard?.shouldDeferRerender){
    const deferBefore120=UiSyncGuard.shouldDeferRerender.bind(UiSyncGuard);
    UiSyncGuard.shouldDeferRerender=function(){return Boolean(window.GRPGInventoryPendingV120?.has?.(App.currentUserId))||deferBefore120();};
  }

  const pendingRoots120=new Set();let observerQueued120=false;
  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations)for(const node of mutation.addedNodes||[])if(node?.nodeType===1)pendingRoots120.add(node);
    if(observerQueued120||!pendingRoots120.size)return;observerQueued120=true;
    queueMicrotask(()=>{observerQueued120=false;const roots=[...pendingRoots120];pendingRoots120.clear();for(const node of roots){removeSpecializationControls120(node);refreshItemCards120(node);}});
  });
  const observed=document.getElementById('app')||document.body;if(observed)observer.observe(observed,{childList:true,subtree:true});
  if(typeof document!=='undefined'&&typeof document.addEventListener==='function')document.addEventListener('change',event=>{const toggle=event.target?.closest?.('[name="stackableV113"]');if(!toggle)return;const limit=toggle.closest('form')?.querySelector?.('[name="stackLimitV113"]');if(limit){limit.disabled=!toggle.checked;if(toggle.checked&&Number(limit.value)<2)limit.value='99';}},true);

  window.GRPGFeaturePackV120=Object.freeze({version:'1.0.134',normalizeSkill:normalizeSkillV50,normalizeEquipment:normalizeEquipmentItemV2,refreshItemCards:refreshItemCards120,profileRenderSignature:profileRenderSignature123});
})();

/* GRPGI v1.0.131 compatibility — archive facts and free-form weightless items */
(function(){
  'use strict';
  if(window.__GRPGFeaturePackV131)return;
  window.__GRPGFeaturePackV131=true;
  const safe=value=>typeof esc==='function'?esc(value):String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const copy=value=>{try{return typeof deep==='function'?deep(value):structuredClone(value);}catch{return JSON.parse(JSON.stringify(value));}};

  function normalizeTextInventoryItemsV131(raw={}){
    const source=raw.textInventoryItems??raw.weightlessItems??raw.inventoryTextItems??raw.looseItems??[];
    const rows=Array.isArray(source)?source:[];
    return rows.map(row=>typeof row==='string'?{name:row,qty:1}:row).filter(row=>row&&typeof row==='object').map(row=>({name:String(row.name??row.title??row.label??'').trim().slice(0,4000),qty:Math.max(1,Math.trunc(Number(row.qty??row.quantity??1)||1))})).filter(row=>row.name);
  }

  const normalizeEquipmentBefore131=normalizeEquipmentItemV2;
  normalizeEquipmentItemV2=function(raw={}){
    const source=raw||{},hasLegacyDimensions=['mass','inventoryWidth','inventoryHeight'].every(key=>Object.prototype.hasOwnProperty.call(source,key)),legacyTextOnly=source.textOnlyInventory===true||(hasLegacyDimensions&&Number(source.mass)===0&&Number(source.inventoryWidth)===0&&Number(source.inventoryHeight)===0);
    const item=normalizeEquipmentBefore131(source);
    item.legacyTextOnlyInventoryV131=legacyTextOnly||item.legacyTextOnlyInventoryV131===true;
    item.textOnlyInventory=false;
    item.inventoryWidth=Math.max(1,Math.trunc(Number(item.inventoryWidth||1)));
    item.inventoryHeight=Math.max(1,Math.trunc(Number(item.inventoryHeight||1)));
    return item;
  };
  const normalizePlayerBefore131=normalizePlayerProfileV2;
  normalizePlayerProfileV2=function(raw={}){
    const player=normalizePlayerBefore131(raw||{});
    const textItems=normalizeTextInventoryItemsV131(raw),kept=[];
    for(const entry of player.inventory||[]){
      const item=EQUIPMENT?.[entry.itemId]||Data?.getItem?.(entry.itemId);
      if(item?.legacyTextOnlyInventoryV131===true){textItems.push({name:String(item.name||entry.itemId),qty:Math.max(1,Math.trunc(Number(entry.qty||1)))});}
      else kept.push(entry);
    }
    player.inventory=kept;
    player.textInventoryItems=textItems;
    return player;
  };
  try{
    Object.entries(EQUIPMENT||{}).forEach(([id,item])=>{EQUIPMENT[id]=normalizeEquipmentItemV2(item);});
    Object.entries(PLAYER_TEMPLATES||{}).forEach(([id,player])=>{PLAYER_TEMPLATES[id]=normalizePlayerProfileV2(player);});
    Object.entries(App.state?.users||{}).forEach(([id,player])=>{App.state.users[id]=normalizePlayerProfileV2(player);});
  }catch(error){console.warn('FEATURE_PACK_V131_MIGRATION',error);}

  function textItemRowV131(row={name:'',qty:1}){
    return `<div class="text-inventory-row-v131" data-text-inventory-row-v131><textarea class="area" name="textInventoryNameV131" rows="2" placeholder="Название или HTML-ссылка">${safe(row.name||'')}</textarea><input class="input" type="number" min="1" step="1" name="textInventoryQtyV131" value="${Math.max(1,Math.trunc(Number(row.qty||1)))}" aria-label="Количество"/><button class="ghost" type="button" data-text-inventory-remove-v131>REMOVE</button></div>`;
  }
  function textInventoryEditorV131(player={}){
    const rows=normalizeTextInventoryItemsV131(player);
    return `<section class="text-inventory-editor-v131"><div class="section-title">Предметы без веса</div><div class="small-note">Свободный список внизу инвентаря. Название поддерживает HTML, включая ссылки на статьи; количество хранится отдельно.</div><div data-text-inventory-list-v131>${rows.map(textItemRowV131).join('')}</div><button class="secondary" type="button" data-text-inventory-add-v131>ДОБАВИТЬ СТРОКУ</button></section>`;
  }

  const renderPlayerBefore131=Configurator.renderPlayerEditor?.bind(Configurator);
  if(renderPlayerBefore131)Configurator.renderPlayerEditor=function(raw={}){
    const player=normalizePlayerProfileV2(raw),html=renderPlayerBefore131(player),save='<button class="primary" type="submit">SAVE_PLAYER</button>';
    return html.includes(save)?html.replace(save,`${textInventoryEditorV131(player)}${save}`):html;
  };
  const collectBefore131=Configurator.collectEntity?.bind(Configurator);
  if(collectBefore131)Configurator.collectEntity=function(type,form,fd=new FormData(form)){
    const entity=collectBefore131(type,form,fd);
    if(type!=='players'||!entity||!form?.querySelectorAll)return entity;
    entity.textInventoryItems=Array.from(form.querySelectorAll('[data-text-inventory-row-v131]')).map(row=>({name:String(row.querySelector('[name="textInventoryNameV131"]')?.value||'').trim().slice(0,4000),qty:Math.max(1,Math.trunc(Number(row.querySelector('[name="textInventoryQtyV131"]')?.value||1)||1))})).filter(row=>row.name);
    return normalizePlayerProfileV2(entity);
  };

  function richTextNameV131(value){
    const text=String(value||'').trim();
    if(!text)return'';
    if(typeof __renderRichText==='function')return __renderRichText(text,'');
    return safe(text);
  }
  function textInventoryProfileMarkupV131(player={}){
    const rows=normalizeTextInventoryItemsV131(player);
    if(!rows.length)return'';
    return `<section class="profile-text-inventory-v131"><div class="section-title">Предметы без веса</div><div class="profile-text-inventory-list-v131">${rows.map(row=>`<div class="profile-text-inventory-row-v131"><span>${richTextNameV131(row.name)}</span><b>×${row.qty}</b></div>`).join('')}</div></section>`;
  }
  function injectProfileTextItemsV131(){
    const root=document.getElementById('profile-content'),player=App.currentUser?normalizePlayerProfileV2(App.currentUser):null;
    if(!root||!player||root.querySelector('.profile-text-inventory-v131'))return;
    const card=root.querySelector('.inventory-profile-card-v1067');
    const markup=textInventoryProfileMarkupV131(player);
    if(card&&markup){card.insertAdjacentHTML('beforeend',markup);UI.attachEntityLinks?.(card);}
  }
  const renderProfileBefore131=UI?.renderProfile?.bind(UI);
  if(renderProfileBefore131)UI.renderProfile=function(...args){const result=renderProfileBefore131(...args);injectProfileTextItemsV131();return result;};

  function equipmentFactsV131(item={}){
    const type=String(item.type||'gear').toLowerCase(),facts=[];
    const add=(label,value,allowZero=false)=>{if(value==null||value===''||(!allowZero&&Number(value)===0&&!Number.isNaN(Number(value))))return;facts.push([label,value]);};
    if(['weapon','grenade','turret','drone'].includes(type))add('Урон',item.damage);
    if(['weapon','turret','drone'].includes(type))add('Попадание',`${Number(item.hitBonus||0)>=0?'+':''}${Number(item.hitBonus||0)}`,true);
    if(['weapon','turret','drone'].includes(type))add('Дальность',`${Number(item.range||0)} гекс.`,true);
    if(['weapon','turret','drone'].includes(type))add('Выстрелов за действие',Math.max(1,Math.trunc(Number(item.rapidFireShots||1))),true);
    if(type==='weapon'){add('Магазин',Math.max(0,Math.trunc(Number(item.magazineSize||0))),true);add('Патронов за выстрел',Math.max(1,Math.trunc(Number(item.ammoPerShot||1))),true);}
    if(type==='grenade'){add('Дальность броска',`${Number(item.grenadeRange||0)} гекс.`,true);add('Радиус',`${Number(item.grenadeRadius||0)} гекс.`,true);}
    if(['turret','drone'].includes(type)){add('HP',Number(item.unitHp||10),true);add('Класс брони',Number(item.unitArmorClass??10),true);}
    if(type==='drone')add('Движение',`${Number(item.unitMoveRange||0)} гекс.`,true);
    if(type==='armor'){add('Класс брони',Number(item.armorClass||0),true);add('Защита',Number(item.damageReduction||item.defense||0),true);}
    if(type==='implant')add('Энергия',Number(item.energyRequired??item.requiredEnergy??0),true);
    if(type==='ammo')add('Калибр',item.ammoFamily||item.caliber);
    return facts;
  }
  function equipmentFactsMarkupV131(item={}){
    if(window.GRPGItemFactsV141)return window.GRPGItemFactsV141.table(item);
    const facts=equipmentFactsV131(item);
    return facts.length?`<div class="archive-equipment-facts-v131">${facts.map(([label,value])=>`<div><span>${safe(label)}</span><b>${safe(value)}</b></div>`).join('')}</div>`:'';
  }
  const showEntityBefore131=typeof Wiki!=='undefined'?Wiki?.showEntity?.bind(Wiki):null;
  if(showEntityBefore131)Wiki.showEntity=function(type,id,...args){
    const result=showEntityBefore131(type,id,...args);
    if(type!=='item')return result;
    const target=document.getElementById('wiki-detail'),item=Data.getItem(id);
    if(target&&item&&!target.querySelector('.archive-equipment-facts-v131'))target.querySelector('.wiki-hero')?.insertAdjacentHTML('afterend',equipmentFactsMarkupV131(item));
    return result;
  };

  const renderConfigBefore131=Configurator.render.bind(Configurator);
  Configurator.render=function(){
    const result=renderConfigBefore131();
    if(this.selectedType==='players'){
      const form=document.getElementById('config-editor-form');
      form?.querySelectorAll('.section-title').forEach(title=>{if(title.textContent?.trim()!=='Документы и предметы без веса/размера')return;const next=title.nextElementSibling;title.remove();next?.remove();});
    }
    return result;
  };
  document.addEventListener?.('click',event=>{
    const add=event.target.closest?.('[data-text-inventory-add-v131]');
    if(add){add.previousElementSibling?.insertAdjacentHTML('beforeend',textItemRowV131());return;}
    const remove=event.target.closest?.('[data-text-inventory-remove-v131]');
    if(remove)remove.closest('[data-text-inventory-row-v131]')?.remove();
  });

  window.GRPGFeaturePackV131=Object.freeze({version:'1.0.131',equipmentFacts:equipmentFactsV131,normalizeTextInventoryItems:normalizeTextInventoryItemsV131});
})();
