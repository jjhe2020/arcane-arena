/* Generated into dist/sw.js with the build's immutable resource inventory. */
const MANIFEST = /* OFFLINE_MANIFEST */;
const CACHE = `arcane-arena-${MANIFEST.version}`;
const READY = new URL('__offline_ready__', self.registration.scope).href;
const resources = new Map(MANIFEST.files.map(file => [new URL(file.url, self.registration.scope).href, file]));
let downloading = null;
let current = {state:'idle',completed:0,total:MANIFEST.files.length,bytes:0,totalBytes:MANIFEST.totalBytes,version:MANIFEST.version};

async function fetchResource(url){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
 try{
  const response=await fetch(url,{cache:'reload',signal:controller.signal});
  if(!response.ok||response.type==='opaque'||response.headers.get('content-type')?.includes('text/html')&&!url.endsWith('/index.html'))throw Error(`资源下载失败（${response.status}）：${new URL(url).pathname}`);
  const body=await response.arrayBuffer(),expected=resources.get(new URL(url,self.registration.scope).href);
  if(expected){
   const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',body))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
   if(body.byteLength!==expected.bytes||digest!==expected.sha256)throw Error('资源版本已变化，请联网更新并重新打开游戏：'+new URL(url,self.registration.scope).pathname);
  }
  const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
 }finally{clearTimeout(timeout);}
}
async function inventory(){
 const cache=await caches.open(CACHE),keys=new Set((await cache.keys()).map(request=>request.url));
 let completed=0,bytes=0;
 for(const [url,file] of resources)if(keys.has(url)){completed++;bytes+=file.bytes;}
 const ready=keys.has(READY)&&completed===resources.size;
 return {keys,cache,status:{...current,state:ready?'ready':downloading?'downloading':'idle',completed,bytes}};
}
async function announce(status){
 current=status;
 for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({type:'OFFLINE_PROGRESS',...status});
}
self.addEventListener('install',event=>{
 // No automatic skipWaiting: an in-progress game keeps its current build.
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.all([...MANIFEST.shell,'/offline-assets.json'].map(async url=>cache.put(url,await fetchResource(url))));
 })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const currentCache=await caches.open(CACHE);
 for(const name of await caches.keys())if(name.startsWith('arcane-arena-')&&name!==CACHE){
  // Preserve immutable old chunks for another open tab; replace the bulky resource cache.
  const oldCache=await caches.open(name);
  for(const request of await oldCache.keys())if(new URL(request.url).pathname.startsWith('/assets/')){
   if(!await currentCache.match(request)){const response=await oldCache.match(request);if(response)await currentCache.put(request,response);}
  }
  await caches.delete(name);
 }
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 const key=request.mode==='navigate'?new URL('/index.html',self.registration.scope).href:url.origin+url.pathname;
 if(!resources.has(key)&&url.pathname!=='/offline-assets.json'&&!url.pathname.startsWith('/assets/'))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),cached=await cache.match(key);
  if(cached)return cached;
  const response=await fetchResource(key);
  // Opportunistic caching is best effort; quota failures must not break online play.
  if(response.ok){try{await cache.put(key,response.clone());}catch{}}
  return response;
 })());
});
async function download(){
 const {cache,keys,status}=await inventory();
 let completed=status.completed,bytes=status.bytes,next=0,failure=null,lastProgress=0;
 const pending=[...resources].filter(([url])=>!keys.has(url));
 await cache.delete(READY);
 await announce({...status,state:'downloading',error:undefined});
 await Promise.all(Array.from({length:6},async()=>{
  while(next<pending.length&&!failure){
   const [url,file]=pending[next++];
   try{
    await cache.put(url,await fetchResource(url));completed++;bytes+=file.bytes;
    if(Date.now()-lastProgress>180){lastProgress=Date.now();await announce({...current,state:'downloading',completed,bytes});}
   }catch(error){failure=error;}
  }
 }));
 if(failure){
  await announce({...current,state:'error',completed,bytes,error:failure.name==='QuotaExceededError'?'设备空间不足，请释放空间后重试。':String(failure.message||failure)});
  return;
 }
 await cache.put(READY,new Response(MANIFEST.version));
 await announce({...current,state:'ready',completed,bytes,error:undefined});
}
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING'){event.waitUntil(self.skipWaiting());return;}
 if(event.data?.type==='OFFLINE_STATUS'){
  event.waitUntil(inventory().then(({status})=>event.ports[0]?.postMessage({...status,...(current.state==='error'&&status.state!=='ready'?{state:'error',error:current.error}:{})})));return;
 }
 if(event.data?.type==='DOWNLOAD_OFFLINE'){
  if(!downloading)downloading=download().catch(error=>announce({...current,state:'error',error:String(error.message||error)})).finally(()=>{downloading=null;});
  event.waitUntil(downloading);
 }
});
