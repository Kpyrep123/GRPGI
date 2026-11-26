'use strict';
// Pure publication and recipient policy, shared by the server tests.
function publication(p, now) {
 if(p.publicationMode==='draft')return false;
 if(p.publicationMode==='scheduled')return Number.isFinite(Date.parse(p.publishAt))&&Date.parse(p.publishAt)<=now;
 return true;
}
function visible(p, user, campaign) {
 const v=p.visibility||{};
 if(p.visibility&&typeof p.visibility==='object'&&user.role!=='gm'&&(!Array.isArray(v.playerIds)||!v.playerIds.map(String).includes(String(user.id))))return false;
 return (!v.campaignIds?.length||v.campaignIds.includes(campaign))&&(!v.playerIds?.length||v.playerIds.includes(user.id)||user.role==='gm')&&(!v.eraIds?.length||v.eraIds.includes(user.eraId||'technological')||user.role==='gm');
}
function recipient(event,user,campaign){
 if(!user||user.__deleted||['pending','rejected'].includes(user.approvalStatus))return false;
 if(event.ownerId===user.id)return false;
 if(event.type==='news'||event.type==='task')return visible(event.post||{},user,campaign)&&(!event.accessBefore||!visible(event.accessBefore,user,campaign));
 if(event.type==='session')return event.logicalCampaign===campaign&&Array.isArray(event.targets)&&event.targets.includes(user.id);
 if(event.type==='test')return event.target===user.id;
 if(event.senderType==='player'&&event.senderId===user.id)return false;
 if(event.senderType==='npc'&&user.role==='gm')return false;
 if(event.kind==='campaign')return !event.logicalCampaign||event.logicalCampaign===campaign;
 if(event.kind==='direct')return event.target===user.id||(user.role==='gm'&&event.target==='gm');
 if(event.kind==='npc')return event.target===user.id||user.role==='gm';
 return false;
}
function validSubscription(s){return !!s&&String(s.endpoint||'').length<4096&&/^https:\/\/(?:fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\/[A-Za-z0-9_\-./?=&%:+~]+$/.test(s.endpoint||'')&&/^[A-Za-z0-9_-]{87}$/.test(s.keys?.p256dh||'')&&/^[A-Za-z0-9_-]{22}$/.test(s.keys?.auth||'');}
function enabled(prefs,type){return type==='test'||prefs[type==='news'?'news':type==='task'?'tasks':type==='session'?'sessions':'messages']!==false;}
module.exports={publication,visible,recipient,validSubscription,enabled};
