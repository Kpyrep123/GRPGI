'use strict';
const social=require(__hooks+'/grpgi_galagram_v315.js');
const policy=require(__hooks+'/galagram-v315.js');
const auth=require(__hooks+'/grpgi_auth_v212.js');
function q(a,sql,args){return a.db().newQuery(sql).bind(args||{});}
function all(a,sql,args,shape){const rows=arrayOf(new DynamicModel(shape));q(a,sql,args).all(rows);return rows;}
function problem(message,code='invalid'){const e=new Error(message);e.code=code;throw e;}
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object'){const out={};for(const k of Object.keys(v).sort()){if(['__proto__','constructor','prototype'].includes(k))problem('Некорректное поле');out[k]=canonical(v[k]);}return out;}return v;}
function bootstrap(e){e.next();for(const sql of [
 'CREATE TABLE IF NOT EXISTS grpgi_planning_clock_v316(storage TEXT,logical TEXT,revision INTEGER DEFAULT 0,PRIMARY KEY(storage,logical))',
 'CREATE TABLE IF NOT EXISTS grpgi_planning_sessions_v316(id TEXT PRIMARY KEY,storage TEXT,logical TEXT,status TEXT,start_ms INTEGER DEFAULT 0,deadline INTEGER DEFAULT 0,data TEXT,updated INTEGER)',
 'CREATE INDEX IF NOT EXISTS grpgi_planning_scope_v316 ON grpgi_planning_sessions_v316(storage,logical,status)',
 'CREATE INDEX IF NOT EXISTS grpgi_planning_due_v316 ON grpgi_planning_sessions_v316(status,deadline,start_ms)',
 'CREATE TABLE IF NOT EXISTS grpgi_planning_votes_v316(session TEXT,player TEXT,interested INTEGER DEFAULT 0,answered INTEGER DEFAULT 0,dates TEXT DEFAULT \'[]\',version INTEGER,PRIMARY KEY(session,player))',
 'CREATE TABLE IF NOT EXISTS grpgi_planning_regs_v316(session TEXT,player TEXT,status TEXT,version INTEGER,PRIMARY KEY(session,player))',
 'CREATE TABLE IF NOT EXISTS grpgi_planning_ops_v316(storage TEXT,actor TEXT,operation TEXT,fingerprint TEXT,result TEXT,PRIMARY KEY(storage,actor,operation))'
 ])q(e.app,sql).execute();}
