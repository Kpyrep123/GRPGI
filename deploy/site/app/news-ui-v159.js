(function(){
'use strict';const C=window.GRPGNewsV159,e=C.esc;
window.GRPGNewsUIV159={create(B){let identity='',busy=false,draft=null,host;
 const context=()=>String(B.current()?.id||'guest')+':'+B.campaign();
 function rows(){return C.feed(B.world(),B.players(),B.campaign(),B.visible);}
 function cards(){const list=host.querySelector('[data-feed]');if(!list)return;
  list.innerHTML=rows().map(p=>{const npc=p.authorType==='npc'?B.npc(p.authorNpcId):null,name=p.authorType==='player'?p.authorName:p.authorType==='organization'?(p.authorName||'Организация'):npc?(npc.name||npc.displayName||npc.id):'Новости мира',avatar=C.image(npc?.image||p.authorImage),imgs=[p.image,...(p.images||[])].map(C.image).filter(Boolean);
   return `<article class="gg-post"><header>${avatar?`<img class="gg-avatar" src="${e(avatar)}" alt="">`:'<span class="gg-avatar gg-initial">'+e(name.slice(0,1))+'</span>'}<div><b>${e(name)}</b><small>${e(p.publishedAt||p.createdAt||'')}</small></div>${p.ownerId===B.current()?.id?`<button type="button" data-delete="${e(p.id)}">Удалить</button>`:''}</header>${p.title||p.name&&p.authorType!=='player'?`<h3>${e(p.title||p.name)}</h3>`:''}${p.subtitle?`<p class="gg-subtitle">${e(p.subtitle)}</p>`:''}<div class="article-body ${p.bodyFormat==='plain'?'gg-plain':''}">${p.bodyFormat==='plain'?e(p.body):B.rich(p.body||'')}</div>${imgs.length?`<div class="gg-images">${imgs.map(src=>`<a href="${e(src)}" target="_blank" rel="noopener"><img src="${e(src)}" alt="Изображение публикации" loading="lazy"></a>`).join('')}</div>`:''}</article>`;
  }).join('')||'<p class="gg-empty">Публикаций пока нет. Поделитесь новостями первым.</p>';
  list.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=async()=>{if(busy||!confirm('Удалить публикацию?'))return;const id=B.current()?.id;busy=true;btn.disabled=true;try{await B.commit(p=>{if(p.id!==id)throw Error('Персонаж изменился');C.remove(p,btn.dataset.delete);},'Публикация удалена',id);cards();}catch(err){B.notify(err.message);}finally{busy=false;btn.disabled=false;}});
 }
 function show(){const root=B.root();if(!root)return;if(host?.isConnected&&identity===context()){cards();return;}
  if(busy)return;identity=context();draft=null;host=document.createElement('div');host.className='gg-feed';
  const canPost=B.current()&&B.current().role!=='guest';host.innerHTML=`<div class="gg-heading"><span>GALAGRAM</span><h2>Лента кампании</h2><p>Новости мира и публикации персонажей</p></div>${canPost?'<form class="gg-composer"><label>Новая публикация<textarea name="body" placeholder="Чем хотите поделиться?" maxlength="10000" rows="4"></textarea></label><div class="gg-compose-actions"><label class="gg-file">Добавить изображения<input type="file" name="images" accept="image/png,image/jpeg,image/webp,image/gif" multiple></label><button type="submit" class="primary">Опубликовать</button></div><div data-preview class="gg-preview"></div><p data-status role="status"></p></form>':'<p class="gg-empty">Войдите персонажем, чтобы публиковать.</p>'}<div data-feed></div>`;
  root.querySelectorAll('.gg-feed').forEach(n=>n.remove());root.append(host);cards();
  const form=host.querySelector('form');if(!form)return;
  const fileInput=form.elements.images,body=form.elements.body,status=form.querySelector('[data-status]'),preview=form.querySelector('[data-preview]');
  let previews=[];const clearPreview=()=>{previews.forEach(URL.revokeObjectURL);previews=[];preview.replaceChildren();};
  fileInput.onchange=()=>{clearPreview();draft=null;for(const file of fileInput.files){const src=URL.createObjectURL(file);previews.push(src);const img=document.createElement('img');img.src=src;img.alt=file.name;preview.append(img);}};body.oninput=()=>{draft=null;};
  form.onsubmit=async event=>{event.preventDefault();if(busy)return;const owner=B.current()?.id,campaign=B.campaign(),files=Array.from(fileInput.files),text=body.value.trim();
   try{if(!text&&!files.length)throw Error('Добавьте текст или изображение');if(files.length>4)throw Error('Можно добавить до 4 изображений');for(const f of files)if(!/^image\/(png|jpeg|webp|gif)$/.test(f.type)||f.size>8*1024*1024)throw Error('PNG, JPEG, WebP или GIF, до 8 МБ на изображение');
    busy=true;form.querySelectorAll('input,textarea,button').forEach(n=>n.disabled=true);status.textContent='Публикация сохраняется…';
    draft ||= {id:'post-'+crypto.randomUUID(),createdAt:new Date().toISOString(),publishedAt:B.date(),images:[]};
    for(let i=draft.images.length;i<files.length;i++)draft.images.push(await B.upload(files[i],draft.id,i));
    if(context()!==owner+':'+campaign)throw Error('Персонаж или кампания изменились');
    const p=C.post({...draft,body:text,campaignId:campaign});await B.commit(player=>{if(player.id!==owner)throw Error('Персонаж изменился');C.put(player,p);},'Публикация сохранена',owner);
    body.value='';fileInput.value='';clearPreview();draft=null;status.textContent='Опубликовано';cards();
   }catch(err){status.textContent=err.message;B.notify(err.message);}finally{busy=false;form.querySelectorAll('input,textarea,button').forEach(n=>n.disabled=false);if(context()!==identity)show();}
  };
 }
 return {show,rows};
}};
})();
