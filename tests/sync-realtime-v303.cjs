'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const main=fs.readFileSync(require('node:path').join(__dirname,'../main.js'),'utf8');
let connects=0,closes=0,fail=false;
const ctx={playerSessionV212:'session',pocketbaseRealtime:null,selfhostRealtime:null,
 isPocketBaseSyncConfig:config=>config.provider==='pocketbase',isSelfhostSyncConfig:config=>config.provider==='selfhost',
 teardownPocketBaseRealtime:async()=>{if(ctx.pocketbaseRealtime)closes++;ctx.pocketbaseRealtime=null;},teardownSelfhostRealtime:async()=>{ctx.selfhostRealtime=null;},
 setupPocketBaseRealtime:async()=>{if(fail)throw Error('failed');connects++;ctx.pocketbaseRealtime={abortController:new AbortController()};},setupSelfhostRealtime:async()=>{}
};
vm.createContext(ctx);vm.runInContext(main.slice(main.indexOf("let networkRealtimeSignatureV303"),main.indexOf('let startupNetworkRealtimeStarted')),ctx);
(async()=>{
 const config={enabled:true,provider:'pocketbase',url:'https://sync.test',campaignId:'main'};
 await Promise.all(Array.from({length:6},()=>ctx.setupNetworkRealtime(config)));assert.equal(connects,1);assert.equal(closes,0);
 ctx.playerSessionV212='new-session';await ctx.setupNetworkRealtime(config);assert.equal(connects,2);assert.equal(closes,1);
 await ctx.setupNetworkRealtime({...config,campaignId:'other'});assert.equal(connects,3);
 await ctx.setupNetworkRealtime({...config,enabled:false});assert.equal(ctx.pocketbaseRealtime,null);
 fail=true;await assert.rejects(ctx.setupNetworkRealtime(config),/failed/);fail=false;await ctx.setupNetworkRealtime(config);assert.equal(connects,4);
 console.log('PASS realtime reuse: concurrent config reads share a connection, auth/campaign changes reconnect and failed setup retries');
})().catch(error=>{console.error(error);process.exitCode=1;});
