import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

const {Window} = await import(process.env.HAPPY_DOM_MODULE ? pathToFileURL(process.env.HAPPY_DOM_MODULE) : 'happy-dom');
const w = new Window({url:'https://grpgi.test/app/', settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
const context = vm.createContext(w), run = source => vm.runInContext(source, context);
const read = name => fs.readFileSync(`deploy/site/app/${name}`, 'utf8');
const frames = [];
w.requestAnimationFrame = fn => (frames.push(fn), frames.length);
w.setInterval = () => 0;
w.matchMedia = () => ({matches:false});
w.fetch = async () => {throw Error('Network disabled in fixture');};
w.addEventListener('error', event => {throw event.error;});
let hidden = false;
Object.defineProperty(w.document, 'hidden', {get: () => hidden});
const flush = () => {while(frames.length) frames.shift()();};
w.document.write(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
try {
  for (const file of ['task-map-v216.js','rich-text-scope.js','market-engine.js','player-sync-core.js','damage-types-v202.js','weapon-handling-v203.js','player-credentials-v212.js','player-auth-v212.js']) run(read(file));
  run(read('app.js').replace('  init().catch(error => {', `
    window.test314 = {App, compileData, bindGlobalEvents, renderCurrentScreen, renderAffectedScreens};
    if(false) init().catch(error => {`));
  for (const file of ['news-core-v159.js','news-ui-v159.js','news-web-v159.js']) run(read(file));
  const {App,compileData,bindGlobalEvents,renderCurrentScreen,renderAffectedScreens} = w.test314;
  App.config = {url:'https://fixture.invalid',campaignId:'main'};
  App.session = {userId:'p',role:'player',campaignId:'main'};
  App.ui.boot = 'app';
  const world = {
    players:{PLAYER_TEMPLATES:{
      p:{id:'p',role:'player',displayName:'Player',campaignIds:['main'],newsPosts:{own:{campaignId:'main',body:'My post',createdAt:'2026-01-01'}}},
      q:{id:'q',role:'player',displayName:'Other',image:'https://images.test/player.png',campaignIds:['main'],newsPosts:{same:{campaignId:'main',body:'Player post',images:['https://images.test/attachment.png'],createdAt:'2026-01-02'}}}
    }},
    npcs:{NPCS:{n:{id:'n',name:'NPC',image:'https://images.test/npc.png'}}},
    news:{NEWS_LIST:[
      {id:'same',title:'Publisher report',authorType:'organization',authorName:'Publisher',image:'https://images.test/publisher.png',body:'Text',images:['https://images.test/article.png']},
      {id:'npc',title:'NPC report',authorType:'npc',authorNpcId:'n',image:'https://images.test/legacy.png',authorImage:'https://images.test/explicit.png'},
      {id:'secret',title:'Secret',visibility:{playerIds:['q']}}
    ]}
  };
  compileData({world_json:world,state_json:{}},[],[],null);
  bindGlobalEvents();
  const nav = screen => {App.ui.screen=screen;renderCurrentScreen();flush();};
  const badge = () => w.document.querySelector('.bottom-nav .chat-nav-unread-v1065');
  const newsBadge = () => w.document.getElementById('social-news-unread-v314');
  const messagesBadge = () => w.document.getElementById('social-unread');
  nav('tasks');
  assert.equal(newsBadge().textContent,'3','visible world and other-player posts, excluding own and secret');
  assert.equal(badge().textContent,'3');
  assert.equal(messagesBadge().hidden,true);
  nav('news');
  const posts = Array.from(w.document.querySelectorAll('.gg-post'));
  const publisher = posts.find(post=>post.textContent.includes('Publisher report'));
  assert.equal(publisher.querySelector('.gg-avatar').getAttribute('src'),'https://images.test/publisher.png');
  assert.deepEqual(Array.from(publisher.querySelectorAll('.gg-images img'),img=>img.getAttribute('src')),['https://images.test/article.png']);
  const npc = posts.find(post=>post.textContent.includes('NPC report'));
  assert.equal(npc.querySelector('.gg-avatar').getAttribute('src'),'https://images.test/explicit.png');
  assert.equal(npc.querySelector('.gg-images'),null);
  const player = posts.find(post=>post.textContent.includes('Player post'));
  assert.equal(player.querySelector('.gg-avatar').getAttribute('src'),'https://images.test/player.png');
  assert.equal(player.querySelector('.gg-images img').getAttribute('src'),'https://images.test/attachment.png');
  assert(newsBadge().hidden && badge().hidden);
  const draft = w.document.querySelector('.gg-composer textarea');draft.value='Unsaved post';
  renderAffectedScreens({players:true});flush();
  assert.equal(w.document.querySelector('.gg-composer textarea'),draft);
  assert.equal(draft.value,'Unsaved post');
  nav('tasks');
  App.data.newsList.push({id:'new',title:'New report'});
  renderAffectedScreens({snapshot:true});flush();
  assert.equal(newsBadge().textContent,'1');
  App.data.chatRows.push({message_id:'incoming',kind:'direct',sender_type:'player',sender_id:'q',recipient_player_id:'p',created_at:new Date(Date.now()+10000).toISOString(),body_html:'<p>Message</p>'});
  renderAffectedScreens({chat:true});flush();
  assert.equal(messagesBadge().textContent,'1');assert.equal(badge().textContent,'2');
  assert.match(badge().getAttribute('aria-label'),/сообщений: 1. Новостей: 1/);
  hidden=true;nav('news');
  assert.equal(newsBadge().textContent,'1','hidden tab must not mark rendered news as read');
  hidden=false;renderCurrentScreen();flush();
  assert(newsBadge().hidden);assert.equal(badge().textContent,'1','reading feed does not clear messages');
  assert.equal(w.document.querySelector('.gg-composer textarea').value,'Unsaved post');
  nav('chat');
  w.document.querySelector('#screen-chat [data-thread-key="p__q"]').click();flush();
  assert(messagesBadge().hidden);
  hidden=true;
  App.data.chatRows.push({...App.data.chatRows[0],message_id:'background',created_at:new Date(Date.now()+20000).toISOString()});
  renderAffectedScreens({chat:true});flush();
  assert.equal(messagesBadge().textContent,'1','hidden conversation does not consume incoming messages');
  hidden=false;renderCurrentScreen();flush();assert(messagesBadge().hidden);
  nav('tasks');
  // Persisted markers survive redraw and remain isolated by reader/campaign/server.
  const markers = w.sessionStorage.getItem('grpg.mobile.readMarkers.v1');assert(markers);
  App.session.userId='q';renderCurrentScreen();flush();assert.equal(newsBadge().textContent,'5');
  App.session.userId='p';renderCurrentScreen();flush();assert(newsBadge().hidden);
  App.session.campaignId='other';renderCurrentScreen();flush();assert(!newsBadge().hidden);
  App.session.campaignId='main';App.config.url='https://other.invalid';renderCurrentScreen();flush();assert(!newsBadge().hidden);
  App.config.url='https://fixture.invalid';renderCurrentScreen();flush();assert(newsBadge().hidden);
  // No caller is allowed to consume unread entries while the feed is not displayed.
  App.data.newsList.push({id:'offscreen',title:'Offscreen'});
  w.GRPGNewsWebV159.show();renderAffectedScreens({snapshot:true});flush();assert.equal(newsBadge().textContent,'1');
  App.data.newsList.pop();renderAffectedScreens({snapshot:true});flush();assert(newsBadge().hidden);
  assert.equal(w.sessionStorage.getItem('grpg.mobile.readMarkers.v1'),markers);
  console.log('PASS GalaGram v314: publisher/NPC/player avatars and attachments, real web feed, combined and separate unread badges, realtime, hidden tabs, drafts, storage and identity isolation');
} finally {await w.happyDOM.abort();}
