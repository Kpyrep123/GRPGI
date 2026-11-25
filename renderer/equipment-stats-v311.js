/* Transient per-instance equipment calculations. Never written to profiles. */
(function () {
  'use strict';
  const list = value => Array.isArray(value) ? value : [];
  const clone = value => JSON.parse(JSON.stringify(value));
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const targets = {armor_class:'armorClass', defense:'absorption', damage_bonus:'damageBonus'};
  const scalar = mod => mod?.enabled !== false && ['add','set',''].includes(String(mod.op || 'add')) && !mod.statRef;
  const consumed = mod => Boolean(targets[mod?.target]) && scalar(mod);
  const apply = (stats, mod) => {
    const key = targets[mod.target];
    if (key) stats[key] = mod.op === 'set' ? number(mod.value) : stats[key] + number(mod.value);
  };
  function plan(item, copy, slot, unitId, context = {}) {
    const api = window.GRPGStatsV113, instances = window.GRPGItemInstancesV215;
    const matches = mod => api.equipmentModifierMatches311(mod, context);
    const own = list(item.modifiers).filter(consumed).filter(matches).sort((a,b)=>number(a.priority)-number(b.priority));
    const damage = String(item.damage ?? '').trim();
    const baseStats = {armorClass:0, absorption:0, shieldBlock:number(item.shieldBlock), damage:damage !== '' && Number.isFinite(Number(damage)) ? Number(damage) : damage, damageBonus:0};
    own.forEach(mod=>apply(baseStats,mod));
    if (!list(item.modifiers).some(mod=>mod.target==='armor_class') && item.type==='armor') baseStats.armorClass = number(item.armorClass)>=5 ? number(item.armorClass)-10 : number(item.armorClass);
    if (!list(item.modifiers).some(mod=>mod.target==='defense')) baseStats.absorption = number(item.damageReduction ?? item.defense);
    if(item.type==='shield')baseStats.armorClass=Math.max(baseStats.armorClass,number(item.shieldCoverBonus ?? item.coverBonus));
    const effects = list(copy?.aberration252?.effects).map(id=>{
      const effect=window.GRPGAberrationWeapons?.effects([id])?.[0] || instances.passiveEffect(id) || {name:id,value:0};
      const passive=instances.passiveEffect(id);
      let stat=targets[passive?.target];
      if(effect.group==='weapon-2')stat='damageBonus';
      return {id,kind:'aberration',applies:effect.group!=='weapon-2'||context.firstShot!==false,effect:{...clone(effect),id},stat:stat || null,op:'add',value:number(effect.value)};
    });
    const attachments=clone(list(copy?.attachments));
    const enhancements=[...effects];
    for(const attachment of attachments)for(const mod of list(attachment.modifiers).filter(consumed).filter(matches).sort((a,b)=>number(a.priority)-number(b.priority)))enhancements.push({id:attachment.itemId,kind:'modification',stat:targets[mod.target],op:mod.op||'add',value:number(mod.value)});
    return {unitId:String(unitId),slot:String(slot),itemId:String(item.id),itemType:String(item.type),instanceId:String(copy?.id||''),broken:copy?.broken===true,baseStats,effectiveStats:{...baseStats},aberrations:effects.map(row=>row.effect),attachments,enhancements,statOrder:['armorClass','absorption',...(item.type==='shield'?['shieldBlock']:[]), ...(damage!==''?['damage','damageBonus']:[])]};
  }
  function native(plan) {
    const result=clone(plan),stats={...result.baseStats};
    for(const row of result.enhancements)if(row.stat&&row.applies!==false)stats[row.stat]=row.op==='set'?row.value:stats[row.stat]+row.value;
    if(typeof stats.damage==='number'){stats.damage+=stats.damageBonus;stats.damageBonus=0;}
    if(result.broken){stats.armorClass=0;stats.absorption=0;stats.shieldBlock=0;if(result.itemType!=='armor'){stats.damage=0;stats.damageBonus=0;}}
    result.effectiveStats=stats;result.appliedAberrations=clone(result.aberrations);
    return result;
  }
  const cache = new WeakMap();
  function rows(token){return cache.get(token)||[];}
  function get(token,slot){return rows(token).find(row=>row.slot===String(slot));}
  function set(token,value){if(value?.length)cache.set(token,value);else cache.delete(token);}
  function view(copy,row){
    if(!copy||!row)return copy;
    const result=clone(copy);
    result.aberration252={...(result.aberration252||{}),effects:list(row.appliedAberrations).map(effect=>effect.id)};
    return result;
  }
  window.GRPGEquipmentStatsV311={plan,native,consumed,targets,rows,get,set,view};
})();
