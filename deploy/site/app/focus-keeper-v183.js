/* Restore editing state synchronously when a render replaces the same view. */
(function(root){
  'use strict';
  const controls='input:not([type="file"]):not([type="hidden"]),textarea,select,[contenteditable="true"]';
  const composing=new WeakSet();let depth=0,lastScope;
  const esc=value=>CSS.escape(String(value));
  function selector(node){
    const parts=[];
    for(let el=node;el&&el!==document.documentElement;el=el.parentElement){
      if(el.id){parts.unshift('#'+esc(el.id));break;}
      let part=el.localName;
      if(el.hasAttribute('name'))part+='[name="'+esc(el.getAttribute('name'))+'"]';
      else if(el.matches(controls)){
        for(const attr of el.attributes)if(attr.name.startsWith('data-')&&!/bound|enhanced|initialized/.test(attr.name))part+='['+attr.name+'="'+esc(attr.value)+'"]';
      }
      if(el.matches('input[type="radio"],input[type="checkbox"]'))part+='[value="'+esc(el.value)+'"]';
      if(el.parentElement&&[...el.parentElement.children].filter(n=>n.matches(part)).length>1){
        part+=':nth-of-type('+([...el.parentElement.children].filter(n=>n.localName===el.localName).indexOf(el)+1)+')';
      }
      parts.unshift(part);
    }
    return parts.join(' > ');
  }
  const find=key=>{try{return document.querySelector(key);}catch{return null;}};
  function read(node){
    return {key:selector(node),tag:node.localName,type:node.type,value:node.value,checked:node.checked,selected:node.localName==='select'?[...node.selectedOptions].map(o=>o.value):null,html:node.isContentEditable?node.innerHTML:null};
  }
  function write(node,state){
    if(node.localName!==state.tag||node.type!==state.type)return;
    if(state.html!==null){node.innerHTML=state.html;return;}
    if(state.selected){if(!node.multiple&&!state.selected.some(v=>[...node.options].some(o=>o.value===v)))return;for(const option of node.options)option.selected=state.selected.includes(option.value);return;}
    if(node.type==='checkbox'||node.type==='radio'){node.checked=state.checked;return;}
    if(!['button','submit','reset'].includes(node.type))node.value=state.value;
  }
  function textSelection(node){
    const selection=root.getSelection();if(!selection?.rangeCount)return null;
    const range=selection.getRangeAt(0);if(!node.contains(range.startContainer)||!node.contains(range.endContainer))return null;
    const prefix=range.cloneRange();prefix.selectNodeContents(node);prefix.setEnd(range.startContainer,range.startOffset);const start=prefix.toString().length;
    return {start,end:start+range.toString().length};
  }
  function restoreTextSelection(node,state){
    if(!state)return;
    const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT),points=[];let text,total=0;
    while((text=walker.nextNode())){points.push({node:text,start:total,end:total+text.length});total+=text.length;}
    if(!points.length)return;
    const at=offset=>{offset=Math.min(total,offset);const p=points.find(p=>offset<=p.end)||points.at(-1);return [p.node,Math.max(0,offset-p.start)];};
    const range=document.createRange();range.setStart(...at(state.start));range.setEnd(...at(state.end));const selection=root.getSelection();selection.removeAllRanges();selection.addRange(range);
  }
  function capture(){
    const active=document.activeElement;if(!active?.matches?.(controls))return null;
    const owner=active.closest('form,.stock-orders-v148,.stock-dm-v149')||active;
    const fields=(owner===active?[active]:[...owner.querySelectorAll(controls)]).map(read);
    const scroll=[];for(let node=active;node;node=node.parentElement)if(node.scrollTop||node.scrollLeft)scroll.push({key:selector(node),top:node.scrollTop,left:node.scrollLeft});
    return {active,key:selector(active),fields,start:active.selectionStart,end:active.selectionEnd,direction:active.selectionDirection,range:active.isContentEditable?textSelection(active):null,scroll};
  }
  function restore(state){
    if(!state||state.active.isConnected)return;
    // Respect deliberate focus changes made by the renderer or a modal.
    const chosen=document.activeElement;if(chosen&&chosen!==document.body&&chosen!==document.documentElement)return;
    const next=find(state.key);if(!next||next.disabled)return;
    for(const field of state.fields){const node=find(field.key);if(node)write(node,field);}
    document.dispatchEvent(new CustomEvent('grpg-edit-restored-v183'));
    next.focus({preventScroll:true});
    if(state.start!=null)try{next.setSelectionRange(state.start,state.end,state.direction);}catch{}
    restoreTextSelection(next,state.range);
    for(const value of state.scroll){const node=find(value.key);if(node){node.scrollTop=value.top;node.scrollLeft=value.left;}}
  }
  document.addEventListener('compositionstart',e=>composing.add(e.target),true);
  document.addEventListener('compositionend',e=>composing.delete(e.target),true);
  root.GRPGFocusKeeperV183=Object.freeze({
    isComposing:()=>composing.has(document.activeElement),
    run(render,scope=()=>null){
      if(depth)return render();
      const before=scope(),state=lastScope===undefined||before===lastScope?capture():null;depth++;
      try{return render();}finally{depth--;const after=scope();lastScope=after;if(before===after)restore(state);}
    }
  });
})(window);
