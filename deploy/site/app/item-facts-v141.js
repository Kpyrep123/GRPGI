/* GRPGI v1.0.141 — a single item fact renderer for desktop and web. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GRPGItemFactsV141 = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';
  const names = {
    strength:'Сила', dexterity:'Ловкость', endurance:'Выносливость', intelligence:'Интеллект',
    will:'Воля', glory:'Слава', max_hp:'Максимальное HP', armor_class:'Класс брони',
    defense:'Защита', shield_capacity:'Ёмкость энергетического щита', initiative_bonus:'Инициатива', movement:'Движение', vision:'Обзор',
    inventory_slots:'Ячейки инвентаря', carry_capacity:'Переносимый вес',
    implant_slots:'Слоты имплантов', social_bonus:'Социальный бонус', attack_bonus:'Попадание',
    damage_bonus:'Урон', weapon_hit_stat:'Характеристика попадания',
    weapon_hit_extra_stat:'Дополнительная характеристика попадания'
  };
  const categories = {
    weapon:'Оружие', armor:'Броня', implant:'Имплант', backpack:'Рюкзак', ammo:'Патроны',
    grenade:'Граната', turret:'Турель', drone:'Дрон', gear:'Снаряжение', stock:'Акция'
  };
  const scopes = {weapon_category:'для категории оружия',weapon_id:'для конкретного оружия'};
  const conditions = {
    in_combat:'в боевой сцене', has_skill:'при наличии навыка',
    item_equipped:'когда предмет экипирован', hp_below_percent:'при низком HP',
    incoming_weapon_category:'против категории оружия'
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
  const pretty = value => String(value ?? '').replace(/_/g,' ').trim();
  const number = value => Number.isFinite(Number(value)) ? String(Number(value)) : String(value ?? '');
  const signed = value => Number.isFinite(Number(value))
    ? `${Number(value) >= 0 ? '+' : ''}${Number(value)}` : String(value ?? '—');
  const first = (object, keys) => keys.find(key => own(object,key) && object[key] != null && object[key] !== '');

  function facts(item = {}, options = {}) {
    const type=String(item.type||'gear').toLowerCase(), result=[];
    const mods=(Array.isArray(item.modifiers)?item.modifiers:[]).filter(mod=>mod && mod.target && mod.enabled!==false);
    const hasMod=target=>mods.some(mod=>mod.target===target);
    const excluded=new Set((options.excludeLabels||[]).map(value=>String(value).split(':')[0].trim().toLowerCase()));
    const add=(label,value,kind='property')=>{
      if(value==null||value===''||(kind==='property'&&Number(value)===0))return;
      if(kind==='property'&&excluded.has(label.toLowerCase()))return;
      result.push({label,value:String(value),kind});
    };
    const field=(label,keys,formatter=number,kind='property')=>{
      const key=first(item,keys);if(key&&Number(item[key])!==0)add(label,formatter(item[key]),kind);
    };
    if(options.includeBase!==false){
      add('Тип',categories[type]||pretty(type));
      field('Редкость',['rarity'],String);
      const w=first(item,['inventoryWidth']),h=first(item,['inventoryHeight']);
      if(w&&h)add('Размер',`${number(item[w])}×${number(item[h])}`);
      field('Масса',['mass','weight']);
    }
    if(['weapon','grenade','turret','drone'].includes(type)){field('Урон',['damage'],String);const types=globalThis.GRPGDamageTypesV202;if(types)add('Тип урона',types.label(types.effective(item)));}
    if(type==='ammo'&&globalThis.GRPGDamageTypesV202?.normalize(item.damageType))add('Тип урона',globalThis.GRPGDamageTypesV202.label(item.damageType));
    if(['weapon','turret','drone'].includes(type)){
      const handling=globalThis.GRPGWeaponHandlingV203;if(handling)add('Базовая характеристика попадания',handling.statLabels[handling.stat(item)]+(handling.category(item)==='drone'?' оператора':''));
      field(hasMod('attack_bonus')?'Базовое попадание':'Попадание',['hitBonus','attackBonus'],signed);
      field('Дальность',['range','attackRange'],value=>`${number(value)} гекс.`);
      field('Скорострельность',['rapidFireShots','burstShots'],value=>`${number(value)} выстр./действие`);
    }
    if(type==='weapon'){
      field('Слот оружия',['weaponSlot'],value=>({primary:'Основной',secondary:'Дополнительный',versatile:'Универсальный'}[value]||pretty(value)));
      field('Магазин',['magazineSize','clipSize']);
      field('Патронов за выстрел',['ammoPerShot','roundsPerShot']);
      field('Оружейный навык',['weaponSkillId'],String);
      field('Бонус навыка к попаданию',['weaponSkillBonus'],signed);
    }
    if(type==='grenade'){
      field('Дальность броска',['grenadeRange','throwRange'],value=>`${number(value)} гекс.`);
      field('Радиус поражения',['grenadeRadius','blastRadius'],value=>`${number(value)} гекс.`);
    }
    if(['turret','drone'].includes(type)){
      field('HP',['unitHp']);field('Класс брони юнита',['unitArmorClass']);
      field('Обзор юнита',['unitVisionRange'],value=>`${number(value)} гекс.`);
      field('Движение юнита',['unitMoveRange'],value=>`${number(value)} гекс.`);
      field('Инициатива юнита',['unitInitiative'],signed);
    }
    if(type==='armor'){
      const armor=first(item,['armorClass']);
      if(armor&&(!hasMod('armor_class')||Number(item[armor])!==0))
        add(hasMod('armor_class')?'Базовый класс брони':'Класс брони',number(item[armor]));
      const defense=first(item,['damageReduction','defense']);
      if(defense&&(!hasMod('defense')||Number(item[defense])!==0))
        add(hasMod('defense')?'Базовая защита':'Защита',number(item[defense]));
      field('Тип брони',['armorWeightClass'],value=>value==='heavy'?'Тяжёлая':value==='light'?'Лёгкая':pretty(value));
      field('Защита щита',['shieldCoverBonus'],signed);
      field('Предел Ловкости щита',['shieldDexterityCap']);
    }
    if(type==='implant')field('Требуемая энергия',['energyRequired','requiredEnergy']);
    if(type==='ammo'||type==='weapon')field('Калибр',['ammoFamily','caliber'],String);
    field('Максимальная прочность',['durabilityMax','maxDurability'],value=>Number(value)>0?number(value):'');
    field('Максимум зарядов',['chargesMax','maxCharges'],value=>Number(value)>0?number(value):'');
    mods.forEach(mod=>{
      if((mod.op||'add')==='add'&&own(mod,'value')&&Number(mod.value)===0)return;
      const label=names[mod.target]||pretty(mod.target)||'Модификатор';
      let value;
      switch(String(mod.op||'add')){
        case 'set':value=`установить ${number(mod.value??0)}`;break;
        case 'replace_stat':value=`использовать «${names[mod.statRef]||pretty(mod.statRef)||'характеристику'}»`;break;
        case 'add_stat':value=`добавить «${names[mod.statRef]||pretty(mod.statRef)||'характеристику'}»`;break;
        case 'add':value=own(mod,'value')?signed(mod.value):'—';break;
        default:value=`${pretty(mod.op)} ${own(mod,'value')?number(mod.value):'—'}`;
      }
      if(mod.scope && mod.scope!=='global')value+=` · ${scopes[mod.scope]||pretty(mod.scope)}${mod.scopeValue?` «${mod.scopeValue}»`:''}`;
      if(mod.condition && mod.condition!=='always')value+=` · ${conditions[mod.condition]||pretty(mod.condition)}${mod.conditionValue?` «${mod.conditionValue}»`:''}`;
      add(label,value,'modifier');
    });
    return result;
  }
  function instanceFacts(item,copy,profile,overrides){
    const rows=facts(item);
    const copies=globalThis.GRPGItemInstancesV215;
    const effects=globalThis.GRPGAberrationPresentation?.effectData(copy,overrides)||[];
    const change=(label,value,delta,lowerIsBetter=false)=>{
      const row=rows.find(row=>row.label===label);
      const tone=delta===0?'':(delta<0)!==lowerIsBetter?'negative':'green';
      const next={label,value:String(value),kind:'property',tone};
      if(row)Object.assign(row,next);
      else rows.push(next);
    };
    const delta=group=>effects.find(row=>row.group===group)?.value||0;
    const massDelta=copies?.massPercent(copy?.aberration252?.effects)||0;
    if(massDelta)change('Масса',copies.inventoryRowMass({qty:1,instancesV215:[copy]},Number(item.mass??item.weight??0)),massDelta,true);
    const hit=delta('weapon-1');
    if(hit)change(rows.some(row=>row.label==='Базовое попадание')?'Базовое попадание':'Попадание',signed(Number(item.hitBonus??item.attackBonus??0)+hit),hit);
    const damage=delta('weapon-2');
    if(damage){
      const base=String(item.damage??'0').trim();
      const adjusted=Number.isFinite(Number(base))?Math.max(0,Number(base)+damage):`${base} ${signed(damage)}`;
      change('Урон',adjusted,damage);
      change('Урон после первого выстрела',base,0);
    }
    const dice=effects.find(row=>row.group==='weapon-5');
    if(dice)change('Дополнительный урон',`1d${dice.value} · ${dice.type?globalThis.GRPGDamageTypesV202.label(dice.type):'тип основного урона'}`,1);
    const type=effects.find(row=>row.group==='weapon-6');
    if(type){
      const damageTypes=globalThis.GRPGDamageTypesV202;
      change('Тип урона',damageTypes.label(type.value||type.type),0);
      rows.find(row=>row.label==='Тип урона').tone='violet';
    }
    const range=delta('weapon-9')+delta('weapon-10');
    if(range)change('Дальность',number(Math.max(0,Number(item.range??item.attackRange??0)+range))+' гекс.',range);
    const critical=delta('weapon-3');
    if(critical)change('Диапазон крита',critical<0?'Только суперкрит':`${20-critical}–20`,critical);
    const criticalDamage=delta('weapon-4');
    if(criticalDamage)change('Дополнительный урон крита','+'+Math.max(0,1+criticalDamage),criticalDamage);

    const baseMagazine=Math.max(0,Math.trunc(Number(item.magazineSize??item.clipSize)||0));
    const magazineBonus=delta('weapon-8');
    if(item.type==='weapon'&&baseMagazine){
      const max=Math.max(1,baseMagazine+magazineBonus);
      const stored=profile?.weaponMagazines?.[item.id];
      const initial=item.ammoTypeId||item.ammunitionId?max:0;
      const loaded=Math.max(0,Math.min(max,Number(stored?.loaded??initial)||0));
      change('Магазин',`${loaded} / ${max}`,magazineBonus);
    }

    if(copy?.durabilityMax||copy?.broken){
      change('Прочность',copy.durabilityMax?`${copy.durability}${copy.broken?' · Сломан':''}`:'Сломан',0);
      if(copy.durabilityMax)change('Максимальная прочность',copy.durabilityMax,copy.durabilityMax-Number(item.durabilityMax??item.maxDurability??0));
    }
    const adjustedModifiers=new Map();
    for(const id of copy?.aberration252?.effects||[]){
      const effect=copies?.passiveEffect(id);
      if(effect?.target)adjustedModifiers.set(effect.target,(adjustedModifiers.get(effect.target)||0)+effect.value);
    }
    for(const [target,bonus] of adjustedModifiers){
      if(!bonus)continue;
      const label=names[target]||pretty(target);
      const baseFields={armor_class:item.armorClass,defense:item.damageReduction??item.defense};
      const modifiers=(item.modifiers||[]).filter(mod=>mod.target===target&&mod.enabled!==false);
      if(modifiers.some(mod=>mod.scope&&mod.scope!=='global'||mod.condition&&mod.condition!=='always'||mod.op&&!['add','set'].includes(mod.op))){
        change(label+' от аберрации',signed(bonus),bonus);
        continue;
      }
      const base=modifiers.length?0:Number(baseFields[target])||0;
      const total=mods=>mods.sort((a,b)=>Number(a.priority||0)-Number(b.priority||0))
        .reduce((value,mod)=>mod.op==='set'?Number(mod.value)||0:value+(Number(mod.value)||0),base);
      const value=total([...modifiers,{op:'add',value:bonus,priority:0}]);
      const without=total(modifiers);
      for(let index=rows.length-1;index>=0;index--){
        if(rows[index].label===label||rows[index].label===`Базов${target==='defense'?'ая':'ый'} ${label.toLowerCase()}`)rows.splice(index,1);
      }
      change(label,target==='shield_capacity'?Math.max(0,value):signed(value),value-without);
    }
    return rows;
  }
  function pills(item,options){return facts(item,options).map(row=>
    `<span class="pill item-fact-v141 ${row.kind==='modifier'?'item-modifier-v141':''}"><b>${escape(row.label)}:</b> ${escape(row.value)}</span>`).join('');}
  function table(item,options){const rows=options?.profile?instanceFacts(item,options.instance,options.profile,options.overrides):facts(item,options);return rows.length
    ? `<div class="archive-equipment-facts-v131 item-facts-v141">${rows.map(row=>`<div class="${row.kind==='modifier'?'item-modifier-v141':''}"><span>${escape(row.label)}</span><b${row.tone?` data-effect-tone="${escape(row.tone)}"`: ''}>${escape(row.value)}</b></div>`).join('')}</div>` : '';}
  function description(item, fallback='Описание предмета не задано.') {
    const text=String((typeof item==='string'?item:item?.desc||item?.description||item?.summary)||fallback);
    if(!text.trim())return '';
    // Reuse the same formatting allowlist as skill descriptions. Never insert raw HTML.
    const rich=globalThis.GRPGSkillCatalogV176?.rich;
    const content=typeof rich==='function'?rich(text):'<p>'+escape(text).replace(/\r\n/g,'\n').split(/\n\s*\n/).join('</p><p>').replace(/\n/g,'<br>')+'</p>';
    return `<div class="item-rich-description-v201 sc-rich176">${content}</div>`;
  }
  return Object.freeze({facts,instanceFacts,pills,table,description});
});
