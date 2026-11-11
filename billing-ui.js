/* Google Play purchase buttons for the Android app. Only does anything when native-bridge.js
 * has exposed window.NativeBilling, so the web build keeps its testing preview unchanged. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.PowerBilling=api;api.start(root);}})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PRO='pro_unlock',TIPS=['tip_small','tip_medium','tip_large'];
const TIP_NAMES=['Small tip','A little extra','Big thanks'];

function view(state){
 const s=state||{},prices=s.prices||{},ready=s.status==='ready',price=prices[PRO];
 let status;
 if(s.status==='connecting'||!s.status)status='Checking Google Play…';
 else if(!ready){status=s.message||'Google Play isn’t available here, so purchases can’t be made or checked right now.';if(s.pro&&s.source==='cache')status+=' You can still use Pro based on the last time Google Play checked your purchase.';}
 else if(s.pro)status='Pro is yours for good. Thanks for buying it.';
 else if(s.proPending)status='Your payment is still going through. Pro will be ready when Google Play confirms it.';
 else if(!price)status='Pro isn’t on sale in Google Play yet. The free calculator is ready to use.';
 else status='Pay once for Pro. The free calculator stays free.';
 if(ready&&s.message)status+=' '+s.message;
 const pending=Array.isArray(s.pendingTips)?s.pendingTips:[];
 return {
  pro:s.pro===true,supporter:false,status,
  proLabel:s.pro?'Pro is yours':s.proPending?'Payment pending':price?`Get Pro (${price})`:'Get Pro',
  proDisabled:!!(s.pro||s.proPending||!ready||!price),
  tips:TIPS.map((id,i)=>({id,label:pending.includes(id)?'Tip pending':prices[id]?`${TIP_NAMES[i]} (${prices[id]})`:TIP_NAMES[i],disabled:!ready||!prices[id]||pending.includes(id)}))
 };
}

function outcomeMessage(result,productId){
 const r=result||{};
 switch(r.outcome){
  case 'purchased':return TIPS.includes(productId)?'Thanks for the tip. It means a lot!':'Pro is yours. Thanks for supporting the app!';
  case 'pending':return 'Payment pending. We’ll pick it up when Google Play confirms it, even if you close the app.';
  case 'cancelled':return 'No problem. Nothing was charged.';
  case 'owned':return 'You already own this, so it’s been restored.';
  default:return r.reason||'Google Play couldn’t finish that. Try again in a bit.';
 }
}

function restoreMessage(state){
 const s=state||{};
 if(s.status!=='ready')return s.message||'Couldn’t reach Google Play to check your purchases. Try again later.';
 if(s.pro)return 'Restored. Pro is ready to use.';
 if(s.pendingTips&&s.pendingTips.length)return 'Your tip payment is still pending with Google Play.';
 if(s.message)return s.message;
 if(s.proPending)return 'Your Pro payment is still pending with Google Play.';
 return 'No purchases found on this Google account.';
}

const CSS='.billing-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 14px}.billing-bar button{flex:1 1 9rem;min-width:0;white-space:normal}.billing-bar button[disabled]{opacity:.6;cursor:default}.billing-status{margin:0 0 14px}.supporter-badge{font-size:12px;font-weight:700;color:var(--accent);border:1px solid currentColor;border-radius:30px;padding:3px 10px;white-space:nowrap}';

function barHtml(){
 return '<button id="buyPro" type="button">Get Pro</button><button id="tip_small" type="button" class="secondary">Small tip</button><button id="tip_medium" type="button" class="secondary">A little extra</button><button id="tip_large" type="button" class="secondary">Big thanks</button><button id="restorePurchases" type="button" class="quiet">Restore purchases</button><span id="supporterBadge" class="supporter-badge" hidden>Supporter</span>';
}

function start(win){
 const doc=win&&win.document,native=win&&win.NativeBilling;
 if(!doc||!native||!native.getState)return;
 const E=win.PowerEntitlement;
 if(!E||!E.setStore)return;
 E.setStore(E.usesStore&&E.usesStore()?{pro:E.hasPro(),supporter:E.isSupporter()}:{pro:false,supporter:false});
 if(!doc.getElementById('billingStyle')){const style=doc.createElement('style');style.id='billingStyle';style.textContent=CSS;doc.head.appendChild(style);}
 const toggle=doc.getElementById('previewPro');if(toggle&&toggle.closest('label'))toggle.closest('label').hidden=true;
 const profile=doc.getElementById('profileCard');
 const support=doc.getElementById('supportCard');
 if(profile){
  const step=profile.querySelector('.step');if(step)step.textContent='PRO · PAY ONCE';
  const disclosure=profile.querySelector('.pro-disclosure');if(disclosure)disclosure.textContent='Buy Pro once through Google Play. Your setups stay on this phone, with room for 20 labs and 100 devices per lab.';
  doc.querySelectorAll('.pro-lock').forEach(el=>{el.textContent=profile.contains(el)?'Named labs, comparisons, CSV import, and a printable report come with Pro. The calculator itself stays free.':'This is part of Pro. Get Pro is up with your labs.';});
 }
 const whatIf=doc.getElementById('whatIfLock');
 if(whatIf)whatIf.textContent='Trying a swap in a second build is part of Pro. Get Pro in Settings if you want to do that. The ranking stays visible either way, and this build is left as it is.';
 const upsell=doc.getElementById('proUpsell');
 if(upsell)upsell.textContent='More than one saved build, your own parts, a side-by-side compare, and a PNG or CSV of the rack are part of Pro. Get Pro in Settings. The build you already have stays either way.';
 const palette=doc.getElementById('paletteUpsell');
 if(palette&&support)palette.textContent='Nordic Server and Amber Terminal come with Pro. Get Pro in the section below if you want them. Until then the page stays on Homelab Green, and the pick is not forgotten.';
 const hosts=[];
 if(support){support.hidden=false;const mount=doc.getElementById('supportMount')||support;hosts.push(mount);}
 if(profile)hosts.push(profile);
 if(!hosts.length){wire(win,doc,native,E,null);return;}
 hosts.forEach(host=>{
  if(host.querySelector('.billing-bar'))return;
  const bar=doc.createElement('div');bar.className='billing-bar';bar.innerHTML=barHtml();
  const status=doc.createElement('p');status.className='help billing-status';status.setAttribute('role','status');
  if(!doc.getElementById('billingBar')){bar.id='billingBar';status.id='billingStatus';}
  const heading=host.querySelector('.section-heading')||host.querySelector('h2');
  if(heading&&host===profile)heading.after(bar,status);else host.append(bar,status);
 });
 wire(win,doc,native,E,true);
}

function wire(win,doc,native,E,hasBar){
 const $=id=>doc.getElementById(id);
 let current={status:'connecting'},busy=false;
 const toast=text=>{const A=win.PowerApp;if(A&&A.toast)A.toast(text);else{const status=$('billingStatus');if(status)status.textContent=text;}};
 function paint(){
  if(!hasBar)return;
  const v=view(current);
  doc.querySelectorAll('#buyPro').forEach(button=>{button.textContent=v.proLabel;button.disabled=busy||v.proDisabled;});
  v.tips.forEach(t=>{doc.querySelectorAll('#'+t.id).forEach(button=>{button.textContent=t.label;button.disabled=busy||t.disabled;});});
  doc.querySelectorAll('#restorePurchases').forEach(button=>{button.disabled=busy;});
  doc.querySelectorAll('#supporterBadge').forEach(badge=>{badge.hidden=!v.supporter;});
  const status=$('billingStatus');if(status)status.textContent=v.status;
  doc.body.classList.toggle('is-supporter',v.supporter);
 }
 function remember(next){
  try{
   if(next&&next.pro===true)localStorage.setItem('homelab-power-pro','true');
   else localStorage.removeItem('homelab-power-pro');
  }catch(e){}
  if(win.HomelabTheme&&win.HomelabTheme.apply)win.HomelabTheme.apply();
 }
 function apply(next){
  if(!next||typeof next!=='object')return;
  const had=E.hasPro();
  current=next;
  E.setStore({pro:next.pro===true,supporter:next.supporter===true});
  remember(next);
  paint();
  if(had!==E.hasPro())win.dispatchEvent(new win.Event('power:entitlement'));
  else win.dispatchEvent(new win.Event('power:pro'));
 }
 async function run(fn){if(busy)return;busy=true;paint();try{return await fn();}finally{busy=false;paint();}}
 async function buy(productId){
  await run(async()=>{
   let result;
   try{result=await native.purchase(productId);}catch(e){result={outcome:'error'};}
   apply(result&&result.status?result:current);
   toast(outcomeMessage(result,productId));
  });
 }
 if(hasBar){
  doc.querySelectorAll('#buyPro').forEach(button=>button.addEventListener('click',()=>buy(PRO)));
  TIPS.forEach(id=>doc.querySelectorAll('#'+id).forEach(button=>button.addEventListener('click',()=>buy(id))));
  doc.querySelectorAll('#restorePurchases').forEach(button=>button.addEventListener('click',()=>run(async()=>{
   let s;
   try{s=await native.restore();}catch(e){s={status:'error',message:'Couldn’t reach Google Play to check your purchases. Try again later.'};}
   apply(s);
   toast(restoreMessage(s));
  })));
  paint();
 }
 try{native.onUpdate(apply);}catch(e){}
 Promise.resolve().then(()=>native.getState()).then(apply,()=>apply({status:'unavailable',message:'Google Play billing isn’t available on this device.'}));
}

return {view,outcomeMessage,restoreMessage,start,PRO,TIPS};
});
