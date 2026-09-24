/* Shared tap/keyboard equipment actions. Adapters retain each client's save queue. */
(function(root){
  'use strict';
  const labels={primaryWeapon:'Основное оружие',secondaryWeapon:'Вторичное оружие',armor:'Броня',backpack:'Рюкзак'};
  const clone=x=>JSON.parse(JSON.stringify(x));
  function choices(user,item,accepts){
    const list=Object.keys(labels).filter(slot=>accepts(slot,item)).map(slot=>({slot,index:-1,label:`Надеть: ${labels[slot]}`}));
    if(accepts('implant',item))for(let index=0;index<user.implantSlotCount;index++)list.push({slot:'implant',index,label:`Установить: имплант ${index+1}`});
    return list;
  }
  function change(raw,source,target,api){
    const user=api.normalize(clone(raw)),before=api.layout(user),item=api.item(source.itemId);
    if(!item)throw Error('Предмет больше недоступен');
    const get=(slot,index)=>slot==='implant'?user.implantSlots?.[index]:user.equipmentSlots?.[slot];
    const set=(slot,index,id)=>{if(slot==='implant'){user.implantSlots[index]=id;user.installedImplantIds=user.implantSlots.filter(Boolean);}else user.equipmentSlots[slot]=id;};
    if(source.source==='slot'){
      if(get(source.slot,source.index)!==source.itemId)throw Error('Снаряжение изменилось. Откройте предмет повторно.');
      set(source.slot,source.index,'');
    }
    if(target){
      if(!choices(user,item,api.accepts).some(t=>t.slot===target.slot&&t.index===target.index))throw Error('Неподходящий слот');
      const owned=(user.inventory||[]).filter(r=>r.itemId===source.itemId).reduce((sum,r)=>sum+Number(r.qty||0),0);
      const equipped=[...Object.values(user.equipmentSlots||{}),...(user.implantSlots||[])].filter(id=>id===source.itemId).length;
      if(owned<=equipped)throw Error('Нет свободного экземпляра предмета');
      set(target.slot,target.index,source.itemId);
    }else if(source.source!=='slot')throw Error('Предмет не надет');
    const next=api.normalize(user),after=api.layout(next);
    if(after.overflow.length>before.overflow.length)throw Error('Недостаточно ячеек для снятого снаряжения');
    const excess=l=>Math.max(0,l.weight-Number(l.user?.carryWeightMax??next.carryWeightMax));
    if(excess(after)>excess(before)+1e-9)throw Error('После снятия превышен переносимый вес');
    return next;
  }
  function bind(api){
    function open(node){
      document.querySelector('.sheet-item-dialog')?.remove();
      const source={itemId:node.dataset.itemId,source:node.dataset.source||(node.hasAttribute('data-inv113-drag-slot')?'slot':'grid'),slot:node.dataset.slotType||node.dataset.slotV113,index:Number(node.dataset.slotIndex??node.dataset.slotIndexV113??-1)};
      const item=api.item(source.itemId),user=api.normalize(api.current());if(!item||!user)return;
      const dialog=document.createElement('dialog');dialog.className='sheet-item-dialog';dialog.setAttribute('aria-labelledby','sheet-item-title');
      const title=document.createElement('h2');title.id='sheet-item-title';title.textContent=item.name||source.itemId;
      const facts=document.createElement('dl');
      for(const row of root.GRPGItemFactsV141?.facts(item)||[]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=row.label;dd.textContent=String(row.value);facts.append(dt,dd);}
      const message=document.createElement('p');message.setAttribute('role','status');
      const actions=document.createElement('div');actions.className='sheet-item-actions';
      const button=(label,handler)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=handler;actions.append(b);return b;};
      let busy=false;
      const run=target=>async()=>{if(busy)return;busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);try{await api.commit(u=>Object.assign(u,change(u,source,target,api)),target?'Экипировка обновлена':'Предмет снят');dialog.close();}catch(e){message.textContent=e.message;}finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}};
      if(source.source==='slot')button('Снять',run(null));else for(const target of choices(user,item,api.accepts))button(target.label,run(target));
      if(api.details)button('Описание',()=>{dialog.close();api.details(source.itemId);});
      button('Закрыть',()=>dialog.close());dialog.append(title,facts,message,actions);
      dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
      dialog.addEventListener('close',()=>{dialog.remove();if(node.isConnected)node.focus();else document.querySelector(api.selector)?.focus();});
      document.body.append(dialog);dialog.showModal();
    }
    document.addEventListener('click',e=>{const node=e.target.closest?.(api.selector);if(!node)return;e.preventDefault();e.stopImmediatePropagation();open(node);},true);
    document.addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key))return;const node=e.target.closest?.(api.selector);if(!node)return;e.preventDefault();e.stopImmediatePropagation();open(node);},true);
  }
  root.GRPGInventoryMenuV142=Object.freeze({choices,change,bind});
})(window);
