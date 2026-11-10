/* One ticket draft per character, independent of the selected stock. */
(function(root){
'use strict';
const drafts=new Map(),panels=new WeakMap(),round=v=>Math.round(v*1e4)/1e4;
const names=['order-intent-v148','order-type-v148','order-quantity-v148','order-limit-v148','order-trigger-v148','order-trailing-v148','order-leverage-v148','stop-loss-v213','take-profit-v213'];
const key=o=>String(o.accountKey||''),attr=(prefix,name)=>'[data-'+prefix+'stock-'+name+']';
function capture(panel,prefix){const options=panels.get(panel);if(!options)return;const draft={...(drafts.get(key(options))||{})};for(const name of names){const input=panel.querySelector(attr(prefix,name));if(input)draft[name]=input.value;}drafts.set(key(options),draft);}
function maximum({player={},quotePrice,tradeRate},draft){
 const intent=draft['order-intent-v148']||'open_long',id=draft.itemId,book=player.stockPortfolio||{};
 if(intent==='close_long')return Math.max(0,Math.min(1e6,Math.trunc(Number(book.positions?.[id]?.knownQty)||0)));
 if(intent==='close_short')return Math.max(0,Math.min(1e6,Math.trunc(Number(book.shortPositions?.[id]?.quantity)||0)));
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
function positionCloser({send,filled,report}){
 let draft, pending=false, update;
 const retries=new Map();
 return function mount(root,{accountKey,player,ready}){
  const row=root?.querySelector('.stock-holding-v1074.selected[data-position-side]');
  let form=root?.querySelector('[data-stock-position-close]');
  if(!row){
   form?.remove();
   draft=update=null;
   return;
  }
  const {itemId,positionSide}=row.dataset,intent='close_'+positionSide;
  const key=JSON.stringify([accountKey,itemId,intent]);
  const newSelection=draft?.key!==key;
  if(newSelection)draft={key,quantity:'1'};
  const current=draft;
  const max=maximum({player},{itemId,'order-intent-v148':intent});
  if(form?.dataset.key!==key||row.nextElementSibling!==form){
   form?.remove();
   row.insertAdjacentHTML('afterend',`
    <form data-stock-position-close>
     <div class="stock-order-grid-v148" style="grid-template-columns:minmax(0,1fr) auto">
      <label>Количество акций<input class="input" name="quantity" type="number" min="1" step="1" required></label>
      <button class="secondary" type="button" data-close-all>Все</button>
      <button class="primary" type="submit" style="grid-column:1/-1">Закрыть ${positionSide==='short'?'шорт':'лонг'}</button>
     </div>
     <p class="small-note" data-close-available></p>
    </form>`);
   form=row.nextElementSibling;
   form.dataset.key=key;
  }
  const input=form.querySelector('input'),all=form.querySelector('[data-close-all]'),button=form.querySelector('[type="submit"]');
  if(input.value!==current.quantity)input.value=current.quantity;
  input.max=String(max);
  form.querySelector('[data-close-available]').textContent=ready?`Доступно к закрытию: ${max} шт. Исполнение по рынку.`:'Ожидание серверной котировки.';
  update=()=>{
   const quantity=Number(current.quantity);
   input.disabled=all.disabled=!ready||pending||max===0;
   button.disabled=input.disabled||!Number.isSafeInteger(quantity)||quantity<1||quantity>max;
  };
  input.oninput=()=>{current.quantity=input.value;update();};
  all.onclick=()=>{current.quantity=input.value=String(max);update();};
  form.onsubmit=async event=>{
   event.preventDefault();
   if(button.disabled||draft!==current||pending)return;
   const quantity=Number(current.quantity),job=JSON.stringify([key,quantity]);
   const operationId=retries.get(job)||crypto.randomUUID();
   retries.set(job,operationId);
   pending=true;
   update();
   try{
    const result=await send(player.id,{itemId,intent,quantity,type:'market',operationId});
    if(!result?.ok||result.status!=='filled'){
     if(result?.status==='rejected'||(result?.httpStatus>=400&&result.httpStatus<500))retries.delete(job);
     throw Error(result?.message||'Закрытие позиции не подтверждено');
    }
    retries.delete(job);
    filled(result,accountKey);
   }catch(error){
    if(error.status>=400&&error.status<500)retries.delete(job);
    report(error.message||String(error));
   }finally{
    pending=false;
    update?.();
   }
  };
  update();
  if(newSelection)form.scrollIntoView?.({block:'nearest'});
 };
}
// Capture before a stock-selection listener replaces its ticket DOM.
if(root.document)for(const type of ['input','change','click'])document.addEventListener(type,event=>{
 const panel=event.target?.closest?.('.stock-orders-v148');
 if(panel){const options=panels.get(panel);if(options){capture(panel,options.prefix||'');if(type!=='click')apply(panel,options,false);}}
 else if(type==='click')for(const live of document.querySelectorAll('.stock-orders-v148')){const o=panels.get(live);if(o)capture(live,o.prefix||'');}
},true);
root.GRPGStockTicketV214={maximum,render,hydrate,capture,positionCloser};
})(typeof window==='undefined'?globalThis:window);
