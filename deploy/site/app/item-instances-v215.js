/* Inventory rows retain their template ID and quantity. Tracked copies are parallel to positions. */
(function (root) {
  'use strict';

  const slots = ['primaryWeapon', 'secondaryWeapon', 'armor', 'backpack'];
  const trackedTypes = ['weapon', 'armor', 'backpack', 'drone', 'turret', 'shield'];
  const list = value => Array.isArray(value) ? value : [];
  const count = value => Math.max(0, Math.trunc(Number(value) || 0));
  const clone = value => JSON.parse(JSON.stringify(value));
  const slotKey = (slot, index) => slot === 'implant' ? 'implant:' + index : slot;
  const legacyId = (owner, itemId, index) =>
    'legacy:' + [owner, itemId, index].map(value => encodeURIComponent(value)).join(':');

  function tracked(item) {
    return !!item && (trackedTypes.includes(String(item.type || item.category).toLowerCase())
      || count(item.durabilityMax ?? item.maxDurability) > 0 || count(item.chargesMax ?? item.maxCharges) > 0);
  }

  function equipment(profile) {
    const loadout = profile.equipmentSlots || {};
    return [
      ...slots.map(slot => [slot, loadout[slot] || (slot === 'primaryWeapon' ? loadout.weapon : '')]),
      ...list(profile.implantSlots || profile.installedImplantIds).map((id, index) => [slotKey('implant', index), id])
    ].filter(([, id]) => id);
  }

  function updateResources(copy, item) {
    if (!item) return copy;
    const durabilityMax = count(item.durabilityMax ?? item.maxDurability);
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
        if (copy.rarity == null && item?.rarity) copy.rarity = item.rarity;
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
      row.instancesV215[i] = updateResources({id:createId(), rarity:item?.rarity || '', modifiers:[]}, item);
    }
  }

  function repair(copy, item, value) {
    updateResources(copy, item);
    const durability = Number(value);
    if (!copy.durabilityMax || !Number.isInteger(durability) || durability < 0 || durability > copy.durabilityMax) {
      throw Error('Укажите целую прочность от 0 до ' + copy.durabilityMax);
    }
    copy.durability = durability;
    copy.broken = durability === 0;
    copy.pendingWear197 = 0;
    return copy;
  }

  const api = {tracked, normalize, reconcile, instance, choose, bind, remove, add, repair, updateResources, slotKey, clone};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GRPGItemInstancesV215 = api;
})(typeof window === 'undefined' ? globalThis : window);
