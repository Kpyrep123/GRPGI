"use strict";

const auth = require(__hooks + "/grpgi_auth_v212.js");
const {core, spatial} = require(__hooks + "/hub-rules-v221.js");
const copies = require(__hooks + "/item-instances-v215.js");
const prefix = "grpgi-hub-presence-v221:";
const ttl = 3000;

function json(row, name) {
  const value = row.get(name);
  return JSON.parse(typeof value === "string" ? value : toString(value || "{}"));
}

function own(object, key) {
  return object && Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

function first(app, collection, filter, args) {
  const row = app.findRecordsByFilter(collection, filter, "", 1, 0, args)[0];
  if (!row) throw new NotFoundError("Нет данных кампании или персонажа");
  return row;
}

function identity(e) {
  const user = auth.actor(e);
  return {campaign: user.getString("campaignId"), player: user.getString("playerId")};
}

function position(app, who, input, ephemeral) {
  const row = first(app, "campaign_players", "campaignId={:campaign} && playerId={:player}", who);
  const player = json(row, "playerJson");
  if (row.getString("deletedAt") || player.__deleted) throw new NotFoundError("Персонаж удалён");
  player.id = who.player;
  const planetId = String(player.currentPlanetId || "");
  if (!planetId || input.planetId !== planetId) throw new ForbiddenError("Персонаж находится в другой локации");

  const readWorld = () => json(first(app, "campaign_snapshots", "campaignId={:campaign}", who), "worldJson");
  let planet, world;
  if (ephemeral) {
    const key = prefix + "world:" + core.key(who.campaign, planetId);
    const store = app.store();
    const cached = JSON.parse(store.get(key) || "null");
    if (cached && cached.until > Date.now()) planet = cached.planet;
    else {
      planet = own(readWorld().planets?.PLANETS, planetId);
      store.set(key, JSON.stringify({planet, until: Date.now() + 4000}));
    }
  } else {
    world = readWorld();
    planet = own(world.planets?.PLANETS, planetId);
  }
  if (!core.isHub(planet)) throw new NotFoundError("Хаб не найден");
  planet = {...planet, id: planetId};
  const hub = core.hubOf(planet);
  const state = core.stateFor(player, planet, hub);
  if (state.mapId !== input.mapId) throw new ForbiddenError("Персонаж находится на другой карте");
  return {row, player, planet, state, map: hub.maps.find(map => map.id === state.mapId), catalog: world?.equipment?.EQUIPMENT || {}};
}

function permissions(object, state) {
  const allowed = (flag) => !flag || Boolean(own(state.flags, flag));
  const view = allowed(object.storageViewFlag);
  return {view, deposit: allowed(object.storageDepositFlag), withdraw: view && allowed(object.storageWithdrawFlag)};
}

function units(value) {
  const result = Math.round(Number(value || 0) * 10000);
  if (!Number.isSafeInteger(result)) throw new BadRequestError("Недопустимая сумма кредитов");
  return result;
}

function footprint(item, qty) {
  if (item.textOnlyInventory || (Number(item.inventoryWidth) === 0 && Number(item.inventoryHeight) === 0 && !Number(item.mass))) return 0;
  const width = Math.max(1, Math.trunc(Number(item.inventoryWidth) || 1));
  const height = Math.max(1, Math.trunc(Number(item.inventoryHeight) || 1));
  const stack = item.stackable ? Math.max(2, Math.trunc(Number(item.stackLimit) || 99)) : 1;
  return width * height * Math.ceil(qty / stack);
}

function used(items, catalog) {
  return items.reduce((sum, entry) => sum + footprint(own(catalog, entry.itemId) || {}, Number(entry.qty)), 0);
}

function equipmentCount(player, itemId) {
  const slots = player.equipmentSlots || {};
  return [slots.primaryWeapon, slots.secondaryWeapon, slots.armor, slots.backpack, ...(player.implantSlots || [])]
    .filter(id => id === itemId).length;
}

function inventoryLimits(player, catalog) {
  let weight = 0;
  const grid = new Set();
  const capacity = Math.max(0, Math.min(10000, Number(player.inventorySize ?? 12)));
  for (const row of player.inventory) {
    const item = own(catalog, row.itemId) || {};
    const qty = Number(row.qty);
    weight += qty * Math.max(0, Number(item.mass) || 0);
    const first = Math.min(qty, equipmentCount(player, row.itemId));
    if (!footprint(item, qty - first)) continue;
    const width = Math.max(1, Math.trunc(Number(item.inventoryWidth) || 1));
    const height = Math.max(1, Math.trunc(Number(item.inventoryHeight) || 1));
    const stack = item.stackable ? Math.max(2, Math.trunc(Number(item.stackLimit) || 99)) : 1;
    const fits = (x, y) => {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x + width > 5 || (y + height - 1) * 5 + x + width > capacity) return false;
      for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
        if (grid.has((y + dy) * 5 + x + dx)) return false;
      }
      return true;
    };
    for (let index = first; index < qty; index += stack) {
      let {x, y} = row.positions?.[index] || row.positions?.[(index - first) / stack] || {};
      if (!fits(x, y)) {
        let slot = 0;
        while (slot < capacity && !fits(slot % 5, Math.floor(slot / 5))) slot++;
        if (slot >= capacity) throw new BadRequestError("Недостаточно ячеек инвентаря");
        x = slot % 5;
        y = Math.floor(slot / 5);
      }
      for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) grid.add((y + dy) * 5 + x + dx);
    }
  }
  if (weight > Number(player.carryWeightMax ?? 12) + 1e-9) throw new BadRequestError("Недостаточная грузоподъёмность");
}

