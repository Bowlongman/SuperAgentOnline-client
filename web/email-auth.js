const labels={login:'邮箱验证码登录',register:'邮箱注册',bind:'绑定邮箱'};
const errorText={
 EMAIL_AUTH_DISABLED:'邮箱验证暂未开放。',
 EMAIL_SEND_FAILED:'暂时无法发送验证码，请稍后重试。',
 EMAIL_CODE_INVALID:'验证码不正确、已过期或已使用。请检查后重试。',
 EMAIL_AUTH_INPUT_INVALID:'请检查邮箱、账户昵称和验证码格式。',
 EMAIL_ALREADY_BOUND:'该邮箱已绑定账户。',
 EMAIL_LOGIN_TAKEN:'账户昵称已被使用，请更换后重试。',
 EMAIL_NOT_REGISTERED:'该邮箱尚未注册，请先注册。',
 EMAIL_REGISTRATION_REQUIRED:'请先完成邮箱注册。'
};
async function authRequest(path,body,key){
 const response=await fetch('/api/auth/'+path,{method:body?'POST':'GET',headers:{
  ...(body?{'Content-Type':'application/json'}:{}),...(key?{Authorization:'Bearer '+key}:{})
 },body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(errorText[data.error]||'邮箱验证暂时无法完成，请检查输入后重试。'),{
  status:response.status,code:data.error,retry:Number(data.retry_after_seconds)||Math.ceil(Number(data.retry_after_ms)/1000)||0
 });
 return data;
}
export function revokeEmailSession(key){if(key)void authRequest('logout',{},key).catch(()=>{})}
export async function installEmailAuth({getAccount,onSignedIn,onBound}){
 const config=await authRequest('config').catch(()=>null);
 if(!config?.email_enabled)return;
 const triggers=[...document.querySelectorAll('[data-email-auth]')];
 const dialog=document.createElement('dialog');
 dialog.className='email-auth-dialog';dialog.setAttribute('aria-labelledby','email-auth-title');
 dialog.innerHTML=`<div class="email-auth-heading"><h2 id="email-auth-title"></h2><button type="button" class="email-auth-close" aria-label="关闭">×</button></div>
 <p class="email-auth-current" hidden></p>
 <form class="email-auth-form">
  <p>验证码在 5 分钟内有效。请在邮箱中查看邮件，并手动输入验证码。</p>
  <label>邮箱地址<input name="email" type="email" maxlength="254" autocomplete="email" required></label>
  <label class="email-auth-login" hidden>账户昵称<input name="login" maxlength="40" autocomplete="username"></label>
  <div class="email-auth-actions"><button type="button" class="email-auth-send">发送验证码</button></div>
  <label>验证码<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required disabled></label>
  <div class="email-auth-actions"><button type="submit" class="primary email-auth-verify" disabled>验证</button></div>
 </form><p class="email-auth-status" role="status"></p>`;
 document.body.append(dialog);
 const $=selector=>dialog.querySelector(selector),form=$('form'),{email,login,code}=form.elements;
 const send=$('.email-auth-send'),verify=$('.email-auth-verify'),close=$('.email-auth-close'),feedback=$('.email-auth-status');
 const cooldowns=new Map();
 let purpose,key,challenge=null,expiresAt=0,pending=null,blocked=false,epoch=0,timer;
 function status(text,error=false){feedback.textContent=text;feedback.classList.toggle('error',error)}
 function cooldownKey(){return purpose+':'+email.value.trim().toLowerCase()}
 function clearChallenge(){challenge=null;expiresAt=0;code.value=''}
 function refresh(){
  const now=Date.now(),deadline=cooldowns.get(cooldownKey())||0,wait=Math.max(0,Math.ceil((deadline-now)/1000));
  if(!wait)cooldowns.delete(cooldownKey());
  if(challenge&&now>=expiresAt){clearChallenge();status('验证码已过期，请重新发送。',true)}
  email.disabled=!!pending;login.disabled=purpose!=='register'||!!pending;
  code.disabled=!challenge||!!pending;
  send.disabled=!!pending||blocked||wait>0;
  send.textContent=wait?wait+' 秒后可重发':challenge?'重新发送验证码':'发送验证码';
  verify.disabled=!challenge||!!pending||blocked;
  close.disabled=pending==='verify';
 }
 function recover(error){
  if(error.status===429){
   const wait=error.retry||60;
   cooldowns.set(cooldownKey(),Date.now()+wait*1000);
   status('操作过于频繁，请稍后再试。',true);
  }else status(error.message,true);
 }
 async function open(mode){
  const generation=++epoch;
  key=mode==='bind'?getAccount():null;
  if(mode==='bind'&&!key)return;
  purpose=mode;pending=mode==='bind'?'status':null;blocked=false;
  form.reset();clearChallenge();status('');
  $('.email-auth-current').hidden=true;
  form.hidden=false;
  $('#email-auth-title').textContent=labels[mode];
  $('.email-auth-login').hidden=mode!=='register';login.required=mode==='register';
  verify.textContent=mode==='bind'?'确认绑定':mode==='register'?'验证并注册':'验证并登录';
  refresh();dialog.showModal();timer=setInterval(refresh,250);
  if(mode!=='bind')return;
  try{
   const result=await authRequest('email/status',undefined,key);
   if(generation!==epoch)return;
   if(result.email){
    const current=$('.email-auth-current');
    current.textContent='已绑定邮箱：'+result.email;current.hidden=false;
    form.hidden=true;blocked=true;
   }
  }catch(error){if(generation===epoch)recover(error)}
  finally{if(generation===epoch){pending=null;refresh()}}
 }
 for(const trigger of triggers){
  trigger.hidden=false;
  trigger.addEventListener('click',()=>open(trigger.dataset.emailAuth));
 }
 close.onclick=()=>dialog.close();
 dialog.addEventListener('cancel',event=>{if(pending==='verify')event.preventDefault()});
 dialog.addEventListener('close',()=>{
  ++epoch;clearInterval(timer);clearChallenge();form.reset();pending=null;
 });
 email.addEventListener('input',()=>{clearChallenge();status('');refresh()});
 send.onclick=async()=>{
  if(send.disabled||!email.reportValidity())return;
  const generation=epoch,address=email.value.trim(),rateKey=cooldownKey();
  pending='send';refresh();status('正在请求发送验证码…');
  try{
   const data=await authRequest('email/send',{email:address,purpose},key);
   cooldowns.set(rateKey,Date.now()+(Number(data.retry_after_seconds)||60)*1000);
   if(generation!==epoch)return;
   clearChallenge();challenge=data.challenge_id;
   expiresAt=Date.now()+(Number(data.expires_in_seconds)||300)*1000;
   status('如果此邮箱可以用于该操作，验证码将发到你的邮箱。');
  }catch(error){if(generation===epoch)recover(error)}
  finally{if(generation===epoch){pending=null;refresh();if(challenge)code.focus()}}
 };
 form.addEventListener('submit',async event=>{
  event.preventDefault();refresh();
  if(verify.disabled||!form.reportValidity())return;
  const request={challenge_id:challenge,code:code.value};
  if(purpose==='register')request.login=login.value.trim();
  const binding=purpose==='bind',account=key;
  pending='verify';refresh();status('正在验证…');
  try{
   const result=await authRequest('email/verify',request,account);
   if(binding){if(account===getAccount())onBound(result)}
   else if(result.account_token)onSignedIn(result);
   else throw new Error('暂时无法完成登录，请重试。');
   dialog.close();
  }catch(error){recover(error);code.value=''}
  finally{pending=null;refresh()}
 });
}
