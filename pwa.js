'use strict';
// Registration is local to this origin. Native Android bundles already work offline.
if('serviceWorker' in navigator&&window.isSecureContext&&!window.Capacitor?.isNativePlatform?.()){
 window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{/* Offline first visit or disabled workers: the calculator still works. */});});
}
