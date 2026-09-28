'use strict';

const crypto = require('crypto');

const VERSION = 148;
const MAX_HISTORY = 3600;
const MIN_PRICE = 0.01;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, number(value))); }
function round(value, digits = 4) { const scale = 10 ** digits; return Math.round(number(value) * scale) / scale; }
function hash32(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value ?? '')) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
}
function random(seed) { return hash32(seed) / 0x100000000; }
function stockItems(world = {}) {
  const source = world?.equipment?.EQUIPMENT || world?.equipment || {};
  return Object.values(source).filter(item => {
    const type = String(item?.type || item?.category || '').toLowerCase();
    return ['stock', 'stocks', 'share', 'shares'].includes(type) || String(item?.id || '').startsWith('stock_');
  });
}
function initialPrice(item = {}) {
  return Math.max(MIN_PRICE, number(item.stockMinPrice ?? item.stockPriceMin ?? item.marketMinPrice ?? item.priceMin ?? item.minPrice ?? item.stockPrice ?? item.basePrice, 100));
}
function volatility(item = {}) { return clamp(item.stockVolatility ?? item.volatility ?? 1, 0.05, 8); }
function ticker(item = {}) { return String(item.ticker || item.symbol || item.id || 'STOCK').toUpperCase().replace(/[^A-ZА-Я0-9._-]/g, '').slice(0, 12); }

function createState(world = {}, now = Date.now()) {
  const second = Math.floor(number(now, Date.now()) / 1000);
  const quotes = {};
  for (const item of stockItems(world)) {
    const price = initialPrice(item);
    quotes[item.id] = { itemId: item.id, ticker: ticker(item), price, previousPrice: price, change: 0, changePercent: 0, volatility: volatility(item), tick: second };
  }
  return { version: VERSION, lastTick: second, quotes, candles: {}, orders: [], events: [], updatedAt: new Date(second * 1000).toISOString() };
}

function regime(campaignId, itemId, tick) {
  const block = Math.floor(tick / 90);
  const value = random(`${campaignId}|${itemId}|regime|${block}`);
  if (value < 0.18) return { id: 'trend-up', drift: 0.00042, reversion: 0.03 };
  if (value < 0.36) return { id: 'trend-down', drift: -0.00038, reversion: 0.03 };
  if (value < 0.56) return { id: 'volatile', drift: 0, reversion: 0.015, noise: 2.1 };
  if (value < 0.76) return { id: 'range', drift: 0, reversion: 0.12, noise: 0.65 };
  if (value < 0.88) return { id: 'breakout', drift: (random(`${campaignId}|${itemId}|breakout|${block}`) < .5 ? -1 : 1) * 0.00085, reversion: 0.01, noise: 1.35 };
  return { id: 'calm', drift: 0.00003, reversion: 0.06, noise: 0.3 };
}

function manualImpulse(state, itemId, tick) {
  return (state.events || []).filter(event => event.itemId === itemId && tick >= event.startTick && tick < event.startTick + event.duration)
    .reduce((sum, event) => sum + number(event.percent) / 100 / Math.max(1, event.duration), 0);
}

function nextPrice(state, campaignId, quote, tick) {
  const mode = regime(campaignId, quote.itemId, tick);
  const vol = quote.volatility || 1;
  const noise = (random(`${campaignId}|${quote.itemId}|noise|${tick}`) - .5) * 0.0014 * vol * (mode.noise || 1);
  const anchor = Math.max(MIN_PRICE, number(quote.anchor, quote.price));
  const deviation = (anchor - quote.price) / Math.max(anchor, MIN_PRICE);
  const shockRoll = random(`${campaignId}|${quote.itemId}|shock|${tick}`);
  const shock = shockRoll > .998 ? (random(`${campaignId}|${quote.itemId}|shock-dir|${tick}`) < .5 ? -1 : 1) * (0.008 + random(`${campaignId}|${quote.itemId}|shock-size|${tick}`) * 0.025) * vol : 0;
  const delta = mode.drift * vol + noise + deviation * mode.reversion * 0.01 + shock + manualImpulse(state, quote.itemId, tick);
  return { price: Math.max(MIN_PRICE, round(quote.price * Math.exp(delta), 4)), regime: mode.id };
}

function addCandle(state, itemId, tick, price) {
  const rows = state.candles[itemId] || (state.candles[itemId] = []);
  const minute = Math.floor(tick / 60) * 60;
  let candle = rows[rows.length - 1];
  if (!candle || candle.time !== minute) { candle = { time: minute, open: price, high: price, low: price, close: price, volume: 0 }; rows.push(candle); }
  candle.high = Math.max(candle.high, price); candle.low = Math.min(candle.low, price); candle.close = price;
  candle.volume = round(candle.volume + random(`${itemId}|volume|${tick}`) * 40 + 1, 2);
  if (rows.length > MAX_HISTORY) rows.splice(0, rows.length - MAX_HISTORY);
}

