'use strict';
function nativeApp(){
 try{
  if(window.Capacitor?.isNativePlatform?.())return true;
  const protocol=location.protocol;
  return protocol==='capacitor:'||protocol==='ionic:';
 }catch{return false;}
}
// The Capacitor WebView already has the files on disk. A service worker there only gets in the way.
if('serviceWorker' in navigator&&window.isSecureContext&&!nativeApp()){
 window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js').catch(()=>{/* Offline first visit or disabled workers: the calculator still works. */});});
}
// Android's back control should close an open dialog before it leaves the page.
(function(){
 if(typeof HTMLDialogElement==='undefined')return;
 let fromBack=false;
 const openModal=HTMLDialogElement.prototype.showModal;
 HTMLDialogElement.prototype.showModal=function(){
  if(!this.open){
   try{history.pushState({hlDialog:1},'');}catch{}
   this.dataset.hlPushed='1';
  }
  return openModal.apply(this,arguments);
 };
 window.addEventListener('popstate',()=>{
  const dialog=document.querySelector('dialog[open]');
  if(!dialog)return;
  fromBack=true;
  dialog.close();
  fromBack=false;
 });
 document.addEventListener('close',event=>{
  const dialog=event.target;
  if(!(dialog instanceof HTMLDialogElement)||dialog.dataset.hlPushed!=='1')return;
  dialog.dataset.hlPushed='';
  if(fromBack)return;
  if(history.state&&history.state.hlDialog){try{history.back();}catch{}}
 },true);
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 document.addEventListener('focusin',event=>{
  const el=event.target;
  if(!(el instanceof HTMLElement)||!el.matches('input,select,textarea'))return;
  setTimeout(()=>{
   const nav=document.querySelector('.sitenav');
   const fixed=nav&&getComputedStyle(nav).position==='fixed';
   const limit=fixed?nav.getBoundingClientRect().top:innerHeight;
   const rect=el.getBoundingClientRect();
   if(rect.bottom>limit-8||rect.top<0)el.scrollIntoView({block:'center',behavior:reduce?'auto':'smooth'});
  },250);
 });
})();
