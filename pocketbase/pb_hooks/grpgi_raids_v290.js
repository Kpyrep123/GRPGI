'use strict';
const Auth=require(__hooks+'/grpgi_auth_v212.js');
const Core=require(__hooks+'/raid-core-v290.js');
const Hub=require(__hooks+'/hub-rules-v221.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function json(row,key){const x=row.get(key);return JSON.parse(typeof x==='string'?x:toString(x||'{}'));}
function first(app,name,filter,args){const row=app.findRecordsByFilter(name,filter,name==='campaign_snapshots'?'-revision':'',1,0,args)[0];if(!row)throw new NotFoundError('Запись не найдена');return row;}
function profileRow(app,campaign,player){return first(app,'campaign_players','campaignId={:campaign} && playerId={:player}',{campaign,player});}
function world(app,campaign){return json(first(app,'campaign_snapshots','campaignId={:campaign}',{campaign}),'worldJson');}
const table='grpgi_raids_v290';
function get(app,campaign,week){const row=new DynamicModel({state:'',revision:0});try{app.db().newQuery('SELECT state, revision FROM '+table+' WHERE campaign={:campaign} AND week={:week}').bind({campaign,week}).one(row);return JSON.parse(row.state);}catch(error){if(!String(error).includes('no rows'))throw error;return null;}}
function put(app,campaign,week,s){app.db().newQuery('INSERT INTO '+table+' (campaign,week,revision,status,state) VALUES ({:campaign},{:week},{:revision},{:status},{:state}) ON CONFLICT(campaign,week) DO UPDATE SET revision=excluded.revision,status=excluded.status,state=excluded.state').bind({campaign,week,revision:s.revision,status:s.phase,state:JSON.stringify(s)}).execute();}
function random(){return parseInt($security.randomStringWithAlphabet(12,'0123456789abcdef'),16)/281474976710656;}
function id(){return 'raid:'+ $security.randomString(24);}
function entry(app,campaign,player,mission,input){
  const p=json(profileRow(app,campaign,player),'playerJson');if(p.dead229||p.__deleted||p.role==='gm')throw new ForbiddenError('Персонаж недоступен');
  if(input.planetId!==mission.entry.planetId||input.objectId!==mission.entry.objectId||input.dialogId!==mission.entry.dialogId)throw new ForbiddenError('Запустите вылазку через указанный диалог НПС');
  if(p.currentPlanetId!==mission.entry.planetId)throw new ForbiddenError('НПС находится на другой планете');
  const w=world(app,campaign),planet={...w.planets?.PLANETS?.[p.currentPlanetId],id:p.currentPlanetId},hub=Hub.core.hubOf(planet),state=Hub.core.stateFor(p,planet,hub),map=hub.maps.find(m=>m.id===state.mapId),object=map?.objects.find(o=>o.id===input.objectId),dialog=hub.dialogs.find(d=>d.id===input.dialogId);
  if(!object?.npcId||!dialog||!Hub.core.dialogsFor(hub,object,p,state).some(d=>d.id===dialog.id))throw new ForbiddenError('Диалог НПС недоступен');
  const reason=Hub.spatial.interactionReason(map,state,p,object)||Hub.core.dialogReason(dialog,p,state,object);if(reason)throw new ForbiddenError(reason);return p;
}
function roster(app,campaign){const rows=[];for(let offset=0;;offset+=500){const page=app.findRecordsByFilter('campaign_players','campaignId={:campaign} && deletedAt=""','',500,offset,{campaign});rows.push(...page);if(page.length<500)break;}return rows.map(r=>json(r,'playerJson')).filter(p=>p.role!=='gm'&&!p.__deleted&&!p.dead229).map(p=>({id:p.id,name:p.displayName||p.name||p.id,locked:!!p.raidLock290}));}
function saveProfiles(app,campaign,s){if(!s.units)return;const values=Core.engine(s,random,id).profiles();s.releasedProfiles ||= [];for(const [key,value] of Object.entries(values)){if(s.releasedProfiles.includes(key))continue;const row=profileRow(app,campaign,key),previous=json(row,'playerJson');if(JSON.stringify(previous)!==JSON.stringify(value)){row.set('playerJson',value);row.set('version',row.getInt('version')+1);row.set('updatedBy','raids-v290');row.set('clientUpdatedAt',new Date().toISOString());app.save(row);}if(!value.raidLock290)s.releasedProfiles.push(key);}}
function publicState(app,campaign,s,player,now,dm=false){if(!s.units&&(!Core.week(now).open||s.week!==Core.week(now).id))return {phase:'closed',week:s.week,serverNow:now};if(s.units){if(!dm&&!s.members.includes(player))return {phase:'unavailable',message:'Попытка уже занята другой группой',week:s.week,serverNow:now};return {...Core.view(s,dm?s.members[0]:player,now),dm};}return{id:s.id,week:s.week,revision:s.revision,phase:s.phase,dm,mission:{id:s.mission.id,name:s.mission.name,reward:s.mission.reward,goals:s.mission.goals},lobby:s.lobby,roster:roster(app,campaign),serverNow:now,opens:s.window.start,closes:s.window.end};}
function request(e){
  const actor=Auth.actor(e),campaign=actor.getString('campaignId'),player=actor.getString('playerId'),data=e.requestInfo().body||{},now=Date.now(),window=Core.week(now);let response;
  e.app.runInTransaction(app=>{
    const currentProfile=json(profileRow(app,campaign,player),'playerJson');const selectedWeek=currentProfile.raidLock290?.split('|').pop()||data.week||window.id;
    let s=get(app,campaign,selectedWeek);
    if(!s){
      if(!window.open||selectedWeek!==window.id){response={phase:'closed',serverNow:now,window};return;}
      const w=world(app,campaign),config=w.campaigns?.RAIDS_V290?.[campaign];if(!config?.enabled){response={phase:'disabled'};return;}
      const missions=(config.missions||[]).filter(m=>m.enabled!==false);if(!missions.length){response={phase:'disabled'};return;}
      const mission=missions[Math.floor(random()*missions.length)];Core.validate(mission,w);
      s={id:campaign+'|'+window.id,week:window.id,window,phase:'lobby',revision:0,mission:clone(mission),world:clone(w),lobby:{leader:'',invited:[],ready:[]},receipts:[],createdAt:now};put(app,campaign,selectedWeek,s);
    }
    const type=data.type||'status';if(s.phase==='lobby'&&type!=='abort'&&!world(app,campaign).campaigns?.RAIDS_V290?.[campaign]?.enabled){response={phase:'disabled'};return;}
    if(type==='status'){if(s.units&&s.members.includes(player)&&data.runId===s.id&&data.revision===s.revision){response={unchanged:true,id:s.id,revision:s.revision,serverNow:now};return;}response=publicState(app,campaign,s,player,now,actor.getBool('dm'));return;}
    const operation=String(data.operationId||'');if(!/^[-a-zA-Z0-9_:]{8,120}$/.test(operation))throw new BadRequestError('Нужен ID операции');
    const fingerprint=$security.sha256(JSON.stringify([player,{...data,operationId:undefined,revision:undefined}]));const receipt=s.receipts.find(r=>r.id===operation);
    if(receipt){if(receipt.fingerprint!==fingerprint)throw new BadRequestError('Операция уже использована с другими параметрами');response=publicState(app,campaign,s,player,now,actor.getBool('dm'));return;}
    if(data.revision!==s.revision)throw new ApiError(409,'Состояние изменилось, обновите вылазку');
    if(type==='abort'){
      if(!actor.getBool('dm'))throw new ForbiddenError('Требуется ДМ');if(!s.units){s.lobby={leader:'',invited:[],ready:[]};s.revision++;put(app,campaign,s.week,s);response=publicState(app,campaign,s,player,now,true);return;}
      s.phase='finished';s.success=false;s.survivors=s.units.filter(u=>u.playerId&&!u.dead229).map(u=>u.id);delete s.job;delete s.pending;s.events=[];delete s.flow;
    }else if(s.phase==='lobby'){
      if(!window.open||s.week!==window.id)throw new BadRequestError('Окно новых попыток закрыто');
      entry(app,campaign,player,s.mission,data.entry||{});
      if(type==='party'){
        if(s.lobby.leader&&s.lobby.leader!==player)throw new ForbiddenError('Группа уже создана');
        const ids=[...new Set([player,...(data.members||[])])],players=roster(app,campaign);if(ids.some(id=>!players.some(p=>p.id===id&&!p.locked)))throw new BadRequestError('Участник недоступен');s.lobby={leader:player,invited:ids,ready:[]};
      }else if(type==='ready'){
        if(!s.lobby.invited.includes(player))throw new ForbiddenError('Вы не приглашены');if(!s.lobby.ready.includes(player))s.lobby.ready.push(player);
      }else if(type==='cancel'){
        if(s.lobby.leader!==player)throw new ForbiddenError('Только лидер');s.lobby={leader:'',invited:[],ready:[]};
      }else if(type==='start'){
        if(s.lobby.leader!==player||!s.lobby.invited.length||s.lobby.invited.some(id=>!s.lobby.ready.includes(id)))throw new BadRequestError('Вся группа должна подтвердить готовность');
        if(now-Number(e.app.store().get('grpgi-raid-worker-heartbeat290')||0)>15000)throw new BadRequestError('Worker вылазок не запущен или недоступен');
        const members=s.lobby.invited.map(key=>{const p=entry(app,campaign,key,s.mission,data.entry||{});if(p.raidLock290)throw new BadRequestError('Персонаж уже в вылазке');p.id=key;return p;});
        const run=Core.create(s.world,s.mission,members,now,random,id);Object.assign(s,run,{id:s.id,week:s.week,window:s.window,revision:s.revision,receipts:s.receipts});Core.engine(s,random,id).drain(now);
      }else throw new BadRequestError('Неизвестная команда группы');
    }else{
      if(!s.members.includes(player))throw new ForbiddenError('Вы не участник');
      const api=Core.engine(s,random,id);api.tick(now);if(s.error)throw new BadRequestError(s.error);api.command(player,data,now);api.drain(now);
    }
    s.revision++;s.receipts.push({id:operation,fingerprint});s.receipts=s.receipts.slice(-256);saveProfiles(app,campaign,s);put(app,campaign,s.week,s);response=publicState(app,campaign,s,player,now,actor.getBool('dm'));
  });if(response?.phase==='lobby')response.workerReady=Date.now()-Number(e.app.store().get('grpgi-raid-worker-heartbeat290')||0)<=15000;if(response?.map&&data.runId===response.id&&data.mapId===response.map.id)response.map={id:response.map.id,unchanged:true};return e.json(200,response);
}
function workerAuth(e){const secret=$os.getenv('GRPGI_RAID_WORKER_TOKEN');if(secret.length<32||e.request.header.get('X-GRPGI-Worker-Token')!==secret)throw new ForbiddenError('Неверный токен worker');}
function scan(app){const result=arrayOf(new DynamicModel({campaign:'',week:'',state:''}));app.db().newQuery("SELECT campaign,week,state FROM "+table+" WHERE status IN ('running','rewards') ORDER BY campaign,week").all(result);return result;}
function claim(e){workerAuth(e);e.app.store().set('grpgi-raid-worker-heartbeat290',Date.now());let jobs=[];e.app.runInTransaction(app=>{for(const row of scan(app)){
  const s=JSON.parse(row.state),original=JSON.stringify(s),api=Core.engine(s,random,id),now=Date.now();if(!s.error){const before=clone(s);try{api.tick(now);api.drain(now);}catch(error){Object.assign(s,before);s.error=String(error.message||error);}}const job=s.job;
  if(job&&!s.error&&(!job.lease||job.lease.until<now)){job.lease={token:id(),until:now+30000};jobs.push({campaign:row.campaign,week:row.week,id:job.id,lease:job.lease.token,payload:job.payload});}
  if(JSON.stringify(s)!==original){s.revision++;saveProfiles(app,row.campaign,s);put(app,row.campaign,row.week,s);}
}});return e.json(200,{jobs});}
function result(e){workerAuth(e);const d=e.requestInfo().body||{};e.app.runInTransaction(app=>{let s=get(app,d.campaign,d.week);if(!s?.job||s.job.id!==d.id||s.job.lease?.token!==d.lease)return;const before=clone(s);try{Core.engine(s,random,id).jobResult(d.id,d.result,Date.now());}catch(error){s=before;s.error=String(error.message||error);}s.revision++;saveProfiles(app,d.campaign,s);put(app,d.campaign,d.week,s);});return e.json(200,{ok:true});}
function bootstrap(e){e.next();e.app.db().newQuery('CREATE TABLE IF NOT EXISTS '+table+' (campaign TEXT NOT NULL,week TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,state TEXT NOT NULL,PRIMARY KEY(campaign,week))').execute();}
function lockedRequest(e){const p=json(e.record.original?.()||e.record,'playerJson');if(p.raidLock290)throw new ForbiddenError('Профиль занят вылазкой. Завершите её или используйте команду ДМа');return e.next();}
module.exports={request,claim,result,bootstrap,lockedRequest};
