/* Shared Hub merchant presentation. World/profile mutations belong to the runtime adapter. */
(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const size=i=>({w:Math.max(1,parseInt(i.inventoryWidth??i.sizeWidth,10)||1),h:Math.max(1,parseInt(i.inventoryHeight??i.sizeHeight,10)||1)});
  function thumb(item,render){
    if(render)return `<span class="hub-trade-image-v163">${render(item)}</span>`;
    return `<span class="hub-trade-image-v163">${item.image?`<img src="${esc(item.image)}" alt="${esc(item.name||item.id)}" loading="lazy">`:`<span class="hub-trade-placeholder-v163" aria-label="No image">${esc((item.name||item.id||'?').slice(0,2).toUpperCase())}</span>`}</span>`;
  }
  function open(O){
    window.GRPGDialogViewV161?.active?.leave();document.querySelector('.hub-modal-v153')?.remove();
    const n=document.createElement('div'),previous=document.activeElement;
    n.className='hub-modal-v153 hub-trade-v163';n.setAttribute('role','dialog');n.setAttribute('aria-modal','true');n.setAttribute('aria-label',O.name||'Merchant');
    n.innerHTML=`<section class="hub-trade-window-v163"><header class="hub-trade-head-v163"><div><small>TRADING TERMINAL</small><h2>${esc(O.name||'Merchant')}</h2></div><b>Credits: <span data-credits></span></b><button class="secondary" data-close>Leave</button></header><div class="hub-trade-columns-v163"><section class="hub-trade-goods-v163" aria-label="Merchant goods"><h3>Goods</h3><div class="hub-trade-tools-v163"><input class="input" data-trade-search aria-label="Search goods" placeholder="Search goods"><select class="select" data-trade-category aria-label="Equipment category"><option value="all">All equipment</option></select></div><div class="hub-trade-offers-scroll-v163"><div class="hub-trade-grid-v163" data-trade-offers></div></div><div class="hub-trade-details-v163" data-trade-details></div></section><section class="hub-trade-inventory-v163" aria-label="Player inventory"><div class="hub-trade-inventory-head-v163"><h3>Inventory</h3><span data-trade-capacity></span></div><div class="hub-trade-inventory-scroll-v163"><div class="hub-trade-inventory-grid-v163" data-trade-inventory></div><div class="hub-trade-overflow-v163" data-trade-overflow></div><div class="hub-trade-equipped-v163" data-trade-equipped></div></div></section></div><div role="status" aria-live="polite" data-status></div></section>`;
    document.body.append(n);n.addEventListener('error',e=>{if(e.target.tagName==='IMG'&&e.target.closest('.hub-trade-image-v163'))e.target.closest('.hub-trade-image-v163').innerHTML='<span class="hub-trade-placeholder-v163" aria-label="Image unavailable">'+esc((e.target.alt||'?').slice(0,2).toUpperCase())+'</span>';},true);
    let selection=null,pending=false,quantity=1;
    const offers=O.rotation.offers,lookup=new Map(offers.map(e=>[e.itemId,e])),categoryAPI=window.GRPGMarketCategoriesV144;
    const categories=categoryAPI?.categories(offers,O.item)||[];
    n.querySelector('[data-trade-category]').innerHTML+=""+categories.map(c=>`<option value="${esc(c.label)}">${esc(c.label)} (${c.count})</option>`).join('');
    const close=()=>{n.remove();if(previous?.isConnected)previous.focus();O.onLeave?.();};
    n.querySelector('[data-close]').onclick=close;n.addEventListener('click',e=>{if(e.target===n)close();});
    n.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const fields=[...n.querySelectorAll('button,input,select')].filter(x=>!x.disabled&&x.getClientRects().length),first=fields[0],last=fields.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
    ['pointerdown','mousedown','mouseup','click','dblclick','contextmenu','wheel','keyup'].forEach(t=>n.addEventListener(t,e=>e.stopPropagation()));
    const photo=i=>thumb(i,O.itemThumb);
    function tile(i,{source,unitIndex=-1,slot='',index=-1,pos=null,w=size(i).w,h=size(i).h,price=null,qty=1}={}){
      const active=selection?.itemId===i.id&&selection?.source===source&&selection?.unitIndex===unitIndex&&selection?.slot===slot&&selection?.index===index;
      const place=pos?`grid-column:${pos.x+1}/span ${w};grid-row:${pos.y+1}/span ${h}`:`grid-column:span ${w};grid-row:span ${h}`;
      return `<button type="button" class="hub-trade-tile-v163 ${active?'selected':''}" data-trade-item="${esc(i.id)}" data-source="${source}" data-unit-index="${unitIndex}" data-slot="${esc(slot)}" data-slot-index="${index}" style="${place}" ${source==='market'?'draggable="true"':''} ${pending?'disabled':''} title="${esc(i.name||i.id)} · ${w}×${h}">${photo(i)}<span>${esc(i.name||i.id)}</span><small>${w}×${h}${qty>1?` · ×${qty}`:''}${price===null?'':` · ${esc(price)} cr.`}</small></button>`;
    }
    function renderOffers(){
      const q=n.querySelector('[data-trade-search]').value.trim().toLowerCase(),cat=n.querySelector('[data-trade-category]').value;
      const rows=offers.filter(e=>{const i=O.item(e.itemId);return i&&(!q||String(i.name||i.id).toLowerCase().includes(q))&&(cat==='all'||categoryAPI?.category(i)===cat);});
      n.querySelector('[data-trade-offers]').innerHTML=rows.map(e=>tile(O.item(e.itemId),{source:'market',price:e.price})).join('')||'<p class="hub-trade-empty-v163">No goods available.</p>';bindTiles(n.querySelector('[data-trade-offers]'));
    }
    function renderInventory(){
      const p=O.player(),layout=O.inventoryLayout?.(p);n.querySelector('[data-credits]').textContent=p.credits||0;
      const grid=n.querySelector('[data-trade-inventory]');
      if(layout){
        grid.style.setProperty('--trade-inv-cols',layout.cols||5);
        grid.innerHTML=Array.from({length:layout.size},(_,j)=>`<span class="hub-trade-cell-v163" style="grid-column:${j%layout.cols+1};grid-row:${Math.floor(j/layout.cols)+1}" aria-hidden="true"></span>`).join('')+(layout.instances||[]).map(x=>tile(x.item||O.item(x.itemId)||{id:x.itemId,name:x.itemId},{source:'inventory',unitIndex:x.unitIndex,pos:x.pos,w:x.w,h:x.h,qty:x.qty||1})).join('');
        const used=[...(layout.instances||[]),...(layout.overflow||[])].reduce((a,x)=>a+x.w*x.h,0),weight=Number(layout.weight),limit=layout.user?.carryWeightMax??p.carryWeightMax;
        n.querySelector('[data-trade-capacity]').textContent=`${used} / ${layout.size} cells${Number.isFinite(weight)?` · Weight ${weight.toFixed(1)}${limit!=null?` / ${limit}`:''}`:''}`;
        n.querySelector('[data-trade-overflow]').innerHTML=(layout.overflow||[]).length?'<h4>Outside inventory capacity</h4><div class="hub-trade-grid-v163">'+layout.overflow.map(x=>tile(x.item||O.item(x.itemId)||{id:x.itemId,name:x.itemId},{source:'inventory',unitIndex:x.unitIndex,w:x.w,h:x.h})).join('')+'</div>':'';
      }else{
        grid.innerHTML=(p.inventory||[]).filter(e=>e.qty>0).map(e=>tile(O.item(e.itemId)||{id:e.itemId,name:e.itemId},{source:'inventory',unitIndex:0})).join('');
        n.querySelector('[data-trade-capacity]').textContent='';
      }
      if(layout?.text?.length)n.querySelector('[data-trade-overflow]').innerHTML+='<h4>Documents and zero-size items</h4><div class="hub-trade-equipped-list-v163">'+layout.text.map(x=>{const index=[...Object.values(p.equipmentSlots||{}),...(p.implantSlots||[])].filter(id=>id===x.itemId).length;return `<button type="button" data-trade-item="${esc(x.itemId)}" data-source="inventory" data-unit-index="${index}" data-slot="" data-slot-index="-1">${photo(x.item)}<span>${esc(x.item.name||x.itemId)} · ×${x.qty}</span></button>`;}).join('')+'</div>';
      const slots=Object.entries(p.equipmentSlots||{}).filter(([,id])=>id).map(([slot,id])=>({slot,id,index:-1}));(p.implantSlots||[]).forEach((id,index)=>{if(id)slots.push({slot:'implant',id,index});});
      n.querySelector('[data-trade-equipped]').innerHTML=slots.length?'<h4>Equipped</h4><div class="hub-trade-equipped-list-v163">'+slots.map(x=>{const i=O.item(x.id)||{id:x.id,name:x.id};return `<button type="button" data-trade-item="${esc(x.id)}" data-source="equipped" data-slot="${esc(x.slot)}" data-slot-index="${x.index}" data-unit-index="-1" ${pending?'disabled':''}>${photo(i)}<span>${esc(i.name||i.id)}<small>${esc(x.slot)}</small></span></button>`;}).join('')+'</div>':'';
      bindTiles(n.querySelector('.hub-trade-inventory-scroll-v163'));
    }
    function bindTiles(root){root.querySelectorAll('[data-trade-item]').forEach(b=>{
      b.onclick=()=>{if(pending)return;selection={itemId:b.dataset.tradeItem,source:b.dataset.source,unitIndex:Number(b.dataset.unitIndex),slot:b.dataset.slot,index:Number(b.dataset.slotIndex)};quantity=1;renderOffers();renderInventory();renderDetails();};
      if(b.draggable)b.ondragstart=e=>{if(pending){e.preventDefault();return;}selection={itemId:b.dataset.tradeItem,source:'market',unitIndex:-1,slot:'',index:-1};quantity=1;e.dataTransfer.setData('application/x-grpgi-hub-item',b.dataset.tradeItem);e.dataTransfer.effectAllowed='copy';renderDetails();};
    });}
    function check(){
      if(!selection)return 'Select an item.';if(!O.available())return 'The merchant is no longer available.';
      if(selection.source==='equipped')return 'Equipped item';
      const i=O.item(selection.itemId),offer=lookup.get(selection.itemId);if(!i||!offer)return 'This merchant does not accept this item.';
      if(selection.source==='inventory'){const p=O.player(),row=(p.inventory||[]).find(e=>e.itemId===selection.itemId),equipped=[...Object.values(p.equipmentSlots||{}),...(p.implantSlots||[])].filter(id=>id===selection.itemId).length;if(!row||selection.unitIndex<equipped||selection.unitIndex>=Number(row.qty))return 'The inventory item changed or is equipped.';}
      if(selection.source==='market'){
        if(!Number.isSafeInteger(quantity)||quantity<1||quantity>10000)return 'Enter a quantity from 1 to 10,000.';
        if(O.once&&quantity!==1)return 'This interaction is available once.';
        if(Number(O.player().credits||0)<offer.price*quantity)return 'Insufficient credits.';
        const room=O.canAdd?.(O.player(),i.id,quantity);if(room?.ok===false)return room.reason||'Not enough inventory space.';
      }
      return '';
    }
    function renderDetails(){
      const root=n.querySelector('[data-trade-details]'),i=selection&&O.item(selection.itemId);
      if(!i){root.innerHTML='<p class="hub-trade-empty-v163">Select an item to view its image, stats and description.</p>';return;}
      const offer=lookup.get(i.id),buy=selection.source==='market',sell=selection.source==='inventory',price=buy?offer?.price:Math.floor(Number(offer?.price||0)*.7),sz=size(i);
      const requirements=Object.entries(i.requirements||{}).filter(([,v])=>Number(v)>0).map(([k,v])=>`${k}: ${v}`).join(' · ')||'None';
      root.innerHTML=`<div class="hub-trade-detail-head-v163">${photo(i)}<div><h3>${esc(i.name||i.id)}</h3><b>${buy?'Buy':sell?'Sell':'Equipped'}${offer&&selection.source!=='equipped'?` · ${price} cr.`:''}</b></div></div><div class="hub-trade-facts-v163">${window.GRPGItemFactsV141?.pills(i)||`<span class="pill">${sz.w}×${sz.h}</span>`}</div><p class="hub-trade-description-v163">${esc(i.desc||i.description||i.summary||'No description available.')}</p><div class="hub-trade-requirements-v163"><b>Requirements:</b> ${esc(requirements)}</div>${Array.isArray(i.tags)&&i.tags.length?`<div class="hub-trade-tags-v163">${esc(i.tags.join(' · '))}</div>`:''}<div class="hub-trade-order-v163">${buy?`<label>Quantity <input class="input" type="number" data-trade-quantity min="1" max="${O.once?1:10000}" step="1" value="${quantity}" ${pending?'disabled':''}></label><b>Total: <span data-trade-total>${price*quantity}</span> cr.</b>`:''}${selection.source==='equipped'?'':`<button class="primary" ${buy?'data-buy':'data-sell'}="${esc(i.id)}">${buy?'Buy':'Sell'}</button>`}</div><p class="hub-trade-order-error-v163" data-trade-error></p>`;
      const input=root.querySelector('[data-trade-quantity]');if(input)input.oninput=()=>{quantity=Number(input.value);updateOrder();};
      const button=root.querySelector('[data-buy],[data-sell]');if(button)button.onclick=execute;
      updateOrder();
    }
    function updateOrder(){const message=check(),b=n.querySelector('[data-buy],[data-sell]');if(b){b.disabled=pending||Boolean(message);b.dataset.blocked=message?'1':'';}const error=n.querySelector('[data-trade-error]');if(error)error.textContent=message;const total=n.querySelector('[data-trade-total]');if(total)total.textContent=String((lookup.get(selection.itemId)?.price||0)*quantity);}
    async function execute(){
      if(pending)return;if(check()){updateOrder();return;}
      const chosen={...selection},amount=quantity;pending=true;n.dataset.busy='1';renderOffers();renderInventory();updateOrder();const input=n.querySelector('[data-trade-quantity]');if(input)input.disabled=true;
      try{await O.transact(chosen,chosen.source==='market'?amount:1);if(n.isConnected){n.querySelector('[data-status]').textContent=chosen.source==='market'?'Purchase saved.':'Sale saved.';renderInventory();renderDetails();}}
      catch(e){if(n.isConnected)n.querySelector('[data-status]').textContent=e.message;O.notify?.(e.message,'err');}
      finally{pending=false;n.dataset.busy='';if(n.isConnected){renderOffers();renderInventory();renderDetails();}}
    }
    n.querySelector('[data-trade-search]').oninput=renderOffers;n.querySelector('[data-trade-category]').onchange=renderOffers;
    const inventory=n.querySelector('.hub-trade-inventory-scroll-v163');inventory.ondragover=e=>{if(e.dataTransfer.types.includes('application/x-grpgi-hub-item')){e.preventDefault();e.dataTransfer.dropEffect='copy';}};
    inventory.ondrop=e=>{const id=e.dataTransfer.getData('application/x-grpgi-hub-item');if(!id||pending||!lookup.has(id))return;e.preventDefault();selection={itemId:id,source:'market',unitIndex:-1,slot:'',index:-1};quantity=1;renderDetails();execute();};
    const p=O.player();let profile=JSON.stringify([p.id,p.credits,p.inventory,p.equipmentSlots,p.implantSlots,p.inventorySize,p.carryWeightMax]);const timer=setInterval(()=>{if(!n.isConnected){clearInterval(timer);return;}if(!O.available()){close();return;}const p=O.player(),signature=JSON.stringify([p.id,p.credits,p.inventory,p.equipmentSlots,p.implantSlots,p.inventorySize,p.carryWeightMax]);if(signature!==profile&&!pending){profile=signature;renderInventory();updateOrder();}},500);
    renderOffers();renderInventory();renderDetails();n.querySelector('[data-trade-search]').focus();
    return {node:n,close};
  }
  window.GRPGMerchantUIV163={open,thumb,size};
})();
