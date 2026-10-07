(() => {
  'use strict';
  const B=window.GRPGHubBridgeV153;if(!B)return;
  const runtime=window.GRPGHubRuntimeV156.create({
    ...B,root:()=>document.getElementById('screen-hub-v153'),isActive:()=>B.app.ui.screen==='hub-v153',
    marketContext:()=>{const campaignId=B.app.config?.campaignId||'main';return {campaignId,campaign:B.app.data?.campaigns?.get(campaignId)||{}};},
    activate:()=>{B.app.ui.screen='hub-v153';document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('active',x.id==='screen-hub-v153'));document.querySelectorAll('.nav-btn').forEach(x=>x.classList.toggle('active',x.id==='nav-hub-v153'));},
    commit:async(mutator,notice,expectedId)=>{if(B.currentPlayer()?.id!==expectedId)throw new Error('Персонаж изменился');return B.commit(mutator,notice);}
  });
  document.getElementById('nav-hub-v153')?.addEventListener('click',runtime.show);
  const syncNav=()=>document.getElementById('nav-hub-v153')?.classList.toggle('hidden',!window.GRPGHubCoreV156.isHub(B.currentPlanet()));syncNav();setInterval(syncNav,3000);
  window.GRPGHubV153={show:runtime.show,isHub:window.GRPGHubCoreV156.isHub,version:157};
})();
