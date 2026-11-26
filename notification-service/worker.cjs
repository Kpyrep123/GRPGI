'use strict';
const webpush=require('web-push');
const base=String(process.env.POCKETBASE_URL||'http://127.0.0.1:8090').replace(/\/$/,'');
const token=process.env.GRPGI_PUSH_WORKER_TOKEN;
if(!token||token.length<32)throw Error('Missing push worker token');
webpush.setVapidDetails(process.env.GRPGI_PUSH_SUBJECT,process.env.GRPGI_PUSH_PUBLIC_KEY,process.env.GRPGI_PUSH_PRIVATE_KEY);
async function request(route,body={}){const r=await fetch(base+'/api/grpgi/auth-v212/galagram-v315/worker/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-GRPGI-Worker-Token':token},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(route+' HTTP '+r.status);return r.json();}
let busy=false;
async function tick(){if(busy)return;busy=true;try{const {jobs}=await request('claim');for(const j of jobs){let ok=false,expired=false;try{await webpush.sendNotification(j.subscription,JSON.stringify(j.payload),{TTL:3600,timeout:10000});ok=true;}catch(e){expired=[404,410].includes(e.statusCode);console.error('Push delivery:',e.statusCode||e.code||'failed');}await request('ack',{id:j.id,lease:j.lease,ok,expired});}}catch(e){console.error(new Date().toISOString(),e.message);}finally{busy=false;}}
setInterval(tick,15000);tick();
