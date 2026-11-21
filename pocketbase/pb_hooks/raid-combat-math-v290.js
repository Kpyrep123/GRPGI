'use strict';
module.exports=function(deps){
const window={GRPGStatsV113:deps.stats,GRPGItemInstancesV215:deps.instances,GRPGDamageTypesV202:deps.types,GRPGAberrationWeapons:{effects:deps.effects}};
const num=(x,f=0)=>Number.isFinite(Number(x))?Number(x):f,list=x=>Array.isArray(x)?x:[],clone=x=>JSON.parse(JSON.stringify(x)),clamp104=(x,a,b)=>Math.max(a,Math.min(b,num(x)));
const equipmentItem105=deps.item,entityForToken=u=>u.profile,timedStatModifiers122=u=>u.modifiers||[],tokenDefense105=u=>deps.stats.compute(u.profile).values.armorClass;
const itemRuntimeStateV138=(u,item,slot)=>deps.instances.instance(u.profile,item.id,-1,slot);
const itemBrokenV138=(u,item,slot)=>item?!!itemRuntimeStateV138(u,item,slot)?.broken:false;
  function itemIsPhysicalArmor119(item={}) {
    if(item.physicalArmor===true)return true;
    return list(item.tags).some(tag=>['физическая броня','physical armor'].includes(String(tag||'').trim().toLowerCase()));
  }
  function itemIsHeavyArmor122(item={}){const text=[item.armorWeightClass,item.armorClassType,...list(item.tags),item.name].map(value=>String(value||'').toLowerCase()).join(' ');return item.heavyArmor===true||/heavy|тяж[её]л/.test(text);}
  function itemIsPhysicalShield122(item={}){const text=[item.name,...list(item.tags)].map(value=>String(value||'').toLowerCase()).join(' ');return String(item.type||'').toLowerCase()==='shield'||/shield|щит/.test(text)||num(item.shieldCoverBonus??item.coverBonus,0)>0;}
  function shieldBonus122(item={}){if(!itemIsPhysicalShield122(item))return 0;const modifier=list(item.modifiers).filter(row=>row?.enabled!==false&&String(row?.target)==='armor_class'&&String(row?.op||'add')==='add'&&['','always'].includes(String(row?.condition||'always'))&&['','global'].includes(String(row?.scope||'global'))).reduce((sum,row)=>sum+num(row?.value),0),explicit=num(item.shieldCoverBonus??item.coverBonus,0);return Math.max(0,explicit,modifier);}
  function incomingDefense119(token,weaponCategory='light',cover=null,damageType=weaponCategory) {
    const category=String(weaponCategory||'light').trim().toLowerCase(),entity=entityForToken(token);
    const resolvedType=window.GRPGDamageTypesV202.normalize(damageType,'kinetic');
    let typedArmorDelta=0,typedArmorImmune=false,wornArmorAbsorption=0,gasProtectionFlat=0,gasProtectionPercent=0,energyProtectionPercent=0;
    let baseArmorClass=num(tokenDefense105(token),0),shieldArmorClass=0,coverArmorClass=Math.max(0,num(cover?.armorBonus,0));
    let baseAbsorption=token?.defenseOverrideV120?Math.max(0,num(token?.defense,0)):0,armorAbsorption=0,shieldAbsorption=0,coverAbsorption=Math.max(0,num(cover?.hardness,0));
    if(entity&&window.GRPGStatsV113?.compute){
      const source=clone(entity);source.equipmentSlots={...(source.equipmentSlots||source.loadout||{})};
      for(const [slot,id] of Object.entries(source.equipmentSlots)){const item=equipmentItem105(id);if(item&&item.type!=='armor'&&itemBrokenV138(token,item,slot))source.equipmentSlots[slot]='';}
      // Keep slot indexes stable: runtime durability belongs to the equipped instance.
      const implants=list(source.implantSlots?.length?source.implantSlots:source.installedImplantIds).map((id,index)=>itemBrokenV138(token,equipmentItem105(id),`implant:${index}`)?'':id);
      source.implantSlots=implants;source.installedImplantIds=implants.slice();
      const wornArmor=equipmentItem105(source.equipmentSlots.armor),wornShields=['primaryWeapon','secondaryWeapon'].map(slot=>({slot,item:equipmentItem105(source.equipmentSlots[slot])})).filter(row=>itemIsPhysicalShield122(row.item||{}));
      if(wornArmor&&!itemBrokenV138(token,wornArmor,'armor')){
        const copy=window.GRPGItemInstancesV215.instance(entity,wornArmor.id,-1,'armor');
        const ids=list(copy?.aberration252?.effects);
        if(ids.some(id=>/^armor-(?:20|27)-/.test(id))){
          for(const effect of window.GRPGAberrationWeapons?.effects(ids)||[]){
            if(effect.type!==resolvedType)continue;
            if(effect.group==='armor-20')typedArmorDelta=effect.value;
            if(effect.group==='armor-27')typedArmorImmune=true;
          }
        }
      }
      if(resolvedType==='energy')for(const {slot} of wornShields)source.equipmentSlots[slot]='';
      try{
        const slots=source.equipmentSlots,shields=wornShields.filter(row=>slots[row.slot]),withoutShield=clone(source);
        for(const {slot} of shields)withoutShield.equipmentSlots[slot]='';
        const withoutArmor=clone(withoutShield);withoutArmor.equipmentSlots.armor='';withoutArmor.implantSlots=list(withoutArmor.implantSlots).map(id=>itemIsPhysicalArmor119(equipmentItem105(id)||{})?'':id);withoutArmor.installedImplantIds=withoutArmor.implantSlots.slice();
        const computeOptions={kind:token?.npcId?'npc':'player',inCombat:true,incomingWeaponCategory:category,incomingDamageType:window.GRPGDamageTypesV202.normalize(damageType),temporaryModifiers:timedStatModifiers122(token)},computedBase=window.GRPGStatsV113.compute(withoutArmor,computeOptions),computed=window.GRPGStatsV113.compute(withoutShield,computeOptions);
        if(resolvedType==='energy')energyProtectionPercent=clamp104(num(computed?.values?.energyProtectionPercent),0,100);
        if(resolvedType==='gas'){
          gasProtectionFlat=Math.max(0,num(computed?.values?.gasProtectionFlat));
          gasProtectionPercent=clamp104(num(computed?.values?.gasProtectionPercent),0,100);
        }
        if(!token?.armorClassOverrideV120)baseArmorClass=num(computed?.values?.armorClass,baseArmorClass);
        if(!token?.defenseOverrideV120){baseAbsorption=Math.max(0,num(computedBase?.values?.defense,0));armorAbsorption=Math.max(0,num(computed?.values?.defense,0)-baseAbsorption);}
        if(resolvedType==='explosive'&&wornArmor&&armorAbsorption>0){
          const withoutWornArmor=clone(withoutShield);withoutWornArmor.equipmentSlots.armor='';
          wornArmorAbsorption=clamp104(num(computed?.values?.defense)-num(window.GRPGStatsV113.compute(withoutWornArmor,computeOptions)?.values?.defense),0,armorAbsorption);
        }
        // A shield in either hand participates. Multiple shields do not sum their bonuses.
        const choices=shields.map(({slot,item})=>{const equipped=clone(withoutShield);equipped.equipmentSlots[slot]=slots[slot];const value=window.GRPGStatsV113.compute(equipped,computeOptions);return{bonus:Math.max(0,shieldBonus122(item),num(value?.values?.armorClass)-num(computed?.values?.armorClass)),absorption:Math.max(0,num(value?.values?.defense)-num(computed?.values?.defense))};}).sort((a,b)=>b.bonus-a.bonus||b.absorption-a.absorption);
        shieldArmorClass=choices[0]?.bonus||0;if(!token?.defenseOverrideV120)shieldAbsorption=choices[0]?.absorption||0;
        if(!token?.armorClassOverrideV120){
          const dexContribution=num(list(computed?.breakdown?.armorClass).find(row=>row.op==='base'&&row.statRef==='dexterity')?.value),heavy=!itemBrokenV138(token,wornArmor,'armor')&&itemIsHeavyArmor122(wornArmor||{})&&wornArmor?.armorAllowsDexterity!==true;
          const caps=wornShields.map(({item})=>item.shieldDexterityCap).filter(value=>value!=null&&String(value).trim()!==''&&Number.isFinite(Number(value)));
          if(heavy)baseArmorClass-=dexContribution;
          else if(caps.length)baseArmorClass-=Math.max(0,dexContribution-Math.max(0,Math.min(...caps.map(Number))));
        }
      }catch(error){console.warn('SCENE_INCOMING_DEFENSE_V119',error);}
    }
    if(resolvedType==='energy'){baseAbsorption=0;armorAbsorption=0;}
    if(resolvedType==='electric')armorAbsorption=Math.floor(armorAbsorption/2);
    const defenseBonus=baseArmorClass+Math.max(shieldArmorClass,coverArmorClass),damageReduction=baseAbsorption+armorAbsorption+shieldAbsorption+coverAbsorption;
    return {defenseBonus,damageReduction,category,damageType:resolvedType,typedArmorDelta,typedArmorImmune,wornArmorAbsorption,gasProtectionFlat,gasProtectionPercent,energyProtectionPercent,coverBonus:coverArmorClass,baseArmorClass,shieldArmorClass,coverArmorClass,baseAbsorption,armorAbsorption,shieldAbsorption,coverAbsorption,absorptionSources:{base:baseAbsorption,armor:armorAbsorption,shield:shieldAbsorption,cover:coverAbsorption}};
  }
  function absorptionSourceV138(value='all'){const source=String(value||'all').toLowerCase();return['none','all','base','armor','shield','cover'].includes(source)?source:'all';}
  function absorptionAmountV138(defense={},source='all'){
    source=absorptionSourceV138(source);if(source==='none')return 0;if(source==='all')return Math.max(0,num(defense.damageReduction,0));return Math.max(0,num(defense[`${source}Absorption`],0));
  }
  function applyAbsorptionV138(state={},defense={},typedDefense=null){
    const total=Math.max(0,num(state.damage,0)),parts=list(state.damagePartsV138).length?list(state.damagePartsV138):[{amount:total,absorptionSource:'all'}];
    const partsTotal=parts.reduce((sum,row)=>sum+Math.max(0,num(row?.amount,0)),0);if(Math.abs(partsTotal-total)>.001){parts.length=0;parts.push({amount:total,absorptionSource:'all'});}
    const portions=new Map();
    let absorbed=0,explosiveArmorBlocked=0,explosiveHit=defense.damageType==='explosive';
    for(const part of parts){
      const raw=Math.max(0,num(part.amount,0));
      if(!raw)continue;
      let currentDefense=part.damageType258&&typedDefense?typedDefense(part.damageType258):defense;
      if(part===parts[0]&&!part.damageType258&&num(state.weaponPenetration287)>0){
        const ignored=Math.min(num(state.weaponPenetration287),Math.max(0,num(currentDefense.armorAbsorption)));
        currentDefense={...currentDefense,damageReduction:Math.max(0,currentDefense.damageReduction-ignored),armorAbsorption:Math.max(0,currentDefense.armorAbsorption-ignored),wornArmorAbsorption:Math.max(0,currentDefense.wornArmorAbsorption-ignored)};
      }
      const type=currentDefense.damageType||part.damageType258||'kinetic';
      if(type==='explosive')explosiveHit=true;
      const portion=portions.get(type)||{damage:0,delta:num(currentDefense.typedArmorDelta),immune:currentDefense.typedArmorImmune};
      portions.set(type,portion);
      if(currentDefense.typedArmorImmune){absorbed+=raw;continue;}
      const source=absorptionSourceV138(part.absorptionSource);
      const rule=state.absorptionRulesV138?.[source]||state.absorptionRulesV138?.all||{};
      const base=absorptionAmountV138(currentDefense,source);
      const penetration=Math.max(0,num(part.penetration)>0?num(part.penetration):num(rule.penetration));
      const flat=Math.max(0,num(part.ignoreAbsorption)>0?num(part.ignoreAbsorption):num(rule.flat));
      const percent=clamp104(num(part.ignorePercent)>0?num(part.ignorePercent):num(rule.percent),0,100);
      if(type==='gas'){
        const gasOnly=source==='all'||source==='base';
        const factor=1-percent/100;
        const gasFlat=gasOnly?Math.max(0,num(currentDefense.gasProtectionFlat)-penetration-flat)*factor:0;
        const gasPercent=gasOnly?clamp104(num(currentDefense.gasProtectionPercent),0,100)*factor:0;
        const remaining=Math.max(0,raw-gasFlat);
        const blocked=remaining*gasPercent/100;
        const afterGas=remaining-Math.floor(blocked+Math.min(1e-9,Number.EPSILON*Math.max(1,blocked)*8));
        absorbed+=raw-afterGas;
        portion.damage+=afterGas;
        continue;
      }
      const effective=Math.max(0,base-penetration-flat)*(1-percent/100);
      let taken=Math.min(raw,Math.max(0,Math.round(effective)));
      if(type==='energy'&&(source==='all'||source==='base')){
        const protection=clamp104(num(currentDefense.energyProtectionPercent),0,100)*(1-percent/100);
        taken+=Math.floor((raw-taken)*protection/100);
      }
      absorbed+=taken;
      if(type==='explosive'&&(source==='all'||source==='armor')&&currentDefense.wornArmorAbsorption>0){
        const withoutArmor=Math.max(0,base-currentDefense.wornArmorAbsorption-penetration-flat)*(1-percent/100);
        explosiveArmorBlocked+=Math.max(0,taken-Math.min(raw,Math.round(withoutArmor)));
      }
      portion.damage+=raw-taken;
    }
    let applied=0;
    for(const portion of portions.values()){
      if(portion.immune)continue;
      const remaining=Math.max(0,portion.damage+portion.delta);
      if(portion.delta<0)absorbed+=portion.damage-remaining;
      applied+=remaining;
    }
    return{raw:total,absorbed:Math.min(total,absorbed),applied:Math.max(0,Math.round(applied)),explosiveArmorBlocked,explosiveHit};
  }

return {defense:incomingDefense119,absorb:applyAbsorptionV138};
};
