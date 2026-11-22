'use strict';
const {Worker}=require('node:worker_threads');
const path=require('node:path');
const base=String(process.env.POCKETBASE_URL||'http://127.0.0.1:8090').replace(/\/$/,'');
const token=process.env.GRPGI_RAID_WORKER_TOKEN;
if(!token||token.length<32)throw Error('GRPGI_RAID_WORKER_TOKEN must contain at least 32 characters');
async function request(route,body){const r=await fetch(base+'/api/grpgi/auth-v212/raids-v290/worker/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-GRPGI-Worker-Token':token},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(route+': '+r.status+' '+await r.text());return r.json();}
function lua(payload){return new Promise(resolve=>{const worker=new Worker(path.join(__dirname,'../lua-sandbox-worker.cjs'));let done=false;const finish=result=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();resolve(result);};const timer=setTimeout(()=>finish({ok:false,message:'Lua timeout (5 seconds)'}),5000);worker.on('error',e=>finish({ok:false,message:e.message}));worker.on('message',finish);worker.on('exit',code=>{if(code)finish({ok:false,message:'Lua worker exited '+code});});worker.postMessage(payload);});}
let busy=false;
async function tick(){if(busy)return;busy=true;try{for(let pass=0;pass<32;pass++){const {jobs}=await request('claim');if(!jobs.length)break;for(const job of jobs){const result=await lua(job.payload);await request('result',{...job,payload:undefined,result});}}}catch(e){console.error(new Date().toISOString(),e.message);}finally{busy=false;}}
setInterval(tick,1000);tick();
