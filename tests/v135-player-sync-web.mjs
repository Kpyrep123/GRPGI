
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
     'window.testApiV135={App,compileData,normalizePlayerRow,applyRealtimeRecord,currentPlayer,normalizeConfig,mutate:commitPlayerMutation,upgradeSkill,upgradeAbility,trade:transactMarketWebV1071,setTransport(fn){pbFetch=fn;}};',
     'renderCurrentScreen=()=>{};renderMarket=()=>{};renderAffectedScreens=()=>{};renderOptimisticPlayerWeb120=()=>{};',
     'saveCache=async()=>{};notify=(message,type)=>window.notices.push({message,type});',
     'if(false) init().catch(error => {'].join('\n'));
    w.notices=[];run(source);const api=w.testApiV135,App=api.App,core=w.GRPGPlayerSyncCoreV135;
    App.config=api.normalizeConfig({url:'https://sync.test',campaignId:'test',playerTableName:'campaign_players'});
    App.session={userId:'p',role:'player'};
    let server={id:'row',campaignId:'test',playerId:'p',version:1,playerJson:{
     id:'p',role:'player',approvalStatus:'approved',campaignIds:['test'],currentPlanetId:'port',credits:10000,
     skillPoints:6,skills:[],abilityBase:{strength:0,dexterity:0,endurance:0,intelligence:0,will:0,glory:0},
     abilities:{strength:0,dexterity:0,endurance:0,intelligence:0,will:0,glory:0},
     baseStats:{hpBase:10,inventorySlots:100,carryBase:1000},inventory:[],equipmentSlots:{},implantSlots:[],
     stats:{hpCurrent:10,hpMax:10}}};
    const snapshot={world_json:{players:{PLAYER_TEMPLATES:{}},skills:{SKILLS:Object.fromEntries(['a','b','c'].map(id=>[id,{id,name:id,cost:1}]))},planets:{PLANETS:{port:{id:'port'}}},campaigns:{CAMPAIGNS:{test:{id:'test'}}}},state_json:{}};
    App.cache.snapshot=snapshot;api.compileData(snapshot,[api.normalizePlayerRow(clone(server))],[],null);
    const receipts=new Map();let active=0,maxActive=0,loseReply=false,commits=0,phase='',minVisible=Infinity;
    api.setTransport(async(config,url,options={})=>{
     if(url.includes('/records'))return{items:[clone(server)]};
     active++;maxActive=Math.max(maxActive,active);
     try{
      await pause(8);const body=options.json,id=body.operationId;
      if(receipts.has(id))return clone(receipts.get(id));
      if(url==='/api/grpgi/players/mutate'){
       let next;
       try{next=core.mergePatch(body.basePlayer,body.player,server.playerJson);}
       catch(error){return{ok:false,status:'conflict',remote:clone(server),message:error.message};}
       server={...server,version:server.version+1,playerJson:clone(next)};
      }else if(url==='/api/grpgi/market/transaction-v139'){
       const quantity=Math.max(1,Math.trunc(Number(body.quantity)||1)),total=100*quantity;
       server={...server,version:server.version+1,playerJson:{...server.playerJson,credits:server.playerJson.credits-total,
        stockPortfolio:{positions:{stock_acme:{itemId:'stock_acme',knownQty:quantity,costBasis:total}},ledger:[]}}};
      }else throw new Error('Unexpected endpoint '+url);
      commits++;
      const reply=url.includes('/market/')?{ok:true,player:clone(server.playerJson),playerVersion:server.version,snapshotChanged:false}:{ok:true,row:clone(server)};
      receipts.set(id,clone(reply));
      api.applyRealtimeRecord('campaign_players','update',clone(server));
      if(phase==='add')minVisible=Math.min(minVisible,api.currentPlayer().inventory.length);
      if(loseReply){loseReply=false;throw new Error('Lost response after commit');}
      return reply;
     }finally{active--;}
    });
    try{
     phase='add';const tasks=[];
     for(let i=0;i<15;i++)tasks.push(api.mutate(p=>{p.inventory.push({itemId:'item_'+i,qty:1,positions:[]});}));
     assert.equal(api.currentPlayer().inventory.length,15);
     await Promise.all(tasks);assert.equal(server.playerJson.inventory.length,15);assert.equal(maxActive,1);
     assert.equal(minVisible,15);console.log('PASS web: 15 rapid inventory writes remain visible');
     phase='remove';await Promise.all(Array.from({length:15},(_,i)=>api.mutate(p=>{p.inventory=p.inventory.filter(row=>row.itemId!=='item_'+i);})));
     assert.equal(server.playerJson.inventory.length,0);
     const stale={...clone(server),version:1,playerJson:{...clone(server.playerJson),inventory:[{itemId:'resurrected',qty:1}]}};
     api.applyRealtimeRecord('campaign_players','update',stale);
     api.compileData(snapshot,[api.normalizePlayerRow(stale)],[],null);
     assert.equal(api.currentPlayer().inventory.length,0);console.log('PASS web: old events and delayed full polls cannot resurrect items');
     await Promise.all(['a','b','c'].map(id=>api.upgradeSkill(id)));
     assert.deepEqual(server.playerJson.skills.sort(),['a','b','c']);assert.equal(server.playerJson.skillPoints,3);
     await api.upgradeSkill('a');assert.equal(server.playerJson.skillPoints,3);
     loseReply=true;const before=commits;await api.upgradeAbility('strength');
     assert.equal(commits,before+1);assert.equal(server.playerJson.skillPoints,2);assert.equal(server.playerJson.abilityBase.strength,1);
     console.log('PASS web: skills, abilities and lost-response retries charge exactly once');
     await Promise.all([api.mutate(p=>{p.inventory.push({itemId:'last',qty:1});}),api.trade({action:'buy',itemId:'stock_acme',quantity:3})]);
     assert.equal(server.playerJson.credits,9700);assert.equal(server.playerJson.stockPortfolio.positions.stock_acme.knownQty,3);
     assert.equal(server.playerJson.inventory.length,1);assert.equal(maxActive,1);
     console.log('PASS web: market and inventory share a queue and preserve both results');
     const equalVersionStale=clone(server);delete equalVersionStale.playerJson.stockPortfolio;
     await api.applyRealtimeRecord('campaign_players','update',equalVersionStale);
     assert.equal(api.currentPlayer().stockPortfolio.positions.stock_acme.knownQty,3);
     console.log('PASS web: conflicting equal-version realtime cannot erase shares');
     console.log('ALL WEB CLIENT CHECKS PASSED');
    }finally{await w.happyDOM.abort();}
    