function normalizeState(state, world, now) {
  const next = state && typeof state === 'object' ? state : createState(world, now);
  next.quotes ||= {}; next.candles ||= {}; next.orders ||= []; next.events ||= [];
  for (const item of stockItems(world)) {
    if (!next.quotes[item.id]) {
      const price = initialPrice(item);
      next.quotes[item.id] = { itemId: item.id, ticker: ticker(item), price, previousPrice: price, change: 0, changePercent: 0, volatility: volatility(item), tick: next.lastTick || Math.floor(now / 1000) };
    }
    next.quotes[item.id].volatility = volatility(item);
  }
  return next;
}

function advance(state, { campaignId = 'main', world = {}, now = Date.now(), onTick = null } = {}) {
  const next = normalizeState(state, world, now);
  const target = Math.floor(number(now, Date.now()) / 1000);
  let start = Math.max(number(next.lastTick, target), target - 86400);
  for (let tick = start + 1; tick <= target; tick += 1) {
    for (const quote of Object.values(next.quotes)) {
      const previous = quote.price;
      const movement = nextPrice(next, campaignId, quote, tick);
      quote.previousPrice = previous; quote.price = movement.price; quote.change = round(quote.price - previous, 4);
      quote.changePercent = previous > 0 ? round(quote.change / previous * 100, 4) : 0;
      quote.regime = movement.regime; quote.tick = tick;
      addCandle(next, quote.itemId, tick, quote.price);
    }
    next.lastTick = tick;
    if (onTick) onTick(next, tick);
  }
  next.events = next.events.filter(event => target < event.startTick + event.duration);
  next.updatedAt = new Date(target * 1000).toISOString();
  return next;
}

function indicators(candles = []) {
  const closes = candles.map(row => number(row.close)).filter(Number.isFinite);
  const average = length => closes.length < length ? null : round(closes.slice(-length).reduce((a, b) => a + b, 0) / length, 4);
  let gains = 0, losses = 0;
  const sample = closes.slice(-15);
  for (let index = 1; index < sample.length; index += 1) { const diff = sample[index] - sample[index - 1]; if (diff >= 0) gains += diff; else losses -= diff; }
  const rs = losses === 0 ? 100 : gains / losses;
  return { sma5: average(5), sma20: average(20), rsi14: sample.length < 15 ? null : round(100 - 100 / (1 + rs), 2) };
}

function orderTriggers(order, quote) {
  const price = quote.price, trigger = number(order.triggerPrice), limit = number(order.limitPrice);
  if (order.type === 'market') return true;
  if (order.type === 'limit') return ['open_long', 'close_short'].includes(order.intent) ? price <= limit : price >= limit;
  if (order.type === 'stop_loss') return order.intent === 'close_long' ? price <= trigger : price >= trigger;
  if (order.type === 'take_profit') return order.intent === 'close_long' ? price >= trigger : price <= trigger;
  if (order.type === 'trailing_stop') {
    order.peak = order.intent === 'close_long' ? Math.max(number(order.peak, price), price) : Math.min(number(order.peak, price), price);
    return order.intent === 'close_long' ? price <= order.peak * (1 - order.trailingPercent / 100) : price >= order.peak * (1 + order.trailingPercent / 100);
  }
  return false;
}

function ensurePortfolio(player) {
  player.stockPortfolio ||= {}; player.stockPortfolio.positions ||= {}; player.stockPortfolio.ledger ||= [];
  player.stockPortfolio.shortPositions ||= {}; return player.stockPortfolio;
}

