import assert from 'node:assert/strict';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),models={before:require('./fixtures/stock-motion-v165-reference.cjs'),after:require('../market-service/stock-motion-v165.js')};
const quantile=(a,q)=>[...a].sort((x,y)=>x-y)[Math.floor(a.length*q)],metrics={};
for(const[label,model]of Object.entries(models)){
 const ranges=[],ends=[],returns=[],drawdowns=[];let jumps=0,positiveNews=0,negativeNews=0;
 for(let seed=0;seed<24;seed++){
  let price=100,anchor=100,lo=100,hi=100,cash=10000,qty=0,peak=10000,drawdown=0;
  for(let t=10;t<=86400;t+=10){
   const move=model.next({campaignId:'test'+seed%3,itemId:'stock_'+seed,price,anchor,tick:1700000000+seed*239+t,stepSeconds:10,volatility:1});
   if(move.regime==='news-shock'){jumps++;if(move.anchor>anchor)positiveNews++;else negativeNews++;}
   price=move.price;if(move.anchor)anchor=move.anchor;
   lo=Math.min(lo,price);hi=Math.max(hi,price);if(t%3600===0){ranges.push((hi/lo-1)*100);lo=hi=price;}
   // Fixed-band strategy, no lookahead: all available cash buys below 98 and sells above 101.
   if(!qty&&price<98){qty=Math.floor(cash/price);cash-=qty*price;}else if(qty&&price>101){cash+=qty*price;qty=0;}
   const equity=cash+qty*price;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,(1-equity/peak)*100);
  }
  ends.push((price/100-1)*100);returns.push((cash+qty*price)/100-100);drawdowns.push(drawdown);
 }
 metrics[label]={hourlyMedianPct:quantile(ranges,.5),hourlyP10Pct:quantile(ranges,.1),hourlyP90Pct:quantile(ranges,.9),holdingMedianPct:quantile(ends,.5),holdingMinPct:Math.min(...ends),holdingMaxPct:Math.max(...ends),strategyMedianPct:quantile(returns,.5),strategyLosingRuns:returns.filter(x=>x<0).length,strategyWorstPct:Math.min(...returns),strategyMaxDrawdownPct:Math.max(...drawdowns),newsEvents:jumps,positiveNews,negativeNews};
}
assert.ok(metrics.after.hourlyMedianPct>4.5&&metrics.after.hourlyMedianPct<5.5);assert.ok(metrics.before.hourlyMedianPct>11&&metrics.before.hourlyMedianPct<13);
assert.equal(metrics.before.strategyLosingRuns,0);assert.ok(metrics.after.strategyLosingRuns>0);assert.ok(metrics.after.strategyWorstPct< -5);assert.ok(metrics.after.strategyMaxDrawdownPct>metrics.before.strategyMaxDrawdownPct);assert.ok(metrics.after.holdingMinPct< -10&&metrics.after.holdingMaxPct>10);assert.ok(metrics.after.positiveNews>0&&metrics.after.negativeNews>0);
console.log(JSON.stringify(metrics,null,2));console.log('PASS: calibrated median range, news in both directions, broken fixed-band recovery and losing fixed-band strategy samples');
