(() => {
'use strict';
const M=window.GRPGMerchantCatalogV170;if(!M||typeof Configurator==='undefined')return;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>JSON.parse(JSON.stringify(v));
function markup(item){
 if(item.type==='stock')return '<p class="small-note">Акции доступны через общий фондовый рынок.</p>';
 const destinations=M.destinations(PLANETS,NPCS),byKey=new Map(destinations.map(d=>[M.key(d),d]));
 for(const offer of item.merchantOffers||[])if(!byKey.has(M.key(offer))){const d={...offer,name:`Недоступный торговец · ${offer.planetId} / ${offer.mapId||'Терминал'} / ${offer.objectId||''}`,legacy:[],missing:true};destinations.push(d);byKey.set(M.key(d),d);}
 const rows=destinations.map(d=>{
  const saved=(item.merchantOffers||[]).find(o=>M.key(o)===M.key(d)),old=(d.legacy||[]).find(o=>o.itemId===item.id),raw=saved||old,base=Math.max(0,Math.trunc(Number(item.price??item.cost??0)||0)),min=Number(raw?.minPrice??raw?.price??base),max=Number(raw?.maxPrice??raw?.price??base),chance=Number(raw?.appearanceChance??100),enabled=Boolean(raw&&raw.enabled!==false);
  return `<tr data-item-merchant-row data-key="${esc(M.key(d))}" data-scope="${esc(JSON.stringify({kind:d.kind,planetId:d.planetId,...(d.kind==='hub'?{mapId:d.mapId,objectId:d.objectId}:{})}))}" data-search="${esc(d.name.toLowerCase())}"><td><input type="checkbox" data-offer="enabled" aria-label="Доступно: ${esc(d.name)}" ${enabled?'checked':''}></td><td><b>${esc(d.name)}</b>${d.missing?'<small>Объект удалён или флаг «Торговец» снят. Настройка сохранена.</small>':''}${!saved&&old?'<small>Текущий ассортимент (старый формат)</small>':''}</td><td><input class="input" type="number" min="0" max="100" step="0.1" data-offer="appearanceChance" value="${chance}" aria-label="Шанс: ${esc(d.name)}"></td><td><input class="input" type="number" min="0" step="1" data-offer="minPrice" value="${min}" aria-label="Минимальная цена: ${esc(d.name)}"></td><td><input class="input" type="number" min="0" step="1" data-offer="maxPrice" value="${max}" aria-label="Максимальная цена: ${esc(d.name)}"></td><td data-offer-average>${(min+max)/2}</td></tr>`;
 }).join('');
 return `<details class="equipment-merchants-v170" open data-item-merchants><summary>Торговцы и терминалы</summary><p>Настройте, кто продаёт этот предмет. Цена и наличие обновляются ежедневно. Изменения применяются после сохранения карточки снаряжения.</p><div class="row"><input class="input" data-merchant-filter placeholder="Поиск: планета, хаб, карта, торговец" aria-label="Поиск торговца"><label><input type="checkbox" data-merchant-selected> Только выбранные</label></div><div class="small-note">Базовая цена предмета: ${esc(item.price??item.cost??0)} · Средняя цена предложений: <b data-merchants-average>—</b> (среднее середин диапазонов, без учёта шанса появления)</div><div class="equipment-merchants-table-v170"><table><thead><tr><th>В наличии</th><th>Терминал / Хаб / Карта / Торговец</th><th>Шанс, %</th><th>Мин. цена</th><th>Макс. цена</th><th>Средняя</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Нет торговцев. Установите флаг «Торговец» на объекте хаба.</td></tr>'}</tbody></table></div></details>`;
}
function update(root){
 let sum=0,count=0;const query=(root.querySelector('[data-merchant-filter]')?.value||'').toLowerCase(),selected=root.querySelector('[data-merchant-selected]')?.checked;
 for(const row of root.querySelectorAll('[data-item-merchant-row]')){
  const get=f=>row.querySelector(`[data-offer="${f}"]`),enabled=get('enabled').checked,min=Number(get('minPrice').value),max=Number(get('maxPrice').value),valid=Number.isFinite(min)&&Number.isFinite(max)&&min>=0&&max>=min;
  row.querySelector('[data-offer-average]').textContent=valid?((min+max)/2).toLocaleString('ru-RU'):'—';
  if(enabled&&valid){sum+=(min+max)/2;count++;}
  row.hidden=Boolean((selected&&!enabled)||(query&&!row.dataset.search.includes(query)));
 }
 root.querySelector('[data-merchants-average]').textContent=count?(sum/count).toLocaleString('ru-RU',{maximumFractionDigits:2}):'—';
}
const equipmentBefore=Configurator.renderEquipmentEditor.bind(Configurator);Configurator.renderEquipmentEditor=function(item){const html=equipmentBefore(item);return html.replace('</form>',markup(item)+'</form>');};
const planetBefore=Configurator.renderPlanetEditor.bind(Configurator);Configurator.renderPlanetEditor=function(planet){const box=document.createElement('div');box.innerHTML=planetBefore(planet);const note=document.createElement('p');note.className='small-note';note.dataset.marketEditLocation='';note.textContent='Ассортимент терминала задаётся в World Config → Снаряжение → Торговцы и терминалы.';const old=box.querySelector('.market-config-field-v1071');if(old)old.replaceWith(note);else (box.querySelector('form')||box).append(note);return box.innerHTML;};
const collectBefore=Configurator.collectEntity.bind(Configurator);Configurator.collectEntity=function(type,form,data){const entity=collectBefore(type,form,data);if(!entity)return entity;
 if(type==='planets'&&form.querySelector('[data-market-edit-location]'))entity.market=clone(this.getSelectedEntity()?.market||[]);
 if(type==='equipment'&&form.querySelector('[data-item-merchants]')){
  const offers=[...form.querySelectorAll('[data-item-merchant-row]')].map(row=>{const value=f=>row.querySelector(`[data-offer="${f}"]`);for(const f of ['appearanceChance','minPrice','maxPrice'])if(!value(f).value.trim())throw Error('Заполните шанс и диапазон цен торговца');return{...JSON.parse(row.dataset.scope),enabled:value('enabled').checked,appearanceChance:Number(value('appearanceChance').value),minPrice:Number(value('minPrice').value),maxPrice:Number(value('maxPrice').value)};});
  entity.merchantOffers=M.validate(offers);
 }
 return entity;
};
// Planet IDs are destination references; include equipment in the same world save when they change.
const snapshotBefore=buildWorldSnapshot;buildWorldSnapshot=function(){return M.projectWorld(snapshotBefore());};
let remappedOffers=false;
const remapBefore=Configurator.remapReferences.bind(Configurator);Configurator.remapReferences=function(type,oldId,newId){remapBefore(type,oldId,newId);if(type==='planets'&&oldId!==newId)for(const item of Object.values(EQUIPMENT))for(const offer of item.merchantOffers||[])if(offer.planetId===oldId){offer.planetId=newId;remappedOffers=true;}};
const persistBefore=Configurator.persistAll.bind(Configurator);Configurator.persistAll=async function(message,options={}){const needed=remappedOffers,equipmentSave=this.selectedType==='equipment';if(needed||equipmentSave)options={...options,worldSections:[...new Set([...(options.worldSections||[this.selectedType]),...(needed?['equipment']:[]),...(equipmentSave?['planets']:[])])]};const result=await persistBefore(message,options);if(needed&&result?.ok)remappedOffers=false;return result;};
const renderBefore=Configurator.render.bind(Configurator);Configurator.render=function(...args){const result=renderBefore(...args);document.querySelectorAll('[data-item-merchants]').forEach(update);return result;};
for(const event of ['input','change'])document.addEventListener(event,e=>{const root=e.target.closest?.('[data-item-merchants]');if(root)update(root);});
window.GRPGEquipmentMerchantsV170={markup,update};
})();
