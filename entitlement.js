/* Local preview seam only. No purchase, price, token, or Billing implementation. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PowerEntitlement=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 let preview=false,provider=()=>false;
 return {hasPro:()=>preview||provider()===true,setPreview:value=>{preview=value===true;},isPreview:()=>preview,setProvider:fn=>{if(typeof fn!=='function')throw Error('An entitlement provider must be a function.');provider=fn;}};
});
