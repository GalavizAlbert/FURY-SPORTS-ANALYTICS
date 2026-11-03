/* FURY PWA: network-first documents; static same-origin cache only. Never cache API/auth responses. */
const CACHE='fury-pwa-shell-v2';
const SHELL=['./index.html','./analytics.html','./manifest.webmanifest','./pwa-register.js','./favicon.ico','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('fury-pwa-shell-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()]))});
self.addEventListener('fetch',event=>{
 const r=event.request;if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;
 const u=new URL(r.url);if(u.pathname.includes('/auth')||u.pathname.includes('/api/')||u.pathname.includes('supabase')||r.headers.has('authorization'))return;
 if(r.mode==='navigate'){event.respondWith(fetch(r).catch(()=>caches.match(u.pathname.endsWith('analytics.html')?'./analytics.html':'./index.html')));return}
 const path=u.pathname.split('/').pop();if(!['favicon.ico','pwa-register.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png'].includes(path))return;
 event.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy))}return res})))
});