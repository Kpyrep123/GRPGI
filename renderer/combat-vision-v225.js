/* Shared party vision selection for the editor and player display. */
(function(root){
  'use strict';
  function sources(scene,runtime){
    const tokens=Array.isArray(runtime?.tokens)?runtime.tokens:[];
    const devices=token=>(token.equipmentType||token.type)==='drone';
    const eligible=token=>!token.hidden&&token.visibleToPlayers!==false;
    return tokens.filter(token=>eligible(token)&&(token.playerId||token.sharesVisionWithPlayers)&&(!devices(token)||token.droneShareVision225));
  }
  const api={sources};
  root.GRPGCombatVisionV225=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
