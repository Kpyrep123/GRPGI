import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';
const require=createRequire(import.meta.url),Exchange=require('../sync-server/stock-exchange-v148.js');
const context=vm.createContext({module:{exports:{}},require,__hooks:fileURLToPath(new URL('../pocketbase/pb_hooks',import.meta.url))});vm.runInContext(fs.readFileSync('pocketbase/pb_hooks/grpgi_stock_exchange_v148.js','utf8'),context);
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
for(const [name,execute]of[['sync',Exchange.executeOrder],['pocketbase',context.execute]]){
 for(const side of ['long','short'])for(const lev of [1,2,3])for(const change of [-10,10]){
  const p={credits:10000},qty=10*lev,exit=side==='long'?100+change:100-change;
  const run=(intent,q,price,leverage)=>execute({id:crypto.randomUUID(),itemId:'s',intent,quantity:q,leverage},{price},p,1700000000);
  const entry=run('open_'+side,qty,100,lev);near(p.credits,9000);near(entry.margin,1000);near(entry.cashFlow,-1000);
  const half=run('close_'+side,qty/2,exit,1);near(half.leverage,lev);near(half.realizedPnl,change*qty/2);near(half.cashFlow,500+change*qty/2);
  run('close_'+side,qty/2,exit,1);near(p.credits,10000+change*qty);
  const book=side==='long'?p.stockPortfolio.positions:p.stockPortfolio.shortPositions;assert.equal(book.s,undefined);
 }
 const fixed=[];for(const lev of [1,2,3]){const p={credits:10000};execute({id:'a',itemId:'s',intent:'open_long',quantity:10,leverage:lev},{price:100},p,0);execute({id:'b',itemId:'s',intent:'close_long',quantity:10,leverage:1},{price:110},p,1);fixed.push(p.credits);}fixed.forEach(v=>near(v,10100));
 const mixed={credits:10000};execute({id:'m1',itemId:'s',intent:'open_long',quantity:10,leverage:1},{price:100},mixed,0);execute({id:'m2',itemId:'s',intent:'open_long',quantity:30,leverage:3},{price:100},mixed,0);near(mixed.stockPortfolio.positions.s.leverage,2);const close=execute({id:'m3',itemId:'s',intent:'close_long',quantity:20,leverage:1},{price:110},mixed,1);near(close.leverage,2);near(close.cashFlow,1200);near(close.realizedPnl,200);near(mixed.stockPortfolio.positions.s.margin,1000);
 const legacy={credits:0,stockPortfolio:{positions:{s:{itemId:'s',knownQty:10,costBasis:1000}},shortPositions:{},ledger:[]}};const expanded={...legacy,credits:10000,stockPortfolio:structuredClone(legacy.stockPortfolio)};execute({id:'old',itemId:'s',intent:'open_long',quantity:10,leverage:2},{price:100},expanded,0);near(expanded.stockPortfolio.positions.s.margin,1500);const oldClose=execute({id:'old-close',itemId:'s',intent:'close_long',quantity:5,leverage:3},{price:110},legacy,0);near(oldClose.leverage,1);near(legacy.credits,550);
 const liquidate=name==='sync'?Exchange.liquidate:context.liquidate;for(const side of ['long','short']){const p={credits:0,stockPortfolio:{positions:{},shortPositions:{},ledger:[]}},book=side==='long'?p.stockPortfolio.positions:p.stockPortfolio.shortPositions;book.s={itemId:'s',costBasis:3000,margin:1000,leverage:1,[side==='long'?'knownQty':'quantity']:30};const events=liquidate(p,{s:{price:side==='long'?60:140}},1);assert.equal(events.length,1);near(events[0].leverage,3);near(events[0].realizedPnl,-1000);near(events[0].cashFlow,0);}
 console.log(name+': equal-collateral ×1/×2/×3 gains/losses, partial/full close, fixed-share P/L, mixed effective leverage, ledger fields and old positions passed');
}
// Portfolio value is remaining equity, rather than borrowed long exposure.
for(const [file,name]of[['renderer/app.js','portfolioMetricsV1074'],['deploy/site/app/app.js','stockPortfolioStatsWebV1074']]){
 const src=fs.readFileSync(file,'utf8'),start=src.indexOf('  function '+name+'('),end=src.indexOf('\n  function ',start+5),code=src.slice(start,end);
 const ctx=vm.createContext({portfolioV1074:p=>p.stockPortfolio,positionQtyV1074:p=>p.knownQty,normalizeStockPlayerWebV1074:()=>{},stockQtyWebV1074:p=>p.knownQty});vm.runInContext(code+';globalThis.stats='+name,ctx);
 const p={stockPortfolio:{positions:{s:{itemId:'s',knownQty:30,costBasis:3000,margin:1000}},shortPositions:{},ledger:[]}},out=ctx.stats(p,{quotes:[{itemId:'s',price:110}]});near(out.marketValue,1300);near(out.invested,1000);near(out.unrealized,300);
}
console.log('Desktop/web leveraged long equity and unrealized profit display passed');
