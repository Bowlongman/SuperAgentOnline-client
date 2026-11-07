import {worldCamera} from '/world-camera.js';
const $=selector=>document.querySelector(selector);
const renderCamera=worldCamera($('#world-camera'));
let token=sessionStorage.getItem('sao-token'),snap,build,busy=false;
let accountKey=sessionStorage.getItem('sao-account'),playerSystem,avatarReady,characterCount=0;
let rosterData=null,editingCharacter=null,lastRosterPoll=0;
let chatKey=null,chatCursor,chatPolling=false,chatSending=false,chatDraft=null,chatGeneration=0;
const chatRows=new Map();
let previewId=null, previewEpoch=0, previewPlay,previewModel,previewFromQuery;
function closePreview(){
  previewEpoch++;previewId=null;previewPlay?.dispose();previewPlay=null;
  $('#remote').hidden=true;
}
$('#remote-close').onclick=closePreview;
async function previewPlayer(actor,fromQuery=false){
  closePreview();previewId=actor.id;previewModel=actor.model;previewFromQuery=fromQuery;
  const epoch=previewEpoch;
  const canvas=$('#remote-avatar').cloneNode();$('#remote-avatar').replaceWith(canvas);
  $('#remote').hidden=false;$('#remote-name').textContent=actor.name+' · 模型预览';
  try{
    const module=await import('/avatar.js');
    if(epoch!==previewEpoch)return;
    const play=await module.createAvatar(canvas,actor);
    if(epoch!==previewEpoch){play.dispose();return;}
    previewPlay=play;play(actor.state==='moving'?performance.now()+actor.remaining_ms:0);
  }catch(e){if(epoch===previewEpoch){closePreview();$('output').textContent='模型加载失败';}}
}
function showEntry(){
  $('#account').hidden=!playerSystem||!!token||!!accountKey;
  $('#auth-intro').hidden=!playerSystem||!!token||!!accountKey;
  $('#roster').hidden=!playerSystem||!!token||!accountKey;
  $('#join').hidden=!!token||(!!playerSystem&&(!accountKey||characterCount>=5));
  $('#new-appearance').hidden=!playerSystem;
  $('#game').hidden=!token;
  $('#enter').textContent=playerSystem?'创建角色':'进入世界';
}
async function api(path,body,key=token){
  const response=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:body&&JSON.stringify(body)});
  const data=await response.json();

  if(!response.ok){if(data.snapshot&&token&&key===token)render(data.snapshot);if(response.status===401&&path==='/api/observe'){sessionStorage.removeItem('sao-token');token=null;snap=null;$('#join').hidden=false;$('#game').hidden=true;}throw Object.assign(Error(data.error),{status:response.status,retry_after_ms:data.retry_after_ms});}
  return data;
}
function showWithdrawal(button,id,key){
  button.hidden=!id;
  button.onclick=async()=>{
    try{
      await api('/api/appearance/withdraw',{request_id:id},key);
      button.hidden=true;
      if(token)render(await api('/api/observe'));
      else if(accountKey)await refreshRoster();
      $('output').textContent='已撤销待审外观';
    }catch(error){$('output').textContent=error.message;}
  };
}
function render(s){
  if(snap&&s.snapshot_revision<snap.snapshot_revision)return;
  if(s.feedback)document.querySelector("output").textContent=s.feedback;
  if(snap&&(snap.character.model!==s.character.model||JSON.stringify(snap.character.actions)!==JSON.stringify(s.character.actions))&&avatarReady){location.reload();return;}
  if(chatKey!==token)resetChat(token);
  snap=s;$('#auth-intro').hidden=true;$('#game').hidden=false;$('#join').hidden=true;
  renderCamera(s);
  const p=s.world.perceived,[x,z]=p.position;
  $('#account').hidden=true;$('#roster').hidden=true;
  $('#actor').textContent=s.character.name;
  $('#edit-panel').hidden=!s.character.model;
  $('#outfit').hidden=!!s.character.pending_submission;
  showWithdrawal($('#outfit-withdraw'),s.character.pending_submission,token);
  $('#avatar').hidden=!s.character.model;
  $('#pose').textContent=s.character.model?(s.character.model==='traveler'?'旅人 · ':'自定义模型 · ')+(s.character.state==='moving'?'行走':'待机'):'';
  if(s.character.review==='pending')$('#pose').append(' · 上传待审核');
  if(s.character.review==='rejected')$('#pose').append(' · 上传未通过');
  if(s.character.model){
    avatarReady??=import('/avatar.js').then(m=>m.createAvatar($('#avatar'),s.character)).catch(()=>{ $('output').textContent='模型显示不可用，仍可继续移动';return null;});
    const until=s.character.state==='moving'?performance.now()+s.character.remaining_ms:0;
    avatarReady.then(play=>play?.(until));
  }
  $('#weather').textContent=s.world.public.weather;
  $('#info').textContent='位置 ('+x+', '+z+')　高度 '+p.height+' 米';
  const marks=p.landmarks??[];
  if(marks.length)$('#info').append('　附近地点：'+marks.map(m=>m.name+' ('+m.x+', '+m.z+')').join('、'));
  const session=Object.entries(s.character.states??{}).find(([key])=>key!=='abilities')?.[1];
  const labels={rest:'休整中',ability:session?.name+'进行中',npc:'交谈中',shop:'选购中',light:'操作公共灯',vehicle:'驾驶中',route:session?.phase==='node'?'等待路线选择':'寻路移动中'};
  $('#info').append('　'+(s.core?.executions?.some(r=>r.status==='running')?'能力执行中':labels[session?.kind]??'自由活动'));
  if(session?.kind==='ability')$('#info').append('　预计 '+Math.max(0,Math.ceil((session.until-Date.now())/1000))+' 秒后完成');
  for(const attribute of s.character.attributes??[]){
    $('#info').append('　'+(attribute.id==='stamina'?'体力':attribute.id)+' '+attribute.value+'/'+attribute.max);
  }
  if(s.core?.feedback?.[0])$('#info').append('　反馈：'+s.core.feedback[0].text);
  for(const attribute of s.core?.attributes??[])$('#info').append('　'+attribute.description+'：'+attribute.value);
  for(const state of s.core?.states??[])$('#info').append('　'+state.description+' ['+state.target+']');
  for(const run of s.core?.executions??[])if(run.status==='running')$('#info').append('　'+run.ability+'：'+run.phase);
  for(const unit of s.core?.units??[])$('#info').append('　'+unit.name+' ('+unit.x+', '+unit.z+') '+unit.attributes.map(a=>a.description+'：'+a.value).join('，'));
  if(s.character.wallet!==undefined)$('#info').append('　余额 '+s.character.wallet+' 币');
  if(s.character.inventory)$('#info').append('　木材 '+(s.character.inventory.wood??0));
  for(const t of [...(p.npcs??[]),...(p.interactables??[])]){
    const value=t.kind==='shop'?'库存 '+t.stock:t.kind==='vehicle'?'能量 '+t.energy:t.kind==='light'?t.state:'';
    $('#info').append('　'+t.name+' ('+t.x+', '+t.z+') '+value);
  }
  for(const ability of s.character.abilities??[]){
    if(ability.remaining_ms>0)$('#info').append('　'+ability.name+'冷却 '+Math.ceil(ability.remaining_ms/1000)+' 秒');
  }
  const order=s.character.delivery;
  if(order){
    const pickup=order.phase==='pickup',point=pickup?order.pickup:order.dropoff;
    $('#info').append('　外卖：'+order.meal+' · '+(pickup?'请取餐':'请送达')+' '+point.name+' ('+point.x+', '+point.z+') · 报酬 '+order.reward+' 币');
  }
  const logout=s.character.last_logout;
  if(logout)$('#info').append('　上次下线 ('+logout.x+', '+logout.z+')');
  const summary=p.unit_summary;$('#perception-summary').textContent=summary?'场景 '+s.world.public.sensing.terrain+' 米 · 已感知 '+summary.total+' 个单位，详情 '+summary.detailed+'/'+summary.limit+'。可展开查询更多；能看见不代表可交互。':'';
  $('#near').replaceChildren('附近玩家与单位：'+(p.players.length?'':'暂无'));
  for(const actor of [...p.players,...(s.core?.units??[]).filter(u=>u.type!=='player')]){
    if(!actor.model){$('#near').append(actor.name+' ');continue;}
    const button=document.createElement('button');button.textContent=actor.name;button.title='预览外观';
    button.onclick=()=>previewPlayer(actor);$('#near').append(button);
  }
  if(previewId&&!previewFromQuery){
    const actor=[...p.players,...(s.core?.units??[])].find(a=>a.id===previewId);
    if(!actor)closePreview();
    else if(previewModel!==actor.model)previewPlayer(actor);
    else previewPlay?.(actor.state==='moving'?performance.now()+actor.remaining_ms:0);
  }
  $('#options').replaceChildren(...s.options.map(option=>{const btn=document.createElement('button');btn.textContent=option.description;
    btn.onclick=()=>{clearMovementKeys();performDecision(option);};return btn;}));
}
async function performDecision(option){
  if(busy||!token||!snap)return false;
  const {description,...action}=option;
  const current=snap.options.find(o=>Object.keys(action).every(k=>o[k]===action[k])&&Object.keys(o).every(k=>k==='description'||Object.hasOwn(action,k)));
  if(!current)return false;
  const state=snap,key=token;busy=true;
  try{
    const result=await api('/api/act',{...action,decision_id:crypto.randomUUID(),origin:state.world.perceived.position,decision_revision:state.decision_revision,rules_version:state.rules_version},key);
    if(token===key){render(result.snapshot);$('output').textContent=result.feedback;}
    return true;
  }catch(e){if(token===key)$('output').textContent=e.message;clearMovementKeys();return false;}
  finally{busy=false;}
}
const movementKeys=new Map(),keyDirections={KeyW:'north',KeyA:'west',KeyS:'south',KeyD:'east'};
let lastKeyboardMove=-Infinity;
function clearMovementKeys(){movementKeys.clear();}
function isTyping(element){return element instanceof Element&&(element.isContentEditable||!!element.closest('input,textarea,select,[role="textbox"]'));}
function keyboardMove(){
  if(!movementKeys.size||busy||!token||!snap||document.hidden||$('#game').hidden||isTyping(document.activeElement))return;
  if(performance.now()-lastKeyboardMove<350)return;
  const direction=[...movementKeys.values()].at(-1),option=snap.options.find(o=>o.action==='move'&&o.direction===direction);
  if(!option){$('#keyboard-status').textContent='当前方向不可通行，或当前状态不允许步行。';return;}
  $('#keyboard-status').textContent='';lastKeyboardMove=performance.now();performDecision(option);
}
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing){clearMovementKeys();return;}
  const direction=keyDirections[event.code];
  if(!direction||!token||!snap||$('#game').hidden||isTyping(event.target)||event.defaultPrevented)return;
  event.preventDefault();
  if(!movementKeys.has(event.code)){movementKeys.set(event.code,direction);keyboardMove();}
});
document.addEventListener('keyup',event=>movementKeys.delete(event.code));
document.addEventListener('focusin',event=>{if(isTyping(event.target))clearMovementKeys();});
window.addEventListener('blur',clearMovementKeys);
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearMovementKeys();});
setInterval(keyboardMove,50);