function transferItems(source, destination, player, catalog, deposit, itemId, qty) {
  const item = own(catalog, itemId);
  if (!item) throw new BadRequestError("Предмет не найден в каталоге");
  const from = source.find(entry => entry.itemId === itemId);
  if (!from || Number(from.qty) - (deposit ? equipmentCount(player, itemId) : 0) < qty)
    throw new BadRequestError("Недостаточно свободных экземпляров");
  const to = destination.find(entry => entry.itemId === itemId) || {itemId, qty: 0, positions: []};
  if (Number(to.qty) + qty > 10000) throw new BadRequestError("Слишком много экземпляров");
  if (!destination.includes(to)) destination.push(to);
  if (Array.isArray(from.instancesV215)) {
    to.instancesV215 ||= [];
    for (let index = from.instancesV215.length - 1; index >= 0 && qty > 0; index--) {
      const copy = from.instancesV215[index];
      if (copy.slot) continue;
      to.instancesV215.push(copy);
      to.qty++;
      copies.remove(from, index);
      qty--;
    }
    if (qty) throw new BadRequestError("Снимите экипировку перед переносом");
  } else {
    to.qty = Number(to.qty) + qty;
    from.qty = Number(from.qty) - qty;
    if (Array.isArray(from.positions)) from.positions.length = Math.min(from.positions.length, from.qty);
  }
  if (!from.qty) source.splice(source.indexOf(from), 1);
}

