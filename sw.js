'use strict';
const CACHE='homelab-power-shell-v3-pro';
const FILES=['./','./index.html','./styles.css','./math.js','./regions.js','./csv.js','./theme.js','./app.js','./entitlement.js','./pro-core.js','./pro.js','./pwa.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('homelab-power-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(caches.match(new URL('./index.html',self.registration.scope)).then(hit=>hit||fetch(event.request)));return;}event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));});
