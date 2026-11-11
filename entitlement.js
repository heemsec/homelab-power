/* Who has Pro. On the web or the installed page, a local testing preview (or a provider) decides.
 * Inside the Android app, Google Play's answer from the native PlayBilling plugin decides,
 * and the testing preview is ignored. No prices, tokens, or purchase logic live here. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(root);else root.PowerEntitlement=factory(root);})(typeof globalThis!=='undefined'?globalThis:this,function(root){
 let preview=false,provider=()=>false;
 // native-bridge.js runs before this file, so store mode is on before any Pro check happens.
 let store=root&&root.NativeBilling?{pro:false,supporter:false}:null;
 return {
  hasPro:()=>store?store.pro===true:(preview||provider()===true),
  setPreview:value=>{preview=value===true;},
  isPreview:()=>store?false:preview,
  setProvider:fn=>{if(typeof fn!=='function')throw Error('An entitlement provider must be a function.');provider=fn;},
  setStore:s=>{store=s?{pro:s.pro===true,supporter:s.supporter===true}:null;},
  usesStore:()=>store!==null,
  isSupporter:()=>store?store.supporter===true:false
 };
});
