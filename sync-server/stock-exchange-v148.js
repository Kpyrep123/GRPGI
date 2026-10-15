'use strict';

const crypto = require('crypto');
const StockMotion = require('./stock-motion-v165.js');

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
    quotes[item.id] = { itemId: item.id, ticker: ticker(item), price, anchor: price, previousPrice: price, change: 0, changePercent: 0, volatility: volatility(item), tick: second };
  }
  return { version: VERSION, lastTick: second, quotes, candles: {}, orders: [], events: [], updatedAt: new Date(second * 1000).toISOString() };
}

function manualImpulse(state, itemId, tick) {
  return (state.events || []).filter(event => event.itemId === itemId && tick >= event.startTick && tick < event.startTick + event.duration)
    .reduce((sum, event) => sum + number(event.percent) / 100 / Math.max(1, event.duration), 0);
}

function nextPrice(state, campaignId, quote, tick) {
  const movement=StockMotion.next({campaignId,itemId:quote.itemId,tick,stepSeconds:1,price:quote.price,anchor:quote.anchor,volatility:quote.volatility});
  const impulse=manualImpulse(state,quote.itemId,tick);
  if(impulse)return {price:Math.max(MIN_PRICE,round(movement.price*Math.exp(impulse),4)),regime:'dm-impulse'};
  return movement;
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
      next.quotes[item.id] = { itemId: item.id, ticker: ticker(item), price, anchor: price, previousPrice: price, change: 0, changePercent: 0, volatility: volatility(item), tick: next.lastTick || Math.floor(now / 1000) };
    }
    if(!Number.isFinite(next.quotes[item.id].anchor)||next.quotes[item.id].anchor<MIN_PRICE)next.quotes[item.id].anchor=Math.max(MIN_PRICE,number(next.quotes[item.id].price,initialPrice(item)));
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
      if(Number.isFinite(movement.anchor))quote.anchor=movement.anchor;
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
  var book=ensurePortfolio(player),qty=Math.max(1,Math.trunc(number(order.quantity,1))),price=quote.price,total=round(price*qty,4),leverage=clamp(order.leverage||1,1,3),position,count,average,share=0,pnl=0,cashFlow=0,margin=0;
  var long=order.intent==='open_long'||order.intent==='close_long',opening=order.intent==='open_long'||order.intent==='open_short';
  if(!opening&&order.intent!=='close_long'&&order.intent!=='close_short')throw new Error('Неизвестное направление заявки');
  var positions=long?book.positions:book.shortPositions,key=long?'knownQty':'quantity';
  if(opening){
    margin=total/leverage;if(number(player.credits)<margin)throw new Error('Недостаточно средств для открытия позиции');
    position=positions[order.itemId]||{itemId:order.itemId,costBasis:0,margin:0};position[key]=number(position[key])+qty;
    var oldBasis=number(position.costBasis);position.costBasis=oldBasis+total;position.margin=number(position.margin,oldBasis)+margin;
    position.leverage=position.costBasis/position.margin;positions[order.itemId]=position;cashFlow=-margin;
  }else{
    position=positions[order.itemId];count=position&&number(position[key]);if(!position||count<qty)throw new Error('Недостаточно акций в позиции');
    average=number(position.costBasis)/count;var positionMargin=number(position.margin,position.costBasis);share=positionMargin*qty/count;
    leverage=positionMargin>0?number(position.costBasis)/positionMargin:1;pnl=(long?price-average:average-price)*qty;
    cashFlow=Math.max(0,share+pnl);pnl=cashFlow-share;margin=share;
    position[key]-=qty;position.costBasis=Math.max(0,number(position.costBasis)-average*qty);position.margin=Math.max(0,positionMargin-share);if(position[key]<=0)delete positions[order.itemId];
  }
  player.credits=round(number(player.credits)+cashFlow,4);
  var ledger={id:order.id,type:order.intent,itemId:order.itemId,quantity:qty,unitPrice:price,total:total,leverage:leverage,margin:round(margin,4),cashFlow:round(cashFlow,4),realizedPnl:round(pnl,4),createdAt:new Date(tick*1000).toISOString()};
  book.ledger.push(ledger);if(book.ledger.length>500)book.ledger.splice(0,book.ledger.length-500);return ledger;
}

function liquidate(player, quotes = {}, tick = Math.floor(Date.now() / 1000)) {
  const portfolio = ensurePortfolio(player), events = [];
  for (const [itemId, position] of Object.entries(portfolio.positions)) {
    const quote = quotes[itemId], qty = number(position.knownQty), entry = qty > 0 ? number(position.costBasis) / qty : 0, leverage = clamp(number(position.costBasis)/Math.max(.01,number(position.margin,position.costBasis)),1,3);
    if (!quote || !qty || quote.price > entry * (1 - 0.9 / leverage)) continue;
    const payout = Math.max(0, number(position.margin, position.costBasis) + (quote.price - entry) * qty);
    player.credits = round(number(player.credits) + payout, 4); delete portfolio.positions[itemId];
    events.push({ id: crypto.randomUUID(), type: 'liquidation_long', itemId, quantity: qty, unitPrice: quote.price, leverage, total: payout, margin:number(position.margin,position.costBasis),cashFlow:payout,realizedPnl:round(payout-number(position.margin,position.costBasis),4),createdAt: new Date(tick * 1000).toISOString() });
  }
  for (const [itemId, position] of Object.entries(portfolio.shortPositions)) {
    const quote = quotes[itemId], qty = number(position.quantity), entry = qty > 0 ? number(position.costBasis) / qty : 0, leverage = clamp(number(position.costBasis)/Math.max(.01,number(position.margin,position.costBasis)),1,3);
    if (!quote || !qty || quote.price < entry * (1 + 0.9 / leverage)) continue;
    const payout = Math.max(0, number(position.margin,position.costBasis) + (entry - quote.price) * qty);
    player.credits = round(number(player.credits) + payout, 4); delete portfolio.shortPositions[itemId];
    events.push({ id: crypto.randomUUID(), type: 'liquidation_short', itemId, quantity: qty, unitPrice: quote.price, leverage, total: payout, margin:number(position.margin,position.costBasis),cashFlow:payout,realizedPnl:round(payout-number(position.margin,position.costBasis),4),createdAt: new Date(tick * 1000).toISOString() });
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
