/* Shared turn-owner vision selection for the editor and player display. */
(function(root){
  'use strict';
  function sources(scene,runtime){
    const tokens=Array.isArray(runtime?.tokens)?runtime.tokens:[];
    const devices=token=>(token.equipmentType||token.type)==='drone';
    const eligible=token=>!token.hidden&&token.visibleToPlayers!==false;
    if(scene.mode!=='combat')return tokens.filter(token=>eligible(token)&&(token.playerId||token.sharesVisionWithPlayers)&&(!devices(token)||token.droneShareVision225));
    const currentId=runtime.initiativeOrder?.[Math.max(0,Number(runtime.turnIndex)||0)];
    const owner=tokens.find(token=>token.id===currentId);
    if(!owner?.playerId)return [];
    return tokens.filter(token=>eligible(token)&&(token.id===owner.id||(token.operatorTokenIdV129===owner.id&&token.droneShareVision225)));
  }
  const api={sources};
  root.GRPGCombatVisionV225=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
