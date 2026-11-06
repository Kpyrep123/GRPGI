import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

const {Window} = await import(process.env.HAPPY_DOM_MODULE ? pathToFileURL(process.env.HAPPY_DOM_MODULE) : 'happy-dom');
const w = new Window({url:'https://grpgi.test/app/', settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
const context = vm.createContext(w), run = text => vm.runInContext(text, context);
w.setInterval=()=>0;w.requestAnimationFrame=()=>0;
const read = name => fs.readFileSync('deploy/site/app/' + name, 'utf8');
w.document.write(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
for (const file of ['rich-text-scope.js','market-engine.js','player-sync-core.js','damage-types-v202.js','weapon-handling-v203.js','player-credentials-v212.js','player-auth-v212.js']) run(read(file));
const source = read('app.js').replace('  init().catch(error => {', `
  window.authTest={App,login,validateSessionV212,buildPlayerMap};
  renderCurrentScreen=()=>{};startRealtimeSync=()=>{};notify=()=>{};
  if(false) init().catch(error => {`);
run(source);
const api=w.authTest, requests=[];
let deny=false;
w.fetch=async(url, options)=>{
  const pathname=new URL(url).pathname, body=options.body?JSON.parse(options.body):null;
  requests.push({pathname,body,headers:options.headers});
  if(deny) return new w.Response(JSON.stringify({message:'Вход отклонён'}),{status:401});
  if(pathname.endsWith('/login'))return new w.Response(JSON.stringify({ok:true,token:'server-token',playerId:'p',campaignId:'backend',dm:false}));
  if(pathname.endsWith('/session'))return new w.Response(JSON.stringify({ok:true,playerId:'p',campaignId:'backend',dm:false}));
  if(pathname.endsWith('/requests'))return new w.Response(JSON.stringify({ok:true,requests:[{id:'r',playerId:'p',status:'pending'}]}));
  if(pathname.endsWith('/approve'))return new w.Response(JSON.stringify({ok:true,url:'https://grpgi.test/app/#recover='+'A'.repeat(48)}));
  return new w.Response(JSON.stringify({ok:true}));
};
const pause=()=>new Promise(resolve=>setImmediate(resolve));
try {
  api.App.config={url:'https://sync.test',campaignId:'backend'};
  api.App.ui.selectedCampaignId='game';
  api.App.data.campaigns=new Map([['game',{id:'game',availableNow:true,era:'technological'}]]);
  api.App.data.players=new Map([['p',{id:'p',displayName:'Игрок',role:'player',approvalStatus:'approved',campaignIds:['game']}]]);
  w.document.getElementById('login-campaign').innerHTML='<option value="game">Игра</option>';
  w.document.getElementById('login-player').innerHTML='<option value="p">Игрок</option>';
  await api.login('p','entered-password');
  assert.equal(requests[0].body.campaignId,'backend');
  assert.equal(requests[0].body.password,'entered-password');
  assert.equal(api.App.session.authTokenV212,'server-token');
  assert.equal(await api.validateSessionV212(),true);
  assert.equal(requests.at(-1).headers['X-GRPGI-Session'],'server-token');
  const map=api.buildPlayerMap({world_json:{players:{PLAYER_TEMPLATES:{p:{id:'p',pass:'legacy'}}}}},[]);
  assert.equal(map.get('p').pass,undefined);
  deny=true;
  await assert.rejects(api.login('p','bad'),/Вход отклонён/);
  assert.equal(await api.validateSessionV212(),false);
  deny=false;
  w.document.querySelector('[data-auth-recover-v212]').click();
  w.document.querySelector('[data-code]').click();
  const form=w.document.querySelector('[data-confirm]');
  form.elements.token.value='https://grpgi.test/app/#recover='+'A'.repeat(48);
  form.elements.password.value='new-password-123';
  form.elements.again.value='new-password-123';
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await pause();
  assert.equal(requests.at(-1).body.token,'A'.repeat(48));
  assert.equal(requests.at(-1).body.password,'new-password-123');
  assert(!w.document.querySelector('[data-confirm]'));
  assert.match(w.document.querySelector('[data-auth-status]').textContent,/Пароль изменён/);
  // A valid token is stored separately from profile data.
  assert(!JSON.stringify(api.App.data.players.get('p')).includes('new-password-123'));
  assert(!JSON.stringify(api.App.data.players.get('p')).includes('server-token'));
  console.log('PASS actual web login, server rejection, backend/game campaign separation, session validation, credential stripping and recovery UI');
} finally { await w.happyDOM.abort(); }
