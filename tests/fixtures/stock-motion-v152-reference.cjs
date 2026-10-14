// Frozen isolated-service motion from main 72f5c10, for measured before/after calibration.
'use strict';
const MIN_PRICE=.01,TICK_SECONDS=10;const round=v=>Math.round(v*10000)/10000;function activeImpulses(){return [];}
const MARKET_PATTERNS = [
 ['calm','trend-up','trend-up','range','trend-down','volatile','trend-up','calm'],
 ['range','trend-down','trend-down','volatile','trend-up','range','trend-down','calm'],
 ['calm','trend-up','trend-down','trend-up','trend-down','range','volatile','calm'],
 ['range','calm','breakout-up','trend-up','range','trend-down','volatile','calm'],
 ['calm','volatile','breakout-down','trend-down','range','trend-up','volatile','range'],
 ['range','trend-up','range','trend-up','trend-down','trend-down','volatile','calm'],
 ['calm','trend-down','range','trend-down','trend-up','trend-up','volatile','range'],
 ['volatile','range','calm','breakout-up','trend-down','range','trend-up','calm'],
 ['range','volatile','calm','breakout-down','trend-up','range','trend-down','calm'],
 ['calm','trend-up','volatile','trend-down','range','trend-up','trend-down','range'],
 ['range','trend-down','volatile','trend-up','calm','breakout-up','range','calm'],
 ['calm','range','trend-up','trend-down','volatile','breakout-down','range','calm']
];function hash32(value){let hash=0x811c9dc5;for(const char of String(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,0x01000193);}return hash>>>0;}
const random = seed => hash32(seed)/0x100000000;
function regime(campaign,itemId,tick){const phaseBlock=Math.floor(tick/900),cycle=Math.floor(phaseBlock/8),phase=phaseBlock%8,patternIndex=Math.floor(random(`${campaign}|${itemId}|pattern|${cycle}`)*MARKET_PATTERNS.length),mode=MARKET_PATTERNS[patternIndex][phase];if(mode==='trend-up')return[mode,.00001,.00008,1];if(mode==='trend-down')return[mode,-.000009,.00008,1];if(mode==='volatile')return[mode,0,.00004,1.8];if(mode==='range')return[mode,0,.0005,.65];if(mode==='breakout-up')return[mode,.000025,.00003,1.35];if(mode==='breakout-down')return[mode,-.000025,.00003,1.35];return['calm',.000001,.00025,.35];}
function eventImpulse(rows){return rows.reduce((sum,event)=>{const steps=Math.max(1,Math.ceil((event.end_tick-event.start_tick)/TICK_SECONDS)),start=Math.max(MIN_PRICE,Number(event.start_price)||1),target=Math.max(MIN_PRICE,Number(event.target_price)||start*(1+Number(event.percent||0)/100));return sum+Math.log(target/start)/steps;},0);}
function nextPrice(campaign,q,tick){const impulses=activeImpulses(campaign,q.item_id,tick);if(impulses.length){const delta=eventImpulse(impulses),price=Math.max(MIN_PRICE,round(q.price*Math.exp(delta))),finish=impulses.some(event=>tick+TICK_SECONDS>=event.end_tick);return{price,regime:'dm-impulse',anchor:finish?price:null};}const [name,drift,reversion,noiseScale]=regime(campaign,q.item_id,tick),noise=(random(`${campaign}|${q.item_id}|noise|${tick}`)-.5)*.00035*q.volatility*noiseScale,deviation=(q.anchor-q.price)/Math.max(q.anchor,MIN_PRICE),shockRoll=random(`${campaign}|${q.item_id}|shock|${tick}`),shock=shockRoll>.99985?(random(`${campaign}|${q.item_id}|shock-dir|${tick}`)<.5?-1:1)*(.002+random(`${campaign}|${q.item_id}|shock-size|${tick}`)*.004)*q.volatility:0,delta=drift*q.volatility+noise+deviation*reversion+shock;return{price:Math.max(MIN_PRICE,round(q.price*Math.exp(delta))),regime:name,anchor:null};}

module.exports={next:(o)=>nextPrice(o.campaignId,{item_id:o.itemId,price:o.price,anchor:o.anchor,volatility:o.volatility},o.tick)};