function resetChat(key=null){
  renderCamera.clearSpeech();
  chatKey=key;chatCursor=undefined;chatGeneration++;chatRows.clear();chatDraft=null;
  $('#chat-messages').replaceChildren();$('#chat-input').value='';$('#chat-count').textContent='0/500';$('#chat-status').textContent='';
}
function appendChat(messages){
  const list=$('#chat-messages'),atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<60;
  for(const message of messages){
    if(chatRows.has(message.seq))continue;
    const row=document.createElement('div');row.className='chat-message';row.dataset.seq=message.seq;
    const meta=document.createElement('div');meta.className='chat-meta';
    const name=document.createElement('strong');name.textContent=message.sender_name;
    const time=document.createElement('time');time.dateTime=new Date(message.created_at).toISOString();time.textContent=new Date(message.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    const text=document.createElement('p');text.textContent=message.text;
    meta.append(name,time);row.append(meta,text);chatRows.set(message.seq,row);
    const next=[...list.children].find(node=>Number(node.dataset.seq)>message.seq);list.insertBefore(row,next??null);
  }
  while(list.children.length>200){chatRows.delete(Number(list.firstElementChild.dataset.seq));list.firstElementChild.remove();}
  if(atBottom)list.scrollTop=list.scrollHeight;
}
async function pollChat(){
  if(chatPolling||!token||document.hidden||$('#game').hidden)return;
  if(chatKey!==token)resetChat(token);
  const key=token,generation=chatGeneration;chatPolling=true;
  try{
    const data=await api('/api/chat'+(chatCursor===undefined?'':'?after='+chatCursor),undefined,key);
    if(token===key&&chatGeneration===generation){appendChat(data.messages);chatCursor=data.next_cursor;if($('#chat-status').dataset.readError){$('#chat-status').textContent='';delete $('#chat-status').dataset.readError;}}
  }catch(e){if(token===key&&chatGeneration===generation){$('#chat-status').textContent='聊天连接暂不可用：'+e.message;$('#chat-status').dataset.readError='true';}}
  finally{chatPolling=false;}
}
$('#chat-input').addEventListener('input',()=>{$('#chat-count').textContent=$('#chat-input').value.length+'/500';});
$('#chat-input').addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();$('#chat-form').requestSubmit();}
});
$('#chat-form').onsubmit=async event=>{
  event.preventDefault();if(chatSending||!token)return;
  const input=$('#chat-input'),text=input.value.trim(),key=token,generation=chatGeneration;
  if(!text){$('#chat-status').textContent='请输入聊天内容';return;}
  if(!chatDraft||chatDraft.text!==text||chatDraft.key!==key)chatDraft={key,text,message_id:crypto.randomUUID()};
  const request=chatDraft;chatSending=true;$('#chat-send').disabled=true;
  try{
    const result=await api('/api/chat',{text:request.text,message_id:request.message_id},key);
    if(token!==key||chatGeneration!==generation)return;
    appendChat([result.message]);renderCamera.speak({...result.message,remaining_ms:result.bubble_ms});chatDraft=null;
    if(input.value.trim()===text){input.value='';$('#chat-count').textContent='0/500';}
    $('#chat-status').textContent='已发送';delete $('#chat-status').dataset.readError;input.focus();
  }catch(e){if(token===key&&chatGeneration===generation)$('#chat-status').textContent=e.retry_after_ms?'发送太快，请稍等 '+Math.ceil(e.retry_after_ms/1000)+' 秒后重试。':e.message+'。可再次点击发送重试。';}
  finally{chatSending=false;$('#chat-send').disabled=false;}
};
setInterval(pollChat,1000);
function appearanceFields(container,editing){
  const fragment=$('#appearance-fields').content.cloneNode(true);
  for(const input of fragment.querySelectorAll('input[type=file]')){
    if(editing){
      input.closest('label').querySelector('small').textContent='不选文件则保留当前设置';
      const reset=document.createElement('input');reset.type='checkbox';reset.name='reset_'+input.name;
      const label=document.createElement('label');label.className='reset-choice';label.append(reset,'恢复系统预设');input.closest('label').after(label);
      reset.onchange=()=>{if(reset.checked)input.value='';};input.onchange=()=>{if(input.files.length)reset.checked=false;};
    }
  }
  if(container.tagName==='DETAILS')container.append(fragment);else container.prepend(fragment);
}
appearanceFields($('#new-appearance'),false);appearanceFields($('#roster-outfit'),true);appearanceFields($('#outfit'),true);
const reviewLabel={pending:'外观待审核',approved:'外观已发布',rejected:'外观未通过审核',preset:'系统预设',withdrawn:'已撤销外观申请',superseded:'系统预设'};
function updateRosterEditor(){
  const character=rosterData?.characters.find(c=>c.id===editingCharacter);
  $('#roster-editor').hidden=!character;
  if(!character)return;
  $('#roster-editor-title').textContent='更换「'+character.name+'」的模型与动作';
  $('#roster-editor-status').textContent=(reviewLabel[character.review]??'当前外观')+' · '+(character.model==='traveler'?'系统旅人':'自定义模型');
  const locked=!!rosterData.pending_submission;
  for(const el of $('#roster-outfit').elements)if(el.id!=='close-roster-editor')el.disabled=locked;
  if(locked)$('#roster-editor-status').append('。账号已有待审外观，请先撤销或等待审核。');
}
async function refreshRoster(){
  const key=accountKey;if(!key)return;
  const data=await api('/api/account',undefined,key);if(key!==accountKey||token)return;
  const changed=JSON.stringify(data)!==JSON.stringify(rosterData);rosterData=data;characterCount=data.characters.length;
  $('#character-count').textContent='（'+characterCount+'/5）';
  $('#roster-status').textContent=data.pending_submission?'账号有一份外观等待审核；审核期间仍可使用当前外观游玩。':characterCount?'选择角色进入世界，或在这里更换模型与动作。':'还没有角色。在下方创建你的第一个角色。';
  showWithdrawal($('#roster-withdraw'),data.pending_submission,key);
  if(changed)$('#characters').replaceChildren(...data.characters.map(c=>{
    const row=document.createElement('article');row.className='character-card';
    const title=document.createElement('h3');title.textContent=c.name;
    const status=document.createElement('p');status.textContent=(c.model==='traveler'?'系统旅人':'自定义模型')+' · '+(reviewLabel[c.review]??'当前外观');
    const enter=document.createElement('button');enter.textContent='进入世界';enter.onclick=()=>enterCharacter(c.id);
    const edit=document.createElement('button');edit.textContent='更换模型与动作';edit.onclick=()=>{editingCharacter=c.id;$('#roster-outfit').reset();updateRosterEditor();$('#roster-editor').scrollIntoView({block:'nearest',behavior:'smooth'});};
    const remove=document.createElement('button');remove.textContent='删除角色';remove.className='secondary';
    remove.onclick=async()=>{if(busy||!confirm('永久删除角色「'+c.name+'」及其游戏存档？'))return;busy=true;try{await api('/api/character/delete',{character_id:c.id},accountKey);await refreshRoster();}catch(e){$('output').textContent=e.message;}finally{busy=false;}};
    row.append(title,status,enter,edit,remove);return row;
  }));
  updateRosterEditor();showEntry();lastRosterPoll=Date.now();
}
async function enterCharacter(id){
  if(busy)return;busy=true;
  try{const r=await api('/api/character',{character_id:id},accountKey);token=r.token;sessionStorage.setItem('sao-token',token);snap=null;render(r.snapshot);showEntry();}
  catch(e){$('output').textContent=e.message;}finally{busy=false;}
}
$('#join').onsubmit=async event=>{
  event.preventDefault();if(busy)return;busy=true;
  try{
    const fields=new FormData(event.target),name=fields.get('name');
    if(playerSystem){
      const appearance=await readAppearance(fields);
      const r=await api('/api/character/create',{name,...(Object.keys(appearance).length?{appearance}:{})},accountKey);
      event.target.reset();editingCharacter=null;await refreshRoster();
      $('output').textContent=r.request_id?'角色已创建，上传外观待审核。现在可用系统预设进入世界。':'角色已创建，请在上方选择进入世界。';
    }else{const r=await api('/api/join',{name});token=r.token;sessionStorage.setItem('sao-token',token);render(r.snapshot);}
  }catch(e){$('output').textContent=e.message;}finally{busy=false;}
};
$('#account').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;
  try{
    const fields=new FormData(e.target),endpoint=e.submitter?.value??'login';
    const result=await api('/api/'+endpoint,{login:fields.get('login'),password:fields.get('password')},null);
    accountKey=result.account_token;sessionStorage.setItem('sao-account',accountKey);e.target.reset();await refreshRoster();
    $('output').textContent=endpoint==='register'?'注册成功，接下来创建角色。':'登录成功，请选择角色。';
  }catch(e){$('output').textContent=e.message;}finally{busy=false;}
};
$('#close-roster-editor').onclick=()=>{editingCharacter=null;updateRosterEditor();};
$('#roster-outfit').onsubmit=async e=>{
  e.preventDefault();if(busy||!editingCharacter)return;busy=true;
  try{await api('/api/character/outfit',{character_id:editingCharacter,appearance:await readAppearance(new FormData(e.target))},accountKey);e.target.reset();await refreshRoster();$('output').textContent='已提交该角色的外观审核，当前外观仍可正常使用。';}
  catch(error){$('output').textContent=error.message;}finally{busy=false;}
};
const editor=$('#outfit');
editor.onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;
  try{await api('/api/character/outfit',{appearance:await readAppearance(new FormData(editor))});editor.reset();render(await api('/api/observe'));$('output').textContent='已提交外观审核';}
  catch(error){$('output').textContent=error.message;}finally{busy=false;}
};
function leaveGame(){
  clearMovementKeys();resetChat();
  sessionStorage.removeItem('sao-token');token=null;snap=null;closePreview();
  resetUnitQuery();
  avatarReady?.then(play=>play?.dispose());avatarReady=null;$('#game').hidden=true;
}
$('#switch').onclick=async()=>{leaveGame();showEntry();try{if(accountKey)await refreshRoster();else $('output').textContent='请重新登录以管理角色。';}catch(e){$('output').textContent=e.message;}};
$('#logout').onclick=()=>{leaveGame();accountKey=null;rosterData=null;editingCharacter=null;characterCount=0;sessionStorage.removeItem('sao-account');showEntry();$('output').textContent='已退出账号';};
async function sync(){
  try{
    const d=await api('/.well-known/sao-world');if(build&&build!==d.build){location.reload();return;}build=d.build;playerSystem=d.player_system;showEntry();
    if(token&&!busy){const key=token,s=await api('/api/observe',undefined,key);if(token===key)render(s);}
    else if(accountKey&&!busy&&Date.now()-lastRosterPoll>3000)await refreshRoster();
  }catch(e){$('output').textContent=e.message;if(accountKey&&!token&&e.message==='请先登录玩家账户'){accountKey=null;sessionStorage.removeItem('sao-account');showEntry();}}
  finally{setTimeout(sync,1500);}
}
sync();

