import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const {Window}=await import(process.env.HAPPY_DOM_MODULE?pathToFileURL(process.env.HAPPY_DOM_MODULE):'happy-dom');
const root=path.resolve(process.argv[2]||'.');
const web=path.join(root,'deploy/site/app');
const window=new Window({url:'https://example.test',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
const context=vm.isContext(window)?window:vm.createContext(window);
window.document.write(fs.readFileSync(path.join(web,'index.html'),'utf8').replace(/<script\b[^>]*>\s*<\/script>/gi,''));
window.setInterval=()=>0;window.requestAnimationFrame=()=>0;
const seen=[];
window.fetch=async (url,options={})=>{
  seen.push({url:String(url),options});
  return {ok:true,status:200,text:async()=>JSON.stringify({items:[]})};
};
try{
  for(const file of ['rich-text-scope.js','market-engine.js','player-sync-core.js','item-facts-v141.js']){
    vm.runInContext(fs.readFileSync(path.join(web,file),'utf8'),context);
  }
  let source=fs.readFileSync(path.join(web,'app.js'),'utf8');
  const marker='  init().catch(error => {';
  assert.equal(source.split(marker).length,2);
  source=source.replace(marker,'window.testAnonymous={pbFetch,hasConfig,normalizeConfig};\nif(false) init().catch(error => {');
  vm.runInContext(source,context);
  const config=window.testAnonymous.normalizeConfig({url:'https://sync.test',campaignId:'main',appUserEmail:'unused',appUserPassword:'unused'});
  assert.ok(window.testAnonymous.hasConfig(config));
  assert.equal(config.appUserEmail,undefined);
  assert.equal(config.appUserPassword,undefined);
  await window.testAnonymous.pbFetch(config,'/api/collections/campaign_players/records');
  assert.equal(seen.length,1);
  assert.ok(!Object.keys(seen[0].options.headers).some(key=>key.toLowerCase()==='authorization'));
  console.log('PASS anonymous web config and PocketBase request');
}finally{await window.happyDOM.abort();}
