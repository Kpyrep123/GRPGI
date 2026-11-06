/* Live DM portfolio editor; operations never depend on saving the character form. */
(function(){
'use strict';
if(typeof Configurator==='undefined'||!window.electronAPI?.editStockPortfolio)return;
const esc213=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money213=v=>Number(v||0).toLocaleString('ru-RU',{maximumFractionDigits:4});
const clone=value=>JSON.parse(JSON.stringify(value));
const live=new Map(),jobs=new Map();let loading=0;
function holdings(profile){const b=profile?.stockPortfolio||{};return [...Object.entries(b.positions||{}).map(([id,p])=>({...p,itemId:id,side:'long',quantity:(Number(p.knownQty)||0)+(Number(p.unpricedQty)||0)})),...Object.entries(b.shortPositions||{}).map(([id,p])=>({...p,itemId:id,side:'short',quantity:Number(p.quantity)||0}))].filter(p=>p.quantity>0);}
function rows(profile){return holdings(profile).map(p=>`<div class="row" data-stock-config-position-v213="${esc213(p.itemId)}" data-side="${p.side}"><span style="flex:1"><b>${esc213(Data.getItem(p.itemId)?.name||p.itemId)}</b> · ${p.side==='short'?'Шорт':'Лонг'} · ${p.quantity} шт. · ×${money213(p.costBasis/Math.max(.0001,p.margin??p.costBasis))}<br><small>Вход ${money213(p.costBasis/p.quantity)} · обеспечение ${money213(p.margin??p.costBasis)}</small></span><button class="secondary" type="button" data-stock-config-edit-v213>Изменить</button><button class="secondary" type="button" data-stock-config-delete-v213>Удалить</button></div>`).join('')||'<div class="small-note">Открытых позиций нет.</div>';}
function markup(user){const stocks=Object.values(EQUIPMENT||{}).filter(i=>String(i.type)==='stock');return `<section class="wc-stock-config-v213" data-stock-config-v213="${esc213(user.id)}"><div class="section-title">Акции персонажа</div><div class="small-note">Изменения сохраняются на сервере сразу. Выдача добавляет позицию с заданным обеспечением без списания денег; удаление не возвращает деньги. Редактирование и удаление отменяют связанную защиту. Это действия ДМа, биржевая комиссия за них не взимается.</div><button class="secondary" type="button" data-stock-config-refresh-v213>Обновить позиции</button><div data-stock-config-list-v213>${rows(user)}</div><div class="cols3"><label>Акция<select class="select" data-stock-config-item-v213>${stocks.map(i=>`<option value="${esc213(i.id)}">${esc213(i.name||i.id)}</option>`).join('')}</select></label><label>Направление<select class="select" data-stock-config-side-v213><option value="long">Лонг</option><option value="short">Шорт</option></select></label><label>Количество<input class="input" type="number" min="1" max="1000000" step="1" value="1" data-stock-config-qty-v213></label><label>Плечо<select class="select" data-stock-config-leverage-v213><option value="1">×1</option><option value="2">×2</option><option value="3">×3</option></select></label><label>Цена входа<input class="input" type="number" min=".0001" step=".0001" placeholder="Цена за акцию" data-stock-config-price-v213></label></div><div class="row"><button class="primary" type="button" data-stock-config-save-v213>Выдать акции</button><button class="secondary" type="button" data-stock-config-reset-v213>Новая позиция</button></div><div class="small-note" role="status" data-stock-config-status-v213></div></section>`;}
const render=Configurator.renderPlayerEditor.bind(Configurator);
Configurator.renderPlayerEditor=function(user){
 const html=render(user);if(!['gm','dm','master'].includes(String(App.currentUser?.role||'').toLowerCase()))return html;
 const template=document.createElement('template');template.innerHTML=html;
 const inventory=template.content.querySelector('[data-wc-inventory-editor-v1068]');
 if(!inventory)return html;inventory.insertAdjacentHTML('afterend',markup(user));
 queueMicrotask(()=>{const panel=document.querySelector('[data-stock-config-v213]');if(panel?.dataset.stockConfigV213===String(user.id))refresh(panel);});return template.innerHTML;
};
const collect=Configurator.collectEntity.bind(Configurator);
Configurator.collectEntity=function(type,form,...args){const entity=collect(type,form,...args);if(type==='players'&&entity){const latest=App.state.users?.[entity.id]||live.get(entity.id);if(latest?.stockPortfolio)entity.stockPortfolio=clone(latest.stockPortfolio);}return entity;};
function status(panel,message){panel.querySelector('[data-stock-config-status-v213]').textContent=message;}
function apply(panel,result){
 const id=panel.dataset.stockConfigV213;if(!result?.ok||!result.player)throw Error(result?.message||'Не удалось загрузить акции');
 if(Number.isFinite(result.playerVersion)&&typeof PlayerSync!=='undefined'){PlayerSync.applyRemoteRow({playerId:id,player:result.player,version:result.playerVersion,updatedAt:result.serverTime,updatedBy:'market-service-v213'},{authoritative:true,source:'stock-config-v213'});if(App.state.users?.[id])result={...result,player:App.state.users[id]};}
 live.set(id,clone(result.player));
 for(const profile of [App.state.users?.[id],typeof PLAYER_TEMPLATES!=='undefined'?PLAYER_TEMPLATES[id]:null])if(profile){profile.stockPortfolio=clone(result.player.stockPortfolio||{positions:{},shortPositions:{},ledger:[]});profile.credits=result.player.credits;}
 panel.querySelector('[data-stock-config-list-v213]').innerHTML=rows(result.player);
 const balance=panel.closest('form')?.querySelector('[name="credits"]');if(balance)balance.value=String(result.player.credits||0);
}
async function refresh(panel){const serial=++loading;status(panel,'Загрузка…');try{const result=await window.electronAPI.getStockExchange({playerId:panel.dataset.stockConfigV213});if(!panel.isConnected||serial!==loading)return;apply(panel,result);status(panel,'Позиции загружены с сервера.');}catch(error){status(panel,error.message);}}
function reset(panel){delete panel.dataset.editItem;delete panel.dataset.editSide;delete panel.dataset.expected;panel.querySelector('[data-stock-config-item-v213]').disabled=false;panel.querySelector('[data-stock-config-save-v213]').textContent='Выдать акции';}
function pick(panel,row){const profile=live.get(panel.dataset.stockConfigV213)||App.state.users?.[panel.dataset.stockConfigV213];return holdings(profile).find(p=>p.itemId===row.dataset.stockConfigPositionV213&&p.side===row.dataset.side);}
async function mutate(panel,body){const id=panel.dataset.stockConfigV213,key=JSON.stringify(body),prior=jobs.get(id),job=prior?.key===key?prior:{key,operationId:crypto.randomUUID()};jobs.set(id,job);
 const buttons=panel.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
 try{const result=await window.electronAPI.editStockPortfolio({...body,playerId:id,operationId:job.operationId});if(!result?.ok)throw Error(result?.message||'Изменение отклонено');apply(panel,result);jobs.delete(id);reset(panel);status(panel,'Портфель сохранён.');}
 catch(error){status(panel,error.message);}
 finally{buttons.forEach(b=>b.disabled=false);}
}
document.addEventListener('click',event=>{
 const button=event.target.closest?.('button'),panel=button?.closest('[data-stock-config-v213]');if(!panel)return;
 event.preventDefault();
 if(button.hasAttribute('data-stock-config-refresh-v213')){refresh(panel);return;}
 if(button.hasAttribute('data-stock-config-reset-v213')){reset(panel);return;}
 const row=button.closest('[data-stock-config-position-v213]');
 if(row){const p=pick(panel,row);if(!p)return;const expected={quantity:p.quantity,costBasis:p.costBasis,margin:p.margin??p.costBasis};
  if(button.hasAttribute('data-stock-config-delete-v213')){mutate(panel,{action:'delete',itemId:p.itemId,side:p.side,expected});return;}
  panel.dataset.editItem=p.itemId;panel.dataset.editSide=p.side;panel.dataset.expected=JSON.stringify(expected);
  const item=panel.querySelector('[data-stock-config-item-v213]');if(!Array.from(item.options).some(o=>o.value===p.itemId))item.add(new Option(p.itemId,p.itemId));item.value=p.itemId;item.disabled=true;
  panel.querySelector('[data-stock-config-side-v213]').value=p.side;panel.querySelector('[data-stock-config-qty-v213]').value=p.quantity;
  // Mixed existing leverage is preserved until the DM chooses a new integer leverage.
  const leverage=panel.querySelector('[data-stock-config-leverage-v213]'),effective=p.costBasis/Math.max(.0001,p.margin??p.costBasis);
  if(!Array.from(leverage.options).some(o=>Number(o.value)===effective))leverage.add(new Option('×'+money213(effective),String(effective)));leverage.value=String(effective);
  panel.querySelector('[data-stock-config-price-v213]').value=p.costBasis/p.quantity;panel.querySelector('[data-stock-config-save-v213]').textContent='Сохранить позицию';return;
 }
 if(button.hasAttribute('data-stock-config-save-v213')){const get=name=>panel.querySelector(`[data-stock-config-${name}-v213]`).value;
  mutate(panel,{action:panel.dataset.editItem?'set':'add',itemId:panel.dataset.editItem||get('item'),side:get('side'),fromSide:panel.dataset.editSide||get('side'),quantity:Number(get('qty')),leverage:Number(get('leverage')),entryPrice:Number(get('price')),expected:panel.dataset.expected?JSON.parse(panel.dataset.expected):null});
 }
});
window.GRPGStockConfigV213={holdings,markup};
})();
