/* GRPGI v1.0.122 — unified statistics, modifiers, NPC loadouts and inventory */
(function () {
  'use strict';
  if (window.__GRPGStatsV113) return;
  window.__GRPGStatsV113 = true;

  const VERSION = '1.0.122';
  const PRIMARY = ['strength','dexterity','endurance','intelligence','will','glory'];
  const PRIMARY_LABELS = { strength:'Сила', dexterity:'Ловкость', endurance:'Выносливость', intelligence:'Интеллект', will:'Воля', glory:'Слава' };
  const WEAPON_STATS = { light:'dexterity', heavy:'endurance', energy:'intelligence', melee:'dexterity' };
  const WEAPON_LABELS = { light:'Лёгкое', heavy:'Тяжёлое', energy:'Энергетическое', melee:'Ближний бой' };
  const TARGETS = [
    ['strength','Сила'],['dexterity','Ловкость'],['endurance','Выносливость'],['intelligence','Интеллект'],['will','Воля'],['glory','Слава'],
    ['max_hp','Максимальное HP'],['armor_class','Класс брони'],['defense','Защита (снижение урона)'],['initiative_bonus','Бонус инициативы'],
    ['movement','Дальность движения'],['vision','Дальность видимости'],['inventory_slots','Ячейки инвентаря'],['carry_capacity','Переносимый вес'],['implant_slots','Слоты имплантов'],
    ['social_bonus','Социальный бонус'],['attack_bonus','Бонус попадания'],['damage_bonus','Бонус урона'],['weapon_hit_stat','Характеристика попадания'],['weapon_hit_extra_stat','Доп. характеристика к попаданию']
  ];
  const OPS = [['add','Добавить'],['set','Установить'],['replace_stat','Заменить характеристику'],['add_stat','Добавить характеристику']];
  const SCOPES = [['global','Всегда'],['weapon_category','Категория оружия'],['weapon_id','Конкретная модель оружия']];

  const n = (v, f=0) => Number.isFinite(Number(v)) ? Number(v) : f;
  const i = (v, f=0) => Math.trunc(n(v,f));
  const nonNeg = (v,f=0) => Math.max(0,n(v,f));
  const arr = v => Array.isArray(v) ? v : [];
  const uniq = v => Array.from(new Set(arr(v).map(String).filter(Boolean)));
  const safe = v => typeof esc === 'function' ? esc(v) : String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = v => { try { return typeof deep === 'function' ? deep(v) : JSON.parse(JSON.stringify(v)); } catch { return v; } };
  const makeId113 = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;

  function normalizeModifier(raw = {}, source = {}) {
    let target = String(raw.target || raw.stat || raw.key || '').trim();
    // v1.0.115: the old separate defense-roll bonus was redundant. Preserve
    // existing data by treating it as an Armor Class modifier.
    if (target === 'defense_roll_bonus') target = 'armor_class';
    if (!target) return null;
    const opRaw = String(raw.op || raw.operation || 'add').trim().toLowerCase();
    const op = ['add','set','replace_stat','add_stat'].includes(opRaw) ? opRaw : 'add';
    const statRef = String(raw.statRef || raw.sourceStat || raw.characteristic || '').trim();
    // Add-zero rows have no mechanical meaning. Older editors generated one
    // automatically for Maximum HP, so drop those rows during normalization.
    if(op==='add'&&n(raw.value,0)===0&&!statRef)return null;
    return {
      id: String(raw.id || makeId113('mod')),
      target,
      op,
      value: n(raw.value, 0),
      statRef: PRIMARY.includes(statRef) ? statRef : '',
      scope: ['global','weapon_category','weapon_id'].includes(String(raw.scope || 'global')) ? String(raw.scope || 'global') : 'global',
      scopeValue: String(raw.scopeValue || raw.weaponCategory || raw.weaponId || '').trim(),
      priority: i(raw.priority, 0),
      enabled: raw.enabled !== false,
      sourceId: String(source.id || raw.sourceId || ''),
      sourceName: String(source.name || raw.sourceName || 'Модификатор'),
      sourceKind: String(source.kind || raw.sourceKind || ''),
      condition: String(raw.condition || 'always'), conditionValue: String(raw.conditionValue || ''),
      duration: n(raw.duration,0), durationType: String(raw.durationType || '')
    };
  }

  function normalizeModifiers(value, source={}) {
    return arr(value).map(row => normalizeModifier(row, source)).filter(Boolean);
  }

  function modifierSpecificity(mod) {
    if (mod.scope === 'weapon_id') return 30;
    if (mod.scope === 'weapon_category') return 20;
    return 10;
  }

  function conditionMatches(mod, context={}) {
    const kind=String(mod.condition||'always'); if(kind==='always'||!kind)return true;
    const entity=context.entity||{}; const stats=entity.stats||{};
    if(kind==='in_combat') return context.inCombat===true;
    if(kind==='has_skill') return arr(entity.skills).map(String).includes(String(mod.conditionValue||''));
    if(kind==='item_equipped'){const id=String(mod.conditionValue||'');return Object.values(entity.equipmentSlots||{}).map(String).includes(id)||arr(entity.implantSlots).map(String).includes(id);}
    if(kind==='hp_below_percent'){const max=Math.max(1,n(stats.hpMax,1));return n(stats.hpCurrent,max)/max*100 < n(mod.conditionValue,50);}
    if(kind==='incoming_weapon_category') return String(context.incomingWeaponCategory||'')===String(mod.conditionValue||'');
    return true;
  }
  function scopeMatches(mod, context={}) {
    if (!mod.enabled || !conditionMatches(mod,context)) return false;
    if (mod.scope === 'weapon_id') return String(context.weaponId || '') === String(mod.scopeValue || '');
    if (mod.scope === 'weapon_category') return String(context.weaponCategory || '') === String(mod.scopeValue || '');
    return true;
  }

  const previousNormalizeEquipment = normalizeEquipmentItemV2;
  normalizeEquipmentItemV2 = function (rawItem = {}) {
    const raw = { ...(rawItem || {}) };
    const next = previousNormalizeEquipment(raw);
    const rawType = String(raw.type || next.type || 'gear').trim().toLowerCase();
    if (rawType === 'backpack' || rawType === 'рюкзак' || rawType === 'рюкзаки') next.type = 'backpack';
    next.modifiers = normalizeModifiers(raw.modifiers || next.modifiers || [], { id: next.id, name: next.name, kind: 'equipment' });
    // v1.0.113 migration: old armorClass was an absolute target AC (usually 10+).
    // Convert it once into the new additive armor-class bonus when no explicit modifier exists.
    if (next.type === 'armor' && !next.modifiers.some(m => m.target === 'armor_class')) {
      const legacyArmor = n(raw.armorClass ?? next.armorClass, 0);
      if (legacyArmor !== 0) {
        const legacyBonus = legacyArmor >= 5 ? legacyArmor - 10 : legacyArmor;
        if (legacyBonus !== 0) next.modifiers.push(normalizeModifier({target:'armor_class',op:'add',value:legacyBonus}, {id:next.id,name:`${next.name} (legacy КБ)`,kind:'equipment'}));
      }
    }
    if (!next.modifiers.some(m => m.target === 'defense')) {
      const legacyDefense = nonNeg(raw.damageReduction ?? raw.defense ?? next.damageReduction, 0);
      if (legacyDefense) next.modifiers.push(normalizeModifier({target:'defense',op:'add',value:legacyDefense}, {id:next.id,name:`${next.name} (legacy защита)`,kind:'equipment'}));
    }
    // The old fields are no longer used by the Stats Engine after migration; keep raw data untouched in world JSON until the item is saved.
    next.stackable = raw.stackable === true || String(raw.stackable || '').toLowerCase() === 'true';
    next.stackLimit = next.stackable ? Math.max(2, i(raw.stackLimit ?? next.stackLimit, 99)) : 1;
    next.textOnlyInventory = raw.textOnlyInventory === true || String(raw.textOnlyInventory || '').toLowerCase() === 'true';
    if (next.textOnlyInventory) {
      next.mass = 0;
      next.inventoryWidth = 0;
      next.inventoryHeight = 0;
    } else {
      next.mass = nonNeg(raw.mass ?? next.mass, 1);
      next.inventoryWidth = Math.max(1, i(raw.inventoryWidth ?? next.inventoryWidth, 1));
      next.inventoryHeight = Math.max(1, i(raw.inventoryHeight ?? next.inventoryHeight, 1));
    }
    if (next.type === 'weapon') {
      const wc = String(raw.weaponCategory || next.weaponCategory || '').trim().toLowerCase();
      next.weaponCategory = Object.prototype.hasOwnProperty.call(WEAPON_STATS, wc) ? wc : 'light';
      next.hitBonus = n(raw.hitBonus ?? next.hitBonus, 0); // legacy / model-specific static modifier
      next.rapidFireShots = Math.max(1,i(raw.rapidFireShots??raw.burstShots??next.rapidFireShots,1));
      next.weaponSkillId=String(raw.weaponSkillId??next.weaponSkillId??'');
      next.weaponSkillBonus=n(raw.weaponSkillBonus??next.weaponSkillBonus,0);
    }
    next.armorWeightClass=['light','heavy'].includes(String(raw.armorWeightClass||next.armorWeightClass))?String(raw.armorWeightClass||next.armorWeightClass):'light';
    next.heavyArmor=next.armorWeightClass==='heavy'||raw.heavyArmor===true;
    next.shieldCoverBonus=nonNeg(raw.shieldCoverBonus??next.shieldCoverBonus,0);
    next.shieldDexterityCap=String(raw.shieldDexterityCap??next.shieldDexterityCap??'').trim()===''?null:nonNeg(raw.shieldDexterityCap??next.shieldDexterityCap,0);
    next.damageReduction = nonNeg(raw.damageReduction ?? raw.defense ?? next.damageReduction, 0);
    return next;
  };

  function equipment(id) {
    if (!id) return null;
    try { return normalizeEquipmentItemV2(EQUIPMENT?.[id] || Data?.getItem?.(id) || { id, name:id, type:'gear' }); } catch { return null; }
  }

  function skillById(id) {
    try { return Data?.getSkill?.(id) || Data?.skills?.[id] || worldData?.skills?.SKILLS?.[id] || null; } catch { return null; }
  }
  function originById(section, id) {
    if (!id) return null;
    try {
      const data = section === 'social' ? (Data?.socialOrigins || worldData?.socialOrigins?.SOCIAL_ORIGINS) : (Data?.geographicOrigins || worldData?.geographicOrigins?.GEOGRAPHIC_ORIGINS);
      return data?.[id] || null;
    } catch { return null; }
  }

  function synthesizeLegacyItemModifiers(item) {
    const out = [];
    const has = target => arr(item.modifiers).some(m => m?.target === target);
    if (item.type === 'armor' && n(item.armorClass,0) !== 0 && !has('armor_class')) { const legacy=n(item.armorClass,0); const bonus=legacy>=5?legacy-10:legacy; if(bonus) out.push(normalizeModifier({target:'armor_class',op:'add',value:bonus}, {id:item.id,name:item.name,kind:'equipment'})); }
    if (item.damageReduction && !has('defense')) out.push(normalizeModifier({target:'defense',op:'add',value:n(item.damageReduction)}, {id:item.id,name:item.name,kind:'equipment'}));
    return out.filter(Boolean);
  }

  function sourceModifiersForEntity(entity = {}, options={}) {
    const sources = [];
    const push = (object, kind, id, name) => {
      if (!object) return;
      const source = { id: id || object.id || '', name: name || object.name || kind, kind };
      sources.push(...normalizeModifiers(object.modifiers || [], source));
      if ((kind === 'profession' || kind === 'origin') && object.abilityBonuses) {
        PRIMARY.forEach(stat => {
          const value = n(object.abilityBonuses?.[stat],0);
          if (value) sources.push(normalizeModifier({target:stat,op:'add',value}, source));
        });
      }
    };
    push(entity, options.kind || 'entity', entity.id, entity.displayName || entity.name || 'Персонаж');
    const social = originById('social', entity.socialOriginId); push(social, 'profession', social?.id, social?.name);
    const geo = originById('geo', entity.geographicOriginId); push(geo, 'origin', geo?.id, geo?.name);
    arr(entity.skills).forEach(id => { const s = skillById(id); push(s, 'skill', id, s?.name || id); });

    const slots = entity.equipmentSlots || {};
    ['primaryWeapon','secondaryWeapon','armor','backpack'].forEach(slot => {
      const item = equipment(slots[slot]);
      if (!item) return;
      push(item, 'equipment', item.id, item.name);
      sources.push(...synthesizeLegacyItemModifiers(item));
    });
    uniq(entity.implantSlots?.length ? entity.implantSlots : entity.installedImplantIds).forEach(id => {
      const item = equipment(id); if (!item) return; push(item,'implant',item.id,item.name); sources.push(...synthesizeLegacyItemModifiers(item));
    });
    arr(options.temporaryModifiers || entity.temporaryModifiers).forEach(raw => { const mod=normalizeModifier(raw,{id:raw.sourceId||'temporary',name:raw.sourceName||'Временный эффект',kind:'temporary'}); if(mod) sources.push(mod); });
    return sources.filter(Boolean);
  }

  function applyValue(base, target, mods, context, breakdown, label) {
    let value = n(base,0);
    breakdown.push({ source:'База', value:n(base,0), op:'base', text:label || 'Базовое значение' });
    const rows = mods.filter(m => m.target === target && scopeMatches(m,context)).sort((a,b)=>(a.priority-b.priority)||(modifierSpecificity(a)-modifierSpecificity(b)));
    rows.forEach(mod => {
      if (mod.op === 'set') value = n(mod.value,0);
      else if (mod.op === 'add') value += n(mod.value,0);
      else if (mod.op === 'replace_stat' && mod.statRef && context?.abilities) value = n(context.abilities[mod.statRef],0);
      else if (mod.op === 'add_stat' && mod.statRef && context?.abilities) value += n(context.abilities[mod.statRef],0);
      else return;
      breakdown.push({source:mod.sourceName || mod.sourceId || 'Модификатор', value:['replace_stat','add_stat'].includes(mod.op)?n(context?.abilities?.[mod.statRef],0):n(mod.value,0), op:mod.op, statRef:mod.statRef||''});
    });
    return value;
  }

  function applyStatFormula(staticBase, defaultStat, target, mods, abilities, context, breakdown, scale=1, baseLabel='База') {
    let stat=defaultStat;
    const scoped=mods.filter(m=>m.target===target&&scopeMatches(m,context)).sort((a,b)=>(a.priority-b.priority)||(modifierSpecificity(a)-modifierSpecificity(b)));
    const replacements=scoped.filter(m=>m.op==='replace_stat'&&m.statRef);
    const replacement=replacements.length?replacements[replacements.length-1]:null;
    if(replacement)stat=replacement.statRef;
    let value=n(staticBase,0);
    breakdown.push({source:baseLabel,value:n(staticBase,0),op:'base'});
    if(replacement)breakdown.push({source:replacement.sourceName||replacement.sourceId||'Модификатор',value:0,op:'replace_stat',statRef:stat});
    if(stat){const part=n(abilities?.[stat],0)*scale;value+=part;breakdown.push({source:PRIMARY_LABELS[stat]||stat,value:part,op:'base',statRef:stat});}
    scoped.filter(m=>m.op==='add_stat'&&m.statRef).forEach(m=>{const part=n(abilities?.[m.statRef],0)*scale;value+=part;breakdown.push({source:`${m.sourceName}: ${PRIMARY_LABELS[m.statRef]||m.statRef}`,value:part,op:'add_stat',statRef:m.statRef});});
    scoped.filter(m=>['add','set'].includes(m.op)).forEach(m=>{value=m.op==='set'?n(m.value,0):value+n(m.value,0);breakdown.push({source:m.sourceName||m.sourceId||'Модификатор',value:n(m.value,0),op:m.op});});
    return value;
  }

  function normalizedBaseAbilities(entity={}) {
    const source = entity.abilityBase && typeof entity.abilityBase === 'object' ? entity.abilityBase : (entity.abilities || {});
    const out={}; PRIMARY.forEach(k=>out[k]=Math.max(0,n(source?.[k],0))); return out;
  }

  function normalizeBaseConfig(entity={}, kind='player') {
    const stats = entity.stats || {};
    const bs = entity.baseStats || {};
    const combat = entity.combat || {};
    return {
      hpBase: n(bs.hpBase ?? entity.hpBase ?? (()=>{const legacy=n(stats.hpMax ?? entity.hpMax ?? entity.hp,0),end=n((entity.abilityBase||entity.abilities||{}).endurance,0);return legacy>0?Math.max(0,legacy-end):1;})(), 1),
      movement: nonNeg(bs.movement ?? entity.baseMovement ?? combat.moveRange, 6),
      vision: nonNeg(bs.vision ?? entity.baseVision ?? combat.visionRange, 6),
      armorClass: n(bs.armorClass ?? entity.baseArmorClassBonus, 0),
      defense: nonNeg(bs.defense ?? entity.baseDefense ?? entity.damageReduction, 0),
      initiative: n(bs.initiative ?? entity.baseInitiativeBonus, 0),
      inventorySlots: Math.max(0,i(bs.inventorySlots ?? entity.inventoryBaseSlots ?? entity.inventorySize, 12)),
      carryBase: nonNeg(bs.carryBase ?? entity.carryBase ?? entity.baseCarryWeight, 12),
      implantSlots: Math.max(0,i(bs.implantSlots ?? entity.baseImplantSlots ?? entity.implantSlotCount, 0)),
      // Old target-AC data is intentionally not reinterpreted as a +10 modifier.
      legacyHpMax: nonNeg(stats.hpMax ?? entity.hpMax ?? entity.hp, 0),
      kind
    };
  }

  function compute(entity={}, options={}) {
    const kind = options.kind || (entity.npcId || entity.npcKind ? 'npc':'player');
    const base = normalizeBaseConfig(entity,kind);
    const mods = sourceModifiersForEntity(entity,options);
    const breakdown = {};
    const primaryBase = normalizedBaseAbilities(entity);
    const abilities = {};
    PRIMARY.forEach(stat => {
      breakdown[stat]=[];
      abilities[stat]=applyValue(primaryBase[stat],stat,mods,{entity,...options},breakdown[stat],PRIMARY_LABELS[stat]);
    });
    const formulaContext={entity,abilities,...options};
    breakdown.maxHp=[]; const maxHp=applyStatFormula(base.hpBase,'endurance','max_hp',mods,abilities,formulaContext,breakdown.maxHp,1,'База HP');
    const derived = {};
    // Armor Class is the permanent bonus added to the physical defense roll:
    // Dexterity + base AC bonus + equipped/skill/implant modifiers. Skills may
    // replace Dexterity or add another characteristic through the same modifier API.
    breakdown.armorClass=[];
    derived.armorClass=applyStatFormula(base.armorClass,'dexterity','armor_class',mods,abilities,formulaContext,breakdown.armorClass,1,'База КБ');
    const entries = [
      ['defense','defense',base.defense],
      ['movement','movement',base.movement],['vision','vision',base.vision],['inventorySlots','inventory_slots',base.inventorySlots],
      ['implantSlots','implant_slots',base.implantSlots]
    ];
    entries.forEach(([key,target,seed])=>{breakdown[key]=[];derived[key]=applyValue(seed,target,mods,formulaContext,breakdown[key]);});
    breakdown.initiativeBonus=[];derived.initiativeBonus=applyStatFormula(base.initiative,'will','initiative_bonus',mods,abilities,formulaContext,breakdown.initiativeBonus,1,'База инициативы');
    breakdown.carryCapacity=[];derived.carryCapacity=applyStatFormula(base.carryBase,'strength','carry_capacity',mods,abilities,formulaContext,breakdown.carryCapacity,2,'База грузоподъёмности');
    // Legacy alias for code that still reads this field. It is intentionally not
    // displayed as a separate statistic anymore.
    breakdown.defenseRollBonus=breakdown.armorClass;
    derived.defenseRollBonus=derived.armorClass;
    breakdown.socialBonus=[]; derived.socialBonus=applyStatFormula(0,'will','social_bonus',mods,abilities,formulaContext,breakdown.socialBonus,1,'База');
    derived.maxHp=Math.max(1,Math.round(maxHp));
    derived.armorClass=n(derived.armorClass,0);
    derived.defense=Math.max(0,n(derived.defense,0));
    derived.initiativeBonus=n(derived.initiativeBonus,0);
    derived.movement=Math.max(0,n(derived.movement,0));
    derived.vision=Math.max(0,n(derived.vision,0));
    derived.inventorySlots=Math.max(0,i(derived.inventorySlots,0));
    derived.carryCapacity=Math.max(0,n(derived.carryCapacity,0));
    derived.implantSlots=Math.max(0,i(derived.implantSlots,0));
    return { version:VERSION, abilities, values:derived, base, modifiers:mods, breakdown };
  }

  function weaponAttack(entity={}, weaponOrId, options={}) {
    const weapon = typeof weaponOrId === 'string' ? equipment(weaponOrId) : normalizeEquipmentItemV2(weaponOrId || {});
    if (!weapon?.id && !weapon?.name) return null;
    const stats=compute(entity,options), mods=stats.modifiers, context={weaponId:weapon.id,weaponCategory:weapon.weaponCategory||'light'};
    let stat = WEAPON_STATS[weapon.weaponCategory] || 'dexterity';
    const replaces=mods.filter(m=>m.target==='weapon_hit_stat'&&m.op==='replace_stat'&&m.statRef&&scopeMatches(m,{...context,entity,...options})).sort((a,b)=>(modifierSpecificity(a)-modifierSpecificity(b))||(a.priority-b.priority));
    if(replaces.length) stat=replaces[replaces.length-1].statRef;
    const detail=[{source:PRIMARY_LABELS[stat]||stat,value:n(stats.abilities[stat]),op:'base'}];
    let bonus=n(stats.abilities[stat],0)+n(weapon.hitBonus,0);
    if(n(weapon.hitBonus,0))detail.push({source:`${weapon.name}: базовый бонус`,value:n(weapon.hitBonus),op:'add'});
    if(weapon.weaponSkillId&&arr(entity.skills).map(String).includes(String(weapon.weaponSkillId))){bonus+=n(weapon.weaponSkillBonus,0);detail.push({source:`${skillById(weapon.weaponSkillId)?.name||weapon.weaponSkillId}: оружейный навык`,value:n(weapon.weaponSkillBonus,0),op:'add'});}
    mods.filter(m=>m.target==='weapon_hit_extra_stat'&&['add_stat','add'].includes(m.op)&&m.statRef&&scopeMatches(m,{...context,entity,...options})).forEach(m=>{bonus+=n(stats.abilities[m.statRef],0);detail.push({source:`${m.sourceName}: ${PRIMARY_LABELS[m.statRef]}`,value:n(stats.abilities[m.statRef],0),op:'add'});});
    mods.filter(m=>m.target==='attack_bonus'&&['add','set'].includes(m.op)&&scopeMatches(m,{...context,entity,...options})).sort((a,b)=>(a.priority-b.priority)||(modifierSpecificity(a)-modifierSpecificity(b))).forEach(m=>{bonus=m.op==='set'?n(m.value):bonus+n(m.value);detail.push({source:m.sourceName,value:n(m.value),op:m.op});});
    let damageBonus=0; const damageDetail=[]; mods.filter(m=>m.target==='damage_bonus'&&['add','set'].includes(m.op)&&scopeMatches(m,{...context,entity,...options})).sort((a,b)=>a.priority-b.priority).forEach(m=>{damageBonus=m.op==='set'?n(m.value):damageBonus+n(m.value);damageDetail.push({source:m.sourceName,value:n(m.value),op:m.op});});
    return { weapon, stat, bonus, detail, damage:String(weapon.damage||'—'), damageBonus, damageDetail, range:nonNeg(weapon.range,0) };
  }

  function breakdownText(rows=[]) {
    return rows.map(row=>{
      if(row.op==='replace_stat')return `${row.source}: характеристика → ${PRIMARY_LABELS[row.statRef]||row.statRef||'—'}`;
      if(row.op==='add_stat')return `${row.source}: + ${PRIMARY_LABELS[row.statRef]||row.statRef||'характеристика'} (${n(row.value)>=0?'+':''}${n(row.value)})`;
      return `${row.source}: ${row.op==='set'?'=':(n(row.value)>=0?'+':'')}${n(row.value)}`;
    }).join('\n');
  }

  const previousNormalizePlayer = normalizePlayerProfileV2;
  normalizePlayerProfileV2 = function(rawUser={}) {
    const source={...(rawUser||{})};
    const next=previousNormalizePlayer(source);
    next.abilityBase = normalizedBaseAbilities(source.abilityBase ? source : {...next, abilityBase: next.abilityBase || source.abilities || next.abilities});
    next.baseStats = { ...normalizeBaseConfig({...next,...source}, 'player'), ...(source.baseStats||{}) };
    next.inventoryBaseSlots=Math.max(0,i(source.inventoryBaseSlots ?? source.baseStats?.inventorySlots ?? source.inventorySize ?? next.inventorySize,12));
    next.carryBase=nonNeg(source.carryBase ?? source.baseStats?.carryBase ?? source.baseCarryWeight,12);
    next.baseImplantSlots=Math.max(0,i(source.baseImplantSlots ?? source.baseStats?.implantSlots ?? source.implantSlotCount ?? next.implantSlotCount,0));
    next.equipmentSlots={primaryWeapon:'',secondaryWeapon:'',armor:'',backpack:'',...(next.equipmentSlots||{}),...(source.equipmentSlots||{})};
    next.modifiers=normalizeModifiers(source.modifiers||next.modifiers||[],{id:next.id,name:next.displayName||next.id,kind:'player'});
    next.inventory=arr(next.inventory).map(row=>({itemId:String(row.itemId||''),qty:Math.max(0,i(row.qty,0)),positions:arr(row.positions).map(pos=>pos&&typeof pos==='object'?{x:i(pos.x),y:i(pos.y)}:null)})).filter(r=>r.itemId&&r.qty>0);
    const derived=compute(next,{kind:'player'});
    next.abilities={...derived.abilities};
    next.stats={...(next.stats||{}),hpMax:derived.values.maxHp};
    next.stats.hpCurrent=Math.min(derived.values.maxHp,Math.max(0,n(next.stats.hpCurrent,derived.values.maxHp)));
    next.stats.armorClass=derived.values.armorClass;
    next.stats.defense=derived.values.defense;
    next.inventorySize=derived.values.inventorySlots;
    next.carryWeightMax=derived.values.carryCapacity;
    next.implantSlotCount=derived.values.implantSlots;
    next.implantSlots=Array.from({length:next.implantSlotCount},(_,idx)=>String((source.implantSlots||next.implantSlots||[])[idx]||''));
    next.installedImplantIds=next.implantSlots.filter(Boolean);
    next.combat={...(next.combat||{}),moveRange:derived.values.movement,visionRange:derived.values.vision};
    next.derivedStatsV113=derived.values;
    return next;
  };

  function normalizeNpc(raw={}) {
    const npc={...(raw||{})};
    npc.abilityBase=normalizedBaseAbilities(npc.abilityBase?npc:{...npc,abilityBase:npc.abilities||{}});
    npc.abilities={...npc.abilityBase};
    npc.baseStats={...normalizeBaseConfig(npc,'npc'),...(npc.baseStats||{})};
    npc.modifiers=normalizeModifiers(npc.modifiers||[],{id:npc.id,name:npc.name||npc.id,kind:'npc'});
    npc.equipmentSlots={primaryWeapon:'',secondaryWeapon:'',armor:'',backpack:'',...(npc.equipmentSlots||npc.loadout||{})};
    npc.implantSlots=arr(npc.implantSlots).map(String);
    npc.installedImplantIds=npc.implantSlots.filter(Boolean);
    const derived=compute(npc,{kind:'npc'});
    npc.abilities={...derived.abilities};
    npc.stats={...(npc.stats||{}),hpMax:derived.values.maxHp};
    npc.stats.hpCurrent=Math.min(derived.values.maxHp,Math.max(0,n(npc.stats.hpCurrent,derived.values.maxHp)));
    npc.stats.armorClass=derived.values.armorClass; npc.stats.defense=derived.values.defense;
    npc.combat={...(npc.combat||{}),moveRange:derived.values.movement,visionRange:derived.values.vision};
    npc.derivedStatsV113=derived.values;
    return npc;
  }

  /* Inventory v113 */
  function inventoryItem(id){return equipment(id)||{id,name:id,type:'gear',mass:0,inventoryWidth:1,inventoryHeight:1,stackable:false,textOnlyInventory:false};}
  function equippedCounts(user={}){const map=new Map(),add=id=>{id=String(id||'');if(id)map.set(id,(map.get(id)||0)+1)};['primaryWeapon','secondaryWeapon','armor','backpack'].forEach(k=>add(user.equipmentSlots?.[k]));arr(user.implantSlots).forEach(add);return map;}
  function weight(user={}){return arr(user.inventory).reduce((sum,row)=>sum+nonNeg(inventoryItem(row.itemId).mass,0)*Math.max(0,i(row.qty,0)),0);}
  function cellUse(instance){return Math.max(0,i(instance.w))*Math.max(0,i(instance.h));}
  function fits(total,occupied,x,y,w,h){if(x<0||y<0||x+w>5)return false;for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const idx=yy*5+xx;if(idx<0||idx>=total||occupied.has(`${xx}:${yy}`))return false;}return true;}
  function mark(occ,x,y,w,h){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)occ.add(`${xx}:${yy}`);}
  function firstFit(total,occ,w,h){const rows=Math.ceil(Math.max(1,total)/5);for(let y=0;y<rows;y++)for(let x=0;x<5;x++)if(fits(total,occ,x,y,w,h))return{x,y};return null;}
  function layout(rawUser={}){
    const user=normalizePlayerProfileV2(rawUser), total=Math.max(0,i(user.inventorySize,0)), equipped=equippedCounts(user), occupied=new Set(), instances=[], overflow=[], text=[];
    arr(user.inventory).forEach(entry=>{
      const item=inventoryItem(entry.itemId), qty=Math.max(0,i(entry.qty,0)), skip=Math.min(qty,equipped.get(entry.itemId)||0), remaining=Math.max(0,qty-skip);
      if(!remaining)return;
      if(item.textOnlyInventory || (nonNeg(item.mass,0)===0 && i(item.inventoryWidth,0)===0 && i(item.inventoryHeight,0)===0)){text.push({item,entry,qty:remaining});return;}
      const w=Math.max(1,i(item.inventoryWidth,1)),h=Math.max(1,i(item.inventoryHeight,1));
      const stackLimit=item.stackable?Math.max(2,i(item.stackLimit,99)):1;
      const count=item.stackable?Math.ceil(remaining/stackLimit):remaining;
      for(let k=0;k<count;k++){
        const unitIndex=item.stackable?skip+k*stackLimit:skip+k; let pos=entry.positions?.[unitIndex]||entry.positions?.[k]||null;
        if(pos)pos={x:i(pos.x),y:i(pos.y)};
        if(!pos||!fits(total,occupied,pos.x,pos.y,w,h))pos=firstFit(total,occupied,w,h);
        const stackQty=item.stackable?Math.min(stackLimit,remaining-k*stackLimit):1;
        const instance={key:`${entry.itemId}:${unitIndex}`,itemId:entry.itemId,item,entry,unitIndex,qty:stackQty,w,h,pos};
        if(pos){mark(occupied,pos.x,pos.y,w,h);instances.push(instance);}else overflow.push(instance);
      }
    });
    const wgt=weight(user), overloaded=wgt>user.carryWeightMax+1e-9||overflow.length>0;
    return{user,total,size:total,cols:5,rows:Math.ceil(Math.max(1,total)/5),instances,overflow,text,occupied,weight:wgt,usedCells:instances.reduce((s,x)=>s+cellUse(x),0)+overflow.reduce((s,x)=>s+cellUse(x),0),overloaded};
  }
  function canAdd(rawUser,itemId,qty=1){const user=normalizePlayerProfileV2(rawUser), item=inventoryItem(itemId);if(layout(user).overloaded)return{ok:false,reason:'Персонаж перегружен. Сначала освободите вес или место.'};const clone=copy(user);let row=clone.inventory.find(r=>r.itemId===itemId);if(!row){row={itemId,qty:0,positions:[]};clone.inventory.push(row);}row.qty+=Math.max(1,i(qty,1));const l=layout(clone);if(l.weight>clone.carryWeightMax+1e-9)return{ok:false,reason:`Превышен переносимый вес: ${l.weight.toFixed(1)} / ${clone.carryWeightMax.toFixed(1)}`};if(l.overflow.length)return{ok:false,reason:'Недостаточно ячеек инвентаря.'};return{ok:true};}
  function slotAccepts(slot,item){if(slot==='armor')return item.type==='armor';if(slot==='backpack')return item.type==='backpack';if(slot==='implant')return item.type==='implant';if(slot==='primaryWeapon'||slot==='secondaryWeapon')return item.type==='weapon';return false;}
  function setSlot(user,slot,index,itemId){user.equipmentSlots={primaryWeapon:'',secondaryWeapon:'',armor:'',backpack:'',...(user.equipmentSlots||{})};if(slot==='implant'){user.implantSlots=Array.from({length:user.implantSlotCount},(_,j)=>String(user.implantSlots?.[j]||''));if(index<0||index>=user.implantSlotCount)return false;user.implantSlots[index]=String(itemId||'');user.installedImplantIds=user.implantSlots.filter(Boolean);return true;}user.equipmentSlots[slot]=String(itemId||'');return true;}
  function postChangeValid(user){const normalized=normalizePlayerProfileV2(user), l=layout(normalized);if(l.weight>normalized.carryWeightMax+1e-9)return{ok:false,reason:`После изменения вес ${l.weight.toFixed(1)} превысит предел ${normalized.carryWeightMax.toFixed(1)}.`};if(l.overflow.length)return{ok:false,reason:`После изменения не поместятся предметы: ${l.overflow.length}.`};return{ok:true,user:normalized};}
  window.GRPGInventoryV113={layout,weight,canAdd,slotAccepts,setSlot,postChangeValid,item:inventoryItem};
  window.GRPGInventoryV1067={...(window.GRPGInventoryV1067||{}),canAddItem:canAdd,buildLayout:layout,weight};

  window.GRPGStatsV113={VERSION,PRIMARY,PRIMARY_LABELS,TARGETS,OPS,SCOPES,normalizeModifier,normalizeModifiers,compute,computePlayer:(u,o={})=>compute(u,{...o,kind:'player'}),computeNpc:(u,o={})=>compute(u,{...o,kind:'npc'}),normalizeNpc,weaponAttack,breakdownText,sourceModifiersForEntity};

  /* Universal modifier editor */
  function targetOptions(selected=''){return `<option value="" ${!selected?'selected':''}>— выберите показатель —</option>`+TARGETS.map(([v,l])=>`<option value="${v}" ${v===selected?'selected':''}>${safe(l)}</option>`).join('');}
  function opOptions(selected='add'){return OPS.map(([v,l])=>`<option value="${v}" ${v===selected?'selected':''}>${safe(l)}</option>`).join('');}
  function conditionOptions(selected='always'){const rows=[['always','Без условия'],['hp_below_percent','HP ниже %'],['has_skill','Есть навык'],['item_equipped','Экипирован предмет'],['in_combat','В боевой сцене'],['incoming_weapon_category','Против категории оружия']];return rows.map(([v,l])=>`<option value=\"${v}\" ${v===selected?'selected':''}>${safe(l)}</option>`).join('');}
  function scopeOptions(selected='global'){return SCOPES.map(([v,l])=>`<option value="${v}" ${v===selected?'selected':''}>${safe(l)}</option>`).join('');}
  function statOptions(selected=''){return `<option value="">—</option>`+PRIMARY.map(v=>`<option value="${v}" ${v===selected?'selected':''}>${safe(PRIMARY_LABELS[v])}</option>`).join('');}
  function modifierRow(mod={}){
    // A blank editor row is only a form row. It must not silently become
    // "Максимальное HP +0" and then be written into every new entity.
    const m=normalizeModifier(mod)||{target:'',op:'add',value:0,statRef:'',scope:'global',scopeValue:'',condition:'always',conditionValue:'',priority:0};
    return `<div class="modifier-row-v113" data-modifier-row-v113>
      <label class="modifier-field-v115"><span>Показатель</span><select class="select" data-mod-target-v113>${targetOptions(m.target)}</select></label>
      <label class="modifier-field-v115"><span>Операция</span><select class="select" data-mod-op-v113>${opOptions(m.op)}</select></label>
      <label class="modifier-field-v115"><span>Значение</span><input class="input" type="number" step="0.1" data-mod-value-v113 value="${n(m.value)}"/></label>
      <label class="modifier-field-v115"><span>Характеристика</span><select class="select" data-mod-stat-v113>${statOptions(m.statRef)}</select></label>
      <label class="modifier-field-v115"><span>Область</span><select class="select" data-mod-scope-v113>${scopeOptions(m.scope)}</select></label>
      <label class="modifier-field-v115"><span>Категория / ID</span><input class="input" data-mod-scope-value-v113 value="${safe(m.scopeValue)}" placeholder="необязательно"/></label>
      <label class="modifier-field-v115"><span>Условие</span><select class="select" data-mod-condition-v113>${conditionOptions(m.condition)}</select></label>
      <label class="modifier-field-v115"><span>Значение условия</span><input class="input" data-mod-condition-value-v113 value="${safe(m.conditionValue||'')}" placeholder="необязательно"/></label>
      <label class="modifier-field-v115 modifier-priority-field-v115"><span>Приоритет</span><input class="input modifier-priority-v113" type="number" step="1" data-mod-priority-v113 value="${i(m.priority)}"/></label>
      <button class="ghost modifier-remove-v115" type="button" data-remove-modifier-v113 title="Удалить модификатор">×</button>
    </div>`;
  }
  function modifierEditor(mods=[],title='Модификаторы'){return `<div class="modifier-editor-v113" data-modifier-editor-v113><div class="section-title">${safe(title)}</div><div class="small-note">Добавляйте только нужные изменения. Отрицательные значения разрешены. Замена характеристики применяется к выбранной формуле.</div><div class="modifier-list-v113">${arr(mods).map(modifierRow).join('')}</div><button class="secondary" type="button" data-add-modifier-v113>+ ДОБАВИТЬ МОДИФИКАТОР</button></div>`;}
  function readModifiers(form){return Array.from(form.querySelectorAll('[data-modifier-row-v113]')).map(row=>normalizeModifier({target:row.querySelector('[data-mod-target-v113]')?.value,op:row.querySelector('[data-mod-op-v113]')?.value,value:row.querySelector('[data-mod-value-v113]')?.value,statRef:row.querySelector('[data-mod-stat-v113]')?.value,scope:row.querySelector('[data-mod-scope-v113]')?.value,scopeValue:row.querySelector('[data-mod-scope-value-v113]')?.value,priority:row.querySelector('[data-mod-priority-v113]')?.value,condition:row.querySelector('[data-mod-condition-v113]')?.value,conditionValue:row.querySelector('[data-mod-condition-value-v113]')?.value})).filter(Boolean);}
  document.addEventListener('click',event=>{const add=event.target.closest?.('[data-add-modifier-v113]');if(add){add.closest('[data-modifier-editor-v113]')?.querySelector('.modifier-list-v113')?.insertAdjacentHTML('beforeend',modifierRow());return;}const rem=event.target.closest?.('[data-remove-modifier-v113]');if(rem)rem.closest('[data-modifier-row-v113]')?.remove();});

  /* Configurator: equipment */
  const renderEquipment113=Configurator.renderEquipmentEditor.bind(Configurator);
  Configurator.renderEquipmentEditor=function(raw){const item=normalizeEquipmentItemV2(raw);let html=renderEquipment113(item);
    html=html.replace(/(<select class="select" name="type">)/,`$1<option value="backpack" ${item.type==='backpack'?'selected':''}>Рюкзаки</option>`);
    const invFields=`<div class="section-title">Инвентарь и свойства</div><div class="cols3"><label class="consent-line"><input type="checkbox" name="stackableV113" ${item.stackable?'checked':''}/><span><b>Можно складывать в стопку</b><small>Одна стопка занимает размер одного предмета, вес считается за всё количество.</small></span></label><div class="field"><label>Максимум в стопке</label><input class="input" type="number" min="2" step="1" name="stackLimitV113" value="${item.stackLimit||99}"/></div><label class="consent-line"><input type="checkbox" name="textOnlyInventoryV113" ${item.textOnlyInventory?'checked':''}/><span><b>Без веса и размера</b><small>Письма, документы и прочие текстовые предметы выводятся отдельным списком.</small></span></label></div>`;
    const weaponSkills=Object.values(Data?.skills||worldData?.skills?.SKILLS||{}).filter(Boolean).sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id),'ru'));
    const weaponFields=`<div class="item-specific-v113 ${item.type==='weapon'?'':'hidden'}" data-v113-for-item="weapon"><div class="cols3"><div class="field"><label>Категория попадания</label><select class="select" name="weaponCategoryV113">${Object.entries(WEAPON_LABELS).map(([v,l])=>`<option value="${v}" ${item.weaponCategory===v?'selected':''}>${safe(l)} · ${safe(PRIMARY_LABELS[WEAPON_STATS[v]])}</option>`).join('')}</select></div><div class="field"><label>Оружейный навык</label><select class="select" name="weaponSkillIdV122"><option value="">— не требуется —</option>${weaponSkills.map(skill=>`<option value="${safe(skill.id)}" ${String(skill.id)===item.weaponSkillId?'selected':''}>${safe(skill.name||skill.id)}</option>`).join('')}</select></div><div class="field"><label>Бонус изученного навыка</label><input class="input" type="number" step="1" name="weaponSkillBonusV122" value="${n(item.weaponSkillBonus,0)}"/></div></div><div class="cols3"><div class="field"><label>Скорострельность (выстрелов за действие)</label><input class="input" type="number" min="1" step="1" name="rapidFireShotsV122" value="${item.rapidFireShots||1}"/><div class="small-note">Каждый следующий выстрел получает накопительный штраф −1.</div></div><div class="field"><label>Бонус физического щита</label><input class="input" type="number" min="0" step="1" name="shieldCoverBonusV122" value="${n(item.shieldCoverBonus,0)}"/></div><div class="field"><label>Предел Ловкости от щита</label><input class="input" type="number" min="0" step="1" name="shieldDexterityCapV122" value="${item.shieldDexterityCap??''}" placeholder="без ограничения"/></div></div><div class="small-note">Щит определяется по этому бонусу или тегу «щит». Его бонус не складывается с укрытием.</div></div>`;
    const armorFields=`<div class="item-specific-v113 ${item.type==='armor'?'':'hidden'}" data-v113-for-item="armor"><div class="field"><label>Весовая категория брони</label><select class="select" name="armorWeightClassV122"><option value="light" ${item.armorWeightClass!=='heavy'?'selected':''}>Лёгкая / обычная — Ловкость добавляется</option><option value="heavy" ${item.armorWeightClass==='heavy'?'selected':''}>Тяжёлая — Ловкость не добавляется к защите</option></select></div></div>`;
    const backpackFields=`<div class="item-specific-v113 ${item.type==='backpack'?'':'hidden'}" data-v113-for-item="backpack"><div class="small-note">Вместимость и переносимый вес рюкзака задаются универсальными модификаторами ниже, например «Ячейки инвентаря +10».</div></div>`;
    html=html.replace(/<div class="field"><label>Класс брони<\/label><input[^>]*name="armorClass"[^>]*><\/div>/,`<div class="small-note">Класс брони теперь задаётся модификатором «Класс брони». Старые абсолютные значения автоматически мигрируют в бонус относительно прежней базы 10.</div>`);
    html=html.replace('<div class="field"><label>Теги',`${invFields}${weaponFields}${armorFields}${backpackFields}${modifierEditor(item.modifiers,'Модификаторы предмета')}<div class="field"><label>Теги`);
    return html;};

  function ensureBackpackTab(){if(Configurator.selectedType!=='equipment')return;const tabs=document.querySelector('.equipment-tabs-v1052');if(!tabs||tabs.querySelector('[data-equipment-category-v113="backpack"]'))return;tabs.insertAdjacentHTML('beforeend',`<button type="button" class="secondary ${Configurator.equipmentCategoryV1052==='backpack'?'active':''}" data-equipment-category-v113="backpack">Рюкзаки</button>`);}
  const configRender113=Configurator.render.bind(Configurator);Configurator.render=function(){const r=configRender113();ensureBackpackTab();return r;};
  document.addEventListener('click',event=>{const btn=event.target.closest?.('[data-equipment-category-v113="backpack"]');if(!btn)return;event.preventDefault();event.stopImmediatePropagation();Configurator.equipmentCategoryV1052='backpack';Configurator.selectedId=null;Configurator.render();},true);
  document.addEventListener('change',event=>{const select=event.target.closest?.('#config-editor-form select[name="type"]');if(!select)return;const type=select.value;const form=event.target.closest('form');form?.querySelectorAll('[data-v113-for-item]').forEach(node=>node.classList.toggle('hidden',node.dataset.v113ForItem!==type));if(type==='backpack'){event.stopImmediatePropagation();if(form)form.dataset.itemType='backpack';Configurator.equipmentCategoryV1052='backpack';form?.querySelectorAll('[data-for-item]').forEach(node=>node.classList.add('hidden'));}},true);

  /* Other editors */
  function injectBeforeSave(html,saveText,markup){const needle=`<button class="primary" type="submit">${saveText}</button>`;return html.includes(needle)?html.replace(needle,markup+needle):html;}
  const renderSkill113=Configurator.renderSkillEditor?.bind(Configurator);if(renderSkill113)Configurator.renderSkillEditor=function(entity){return injectBeforeSave(renderSkill113(entity),'SAVE_SKILL',modifierEditor(entity?.modifiers,'Модификаторы навыка'));};
  const renderOrigin113=Configurator.renderOriginEditorV1052?.bind(Configurator);if(renderOrigin113)Configurator.renderOriginEditorV1052=function(entity,kind){let html=renderOrigin113(entity,kind);const mark=modifierEditor(entity?.modifiers,kind==='social'?'Модификаторы профессии':'Модификаторы происхождения');html=injectBeforeSave(html,'SAVE_ORIGIN',mark);html=injectBeforeSave(html,'SAVE_PROFESSION',mark);return html;};

  function itemSelect(items,selected=''){return `<option value="">—</option>`+items.map(item=>`<option value="${safe(item.id)}" ${String(item.id)===String(selected)?'selected':''}>${safe(item.name||item.id)}</option>`).join('');}
  function baseFields(entity={},prefix='v113'){const b=normalizeBaseConfig(entity);return `<div class="section-title">Базовые показатели Stats Engine</div><div class="cols3"><div class="field"><label>База HP</label><input class="input" type="number" step="1" name="${prefix}_hpBase" value="${n(b.hpBase,1)}"/></div><div class="field"><label>Базовая дальность движения (гексы)</label><input class="input" type="number" min="0" step="1" name="${prefix}_movement" value="${n(b.movement,6)}"/></div><div class="field"><label>Базовый обзор (гексы)</label><input class="input" type="number" min="0" step="1" name="${prefix}_vision" value="${n(b.vision,6)}"/></div></div><div class="cols3"><div class="field"><label>Базовый бонус КБ</label><input class="input" type="number" step="1" name="${prefix}_armorClass" value="${n(b.armorClass,0)}"/></div><div class="field"><label>Базовая защита</label><input class="input" type="number" min="0" step="1" name="${prefix}_defense" value="${n(b.defense,0)}"/></div><div class="field"><label>База инициативы</label><input class="input" type="number" step="1" name="${prefix}_initiative" value="${n(b.initiative,0)}"/></div></div><div class="cols3"><div class="field"><label>Базовые ячейки инвентаря</label><input class="input" type="number" min="0" step="1" name="${prefix}_inventorySlots" value="${i(b.inventorySlots,12)}"/></div><div class="field"><label>База переносимого веса</label><input class="input" type="number" min="0" step="0.1" name="${prefix}_carryBase" value="${n(b.carryBase,12)}"/><div class="small-note">Итог: база + Сила × 2 + модификаторы.</div></div><div class="field"><label>Базовые слоты имплантов</label><input class="input" type="number" min="0" step="1" name="${prefix}_implantSlots" value="${i(b.implantSlots,0)}"/></div></div>`;}

  const renderPlayer113=Configurator.renderPlayerEditor.bind(Configurator);Configurator.renderPlayerEditor=function(raw){const user=normalizePlayerProfileV2(raw);let html=renderPlayer113(user);
    html=html.replace(/<label>Макс\. здоровье<\/label><input class="input" type="number" name="hpMax"/, '<label>Макс. здоровье (расчёт)</label><input class="input" type="number" readonly title="Рассчитывается Stats Engine" name="hpMax"');
    // WC is a DM tool: the manual player-upgrade cap of 5 does not constrain direct DM editing.
    html=html.replace(/\smax="5"(?=[^>]*name="ability_[a-z]+")/g,'');
    // Old fields represented already-derived values and the legacy absolute AC. Keep no duplicate controls in the new editor.
    html=html.replace('class="cols3 inventory-character-settings-v1067"','class="cols3 inventory-character-settings-v1067 hidden"');
    html=html.replace(/<div class="cols2"><div class="field"><label>Базовый класс брони<\/label>[\s\S]*?<\/div><\/div>/,'');
    const extra=`<section class="wc-stats-section-v115">${baseFields(user,'v113p')}${modifierEditor(user.modifiers,'Персональные модификаторы DM')}</section>`;
    const inventoryAnchor='<div class="section-title">Инвентарь и слоты</div>';
    if(html.includes(inventoryAnchor))html=html.replace(inventoryAnchor,extra+inventoryAnchor);
    else html=injectBeforeSave(html,'SAVE_PLAYER',extra);
    return html;};

  const renderNpc113=(Configurator.renderNpcEditorV60||Configurator.renderNpcEditor).bind(Configurator);const npcRenderTarget=Configurator.renderNpcEditorV60?'renderNpcEditorV60':'renderNpcEditor';Configurator[npcRenderTarget]=function(raw){const npc=normalizeNpc(raw);let html=renderNpc113(npc);PRIMARY.forEach(stat=>{html=html.replace(new RegExp(`(name="npcAbility_${stat}"[^>]*value=")[^"]*(")`),(_match,before,after)=>before+Math.max(0,n(npc.abilityBase?.[stat],0))+after);});html=html.replace(/<label>HP макс\.<\/label><input class="input" type="number" name="npcHpMax"/, '<label>HP макс. (расчёт)</label><input class="input" type="number" readonly title="Рассчитывается Stats Engine" name="npcHpMax"');const items=Object.values(EQUIPMENT||{}).map(normalizeEquipmentItemV2);const weapons=items.filter(x=>x.type==='weapon'),armors=items.filter(x=>x.type==='armor'),backs=items.filter(x=>x.type==='backpack');html=html.replaceAll(' min=\"0\" max=\"5\" name=\"npcAbility_',' min=\"0\" name=\"npcAbility_');const implants=items.filter(x=>x.type==='implant');const extra=`${baseFields(npc,'v113n')}<div class="section-title">Loadout NPC</div><div class="cols2"><div class="field"><label>Основное оружие</label><select class="select" name="v113n_primaryWeapon">${itemSelect(weapons,npc.equipmentSlots?.primaryWeapon)}</select></div><div class="field"><label>Вторичное оружие / щит</label><select class="select" name="v113n_secondaryWeapon">${itemSelect(weapons,npc.equipmentSlots?.secondaryWeapon)}</select></div><div class="field"><label>Броня</label><select class="select" name="v113n_armor">${itemSelect(armors,npc.equipmentSlots?.armor)}</select></div><div class="field"><label>Рюкзак</label><select class="select" name="v113n_backpack">${itemSelect(backs,npc.equipmentSlots?.backpack)}</select></div></div><div class="field"><label>Импланты NPC</label><select class="select" name="v113n_implants" multiple size="4">${implants.map(item=>`<option value=\"${safe(item.id)}\" ${arr(npc.implantSlots).includes(item.id)?'selected':''}>${safe(item.name||item.id)}</option>`).join('')}</select></div>${modifierEditor(npc.modifiers,'Персональные модификаторы NPC')}`;return injectBeforeSave(html,'SAVE_NPC',extra);};

  const collect113=Configurator.collectEntity.bind(Configurator);Configurator.collectEntity=function(type,form,fd=new FormData(form)){let entity=collect113(type,form,fd);if(!entity)return entity;const mods=readModifiers(form);
    if(type==='equipment'){const rawType=String(fd.get('type')||entity.type||'gear');entity.type=rawType==='backpack'?'backpack':entity.type;entity.stackable=fd.get('stackableV113')==='on';entity.stackLimit=entity.stackable?Math.max(2,i(fd.get('stackLimitV113'),99)):1;entity.textOnlyInventory=fd.get('textOnlyInventoryV113')==='on';entity.weaponCategory=String(fd.get('weaponCategoryV113')||entity.weaponCategory||'light');entity.weaponSkillId=String(fd.get('weaponSkillIdV122')||'');entity.weaponSkillBonus=n(fd.get('weaponSkillBonusV122'),0);entity.rapidFireShots=Math.max(1,i(fd.get('rapidFireShotsV122'),1));entity.shieldCoverBonus=nonNeg(fd.get('shieldCoverBonusV122'),0);entity.shieldDexterityCap=String(fd.get('shieldDexterityCapV122')||'').trim()===''?null:nonNeg(fd.get('shieldDexterityCapV122'),0);entity.armorWeightClass=String(fd.get('armorWeightClassV122')||entity.armorWeightClass||'light');entity.heavyArmor=entity.armorWeightClass==='heavy';entity.modifiers=mods;return normalizeEquipmentItemV2(entity);}
    if(type==='players'){const playerBase={};PRIMARY.forEach(k=>{const raw=fd.get(`ability_${k}`);playerBase[k]=Math.max(0,n(raw,entity.abilityBase?.[k]||0));});entity.abilityBase=playerBase;entity.baseStats={...(entity.baseStats||{}),hpBase:n(fd.get('v113p_hpBase'),1),movement:nonNeg(fd.get('v113p_movement'),6),vision:nonNeg(fd.get('v113p_vision'),6),armorClass:n(fd.get('v113p_armorClass'),0),defense:nonNeg(fd.get('v113p_defense'),0),initiative:n(fd.get('v113p_initiative'),0),inventorySlots:Math.max(0,i(fd.get('v113p_inventorySlots'),12)),carryBase:nonNeg(fd.get('v113p_carryBase'),12),implantSlots:Math.max(0,i(fd.get('v113p_implantSlots'),0))};entity.inventoryBaseSlots=entity.baseStats.inventorySlots;entity.carryBase=entity.baseStats.carryBase;entity.baseImplantSlots=entity.baseStats.implantSlots;entity.equipmentSlots={...(entity.equipmentSlots||{})};entity.modifiers=mods;return normalizePlayerProfileV2(entity);}
    if(type==='npcs'){const baseAbilities={};PRIMARY.forEach(k=>baseAbilities[k]=Math.max(0,n(form.querySelector(`[name=\"npcAbility_${k}\"]`)?.value,entity.abilities?.[k]||entity.abilityBase?.[k]||0)));entity.abilityBase=baseAbilities;entity.abilities={...baseAbilities};entity.baseStats={...(entity.baseStats||{}),hpBase:n(fd.get('v113n_hpBase'),1),movement:nonNeg(fd.get('v113n_movement'),6),vision:nonNeg(fd.get('v113n_vision'),6),armorClass:n(fd.get('v113n_armorClass'),0),defense:nonNeg(fd.get('v113n_defense'),0),initiative:n(fd.get('v113n_initiative'),0),inventorySlots:Math.max(0,i(fd.get('v113n_inventorySlots'),12)),carryBase:nonNeg(fd.get('v113n_carryBase'),12),implantSlots:Math.max(0,i(fd.get('v113n_implantSlots'),0))};entity.equipmentSlots={primaryWeapon:String(fd.get('v113n_primaryWeapon')||''),secondaryWeapon:String(fd.get('v113n_secondaryWeapon')||''),armor:String(fd.get('v113n_armor')||''),backpack:String(fd.get('v113n_backpack')||'')};entity.implantSlots=Array.from(form.querySelector('[name="v113n_implants"]')?.selectedOptions||[]).map(o=>String(o.value||'')).filter(Boolean);entity.installedImplantIds=entity.implantSlots.slice();entity.modifiers=mods;return normalizeNpc(entity);}
    if(['skills','socialOrigins','geographicOrigins'].includes(type)){entity.modifiers=mods;}
    return entity;};

  // Private skill normalizer in older code discarded unknown keys: restore modifiers after insertion/load.
  const insert113=Configurator.insertEntity.bind(Configurator);Configurator.insertEntity=function(type,entity){const mods=copy(entity?.modifiers||[]);const result=insert113(type,entity);if(type==='skills'&&entity?.id){if(Data?.skills?.[entity.id])Data.skills[entity.id].modifiers=mods;if(worldData?.skills?.SKILLS?.[entity.id])worldData.skills.SKILLS[entity.id].modifiers=mods;}return result;};
  const applyWorld113=applyWorldData;applyWorldData=function(payload={}){const skillMods={};Object.entries(payload?.skills?.SKILLS||{}).forEach(([id,s])=>skillMods[id]=copy(s?.modifiers||[]));const result=applyWorld113(payload);Object.entries(skillMods).forEach(([id,mods])=>{if(Data?.skills?.[id])Data.skills[id].modifiers=mods;if(worldData?.skills?.SKILLS?.[id])worldData.skills.SKILLS[id].modifiers=mods;});Object.entries(NPCS||{}).forEach(([id,npc])=>{NPCS[id]=normalizeNpc(npc);});return result;};

  /* Character upgrade: cost equals target base level, base cap 5, Glory only DM */
  document.addEventListener('click',async event=>{const btn=event.target.closest?.('.profile-upgrade-ability-btn-v51');if(!btn)return;event.preventDefault();event.stopImmediatePropagation();const key=String(btn.dataset.ability||btn.dataset.abilityKey||btn.dataset.key||'');if(!PRIMARY.includes(key))return;const current=normalizePlayerProfileV2(App.currentUser);if(!current)return;if(key==='glory'&&String(current.role||'').toLowerCase()!=='gm'){Toast.show('Славу выдаёт только ДМ','info');return;}const base=Math.max(0,n(current.abilityBase?.[key],0));if(base>=5){Toast.show('Ручная прокачка характеристики ограничена 5','info');return;}const nextLevel=Math.floor(base)+1,cost=nextLevel;if(n(current.skillPoints,0)<cost){Toast.show(`Нужно ${cost} очк. улучшения для уровня ${nextLevel}`,'info');return;}current.abilityBase={...(current.abilityBase||{}),[key]:nextLevel};current.skillPoints=Math.max(0,n(current.skillPoints)-cost);App.state.users[current.id]=normalizePlayerProfileV2(current);PLAYER_TEMPLATES[current.id]=copy(App.state.users[current.id]);await PlayerSync.pushPlayerPatch(current.id,{abilityBase:copy(current.abilityBase),abilities:copy(current.abilityBase),skillPoints:current.skillPoints},{notice:`${PRIMARY_LABELS[key]} повышена до ${nextLevel} за ${cost} очк.`,rerender:true});},true);

  /* Profile */
  function signed(v){v=n(v,0);return `${v>=0?'+':''}${Number.isInteger(v)?v:v.toFixed(1)}`;}
  function slotCard(user,slot,label,index=-1){
    const id=slot==='implant'?user.implantSlots?.[index]:user.equipmentSlots?.[slot],item=inventoryItem(id),filled=!!id;
    let subtitle='';
    if(filled&&item.type==='weapon'){
      const hit=weaponAttack(user,item);
      subtitle=`Попадание ${signed(hit?.bonus||0)} · урон ${item.damage||'—'}${hit?.damageBonus?` ${signed(hit.damageBonus)}`:''} · ${item.range||0} гекс.`;
    }else if(filled) subtitle=arr(item.modifiers).length?`${item.modifiers.length} модиф.`:(item.type||'предмет');
    return `<div class="inventory-equip-slot-v1067 inventory-equip-slot-v115 ${filled?'filled':''}" data-slot-v113="${slot}" data-slot-index-v113="${index}">
      <div class="inventory-slot-label-v1067">${safe(label)}</div>
      ${filled?`<div class="inventory-slot-item-v1067" draggable="true" data-inv113-drag-slot data-slot-v113="${slot}" data-slot-index-v113="${index}" data-item-id="${safe(id)}" data-entity="item" data-id="${safe(id)}">${typeof renderThumb==='function'?renderThumb(item,{size:'sm',type:'item',glyph:initials(item.name,'▣')}):''}<span>${safe(item.name||id)}</span>${subtitle?`<small>${safe(subtitle)}</small>`:''}</div>`:'<div class="inventory-slot-empty-v1067">Перетащите предмет</div>'}
    </div>`;
  }
  function gridMarkup(user){
    const l=layout(user);
    const cells=Array.from({length:l.total},(_,idx)=>`<div class="inventory-grid-cell-v1067" style="grid-column:${idx%5+1};grid-row:${Math.floor(idx/5)+1}"></div>`).join('');
    const tiles=l.instances.map(x=>`<div class="inventory-tile-v1067 inventory-tile-v115" draggable="true" data-inv113-drag-grid data-item-id="${safe(x.itemId)}" data-unit-index="${x.unitIndex}" data-entity="item" data-id="${safe(x.itemId)}" style="grid-column:${x.pos.x+1}/span ${x.w};grid-row:${x.pos.y+1}/span ${x.h}" title="${safe(x.item.name)}">${typeof renderThumb==='function'?renderThumb(x.item,{size:'sm',type:'item',glyph:initials(x.item.name,'▣')}):''}<span>${safe(x.item.name)}</span><small>${x.w}×${x.h}${x.qty>1?` · ×${x.qty}`:''}</small></div>`).join('');
    const overflow=l.overflow.length?`<div class="inventory-overflow-v1067"><b>Не помещается: ${l.overflow.length}</b></div>`:'';
    return `<div class="inventory-grid-v1067 inventory-grid-v115" data-inv113-grid style="--inv-cols:5;--inv-rows:${l.rows}">${cells}${tiles}</div>${overflow}`;
  }
  function inventoryCard(user){
    const l=layout(user),overweight=l.weight>user.carryWeightMax+1e-9;
    const implantSlots=Array.from({length:user.implantSlotCount},(_,idx)=>slotCard(user,'implant',`Имплант ${idx+1}`,idx)).join('');
    return `<div class="section-title">Экипировка</div>
      <div class="inventory-capacity-bar-v1067"><span>Инвентарь <b>${l.usedCells} / ${user.inventorySize}</b> клеток</span><span class="${overweight?'inventory-limit-exceeded-v1067':''}">Вес <b>${l.weight.toFixed(1)} / ${Number(user.carryWeightMax).toFixed(1)}</b></span>${l.overloaded?'<strong class="inventory-overload-v115">ПЕРЕГРУЗ</strong>':''}</div>
      <div class="inventory-equipment-layout-v115">
        <div>${slotCard(user,'primaryWeapon','Основное оружие')}</div>
        <div class="inventory-equipment-center-v115">${slotCard(user,'armor','Броня')}${slotCard(user,'backpack','Рюкзак')}</div>
        <div>${slotCard(user,'secondaryWeapon','Вторичное / щит')}</div>
      </div>
      <div class="inventory-implant-strip-v115">${implantSlots||'<div class="small-note">Нет слотов имплантов.</div>'}</div>
      <div class="section-title" style="margin-top:18px">Инвентарь</div>${gridMarkup(user)}
      <div class="profile-documents-v115"><div class="section-title">Документы и предметы без веса/размера</div><div class="tags entity-button-row">${l.text.map(x=>`<button class="tag" type="button" data-entity="item" data-id="${safe(x.item.id)}">${safe(x.item.name)}${x.qty>1?` ×${x.qty}`:''}</button>`).join('')||'<span class="small-note">Нет таких предметов.</span>'}</div></div>`;
  }
  function profileDataRow(label,value,rows,unit=''){
    return `<div class="data-row profile-derived-row-v115" title="${safe(breakdownText(rows||[]))}"><span class="data-label">${safe(label)}</span><span class="data-value">${safe(value)}${unit?` ${safe(unit)}`:''}</span></div>`;
  }
  function renderProfile113(){
    const user=App.currentUser?normalizePlayerProfileV2(App.currentUser):null,root=document.getElementById('profile-content');
    if(!user||!root||root.querySelector('.profile-lore-shell-v1103'))return;
    const s=compute(user,{kind:'player'});
    // Capacity belongs to the inventory card, not the identity/location card.
    root.querySelectorAll('[data-inventory-limits-v1067]').forEach(node=>node.remove());
    const locationCard=root.querySelector('.profile-rts-location-card-v36');
    if(locationCard){locationCard.classList.add('profile-location-compact-v113');locationCard.querySelectorAll('.small-note').forEach(note=>{if(/топлив|скорост/i.test(note.textContent||''))note.remove();});}

    const cards=Array.from(root.querySelectorAll('.profile-card'));
    const identityCard=cards.find(card=>!card.classList.contains('profile-rts-location-card-v36')&&card.querySelector('.media-avatar,.avatar'));
    if(identityCard){
      // Remove legacy AC inserted by the pre-Stats-Engine profile patch.
      identityCard.querySelectorAll('[data-armor-class-v1052],[data-profile-derived-v115]').forEach(node=>node.remove());
      const rows=`<div data-profile-derived-v115 class="profile-derived-block-v115">
        <div class="section-title">Боевые показатели</div>
        ${profileDataRow('Класс брони',signed(s.values.armorClass),s.breakdown.armorClass)}
        ${profileDataRow('Защита',s.values.defense,s.breakdown.defense)}
        ${profileDataRow('Инициатива',signed(s.values.initiativeBonus),s.breakdown.initiativeBonus)}
        ${profileDataRow('Движение',s.values.movement,s.breakdown.movement,'гекс.')}
        ${profileDataRow('Обзор',s.values.vision,s.breakdown.vision,'гекс.')}
        ${profileDataRow('Социальный бонус',signed(s.values.socialBonus),s.breakdown.socialBonus)}
      </div>`;
      const currentPositionTitle=Array.from(identityCard.querySelectorAll('.section-title')).find(node=>node.textContent?.trim()==='Текущее положение');
      if(currentPositionTitle)currentPositionTitle.parentElement?.insertAdjacentHTML('beforebegin',rows);
      else identityCard.insertAdjacentHTML('beforeend',rows);
    }

    const abilityCard=Array.from(root.querySelectorAll('.profile-card')).find(card=>Array.from(card.querySelectorAll('.section-title')).some(t=>t.textContent.trim()==='Характеристики'));
    if(abilityCard){
      const abilities=abilityCard.querySelector('.abilities')||abilityCard.querySelector('.profile-abilities-grid-v50');
      if(abilities){
        abilities.classList.add('profile-abilities-grid-v50');
        abilities.innerHTML=PRIMARY.map(k=>`<div class="ability profile-ability-compact" title="${safe(breakdownText(s.breakdown[k]))}"><span>${safe(PRIMARY_LABELS[k])}</span><b>${safe(s.abilities[k])}</b></div>`).join('');
      }
      // Remove technical player-facing explanations introduced by v1.0.113.
      abilityCard.querySelectorAll('.primary-stats-v113').forEach(node=>node.remove());
      Array.from(abilityCard.querySelectorAll('.small-note')).forEach(note=>{if(/Очки улучшения|Ручная прокачка|Итоговые значения/i.test(note.textContent||''))note.remove();});
    }

    const equipCard=Array.from(root.querySelectorAll('.profile-card')).find(card=>Array.from(card.querySelectorAll('.section-title')).some(t=>['Экипировка','Снаряжение'].includes(t.textContent.trim())));
    if(equipCard){
      const originsHtml=equipCard.querySelector('[data-origins-v1052]')?.outerHTML||'';
      equipCard.classList.remove('inventory-profile-v113');
      equipCard.classList.add('inventory-profile-card-v1067','inventory-profile-v115');
      equipCard.innerHTML=inventoryCard(user)+originsHtml;
      UI.attachEntityLinks?.(equipCard);
    }
    UI.attachEntityLinks?.(root);
  }
  const renderProfileBase113=UI.renderProfile.bind(UI);UI.renderProfile=function(){const r=renderProfileBase113();renderProfile113();return r;};

  function inventoryPatchFields113(user){return{inventory:copy(user.inventory),equipmentSlots:copy(user.equipmentSlots),implantSlots:copy(user.implantSlots),installedImplantIds:copy(user.installedImplantIds),inventoryBaseSlots:user.inventoryBaseSlots,carryBase:user.carryBase,baseImplantSlots:user.baseImplantSlots,inventorySize:user.inventorySize,carryWeightMax:user.carryWeightMax,implantSlotCount:user.implantSlotCount};}
  function combatInventoryMode113(){return UI?.activeModuleId==='combat'||document.body.classList.contains('combat-stability-v108');}
  async function pushInventoryPatchSafe113(user,patch,options={}){
    return PlayerSync.pushPlayerPatch(String(user?.id||''),patch,options);
  }
  async function persistInventory(user,notice='Инвентарь обновлён'){const normalized=normalizePlayerProfileV2(user);App.state.users[normalized.id]=normalized;PLAYER_TEMPLATES[normalized.id]=copy(normalized);const patch=inventoryPatchFields113(normalized);return pushInventoryPatchSafe113(normalized,patch,{notice,rerender:true});}
  window.GRPGInventoryMenuV142?.bind({
    selector:'#profile-content [data-inv113-drag-grid],#profile-content [data-inv113-drag-slot]',
    current:()=>App.currentUser,item:inventoryItem,normalize:normalizePlayerProfileV2,layout,accepts:slotAccepts,
    commit:async(mutator,notice)=>{const user=copy(App.currentUser);mutator(user);return persistInventory(user,notice);}
  });
  let drag113=null;document.addEventListener('dragstart',e=>{const g=e.target.closest?.('[data-inv113-drag-grid]'),s=e.target.closest?.('[data-inv113-drag-slot]');if(!g&&!s)return;drag113=g?{source:'grid',itemId:g.dataset.itemId,unitIndex:i(g.dataset.unitIndex,-1)}:{source:'slot',itemId:s.dataset.itemId,slot:s.dataset.slotV113,index:i(s.dataset.slotIndexV113,-1)};e.dataTransfer.effectAllowed='move';});document.addEventListener('dragend',()=>drag113=null);
  document.addEventListener('dragover',e=>{if(drag113&&e.target.closest?.('[data-inv113-grid],[data-slot-v113]'))e.preventDefault();});
  document.addEventListener('drop',async e=>{if(!drag113)return;const slotNode=e.target.closest?.('[data-slot-v113]'),grid=e.target.closest?.('[data-inv113-grid]');if(!slotNode&&!grid)return;e.preventDefault();const user=normalizePlayerProfileV2(App.currentUser);if(!user)return;
    if(slotNode){const slot=slotNode.dataset.slotV113,index=i(slotNode.dataset.slotIndexV113,-1),item=inventoryItem(drag113.itemId);if(!slotAccepts(slot,item)){Toast.show('Этот предмет нельзя поместить в выбранный слот','info');drag113=null;return;}const owned=i(user.inventory.find(r=>r.itemId===item.id)?.qty,0),counts=equippedCounts(user),already=counts.get(item.id)||0;if(drag113.source!=='slot'&&owned<=already){Toast.show('Нет свободного экземпляра этого предмета','info');drag113=null;return;}const clone=copy(user);if(drag113.source==='slot')setSlot(clone,drag113.slot,drag113.index,'');setSlot(clone,slot,index,item.id);const check=postChangeValid(clone);if(!check.ok){Toast.show(check.reason,'err');drag113=null;return;}await persistInventory(check.user);drag113=null;return;}
    if(grid&&drag113.source==='slot'){const clone=copy(user);setSlot(clone,drag113.slot,drag113.index,'');const check=postChangeValid(clone);if(!check.ok){Toast.show(`Нельзя снять: ${check.reason}`,'err');drag113=null;return;}await persistInventory(check.user);drag113=null;return;}
    if(grid&&drag113.source==='grid'){const rect=grid.getBoundingClientRect(),x=Math.max(0,Math.min(4,Math.floor((e.clientX-rect.left)/(rect.width/5)))),rows=Math.max(1,Math.ceil(user.inventorySize/5)),y=Math.max(0,Math.min(rows-1,Math.floor((e.clientY-rect.top)/(rect.height/rows))));const clone=copy(user),row=clone.inventory.find(r=>r.itemId===drag113.itemId);if(row){row.positions=arr(row.positions);while(row.positions.length<row.qty)row.positions.push(null);row.positions[Math.max(0,drag113.unitIndex)]={x,y};}const l=layout(clone);if(l.overflow.length){Toast.show('Предмет не помещается в выбранную позицию','info');drag113=null;return;}await persistInventory(clone);drag113=null;}
  });

  document.addEventListener('click',async event=>{const btn=event.target.closest?.('[data-upgrade-stat-v113]');if(!btn)return;const key=String(btn.dataset.upgradeStatV113||'');if(!PRIMARY.includes(key)||key==='glory')return;const current=normalizePlayerProfileV2(App.currentUser);if(!current||String(current.role||'').toLowerCase()==='gm')return;const base=Math.max(0,n(current.abilityBase?.[key],0));if(base>=5)return;const level=Math.floor(base)+1,cost=level;if(n(current.skillPoints,0)<cost){Toast.show(`Для уровня ${level} требуется ${cost} очк. улучшения`,'info');return;}current.abilityBase={...(current.abilityBase||{}),[key]:level};current.skillPoints=Math.max(0,n(current.skillPoints)-cost);App.state.users[current.id]=normalizePlayerProfileV2(current);PLAYER_TEMPLATES[current.id]=copy(App.state.users[current.id]);await PlayerSync.pushPlayerPatch(current.id,{abilityBase:copy(current.abilityBase),abilities:copy(current.abilityBase),skillPoints:current.skillPoints},{notice:`${PRIMARY_LABELS[key]}: ${level} (−${cost} очк.)`,rerender:true});});

  /* NPC/player combat tokens always use Stats Engine */
  createPlayerCombatToken=function(playerId){const player=normalizePlayerProfileV2(App.state.users[playerId]||PLAYER_TEMPLATES[playerId]||{}),s=compute(player,{kind:'player'}),hit=weaponAttack(player,player.equipmentSlots?.primaryWeapon)||weaponAttack(player,player.equipmentSlots?.secondaryWeapon);return normalizeCombatToken({id:`token_player_${player.id}_${Date.now().toString(36)}`,type:'player',playerId:player.id,ownerId:player.id,name:player.displayName||player.id,image:player.image||'',x:0,y:0,hpCurrent:player.stats.hpCurrent,hpMax:s.values.maxHp,color:'#7df9ff',weaponId:hit?.weapon?.id||'',armorClass:s.values.armorClass,defense:s.values.defense,initiativeBonus:s.values.initiativeBonus,visionRange:s.values.vision,moveRange:s.values.movement});};
  createNpcCombatToken=function(npcId){const raw=Data.getNpc(npcId)||{id:npcId,name:npcId},npc=normalizeNpc(raw),s=compute(npc,{kind:'npc'}),weaponId=npc.equipmentSlots?.primaryWeapon||npc.equipmentSlots?.secondaryWeapon||'';return normalizeCombatToken({id:`token_npc_${npc.id}_${Date.now().toString(36)}`,type:'npc',npcId:npc.id,ownerId:'',name:npc.name||npc.id,image:npc.image||'',x:0,y:0,hpCurrent:Math.min(s.values.maxHp,Math.max(0,n(npc.stats?.hpCurrent,s.values.maxHp)||s.values.maxHp)),hpMax:s.values.maxHp,color:'#ff9f5d',weaponId,combatInventoryV120:copy(npc.inventory),armorClass:s.values.armorClass,defense:s.values.defense,initiativeBonus:s.values.initiativeBonus,visionRange:s.values.vision,moveRange:s.values.movement});};

  /* During scene stability mode, inventory is the one profile channel allowed to sync. */
  const saveBeforeInventorySync113=Persistence.save.bind(Persistence);let invHashes113=new Map(),invTimers113=new Map();function inventoryPatch113(user){return inventoryPatchFields113(user);}function isCombat113(){return combatInventoryMode113();}
  Persistence.save=async function(state){const result=await saveBeforeInventorySync113(state);if(isCombat113()&&!window.__grpgCombatCheckpointV120&&PlayerSync?.pushPlayerPatch){Object.values(state?.users||{}).forEach(raw=>{const user=normalizePlayerProfileV2(raw);if(!user.id)return;const patch=inventoryPatch113(user),hash=JSON.stringify(patch),prev=invHashes113.get(user.id);if(prev===hash)return;invHashes113.set(user.id,hash);clearTimeout(invTimers113.get(user.id));invTimers113.set(user.id,setTimeout(()=>{pushInventoryPatchSafe113(App.state?.users?.[user.id]||user,inventoryPatch113(App.state?.users?.[user.id]||user),{notice:null,rerender:false}).catch(err=>console.error('COMBAT_INVENTORY_SYNC_V113',err));},180));});}return result;};

  /* Inventory-only incoming channel during combat. World/profile polling stays frozen. */
  let inventoryPullSince113=null, inventoryPullBusy113=false, inventoryCombatWasActive113=false;
  async function pullInventoryOnly113(){
    if(inventoryPullBusy113||!isCombat113()||!Sync?.config?.enabled||!window.electronAPI?.pullPlayers)return;
    inventoryPullBusy113=true;
    try{
      const res=await window.electronAPI.pullPlayers({since:inventoryPullSince113,limit:500});
      if(!res?.ok)return;
      const rows=Array.isArray(res.rows)?res.rows:[];
      let changed=false,latest=inventoryPullSince113;
      for(const row of rows){
        const playerId=String(row.playerId||row.player_id||'').trim();if(!playerId||row.deletedAt||row.deleted_at)continue;
        const remote=row.player||row.player_json||{};const localUser=App.state?.users?.[playerId]||PLAYER_TEMPLATES?.[playerId];if(!localUser)continue;
        const keys=['inventory','equipmentSlots','implantSlots','installedImplantIds','inventoryBaseSlots','carryBase','baseImplantSlots','inventorySize','carryWeightMax','implantSlotCount'];
        const patch={};keys.forEach(k=>{if(remote[k]!==undefined)patch[k]=copy(remote[k]);});
        if(Object.keys(patch).length){PlayerSync.applyRemoteRow(row);const merged=App.state.users[playerId];if(merged)invHashes113.set(playerId,JSON.stringify(inventoryPatch113(merged)));changed=true;}
        const stamp=row.updatedAt||row.updated_at||null;if(stamp&&(!latest||new Date(stamp).getTime()>new Date(latest).getTime()))latest=stamp;
      }
      inventoryPullSince113=latest||inventoryPullSince113||new Date().toISOString();
      if(changed)await App.writeLocalMirrors();
    }catch(error){console.warn('COMBAT_INVENTORY_PULL_V113',error);}finally{inventoryPullBusy113=false;}
  }
  setInterval(()=>{const active=isCombat113();if(active&&!inventoryCombatWasActive113){inventoryPullSince113=null;invHashes113.clear();Object.values(App.state?.users||{}).forEach(raw=>{const u=normalizePlayerProfileV2(raw);if(u.id)invHashes113.set(u.id,JSON.stringify(inventoryPatch113(u)));});void pullInventoryOnly113();}else if(active)void pullInventoryOnly113();inventoryCombatWasActive113=active;},3000);
  window.GRPGCombatInventorySyncV113={pullNow:pullInventoryOnly113};

  // New entities use the new formula defaults; existing legacy entities preserve their former HP through hpBase migration.
  const createBlankBefore113=typeof createBlankEntity==='function'?createBlankEntity:null;
  if(createBlankBefore113)createBlankEntity=function(type){const entity=createBlankBefore113(type);if(type==='players'||type==='npcs'){entity.baseStats={...(entity.baseStats||{}),hpBase:1,movement:6,vision:6,armorClass:0,defense:0,initiative:0,inventorySlots:type==='players'?12:Math.max(0,i(entity.inventorySize,12)),carryBase:12,implantSlots:Math.max(0,i(entity.implantSlotCount,0))};entity.abilityBase=normalizedBaseAbilities(entity);if(type==='players')return normalizePlayerProfileV2(entity);return normalizeNpc(entity);}return entity;};

  // First-pass migration of NPCs in memory.
  try { Object.entries(NPCS||{}).forEach(([id,npc])=>{NPCS[id]=normalizeNpc(npc);}); Data.npcs=NPCS; } catch {}
  document.addEventListener('DOMContentLoaded',()=>{try{ensureBackpackTab();}catch{}},{once:true});
})();
