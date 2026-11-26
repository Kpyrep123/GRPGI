'use strict';
// Run as root on the server. Secrets never go to stdout or into the repository.
const fs=require('node:fs'),crypto=require('node:crypto'),webpush=require('web-push');
const target=process.argv[2]||'/etc/grpgi-notifications.env';
const existing=fs.existsSync(target)?fs.readFileSync(target,'utf8'):'';
const hasPublic=/^GRPGI_PUSH_PUBLIC_KEY=.+/m.test(existing),hasPrivate=/^GRPGI_PUSH_PRIVATE_KEY=.+/m.test(existing);
if(hasPublic!==hasPrivate)throw Error('Incomplete VAPID pair: restore both keys from the existing configuration.');
const additions=[];const keys=webpush.generateVAPIDKeys();
for(const [name,value] of Object.entries({POCKETBASE_URL:'http://127.0.0.1:8090',GRPGI_PUSH_WORKER_TOKEN:crypto.randomBytes(32).toString('hex'),GRPGI_PUSH_PUBLIC_KEY:keys.publicKey,GRPGI_PUSH_PRIVATE_KEY:keys.privateKey,GRPGI_PUSH_SUBJECT:'https://sync.grpg-sync.ru'}))if(!new RegExp('^'+name+'=','m').test(existing))additions.push(name+'='+value);
if(additions.length)fs.writeFileSync(target,existing.replace(/\s*$/,'')+'\n'+additions.join('\n')+'\n',{mode:0o600});
fs.chmodSync(target,0o600);console.log('Notification environment ready; existing keys preserved.');
