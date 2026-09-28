'use strict';
const base=String(process.env.POCKETBASE_URL||'http://127.0.0.1:8090').replace(/\/+$/,'');
const token=String(process.env.GRPGI_STOCK_WORKER_TOKEN||'');
const interval=Math.max(250,Number(process.env.STOCK_TICK_MS||1000));
if(!token)throw new Error('GRPGI_STOCK_WORKER_TOKEN is required');
let running=false;
async function tick(){if(running)return;running=true;try{const response=await fetch(base+'/api/grpgi/stock-exchange-v148/tick',{method:'POST',headers:{'X-GRPGI-Worker-Token':token}});if(!response.ok)throw new Error(`tick ${response.status}: ${await response.text()}`);}catch(error){console.error(new Date().toISOString(),error.message);}finally{running=false;}}
setInterval(tick,interval);tick();
