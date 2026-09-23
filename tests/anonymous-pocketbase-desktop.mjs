import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=path.resolve(process.argv[2]||'.');
const source=fs.readFileSync(path.join(root,'main.js'),'utf8');
const start=source.indexOf('async function pocketbaseFetch(config = {}, pathname = \'/\', options = {}) {');
const end=source.indexOf('async function pocketbaseList(',start);
assert.ok(start>0&&end>start);
const calls=[];
const context=vm.createContext({
  URL,AbortController,setTimeout,clearTimeout,
  getPocketBaseBaseUrl:config=>config.url,
  fetch:async (url,options)=>{
    calls.push({url:String(url),options});
    return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>({items:[]})};
  }
});
vm.runInContext(source.slice(start,end)+'\nthis.fetchRecord=pocketbaseFetch;',context);
await context.fetchRecord({url:'https://sync.test',connectTimeoutMs:5000},'/api/collections/campaign_players/records');
assert.equal(calls.length,1);
assert.ok(!Object.keys(calls[0].options.headers).some(key=>key.toLowerCase()==='authorization'));
assert.ok(!source.includes('/auth-with-password'));
console.log('PASS anonymous Electron PocketBase request');
