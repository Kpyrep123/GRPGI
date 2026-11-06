'use strict';
const assert=require('node:assert/strict');
const A=require('../market-service/accounting-v213');
const fees=A.rates({}),near=(a,b)=>assert.ok(Math.abs(a-b)<.0002,`${a} != ${b}`);
for(const side of ['long','short'])for(const leverage of [1,2,3]){
 const p={credits:10000,stockPortfolio:{positions:{},shortPositions:{},ledger:[]}},book=p.stockPortfolio,position={itemId:'s',[side==='long'?'knownQty':'quantity']:30,costBasis:3000,margin:3000/leverage};
 book[side==='long'?'positions':'shortPositions'].s=position;
 const prices=new Map([['s',110]]),start=1700000000;
 A.accrue(p,prices,start,fees);near(p.credits,10000);
 A.accrue(p,prices,start+86400,fees);
 near(p.credits,10000-3300*fees.custodyDailyRate-(3000-3000/leverage)*fees.borrowDailyRate);
 const paid=p.credits;A.accrue(p,prices,start+86400,fees);near(p.credits,paid);
 assert.equal(book.ledger.length,1);near(book.ledger[0].total,10000-paid);
}
// Fractional charges are accumulated instead of disappearing at every timer tick.
const fractional={credits:1,stockPortfolio:{positions:{s:{knownQty:1,costBasis:.01,margin:.01,lastFeeAt:1}},shortPositions:{},ledger:[]}};
for(let t=11;t<=86401;t+=10)A.accrue(fractional,new Map([['s',.01]]),t,{tradeRate:0,borrowDailyRate:0,custodyDailyRate:1});
near(fractional.credits,.99);
assert.throws(()=>A.rates({MARKET_TRADE_FEE_RATE:-1}));
assert.deepEqual(A.protection({intent:'open_long',stopLoss:90,takeProfit:120},100),{stopLoss:90,takeProfit:120});
assert.deepEqual(A.protection({intent:'open_short',stopLoss:110,takeProfit:80},100),{stopLoss:110,takeProfit:80});
for(const body of [{intent:'open_long',stopLoss:101},{intent:'open_short',takeProfit:101},{intent:'close_long',stopLoss:90},{intent:'open_long',takeProfit:'nan'}])assert.throws(()=>A.protection(body,100));
const profile={credits:100,stockPortfolio:{positions:{},shortPositions:{},ledger:[]}};
A.editPosition(profile,{action:'add',itemId:'s',side:'short',quantity:3,leverage:3,entryPrice:100},100,1);
near(profile.stockPortfolio.shortPositions.s.margin,100);assert.equal(profile.credits,100);
const expected={quantity:3,costBasis:300,margin:100};
assert.throws(()=>A.editPosition(profile,{action:'delete',itemId:'s',side:'short',expected:{...expected,quantity:2}},100,2));
A.editPosition(profile,{action:'set',itemId:'s',fromSide:'short',side:'long',quantity:2,leverage:2,entryPrice:90,expected},100,2);
assert(!profile.stockPortfolio.shortPositions.s);near(profile.stockPortfolio.positions.s.margin,90);
A.editPosition(profile,{action:'delete',itemId:'s',side:'long',expected:{quantity:2,costBasis:180,margin:90}},100,3);
assert(!profile.stockPortfolio.positions.s);assert.equal(profile.credits,100);
console.log('PASS daily long/short ×1–×3 fees, no retroactive/double charge, fractional carry, protection validation, live position edits and conflict detection');
