/* Shared deterministic intraday motion. ES5/CommonJS for Node and PocketBase's JS runtime. */
'use strict';
var MIN_PRICE=.01,PHASE_SECONDS=300,HALF_LIFE_SECONDS=180,EXCURSION=.038,NOISE_PER_SQRT_SECOND=.00035;
var PATTERNS=[
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
];
function finite(value,fallback){var n=Number(value);return isFinite(n)?n:fallback;}
function random(seed){var h=0x811c9dc5,text=String(seed);for(var i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193);}h^=h>>>16;h=Math.imul(h,0x85ebca6b);h^=h>>>13;h=Math.imul(h,0xc2b2ae35);h^=h>>>16;return(h>>>0)/0x100000000;}
function phase(campaign,item,block){
 var cycle=Math.floor(block/8),index=((block%8)+8)%8,seed=campaign+'|'+item+'|intraday-v165|'+cycle,pattern=PATTERNS[Math.floor(random(seed+'|pattern')*PATTERNS.length)],mode=pattern[index];
 // Mirror entire patterns with equal probability: no permanent bullish/bearish direction.
 var orientation=random(seed+'|orientation')<.5?-1:1;if(orientation<0){if(mode==='trend-up')mode='trend-down';else if(mode==='trend-down')mode='trend-up';else if(mode==='breakout-up')mode='breakout-down';else if(mode==='breakout-down')mode='breakout-up';}
 var draw=random(campaign+'|'+item+'|level|'+block),level=(draw*2-1)*.3;
 if(mode==='trend-up'||mode==='breakout-up')level=.4+.6*draw;
 if(mode==='trend-down'||mode==='breakout-down')level=-(.4+.6*draw);
 if(mode.indexOf('breakout')===0)level*=1.2;if(mode==='calm')level*=.25;if(mode==='volatile')level=(draw*2-1)*.8;
 return {id:mode,level:level,noise:mode==='volatile'?1.8:mode==='calm'?.45:1};
}
function next(options){
 var campaign=String(options.campaignId||'main'),item=String(options.itemId||''),tick=finite(options.tick,0),seconds=Math.max(.001,finite(options.stepSeconds,10)),price=Math.max(MIN_PRICE,finite(options.price,100)),anchor=Math.max(MIN_PRICE,finite(options.anchor,price)),vol=Math.max(.05,Math.min(8,finite(options.volatility,1)));
 var offset=Math.floor(random(campaign+'|'+item+'|phase-offset')*PHASE_SECONDS),time=tick+offset,block=Math.floor(time/PHASE_SECONDS),fraction=(time-block*PHASE_SECONDS)/PHASE_SECONDS,weight=fraction*fraction*(3-2*fraction),a=phase(campaign,item,block),b=phase(campaign,item,block+1);
 var target=(a.level*(1-weight)+b.level*weight)*EXCURSION*vol,k=Math.LN2/HALF_LIFE_SECONDS,decay=Math.exp(-k*seconds),deviation=Math.log(price/anchor);
 // Zero-mean innovations; time-scaled OU variance keeps 1s and 10s backends comparable.
 var seed=campaign+'|'+item+'|tick|'+tick,z=(random(seed+'|a')+random(seed+'|b')+random(seed+'|c')-1.5)*2;
 var noise=z*NOISE_PER_SQRT_SECOND*vol*a.noise*Math.sqrt((1-decay*decay)/(2*k));
 // The reference can move: ordinary prices do not always return to the original entry band.
 var sentiment=(random(campaign+'|'+item+'|sentiment|'+Math.floor(tick/1800))*2-1);
 var anchorNoise=(random(seed+'|anchor-a')+random(seed+'|anchor-b')-1)*.00005*vol*Math.sqrt(seconds);
 var jump=0;
 // Draw news per second, even when the service advances in ten-second batches.
 for(var eventTick=Math.floor(tick-seconds)+1;eventTick<=Math.floor(tick);eventTick++){
  var news=campaign+'|'+item+'|news-v169|'+eventTick;
  if(random(news+'|arrival')<1/14400)jump+=(random(news+'|direction')<.5?-1:1)*(.025+random(news+'|size')*.05)*vol;
 }
 var anchorDelta=sentiment*.000004*vol*seconds+anchorNoise+jump;
 var nextAnchor=Math.max(MIN_PRICE,anchor*Math.exp(anchorDelta));
 var logPrice=Math.log(anchor)+anchorDelta+deviation*decay+target*(1-decay)+noise,result=Math.max(MIN_PRICE,Math.round(Math.exp(logPrice)*10000)/10000);
 return {price:result,regime:jump?'news-shock':a.id,anchor:nextAnchor};
}
module.exports={version:169,MIN_PRICE:MIN_PRICE,PHASE_SECONDS:PHASE_SECONDS,HALF_LIFE_SECONDS:HALF_LIFE_SECONDS,EXCURSION:EXCURSION,PATTERNS:PATTERNS,next:next};
