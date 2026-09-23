
    // Execute shipped web code with real DOM; replace only bootstrap, rendering and transport.
    import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
    import assert from 'node:assert/strict';import {pathToFileURL,fileURLToPath} from 'node:url';
    const {Window}=await import(process.env.HAPPY_DOM_MODULE?pathToFileURL(process.env.HAPPY_DOM_MODULE):'happy-dom');
    const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
    const clone=x=>JSON.parse(JSON.stringify(x)),pause=ms=>new Promise(r=>setTimeout(r,ms));
    const w=new Window({url:'https://grpgi.test',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
    const context=vm.isContext(w)?w:vm.createContext(w),run=code=>vm.runInContext(code,context);
    w.setInterval=()=>0;w.requestAnimationFrame=()=>0;w.confirm=()=>true;
    w.fetch=async()=>{throw new Error('Unexpected live network access')};
    const html=fs.readFileSync(path.join(root,'deploy/site/app/index.html'),'utf8');
    w.document.write(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
    for(const file of ['rich-text-scope.js','market-engine.js','player-sync-core.js'])run(fs.readFileSync(path.join(root,'deploy/site/app',file),'utf8'));
    let source=fs.readFileSync(path.join(root,'deploy/site/app/app.js'),'utf8');
    const marker='  init().catch(error => {';assert.equal(source.split(marker).length,2);
    source=source.replace(marker,[
     'window.testApiV135={renderEntityBody,archiveEquipmentFactsWebV131,App,compileData,normalizePlayerRow,applyRealtimeRecord,currentPlayer,normalizeConfig,mutate:commitPlayerMutation,upgradeSkill,upgradeAbility,trade:transactMarketWebV1071,setTransport(fn){pbFetch=fn;}};',
     'renderCurrentScreen=()=>{};renderMarket=()=>{};renderAffectedScreens=()=>{};renderOptimisticPlayerWeb120=()=>{};',
     'saveCache=async()=>{};notify=(message,type)=>window.notices.push({message,type});',
     'if(false) init().catch(error => {'].join('\n'));
    w.notices=[];run(source);const api=w.testApiV135,App=api.App,core=w.GRPGPlayerSyncCoreV135;

for(const [type,mods,expected] of [
 ['armor',[{target:'armor_class',op:'add',value:3},{target:'defense',op:'add',value:-1}],['+3','-1']],
 ['weapon',[{target:'attack_bonus',op:'add',value:2.5},{target:'damage_bonus',op:'set',value:0}],['+2.5','установить 0']],
 ['gear',[{target:'carry_capacity',op:'replace_stat',statRef:'strength',value:0},{target:'movement',op:'add_stat',statRef:'dexterity',value:0,condition:'has_skill',conditionValue:'<skill>'}],['использовать','Сила','добавить','Ловкость','при наличии навыка','&lt;skill&gt;']]
]){
 const output=api.renderEntityBody({_type:'item',id:'test',name:'Test',type,modifiers:mods});
 for(const value of expected)assert.ok(output.includes(value),value+' in '+output);
 if(type==='weapon')assert.ok(!output.includes('Базовое попадание:</b> +0'));
 if(type==='armor'){assert.ok(!output.includes('Класс брони:</b> 0'));assert.ok(!output.includes('Защита:</b> 0'));}
}
const output=api.renderEntityBody({_type:'item',id:'hidden',type:'armor',modifiers:[{target:'armor_class',value:999,enabled:false}]});assert.ok(!output.includes('999'));
console.log('PASS web archive renders signed/decimal modifiers, set zero, stat references and conditions; hides disabled modifiers');
await w.happyDOM.abort();
