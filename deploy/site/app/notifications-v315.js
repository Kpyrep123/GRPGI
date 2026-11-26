(function(){
'use strict';
const B=window.GRPGNotificationBridgeV315;if(!B)return;
let identity='',state=null,inflight=null,registration=null;
const publication=window.GRPGGalagramPublicationV315||={released:new Set()};
const key=()=> 'grpg.push.v315:'+B.identity();
const prefs=()=>{try{return JSON.parse(localStorage.getItem(key())||'{"news":true,"messages":true}');}catch{return {news:true,messages:true};}};
async function reg(){registration ||= await navigator.serviceWorker.register('./galagram-sw-v315.js',{scope:'./',updateViaCache:'none'});await navigator.serviceWorker.ready;return registration;}
async function bind(){const r=await reg();(r.active||r.waiting)?.postMessage({type:'binding',account:B.account()});}
async function disable(){
 if(!('serviceWorker'in navigator))return;
 const r=await navigator.serviceWorker.getRegistration(new URL('./',location.href).href);if(!r)return;
 r.active?.postMessage({type:'binding',account:null});const sub=await r.pushManager.getSubscription();
 if(sub){try{await B.call('unsubscribe',{endpoint:sub.endpoint});}finally{await sub.unsubscribe();}}
 localStorage.removeItem('grpg.push.binding.v315');
}
async function refresh(){
 const next=B.identity();if(!next)return;
 if(inflight)return inflight;
 inflight=(async()=>{
  const saved=localStorage.getItem('grpg.push.binding.v315');
  if(saved&&saved!==next)await disable();
  if(identity!==next){identity=next;state=null;publication.released=new Set();publication.identity=next;}
  try{const data=await B.call('state');if(B.identity()!==next)return;state=data;
   if(saved===next&&'Notification'in window&&Notification.permission==='granted'){const r=await reg();if(await r.pushManager.getSubscription())await bind();}
   const before=JSON.stringify([...publication.released].sort());publication.released=new Set(data.released||[]);
   if(before!==JSON.stringify([...publication.released].sort()))B.changed();
   const pending=sessionStorage.getItem('grpg.push.open.v315');if(pending){const p=JSON.parse(pending);if(B.matches(p)){sessionStorage.removeItem('grpg.push.open.v315');B.open(p);}}
  }catch(error){state={error:error.message};}
  mount();
 })().finally(()=>{inflight=null;});return inflight;
}
function open(payload){if(B.matches(payload))B.open(payload);else sessionStorage.setItem('grpg.push.open.v315',JSON.stringify(payload));}
function reportView(){registration?.active?.postMessage({type:'view',account:B.account(),view:B.view()});}
function mount(){
 if(B.identity()&&B.identity()!==identity)queueMicrotask(refresh);
 reportView();
 const root=document.querySelector('#screen-profile.active');if(!root||!B.identity()||root.querySelector('[data-notifications-v315]'))return;
 const box=document.createElement('section');box.dataset.notificationsV315='';box.className='profile-card';
 box.innerHTML='<h3>Уведомления GalaGram</h3><p>Разрешение запрашивается только после нажатия «Включить». Настройки действуют для этого браузера.</p><label><input type="checkbox" name="news"> Новые публикации</label> <label><input type="checkbox" name="messages"> Новые сообщения</label><div class="button-row"><button class="primary" data-enable>Включить на этом устройстве</button><button class="secondary" data-disable>Отключить</button><button class="secondary" data-test>Проверить уведомление</button></div><p role="status"></p>';
 const options=prefs();for(const k of ['news','messages'])box.querySelector('[name='+k+']').checked=options[k];
 const status=box.querySelector('[role=status]');const supported='Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window&&window.isSecureContext;
 status.textContent=!supported?'Этот браузер не поддерживает Web Push. На iPhone/iPad откройте сайт с домашнего экрана.':Notification.permission==='denied'?'Уведомления заблокированы. Измените разрешение в настройках браузера.':state?.error||'';
 box.querySelector('[data-enable]').disabled=!supported||Notification.permission==='denied';box.querySelector('[data-test]').disabled=!supported;
 const save=()=>{const p={news:box.querySelector('[name=news]').checked,messages:box.querySelector('[name=messages]').checked};localStorage.setItem(key(),JSON.stringify(p));return p;};
 const busy=async task=>{box.querySelectorAll('button').forEach(b=>b.disabled=true);try{await task();}catch(e){status.textContent=e.message;}finally{box.querySelectorAll('button').forEach(b=>b.disabled=false);box.querySelector('[data-enable]').disabled=!supported||Notification.permission==='denied';box.querySelector('[data-test]').disabled=!supported;}};
 box.querySelector('[data-enable]').onclick=()=>{
  // Must request permission directly in the click gesture, before asynchronous work.
  const consentIdentity=B.identity();const permission=Notification.requestPermission();busy(async()=>{if(await permission!=='granted')throw Error('Разрешение не получено');if(B.identity()!==consentIdentity)throw Error('Персонаж изменился. Повторите включение уведомлений.');await refresh();if(!state?.publicKey)throw Error('Сервер уведомлений ещё не настроен');const r=await reg();let sub=await r.pushManager.getSubscription();sub ||= await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:state.publicKey});if(B.identity()!==consentIdentity){await sub.unsubscribe();throw Error('Персонаж изменился');}await B.call('subscribe',{subscription:sub.toJSON(),logicalCampaign:B.account().campaign,...save()});if(B.identity()!==consentIdentity){await sub.unsubscribe();throw Error('Персонаж изменился');}await bind();reportView();localStorage.setItem('grpg.push.binding.v315',B.identity());status.textContent='Уведомления включены';});
 };
 const update=()=>busy(async()=>{const p=save();if(localStorage.getItem('grpg.push.binding.v315')!==B.identity())return;const sub=await (await reg()).pushManager.getSubscription();if(sub)await B.call('subscribe',{subscription:sub.toJSON(),logicalCampaign:B.account().campaign,...p});status.textContent='Настройки сохранены';});
 box.querySelectorAll('input').forEach(i=>i.onchange=update);
 box.querySelector('[data-disable]').onclick=()=>busy(async()=>{await disable();status.textContent='Уведомления отключены на этом устройстве';});
 box.querySelector('[data-test]').onclick=()=>busy(async()=>{const sub=await (await reg()).pushManager.getSubscription();if(!sub)throw Error('Включите уведомления на этом устройстве');await B.call('test',{endpoint:sub.endpoint});status.textContent='Тест поставлен в очередь. Проверьте системные уведомления.';});
 root.append(box);
}
window.GRPGNotificationsV315={refresh,mount,disable,reportView};
try{const raw=new URL(location.href).searchParams.get('galagram');if(raw){sessionStorage.setItem('grpg.push.open.v315',raw);const url=new URL(location.href);url.searchParams.delete('galagram');history.replaceState(history.state,'',url);}}catch{}
navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='galagram-open-v315')open(e.data.payload);});
setInterval(()=>{if(!document.hidden)refresh();},30000);refresh();
})();