function parse(r,k){try{return JSON.parse(r.getString(k)||'{}');}catch{return {};}}
function taskMap(a,storage){
 try{const head=all(a,'SELECT dirty,indexed FROM grpgi_world_heads_v301 WHERE campaign={:storage}',{storage},{dirty:0,indexed:0})[0];if(head&&head.dirty===head.indexed){const rows=all(a,"SELECT data FROM grpgi_world_entities_v301 WHERE campaign={:storage} AND deleted=0 AND key LIKE '[\"world\",\"tasks\",%'",{storage},{data:''}),map={};for(const row of rows){const n=JSON.parse(row.data);if(n.t==='v'&&n.v?.id)map[n.v.id]=n.v;}return map;}}catch{}
 const r=a.findFirstRecordByFilter('campaign_snapshots','campaignId={:c}',{c:storage}),section=parse(r,'worldJson').tasks||{};
 return Object.fromEntries((Array.isArray(section.TASK_LIST)?section.TASK_LIST:Object.values(section.TASKS||{})).filter(t=>t?.id).map(t=>[t.id,t]));
}
function context(a,u,logical){const storage=u.getString('campaignId'),actor=u.getString('playerId'),dm=u.getBool('dm');
 const own=social.profile(a,storage,actor);if(!dm&&(!own||own.__deleted||['pending','rejected'].includes(own.approvalStatus)))problem('Профиль недоступен','forbidden');
 if(logical!==storage&&!dm&&!(own?.campaignIds||[]).includes(logical))problem('Кампания недоступна','forbidden');
 const rows=all(a,'SELECT playerId,playerJson,deletedAt FROM campaign_players WHERE campaignId={:storage}',{storage},{playerId:'',playerJson:'',deletedAt:''});
 const players=rows.filter(r=>!r.deletedAt).map(r=>({...JSON.parse(r.playerJson||'{}'),id:r.playerId})).filter(p=>!p.__deleted&&!['pending','rejected'].includes(p.approvalStatus)&&p.role!=='gm'&&(logical===storage||p.campaignIds?.includes(logical)));
 const tasks=taskMap(a,storage);return {a,u,storage,logical,actor,dm,players,tasks,viewer:{...own,id:actor,role:dm?'gm':'player'}};
}
function canView(ctx,s){return !!ctx.tasks[s.taskId]&&policy.visible(ctx.tasks[s.taskId],ctx.viewer,ctx.logical);}
function requireTask(ctx,id){const t=ctx.tasks[id];if(!t||!policy.visible(t,ctx.viewer,ctx.logical))problem('Задание недоступно','forbidden');return t;}
function load(a,id){const row=all(a,'SELECT data FROM grpgi_planning_sessions_v316 WHERE id={:id}',{id},{data:''})[0];if(!row)problem('Встреча не найдена','missing');return JSON.parse(row.data);}
function regs(a,id){return all(a,'SELECT player,status,version FROM grpgi_planning_regs_v316 WHERE session={:id}',{id},{player:'',status:'',version:0});}
function votes(a,id){return all(a,'SELECT player,interested,answered,dates,version FROM grpgi_planning_votes_v316 WHERE session={:id}',{id},{player:'',interested:0,answered:0,dates:'[]',version:0});}
function touch(a,s){q(a,'INSERT INTO grpgi_planning_clock_v316(storage,logical,revision) VALUES({:storage},{:logical},1) ON CONFLICT(storage,logical) DO UPDATE SET revision=revision+1',s).execute();}
function save(a,s){s.updated=Date.now();q(a,'INSERT INTO grpgi_planning_sessions_v316 VALUES({:id},{:storage},{:logical},{:status},{:start},{:deadline},{:data},{:updated}) ON CONFLICT(id) DO UPDATE SET status=excluded.status,start_ms=excluded.start_ms,deadline=excluded.deadline,data=excluded.data,updated=excluded.updated',{...s,start:s.start?Date.parse(s.start):0,deadline:s.confirmUntil?Date.parse(s.confirmUntil):0,data:JSON.stringify(s)}).execute();touch(a,s);}
function putReg(a,s,player,status){q(a,'INSERT INTO grpgi_planning_regs_v316 VALUES({:id},{:player},{:status},{:version}) ON CONFLICT(session,player) DO UPDATE SET status=excluded.status,version=excluded.version',{id:s.id,player,status,version:s.version}).execute();}
function people(a,s){return Array.from(new Set([...s.invited,...regs(a,s.id).filter(r=>['confirmed','reserved'].includes(r.status)).map(r=>r.player),...votes(a,s.id).filter(v=>v.interested||v.answered).map(v=>v.player)]));}
const headings={poll:'Началось голосование по датам',approved:'Выбрана новая дата игры',rescheduled:'Дата игры изменена',opened:'Открылась запись на игру',cancelled:'Игра отменена'};
function notice(a,s,kind,targets,ownerId){social.event(a,s.storage,'session:'+s.id+':'+s.version+':'+kind,{type:'session',sessionId:s.id,version:s.version,logicalCampaign:s.logical,kind,targets:Array.from(new Set(targets)),ownerId,heading:headings[kind],message:kind==='rescheduled'||kind==='approved'?'Откройте встречу и подтвердите участие.':'Откройте раздел игровых встреч.'},false);}
function advance(a,s,now){
 if(s.status==='priority'&&Date.parse(s.confirmUntil)<=now){q(a,"UPDATE grpgi_planning_regs_v316 SET status='expired' WHERE session={:id} AND status='reserved'",s).execute();s.status='open';s.editVersion++;save(a,s);if(Date.parse(s.start)>now)notice(a,s,'opened',people(a,s));}
 if(['priority','open'].includes(s.status)&&Date.parse(s.start)<=now){s.status='closed';s.editVersion++;save(a,s);}
}
function tick(a){const due=all(a,"SELECT id FROM grpgi_planning_sessions_v316 WHERE (status='priority' AND deadline<={:now}) OR (status IN ('priority','open') AND start_ms<={:now}) LIMIT 100",{now:Date.now()},{id:''});for(const row of due)a.runInTransaction(tx=>{q(tx,'UPDATE grpgi_planning_sessions_v316 SET updated=updated WHERE id={:id}',row).execute();advance(tx,load(tx,row.id),Date.now());});}
function epoch(value,label){const n=Date.parse(value);if(!Number.isFinite(n))problem('Укажите '+label);return new Date(n).toISOString();}
function options(value){if(!Array.isArray(value)||!value.length||value.length>12)problem('Предложите от 1 до 12 дат');const ids=new Set(),times=new Set();return value.map(v=>{const id=String(v.id||'');if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||ids.has(id))problem('Некорректные варианты дат');ids.add(id);const at=epoch(v.at,'дату');if(times.has(at)||Date.parse(at)<=Date.now())problem('Предложенные даты должны быть разными и будущими');times.add(at);return {id,at};});}
function cap(n){n=Number(n);if(!Number.isInteger(n)||n<1||n>100)problem('Лимит игроков: от 1 до 100');return n;}
function invites(ctx,ids){if(!Array.isArray(ids)||ids.length>100)problem('Некорректный состав');const out=Array.from(new Set(ids.map(String)));if(out.some(id=>!ctx.players.some(p=>p.id===id&&policy.visible(ctx.tasks[ctx.taskId],p,ctx.logical))))problem('В составе есть недоступный игрок');return out;}
function voteDeadline(value,opts){if(!value)return '';const at=epoch(value,'срок голосования');if(Date.parse(at)<=Date.now()||Date.parse(at)>Math.min(...opts.map(o=>Date.parse(o.at))))problem('Голосование должно закончиться до первой предложенной игры');return at;}
function deadline(value,start){const at=epoch(value,'срок подтверждения');if(Date.parse(at)<=Date.now()||Date.parse(at)>Date.parse(start))problem('Срок подтверждения должен быть в будущем и не позже игры');return at;}
function dmOnly(ctx){if(!ctx.dm)problem('Требуется ДМ','forbidden');}
function current(s,b){if(Number(b.version)!==s.version)problem('Дата или варианты изменились. Обновите встречу.','stale');}
function editable(s,b){if(Number(b.editVersion)!==s.editVersion)problem('Настройки встречи уже изменены. Обновите их перед сохранением.','conflict');}
function available(ctx,s){return ctx.players.filter(p=>policy.visible(ctx.tasks[s.taskId],p,ctx.logical));}
function change(ctx,b){const {a,storage,logical,actor}=ctx,now=Date.now();let s;
 if(b.action==='create'){
  dmOnly(ctx);ctx.taskId=String(b.taskId||'');const task=requireTask(ctx,ctx.taskId);if(task.status==='completed')problem('Задание завершено');
  let parent=null;if(b.parentId){parent=load(a,String(b.parentId));if(parent.storage!==storage||parent.logical!==logical||parent.taskId!==ctx.taskId)problem('Продолжение другой кампании или задания');if(['cancelled','poll'].includes(parent.status))problem('Нужна предыдущая встреча с выбранной датой');}
  const continuation=!!b.continuation||!!parent,id='game_'+$security.randomString(20),opts=options(b.options),roster=continuation?invites(ctx,b.invited||[]):[];
  if(continuation&&!roster.length)problem('Укажите прежний состав');const limit=cap(b.capacity);if(roster.length>limit)problem('Лимит меньше приглашённого состава');
  s={id,storage,logical,taskId:ctx.taskId,title:String(task.title||task.name||ctx.taskId).slice(0,200),status:'poll',version:1,editVersion:1,options:opts,capacity:limit,invited:continuation?roster:[],continuation,parentId:parent?.id||'',series:parent?.series||id,number:parent?parent.number+1:1,voteUntil:voteDeadline(b.voteUntil,opts),confirmUntil:'',start:'',zone:String(b.zone||'UTC').slice(0,80),history:[],created:now};
  save(a,s);notice(a,s,'poll',continuation?s.invited:available(ctx,s).map(p=>p.id),actor);return s;
 }
 s=load(a,String(b.sessionId||''));if(s.storage!==storage||s.logical!==logical)problem('Встреча другой кампании','forbidden');requireTask(ctx,s.taskId);ctx.taskId=s.taskId;advance(a,s,now);current(s,b);
 if(['edit','approve','reschedule','cancel','complete'].includes(b.action)){dmOnly(ctx);editable(s,b);}
 if(['interest','vote'].includes(b.action)){
  if(s.status!=='poll'||(s.voteUntil&&Date.parse(s.voteUntil)<=now))problem('Голосование завершено');if(!ctx.players.some(p=>p.id===actor))problem('Голосовать может профиль игрока','forbidden');
  const old=votes(a,s.id).find(v=>v.player===actor)||{interested:0,answered:0,dates:'[]'};
  if(b.action==='vote'){
   if(s.continuation&&!s.invited.includes(actor))problem('Даты продолжения выбирает прежний состав','forbidden');
   if(!Array.isArray(b.dates)||b.dates.length>12)problem('Некорректный ответ');const dates=Array.from(new Set(b.dates.map(String)));if(dates.some(id=>!s.options.some(o=>o.id===id)))problem('Вариант даты удалён','stale');old.answered=1;old.dates=JSON.stringify(dates);
  }else old.interested=b.interested?1:0;
  q(a,'INSERT INTO grpgi_planning_votes_v316 VALUES({:id},{:actor},{:interested},{:answered},{:dates},{:version}) ON CONFLICT(session,player) DO UPDATE SET interested=excluded.interested,answered=excluded.answered,dates=excluded.dates,version=excluded.version',{...s,...old,actor}).execute();touch(a,s);return s;
 }
 if(b.action==='join'||b.action==='decline'){
  if(!['open','priority'].includes(s.status))problem('Запись закрыта');if(!ctx.players.some(p=>p.id===actor))problem('Записываться может профиль игрока','forbidden');
  if(b.action==='decline'){putReg(a,s,actor,'declined');touch(a,s);return s;}
  if(ctx.tasks[s.taskId].status==='completed')problem('Задание завершено');if(s.status==='priority'&&!s.invited.includes(actor))problem('Сначала подтверждает прежний состав','priority');
  const rows=regs(a,s.id),mine=rows.find(r=>r.player===actor);if(mine?.status==='confirmed'&&mine.version===s.version)return s;
  const occupied=rows.filter(r=>r.player!==actor&&['confirmed','reserved'].includes(r.status)).length;if(occupied>=s.capacity)problem('Все места заняты','full');
  putReg(a,s,actor,'confirmed');touch(a,s);return s;
 }
 if(b.action==='edit'){
  if(['cancelled','closed','completed'].includes(s.status))problem('Встреча закрыта');const limit=cap(b.capacity);let roster=s.invited;
  if(s.status==='poll'){roster=s.continuation?invites(ctx,b.invited||[]):[];const opts=options(b.options);if(JSON.stringify(opts)!==JSON.stringify(s.options)){s.options=opts;s.version++;q(a,"UPDATE grpgi_planning_votes_v316 SET answered=0,dates='[]',version={:version} WHERE session={:id}",s).execute();}s.voteUntil=voteDeadline(b.voteUntil,opts);}
  const occupied=regs(a,s.id).filter(r=>['confirmed','reserved'].includes(r.status)).length;if(limit<Math.max(occupied,s.status==='poll'?roster.length:0))problem('Лимит меньше подтверждений и резервов');s.invited=roster;s.capacity=limit;s.editVersion++;save(a,s);return s;
 }
 if(b.action==='approve'){
  if(s.status!=='poll')problem('Дата уже выбрана');const option=s.options.find(o=>o.id===b.optionId);if(!option||Date.parse(option.at)<=now)problem('Выберите будущую дату');s.start=option.at;s.confirmUntil=s.continuation?deadline(b.confirmUntil,s.start):'';s.status=s.continuation?'priority':'open';
  for(const player of s.invited)putReg(a,s,player,'reserved');s.editVersion++;save(a,s);notice(a,s,'approved',people(a,s),actor);return s;
 }
 if(b.action==='reschedule'){
  if(!['priority','open','closed'].includes(s.status))problem('Перенос недоступен');const start=epoch(b.start,'новую дату');if(Date.parse(start)<=now||start===s.start)problem('Выберите другую будущую дату');
  const occupants=regs(a,s.id).filter(r=>['confirmed','reserved'].includes(r.status)).map(r=>r.player),targets=people(a,s);
  s.history=[...s.history,{start:s.start,version:s.version,changedAt:now}].slice(-30);s.version++;s.start=start;s.invited=occupants;s.confirmUntil=deadline(b.confirmUntil,start);s.status=occupants.length?'priority':'open';s.editVersion++;
  q(a,"UPDATE grpgi_planning_votes_v316 SET answered=0,dates='[]',version={:version} WHERE session={:id}",s).execute();for(const player of occupants)putReg(a,s,player,'reserved');save(a,s);notice(a,s,'rescheduled',targets,actor);return s;
 }
 if(b.action==='cancel'||b.action==='complete'){
  if(['cancelled','completed'].includes(s.status))return s;const targets=people(a,s);s.status=b.action==='cancel'?'cancelled':'completed';s.editVersion++;save(a,s);if(b.action==='cancel')notice(a,s,'cancelled',targets,actor);return s;
 }
 problem('Неизвестное действие');
}
function mutate(e){const u=auth.actor(e),b=e.requestInfo().body||{},storage=u.getString('campaignId'),actor=u.getString('playerId'),logical=String(b.logicalCampaign||storage),operation=String(b.operation||'');
 if(!/^[a-zA-Z0-9_-]{8,100}$/.test(operation))return e.json(200,{ok:false,code:'invalid',message:'Нужен ID операции'});
 const fingerprint=$security.sha256(JSON.stringify(canonical(b)));let result;
 try{e.app.runInTransaction(a=>{
  // The first statement reserves the SQLite writer before reading capacity or a receipt.
  q(a,'INSERT OR IGNORE INTO grpgi_planning_clock_v316(storage,logical) VALUES({:storage},{:logical})',{storage,logical}).execute();
  q(a,'UPDATE grpgi_planning_clock_v316 SET revision=revision WHERE storage={:storage} AND logical={:logical}',{storage,logical}).execute();
  const receipt=all(a,'SELECT fingerprint,result FROM grpgi_planning_ops_v316 WHERE storage={:storage} AND actor={:actor} AND operation={:operation}',{storage,actor,operation},{fingerprint:'',result:''})[0];
  if(receipt){if(receipt.fingerprint!==fingerprint)problem('ID операции уже использован','conflict');result=JSON.parse(receipt.result);return;}
  const ctx=context(a,u,logical),s=change(ctx,b);result={ok:true,id:s.id,version:s.version};
  q(a,'INSERT INTO grpgi_planning_ops_v316 VALUES({:storage},{:actor},{:operation},{:fingerprint},{:result})',{storage,actor,operation,fingerprint,result:JSON.stringify(result)}).execute();
 });return e.json(200,result);}catch(err){if(['invalid','forbidden','missing','stale','conflict','priority','full'].includes(err.code))return e.json(200,{ok:false,code:err.code,message:err.message});throw err;}
}
function state(e){const u=auth.actor(e),storage=u.getString('campaignId'),logical=String(e.requestInfo().query?.logicalCampaign||storage);let result;
 e.app.runInTransaction(a=>{q(a,'INSERT OR IGNORE INTO grpgi_planning_clock_v316(storage,logical) VALUES({:storage},{:logical})',{storage,logical}).execute();q(a,'UPDATE grpgi_planning_clock_v316 SET revision=revision WHERE storage={:storage} AND logical={:logical}',{storage,logical}).execute();
 const ctx=context(a,u,logical),rows=all(a,"SELECT data FROM grpgi_planning_sessions_v316 WHERE storage={:storage} AND logical={:logical} AND status NOT IN ('cancelled','completed','closed') UNION ALL SELECT data FROM (SELECT data FROM grpgi_planning_sessions_v316 WHERE storage={:storage} AND logical={:logical} AND status IN ('cancelled','completed','closed') ORDER BY updated DESC LIMIT 20)",{storage,logical},{data:''}),sessions=rows.map(r=>JSON.parse(r.data));for(const s of sessions)advance(a,s,Date.now());
 const clock=all(a,'SELECT revision FROM grpgi_planning_clock_v316 WHERE storage={:storage} AND logical={:logical}',{storage,logical},{revision:0})[0].revision;
 const revision=String(clock)+':'+$security.sha256(JSON.stringify(canonical({viewer:{id:ctx.viewer.id,role:ctx.viewer.role,eraId:ctx.viewer.eraId},tasks:Object.values(ctx.tasks).map(t=>({id:t.id,title:t.title||t.name,summary:t.summary,subtitle:t.subtitle,image:t.image,status:t.status,visibility:t.visibility})),players:ctx.players.map(p=>({id:p.id,name:p.displayName||p.name}))})));
 if(String(e.requestInfo().query?.since||'')===String(revision)){result={ok:true,unchanged:true,revision,serverNow:Date.now()};return;}
 result={ok:true,revision,serverNow:Date.now(),dm:ctx.dm,playerId:ctx.actor,players:ctx.players.map(p=>({id:p.id,name:p.displayName||p.name||p.id})),tasks:Object.values(ctx.tasks).filter(t=>policy.visible(t,ctx.viewer,logical)).map(t=>({id:t.id,title:t.title||t.name||t.id,summary:String(t.summary||t.subtitle||'').slice(0,300),image:/^https?:\/\//.test(t.image||'')?t.image:'',status:t.status||'open'})),sessions:sessions.filter(s=>canView(ctx,s)).map(s=>{const eligible=new Set(available(ctx,s).map(p=>p.id)),allVotes=votes(a,s.id).filter(v=>eligible.has(v.player)&&v.version===s.version),mine=allVotes.find(v=>v.player===ctx.actor);return {...s,roster:regs(a,s.id),interest:allVotes.filter(v=>v.interested).map(v=>v.player),availability:s.options.map(o=>({id:o.id,players:allVotes.filter(v=>v.answered&&JSON.parse(v.dates).includes(o.id)).map(v=>v.player)})),myVote:mine?{interested:!!mine.interested,answered:!!mine.answered,dates:JSON.parse(mine.dates)}:{interested:false,answered:false,dates:[]},canVote:!s.continuation||s.invited.includes(ctx.actor)};})};
 });return e.json(200,result);
}
function canReceive(a,event,user,storage,logical){try{const s=load(a,event.sessionId);return s.storage===storage&&s.logical===logical&&s.version===event.version&&policy.visible(taskMap(a,storage)[s.taskId],user,logical)&&(event.kind==='cancelled'?s.status==='cancelled':event.kind==='poll'?s.status==='poll':['priority','open'].includes(s.status));}catch{return false;}}
module.exports={bootstrap,state,mutate,tick,canReceive};
