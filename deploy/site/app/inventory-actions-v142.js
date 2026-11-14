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
    const copies=root.GRPGItemInstancesV215,instanceId=copies?.choose(user,source);
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
      copies?.bind(user,source.itemId,copies.slotKey(target.slot,target.index),instanceId);
    }else if(source.source!=='slot')throw Error('Предмет не надет');
    const next=api.normalize(user),after=api.layout(next);
    if(after.overflow.length>before.overflow.length)throw Error('Недостаточно ячеек для снятого снаряжения');
    const excess=l=>Math.max(0,l.weight-Number(l.user?.carryWeightMax??next.carryWeightMax));
    if(excess(after)>excess(before)+1e-9)throw Error('После снятия превышен переносимый вес');
    return next;
  }
  function attachmentControls(user,source,api,button,run){
    const copies=root.GRPGItemInstancesV215;
    const selected=copies.choose(user,source);
    const rows=()=>user.inventory.flatMap(row=>(row.instancesV215||[]).map(copy=>({item:api.item(row.itemId),copy})));
    const all=rows();
    const host=all.find(row=>row.copy.id===selected);
    if(!host)return;
    const sameMount=(a,b)=>String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();
    const mountNames=copies.mounts(host.item);
    const change=(hostId,index,mod)=>{
      return run(raw=>{
        const next=api.normalize(clone(raw)),before=api.layout(next);
        const row=next.inventory.find(entry=>entry.instancesV215?.some(copy=>copy.id===hostId));
        const copy=row?.instancesV215.find(entry=>entry.id===hostId);
        copies.changeAttachment(next,copy,index,mod?.item,mod?.copy.id,api.item(row?.itemId));
        const normalized=api.normalize(next),after=api.layout(normalized);
        if(after.overflow.length>before.overflow.length)throw Error('Не хватает места в инвентаре');
        if(after.weight>Math.max(before.weight,normalized.carryWeightMax)+1e-9)throw Error('Превышен переносимый вес');
        Object.assign(raw,normalized);
      });
    };
    for(const entry of host.copy.attachments||[]){
      const name=api.item(entry.itemId)?.name||entry.itemId;
      button('Снять: '+name+' · '+(mountNames[entry.mount]||'крепление '+(entry.mount+1)),change(host.copy.id,entry.mount));
    }
    if(host.item?.type!=='modification'||!host.item.attachmentMount)return;
    for(const target of all){
      if(target.copy.broken)continue;
      copies.mounts(target.item).forEach((name,index)=>{
        if(!sameMount(name,host.item.attachmentMount)||copies.installed(target.copy,index))return;
        button('Установить: '+target.item.name+' · '+name+' '+(index+1)+' · '+target.copy.id.slice(-6),change(target.copy.id,index,host));
      });
    }
  }
  function bind(api){
    function open(node){
      document.querySelector('.sheet-item-dialog')?.remove();
      const source={itemId:node.dataset.itemId,unitIndex:Number(node.dataset.unitIndex??-1),source:node.dataset.source||(node.hasAttribute('data-inv113-drag-slot')?'slot':'grid'),slot:node.dataset.slotType||node.dataset.slotV113,index:Number(node.dataset.slotIndex??node.dataset.slotIndexV113??-1)};
      const item=api.item(source.itemId),user=api.normalize(api.current());if(!item||!user)return;
      const dialog=document.createElement('dialog');dialog.className='sheet-item-dialog';dialog.setAttribute('aria-labelledby','sheet-item-title');
      const title=document.createElement('h2');title.id='sheet-item-title';title.textContent=item.name||source.itemId;
      const facts=document.createElement('dl');
      for(const row of root.GRPGItemFactsV141?.facts(item)||[]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=row.label;dd.textContent=String(row.value);facts.append(dt,dd);}
      const instances = root.GRPGItemInstancesV215;
      const copy = instances?.instance(user, source.itemId, source.unitIndex,
        source.source === 'slot' ? instances.slotKey(source.slot, source.index) : '');
      if (copy?.durabilityMax || copy?.broken) {
        const label = document.createElement('dt'), value = document.createElement('dd');
        label.textContent = 'Прочность';
        value.textContent = copy.durabilityMax
          ? copy.durability + ' / ' + copy.durabilityMax + (copy.broken ? ' · Сломан' : '')
          : 'Сломан';
        facts.append(label, value);
      }
      const message=document.createElement('p');message.setAttribute('role','status');
      const actions=document.createElement('div');actions.className='sheet-item-actions';
      const button=(label,handler)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=handler;actions.append(b);return b;};
      let busy=false;
      const run=target=>async()=>{if(busy)return;busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);try{await api.commit(u=>Object.assign(u,change(u,source,target,api)),target?'Экипировка обновлена':'Предмет снят');dialog.close();}catch(e){message.textContent=e.message;}finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}};
      if(source.source==='slot')button('Снять',run(null));else for(const target of choices(user,item,api.accepts))button(target.label,run(target));
      attachmentControls(user,source,api,button,mutator=>async()=>{
        if(busy)return;
        busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
        try{
          const result=await api.commit(mutator,'Модификации обновлены');
          if(result?.ok===false)throw Error(result.message||'Изменение не сохранено');
          dialog.close();
        }catch(error){message.textContent=error.message;}
        finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
      });
      if(api.details)button('Описание',()=>{dialog.close();api.details(source.itemId);});
      button('Закрыть',()=>dialog.close());dialog.append(title,facts,message,actions);
      dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
      dialog.addEventListener('close',()=>{dialog.remove();if(node.isConnected)node.focus({preventScroll:true});else document.querySelector(api.selector)?.focus({preventScroll:true});});
      document.body.append(dialog);dialog.showModal();
    }
    document.addEventListener('click',e=>{const node=e.target.closest?.(api.selector);if(!node)return;e.preventDefault();e.stopImmediatePropagation();open(node);},true);
    document.addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key))return;const node=e.target.closest?.(api.selector);if(!node)return;e.preventDefault();e.stopImmediatePropagation();open(node);},true);
  }
  root.GRPGInventoryMenuV142=Object.freeze({choices,change,bind});
})(window);
