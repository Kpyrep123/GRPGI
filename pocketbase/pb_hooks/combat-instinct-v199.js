/* Self-preservation uses entered tabletop dice, one actual HP-loss packet at a time. */
(function(root){
 'use strict';const n=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
 function qualifies({lost=0,will=0,hp=0,mechanical=false}={}){return !mechanical&&n(hp)>0&&n(lost)>Math.max(0,n(will));}
 function resolve({roll,will=0,penalty=0,lost=0}={}){const die=n(roll);if(!Number.isInteger(die)||die<1||die>20)throw Error('Введите натуральный d20 от 1 до 20');const dc=10+Math.max(0,n(lost)),total=die+n(will)-Math.max(0,n(penalty)),margin=dc-total;return{roll:die,dc,total,margin,kind:die===1||margin>=5?'panic':margin>0?'shaken':''};}
 function effects(value){return (Array.isArray(value)?value:[]).filter(row=>row&&['shaken','panic'].includes(row.kind)).map(row=>({...row,id:String(row.id||''),source:row.source&&typeof row.source==='object'?{...row.source}:{name:'Источник неизвестен'},expires:Math.max(1,Math.trunc(n(row.expires,1)))}));}
 function add(value,kind,source,turn=0,id=''){const rows=effects(value);if(!kind)return rows;const key=String(source?.participantId||source?.key||source?.name||''),old=rows.filter(row=>String(row.source.participantId||row.source.key||row.source.name||'')===key);return [...rows.filter(row=>!old.includes(row)),{id,kind:kind==='panic'||old.some(row=>row.kind==='panic')?'panic':'shaken',source:{...source},expires:Math.max(n(turn)+1,...old.map(row=>row.expires))}];}
 function expire(value,turn=0){return effects(value).filter(row=>row.expires>n(turn));}
 function penalty(value){return effects(value).some(row=>row.kind==='shaken')?1:0;}
 const api={qualifies,resolve,effects,add,expire,penalty};root.GRPGCombatInstinctV199=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
