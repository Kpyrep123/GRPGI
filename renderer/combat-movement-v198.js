/* Pure load and turn-movement arithmetic; no random rolls or persistence. */
(function(root){
  'use strict';
  const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  function weight(inventory=[],equippedIds=[],getItem=()=>null){
    const counts=new Map(),worn=new Map();
    for(const row of inventory||[]){const id=String(row?.itemId||'');if(id)counts.set(id,(counts.get(id)||0)+Math.max(0,Math.trunc(num(row.qty))));}
    for(const value of equippedIds||[]){const id=String(value||'');if(id)worn.set(id,(worn.get(id)||0)+1);}
    for(const [id,qty] of worn)counts.set(id,Math.max(qty,counts.get(id)||0));
    let total=0;for(const [id,qty] of counts){const item=getItem(id)||{};if(!item.textOnlyInventory)total+=Math.max(0,num(item.mass))*qty;}
    return total;
  }
  function resolve({speed=0,strength=0,capacity,weight=0,dash=false,spent=0}={}){
    const limit=Math.max(0,num(capacity,5+2*Math.max(0,num(strength)))),load=Math.max(0,num(weight));
    const factor=load<=limit?1:limit>0?Math.max(0,Math.min(1,2-load/limit)):0;
    const currentSpeed=Math.max(0,Math.floor(Math.max(0,num(speed))*factor+1e-9)),budget=currentSpeed*(dash?2:1),used=Math.max(0,num(spent));
    return {weight:load,capacity:limit,factor,speed:currentSpeed,budget,spent:used,remaining:Math.max(0,budget-used),dash:Boolean(dash)};
  }
  const api={weight,resolve};root.GRPGCombatMovementV198=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
