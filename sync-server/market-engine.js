'use strict';

const crypto = require('crypto');

const SELL_RATE = 0.7;

function deep(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function int(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function hash32(value) {
  const text = String(value ?? '');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function unit(seed) {
  return hash32(seed) / 0x100000000;
}

function rotationKey(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) return rotationKey(new Date());
  return date.toISOString().slice(0, 10);
}

function nextRotationAt(now = new Date()) {
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(date.getTime())) return nextRotationAt(new Date());
  date.setUTCHours(24, 0, 0, 0);
  return date.toISOString();
}

function isUnique(item = {}, config = {}) {
  const rarity = String(item.rarity || item.quality || '').trim().toLowerCase();
  return config.unique === true || item.unique === true || rarity === 'уникальный' || rarity === 'unique';
}

function normalizeEntry(entry = {}, item = {}) {
  const legacyPrice = Math.max(0, int(entry.price, 0));
  let minPrice = Math.max(0, int(entry.minPrice ?? entry.priceMin ?? legacyPrice, legacyPrice));
  let maxPrice = Math.max(0, int(entry.maxPrice ?? entry.priceMax ?? legacyPrice, legacyPrice));
  if (maxPrice < minPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  return {
    itemId: String(entry.itemId || item.id || '').trim(),
    enabled: entry.enabled !== false,
    appearanceChance: clamp(entry.appearanceChance ?? entry.chance ?? 100, 0, 100),
    minPrice,
    maxPrice,
    unique: isUnique(item, entry)
  };
}

function claimKey(campaignId, planetId, day, itemId) {
  return [String(campaignId || 'main'), String(planetId || ''), String(day || ''), String(itemId || '')].join('::');
}

function marketClaims(state = {}) {
  const source = state?.marketRuntimeV1071?.claims || {};
  return source && typeof source === 'object' && !Array.isArray(source) ? source : {};
}

function buildRotation({ campaignId = 'main', planet = {}, equipment = {}, state = {}, now = new Date() } = {}) {
  const day = rotationKey(now);
  const claims = marketClaims(state);
  const offers = [];
  for (const raw of Array.isArray(planet.market) ? planet.market : []) {
    const itemId = String(raw?.itemId || '').trim();
    const item = equipment[itemId];
    if (!itemId || !item) continue;
    const config = normalizeEntry(raw, item);
    if (!config.enabled) continue;
    const baseSeed = `${campaignId}|${planet.id}|${day}|${itemId}`;
    if (unit(`${baseSeed}|appearance`) * 100 >= config.appearanceChance) continue;
    const span = Math.max(0, config.maxPrice - config.minPrice);
    const price = config.minPrice + (span ? Math.floor(unit(`${baseSeed}|price`) * (span + 1)) : 0);
    const key = claimKey(campaignId, planet.id, day, itemId);
    const soldClaim = config.unique ? claims[key] : null;
    offers.push({ itemId, price, sellPrice: Math.max(0, Math.floor(price * SELL_RATE)), unique: config.unique, sold: Boolean(soldClaim), soldClaim: soldClaim || null, rotationKey: day, claimKey: key });
  }
  return { rotationKey: day, nextRotationAt: nextRotationAt(now), offers: offers.filter(offer => !offer.sold), allOffers: offers };
}

function itemFootprint(item = {}) {
  return {
    w: Math.max(1, int(item.inventoryWidth ?? item.sizeWidth ?? item.widthCells ?? 1, 1)),
    h: Math.max(1, int(item.inventoryHeight ?? item.sizeHeight ?? item.heightCells ?? 1, 1))
  };
}

function itemMass(item = {}) {
  const mass = Number(item.mass ?? item.weight ?? 1);
  return Number.isFinite(mass) && mass >= 0 ? mass : 1;
}

function equippedCounts(player = {}) {
  const counts = new Map();
  const slots = player.equipmentSlots && typeof player.equipmentSlots === 'object' ? player.equipmentSlots : {};
  const values = [slots.primaryWeapon || slots.weapon || '', slots.secondaryWeapon || '', slots.armor || '', ...(Array.isArray(player.implantSlots) ? player.implantSlots : [])];
  for (const itemId of values.map(value => String(value || '')).filter(Boolean)) counts.set(itemId, (counts.get(itemId) || 0) + 1);
  return counts;
}

function inventoryColumns(size) {
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, int(size, 12)))));
}

