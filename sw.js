const VERSION='fuse-prep-v3-20261020';
const FILES=['./','./index.html','./app.js','./core.mjs','./styles.css','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./icon-apple.png','./SETUP.html'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('fuse-prep-')&&k!==VERSION).map(k=>caches.delete(k)))),self.clients.claim()]));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  // Network first for page/scripts so fixes deploy without a stale service-worker cache.
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(VERSION).then(c=>c.put(event.request,copy));}
    return response;
  }).catch(()=>caches.match(event.request)));
});
