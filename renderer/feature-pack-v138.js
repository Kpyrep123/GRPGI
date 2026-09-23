/* GRPGI v1.0.138 — durable items and idempotent character credit grants */
(function(){
  'use strict';
  if(window.__GRPGFeaturePackV138)return;
  window.__GRPGFeaturePackV138=true;

  const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const integer=(value,fallback=0)=>Math.trunc(number(value,fallback));
  const text=value=>String(value??'').trim();
  const copy=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value??null));}};
  const safe=value=>typeof esc==='function'?esc(value):String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const PENDING_KEY='grpg-credit-grants-v138';
  const busy=new Set();

  function normalizeItemState(value){
    const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    return Object.fromEntries(Object.entries(source).map(([id,row])=>[String(id),{itemId:String(row?.itemId||id),slot:String(row?.slot||''),durabilityMax:Math.max(0,integer(row?.durabilityMax,0)),durability:Math.max(0,number(row?.durability,0)),chargesMax:Math.max(0,integer(row?.chargesMax,0)),charges:Math.max(0,integer(row?.charges,0)),broken:Boolean(row?.broken)}]));
  }

  const normalizeEquipmentBefore138=normalizeEquipmentItemV2;
  normalizeEquipmentItemV2=function(raw={}){
    const source={...(raw||{})},next=normalizeEquipmentBefore138(source);
    next.durabilityMax=Math.max(0,integer(source.durabilityMax??source.maxDurability??next.durabilityMax,0));
    next.chargesMax=Math.max(0,integer(source.chargesMax??source.maxCharges??next.chargesMax,0));
    return next;
  };
  if(typeof normalizePlayerProfileV2==='function'){
    const normalizePlayerBefore138=normalizePlayerProfileV2;
    normalizePlayerProfileV2=function(raw={}){
      const next=normalizePlayerBefore138(raw);next.itemStateV138=normalizeItemState(raw?.itemStateV138||next.itemStateV138);next.__creditReceiptsV138=raw?.__creditReceiptsV138&&typeof raw.__creditReceiptsV138==='object'?{...raw.__creditReceiptsV138}:{};return next;
    };
  }
  try{Object.entries(EQUIPMENT||{}).forEach(([id,item])=>{EQUIPMENT[id]=normalizeEquipmentItemV2(item);});Object.entries(App.state?.users||{}).forEach(([id,user])=>{App.state.users[id]=normalizePlayerProfileV2(user);});}catch(error){console.warn('FEATURE_PACK_V138_NORMALIZE',error);}

  function pendingMap(){try{const value=JSON.parse(localStorage.getItem(PENDING_KEY)||'{}');return value&&typeof value==='object'?value:{};}catch{return{};}}
  function savePending(value){try{localStorage.setItem(PENDING_KEY,JSON.stringify(value));}catch{}}
  function operationId(){try{return window.GRPGPlayerSyncCoreV135?.operationId?.()||crypto.randomUUID();}catch{return`credit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;}}
  function pendingJob(playerId,amount,options={}){
    const map=pendingMap(),prior=map[playerId];
    if(prior&&integer(prior.amount)===amount)return prior;
    const job={operationId:text(options.operationId)||operationId(),playerId,amount,reason:text(options.reason||'World Config'),campaignId:String(window.Sync?.config?.campaignId||''),createdAt:new Date().toISOString()};map[playerId]=job;savePending(map);return job;
  }
  function clearPending(playerId,operation){const map=pendingMap();if(map[playerId]?.operationId===operation){delete map[playerId];savePending(map);}}
  async function persistLocal(){
    try{if(window.Persistence?.save)await Persistence.save(App.state);if(App.writeLocalMirrors)await App.writeLocalMirrors();return{ok:true};}catch(error){return{ok:false,message:error?.message||String(error)};}
  }
  async function grantCredits(playerId,rawAmount,options={}){
    playerId=text(playerId);const amount=integer(rawAmount);if(!playerId||amount<=0)return{ok:false,status:'invalid',message:'Укажите персонажа и положительное целое количество денег.'};
    if(busy.has(playerId))return{ok:false,status:'busy',message:'Предыдущая выдача этому персонажу ещё выполняется.'};
    const user=App.state?.users?.[playerId];if(!user)return{ok:false,status:'missing',message:'Персонаж не найден.'};
    const job=pendingJob(playerId,amount,options);busy.add(playerId);
    try{
      const remote=Boolean(PlayerSync?.shouldIsolateUsersFromSnapshot?.());let response;
      if(remote){
        response=await window.electronAPI?.patchPlayer?.({playerId,operationId:job.operationId,creditGrantV138:{amount:job.amount,campaignId:job.campaignId,reason:job.reason},updatedBy:typeof activeSyncActorLabel==='function'?activeSyncActorLabel():'gm'});
        if(!response?.ok){if(['invalid','forbidden','unsupported','rejected','conflict'].includes(String(response?.status)))clearPending(playerId,job.operationId);return response||{ok:false,status:'error',message:'Сервер не подтвердил выдачу денег.'};}
        if(response.row)PlayerSync?.applyRemoteRow?.(response.row);else if(response.remote)PlayerSync?.applyRemoteRow?.(response.remote);
      }else{
        const current=normalizePlayerProfileV2(App.state.users[playerId]);
        if(!current.__creditReceiptsV138?.[job.operationId]){current.credits=Math.max(0,number(current.credits,0))+job.amount;current.__creditReceiptsV138={...(current.__creditReceiptsV138||{}),[job.operationId]:{amount:job.amount,at:new Date().toISOString()}};App.state.users[playerId]=current;if(typeof PLAYER_TEMPLATES!=='undefined')PLAYER_TEMPLATES[playerId]=copy(current);}
        const saved=await persistLocal();if(!saved.ok)return{ok:false,status:'local-save-failed',message:saved.message||'Не удалось сохранить профиль. Повтор использует тот же идентификатор операции.'};response={ok:true,status:'local',row:{playerId,player:App.state.users[playerId]}};
      }
      clearPending(playerId,job.operationId);await App.writeLocalMirrors?.();return{...response,ok:true,operationId:job.operationId,credits:number(App.state?.users?.[playerId]?.credits,response?.row?.player_json?.credits)};
    }catch(error){return{ok:false,status:'error',message:`Ответ сервера не получен: ${error?.message||error}. Повторите выдачу — двойного начисления не будет.`,operationId:job.operationId};}
    finally{busy.delete(playerId);}
  }
  window.GRPGCombatAPIv138={...(window.GRPGCombatAPIv138||{}),grantCredits};

  const renderEquipmentBefore138=Configurator.renderEquipmentEditor.bind(Configurator);
  Configurator.renderEquipmentEditor=function(raw){
    const item=normalizeEquipmentItemV2(raw),base=renderEquipmentBefore138(item),fields=`<section class="item-state-settings-v138"><div class="section-title">Ресурсы предмета</div><div class="cols2"><div class="field"><label>Максимальная прочность</label><input class="input" type="number" min="0" step="1" name="durabilityMax" value="${item.durabilityMax}"/><div class="small-note">0 — прочность не используется.</div></div><div class="field"><label>Максимум зарядов</label><input class="input" type="number" min="0" step="1" name="chargesMax" value="${item.chargesMax}"/><div class="small-note">0 — заряды не используются.</div></div></div></section>`;
    return base.replace(/(<button[^>]+type="submit"[^>]*>[^<]*(?:SAVE_ITEM|СОХРАНИТЬ)[^<]*<\/button>)/i,fields+'$1');
  };
  const renderPlayerBefore138=Configurator.renderPlayerEditor.bind(Configurator);
  Configurator.renderPlayerEditor=function(raw){
    const user=normalizePlayerProfileV2(raw),base=renderPlayerBefore138(user);if(String(user.role||'player').toLowerCase()==='gm')return base;
    const panel=`<section class="credit-grant-v138" data-credit-player-v138="${safe(user.id)}"><div class="section-title">Выдать деньги персонажу</div><div class="row"><input class="input" type="number" min="1" step="1" data-credit-amount-v138 placeholder="Сумма"/><button class="secondary" type="button" data-credit-grant-v138="${safe(user.id)}">ДОБАВИТЬ ДЕНЬГИ</button></div><div class="small-note">Начисление выполняется отдельной идемпотентной операцией и не зависит от сохранения всей формы.</div></section>`;
    return base.replace(/(<button[^>]+type="submit"[^>]*>[^<]*(?:SAVE_PLAYER|СОХРАНИТЬ)[^<]*<\/button>)/i,panel+'$1');
  };
  const collectBefore138=Configurator.collectEntity.bind(Configurator);
  Configurator.collectEntity=function(type,form,fd=new FormData(form)){
    const entity=collectBefore138(type,form,fd);if(type==='equipment'&&entity){entity.durabilityMax=Math.max(0,integer(fd.get('durabilityMax'),0));entity.chargesMax=Math.max(0,integer(fd.get('chargesMax'),0));return normalizeEquipmentItemV2(entity);}if(type==='players'&&entity)entity.itemStateV138=normalizeItemState(entity.itemStateV138);return entity;
  };

  document.addEventListener('click',async event=>{
    const button=event.target?.closest?.('[data-credit-grant-v138]');if(!button)return;event.preventDefault();event.stopPropagation();const playerId=text(button.dataset.creditGrantV138),form=button.closest('form'),input=form?.querySelector('[data-credit-amount-v138]'),amount=integer(input?.value);button.disabled=true;
    try{const result=await grantCredits(playerId,amount,{reason:'World Config'});if(!result.ok){Toast?.show?.(result.message||'Не удалось выдать деньги','err');return;}const user=App.state?.users?.[playerId],credits=form?.querySelector('[name="credits"]');if(credits&&user)credits.value=String(number(user.credits,0));if(input)input.value='';Toast?.show?.(`Добавлено ${amount} денег персонажу ${user?.displayName||user?.name||playerId}`,'ok');}
    finally{button.disabled=false;}
  },true);

  window.GRPGFeaturePackV138={version:'1.0.138',grantCredits,normalizeItemState};
})();
