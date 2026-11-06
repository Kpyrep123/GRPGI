import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {pathToFileURL} from 'node:url';
const {Window}=await import(pathToFileURL(process.env.HAPPY_DOM_MODULE));
const w=new Window({settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),ctx=vm.createContext(w);
vm.runInContext(fs.readFileSync('renderer/stock-ticket-v214.js','utf8'),ctx);
const T=w.GRPGStockTicketV214,player={credits:1000,stockPortfolio:{positions:{a:{knownQty:3}},shortPositions:{a:{quantity:2}}}};
const html=`<div class="stock-orders-v148"><select data-stock-order-intent-v148><option value="open_long">Long</option><option value="open_short">Short</option><option value="close_long">Close long</option><option value="close_short">Close short</option></select><select data-stock-order-type-v148><option value="market">Market</option><option value="limit">Limit</option></select><input value="1" data-stock-order-quantity-v148><input data-stock-order-limit-v148><select data-stock-order-leverage-v148><option value="1">1</option><option value="2">2</option><option value="3">3</option></select><input data-stock-stop-loss-v213><input data-stock-take-profit-v213><button data-stock-submit-v148>Send</button></div>`;
function mount(o){w.document.body.innerHTML=T.render(html,o);const p=w.document.querySelector('.stock-orders-v148');T.hydrate(p,o);return p;}
const options={accountKey:'main:p',itemId:'a',player,quotePrice:100,tradeRate:.001};
const get=(p,n)=>p.querySelector(`[data-stock-${n}-v148]`),change=(el,value,type='input')=>{el.value=String(value);el.dispatchEvent(new w.Event(type,{bubbles:true}));};
try{
 let p=mount(options);change(get(p,'order-quantity'),999);assert.equal(get(p,'order-quantity').value,'9');
 change(get(p,'order-leverage'),3,'change');change(get(p,'order-intent'),'open_short','change');change(get(p,'order-quantity'),5);
 p=mount({...options,itemId:'b',quotePrice:150});assert.equal(get(p,'order-quantity').value,'5');assert.equal(get(p,'order-intent').value,'open_short');assert.equal(get(p,'order-leverage').value,'3');
 p=mount({...options,itemId:'c',quotePrice:1000});assert.equal(get(p,'order-quantity').value,'2');assert.equal(get(p,'order-intent').value,'open_short');
 change(get(p,'order-type'),'limit','change');change(get(p,'order-limit'),100,'change');change(get(p,'order-quantity'),999);assert.equal(get(p,'order-quantity').value,'29');
 p=mount(options);change(get(p,'order-intent'),'close_long','change');assert.equal(get(p,'order-quantity').value,'3');assert(p.querySelector('[data-stock-stop-loss-v213]').disabled);
 change(get(p,'order-intent'),'close_short','change');assert.equal(get(p,'order-quantity').value,'2');
 p=mount({...options,accountKey:'main:another',player:{credits:0}});assert.equal(get(p,'order-quantity').value,'0');assert(p.querySelector('button').disabled);
 p=mount({...options,accountKey:'other:p'});assert.equal(get(p,'order-quantity').value,'1');assert.equal(get(p,'order-intent').value,'open_long');
 assert.equal(T.maximum({player:{credits:100},quotePrice:100,tradeRate:.001},{'order-leverage-v148':1}),0);
 assert.equal(T.maximum({player:{credits:100.1},quotePrice:100,tradeRate:.001},{'order-leverage-v148':1}),1);
 assert.equal(T.maximum({player:{credits:1000},quotePrice:100,tradeRate:.001},{'order-leverage-v148':3}),29);
 assert.equal(fs.readFileSync('renderer/stock-ticket-v214.js','utf8'),fs.readFileSync('deploy/site/app/stock-ticket-v214.js','utf8'));
 console.log('PASS stock ticket: input cap incl fees/rounding/leverage, preserved direction/quantity/limit across stocks, affordability after price change, close quantities, zero funds and account isolation');
}finally{await w.happyDOM.abort();}
