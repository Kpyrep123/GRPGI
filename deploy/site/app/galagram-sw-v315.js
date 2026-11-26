'use strict';
const DB='grpgi-push-v315';const views=new Map();let pushQueue=Promise.resolve();
function binding(value,key='account'){return new Promise((resolve,reject)=>{const open=indexedDB.open(DB,1);open.onupgradeneeded=()=>open.result.createObjectStore('settings');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('settings',value===undefined?'readonly':'readwrite'),store=tx.objectStore('settings');let request=value===undefined?store.get(key):store.put(value,key);let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};};});}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.type==='binding')event.waitUntil(binding(event.data.account||null));if(event.data?.type==='view'&&event.source?.id)views.set(event.source.id,event.data);});
self.addEventListener('push',event=>{pushQueue=pushQueue.catch(()=>{}).then(async()=>{
 const p=event.data?.json();if(!p)return;const account=await binding();if(!account||account.player!==p.player||account.campaign!==p.campaign)return;
 const seenKey='seen:'+p.campaign+':'+p.player;const seen=await binding(undefined,seenKey)||[];if(seen.includes(p.id))return;
 const windows=await self.clients.matchAll({type:'window'});
 const visible=windows.some(c=>{const v=views.get(c.id);return c.visibilityState==='visible'&&v?.account?.player===p.player&&v.account.campaign===p.campaign&&(p.type==='news'?v.view.screen==='news':p.type==='message'&&(p.kind==='campaign'?v.view.kind==='campaign':v.view.target===(p.kind==='direct'?(p.otherId||p.senderId):(p.npcId||p.senderId))));});
 if(visible){await binding([...seen,p.id].slice(-512),seenKey);return;}
 const tag=String(p.tag||p.id||'galagram').slice(0,180);
 await self.registration.showNotification(String(p.title||'GalaGram'),{body:String(p.body||''),tag,data:p});
 await binding([...seen,p.id].slice(-512),seenKey);
});event.waitUntil(pushQueue);});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{
 const p=event.notification.data,account=await binding();if(!account||account.player!==p.player||account.campaign!==p.campaign)return;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const client=windows.find(c=>new URL(c.url).pathname.startsWith(new URL(self.registration.scope).pathname));
 if(client){await client.focus();client.postMessage({type:'galagram-open-v315',payload:p});}
 else await self.clients.openWindow(self.registration.scope+'?galagram='+encodeURIComponent(JSON.stringify(p)));
})());});
