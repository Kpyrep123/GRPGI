(function(root){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const image=s=>/^(https?:\/\/|data:image\/(png|jpeg|webp|gif);base64,|file:\/\/)/i.test(String(s||''))?String(s):'';
function feed(world,players,campaign,visible){
 const rows=world.filter(visible).map(p=>({...p,feedKey:'world:'+p.id}));
 for(const owner of players)for(const [id,p] of Object.entries(owner.newsPosts||{})){
  if(!p||p.campaignId!==campaign||p.deleted||!visible(p))continue;
  rows.push({...p,id,authorType:'player',bodyFormat:'plain',ownerId:owner.id,authorName:owner.displayName||owner.name||owner.id,authorImage:owner.image,feedKey:'player:'+owner.id+':'+id});
 }
 return rows.sort((a,b)=>String(b.publishedAt||b.createdAt||'').localeCompare(String(a.publishedAt||a.createdAt||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||''))||a.feedKey.localeCompare(b.feedKey));
}
function post({id,body,images=[],campaignId,publishedAt,createdAt}){
 body=String(body||'').trim();if(!body&&!images.length)throw Error('Добавьте текст или изображение');
 if(body.length>10000)throw Error('Максимум 10 000 символов');
 if(images.length>4||images.some(s=>!/^https?:\/\//i.test(s)))throw Error('Изображения должны быть загружены в облако');
 return {id,name:'Публикация игрока',body,bodyFormat:'plain',images,authorType:'player',campaignId,publishedAt,createdAt,visibility:{campaignIds:[campaignId],playerIds:[],eraIds:[]}};
}
function put(player,p){player.newsPosts={...(player.newsPosts||{}),[p.id]:p};}
function remove(player,id){const existing=player.newsPosts?.[id];if(!existing)throw Error('Публикация не найдена');player.newsPosts={...player.newsPosts,[id]:{...existing,deleted:true}};}
root.GRPGNewsV159={esc,image,feed,post,put,remove};
if(typeof module!=='undefined')module.exports=root.GRPGNewsV159;
})(typeof window!=='undefined'?window:globalThis);
