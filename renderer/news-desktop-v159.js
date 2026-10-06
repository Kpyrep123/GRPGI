(function(){
'use strict';const C=window.GRPGNewsV159,copy=x=>JSON.parse(JSON.stringify(x)),campaign=()=>String(App.activeCampaignId||Sync.config?.campaignId||'main');
const ui=window.GRPGNewsUIV159.create({
 root:()=>document.getElementById('news-content'),current:()=>App.currentUser,campaign,
 world:()=>Object.values(NEWS),players:()=>Object.values(App.state.users||{}),visible:p=>isEntityVisible(p),npc:id=>NPCS[id],rich:s=>__renderRichText(s,''),
 date:()=>Data.getCampaign?.(campaign())?.marketDate||new Date().toISOString(),notify:s=>Toast.show(s,'err'),
 upload:async(file,id,index)=>{const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Не удалось прочитать изображение'));reader.readAsDataURL(file);});const r=await window.electronAPI.saveWorldImage({dataUrl,preferredStem:id+'-'+index,section:'news',entityId:id});const url=r?.cloudUrl||r?.url;if(!r?.ok||!/^https?:\/\//i.test(url||''))throw Error(r?.warning||'Не удалось загрузить изображение в облако');return url;},
 commit:async(mutator,notice,id)=>{
  if(App.currentUser?.id!==id)throw Error('Персонаж изменился');const base=copy(PlayerSync.projectedPlayerV135(id)),next=copy(base);mutator(next);const patch={newsPosts:next.newsPosts};
  Object.assign(App.state.users[id],copy(patch));
  try{const result=await PlayerSync.pushPlayerPatch(id,patch,{basePlayer:base,notice,rerender:false});if(!result?.ok)throw Error(result?.message||'Сохранение не подтверждено');}
  catch(err){const live=App.state.users[id];if(JSON.stringify(live.newsPosts)===JSON.stringify(patch.newsPosts)){if(base.newsPosts===undefined)delete live.newsPosts;else live.newsPosts=copy(base.newsPosts);}throw err;}
 }
});
visibleNewsEntries=()=>ui.rows();
// Retain existing unread-marker and stock-ticker hooks, but avoid rebuilding the composer on refresh.
const original=UI.renderNews;UI.renderNews=function(){const root=document.getElementById('news-content'),existing=root?.querySelector('.gg-feed');existing?.remove();original.call(this);root?.querySelectorAll('.news-stack,.placeholder').forEach(n=>n.remove());if(existing)root?.append(existing);ui.show();};
const editor=Configurator.renderNewsEditor;Configurator.renderNewsEditor=function(entry){
 const authorType=entry.authorType||'news';const fields=`<fieldset><legend>Автор публикации GalaGram</legend><div class="field"><label>Тип автора</label><select name="authorType" class="select">${[['news','Новости мира / ведущий'],['npc','NPC'],['organization','Организация']].map(([id,label])=>`<option value="${id}" ${authorType===id?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label>NPC (для автора NPC)</label><select class="select" name="authorNpcId"><option value="">Выберите NPC</option>${Object.values(NPCS).map(n=>`<option value="${C.esc(n.id)}" ${entry.authorNpcId===n.id?'selected':''}>${C.esc(n.name||n.id)}</option>`).join('')}</select></div><div class="field"><label>Название организации (введите вручную)</label><input class="input" name="authorName" value="${C.esc(entry.authorName||'')}"></div></fieldset>`;
 return editor.call(this,entry).replace('<div class="cols2">',fields+'<div class="cols2">');
};
const collect=Configurator.collectEntity;Configurator.collectEntity=function(type,form,data=new FormData(form)){const entity=collect.call(this,type,form,data);if(type==='news'){const authorType=String(data.get('authorType')||'news');if(authorType==='npc'&&!NPCS[data.get('authorNpcId')])throw Error('Выберите NPC');if(authorType==='organization'&&!String(data.get('authorName')||'').trim())throw Error('Введите название организации');Object.assign(entity,{authorType,authorNpcId:authorType==='npc'?String(data.get('authorNpcId')):'',authorName:authorType==='organization'?String(data.get('authorName')).trim():''});}return entity;};
window.GRPGNewsDesktopV159=ui;
})();
