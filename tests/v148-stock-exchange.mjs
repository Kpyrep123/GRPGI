import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Exchange = require('../sync-server/stock-exchange-v148.js');
const world = { equipment: { EQUIPMENT: {
  alpha: { id: 'alpha', type: 'stock', ticker: 'ALP', stockMinPrice: 75, stockMaxPrice: 900, stockVolatility: 1.25 }
} } };

const initial = Exchange.createState(world, 1_700_000_000_000);
assert.equal(initial.quotes.alpha.price, 75, 'the former lower bound is the initial quote');
const first = Exchange.advance(structuredClone(initial), { campaignId: 'test', world, now: 1_700_000_010_000 });
const second = Exchange.advance(structuredClone(initial), { campaignId: 'test', world, now: 1_700_000_010_000 });
assert.deepEqual(first.quotes, second.quotes, 'the same campaign and server tick produce the same quote');
assert.ok(first.quotes.alpha.price > 0, 'price has only a technical positive floor');
assert.ok(first.candles.alpha.length > 0, 'server produces OHLC candles');

const player = { id: 'p1', credits: 10_000, stockPortfolio: { positions: {}, shortPositions: {}, ledger: [] } };
const order = Exchange.createOrder({ playerId: 'p1', itemId: 'alpha', intent: 'open_long', type: 'market', quantity: 10, leverage: 2, operationId: 'order-1' }, 1_700_000_010_000);
Exchange.executeOrder(order, first.quotes.alpha, player, first.lastTick);
assert.equal(player.stockPortfolio.positions.alpha.knownQty, 10);
assert.equal(player.stockPortfolio.positions.alpha.leverage, 2);
assert.ok(player.credits < 10_000);

const stop = Exchange.createOrder({ playerId: 'p1', itemId: 'alpha', intent: 'close_long', type: 'stop_loss', quantity: 10, triggerPrice: first.quotes.alpha.price + 1 });
assert.equal(Exchange.orderTriggers(stop, first.quotes.alpha), true, 'stop loss is evaluated by the server');

const liquidationPlayer = { credits: 0, stockPortfolio: { positions: { alpha: { itemId: 'alpha', knownQty: 1, costBasis: 100, margin: 33.34, leverage: 3 } }, shortPositions: {}, ledger: [] } };
const liquidations = Exchange.liquidate(liquidationPlayer, { alpha: { price: 69 } }, first.lastTick);
assert.equal(liquidations[0].type, 'liquidation_long');
assert.equal(liquidationPlayer.stockPortfolio.positions.alpha, undefined);

console.log('v148 stock exchange tests: ok');
