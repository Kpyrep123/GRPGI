(function(){
 'use strict';const S=window.GRPGUnitSizeV184;
 const supports=(type,entity)=>['players','npcs','fauna'].includes(type)||(type==='equipment'&&['drone','turret'].includes(entity.type));
 const render=Configurator.renderEditor.bind(Configurator);
 Configurator.renderEditor=function(entity){let html=render(entity);if(!supports(this.selectedType,entity))return html;const size=S.normalize(entity.unitSize),field=`<div class="field unit-size-field-v184"><label>Размер</label><select class="select" name="unitSize">${Object.keys(S.labels).map(key=>`<option value="${key}" ${key===size?'selected':''}>${S.labels[key]} · ${S.info(key).count} гекс.</option>`).join('')}</select><div class="small-note">Размер и занимаемые гексы берутся боевыми сценами из World Config.</div></div>`;return html.replace(/(<form\b[^>]*>)/,`$1${field}`);};
 const collect=Configurator.collectEntity.bind(Configurator);
 Configurator.collectEntity=function(type,form,data=new FormData(form)){const entity=collect(type,form,data);if(entity&&supports(type,entity))entity.unitSize=S.normalize(data.get('unitSize'));return entity;};
})();
