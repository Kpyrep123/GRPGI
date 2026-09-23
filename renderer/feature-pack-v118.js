/* GRPGI v1.0.122 — canonical vision, ammunition, loot, skill actions and readable item cards */
(function(){
  'use strict';
  if(window.__GRPGFeaturePackV118)return;
  window.__GRPGFeaturePackV118=true;

  const VERSION='1.0.122';
  const copy=value=>{try{return typeof deep==='function'?deep(value):structuredClone(value);}catch{try{return JSON.parse(JSON.stringify(value));}catch{return value;}}};
  const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const integer=(value,fallback=0)=>Math.trunc(number(value,fallback));
  const text=value=>String(value??'').trim();
  const safe=value=>typeof esc==='function'?esc(value):String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const list=value=>Array.isArray(value)?value:[];
  const unique=value=>Array.from(new Set(list(value).map(entry=>text(entry)).filter(Boolean)));

  const TARGET_LABELS={
    strength:'Сила',dexterity:'Ловкость',endurance:'Выносливость',intelligence:'Интеллект',will:'Воля',glory:'Слава',
    max_hp:'Максимальное HP',armor_class:'Класс брони',defense:'Защита',initiative_bonus:'Инициатива',movement:'Движение',vision:'Обзор',
    inventory_slots:'Ячейки инвентаря',carry_capacity:'Переносимый вес',implant_slots:'Слоты имплантов',social_bonus:'Социальный бонус',
    attack_bonus:'Попадание',damage_bonus:'Урон',weapon_hit_stat:'Характеристика попадания',weapon_hit_extra_stat:'Дополнительная характеристика попадания'
  };
  const STAT_LABELS={strength:'Сила',dexterity:'Ловкость',endurance:'Выносливость',intelligence:'Интеллект',will:'Воля',glory:'Слава'};
  const CONDITION_LABELS={always:'без условия',in_combat:'в боевой сцене',has_skill:'при наличии навыка',item_equipped:'когда предмет экипирован',hp_below_percent:'при низком HP',incoming_weapon_category:'против категории оружия'};
  const SCOPE_LABELS={global:'всегда',weapon_category:'для категории оружия',weapon_id:'для конкретного оружия'};
  const ACTIVATION_TYPES=new Set(['active','passive','reaction']);

  function signed(value){const n=number(value,0);return `${n>=0?'+':''}${Number.isInteger(n)?n:n.toFixed(1)}`;}
  function normalizeActivationType(value,skillType='skill'){
    if(String(skillType||'').toLowerCase()==='specialization')return'passive';
    const raw=text(value).toLowerCase();
    return ACTIVATION_TYPES.has(raw)?raw:'passive';
  }
  function normalizeLootTable(value){
    return list(value).map(row=>({
      itemId:text(row?.itemId||row?.id),
      chance:Math.max(0,Math.min(100,number(row?.chance,100))),
      minQty:Math.max(1,integer(row?.minQty??row?.min,1)),
      maxQty:Math.max(1,integer(row?.maxQty??row?.max,row?.minQty??row?.min??1))
    })).map(row=>({...row,maxQty:Math.max(row.minQty,row.maxQty)})).filter(row=>row.itemId);
  }
  function normalizeMagazineMap(value){
    const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    return Object.fromEntries(Object.entries(source).map(([weaponId,entry])=>{
      const object=entry&&typeof entry==='object'?entry:{loaded:entry};
      return [text(weaponId),{loaded:Math.max(0,integer(object.loaded,0)),ammoTypeId:text(object.ammoTypeId),updatedAt:text(object.updatedAt)}];
    }).filter(([id])=>id));
  }

  /* Preserve the new subtype and firearm fields across every legacy item normalizer. */
  const normalizeEquipmentBefore118=normalizeEquipmentItemV2;
  normalizeEquipmentItemV2=function(raw={}){
    const source={...(raw||{})};
    const next=normalizeEquipmentBefore118(source);
    const rawType=text(source.type||next.type||'gear').toLowerCase();
    if(['ammo','ammunition','патроны','боеприпасы'].includes(rawType))next.type='ammo';
    next.ammoTypeId=text(source.ammoTypeId??source.ammunitionId??next.ammoTypeId);
    next.magazineSize=Math.max(0,integer(source.magazineSize??source.clipSize??next.magazineSize,0));
    next.ammoPerShot=Math.max(1,integer(source.ammoPerShot??source.roundsPerShot??next.ammoPerShot,1));
    if(next.type==='ammo'){
      next.stackable=true;
      next.stackLimit=Math.max(2,integer(source.stackLimit??next.stackLimit,999));
      next.textOnlyInventory=false;
      next.inventoryWidth=Math.max(1,integer(source.inventoryWidth??next.inventoryWidth,1));
      next.inventoryHeight=Math.max(1,integer(source.inventoryHeight??next.inventoryHeight,1));
      next.mass=Math.max(0,number(source.mass??next.mass,0.02));
    }
    return next;
  };

  if(typeof normalizePlayerProfileV2==='function'){
    const normalizePlayerBefore118=normalizePlayerProfileV2;
    normalizePlayerProfileV2=function(raw={}){
      const source={...(raw||{})};
      const next=normalizePlayerBefore118(source);
      next.weaponMagazines=normalizeMagazineMap(source.weaponMagazines||next.weaponMagazines);
      return next;
    };
  }

  try{
    Object.entries(EQUIPMENT||{}).forEach(([id,item])=>{EQUIPMENT[id]=normalizeEquipmentItemV2(item);});
    Object.entries(PLAYER_TEMPLATES||{}).forEach(([id,player])=>{PLAYER_TEMPLATES[id]=normalizePlayerProfileV2(player);});
    Object.entries(App.state?.users||{}).forEach(([id,player])=>{App.state.users[id]=normalizePlayerProfileV2(player);});
  }catch(error){console.warn('FEATURE_PACK_V118_INITIAL_NORMALIZE',error);}

  function itemById(id){
    if(!id)return null;
    try{return normalizeEquipmentItemV2(EQUIPMENT?.[id]||Data?.getItem?.(id)||{id,name:id,type:'gear'});}catch{return null;}
  }
  function modifierText(mod={}){
    const target=TARGET_LABELS[mod.target]||text(mod.target)||'Показатель';
    let effect='';
    if(mod.op==='set')effect=`установить ${number(mod.value,0)}`;
    else if(mod.op==='replace_stat')effect=`использовать «${STAT_LABELS[mod.statRef]||mod.statRef||'характеристику'}»`;
    else if(mod.op==='add_stat')effect=`добавить «${STAT_LABELS[mod.statRef]||mod.statRef||'характеристику'}»`;
    else effect=`${signed(mod.value)}`;
    const scope=mod.scope&&mod.scope!=='global'?`${SCOPE_LABELS[mod.scope]||mod.scope}${mod.scopeValue?` «${mod.scopeValue}»`:''}`:'';
    const condition=mod.condition&&mod.condition!=='always'?`${CONDITION_LABELS[mod.condition]||mod.condition}${mod.conditionValue?` «${mod.conditionValue}»`:''}`:'';
    return [target,effect,scope,condition].filter(Boolean).join(' · ');
  }
  function itemBadges(item,user=null){
    const rows=[];
    if(item?.type==='weapon'){
      let attack=null;
      try{attack=user?window.GRPGStatsV113?.weaponAttack?.(user,item,{kind:'player'}):null;}catch{}
      const damageBonus=number(attack?.damageBonus,0);
      rows.push(['Урон',`${attack?.damage||item.damage||'—'}${damageBonus?` ${signed(damageBonus)}`:''}`]);
      rows.push(['Попадание',signed(attack?.bonus??item.hitBonus??0)]);
      if(number(item.range,0)>0)rows.push(['Дальность',`${number(item.range)} гекс.`]);
      if(number(item.magazineSize,0)>0){
        const size=integer(item.magazineSize),stored=user?.weaponMagazines?.[item.id]?.loaded;
        rows.push(['Магазин',`${stored==null?size:Math.max(0,integer(stored))} / ${size}`]);
      }
      if(integer(item.rapidFireShots,1)>1)rows.push(['Скорострельность',`${integer(item.rapidFireShots,1)} выстрелов`]);
    }else if(item?.type==='armor'){
      const armorMod=list(item.modifiers).filter(mod=>mod?.target==='armor_class').reduce((sum,mod)=>sum+(mod.op==='add'?number(mod.value,0):0),0);
      const defenseMod=list(item.modifiers).filter(mod=>mod?.target==='defense').reduce((sum,mod)=>sum+(mod.op==='add'?number(mod.value,0):0),0);
      if(armorMod||item.armorClass)rows.push(['Класс брони',armorMod?signed(armorMod):number(item.armorClass)]);
      if(defenseMod||item.damageReduction)rows.push(['Защита',defenseMod?signed(defenseMod):number(item.damageReduction)]);
    }else if(item?.type==='implant'){
      rows.push(['Энергия',number(item.energyRequired??item.requiredEnergy,0)]);
    }else if(item?.type==='ammo'){
      rows.push(['Количество','стопка']);
    }else if(item?.type==='grenade'){
      rows.push(['Урон',item.damage||'—']);
      if(number(item.grenadeRadius,0)>0)rows.push(['Радиус',`${number(item.grenadeRadius)} гекс.`]);
    }
    if(number(item?.mass,0)>0)rows.push(['Масса',number(item.mass)]);
    return rows.slice(0,5);
  }
  function itemInfoMarkup(item,user=null,compact=false){
    const badges=itemBadges(item,user);
    const mods=list(item?.modifiers).filter(mod=>mod?.enabled!==false).map(modifierText).filter(Boolean);
    return `<div class="item-card-info-v118 ${compact?'compact':''}">${badges.length?`<div class="item-stat-strip-v118">${badges.map(([label,value])=>`<span><i>${safe(label)}</i><b>${safe(value)}</b></span>`).join('')}</div>`:''}${mods.length?`<div class="item-modifiers-v118" title="${safe(mods.join('\n'))}">${mods.slice(0,compact?1:3).map(row=>`<span>${safe(row)}</span>`).join('')}${mods.length>(compact?1:3)?`<em>+ ещё ${mods.length-(compact?1:3)}</em>`:''}</div>`:''}</div>`;
  }
  function enhanceItemCards(root=document){
    if(!root?.querySelectorAll)return;
    const user=App.currentUser?normalizePlayerProfileV2(App.currentUser):null;
    const selector='[data-item-id].inventory-slot-item-v1067,[data-item-id].inventory-tile-v1067,.wc-inventory-slot-item-v1068[data-item-id],.wc-inventory-tile-v1068[data-item-id]';
    const targets=[...(root.matches?.(selector)?[root]:[]),...Array.from(root.querySelectorAll?.(selector)||[])];
    targets.forEach(node=>{
      if(node.dataset.enhancedV118==='1')return;
      const item=itemById(node.dataset.itemId||node.dataset.id);
      if(!item)return;
      node.dataset.enhancedV118='1';
      node.classList.add('item-card-v118');
      node.querySelectorAll(':scope > small').forEach(summary=>summary.remove());
      node.insertAdjacentHTML('beforeend',itemInfoMarkup(item,user,node.classList.contains('inventory-tile-v1067')));
      const full=[item.name,...list(item.modifiers).map(modifierText)].filter(Boolean).join('\n');
      if(full)node.title=full;
    });
  }

  /* One source of truth for player vision: baseStats.vision plus Stats Engine modifiers. */
  const renderPlayerBefore118=Configurator.renderPlayerEditor.bind(Configurator);
  Configurator.renderPlayerEditor=function(raw){
    const html=renderPlayerBefore118(raw);
    try{
      const tpl=document.createElement('template');tpl.innerHTML=html;
      const form=tpl.content.querySelector('#config-editor-form[data-entity-type="players"]');
      form?.querySelector('[name="combatVisionRange"]')?.closest('.field')?.remove();
      const base=form?.querySelector('[name="v113p_vision"]');
      if(base){base.closest('.field')?.classList.add('canonical-vision-v118');base.title='Единственный базовый источник обзора. Итог учитывает экипировку, импланты, навыки и другие модификаторы.';}
      return tpl.innerHTML;
    }catch(error){console.error('PLAYER_VISION_RENDER_V118',error);return html;}
  };

  function ammoOptions(selected=''){
    return `<option value="">— оружие без патронов —</option>${Object.values(EQUIPMENT||{}).map(normalizeEquipmentItemV2).filter(item=>item.type==='ammo').sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'ru')).map(item=>`<option value="${safe(item.id)}" ${String(item.id)===String(selected)?'selected':''}>${safe(item.name||item.id)}</option>`).join('')}`;
  }
  const renderEquipmentBefore118=Configurator.renderEquipmentEditor.bind(Configurator);
  Configurator.renderEquipmentEditor=function(raw){
    const item=normalizeEquipmentItemV2(raw);
    let html=renderEquipmentBefore118(item);
    html=html.replace(/(<select class="select" name="type">)/,`$1<option value="ammo" ${item.type==='ammo'?'selected':''}>Патроны</option>`);
    const fields=`<section class="item-specific-v118 ${item.type==='weapon'?'':'hidden'}" data-v118-for-item="weapon"><div class="section-title">Боеприпасы и магазин</div><div class="cols3"><div class="field"><label>Тип патронов</label><select class="select" name="ammoTypeId">${ammoOptions(item.ammoTypeId)}</select></div><div class="field"><label>Ёмкость магазина</label><input class="input" type="number" min="0" step="1" name="magazineSize" value="${integer(item.magazineSize,0)}"/><div class="small-note">0 — оружие не использует магазин.</div></div><div class="field"><label>Патронов за выстрел</label><input class="input" type="number" min="1" step="1" name="ammoPerShot" value="${Math.max(1,integer(item.ammoPerShot,1))}"/></div></div></section><section class="item-specific-v118 ${item.type==='ammo'?'':'hidden'}" data-v118-for-item="ammo"><div class="section-title">Патроны</div><div class="small-note">Количество в инвентаре считается в отдельных патронах. Модификаторы этого типа патронов временно накладываются на оружие при каждом выстреле: например, дополнительный урон или попадание.</div></section>`;
    const anchor='<div class="field"><label>Теги';
    html=html.includes(anchor)?html.replace(anchor,fields+anchor):html.replace('<button class="primary" type="submit">SAVE_ITEM</button>',fields+'<button class="primary" type="submit">SAVE_ITEM</button>');
    return html;
  };

  function ensureAmmoTab(){
    if(Configurator.selectedType!=='equipment')return;
    const tabs=document.querySelector('.equipment-tabs-v1052');
    if(!tabs||tabs.querySelector('[data-equipment-category-v118="ammo"]'))return;
    tabs.insertAdjacentHTML('beforeend',`<button type="button" class="secondary ${Configurator.equipmentCategoryV1052==='ammo'?'active':''}" data-equipment-category-v118="ammo">Патроны</button>`);
  }

  function lootRowMarkup(row={}){
    const current=text(row.itemId);
    const items=Object.values(EQUIPMENT||{}).map(normalizeEquipmentItemV2).filter(item=>item.type!=='stock').sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'ru'));
    return `<div class="npc-loot-row-v118" data-npc-loot-row-v118><label><span>Предмет</span><select class="select" data-loot-item-v118><option value="">— выберите предмет —</option>${items.map(item=>`<option value="${safe(item.id)}" ${item.id===current?'selected':''}>${safe(item.name||item.id)}</option>`).join('')}</select></label><label><span>Шанс, %</span><input class="input" type="number" min="0" max="100" step="0.1" data-loot-chance-v118 value="${number(row.chance,100)}"/></label><label><span>Мин.</span><input class="input" type="number" min="1" step="1" data-loot-min-v118 value="${Math.max(1,integer(row.minQty,1))}"/></label><label><span>Макс.</span><input class="input" type="number" min="1" step="1" data-loot-max-v118 value="${Math.max(1,integer(row.maxQty,row.minQty||1))}"/></label><button class="ghost" type="button" data-remove-loot-v118 title="Удалить вариант">×</button></div>`;
  }
  function lootEditorMarkup(npc={}){
    const rows=normalizeLootTable(npc.lootTable);
    return `<section class="npc-loot-editor-v118" data-npc-loot-editor-v118><div class="section-title">Таблица возможного лута</div><div class="small-note">Каждая строка проверяется независимо при первом обыске NPC с 0 HP. Результат сохраняется в сцене и повторно не перебрасывается.</div><div class="npc-loot-list-v118">${rows.map(lootRowMarkup).join('')}</div><button class="secondary" type="button" data-add-loot-v118>+ ДОБАВИТЬ ПРЕДМЕТ</button></section>`;
  }
  if(Configurator.renderNpcEditorV60){
    const renderNpcBefore118=Configurator.renderNpcEditorV60.bind(Configurator);
    Configurator.renderNpcEditorV60=function(raw){
      const html=renderNpcBefore118(raw);
      return html.replace('<button class="primary" type="submit">SAVE_NPC</button>',`${lootEditorMarkup(raw)}<button class="primary" type="submit">SAVE_NPC</button>`);
    };
  }

  const renderSkillBefore118=Configurator.renderSkillEditor?.bind(Configurator);
  if(renderSkillBefore118)Configurator.renderSkillEditor=function(raw){
    const skillType=text(raw?.skillType||raw?.type||'skill');
    const activation=normalizeActivationType(raw?.activationType,skillType);
    const html=renderSkillBefore118(raw);
    const field=`<div class="field skill-activation-field-v118"><label>Применение в бою</label><select class="select" name="activationType"><option value="active" ${activation==='active'?'selected':''}>Активный</option><option value="passive" ${activation==='passive'?'selected':''}>Пассивный</option><option value="reaction" ${activation==='reaction'?'selected':''}>Реакция</option></select><div class="small-note">Активные навыки появляются среди действий персонажа. Пассивные модификаторы действуют постоянно. Реакции помечаются отдельно и не расходуются как обычное действие.</div></div>`;
    return html.replace('<div class="field"><label>Категория</label>',field+'<div class="field"><label>Категория</label>');
  };

  function readLootRows(form){
    return normalizeLootTable(Array.from(form?.querySelectorAll?.('[data-npc-loot-row-v118]')||[]).map(row=>({itemId:row.querySelector('[data-loot-item-v118]')?.value,chance:row.querySelector('[data-loot-chance-v118]')?.value,minQty:row.querySelector('[data-loot-min-v118]')?.value,maxQty:row.querySelector('[data-loot-max-v118]')?.value})));
  }

  const collectBefore118=Configurator.collectEntity.bind(Configurator);
  Configurator.collectEntity=function(type,form,fd=new FormData(form)){
    let entity=collectBefore118(type,form,fd);
    if(!entity)return entity;
    if(type==='players'){
      const rawVision=fd.get('v113p_vision');
      if(rawVision!==null){
        const vision=Math.max(0,number(rawVision,6));
        entity.baseStats={...(entity.baseStats||{}),vision};
        entity.baseVision=vision;
        entity=normalizePlayerProfileV2(entity);
        const derived=window.GRPGStatsV113?.computePlayer?.(entity);
        const effective=Math.max(0,number(derived?.values?.vision,entity.combat?.visionRange??vision));
        entity.combat={...(entity.combat||{}),visionRange:effective};
        entity.derivedStatsV113={...(entity.derivedStatsV113||{}),vision:effective};
      }
      entity.weaponMagazines=normalizeMagazineMap(entity.weaponMagazines);
    }
    if(type==='equipment'){
      const rawType=text(fd.get('type')||entity.type).toLowerCase();
      if(rawType==='ammo')entity.type='ammo';
      entity.ammoTypeId=text(fd.get('ammoTypeId')??entity.ammoTypeId);
      entity.magazineSize=Math.max(0,integer(fd.get('magazineSize'),entity.magazineSize||0));
      entity.ammoPerShot=Math.max(1,integer(fd.get('ammoPerShot'),entity.ammoPerShot||1));
      entity=normalizeEquipmentItemV2(entity);
    }
    if(type==='npcs')entity.lootTable=readLootRows(form);
    if(type==='skills')entity.activationType=normalizeActivationType(fd.get('activationType'),entity.skillType||entity.type);
    return entity;
  };

  function reassertSkillExtension(entity){
    if(!entity?.id)return;
    const activation=normalizeActivationType(entity.activationType,entity.skillType||entity.type);
    if(Data?.skills?.[entity.id])Data.skills[entity.id].activationType=activation;
    if(worldData?.skills?.SKILLS?.[entity.id])worldData.skills.SKILLS[entity.id].activationType=activation;
  }
  const insertBefore118=Configurator.insertEntity.bind(Configurator);
  Configurator.insertEntity=function(type,entity){
    const extension=type==='skills'?normalizeActivationType(entity?.activationType,entity?.skillType||entity?.type):'';
    const result=insertBefore118(type,entity);
    if(type==='skills')reassertSkillExtension({...entity,activationType:extension});
    return result;
  };

  const applyWorldBefore118=applyWorldData;
  applyWorldData=function(payload={}){
    const activations=Object.fromEntries(Object.entries(payload?.skills?.SKILLS||{}).map(([id,skill])=>[id,normalizeActivationType(skill?.activationType,skill?.skillType||skill?.type)]));
    const result=applyWorldBefore118(payload);
    Object.entries(activations).forEach(([id,activationType])=>reassertSkillExtension({id,activationType,skillType:Data?.skills?.[id]?.skillType||Data?.skills?.[id]?.type}));
    Object.entries(EQUIPMENT||{}).forEach(([id,item])=>{EQUIPMENT[id]=normalizeEquipmentItemV2(item);});
    return result;
  };

  const remapBefore118=Configurator.remapReferences.bind(Configurator);
  Configurator.remapReferences=function(type,oldId,newId){
    const result=remapBefore118(type,oldId,newId);
    if(type!=='equipment')return result;
    Object.values(EQUIPMENT||{}).forEach(item=>{if(text(item.ammoTypeId)===text(oldId))item.ammoTypeId=text(newId);});
    Object.values(NPCS||{}).forEach(npc=>{npc.lootTable=normalizeLootTable(npc.lootTable).map(row=>row.itemId===oldId?{...row,itemId:text(newId)}:row).filter(row=>row.itemId);});
    for(const player of [...Object.values(PLAYER_TEMPLATES||{}),...Object.values(App.state?.users||{})]){
      if(!player||typeof player!=='object')continue;
      const mags=normalizeMagazineMap(player.weaponMagazines);
      if(Object.prototype.hasOwnProperty.call(mags,oldId)){if(newId)mags[newId]=mags[oldId];delete mags[oldId];}
      Object.values(mags).forEach(row=>{if(row.ammoTypeId===oldId)row.ammoTypeId=text(newId);});
      player.weaponMagazines=mags;
    }
    return result;
  };

  const renderBefore118=Configurator.render.bind(Configurator);
  Configurator.render=function(){
    const result=renderBefore118();
    ensureAmmoTab();
    enhanceItemCards(document.getElementById('config-content')||document);
    return result;
  };
  const renderProfileBefore118=UI.renderProfile.bind(UI);
  UI.renderProfile=function(...args){
    const result=renderProfileBefore118(...args);
    enhanceItemCards(document.getElementById('profile-content')||document);
    return result;
  };

  document.addEventListener('click',event=>{
    const ammoTab=event.target.closest?.('[data-equipment-category-v118="ammo"]');
    if(ammoTab){event.preventDefault();event.stopImmediatePropagation();Configurator.equipmentCategoryV1052='ammo';Configurator.selectedId=null;Configurator.render();return;}
    const add=event.target.closest?.('[data-add-loot-v118]');
    if(add){event.preventDefault();add.closest('[data-npc-loot-editor-v118]')?.querySelector('.npc-loot-list-v118')?.insertAdjacentHTML('beforeend',lootRowMarkup({chance:100,minQty:1,maxQty:1}));return;}
    const remove=event.target.closest?.('[data-remove-loot-v118]');
    if(remove){event.preventDefault();remove.closest('[data-npc-loot-row-v118]')?.remove();return;}
  },true);
  document.addEventListener('change',event=>{
    const select=event.target.closest?.('#config-editor-form select[name="type"]');
    if(!select)return;
    const type=text(select.value).toLowerCase();
    const form=select.closest('form');
    form?.querySelectorAll('[data-v118-for-item]').forEach(node=>node.classList.toggle('hidden',node.dataset.v118ForItem!==type));
    if(type==='ammo'){
      event.stopImmediatePropagation();
      if(form)form.dataset.itemType='ammo';
      Configurator.equipmentCategoryV1052='ammo';
      form?.querySelectorAll('[data-for-item],[data-v113-for-item]').forEach(node=>node.classList.add('hidden'));
    }
  },true);

  const cardObserver118=new MutationObserver(mutations=>{
    for(const mutation of mutations)for(const node of mutation.addedNodes||[])if(node?.nodeType===1)enhanceItemCards(node.matches?.('[data-item-id]')?node:(node.querySelector?.('[data-item-id]')?node:null));
  });
  const observedRoot=document.getElementById('app')||document.body;
  if(observedRoot)cardObserver118.observe(observedRoot,{childList:true,subtree:true});

  window.GRPGFeaturePackV118=Object.freeze({VERSION,normalizeLootTable,normalizeMagazineMap,normalizeActivationType,modifierText,itemBadges,itemInfoMarkup});
})();