function storage(e) {
  const input = e.requestInfo().body || {};
  const who = identity(e);
  const action = input.action;
  if (!["open", "deposit", "withdraw"].includes(action)) throw new BadRequestError("Неизвестная операция");
  const mutates = action !== "open";
  let result;
  const execute = (app) => {
    const {row, player, planet, map, state, catalog} = position(app, who, input, false);
    const box = map.objects.find(o => o.id === input.objectId && o.type === "storage");
    if (!box || !core.visible(box, player, state)) throw new NotFoundError("Ящик не найден");
    const reason = core.access(box, player, state) || spatial.interactionReason(map, state, player, box);
    if (reason) throw new ForbiddenError(reason);
    const rights = permissions(box, state);
    const shared = box.storageMode === "shared";
    const key = core.key(who.campaign, planet.id, map.id, box.id, shared ? "shared" : "personal", shared ? "" : who.player);
    const capacity = Math.max(1, Math.min(10000, Math.trunc(Number(box.storageCells) || 12)));
    const creditLimit = units(Math.max(0, Number(box.storageCreditLimit) || 0));
    const args = {key};
    const record = new DynamicModel({contents: ""});
    app.db().newQuery("SELECT COALESCE((SELECT contents FROM grpgi_hub_storage_v221 WHERE scope={:key}), '{}') AS contents").bind(args).one(record);
    const stored = JSON.parse(record.contents);
    stored.items ||= [];
    stored.credits ||= 0;
    if (mutates) {
      if (!rights[action]) throw new ForbiddenError("У персонажа нет права на эту операцию");
      const operation = String(input.operationId || "");
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(operation)) throw new BadRequestError("Недопустимый идентификатор операции");
      const amount = Number(input.amount);
      const itemId = String(input.itemId || "");
      if (!Number.isFinite(amount) || amount <= 0 || (itemId && (!Number.isSafeInteger(amount) || amount > 10000)))
        throw new BadRequestError("Недопустимое количество");
      const receipt = {actor: core.key(who.campaign, who.player), operation, request: core.key(key, action, itemId, amount)};
      const prior = new DynamicModel({request: ""});
      app.db().newQuery("SELECT COALESCE((SELECT request FROM grpgi_hub_receipts_v221 WHERE actor={:actor} AND operation={:operation}), '') AS request").bind(receipt).one(prior);
      if (prior.request && prior.request !== receipt.request) throw new BadRequestError("Идентификатор использован в другой операции");
      if (!prior.request) {
        const deposit = action === "deposit";
        if (itemId) {
          player.inventory ||= [];
          copies.normalize(player, id => own(catalog, id), () => "item:" + $security.randomString(24));
          transferItems(deposit ? player.inventory : stored.items, deposit ? stored.items : player.inventory, player, catalog, deposit, itemId, amount);
          if (deposit && used(stored.items, catalog) > capacity) throw new BadRequestError("Недостаточно ячеек ящика");
          if (!deposit) inventoryLimits(player, catalog);
        } else {
          const change = units(amount);
          const balance = units(player.credits) + (deposit ? -change : change);
          const held = stored.credits + (deposit ? change : -change);
          if (!change || !Number.isSafeInteger(balance) || !Number.isSafeInteger(held) || held < 0 || (deposit && balance < 0))
            throw new BadRequestError("Недостаточно кредитов или превышен допустимый баланс");
          if (deposit && creditLimit && held > creditLimit) throw new BadRequestError("Лимит кредитов в ящике превышен");
          player.credits = balance / 10000;
          stored.credits = held;
        }
        row.set("playerJson", auth.clean(player));
        row.set("version", row.getInt("version") + 1);
        row.set("clientUpdatedAt", new Date().toISOString());
        row.set("updatedBy", "hub-storage");
        app.save(row);
        app.db().newQuery("INSERT INTO grpgi_hub_storage_v221(scope, contents) VALUES ({:key}, {:contents}) ON CONFLICT(scope) DO UPDATE SET contents=excluded.contents")
          .bind({...args, contents: JSON.stringify(stored)}).execute();
        app.db().newQuery("INSERT INTO grpgi_hub_receipts_v221(actor, operation, request) VALUES ({:actor}, {:operation}, {:request})").bind(receipt).execute();
      }
    }
    result = {ok: true, rights, shared, capacity, creditLimit: creditLimit / 10000,
      contents: rights.view ? {items: stored.items, credits: stored.credits / 10000, cells: used(stored.items, catalog)} : null,
      player: mutates ? json(row, "playerJson") : undefined,
      playerVersion: mutates ? row.getInt("version") : undefined,
      playerUpdatedAt: mutates ? row.getString("updated") : undefined,
      playerClientUpdatedAt: mutates ? row.getString("clientUpdatedAt") : undefined};
  };
  if (mutates) e.app.runInTransaction(execute);
  else execute(e.app);
  return e.json(200, result);
}

function presence(e) {
  const input = e.requestInfo().body || {};
  const who = identity(e);
  const {player, planet, state, map} = position(e.app, who, input, true);
  const now = Date.now();
  const store = e.app.store();
  const room = prefix + "room:" + core.key(who.campaign, planet.id, map.id) + ":";
  const key = room + who.player;
  const previous = JSON.parse(store.get(key) || "null");
  const x = Number(input.x), y = Number(input.y);
  const origin = previous && previous.until > now ? previous : state;
  const elapsed = origin === state ? 0 : now - origin.at;
  const valid = Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= map.width && y <= map.height
    && (Math.hypot(x - state.x, y - state.y) <= 2 ||
      (Math.hypot(x - origin.x, y - origin.y) <= 100 + elapsed * 0.45 &&
        spatial.canMove(map, {...state, x: origin.x, y: origin.y}, x, y)));
  const at = valid ? {x, y} : {x: origin.x, y: origin.y};
  store.set(key, JSON.stringify({...at, id: who.player, at: now, until: now + ttl}));
  const peers = [];
  const range = spatial.size(map) * spatial.vision(map, player) * Math.sqrt(3);
  for (const peerKey of Object.keys(store.getAll())) {
    if (!peerKey.startsWith(room) || peerKey === key) continue;
    const peer = JSON.parse(store.get(peerKey) || "null");
    if (!peer || peer.until <= now) continue;
    if ((!map.fogEnabled || Math.hypot(at.x - peer.x, at.y - peer.y) <= range)
        && spatial.lineOfSight(map, state, at, peer)) peers.push({id: peer.id, x: peer.x, y: peer.y});
  }
  return e.json(200, {peers});
}

function prune(app) {
  const store = app.store();
  const now = Date.now();
  for (const key of Object.keys(store.getAll())) {
    if (!key.startsWith(prefix)) continue;
    const entry = JSON.parse(store.get(key) || "null");
    if (entry && entry.until <= now) store.remove(key);
  }
}

module.exports = {storage, presence, prune};
