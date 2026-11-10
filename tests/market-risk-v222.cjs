'use strict';
const assert = require('node:assert/strict');
const Motion = require('../market-service/stock-motion-v165.js');
const Accounting = require('../market-service/accounting-v213.js');
const Risk = Accounting.marketRisk;
const motionKey = 'market-risk-v222-fixture';
const nextRisk = (options, exposure) => Risk.next(options, exposure, motionKey);
const {tradeRate} = Accounting.rates({});

const holdings = (id, direction, quantity, entry) => ({stockPortfolio:direction === 1
 ? {positions:{[id]:{knownQty:quantity,costBasis:quantity*entry}}}
 : {shortPositions:{[id]:{quantity,costBasis:quantity*entry}}}});
const long = holdings('alpha',1,100,100);
const short = holdings('alpha',-1,100,100);
assert.equal(Risk.pressure(100.2,Risk.openExposure([long]).get('alpha')),0);
assert.equal(Risk.pressure(98,Risk.openExposure([long]).get('alpha')),0);
assert.equal(Risk.pressure(103,Risk.openExposure([long]).get('alpha')),-1);
assert.equal(Risk.pressure(97,Risk.openExposure([short]).get('alpha')),1);
assert.equal(Risk.pressure(103,Risk.openExposure([long,short]).get('alpha')),0);
assert.equal(Risk.openExposure([{...long,role:'gm'}, {...short,__deleted:true}]).size,0);
assert.equal(Risk.openExposure([{credits:1e9}]).size,0);
const options={campaignId:'test',itemId:'alpha',price:103,anchor:103,volatility:1,tick:1700000000,stepSeconds:10};
const neutral = nextRisk(options);
assert.deepEqual(nextRisk(options), neutral);
assert.notDeepEqual(Risk.next(options, undefined, 'other-key'), neutral);

const longExposure = Risk.openExposure([long]).get('alpha');
const shortExposure = Risk.openExposure([holdings('alpha',-1,100,110)]).get('alpha');
let ordinary = 0, unchanged = 0, changedLong = 0, changedShort = 0, news = 0;
for (let n=0; n<10000; n++) {
 const tick = {...options, tick:options.tick+n*options.stepSeconds};
 const baseline = nextRisk(tick);
 const withLong = nextRisk(tick,longExposure);
 const withShort = nextRisk(tick,shortExposure);
 if (baseline.regime === 'news-shock') {
  news++;
  assert.deepEqual(withLong,baseline);
  assert.deepEqual(withShort,baseline);
  continue;
 }
 ordinary++;
 if (withLong.price === baseline.price && withShort.price === baseline.price) unchanged++;
 if (withLong.price !== baseline.price) changedLong++;
 if (withShort.price !== baseline.price) changedShort++;
 assert.ok(withLong.price <= baseline.price && baseline.price <= withShort.price);
 for (const move of [withLong,withShort]) {
  assert.ok(Math.abs(Math.abs(move.price-tick.price)-Math.abs(baseline.price-tick.price)) <= .00011);
 }
}
assert.ok(news > 0 && unchanged / ordinary > .88);
for (const changed of [changedLong,changedShort]) assert.ok(changed / ordinary > .04 && changed / ordinary < .06);

// Strategies see only quotes, including the EMA computed from past quotes.
// Every sample uses the same seed before and after, with identical fees and no leverage.
const day=86400, step=10, samples=64;
function run(strategy, direction, next) {
 const returns=[], wins=[], losses=[];
 let trades=0;
 for(let seed=0;seed<samples;seed++){
  const itemId='stock_'+seed, campaignId='test'+seed%3+'|fixture-'+seed%11;
  let price=100,anchor=100,average=100,cash=10000,position=null;
  for(let time=step;time<=day;time+=step){
   const move=next({campaignId,itemId,price,anchor,tick:1700000000+seed*239+time,stepSeconds:step,volatility:1},position?.exposure);
   price=move.price;anchor=move.anchor;average+=.025*(price-average);
   if(!position){
    const entrySignal=strategy==='bands' ? price<98 : direction*(price/average-1)<-.005;
    if(time===day||!entrySignal)continue;
    const quantity=Math.floor(cash/(price*(1+tradeRate)));
    if(!quantity)continue;
    const margin=price*quantity,fee=margin*tradeRate;
    cash-=margin+fee;
    position={quantity,entry:price,margin,fee,time,exposure:Risk.openExposure([holdings(itemId,direction,quantity,price)]).get(itemId)};
   }else{
    const change=direction*(price/position.entry-1);
    const exitSignal=strategy==='bands' ? price>101 : change>=.008||change<=-.035||time-position.time>=3600;
    if(time!==day&&!exitSignal)continue;
    const gross=direction*(price-position.entry)*position.quantity;
    const payout=Math.max(0,position.margin+gross)-price*position.quantity*tradeRate;
    const net=payout-position.margin-position.fee;
    cash+=payout;
    trades++;
    if(net>0)wins.push(net);
    if(net<0)losses.push(-net);
    position=null;
   }
  }
  returns.push((cash/10000-1)*100);
 }
 returns.sort((a,b)=>a-b);
 const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
 return {trades,winPct:100*wins.length/trades,averageWin:mean(wins),averageLoss:mean(losses),meanReturn:mean(returns),
  medianReturn:(returns[samples/2-1]+returns[samples/2])/2,losingDays:returns.filter(value=>value<0).length};
}

for(const [name,strategy,direction] of [['fixed bands','bands',1],['EMA long','ema',1],['EMA short','ema',-1]]){
 const before=run(strategy,direction,Motion.next),after=run(strategy,direction,nextRisk);
 console.log(name,{before,after});
 const minimumWinPct = strategy === 'bands' ? 50 : 60;
 assert.ok(after.winPct > minimumWinPct && after.averageLoss > after.averageWin, name);
 assert.ok(after.meanReturn < 0, name);
 if (strategy === 'bands') assert.ok(after.medianReturn <= 0, name);
 else assert.ok(after.medianReturn < 0 && after.losingDays > samples/2, name);
 assert.ok(after.medianReturn<before.medianReturn,name);
}
console.log('PASS market pressure direction, cap, neutral exposure and quote-only strategy calibration');
