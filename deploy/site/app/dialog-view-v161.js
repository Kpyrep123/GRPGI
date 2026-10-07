/* Shared full-screen presentation. The adapter owns state and persistence. */
(() => {
  'use strict';
  const C=window.GRPGHubCoreV156,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function open(B){
    window.GRPGDialogViewV161.active?.leave();
    const previous=document.activeElement,root=document.createElement('section');
    root.className='hub-modal-v153 hub-conversation-v161';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',B.preview?'Dialogue preview':'Conversation');root.tabIndex=-1;
    root.innerHTML='<header class="conversation-header-v161"><div><small data-dialog-kind></small><h2 data-dialog-title></h2></div><button type="button" class="secondary" data-leave>Leave</button></header><div data-conversation-content></div><p class="conversation-status-v161" data-status role="status" aria-live="polite"></p>';
    document.body.append(root);let closed=false,pending=false;
    const priorOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    function leave(){if(closed)return;closed=true;if(window.GRPGDialogViewV161.active?.root===root)window.GRPGDialogViewV161.active=null;root.remove();document.body.style.overflow=priorOverflow;B.onLeave?.();if(previous?.isConnected)previous.focus();}
    root.querySelector('[data-leave]').onclick=leave;
    root.addEventListener('keydown',e=>{
      e.stopPropagation();if(e.key==='Escape'){e.preventDefault();leave();}
      if(e.key==='Tab'){const buttons=[...root.querySelectorAll('button:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===root)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    });
    function draw(error=''){
      if(closed)return;let snapshot;try{snapshot=B.snapshot();}catch(e){error=e.message;}
      const {dialog:d,node:n,object:o,player:p,state:s,why:blocked}=snapshot||{},host=root.querySelector('[data-conversation-content]');
      root.querySelector('[data-dialog-kind]').textContent=B.preview?'PREVIEW · NO PROFILE WRITES':'CONVERSATION';root.querySelector('[data-dialog-title]').textContent=d?.name||'Conversation';root.querySelector('[data-status]').textContent=error;
      const why=blocked||(!d||!n||!o?'Conversation is unavailable':C.dialogReason(d,p,s,o)||C.nodeReason(d,n,p,s,o));
      if(why){host.innerHTML=`<div class="conversation-unavailable-v161">${esc(why)}</div>`;return;}
      const actor=B.npc?.(n.speakerNpcId||o.npcId),name=n.speaker||actor?.name||actor?.displayName||o.name||'Speaker',portrait=n.portrait||actor?.image||o.image;
      const choices=(n.choices||[]).map(c=>({c,why:C.choiceReason(d,n,c,p,s,o)})),shown=choices.filter(x=>!x.why||x.c.unavailable!=='hide'),available=choices.some(x=>!x.why);
      host.innerHTML=`<div class="conversation-scene-v161"><div class="conversation-portrait-v161" data-speaker-portrait>${portrait?`<img src="${esc(portrait)}" alt="${esc(name)}">`:`<span aria-hidden="true">${esc(name.slice(0,1))}</span>`}<small>${esc(name)}</small></div><main class="conversation-text-v161"><div class="conversation-line-v161"><h3>${esc(name)}</h3><p>${esc(n.text||'')}</p></div><div class="conversation-replies-v161">${choices.length?shown.map(({c,why},index)=>`<button type="button" data-choice="${esc(c.id)}" ${why?'disabled data-blocked="1"':''}><span>${index+1}</span><div>${esc(c.text||'Continue')}${why&&c.blockedText?`<small>${esc(c.blockedText)}</small>`:''}</div></button>`).join(''):n.terminal===false?'<p>No replies have been configured.</p>':'<button type="button" class="primary" data-finish>Finish dialogue</button>'}${choices.length&&!available?'<p class="conversation-blocked-v161">No replies are available. You can leave and return later.</p>':''}</div></main></div>`;
      const choose=async id=>{
        if(pending||closed)return;pending=true;root.querySelector('[data-status]').textContent='';root.querySelectorAll('[data-choice],[data-finish]').forEach(b=>b.disabled=true);
        try{const result=await B.choose(id,n.id);if(closed)return;if(result?.nextNodeId){draw();root.querySelector('[data-choice]:not(:disabled),[data-finish]')?.focus();}else{leave();}if(result?.articleId)B.openArticle?.(result.articleId);}
        catch(e){if(!closed)draw(e.message);}
        finally{pending=false;}
      };
      host.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>choose(b.dataset.choice));host.querySelector('[data-finish]')?.addEventListener('click',()=>choose(null));
    }
    draw();root.querySelector('[data-leave]').focus();const view={root,leave,refresh:draw};window.GRPGDialogViewV161.active=view;return view;
  }
  window.GRPGDialogViewV161={open,active:null};
})();
