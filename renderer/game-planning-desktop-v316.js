(function(){
'use strict';if(window.GRPGGamePlanningDesktopV316)return;
const client=window.GRPGGamePlanningV316.create({
 root:()=>UI.activeModuleId==='tasks'?document.getElementById('tasks-content'):null,
 identity:()=>App.currentUser&&playerSessionV212?JSON.stringify([Sync.config?.url,Sync.config?.campaignId,App.activeCampaignId,App.currentUser.id]):'',
 campaign:()=>String(App.activeCampaignId||Sync.config?.campaignId||'main'),
 players:()=>Object.values(App.state.users||{}).map(p=>({id:p.id,name:p.displayName||p.name||p.id})),
 call:async(route,data,query)=>{const result=await window.electronAPI.playerAuthV212({action:'planning-v316/'+route,data,query:{...query,logicalCampaign:String(App.activeCampaignId||Sync.config?.campaignId||'main')},token:playerSessionV212});if(!result?.ok){const error=Error(result?.message||'Не удалось получить игровые встречи');error.code=result?.code;throw error;}return result;},
 openTask:id=>{const t=TASKS[id];if(t)openTaskReader(t.id);},
 showTasks:()=>UI.openModule('tasks')
});
window.GRPGGamePlanningDesktopV316=client;
const render=UI.renderTasks;UI.renderTasks=function(...args){const host=document.querySelector('#tasks-content>.game-planning-v316');host?.remove();const result=render.apply(this,args);if(host)document.getElementById('tasks-content')?.prepend(host);client.mount();return result;};
const editor=Configurator.renderTaskEditor;Configurator.renderTaskEditor=function(task){return editor.call(this,task).replace('</form>',`<fieldset><legend>Даты игры и запись</legend><p class="small-note">Сначала сохраните изменения задания. Даты и состав встречи сохраняются отдельно от World Config.</p><button type="button" class="secondary" data-planning-open-v316="${String(task.id).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}">Настроить встречи</button></fieldset></form>`);};
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-planning-open-v316]');if(button)client.openTask(button.dataset.planningOpenV316);});
})();
