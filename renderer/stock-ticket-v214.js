/* One ticket draft per character, independent of the selected stock. */
(function(root){
'use strict';
const drafts=new Map(),panels=new WeakMap(),round=v=>Math.round(v*1e4)/1e4;
const names=['order-intent-v148','order-type-v148','order-quantity-v148','order-limit-v148','order-trigger-v148','order-trailing-v148','order-leverage-v148','stop-loss-v213','take-profit-v213'];
const key=o=>String(o.accountKey||''),attr=(prefix,name)=>'[data-'+prefix+'stock-'+name+']';
function capture(panel,prefix){const options=panels.get(panel);if(!options)return;const draft={...(drafts.get(key(options))||{})};for(const name of names){const input=panel.querySelector(attr(prefix,name));if(input)draft[name]=input.value;}drafts.set(key(options),draft);}
function maximum({player={},quotePrice,tradeRate},draft){
 const intent=draft['order-intent-v148']||'open_long',id=draft.itemId,book=player.stockPortfolio||{};
 if(intent==='close_long')return Math.max(0,Math.trunc(Number(book.positions?.[id]?.knownQty)||0));
 if(intent==='close_short')return Math.max(0,Math.trunc(Number(book.shortPositions?.[id]?.quantity)||0));
 const limit=Number(draft['order-limit-v148']),price=Math.max(.01,draft['order-type-v148']==='limit'&&limit>0?limit:Number(quotePrice)),lev=Math.max(1,Math.min(3,Number(draft['order-leverage-v148'])||1)),fee=Number(tradeRate),cash=Math.max(0,Number(player.credits)||0);
 if(!(price>0)||!Number.isFinite(fee)||fee<0)return null;
 const cost=q=>round(price*q/lev)+round(price*q*fee);
 let qty=Math.max(0,Math.min(1e6,Math.floor(cash/(price/lev+price*fee))));
 while(qty>0&&cost(qty)>cash+1e-9)qty--;
 while(qty<1e6&&cost(qty+1)<=cash+1e-9)qty++;
 return qty;
}
function apply(panel,options,restore=true){
 const prefix=options.prefix||'',draft=restore?{...(drafts.get(key(options))||{})}:{};
 if(restore)for(const name of names){const input=panel.querySelector(attr(prefix,name));if(input&&draft[name]!==undefined)input.value=draft[name];}
 panels.set(panel,options);capture(panel,prefix);
 const current={...(drafts.get(key(options))||{}),itemId:options.itemId},max=maximum(options,current),input=panel.querySelector(attr(prefix,'order-quantity-v148'));
 if(input&&max!==null){input.max=String(max);input.min=max? '1':'0';const n=Number(input.value);if(input.value!==''&&Number.isFinite(n))input.value=String(Math.max(max?1:0,Math.min(max,Math.trunc(n))));}
 const closing=String(current['order-intent-v148']||'').startsWith('close_');
 for(const name of ['stop-loss-v213','take-profit-v213']){const input=panel.querySelector(attr(prefix,name));if(input){input.disabled=closing;if(closing)input.value='';}}
 panel.dataset.orderType=current['order-type-v148']||'market';
 const submit=panel.querySelector(attr(prefix,'submit-v148'));if(submit){submit.disabled=max===0;submit.title=max===0?'Нет доступного количества для этой операции':'';}
 capture(panel,prefix);return panel;
}
function render(html,options){const template=document.createElement('template');template.innerHTML=html;const panel=template.content.querySelector('.stock-orders-v148');if(panel&&panel.querySelector(attr(options.prefix||'','order-quantity-v148'))){apply(panel,options);for(const input of panel.querySelectorAll('input'))input.setAttribute('value',input.value);for(const select of panel.querySelectorAll('select'))for(const option of select.options)option.toggleAttribute('selected',option.value===select.value);}return template.innerHTML;}
function hydrate(panel,options){if(panel)apply(panel,options);}
// Capture before a stock-selection listener replaces its ticket DOM.
if(root.document)for(const type of ['input','change','click'])document.addEventListener(type,event=>{
 const panel=event.target?.closest?.('.stock-orders-v148');
 if(panel){const options=panels.get(panel);if(options){capture(panel,options.prefix||'');if(type!=='click')apply(panel,options,false);}}
 else if(type==='click')for(const live of document.querySelectorAll('.stock-orders-v148')){const o=panels.get(live);if(o)capture(live,o.prefix||'');}
},true);
root.GRPGStockTicketV214={maximum,render,hydrate,capture};
})(typeof window==='undefined'?globalThis:window);
