(function(root){
 'use strict';
 const forbidden=new Set(['__proto__','constructor','prototype']);
 const copy=value=>JSON.parse(JSON.stringify(value));
 function canonical(value){
  if(Array.isArray(value))return Array.from(value,child=>canonical(child===undefined?null:child));
  if(!value||typeof value!=='object')return value;
  const out={};for(const key of Object.keys(value).sort()){if(forbidden.has(key))throw Error('Unsafe world key');if(value[key]!==undefined)out[key]=canonical(value[key]);}return out;
 }
 // Containers are explicit documents: empty objects, arrays and removals survive round trips.
 // At depth 4 a world catalogue entry is one document, including its script and image URL.
 function pack(value){
  const documents=new Map();
  function visit(value,path){
   const key=JSON.stringify(path);
   if(path.length<4&&value&&typeof value==='object'){
    const keys=Array.isArray(value)?Array.from({length:value.length},(_,i)=>String(i)):Object.keys(value).filter(key=>value[key]!==undefined).sort();
    if(keys.some(k=>forbidden.has(k)))throw Error('Unsafe world key');
    documents.set(key,JSON.stringify({t:Array.isArray(value)?'a':'o',k:keys}));
    for(const child of keys)visit(value[child]===undefined?null:value[child],path.concat(child));
   }else documents.set(key,JSON.stringify({t:'v',v:canonical(value)}));
  }
  visit(value,[]);if(documents.size>200000)throw Error('World document limit exceeded');return documents;
 }
 function unpack(documents){
  const used=new Set();
  function visit(path){
   const key=JSON.stringify(path),raw=documents.get(key);if(typeof raw!=='string')throw Error('Incomplete world changes');
   used.add(key);const node=JSON.parse(raw);
   if(node.t==='v'){if(!Object.hasOwn(node,'v'))throw Error('Invalid world value');return canonical(node.v);}
   if(path.length>=4||!['a','o'].includes(node.t)||!Array.isArray(node.k)||new Set(node.k).size!==node.k.length)throw Error('Invalid world container');
   const out=node.t==='a'?[]:{};
   for(const [index,child] of node.k.entries()){
    if(typeof child!=='string'||forbidden.has(child)||(node.t==='a'&&child!==String(index)))throw Error('Invalid world key');
    out[child]=visit(path.concat(child));
   }return out;
  }
  const result=visit([]);if(used.size!==documents.size)throw Error('Orphan world documents');return result;
 }
 function topic(collection){return collection+'/*?options='+encodeURIComponent(JSON.stringify({query:{fields:'id,collectionId,collectionName,campaignId,revision,updated,updatedBy,clientUpdatedAt'}}));}
 function createClient(){
  const entries=new Map(),queues=new Map(),unsupported=new Set(),history=new Map();
  function serial(key,fn){const pending=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(fn);queues.set(key,pending);return pending.finally(()=>{if(queues.get(key)===pending)queues.delete(key);});}
  function accept(key,response){
   if(response.exists===false){entries.delete(key);return null;}
   const prior=entries.get(key);
   if(!response||response.schema!==301||typeof response.epoch!=='string'||!Number.isSafeInteger(response.seq)||response.seq<0||!Array.isArray(response.changes)||!response.remote)throw Error('Invalid world sync response');
   if(!response.reset&&(!prior||prior.epoch!==response.epoch||response.seq<prior.seq))throw Error('World sync baseline mismatch');
   const rows=response.reset?new Map():new Map(prior.rows);
   for(const row of response.changes){
    if(typeof row.key!=='string'||!Number.isSafeInteger(row.version)||row.version<1||!Number.isSafeInteger(row.seq)||row.seq>response.seq)throw Error('Invalid world change');
    rows.set(row.key,{...row});
   }
   const data=unpack(new Map([...rows].filter(([,row])=>!row.deleted).map(([key,row])=>[key,row.data])));
   if(!data.world||!data.state)throw Error('Incomplete world snapshot');
   const entry={epoch:response.epoch,seq:response.seq,rows,changed:response.reset||response.changes.length>0,remote:{...response.remote,world:data.world,state:data.state}};
   const past=history.get(key)||[];
   if(prior&&prior.epoch===entry.epoch&&(prior.seq!==entry.seq||prior.remote.revision!==entry.remote.revision))past.push({epoch:prior.epoch,revision:prior.remote.revision,rows:prior.rows});
   history.set(key,prior&&prior.epoch===entry.epoch?past.slice(-8):[]);
   entries.set(key,entry);return entry;
  }
  async function pullNow(key,request,campaignId){
   const entry=entries.get(key);
   const response=await request('pull',{campaignId,epoch:entry?.epoch||'',since:entry?.seq||0});
   return accept(key,response);
  }
  async function supported(key,fn){try{return await fn();}catch(error){if(error.status===404){unsupported.add(key);entries.delete(key);return null;}throw error;}}
  return {
   clear(){entries.clear();unsupported.clear();history.clear();},
   pull(key,request,campaignId,options={}){return serial(key,async()=>{
    if(options.force){entries.delete(key);unsupported.delete(key);history.delete(key);}
    if(unsupported.has(key))return null;
    return supported(key,async()=>{const entry=await pullNow(key,request,campaignId);return {ok:true,exists:!!entry,changed:entry?.changed||false,remote:entry?copy(entry.remote):null};});
   });},
   push(key,request,campaignId,payload,operationId){return serial(key,async()=>{
    const entry=entries.get(key);if(unsupported.has(key)||!entry)return null;
    const intentRevision=payload.intentBaseRevision??payload.baseRevision;
    const baseline=(history.get(key)||[]).find(row=>row.epoch===entry.epoch&&row.revision===intentRevision)
      ||(entry.remote.revision===intentRevision?{rows:entry.rows}:null);
    if(!baseline)return {ok:false,status:'conflict',message:'Локальная версия мира устарела. Получите актуальные данные.',remote:{...entry.remote,world:null,state:null}};
    const target=pack({world:payload.world||{},state:payload.state||{}}),changes=[];
    const scope=Array.isArray(payload.worldScope)?new Set(payload.worldScope):null;
    function allowed(key){
     if(!scope)return true;
     const path=JSON.parse(key);
     return path[0]==='world'&&(!path[1]||scope.has(path[1]))
       ||path[0]==='state'&&(path.length===1||path[1]==='__worldWriteV140');
    }
    function expected(key,base,current){
     // The write proof is generated from this freshly fetched server state. It is
     // technical metadata, never an old editor's gameplay intent.
     return scope&&JSON.parse(key)[0]==='state'?(current?.version||0):(base?.version||0);
    }
    // Compare intent with its original baseline, not with a newer download. Otherwise a
    // stale catalogue could silently delete another editor's unrelated additions.
    for(const [key,data] of target){
     if(!allowed(key))continue;
     const base=baseline.rows.get(key),current=entry.rows.get(key);
     if((!base||base.deleted||base.data!==data)&&(!current||current.deleted||current.data!==data))changes.push({key,data,version:expected(key,base,current)});
    }
    for(const [key,base] of baseline.rows)if(allowed(key)&&!base.deleted&&!target.has(key)&&!entry.rows.get(key)?.deleted)changes.push({key,deleted:true,version:expected(key,base,entry.rows.get(key))});
    // A missing route is the only fallback. Timeouts and conflicts must not replay through a legacy write.
    return supported(key,async()=>{
     const response=await request('push',{campaignId,epoch:entry.epoch,since:entry.seq,baseRevision:payload.baseRevision,operationId,changes,updatedBy:payload.updatedBy,clientUpdatedAt:payload.clientUpdatedAt});
     if(response.ok===false){const current=await pullNow(key,request,campaignId);return {...response,remote:current?{...current.remote,world:null,state:null}:null};}
     const current=accept(key,response),sections=new Set();
     function touch(key){const path=JSON.parse(key);if(path[0]==='world'&&path[1])sections.add(path[1]);}
     for(const row of response.changes)touch(row.key);
     for(const [key,row] of current.rows)if(!row.deleted&&row.data!==target.get(key))touch(key);
     const canonicalWorldPatch=Object.fromEntries([...sections].map(section=>[section,current.remote.world[section]??{}]));
     return {ok:true,status:response.status||'updated',remote:{...current.remote,world:null,state:null},canonicalWorldPatch,canonicalUsers:current.remote.state.users||null};
    });
   });}
  };
 }
 const api={pack,unpack,createClient,topic};
 if(typeof module!=='undefined')module.exports=api;root.GRPGWorldSyncV301=api;
})(typeof window==='undefined'?globalThis:window);