function fits(size, cols, occupied, x, y, w, h) {
  if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > cols) return false;
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      const index = (y + dy) * cols + x + dx;
      if (index < 0 || index >= size || occupied.has(index)) return false;
    }
  }
  return true;
}

function mark(occupied, cols, x, y, w, h) {
  for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) occupied.add((y + dy) * cols + x + dx);
}

function firstFit(size, cols, occupied, w, h) {
  for (let index = 0; index < size; index += 1) {
    const x = index % cols;
    const y = Math.floor(index / cols);
    if (fits(size, cols, occupied, x, y, w, h)) return { x, y };
  }
  return null;
}

function inventoryWeight(player = {}, equipment = {}) {
  return (Array.isArray(player.inventory) ? player.inventory : []).reduce((sum, entry) => sum + itemMass(equipment[String(entry.itemId || '')] || {}) * Math.max(0, int(entry.qty, 0)), 0);
}

function layoutInventory(player = {}, equipment = {}) {
  const size = Math.max(0, int(player.inventorySize, 12));
  const cols = inventoryColumns(size);
  const equipped = equippedCounts(player);
  const occupied = new Set();
  const instances = [];
  const overflow = [];
  for (const entry of Array.isArray(player.inventory) ? player.inventory : []) {
    const itemId = String(entry.itemId || '');
    const item = equipment[itemId] || {};
    const footprint = itemFootprint(item);
    const qty = Math.max(0, int(entry.qty, 0));
    const skip = Math.min(qty, equipped.get(itemId) || 0);
    const positions = Array.isArray(entry.positions) ? entry.positions : [];
    for (let unitIndex = skip; unitIndex < qty; unitIndex += 1) {
      const raw = positions[unitIndex];
      let pos = raw && Number.isInteger(Number(raw.x)) && Number.isInteger(Number(raw.y)) ? { x: Number(raw.x), y: Number(raw.y) } : null;
      if (!pos || !fits(size, cols, occupied, pos.x, pos.y, footprint.w, footprint.h)) pos = firstFit(size, cols, occupied, footprint.w, footprint.h);
      const instance = { itemId, unitIndex, pos, ...footprint };
      if (!pos) overflow.push(instance);
      else { mark(occupied, cols, pos.x, pos.y, footprint.w, footprint.h); instances.push(instance); }
    }
  }
  return { size, cols, instances, overflow, weight: inventoryWeight(player, equipment) };
}

function ensureInventory(player = {}) {
  if (!Array.isArray(player.inventory)) player.inventory = [];
  return player.inventory;
}

function addItem(player, itemId, equipment, requestedPosition = null) {
  const item = equipment[itemId];
  if (!item) throw new Error('Предмет не найден в каталоге');
  const maxWeight = Math.max(0, Number(player.carryWeightMax ?? 12));
  const nextWeight = inventoryWeight(player, equipment) + itemMass(item);
  if (nextWeight > maxWeight + 1e-9) throw new Error(`Превышен переносимый вес: ${nextWeight.toFixed(1)} / ${maxWeight.toFixed(1)}`);
  const inventory = ensureInventory(player);
  let entry = inventory.find(row => String(row.itemId || '') === itemId);
  if (!entry) { entry = { itemId, qty: 0, positions: [] }; inventory.push(entry); }
  entry.qty = Math.max(0, int(entry.qty, 0)) + 1;
  entry.positions = Array.isArray(entry.positions) ? entry.positions : [];
  const unitIndex = entry.qty - 1;
  while (entry.positions.length < entry.qty) entry.positions.push(null);
  if (requestedPosition && Number.isInteger(Number(requestedPosition.x)) && Number.isInteger(Number(requestedPosition.y))) entry.positions[unitIndex] = { x: Number(requestedPosition.x), y: Number(requestedPosition.y) };
  const layout = layoutInventory(player, equipment);
  if (layout.overflow.length) throw new Error('В инвентаре недостаточно свободного места для предмета');
  const placed = layout.instances.find(instance => instance.itemId === itemId && instance.unitIndex === unitIndex);
  if (requestedPosition && (!placed || placed.pos.x !== Number(requestedPosition.x) || placed.pos.y !== Number(requestedPosition.y))) throw new Error('Предмет не помещается в выбранную клетку');
  if (placed) entry.positions[unitIndex] = placed.pos;
  return { unitIndex, position: placed?.pos || null };
}

