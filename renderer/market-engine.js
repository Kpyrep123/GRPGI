(function marketEngineBootstrapV1074(global) {
  'use strict';

  const STANDARD_SELL_RATE = 0.7;
  const STOCK_SELL_RATE = 1;
  const DEFAULT_HISTORY_DAYS = 30;

  function intValue(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  }

  function hash(value) {
    const text = String(value ?? '');
    let result = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 0x01000193);
    }
    return result >>> 0;
  }

  function unit(seed) {
    return hash(seed) / 0x100000000;
  }

  function asDate(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
    return Number.isFinite(date.getTime()) ? date : new Date();
  }

  function rotationKey(now = new Date()) {
    return asDate(now).toISOString().slice(0, 10);
  }

  function dateKey(value, fallback = new Date()) {
    const text = String(value ?? '').trim();
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : rotationKey(value || fallback);
  }

  function addDays(day, amount) {
    const date = new Date(`${dateKey(day)}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + intValue(amount, 0));
    return date.toISOString().slice(0, 10);
  }

  function nextRotationAt(now = new Date()) {
    const date = asDate(now);
    date.setUTCHours(24, 0, 0, 0);
    return date.toISOString();
  }

  function resolveMarketDay({ now = new Date(), gameDate = '', campaign = {}, marketState = {} } = {}) {
    const explicit = String(
      gameDate ||
      campaign?.marketDate || campaign?.gameDate || campaign?.currentDate || campaign?.inGameDate ||
      marketState?.marketDate || marketState?.gameDate || marketState?.currentDate || ''
    ).trim();
    return { day: dateKey(explicit || now), usesGameDate: Boolean(explicit) };
  }

  function itemType(item = {}) {
    const raw = String(item.type || item.category || '').trim().toLowerCase();
    const tags = Array.isArray(item.tags) ? item.tags.map(tag => String(tag || '').trim().toLowerCase()) : [];
    const legacyStock = String(item.id || '').toLowerCase().startsWith('stock_') || /^акции(?:\s|$)/i.test(String(item.name || '').trim()) || tags.some(tag => ['акции', 'stock', 'stocks', 'share', 'shares'].includes(tag));
    return ['stock', 'stocks', 'share', 'shares'].includes(raw) || legacyStock ? 'stock' : raw;
  }

  function isStock(item = {}) {
    return itemType(item) === 'stock';
  }

  function stockTicker(item = {}) {
    if (!isStock(item)) return '';
    const explicit = String(item.ticker || item.symbol || '').trim().toUpperCase();
    if (explicit) return explicit.replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
    const description = String(item.desc || item.description || '');
    const match = description.match(/(?:тикер|ticker)\s*[:—-]\s*([A-Z0-9.\-]{2,12})/i) || description.match(/^\s*([A-Z0-9][A-Z0-9.\-]{1,11})\s*[—-]\s*/);
    return match ? String(match[1]).toUpperCase() : '';
  }

  function sellRate(item = {}) {
    return isStock(item) ? STOCK_SELL_RATE : STANDARD_SELL_RATE;
  }

  function isUnique(item = {}, config = {}) {
    const rarity = String(item.rarity || item.quality || '').trim().toLowerCase();
    return config.unique === true || item.unique === true || rarity === 'уникальный' || rarity === 'unique';
  }

  function normalizeEntry(entry = {}, item = {}) {
    const legacy = Math.max(0, intValue(entry.price, 0));
    const minPrice = Math.max(0, intValue(entry.minPrice ?? entry.priceMin ?? legacy, legacy));
    const maxPrice = Math.max(0, intValue(entry.maxPrice ?? entry.priceMax ?? legacy, legacy));
    return {
      itemId: String(entry.itemId || item.id || '').trim(),
      enabled: entry.enabled !== false,
      appearanceChance: clamp(entry.appearanceChance ?? entry.chance ?? 100, 0, 100),
      minPrice: Math.min(minPrice, maxPrice),
      maxPrice: Math.max(minPrice, maxPrice),
      unique: isUnique(item, entry)
    };
  }

  function equipmentItems(equipment) {
    if (equipment instanceof Map) return Array.from(equipment.values());
    return equipment && typeof equipment === 'object' ? Object.values(equipment) : [];
  }

  function planetItems(planets) {
    if (planets instanceof Map) return Array.from(planets.values());
    if (Array.isArray(planets)) return planets;
    return planets && typeof planets === 'object' ? Object.values(planets) : [];
  }

  function stockPriceEntry(item = {}, planets = {}) {
    const explicitMin = item.stockMinPrice ?? item.stockPriceMin ?? item.priceMin;
    const explicitMax = item.stockMaxPrice ?? item.stockPriceMax ?? item.priceMax;
    if (explicitMin != null || explicitMax != null || item.stockPrice != null || item.basePrice != null) {
      const fallback = Math.max(0, intValue(item.stockPrice ?? item.basePrice ?? 100, 100));
      return { ...normalizeEntry({
        itemId: item.id,
        enabled: true,
        appearanceChance: 100,
        minPrice: explicitMin ?? fallback,
        maxPrice: explicitMax ?? fallback,
        unique: false
      }, item), unique: false };
    }
    const legacy = planetItems(planets)
      .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')))
      .flatMap(planet => Array.isArray(planet?.market) ? planet.market : [])
      .find(entry => String(entry?.itemId || '') === String(item.id || ''));
    return { ...normalizeEntry(legacy || { itemId: item.id, minPrice: 100, maxPrice: 100, appearanceChance: 100 }, item), enabled: true, appearanceChance: 100, unique: false };
  }

  function stockMarketEnabled(planet = {}, equipment = {}) {
    if (typeof planet.stockMarketEnabled === 'boolean') return planet.stockMarketEnabled;
    if (typeof planet.hasStockMarket === 'boolean') return planet.hasStockMarket;
    return (Array.isArray(planet.market) ? planet.market : []).some(entry => isStock(equipmentItem(equipment, String(entry?.itemId || '')) || {}));
  }

  function claimKey(campaignId, planetId, day, itemId) {
    return [String(campaignId || 'main'), String(planetId || ''), String(day || ''), String(itemId || '')].join('::');
  }

  function claimsFrom(marketState = {}) {
    const source = marketState?.marketRuntimeV1071?.claims || marketState?.claims;
    return source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  }

  function equipmentItem(equipment, itemId) {
    if (equipment instanceof Map) return equipment.get(itemId) || null;
    return equipment && typeof equipment === 'object' ? equipment[itemId] || null : null;
  }

  function priceForEntry({ campaignId = 'main', planetId = '', day, itemId, entry = {}, item = {} } = {}) {
    const config = normalizeEntry(entry, item);
    const span = Math.max(0, config.maxPrice - config.minPrice);
    const marketScope = isStock(item) ? 'global-stock' : planetId;
    const seed = `${campaignId}|${marketScope}|${dateKey(day)}|${itemId || config.itemId}`;
    return config.minPrice + (span ? Math.floor(unit(`${seed}|price`) * (span + 1)) : 0);
  }

  function quoteForDay({ campaignId = 'main', planet = {}, day, entry = {}, item = {} } = {}) {
    const itemId = String(entry.itemId || item.id || '').trim();
    if (!itemId) return null;
    const config = normalizeEntry(entry, item);
    if (!config.enabled) return null;
    const marketDay = dateKey(day);
    const previousDay = addDays(marketDay, -1);
    const price = priceForEntry({ campaignId, planetId: planet.id || '', day: marketDay, itemId, entry: config, item });
    const previousPrice = priceForEntry({ campaignId, planetId: planet.id || '', day: previousDay, itemId, entry: config, item });
    const change = price - previousPrice;
    const changePercent = previousPrice > 0 ? change / previousPrice * 100 : 0;
    const rate = sellRate(item);
    return {
      itemId,
      itemType: itemType(item),
      ticker: stockTicker(item),
      price,
      previousPrice,
      change,
      changePercent,
      sellRate: rate,
      sellPrice: Math.max(0, Math.floor(price * rate)),
      unique: isStock(item) ? false : config.unique,
      rotationKey: marketDay
    };
  }

  function priceHistory({ campaignId = 'main', planet = {}, planets = {}, equipment = {}, itemId = '', entry = null, endDay = new Date(), days = DEFAULT_HISTORY_DAYS } = {}) {
    const item = equipmentItem(equipment, itemId) || {};
    const marketEntry = entry || (isStock(item) ? stockPriceEntry(item, planets) : (Array.isArray(planet.market) ? planet.market.find(row => String(row?.itemId || '') === String(itemId)) : null));
    if (!marketEntry || !itemId) return [];
    const count = Math.max(2, Math.min(180, intValue(days, DEFAULT_HISTORY_DAYS)));
    const lastDay = dateKey(endDay);
    return Array.from({ length: count }, (_, index) => {
      const day = addDays(lastDay, index - count + 1);
      const price = priceForEntry({ campaignId, planetId: planet.id || '', day, itemId, entry: marketEntry, item });
      return { day, price };
    });
  }

  function buildStockQuotes({ campaignId = 'main', equipment = {}, planets = {}, marketState = {}, now = new Date(), gameDate = '', campaign = {} } = {}) {
    const resolved = resolveMarketDay({ now, gameDate, campaign, marketState });
    const day = resolved.day;
    return equipmentItems(equipment).filter(isStock).map(item => {
      const entry = stockPriceEntry(item, planets);
      return quoteForDay({ campaignId, planet: { id: 'global-stock' }, day, entry, item });
    }).filter(Boolean).sort((a, b) => String(a.ticker || a.itemId).localeCompare(String(b.ticker || b.itemId), 'ru'));
  }

  function buildRotation({ campaignId = 'main', planet = {}, planets = {}, equipment = {}, marketState = {}, now = new Date(), gameDate = '', campaign = {} } = {}) {
    const resolved = resolveMarketDay({ now, gameDate, campaign, marketState });
    const day = resolved.day;
    const claims = claimsFrom(marketState);
    const offers = [];
    const rows = Array.isArray(planet.market) ? planet.market : [];
    rows.forEach(rawEntry => {
      const raw = rawEntry || {};
      const itemId = String(raw.itemId || '').trim();
      const item = equipmentItem(equipment, itemId);
      if (!itemId || !item) return;
      if (isStock(item)) return;
      const config = normalizeEntry(raw, item);
      if (!config.enabled) return;
      const quote = quoteForDay({ campaignId, planet, day, entry: config, item });
      if (!quote) return;
      const seed = `${campaignId}|${planet.id || ''}|${day}|${itemId}`;
      if (unit(`${seed}|appearance`) * 100 >= config.appearanceChance) return;
      const key = claimKey(campaignId, planet.id, day, itemId);
      const soldClaim = config.unique ? claims[key] : null;
      offers.push({ ...quote, sold: Boolean(soldClaim), soldClaim: soldClaim || null, claimKey: key });
    });
    const quotes = buildStockQuotes({ campaignId, equipment, planets, marketState, now, gameDate, campaign });
    const stockEnabled = stockMarketEnabled(planet, equipment);
    if (stockEnabled) {
      quotes.forEach(quote => offers.push({ ...quote, sold: false, soldClaim: null, claimKey: claimKey(campaignId, 'global-stock', day, quote.itemId) }));
    }
    return {
      rotationKey: day,
      usesGameDate: resolved.usesGameDate,
      nextRotationAt: resolved.usesGameDate ? null : nextRotationAt(now),
      stockMarketEnabled: stockEnabled,
      offers: offers.filter(offer => !offer.sold),
      allOffers: offers,
      quotes
    };
  }

  global.GRPGMarketEngineV1071 = Object.freeze({
    version: '1.0.74',
    STANDARD_SELL_RATE,
    STOCK_SELL_RATE,
    DEFAULT_HISTORY_DAYS,
    rotationKey,
    dateKey,
    addDays,
    nextRotationAt,
    resolveMarketDay,
    itemType,
    isStock,
    stockTicker,
    stockPriceEntry,
    stockMarketEnabled,
    sellRate,
    isUnique,
    normalizeEntry,
    claimKey,
    priceForEntry,
    quoteForDay,
    priceHistory,
    buildStockQuotes,
    buildRotation
  });
})(typeof window !== 'undefined' ? window : globalThis);
