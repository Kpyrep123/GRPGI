const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {clean} = require('../renderer/player-credentials-v212.js');

const main = fs.readFileSync('main.js', 'utf8');
const requests = [];
let reject = false, handler;
const context = vm.createContext({
  AbortController, setTimeout, clearTimeout, URL,
  getPocketBaseBaseUrl: config => config.url,
  loadSyncConfig: async () => ({enabled:true, url:'https://sync.test', campaignId:'backend'}),
  isPocketBaseSyncConfig: () => true,
  ipcMain: {handle: (_, callback) => { handler=callback; }},
  fetch: async (url, options) => {
    requests.push({url:String(url), options});
    return {
      ok:!reject, status:reject?401:200,
      headers:{get:()=> 'application/json'},
      json:async()=>reject?{message:'Denied'}:{ok:true,token:'native-token',playerId:'p',campaignId:'backend'}
    };
  }
});
vm.runInContext('let playerSessionV212="";' +
  main.slice(main.indexOf('async function pocketbaseFetch('), main.indexOf('async function pocketbaseList(')) +
  main.slice(main.indexOf("ipcMain.handle('player-auth-v212'"), main.indexOf("ipcMain.handle('applications:pull'")), context);
(async () => {
  assert((await handler(null, {action:'login', data:{campaignId:'backend',playerId:'p',password:'secret'}})).ok);
  await vm.runInContext('pocketbaseFetch({url:"https://sync.test"},"/api/grpgi/players/mutate",{method:"POST",json:{}})',context);
  assert.equal(requests.at(-1).options.headers['X-GRPGI-Session'],'native-token');
  await handler(null,{action:'logout'});
  await vm.runInContext('pocketbaseFetch({url:"https://sync.test"},"/api/grpgi/players/mutate",{method:"POST",json:{}})',context);
  assert.equal(requests.at(-1).options.headers['X-GRPGI-Session'],undefined);
  assert(!(await handler(null,{action:'../../arbitrary'})).ok);
  await handler(null,{action:'session',token:'remembered-token'});
  assert.equal(vm.runInContext('playerSessionV212',context),'remembered-token');
  reject = true;
  assert(!(await handler(null,{action:'session',token:'revoked-token'})).ok);
  assert.equal(vm.runInContext('playerSessionV212',context),'');
  const input = {world:{players:{PLAYER_TEMPLATES:{p:{id:'p',pass:'secret',lore:'The word password is ordinary text'}}}},
    users:{p:{passwordHash:'hash',inventory:[{itemId:'gun',qty:3}]}}};
  const output=clean(input);
  assert.equal(output.world.players.PLAYER_TEMPLATES.p.pass,undefined);
  assert.equal(output.users.p.passwordHash,undefined);
  assert.equal(output.users.p.inventory[0].qty,3);
  assert.equal(input.world.players.PLAYER_TEMPLATES.p.pass,'secret');
  assert(output.world.players.PLAYER_TEMPLATES.p.lore.includes('password'));
  console.log('PASS actual main-process bridge, write authorization headers, resume/logout/revocation and credential-free exports');
})().catch(error=>{console.error(error);process.exitCode=1;});