function removeSellableItem(player, itemId, requestedUnitIndex = -1) {
  const inventory = ensureInventory(player);
  const entryIndex = inventory.findIndex(row => String(row.itemId || '') === itemId);
  if (entryIndex < 0) throw new Error('В инвентаре нет этого предмета');
  const entry = inventory[entryIndex];
  const qty = Math.max(0, int(entry.qty, 0));
  const equipped = equippedCounts(player).get(itemId) || 0;
  if (qty <= equipped) throw new Error('Нельзя продать экипированный экземпляр');
  let unitIndex = int(requestedUnitIndex, -1);
  if (unitIndex < equipped || unitIndex >= qty) unitIndex = qty - 1;
  entry.qty = qty - 1;
  if (Array.isArray(entry.positions)) entry.positions.splice(unitIndex, 1);
  if (entry.qty <= 0) inventory.splice(entryIndex, 1);
  return { unitIndex };
}

function pruneClaims(claims = {}, currentDay = rotationKey()) {
  const cutoff = new Date(`${currentDay}T00:00:00.000Z`).getTime() - 45 * 86400000;
  const next = {};
  for (const [key, value] of Object.entries(claims)) {
    const day = String(key).split('::').at(-2);
    const stamp = new Date(`${day}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(stamp) || stamp >= cutoff) next[key] = value;
  }
  return next;
}

function executeTransaction({ campaignId = 'main', world = {}, state = {}, player = {}, action = 'preview', planetId = '', itemId = '', unitIndex = -1, targetPosition = null, now = new Date() } = {}) {
  const planets = world?.planets?.PLANETS || {};
  const equipment = world?.equipment?.EQUIPMENT || {};
  const planet = planets[String(planetId || '')];
  if (!planet) throw new Error('Планета рынка не найдена');
  if (String(player.currentPlanetId || '') !== String(planet.id || '')) throw new Error('Торговый терминал доступен только на текущей планете персонажа');
  const rotation = buildRotation({ campaignId, planet, equipment, state, now });
  if (action === 'preview') return { action, player: deep(player), state: deep(state), rotation, snapshotChanged: false };
  const offerPool = action === 'sell' ? rotation.allOffers : rotation.offers;
  const offer = offerPool.find(row => row.itemId === String(itemId || ''));
  if (!offer) throw new Error('Товар отсутствует в текущей ротации или уже продан');
  const nextPlayer = deep(player);
  const nextState = deep(state || {});
  const currentCredits = Math.max(0, Number(nextPlayer.credits || 0));
  let snapshotChanged = false;
  let placement = null;
  if (action === 'buy') {
    if (currentCredits < offer.price) throw new Error('Недостаточно кредитов');
    placement = addItem(nextPlayer, offer.itemId, equipment, targetPosition);
    nextPlayer.credits = currentCredits - offer.price;
    if (offer.unique) {
      const claims = pruneClaims(marketClaims(nextState), rotation.rotationKey);
      if (claims[offer.claimKey]) throw new Error('Уникальный предмет уже куплен другим игроком');
      claims[offer.claimKey] = { playerId: String(nextPlayer.id || ''), boughtAt: now.toISOString(), transactionId: crypto.randomUUID() };
      nextState.marketRuntimeV1071 = { ...(nextState.marketRuntimeV1071 || {}), claims, updatedAt: now.toISOString() };
      snapshotChanged = true;
    }
  } else if (action === 'sell') {
    removeSellableItem(nextPlayer, offer.itemId, unitIndex);
    nextPlayer.credits = currentCredits + offer.sellPrice;
    if (offer.unique) {
      const claims = pruneClaims(marketClaims(nextState), rotation.rotationKey);
      if (claims[offer.claimKey]) delete claims[offer.claimKey];
      nextState.marketRuntimeV1071 = { ...(nextState.marketRuntimeV1071 || {}), claims, updatedAt: now.toISOString() };
      snapshotChanged = true;
    }
  } else {
    throw new Error('Неизвестная операция рынка');
  }
  return { action, player: nextPlayer, state: nextState, rotation, offer, price: action === 'buy' ? offer.price : offer.sellPrice, snapshotChanged, placement };
}

module.exports = { SELL_RATE, rotationKey, nextRotationAt, buildRotation, executeTransaction, claimKey, normalizeEntry, layoutInventory };
