(function(root){
'use strict';
function hydrate(scope=document){
 for(const audio of scope.querySelectorAll?.('audio[data-grpg-audio-v315]')||[]){
  if(audio.dataset.ready315)continue;audio.dataset.ready315='1';audio.preload='metadata';audio.autoplay=false;
  const box=document.createElement('section');box.className='rich-audio-v315';
  const label=document.createElement('strong');label.textContent=audio.getAttribute('data-title')||'Аудиозапись';
  const play=document.createElement('button');play.type='button';play.textContent='▶';play.setAttribute('aria-label','Воспроизвести');
  const seek=document.createElement('input');seek.type='range';seek.min='0';seek.max='100';seek.value='0';seek.step='.1';seek.setAttribute('aria-label','Перемотка');
  const time=document.createElement('output');time.textContent='0:00 / 0:00';
  const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='1';volume.step='.01';volume.value=String(audio.volume);volume.setAttribute('aria-label','Громкость');
  const volumeLabel=document.createElement('label');volumeLabel.textContent='Громкость';volumeLabel.append(volume);
  audio.before(box);box.append(label,audio,play,seek,time,volumeLabel);audio.controls=false;
  const stamp=n=>Number.isFinite(n)?Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0'):'0:00';
  const update=()=>{const duration=audio.duration;seek.disabled=!Number.isFinite(duration)||duration<=0;if(!seek.disabled)seek.value=String(100*audio.currentTime/duration);time.textContent=stamp(audio.currentTime)+' / '+stamp(duration);play.textContent=audio.paused?'▶':'Ⅱ';play.setAttribute('aria-label',audio.paused?'Воспроизвести':'Пауза');};
  play.onclick=async()=>{try{if(audio.paused)await audio.play();else audio.pause();}catch{time.textContent='Аудиофайл недоступен';}};
  seek.oninput=()=>{if(Number.isFinite(audio.duration))audio.currentTime=audio.duration*Number(seek.value)/100;};
  volume.oninput=()=>{audio.volume=Number(volume.value);};
  ['timeupdate','loadedmetadata','durationchange','play','pause','ended'].forEach(name=>audio.addEventListener(name,update));
  audio.addEventListener('error',()=>{time.textContent='Аудиофайл недоступен';play.disabled=true;});update();
 }
}
function chooseImageSize(initial=640){return new Promise(resolve=>{
 const box=document.createElement('dialog');box.className='rich-size-dialog-v315';box.innerHTML='<form><h3>Размер изображения</h3><label>Ширина, пиксели<input name="width" type="number" min="32" max="4096" required></label><p>Высота изменяется пропорционально. Изображение не выйдет за границы текста.</p><button type="submit">Применить</button><button type="button" data-auto>По ширине текста</button><button type="button" data-cancel>Отмена</button></form>';
 box.querySelector('input').value=String(initial);document.body.append(box);
 const done=value=>{box.close();box.remove();resolve(value);};
 box.querySelector('form').onsubmit=e=>{e.preventDefault();if(box.querySelector('form').reportValidity())done(Number(box.querySelector('input').value));};
 box.querySelector('[data-auto]').onclick=()=>done(0);box.querySelector('[data-cancel]').onclick=()=>done(null);box.addEventListener('cancel',e=>{e.preventDefault();done(null);});box.showModal();
 });}
root.GRPGRichMediaV315={hydrate,chooseImageSize};
if(typeof document!=='undefined'){
 const observer=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n.nodeType===1){if(n.matches('audio[data-grpg-audio-v315]'))hydrate(n.parentNode);else hydrate(n);}});
 observer.observe(document.documentElement,{childList:true,subtree:true});hydrate();
}
})(window);