async function readAppearance(fields){
      const result={};
      for(const slot of ['model','low_model','idle','moving']){
        const file=fields.get(slot);
        if(!file?.size){
          if(fields.has('reset_'+slot))result[slot]={model:'traveler',low_model:'traveler',idle:'breathe',moving:'walk'}[slot];
          continue;
        }
        const limit=slot==='model'?8:2;
        if(file.size>limit*1024*1024)throw Error(slot+' 超过 '+limit+' MiB');
        const base64=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('文件读取失败'));
          reader.readAsDataURL(file);
        });
        result[slot]={base64,format:file.name.split('.').pop().toLowerCase()};
      }
    return result;
}

const unitForm=$('#unit-query'),unitSubmit=unitForm.querySelector('button'),unitNext=$('#unit-query-next');
let unitQuery={},unitOffset=null,unitRequest;
function resetUnitQuery(){
 unitRequest=null;unitOffset=null;
 unitSubmit.disabled=false;unitNext.hidden=true;unitNext.disabled=false;
 $('#unit-query-results').replaceChildren();$('#unit-query-status').textContent='';
}
async function queryUnits(offset){
 if(!token||unitRequest||offset===null)return;
 const request=unitRequest={},key=token;
 unitSubmit.disabled=true;unitNext.disabled=true;
 try{
  const result=await api('/api/units?'+new URLSearchParams({...unitQuery,offset,limit:20}),undefined,key);
  if(request!==unitRequest||token!==key)return;
  for(const unit of result.units){
   const row=document.createElement('p');
   row.append(unit.name+' · '+unit.kind+' · '+unit.direction+' '+Number(unit.distance.toFixed(1))+' 米');
   if(unit.model){
    const button=document.createElement('button');button.type='button';button.textContent='预览';
    button.onclick=()=>previewPlayer(unit,true);row.append(button);
   }
   $('#unit-query-results').append(row);
  }
  $('#unit-query-status').textContent='共 '+result.total+' 个匹配单位，位置以各页查询时为准。';
  unitOffset=result.next_offset;unitNext.hidden=unitOffset===null;
 }catch(error){
  if(request===unitRequest&&token===key)$('#unit-query-status').textContent=error.message;
 }finally{
  if(request===unitRequest){unitRequest=null;unitSubmit.disabled=false;unitNext.disabled=false}
 }
}
unitForm.onsubmit=e=>{
 e.preventDefault();if(unitRequest)return;
 resetUnitQuery();unitQuery=Object.fromEntries([...new FormData(unitForm)].filter(([,value])=>value!==''));
 queryUnits(0);
};
unitNext.onclick=()=>queryUnits(unitOffset);
