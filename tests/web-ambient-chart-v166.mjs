import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script = fs.readFileSync('deploy/site/app/web-ambient-v166.js', 'utf8');
function setup({saved=false, blocked=false, rejection=''}={}) {
  const events={}, attributes={}, classes=new Set(), store=new Map(saved?[['grpg.web.ambientMuted.v166','true']]:[]);
  let audio;
  const button={title:'',setAttribute:(k,v)=>attributes[k]=v,classList:{toggle(k,v){v?classes.add(k):classes.delete(k);}},addEventListener:(k,v)=>events['button:'+k]=v};
  class Audio {
    constructor(src){audio=this;this.src=src;this.paused=true;this.calls=0;this.events={};}
    play(){this.calls++;if(rejection){const name=rejection;rejection='';return Promise.reject(Object.assign(new Error(),{name}));}this.paused=false;return Promise.resolve();}
    pause(){this.paused=true;}
    addEventListener(k,v){this.events[k]=v;}
  }
  vm.runInNewContext(script,{Audio,document:{documentElement:{dataset:{client:'web'}},getElementById:()=>button,addEventListener:(k,v)=>events[k]=v},localStorage:{getItem:k=>{if(blocked)throw Error();return store.get(k);},setItem:(k,v)=>{if(blocked)throw Error();store.set(k,v);}}});
  const gesture=()=>events.pointerdown({target:{closest:()=>null}}),click=()=>events['button:click']();
  return {audio,attributes,classes,store,gesture,click,events,button};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const normal=setup();assert.equal(normal.audio.volume,.05);assert.equal(normal.audio.loop,true);assert.equal(normal.audio.src,'./assets/audio/web_ambient.m4a');assert.equal(normal.audio.calls,0);
normal.gesture();normal.gesture();await flush();assert.equal(normal.audio.calls,1);
normal.click();assert.equal(normal.audio.muted,true);assert.equal(normal.audio.paused,true);assert.equal(normal.attributes['aria-pressed'],'true');assert.equal(normal.store.get('grpg.web.ambientMuted.v166'),'true');
normal.gesture();await flush();assert.equal(normal.audio.calls,1);normal.click();await flush();assert.equal(normal.audio.calls,2);assert.equal(normal.audio.volume,.05);assert.equal(normal.attributes['aria-pressed'],'false');
const saved=setup({saved:true});saved.gesture();await flush();assert.equal(saved.audio.calls,0);saved.click();await flush();assert.equal(saved.audio.calls,1);
const denied=setup({rejection:'NotAllowedError'});denied.gesture();await flush();assert.equal(denied.classes.has('is-unavailable'),false);denied.gesture();await flush();assert.equal(denied.audio.calls,2);
const missing=setup({rejection:'NotSupportedError',blocked:true});missing.gesture();await flush();assert.equal(missing.classes.has('is-unavailable'),true);missing.click();missing.click();await flush();assert.equal(missing.classes.has('is-unavailable'),false);
// Run the actual period-selection and chart functions against 400 minute candles.
const rows=Array.from({length:400},(_,i)=>({time:i*60,open:100+i,close:101+i,high:102+i,low:99+i}));
for (const web of [false,true]) {
  const src=fs.readFileSync(web?'deploy/site/app/app.js':'renderer/stock-exchange-v148.js','utf8');
  const counts=web?'stockPeriodCountsWebV150':'periodCounts',labels=web?'stockPeriodLabelsWebV150':'periodLabels',tf=web?'stockTimeframeWebV148':'timeframe',state=web?'stockExchangeWebV148':'exchange';
  const functions=web?['stockPeriodRowsWebV150','stockPeriodChangeWebV150','stockPeriodChangeMarkupWebV150','stockTechnicalWebV148']:['periodRows','periodChange','changeMarkup','chart'];
  const constants=src.split('\n').find(line=>line.includes(`const ${counts}=`));
  const code=functions.map(name=>{const start=src.indexOf(`function ${name}(`),end=src.indexOf('\n}',start);return web?src.slice(start,src.indexOf('\n',start)):name==='chart'?src.slice(start,end+2):src.slice(start,src.indexOf('\n',start));}).join('\n');
  const context=vm.createContext({esc:String,money:String,formatCredits:String,signedCreditsWebV1074:String,quote:()=>({price:500,indicators:{}}),liveStockQuoteWebV148:()=>({price:500,indicators:{}})});
  vm.runInContext(`${constants}\nlet ${tf}='1h',${state}=${JSON.stringify({candles:{a:rows}})};\n${code}`,context);
  for(const [period,count] of [['1h',60],['3h',180],['6h',360]]) {
    vm.runInContext(`${tf}='${period}'`,context);
    assert.equal(vm.runInContext(`${functions[0]}('a').length`,context),count);
    assert.equal(vm.runInContext(`${functions[1]}('a').change`,context),count);
    const chart=vm.runInContext(`${functions[3]}('a')`,context);
    assert.ok(chart.includes(`за ${period[0]} ч`));
    for(const p of ['1h','3h','6h'])assert.ok(chart.includes(`="${p}"`));
    assert.ok(!chart.includes('="1m"')&&!chart.includes('="5m"'));
  }
}
console.log('PASS: web ambient gesture/mute/persistence/retry/errors and desktop/web 1h/3h/6h chart ranges');
