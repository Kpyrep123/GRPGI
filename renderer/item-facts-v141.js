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
    defense:'Защита', initiative_bonus:'Инициатива', movement:'Движение', vision:'Обзор',
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
      if(value==null||value==='')return;
      if(kind==='property'&&excluded.has(label.toLowerCase()))return;
      result.push({label,value:String(value),kind});
    };
    const field=(label,keys,formatter=number,kind='property')=>{
      const key=first(item,keys);if(key)add(label,formatter(item[key]),kind);
    };
    if(options.includeBase!==false){
      add('Тип',categories[type]||pretty(type));
      field('Редкость',['rarity'],String);
      const w=first(item,['inventoryWidth']),h=first(item,['inventoryHeight']);
      if(w&&h)add('Размер',`${number(item[w])}×${number(item[h])}`);
      field('Масса',['mass','weight']);
    }
    if(['weapon','grenade','turret','drone'].includes(type))field('Урон',['damage'],String);
    if(['weapon','turret','drone'].includes(type)){
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
  function pills(item,options){return facts(item,options).map(row=>
    `<span class="pill item-fact-v141 ${row.kind==='modifier'?'item-modifier-v141':''}"><b>${escape(row.label)}:</b> ${escape(row.value)}</span>`).join('');}
  function table(item,options){const rows=facts(item,options);return rows.length
    ? `<div class="archive-equipment-facts-v131 item-facts-v141">${rows.map(row=>`<div class="${row.kind==='modifier'?'item-modifier-v141':''}"><span>${escape(row.label)}</span><b>${escape(row.value)}</b></div>`).join('')}</div>` : '';}
  return Object.freeze({facts,pills,table});
});
