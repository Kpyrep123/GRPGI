const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../renderer/news-core-v159.js');
assert.equal(C.loreDate('2026-10-06T19:36:46.123Z'),'3616-10-06T19:36:46.123Z');assert.equal(C.loreDate('2024-02-29'),'3616-02-29');
const p=C.post({id:'one',body:'<script>unsafe</script>',images:['https://images.test/a.png'],campaignId:'c',publishedAt:'3160-01-01',createdAt:'2026-01-01'}),owner={id:'hero',displayName:'Hero'};
assert.equal(p.publishedAt,'3616-01-01');
C.put(owner,p);C.put(owner,p);assert.equal(Object.keys(owner.newsPosts).length,1);
const world=[{id:'legacy',title:'Legacy',body:'<p>old</p>',publishedAt:'3159-01-01'},{id:'secret',secret:true}];
let rows=C.feed(world,[owner,{id:'other',newsPosts:{no:{...p,campaignId:'other'}}}],'c',x=>!x.secret);assert.equal(rows.length,2);assert.equal(rows[0].ownerId,'hero');assert.equal(rows[1].body,'<p>old</p>');
owner.newsPosts.one.authorType='npc';owner.newsPosts.one.authorName='Spoof';owner.newsPosts.one.bodyFormat='html';rows=C.feed([], [owner],'c',()=>true);assert.equal(rows[0].authorName,'Hero');assert.equal(rows[0].bodyFormat,'plain');
C.remove(owner,'one');assert.equal(C.feed([],[owner],'c',()=>true).length,0);assert.equal(owner.newsPosts.one.deleted,true);
assert.throws(()=>C.post({...p,images:['file:///a.png']}));assert.throws(()=>C.post({...p,body:'',images:[]}));assert.equal(C.image('javascript:alert(1)'), '');
// Exercise World Config's actual extension against the existing form/collector contract.
const ctx={window:{GRPGNewsV159:C,GRPGNewsUIV159:{create:B=>{global.desktopBridge=B;return {rows:()=>[],show(){}};}}},Sync:{config:{}},App:{state:{users:{}},currentUser:null},Data:{},NPCS:{npc:{id:'npc',name:'NPC'}},NEWS:{},UI:{renderNews(){}},Configurator:{renderNewsEditor:entry=>{global.newsEditorDate=entry.publishedAt;return '<form><div class="cols2"></div></form>'},collectEntity:()=>({id:'news',body:'existing',image:'https://test/img',visibility:{eraIds:['old']}})},document:{getElementById:()=>null},FormData:class{},console};vm.createContext(ctx);vm.runInContext(fs.readFileSync('renderer/news-desktop-v159.js','utf8'),ctx);
const fd=new Map([['authorType','organization'],['authorName','Free Trade Union']]);let n=ctx.Configurator.collectEntity('news',{},fd);assert.equal(n.authorName,'Free Trade Union');assert.equal(n.image,'https://test/img');assert.equal(n.visibility.eraIds[0],'old');assert.match(ctx.Configurator.renderNewsEditor(n),/Free Trade Union/);
fd.set('authorType','npc');fd.set('authorNpcId','npc');n=ctx.Configurator.collectEntity('news',{},fd);assert.equal(n.authorNpcId,'npc');fd.set('authorNpcId','missing');assert.throws(()=>ctx.Configurator.collectEntity('news',{},fd));
for(const name of ['news-core-v159.js','news-ui-v159.js','news-v159.css'])assert.equal(fs.readFileSync('renderer/'+name,'utf8'),fs.readFileSync('deploy/site/app/'+name,'utf8'));
const web=fs.readFileSync('deploy/site/app/app.js','utf8'),html=fs.readFileSync('deploy/site/app/index.html','utf8');assert.match(web,/screen === 'news'.*GRPGNewsWebV159/);assert.match(web,/\['home','archive','market','chat','combat','profile','news'\]/);assert.match(html,/data-screen="news"/);assert.match(html,/id="screen-news"/);
console.log('GalaGram core, World Config authors, campaign filtering, ownership and legacy compatibility: passed');