function executeOrder(order, quote, player, tick) {
  const portfolio = ensurePortfolio(player), quantity = Math.max(1, Math.trunc(number(order.quantity, 1))), price = quote.price;
  const total = round(price * quantity, 4), leverage = clamp(order.leverage || 1, 1, 3);
  if (order.intent === 'open_long') {
    const margin = total / leverage; if (number(player.credits) < margin) throw new Error('Недостаточно средств для открытия позиции');
    player.credits = round(number(player.credits) - margin, 4);
    const position = portfolio.positions[order.itemId] || { itemId: order.itemId, knownQty: 0, costBasis: 0, margin: 0, leverage };
    position.knownQty += quantity; position.costBasis += total; position.margin = number(position.margin) + margin; position.leverage = leverage; portfolio.positions[order.itemId] = position;
  } else if (order.intent === 'close_long') {
    const position = portfolio.positions[order.itemId]; if (!position || number(position.knownQty) < quantity) throw new Error('Недостаточно акций в длинной позиции');
    const average = number(position.costBasis) / position.knownQty, marginShare = number(position.margin, position.costBasis) * quantity / position.knownQty;
    player.credits = round(number(player.credits) + marginShare + (price - average) * quantity, 4);
    position.knownQty -= quantity; position.costBasis -= average * quantity; position.margin = Math.max(0, number(position.margin) - marginShare); if (position.knownQty <= 0) delete portfolio.positions[order.itemId];
  } else if (order.intent === 'open_short') {
    const margin = total / leverage; if (number(player.credits) < margin) throw new Error('Недостаточно средств для открытия шорта');
    player.credits = round(number(player.credits) - margin, 4);
    const position = portfolio.shortPositions[order.itemId] || { itemId: order.itemId, quantity: 0, costBasis: 0, margin: 0, leverage };
    position.quantity += quantity; position.costBasis += total; position.margin += margin; position.leverage = leverage; portfolio.shortPositions[order.itemId] = position;
  } else if (order.intent === 'close_short') {
    const position = portfolio.shortPositions[order.itemId]; if (!position || position.quantity < quantity) throw new Error('Недостаточно акций в короткой позиции');
    const average = position.costBasis / position.quantity, marginShare = position.margin * quantity / position.quantity;
    player.credits = round(number(player.credits) + marginShare + (average - price) * quantity, 4);
    position.quantity -= quantity; position.costBasis -= average * quantity; position.margin -= marginShare; if (position.quantity <= 0) delete portfolio.shortPositions[order.itemId];
  } else throw new Error('Неизвестное направление заявки');
  const ledger = { id: order.id, type: order.intent, itemId: order.itemId, quantity, unitPrice: price, total, leverage, createdAt: new Date(tick * 1000).toISOString() };
  portfolio.ledger.push(ledger); if (portfolio.ledger.length > 500) portfolio.ledger.splice(0, portfolio.ledger.length - 500);
  return ledger;
}

function liquidate(player, quotes = {}, tick = Math.floor(Date.now() / 1000)) {
  const portfolio = ensurePortfolio(player), events = [];
  for (const [itemId, position] of Object.entries(portfolio.positions)) {
    const quote = quotes[itemId], qty = number(position.knownQty), entry = qty > 0 ? number(position.costBasis) / qty : 0, leverage = clamp(position.leverage || 1, 1, 3);
    if (!quote || !qty || quote.price > entry * (1 - 0.9 / leverage)) continue;
    const payout = Math.max(0, number(position.margin, position.costBasis) + (quote.price - entry) * qty);
    player.credits = round(number(player.credits) + payout, 4); delete portfolio.positions[itemId];
    events.push({ id: crypto.randomUUID(), type: 'liquidation_long', itemId, quantity: qty, unitPrice: quote.price, leverage, total: payout, createdAt: new Date(tick * 1000).toISOString() });
  }
  for (const [itemId, position] of Object.entries(portfolio.shortPositions)) {
    const quote = quotes[itemId], qty = number(position.quantity), entry = qty > 0 ? number(position.costBasis) / qty : 0, leverage = clamp(position.leverage || 1, 1, 3);
    if (!quote || !qty || quote.price < entry * (1 + 0.9 / leverage)) continue;
    const payout = Math.max(0, number(position.margin) + (entry - quote.price) * qty);
    player.credits = round(number(player.credits) + payout, 4); delete portfolio.shortPositions[itemId];
    events.push({ id: crypto.randomUUID(), type: 'liquidation_short', itemId, quantity: qty, unitPrice: quote.price, leverage, total: payout, createdAt: new Date(tick * 1000).toISOString() });
  }
  portfolio.ledger.push(...events); if (portfolio.ledger.length > 500) portfolio.ledger.splice(0, portfolio.ledger.length - 500);
  return events;
}

function createOrder(payload = {}, now = Date.now()) {
  const type = ['market', 'limit', 'stop_loss', 'take_profit', 'trailing_stop'].includes(payload.type) ? payload.type : 'market';
  const intent = ['open_long', 'close_long', 'open_short', 'close_short'].includes(payload.intent) ? payload.intent : 'open_long';
  return { id: String(payload.operationId || crypto.randomUUID()), playerId: String(payload.playerId || ''), itemId: String(payload.itemId || ''), type, intent, quantity: Math.max(1, Math.min(10000, Math.trunc(number(payload.quantity, 1)))), leverage: clamp(payload.leverage || 1, 1, 3), triggerPrice: Math.max(0, number(payload.triggerPrice)), limitPrice: Math.max(0, number(payload.limitPrice)), trailingPercent: clamp(payload.trailingPercent || 1, .1, 50), status: 'pending', createdAt: new Date(now).toISOString() };
}

module.exports = { VERSION, MIN_PRICE, initialPrice, stockItems, createState, normalizeState, advance, indicators, orderTriggers, executeOrder, liquidate, createOrder };
