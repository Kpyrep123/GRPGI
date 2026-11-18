/* Inventory rows retain their template ID and quantity. Tracked copies are parallel to positions. */
(function (root) {
  'use strict';

  const slots = ['primaryWeapon', 'secondaryWeapon', 'armor', 'backpack'];
  const trackedTypes = ['modification','weapon', 'armor', 'backpack', 'drone', 'turret', 'shield', 'implant'];
  const list = value => Array.isArray(value) ? value : [];
  const count = value => Math.max(0, Math.trunc(Number(value) || 0));
  const clone = value => JSON.parse(JSON.stringify(value));
  const slotKey = (slot, index) => slot === 'implant' ? 'implant:' + index : slot;
  const legacyId = (owner, itemId, index) =>
    'legacy:' + [owner, itemId, index].map(value => encodeURIComponent(value)).join(':');

  function tracked(item) {
    return !!item && (trackedTypes.includes(String(item.type || item.category).toLowerCase())
      || hasEnergyShield(item) || count(item.durabilityMax ?? item.maxDurability) > 0 || count(item.chargesMax ?? item.maxCharges) > 0);
  }

  function equipment(profile) {
    const loadout = profile.equipmentSlots || {};
    return [
      ...slots.map(slot => [slot, loadout[slot] || (slot === 'primaryWeapon' ? loadout.weapon : '')]),
      ...list(profile.implantSlots || profile.installedImplantIds).map((id, index) => [slotKey('implant', index), id])
    ].filter(([, id]) => id);
  }

  function typeBonusDamage(roll,item){
    const types=root.GRPGDamageTypesV202;
    if(!types||item?.type!=='weapon'||!list(roll?.effects).some(id=>/^weapon-5-[1-3]$/.test(id)))return roll;
    const override=list(roll.effects).map(id=>/^weapon-6-([1-5])$/.exec(id)).find(Boolean);
    const type=override?types.aberrationTypeIds[Number(override[1])-1]:types.effective(item);
    return {...roll,effects:roll.effects.map(id=>/^weapon-5-[1-3]$/.test(id)?id+':'+type:id)};
  }

  function updateResources(copy, item) {
    if (!item) return copy;
    if(copy.aberration252)copy.aberration252=typeBonusDamage(copy.aberration252,item);
    const baseDurability = count(item.durabilityMax ?? item.maxDurability);
    const durabilityMax = Math.ceil(baseDurability*(100+effectValue(copy,'armor-21'))/100);
    const chargesMax = count(item.chargesMax ?? item.maxCharges);
    let pendingWear = count(copy.pendingWear197);
    if (!durabilityMax && copy.durabilityMax > 0) pendingWear += Math.max(0, copy.durabilityMax - copy.durability);
    const durability = durabilityMax > 0
      ? Math.max(0, Math.min(durabilityMax, copy.durabilityMax === 0
        ? durabilityMax - pendingWear : Number(copy.durability ?? durabilityMax) || 0))
      : 0;
    Object.assign(copy, {
      durabilityMax, durability, chargesMax,
      charges: Math.min(chargesMax, count(copy.chargesMax === 0 ? chargesMax : copy.charges ?? chargesMax)),
      pendingWear197: durabilityMax ? 0 : pendingWear,
      broken: copy.broken === true || (durabilityMax > 0 && durability === 0)
    });
    return copy;
  }

  function arrange(row, bindings) {
    const positions = list(row.positions);
    const pairs = row.instancesV215.map((copy, index) => ({copy, position: positions[index] ?? null}));
    const bound = new Set();
    for (const {copy} of pairs) {
      if (!bindings.includes(copy.slot) || bound.has(copy.slot)) delete copy.slot;
      else bound.add(copy.slot);
    }
    for (const slot of bindings) {
      if (bound.has(slot)) continue;
      const free = pairs.find(({copy}) => !copy.slot);
      if (free) free.copy.slot = slot;
    }
    // Inventory layouts already hide the first N units of the equipped template.
    const rank = copy => copy.slot ? bindings.indexOf(copy.slot) : bindings.length;
    pairs.sort((a, b) => rank(a.copy) - rank(b.copy));
    row.instancesV215 = pairs.map(pair => pair.copy);
    row.positions = pairs.map(pair => pair.position);
  }

  function normalize(profile, lookup, createId) {
    const bindings = equipment(profile);
    const legacy = profile.itemStateV138;
    const used = new Set();
    for (const row of list(profile.inventory)) {
      const item = lookup(row.itemId);
      if (!tracked(item) && !Array.isArray(row.instancesV215)) continue;
      const prior = list(row.instancesV215);
      const copies = [];
      for (let index = 0; index < count(row.qty); index++) {
        const source = prior[index];
        let id = String(source?.id || '');
        if (!id || used.has(id)) id = createId ? createId() : legacyId(profile.id || '', row.itemId, index);
        while (used.has(id)) id += ':copy';
        used.add(id);
        const copy = {...source, id};
        if (item?.type === 'weapon') copy.rarity = copy.aberration252?.rarity || 'обычный';
        else if (copy.rarity == null && item?.rarity) copy.rarity = item.rarity;
        copy.modifiers = list(copy.modifiers);
        copies.push(copy);
      }
      row.instancesV215 = copies;
      arrange(row, bindings.filter(([, id]) => id === row.itemId).map(([slot]) => slot));
      const old = legacy && Object.prototype.hasOwnProperty.call(legacy, row.itemId) ? legacy[row.itemId] : null;
      if (old && copies.length) {
        const copy = (old.slot && copies.find(value => value.slot === old.slot))
          || copies.find(value => value.slot) || copies[0];
        if (copy.durabilityMax == null && copy.chargesMax == null) {
          const {durability, durabilityMax, charges, chargesMax, broken, pendingWear197} = old;
          Object.assign(copy, {durability, durabilityMax, charges, chargesMax, broken, pendingWear197});
        }
        delete legacy[row.itemId];
      }
      for (const copy of copies) updateResources(copy, item);
    }
    return profile;
  }

  // Older transaction handlers change qty and positions without knowing about copies.
  function reconcile(previous, profile, lookup, createId) {
    const before = normalize(clone(previous), lookup);
    for (const row of list(profile.inventory)) {
      const old = list(before.inventory).find(value => value.itemId === row.itemId);
      if (!old?.instancesV215) continue;
      const submitted = list(row.instancesV215);
      const oldIds = old.instancesV215.map(copy => copy.id);
      const unchangedCopies = submitted.length === 0
        || (submitted.length === oldIds.length && submitted.every((copy, i) => copy.id === oldIds[i]));
      if (!unchangedCopies) continue;
      const copies = clone(submitted.length ? submitted : old.instancesV215);
      const qty = count(row.qty);
      if (qty === oldIds.length - 1) {
        const positions = list(old.positions);
        const nextPositions = Array.from({length:qty}, (_, i) => list(row.positions)[i] ?? null);
        // A drag sale can remove a middle grid cell. An unplaced stack uses the last copy.
        const removed = nextPositions.findIndex((position, index) =>
          JSON.stringify(position) !== JSON.stringify(positions[index]));
        const candidate = removed < 0 ? copies.length - 1 : removed;
        const matches = positions.filter((_, index) => index !== candidate);
        copies.splice(JSON.stringify(matches) === JSON.stringify(nextPositions) ? candidate : copies.length - 1, 1);
      }
      row.instancesV215 = copies.slice(0, qty);
    }
    return normalize(profile, lookup, createId);
  }

  function instance(profile, itemId, index = -1, slot = '') {
    const copies = list(list(profile?.inventory).find(row => row.itemId === itemId)?.instancesV215);
    if (slot) return copies.find(copy => copy.slot === slot) || null;
    if (Number.isInteger(index) && index >= 0) return copies[index] || null;
    return copies.find(copy => copy.slot) || copies[0] || null;
  }

  function choose(profile, drag) {
    return instance(profile, drag.itemId, drag.unitIndex,
      drag.source === 'slot' ? slotKey(drag.slotType || drag.slot, drag.slotIndex ?? drag.index) : '')?.id || '';
  }

  function bind(profile, itemId, slot, preferredId) {
    if (!preferredId) return;
    const copies = list(list(profile.inventory).find(row => row.itemId === itemId)?.instancesV215);
    const selected = copies.find(copy => copy.id === preferredId);
    if (!selected) return;
    for (const copy of copies) if (copy.slot === slot) delete copy.slot;
    selected.slot = slot;
  }

  function remove(row, index) {
    if (Array.isArray(row.instancesV215)) row.instancesV215.splice(index, 1);
    if (Array.isArray(row.positions)) row.positions.splice(index, 1);
    row.qty = Math.max(0, count(row.qty) - 1);
  }

  function add(row, qty, item, createId) {
    const previousQty = count(row.qty);
    row.qty = previousQty + count(qty);
    if (!tracked(item) && !Array.isArray(row.instancesV215)) return;
    row.instancesV215 ||= [];
    for (let i = previousQty; i < row.qty; i++) {
      row.instancesV215[i] = updateResources({id:createId(), rarity:item?.type === 'weapon' ? 'обычный' : item?.rarity || '', modifiers:[]}, item);
    }
  }

  function repair(copy, item, value) {
    updateResources(copy, item);
    if (copy.durabilityMax > 0 && copy.durability === 0) {
      throw Error('Уничтоженный экземпляр нельзя ремонтировать');
    }
    const durability = Number(value);
    if (!copy.durabilityMax || !Number.isInteger(durability) || durability < 0 || durability > copy.durabilityMax) {
      throw Error('Укажите целую прочность от 0 до ' + copy.durabilityMax);
    }
    copy.durability = durability;
    copy.broken = durability === 0;
    copy.pendingWear197 = 0;
    return copy;
  }

  function chargeBadge(profile, itemId, index = -1, slot = '') {
    const copy = instance(profile, itemId, index, slot);
    if (!copy?.chargesMax) return '';
    const value = count(copy.charges) + '/' + count(copy.chargesMax);
    return '<span class="inventory-charge-count" title="Заряды" aria-label="Заряды ' + value + '">' + value + '</span>';
  }

  function inventoryBadges(profile, itemId, index = -1, slot = '', overrides) {
    const copy=instance(profile,itemId,index,slot);
    const rarity = copy?.aberration252?.rarity;
    const names={uncommon:'Необычное',rare:'Редкое',epic:'Эпическое',legendary:'Легендарное'};
    const badge=Object.prototype.hasOwnProperty.call(names,rarity)
      ? '<i class="inventory-rarity-glint" data-rarity="'+rarity+'" title="'+names[rarity]+'" aria-label="'+names[rarity]+'"></i>' : '';
    return chargeBadge(profile,itemId,index,slot)+badge
      +(root.GRPGAberrationPresentation?.hoverMarker(copy,overrides)||'');
  }

  function mounts(item) {
    if (!['weapon','shield','armor','backpack'].includes(item?.type)) return [];
    return list(item.mounts).map(value => String(value).trim()).filter(Boolean);
  }

  function installed(copy, index) {
    return list(copy?.attachments).find(row => row.mount === index);
  }

  function changeAttachment(profile, host, index, item, attachmentId, hostItem) {
    if (!host) throw Error('Экземпляр недоступен');
    const existing = installed(host,index);
    if (!item) {
      if (!existing) throw Error('Крепление уже свободно');
      let row = profile.inventory.find(entry => entry.itemId === existing.itemId);
      if (!row) { row={itemId:existing.itemId,qty:0,positions:[],instancesV215:[]};profile.inventory.push(row); }
      row.qty++;
      (row.positions ||= []).push(null);
      (row.instancesV215 ||= []).push(clone(existing.copy));
      host.attachments=host.attachments.filter(entry=>entry!==existing);
      return;
    }
    if (host.broken || host.durabilityMax > 0 && host.durability === 0) throw Error('Экземпляр недоступен');
    const mount=mounts(hostItem)[index];
    if(item.type!=='modification'||!mount||mount.toLowerCase()!==String(item.attachmentMount||'').trim().toLowerCase()){
      throw Error('Модификация не подходит к креплению');
    }
    if (existing) throw Error('Крепление уже занято');
    const row=profile.inventory.find(entry=>entry.itemId===item.id);
    const unit=row?.instancesV215?.findIndex(copy=>copy.id===attachmentId)??-1;
    if (unit<0) throw Error('Модификация отсутствует в инвентаре');
    const copy=clone(row.instancesV215[unit]);
    remove(row,unit);
    if (!row.qty) profile.inventory=profile.inventory.filter(entry=>entry!==row);
    (host.attachments ||= []).push({mount:index,itemId:item.id,copy,hitBonus:Number(item.attachmentHitBonus)||0,modifiers:clone(list(item.modifiers))});
  }

  function attachmentHitBonus(copy) {
    return list(copy?.attachments).reduce((sum,row)=>sum+(Number(row.hitBonus)||0),0);
  }

  const massPercents = Object.freeze([30,20,10,-10,-20,-30]);
  const six = Object.freeze([-3,-2,-1,1,2,3]);
  const four = Object.freeze([-2,-1,1,2]);
  const passive = Object.freeze({
    'armor-18':['armor_class',six], 'armor-19':['defense',four],
    'armor-21':['',[-30,-20,-10,10,20,30]], 'armor-22':['',massPercents],
    'armor-23':['carry_capacity',six], 'armor-24':['movement',four],
    'shield-29':['shield_capacity',six], 'shield-31':['',massPercents], 'shield-32':['movement',four],
    'backpack-38':['inventory_slots',six], 'backpack-39':['carry_capacity',six],
    'backpack-40':['',massPercents], 'backpack-42':['movement',four],
    'implant-47':['max_hp',six], 'implant-50':['vision',[-4,-2,2,4]],
    'implant-51':['movement',four], 'implant-52':['drone_actions',[-1,1,2]]
  });

  function aberrationCategory(item) {
    const type=String(item?.type||'').toLowerCase();
    if(item?.textOnlyInventory||item?.legacyTextOnlyInventoryV131)return '';
    return ['weapon','armor','shield','backpack','implant'].includes(type)?type:'';
  }

  function hasEnergyShield(item) {
    return !item?.textOnlyInventory && !item?.legacyTextOnlyInventoryV131
      && list(item?.modifiers).some(mod=>mod?.target==='shield_capacity' && mod.enabled!==false);
  }

  function canRollAberration(item, category) {
    return category==='shield' ? hasEnergyShield(item) : Boolean(category) && aberrationCategory(item)===category;
  }

  function passiveEffect(id) {
    const match=/^([a-z]+-\d+)-([1-6])$/.exec(id);
    const row=match&&passive[match[1]];
    const value=row?.[1][Number(match[2])-1];
    return value===undefined?null:{group:match[1],target:row[0],value};
  }

  function effectValue(copy,group) {
    return list(copy?.aberration252?.effects).map(passiveEffect).find(effect=>effect?.group===group)?.value||0;
  }

  function equippedAberrationModifiers(copy,item) {
    const category=aberrationCategory(item);
    if(copy?.broken)return [];
    return list(copy?.aberration252?.effects).map(passiveEffect)
      .filter(effect=>effect?.target&&(effect.group.startsWith(category+'-')&&effect.target!=='shield_capacity'||canRollAberration(item,effect.group.split('-')[0])))
      .map(({target,value})=>({target,value,op:'add',scope:'global',condition:'always',enabled:true,
        priority:0,sourceName:(item.name||item.id)+' · аберрация'}));
  }

  function storeAberration(copy,item,roll) {
    if(!copy||!roll)return;
    copy.aberration252=typeBonusDamage(clone(roll),item);
    copy.rarity=roll.rarity==='common'?'обычный':roll.rarity;
    if(effectValue(copy,'armor-21')){
      copy.durabilityMax=0;
      copy.durability=undefined;
      updateResources(copy,item);
    }
  }

  function massPercent(effects) {
    return list(effects).reduce((sum,id)=>{
      const match = /^(?:weapon-7|armor-22|shield-31|backpack-40)-([1-6])$/.exec(id);
      return match ? sum+massPercents[Number(match[1])-1] : sum;
    },0);
  }
  function inventoryRowMass(row, baseMass, quantity = row.qty) {
    const count = Math.max(0, Math.trunc(Number(quantity)||0));
    const percent = list(row.instancesV215).slice(0,count).reduce(
      (sum,copy)=>sum+massPercent(copy?.aberration252?.effects),0
    );
    return baseMass*(100*count+percent)/100;
  }

  const api = {typeBonusDamage,aberrationCategory,hasEnergyShield,canRollAberration,passiveEffect,equippedAberrationModifiers,storeAberration,massPercent,inventoryRowMass,mounts, installed, changeAttachment, attachmentHitBonus,inventoryBadges,chargeBadge, tracked, normalize, reconcile, instance, choose, bind, remove, add, repair, updateResources, slotKey, clone};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GRPGItemInstancesV215 = api;
})(typeof window === 'undefined' ? globalThis : window);