(async()=>{
 ctx.App.currentUser={id:'hero'};ctx.App.state.users.hero={id:'hero',inventory:{a:2}};let sent;
 ctx.PlayerSync={projectedPlayerV135:()=>ctx.App.state.users.hero,pushPlayerPatch:async(id,patch)=>{sent=patch;throw Error('offline');}};
 await assert.rejects(()=>desktopBridge.commit(player=>C.put(player,p),'saved','hero'),/offline/);assert.equal(ctx.App.state.users.hero.newsPosts,undefined);assert.deepEqual(Object.keys(sent),['newsPosts']);assert.equal(ctx.App.state.users.hero.inventory.a,2);
 ctx.PlayerSync.pushPlayerPatch=async()=>({ok:true});await desktopBridge.commit(player=>C.put(player,p),'saved','hero');assert.equal(ctx.App.state.users.hero.newsPosts.one.id,'one');
 // Exercise the web bridge's upload against the existing PocketBase asset contract and interrupted-response recovery.
 const code=web.slice(web.indexOf('  window.GRPGNewsBridgeV159 = {'),web.indexOf('  window.GRPGHubBridgeV153 = {'));
 const records=[],calls=[],w={window:{},document:{},currentPlayer:()=>({id:'hero'}),App:{config:{campaignId:'storage',url:'https://cloud.test'},session:{campaignId:'story'},data:{campaigns:new Map([['story',{marketDate:'3160-01-01'}]])}},normalizeRichHtml:x=>x,visibleForPlayer:()=>true,notify(){},commitPlayerMutation:async fn=>fn({id:'hero'}),pbCollection:()=> 'campaign_assets',pbBaseUrl:c=>c.url,pbEq:(k,v)=>k+'='+v,pbAnd:(...a)=>a.join(' && '),FormData,encodeURIComponent,
 pbFetch:async(config,path,options)=>{calls.push({path,options});if(options.method==='POST'){assert.equal(options.body.get('campaignId'),'storage');assert.equal(options.body.get('section'),'news');assert.equal(options.body.get('entityId'),'post');records.push({id:'asset',file:'photo.png'});throw Error('lost response');}return {items:records};}};
 vm.createContext(w);vm.runInContext(code,w);const bridge=w.window.GRPGNewsBridgeV159;assert.equal(bridge.campaign(),'story');assert.equal(bridge.date(),'3160-01-01');const file=new File(['png'],'photo.png',{type:'image/png'});
 const url=await bridge.upload(file,'post',0);assert.equal(url,'https://cloud.test/api/files/campaign_assets/asset/photo.png');assert.equal(await bridge.upload(file,'post',0),url);assert.equal(calls.filter(x=>x.options.method==='POST').length,1);
 console.log('Desktop profile-only patch/rollback and web asset upload/recovery: passed');
})().catch(err=>{console.error(err);process.exitCode=1;});

const legacyPlayer={id:'old',newsPosts:{a:{...p,publishedAt:'2026-10-06T19:36:46Z'}}};const dated=C.feed([{id:'world',publishedAt:'3616-10-05'}],[legacyPlayer],'c',()=>true);assert.equal(dated[0].ownerId,'old');assert.equal(dated[0].publishedAt,'3616-10-06T19:36:46Z');assert.equal(legacyPlayer.newsPosts.a.publishedAt,'2026-10-06T19:36:46Z');

ctx.Configurator.renderNewsEditor({id:"new"});assert.equal(newsEditorDate.slice(0,4),"3616");ctx.Configurator.renderNewsEditor({id:"historic",publishedAt:"3160-01-01"});assert.equal(newsEditorDate,"3160-01-01");
for(const file of ["hub-runtime-v156.js","hub-spatial-v157.js"])assert.equal(fs.readFileSync("renderer/"+file,"utf8"),fs.readFileSync("deploy/site/app/"+file,"utf8"));
