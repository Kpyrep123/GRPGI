(() => {
'use strict';
const instances=new WeakMap();
const normalize=value=>String(value||'').trim().replace(/\s+/g,' ').normalize('NFKC').toLocaleLowerCase();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Existing form drafts stored only select.value, which drops every selected value except the first.
if(typeof FormDrafts!=='undefined'){
 const rememberBefore=FormDrafts.remember;
 FormDrafts.remember=function(key,form){rememberBefore.call(this,key,form);const values=this.store[key];if(!values)return;const definitions={};for(const select of form.querySelectorAll('select[multiple][name]')){if(select.disabled)continue;values[select.name]=[...select.selectedOptions].map(o=>o.value);const created=[...select.options].filter(o=>o.dataset.createdTagName172).map(o=>({id:o.value,name:o.dataset.createdTagName172}));if(created.length)definitions[select.name]=created;}if(Object.keys(definitions).length)values.__tagOptions172=definitions;};
 const applyBefore=FormDrafts.apply;
 FormDrafts.apply=function(key,form){const values=this.store[key];applyBefore.call(this,key,form);if(!values||!form)return;for(const select of form.querySelectorAll('select[multiple][name]')){if(!(select.name in values))continue;for(const tag of values.__tagOptions172?.[select.name]||[]){if(![...select.options].some(o=>o.value===tag.id)){const option=new Option(tag.name,tag.id);option.dataset.createdTagName172=tag.name;select.add(option);}}const selected=Array.isArray(values[select.name])?values[select.name]:[values[select.name]];for(const option of select.options)option.selected=selected.includes(option.value);instances.get(select)?.refresh();}};
}
function mount(select){
 if(instances.has(select)||!select.multiple)return;
 const parent=select.parentElement,label=(select.getAttribute('aria-label')||(select.previousElementSibling?.tagName==='LABEL'?select.previousElementSibling.textContent:'')||(parent?[...parent.childNodes].filter(n=>n!==select).map(n=>n.textContent).join(''):'')||'Выбор значений').trim().slice(0,180);
 // A field label cannot contain the new list's individual checkbox labels.
 if(parent?.tagName==='LABEL'){
  const field=document.createElement('div');for(const a of parent.attributes)if(a.name!=='for')field.setAttribute(a.name,a.value);field.classList.add('checkbox-picker-field-v172');
  const caption=document.createElement('div');caption.className='checkbox-picker-caption-v172';for(const child of [...parent.childNodes])if(child!==select)caption.append(child);
  field.append(caption,select);parent.replaceWith(field);
 }
 const host=document.createElement('div');host.className='checkbox-picker-v172';host.setAttribute('role','group');host.setAttribute('aria-label',label);host.dataset.checkboxPicker172='';
 host.innerHTML=`<div class="checkbox-picker-entry-v172"><input class="input" type="text" data-picker-search172 placeholder="${select.dataset.allowTagCreate172!==undefined?'Найти или добавить тег':'Найти в списке'}" aria-label="${esc(label)}: поиск"><button class="secondary" type="button" data-picker-add172 hidden>Добавить</button></div><div class="checkbox-picker-selection-v172" aria-live="polite" data-picker-selected172></div><div class="checkbox-picker-options-v172" data-picker-options172></div><div class="small-note" role="status" data-picker-status172></div>`;
 select.classList.add('checkbox-picker-native-v172');select.setAttribute('aria-hidden','true');select.tabIndex=-1;select.after(host);
 const search=host.querySelector('[data-picker-search172]'),list=host.querySelector('[data-picker-options172]'),add=host.querySelector('[data-picker-add172]'),status=host.querySelector('[data-picker-status172]');
 function commit(value,selected){const option=[...select.options].find(o=>o.value===value);if(!option||select.disabled||option.disabled)return;option.selected=selected;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));if(host.isConnected)refresh();}
 function refresh(){
  const options=[...select.options],selected=options.filter(o=>o.selected),query=normalize(search.value),focusValue=document.activeElement?.dataset.pickerCheck172,scroll=list.scrollTop;
  host.querySelector('[data-picker-selected172]').innerHTML=`<span>Выбрано: ${selected.length}</span>${selected.map(o=>`<button type="button" class="checkbox-picker-chip-v172" data-picker-remove172="${esc(o.value)}" aria-label="Убрать: ${esc(o.label)}" ${select.disabled||o.disabled?'disabled':''}>${esc(o.label)} <span aria-hidden="true">×</span></button>`).join('')}`;
  const visible=options.filter(o=>!o.hidden&&(!query||normalize(o.label).includes(query)));
  list.innerHTML=visible.map(o=>`<label class="checkbox-picker-option-v172 ${o.selected?'is-selected':''}"><span>${esc(o.label)}</span><input type="checkbox" data-picker-check172="${esc(o.value)}" aria-label="${esc(o.label)}" ${o.selected?'checked':''} ${select.disabled||o.disabled?'disabled':''}></label>`).join('')||'<span class="small-note">Нет подходящих значений</span>';
  list.scrollTop=scroll;if(focusValue!==undefined)[...list.querySelectorAll('[data-picker-check172]')].find(i=>i.dataset.pickerCheck172===focusValue)?.focus({preventScroll:true});
  const exact=options.find(o=>normalize(o.label)===query);add.hidden=select.dataset.allowTagCreate172===undefined||!query;add.textContent=exact?'Выбрать':'Добавить';search.disabled=select.disabled;add.disabled=select.disabled;
 }
 add.onclick=()=>{const name=search.value.trim().replace(/\s+/g,' ');if(!name)return;const found=[...select.options].find(o=>normalize(o.label)===normalize(name));if(found){commit(found.value,true);search.value='';refresh();return;}
  const detail={name,select};select.dispatchEvent(new CustomEvent('grpg-create-tag172',{bubbles:true,detail}));
  if(detail.value){search.value='';commit(detail.value,true);status.textContent='Тег добавлен в черновик. Сохраните карточку или хаб.';}else status.textContent=detail.error||'Не удалось добавить тег';refresh();search.focus();
 };
 search.oninput=()=>{status.textContent='';refresh();};search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(!add.hidden)add.click();}};
 list.onchange=e=>{if(e.target.matches('[data-picker-check172]')){e.stopPropagation();commit(e.target.dataset.pickerCheck172,e.target.checked);}};
 host.addEventListener('click',e=>{const button=e.target.closest('[data-picker-remove172]');if(button){e.preventDefault();commit(button.dataset.pickerRemove172,false);}});
 // Keep search/checkbox UI out of native select handlers and form-draft values; the original select is the successful control.
 select.addEventListener('change',refresh);select.addEventListener('input',refresh);
 instances.set(select,{refresh,host});refresh();
}
function enhance(root=document){if(root.matches?.('select[multiple]'))mount(root);root.querySelectorAll?.('select[multiple]').forEach(mount);}
const observer=new MutationObserver(records=>{for(const r of records){if(r.type==='attributes'&&r.target.matches?.('select[multiple]'))instances.get(r.target)?.refresh();for(const node of r.addedNodes||[])if(node.nodeType===1&&!node.closest?.('.checkbox-picker-v172'))enhance(node);if(r.target.tagName==='SELECT')instances.get(r.target)?.refresh();}});
observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','multiple']});
enhance();window.GRPGCheckboxPickerV172={enhance,refresh:select=>instances.get(select)?.refresh()};
})();
