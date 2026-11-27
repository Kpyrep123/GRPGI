'use strict';
function deny(e){return e.json(410,{ok:false,status:'disabled',message:'Биржа отключена'});}
function stock(item,id){item=item||{};return ['stock','stocks','share','shares'].includes(String(item.type||item.category||'').toLowerCase())||String(id||item.id||'').startsWith('stock_')||/^акции(?:\s|$)/i.test(String(item.name||''))||(Array.isArray(item.tags)?item.tags:[]).some(t=>['акции','stock','stocks','share','shares'].includes(String(t).toLowerCase()));}
function blocked(e){
 const path=String(e.request.url.path||'');
 if(/^\/api\/(?:grpgi\/)?stock-exchange(?:-v\d+)?(?:\/|$)/.test(path))return true;
 if(!/^\/api\/grpgi\/market\/transaction(?:-v\d+)?$/.test(path))return false;
 const b=e.requestInfo().body||{},id=String(b.itemId||b.item_id||'');if(!id)return false;if(stock({},id))return true;
 // Reuse the small entity index when current; legacy deployments fall back to their snapshot.
 try{const rows=arrayOf(new DynamicModel({data:''}));e.app.db().newQuery("SELECT data FROM grpgi_world_entities_v301 WHERE campaign={:c} AND key={:key} AND deleted=0 AND EXISTS(SELECT 1 FROM grpgi_world_heads_v301 WHERE campaign={:c} AND dirty=indexed)").bind({c:String(b.campaignId||b.campaign_id||''),key:JSON.stringify(['world','equipment','EQUIPMENT',id])}).all(rows);if(rows.length)return stock(JSON.parse(rows[0].data).v,id);}catch{}
 try{const r=e.app.findFirstRecordByFilter('campaign_snapshots','campaignId={:c}',{c:String(b.campaignId||b.campaign_id||'')}),section=JSON.parse(r.getString('worldJson')||'{}').equipment||{};return stock((section.EQUIPMENT||section)[id],id);}catch{return false;}
}
module.exports={deny,blocked};
