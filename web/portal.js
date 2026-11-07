import {installEmailAuth,revokeEmailSession} from '/email-auth.js';
const $=selector=>document.querySelector(selector);
const node=(tag,text,className)=>{
 const element=document.createElement(tag);
 if(text!==undefined)element.textContent=text;
 if(className)element.className=className;
 return element;
};
const action=(text,handler,className)=>{
 const button=node('button',text,className);button.type='button';button.onclick=handler;return button;
};
let account=sessionStorage.getItem('sao-account'),isAdmin=false,roleRequest,accountEpoch=0,scope='all',pageGeneration=0,detailGeneration=0,manualGeneration=0,workshopMods=[];
const workshopLimit=12;
const proposalLimit=12,pendingProposalVotes=new Set();
let proposalOffset=0,proposalPage,proposalReview=false;
let proposalReportOffset=0,proposalReportPage,proposalReportEpoch=0;
let workshopOffset=0,workshopPage=null,workshopRequest,workshopSearchTimer,workshopPollTimer,detailPollTimer,socialController;
const typeLabels={new_system:'新增系统',change_rules:'修改规则',change_content:'修改内容'};
const statusLabels={pending:'待评审',accepted:'已采纳',approved:'已通过',rejected:'已拒绝',proposed:'待讨论',implemented:'已实现',draft:'草稿'};
function notice(message){$('#notice').textContent=message;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#notice').textContent='',5000)}
function errorText(error){return error.message||'请求失败，请重试。'}
async function api(path,{method='GET',body,key=account,signal}={}){
 const epoch=accountEpoch;
 const response=await fetch(path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(key?{Authorization:'Bearer '+key}:{})},body:body?JSON.stringify(body):undefined,signal});
 const value=await response.json();
 if(!response.ok){
  if(response.status===401&&key&&key===account&&epoch===accountEpoch){setAccount(null);queueMicrotask(loadPage)}
  const error=new Error(value.error||'请求失败');
  error.issues=value.issues;error.status=response.status;error.retry_after_ms=value.retry_after_ms;throw error;
 }
 return value;
}
function showError(element,error){
 element.classList.add('error');
 element.textContent=errorText(error);
 if(error.issues?.length)element.append('\n'+error.issues.map(issue=>[issue.path,issue.message].filter(Boolean).join(' · ')).join('\n'));
}
function setStatus(element,text){element.classList.remove('error');element.textContent=text}
function authView(){
 $('#account-open').textContent=account?'账户已登录':'登录 / 注册';
 $('#account-logout').hidden=!account;
 $('#portal-email-signin').hidden=!!account;
 $('#portal-email-binding').hidden=!account;
}
function requireAccount(){
 if(account)return true;
 $('#account-dialog').showModal();notice('请先登录玩家账户。');return false;
}
function setAccount(key){
 if(key===account)return;
 account=key;isAdmin=false;roleRequest=null;++accountEpoch;
 if(key)sessionStorage.setItem('sao-account',key);else sessionStorage.removeItem('sao-account');
 clearTimeout(detailPollTimer);++detailGeneration;
 $('#detail-dialog').close();$('#detail-body').replaceChildren();
 proposalOffset=0;proposalPage=null;proposalReview=false;$('#proposal-filter').value='all';
 $('#proposal-list').replaceChildren();updateProposalView();
 clearProposalReports();
 socialController?.refreshIdentity();authView();
}
function loadAccountRole(){
 if(!account)return;
 if(roleRequest)return roleRequest;
 const key=account,epoch=accountEpoch;
 roleRequest=api('/api/account',{key}).then(value=>{
  if(epoch===accountEpoch)isAdmin=value.is_admin===true;
 }).catch(()=>{
  if(epoch===accountEpoch){isAdmin=false;roleRequest=null}
 });
 return roleRequest;
}
async function run(button,status,operation){
 button.disabled=true;setStatus(status,'正在处理…');
 try{await operation()}catch(error){showError(status,error)}
 finally{button.disabled=false}
}
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>$('#'+button.dataset.close).close();
$('#account-open').onclick=()=>$('#account-dialog').showModal();
$('#account-logout').onclick=()=>{
 revokeEmailSession(account);
 setAccount(null);notice('已退出门户账户。');loadPage();
};
void installEmailAuth({getAccount:()=>account,onSignedIn:result=>{
 setAccount(result.account_token);
 $('#account-dialog').close();notice('登录成功，可进入世界或继续参与社区。');loadPage();
},onBound:()=>{$('#account-dialog').close();notice('邮箱已绑定，可使用验证码登录。')}});
$('#login-form').onsubmit=event=>{
 event.preventDefault();const form=event.currentTarget,button=event.submitter;
 run(button,form.querySelector('[role=status]'),async()=>{
  const fields=Object.fromEntries(new FormData(form)),value=await api('/api/'+button.value,{method:'POST',body:fields,key:null});
  setAccount(value.account_token);
  form.reset();setStatus(form.querySelector('[role=status]'),'');$('#account-dialog').close();notice('登录成功，可进入世界或继续参与社区。');loadPage();
 });
};
function currentPage(){
 if(location.hash==='#manual')history.replaceState(null,'',location.pathname+location.search+'#workshop/manual');
 if(location.hash==='#workshop/manual')return 'manual';
 const id=location.hash.slice(1).split('/')[0];
 return ['home','downloads','workshop','proposals','community'].includes(id)?id:'home';
}
async function loadPage(){
 const current=currentPage(),generation=++pageGeneration;
 workshopRequest?.abort();clearTimeout(workshopPollTimer);
 ++manualGeneration;
 for(const page of document.querySelectorAll('.page'))page.hidden=page.id!==current;
 for(const link of document.querySelectorAll('.site-header nav a')){
  const selected=link.hash==='#'+(current==='manual'?'workshop':current);link.classList.toggle('active',selected);
  if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 }
 for(const link of document.querySelectorAll('.workshop-tabs a')){
  const selected=(current==='workshop'&&link.hash==='#workshop')||(current==='manual'&&link.hash==='#workshop/manual');
  link.classList.toggle('active',selected);
  if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 }
 document.title=({home:'世界介绍',downloads:'下载',workshop:'社区工坊',manual:'开发手册',proposals:'系统提案',community:'玩家社群'}[current])+' · 刀剑神鱼';
 if(current!=='community')socialController?.syncRoute(null);
 const status=$('#'+({downloads:'download',workshop:'workshop',manual:'manual',proposals:'proposal',community:'social'}[current])+'-status');
 if(current==='home')return;
 setStatus(status,'正在读取游戏服务…');
 try{
  await loadAccountRole();if(generation!==pageGeneration)return;
  if(current==='downloads')await loadDownloads(generation);
  if(current==='workshop')await loadMods(generation);
  if(current==='manual')await loadManual(generation);
  if(current==='proposals')await loadProposals(generation);
  if(current==='community'){
   if(!socialController){
    const module=await import('/social-ui.js');
    socialController??=module.initSocialUI({api,requireAccount,getAccountToken:()=>account,isAdmin:()=>isAdmin,notice});
   }
   const postId=location.hash.match(/^#community\/post\/([a-f\d-]{36})$/i)?.[1];
   await socialController.load();
   if(generation===pageGeneration)await socialController.syncRoute(postId);
  }
  if(generation===pageGeneration&&!['workshop','community','proposals'].includes(current))setStatus(status,'');
 }catch(error){if(generation===pageGeneration&&error.name!=='AbortError')showError(status,error)}
}
window.addEventListener('hashchange',()=>{
 loadPage();window.scrollTo({top:0,behavior:'instant'});
});
for(const button of document.querySelectorAll('[data-scope]'))button.onclick=()=>{
 clearTimeout(workshopSearchTimer);workshopSearchTimer=null;workshopOffset=0;
 scope=button.dataset.scope;
 for(const peer of document.querySelectorAll('[data-scope]'))peer.setAttribute('aria-pressed',String(peer===button));
 loadPage();
};
function tag(text,gold=false){return node('span',text,'tag'+(gold?' gold':''))}
function safeURL(value){
 if(typeof value!=='string'||!value.trim())return null;
 try{const url=new URL(value,location.origin);return url.origin===location.origin&&url.protocol===location.protocol?url.href:null}catch{return null}
}
function githubRelease(file){
 try{
  const urls=[file.repository_url,file.release_url,file.release_asset_url].map(value=>new URL(value));
  if(urls.some(url=>url.origin!=='https://github.com'||url.username||url.password||url.search||url.hash))return null;
  const [repository,release,asset]=urls;
  const repo=repository.pathname.replace(/\/$/,'');
  if(!/^\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(repo))return null;
  const tagPath=repo+'/releases/tag/';
  if(!release.pathname.startsWith(tagPath))return null;
  const tag=release.pathname.slice(tagPath.length);
  if(!tag||tag.includes('/')||asset.pathname!==repo+'/releases/download/'+tag+'/'+encodeURIComponent(file.filename))return null;
  return {repository:repository.href,release:release.href,asset:asset.href};
 }catch{return null}
}
function githubLink(label,url,primary=false){
 const link=node('a',label,primary?'button primary':'button');
 link.href=url;link.target='_blank';link.rel='noopener noreferrer';
 return link;
}
function downloadLink(label,url,filename,primary=false){
 const link=node('a',label,primary?'button primary':'button');
 link.href=url;link.download=filename||'';
 return link;
}
async function loadDownloads(generation){
 const value=await api('/api/downloads',{key:null});if(generation!==pageGeneration)return;
 const list=$('#download-list');list.replaceChildren();
 for(const file of value.downloads??[]){
  const card=node('article',undefined,'list-card download-card'),copy=node('div');
  copy.append(node('h3',file.title||file.filename),node('p',file.description||file.desc||''));
  const meta=node('div',undefined,'meta');
  if(file.bytes){
   let size=file.bytes+' B';
   if(file.bytes>=1024*1024)size=(file.bytes/1024/1024).toFixed(1)+' MiB';
   else if(file.bytes>=1024)size=(file.bytes/1024).toFixed(1)+' KiB';
   meta.append(node('span',size));
  }
  if(file.filename)meta.append(node('span',file.filename));
  copy.append(meta);
  if(file.sha256){const hash=node('p','SHA-256 '+file.sha256,'card-id');copy.append(hash)}
  card.append(copy);
  const url=safeURL(file.url);
  const github=githubRelease(file);
  if(github){
   const actions=node('div',undefined,'actions download-links');
   copy.append(node('p',url?'可从 GitHub Releases 或官网镜像下载同一客户端。GitHub 链接将在新标签页打开。':'客户端通过 GitHub Releases 发布。GitHub 链接将在新标签页打开。'));
   actions.append(githubLink('从 GitHub 下载 ↓',github.asset,true));
   if(url)actions.append(downloadLink('官网下载镜像 ↓',url,file.filename));
   actions.append(githubLink('发布说明 ↗',github.release),githubLink('客户端仓库 ↗',github.repository));
   card.append(actions);
  }else if(url)card.append(downloadLink('下载文件 ↓',url,file.filename,true));
  else card.append(node('span','下载尚未就绪','tag'));
  list.append(card);
 }
 if(!list.childElementCount)list.append(node('p','服务尚未提供下载文件。','empty'));
}
function installedVersion(mod){
 if(mod.installed===false)return null;
 return mod.installed_version??(typeof mod.installed==='object'?mod.installed?.version:null)??(mod.installed?mod.version:null);
}
function validationStatus(mod){
 return mod.validation?.status??(mod.validation?.valid===true?'valid':mod.validation?.valid===false?'invalid':'queued');
}
function canInstall(mod){return validationStatus(mod)==='valid'&&mod.validation?.loadable===true}
const validationLabels={queued:'等待校验',running:'校验中',valid:'校验通过',invalid:'校验未通过',stale:'校验已过期'};
function appendModMetadata(parent,mod){
 const version=installedVersion(mod),meta=node('div',undefined,'meta'),state=validationStatus(mod);
 meta.append(node('span',(mod.published===false?'本机版本 ':'工坊发布版本 ')+(mod.version??'未标注')));
 meta.append(tag(version?'主机已装载 '+version:'主机未装载',!!version));
 if(version&&version!==mod.version)meta.append(tag('新版待装载',true));
 if(mod.published===false)meta.append(tag('主机随附'));
 const validationTag=tag(validationLabels[state]??'等待校验');validationTag.classList.add('validation-tag');validationTag.dataset.state=state;meta.append(validationTag);
 parent.append(meta);
 const hints={queued:'已进入后台校验队列，完成后会展示结果。',running:'正在按当前世界规则校验。',stale:'规则或发布版本已变化，发布者可重新校验。',invalid:'校验未通过，请查看详情中的问题。'};
 if(hints[state])parent.append(node('p',hints[state],'help validation-hint'));
 else if(mod.validation?.loadable===false)parent.append(node('p','当前主机无法装载此包，请查看详情中的校验说明。','help'));
}
async function vote(mod,value,button){
 if(!requireAccount())return;
 await run(button,$('#workshop-status'),async()=>{
  await api('/api/community/vote',{method:'POST',body:{id:mod.id,value:mod.votes?.mine===value?0:value}});
  await loadPage();notice('投票已更新。');
 });
}
async function manageMod(mod,install,button,status=$('#workshop-status')){
 if(!isAdmin)return;
 const generation=detailGeneration,key=account;
 await run(button,status,async()=>{
  try{
   await api('/api/mods/'+(install?'install':'uninstall'),{method:'POST',body:{id:mod.id},key});
  }catch(error){
   if(generation!==detailGeneration){notice(errorText(error));return}
   if(install&&$('#detail-dialog').open)await modDetail(mod.id);
   throw error;
  }
  if(key!==account)return;
  if(generation===detailGeneration&&$('#detail-dialog').open)$('#detail-dialog').close();
  await loadPage();notice(install?'主机已装载此 MOD。':'主机已卸载此 MOD。');
 });
}
function updateWorkshopPaging(busy=false){
 $('#mod-list').setAttribute('aria-busy',String(busy));
 $('#workshop-prev').disabled=busy||workshopOffset===0;
 $('#workshop-next').disabled=busy||workshopPage?.next_offset==null;
 $('#workshop-refresh').disabled=busy;
}
function scheduleWorkshopRefresh(){
 clearTimeout(workshopPollTimer);
 if(!workshopMods.some(mod=>['queued','running'].includes(validationStatus(mod))))return;
 workshopPollTimer=setTimeout(()=>{
  if(currentPage()!=='workshop')return;
  if(document.hidden||workshopSearchTimer||document.querySelector('dialog[open]')){scheduleWorkshopRefresh();return}
  loadPage();
 },2000);
}
async function loadMods(generation){
 const request=new AbortController();workshopRequest=request;workshopPage=null;
 updateWorkshopPaging(true);$('#workshop-retry').hidden=true;
 setStatus($('#workshop-status'),'正在查询工坊…');
 $('#workshop-page-info').textContent='正在读取分页…';
 try{
  const params=new URLSearchParams({scope,q:$('#workshop-search').value.trim(),validation:$('#workshop-validation').value,offset:String(workshopOffset),limit:String(workshopLimit)});
  const value=await api('/api/community/mods?'+params,{signal:request.signal});
  if(generation!==pageGeneration||request.signal.aborted)return;
  if(!value.mods.length&&value.offset>0&&value.offset>=value.total){
   workshopOffset=Math.max(0,Math.floor((value.total-1)/workshopLimit)*workshopLimit);
   return await loadMods(generation);
  }
  workshopOffset=value.offset;workshopPage=value;workshopMods=value.mods;
  renderMods();
  const count=workshopMods.length;
  $('#workshop-page-info').textContent=value.total?'第 '+(Math.floor(value.offset/value.limit)+1)+' / '+Math.ceil(value.total/value.limit)+' 页 · 本页 '+count+' 项':'暂无匹配内容';
  setStatus($('#workshop-status'),'共 '+value.total+' 项匹配内容');
  scheduleWorkshopRefresh();
 }catch(error){
  if(error.name==='AbortError'||generation!==pageGeneration)return;
  workshopMods=[];$('#mod-list').replaceChildren(node('p','工坊内容未能加载，请重试查询。','empty'));
  $('#workshop-page-info').textContent='本页加载失败';$('#workshop-retry').hidden=false;
  showError($('#workshop-status'),error);
 }finally{
  if(workshopRequest===request){workshopRequest=null;updateWorkshopPaging()}
 }
}
function renderMods(){
 const mods=workshopMods,list=$('#mod-list'),focused=document.activeElement;
 const focusedCard=focused?.closest('.mod-card');
 const focusedId=focusedCard?.dataset.modId,focusedIndex=focusedCard?[...focusedCard.querySelectorAll('button')].indexOf(focused):-1;
 list.replaceChildren();
 for(const mod of mods){
  const card=node('article',undefined,'mod-card'),top=node('div',undefined,'card-top'),heading=node('div');
  card.dataset.modId=mod.id;
  heading.append(node('h3',mod.title||mod.name||mod.id),node('div',mod.id,'card-id'));top.append(heading);
  card.append(top);appendModMetadata(card,mod);
  card.append(node('p',mod.description||'作者尚未填写介绍。','card-description'));
  if(mod.author||mod.published_by)card.append(node('p',mod.published_by?'发布账户 '+mod.published_by:'作者 '+mod.author,'help'));
  const controls=node('div',undefined,'card-actions');
  const up=action('赞 '+(mod.votes?.up??0),()=>vote(mod,1,up));up.setAttribute('aria-pressed',String(mod.votes?.mine===1));up.setAttribute('aria-label','赞 '+(mod.title||mod.id));
  const down=action('踩 '+(mod.votes?.down??0),()=>vote(mod,-1,down));down.setAttribute('aria-pressed',String(mod.votes?.mine===-1));down.setAttribute('aria-label','踩 '+(mod.title||mod.id));
  controls.append(up,down,action('查看详情 →',()=>modDetail(mod.id)));
  card.append(controls);list.append(card);
 }
 if(!mods.length)list.append(node('p','未找到匹配的工坊内容，可以调整搜索词或筛选条件。','empty'));
 if(focusedId&&focusedIndex>=0){
  const card=[...list.children].find(element=>element.dataset.modId===focusedId);
  card?.querySelectorAll('button')[focusedIndex]?.focus({preventScroll:true});
 }
}
function restartWorkshopQuery(){
 clearTimeout(workshopSearchTimer);workshopSearchTimer=null;workshopOffset=0;loadPage();
}
$('#workshop-search').oninput=()=>{
 workshopRequest?.abort();clearTimeout(workshopSearchTimer);
 workshopSearchTimer=setTimeout(restartWorkshopQuery,300);
};
$('#workshop-search-form').onsubmit=event=>{event.preventDefault();restartWorkshopQuery()};
$('#workshop-validation').onchange=restartWorkshopQuery;
async function changeWorkshopPage(offset){
 clearTimeout(workshopSearchTimer);workshopSearchTimer=null;
 workshopOffset=offset;const generation=pageGeneration+1;
 await loadPage();
 if(generation!==pageGeneration||currentPage()!=='workshop')return;
 const status=$('#workshop-status');status.tabIndex=-1;status.focus({preventScroll:true});
 $('.workshop-feedback').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
$('#workshop-prev').onclick=()=>changeWorkshopPage(Math.max(0,workshopOffset-workshopLimit));
$('#workshop-next').onclick=()=>{if(workshopPage?.next_offset!=null)changeWorkshopPage(workshopPage.next_offset)};
$('#workshop-retry').onclick=()=>loadPage();
$('#workshop-refresh').onclick=()=>loadPage();
$('#detail-dialog').addEventListener('close',()=>{++detailGeneration;clearTimeout(detailPollTimer)});

function detailField(parent,title,value){
 if(value===undefined||value===null||value==='')return;
 const field=node('section',undefined,'detail-field');
 field.append(node('h3',title),node('p',typeof value==='string'?value:JSON.stringify(value,null,2)));
 parent.append(field);
}
async function modDetail(id){
 clearTimeout(detailPollTimer);
 const generation=++detailGeneration,dialog=$('#detail-dialog'),body=$('#detail-body');
 $('#detail-title').textContent='MOD 详情';body.replaceChildren();setStatus($('#detail-status'),'正在读取…');
 if(!dialog.open)dialog.showModal();
 try{
  const value=await api('/api/community/mods/'+encodeURIComponent(id));if(generation!==detailGeneration)return;
  let mod=value.mod??value,refreshGeneration=0;
  $('#detail-title').textContent=mod.title||mod.name||mod.id;
  const metadata=node('div'),issues=node('div');
  body.append(metadata);detailField(body,'内容说明',mod.description);
  detailField(body,'作者',mod.author);detailField(body,'发布账户',mod.published_by);body.append(issues);
  if(mod.package){const details=node('details'),summary=node('summary','查看包声明 JSON');details.append(summary,node('pre',JSON.stringify(mod.package,null,2),'package-preview'));body.append(details)}
  const controls=node('div',undefined,'card-actions');
  const install=action('装载到主机',()=>manageMod(mod,true,install,$('#detail-status')),'primary');
  const refresh=action('刷新校验结果',()=>run(refresh,$('#detail-status'),refreshState));
  const revalidate=action('重新校验',async()=>{
   if(!requireAccount())return;
   await run(revalidate,$('#detail-status'),async()=>{
    const result=await api('/api/community/mods/'+encodeURIComponent(id)+'/revalidate',{method:'POST',body:{}});
    if(generation!==detailGeneration)return;
    mod={...mod,validation:result.validation??result};updateState();scheduleDetailRefresh();
    setStatus($('#detail-status'),'已提交重新校验，完成后可由主机选择装载。');
   });
   revalidate.disabled=['queued','running'].includes(validationStatus(mod));
  });
  if(isAdmin)controls.append(install);
  controls.append(refresh,revalidate);
  const version=installedVersion(mod);
  if(isAdmin&&version){const uninstall=action('从主机卸载',()=>manageMod(mod,false,uninstall,$('#detail-status')));controls.append(uninstall)}
  body.append(controls);
  function updateState(){
   metadata.replaceChildren();appendModMetadata(metadata,mod);
   issues.replaceChildren();
   for(const issue of mod.validation?.issues??[])detailField(issues,'校验说明',typeof issue==='string'?issue:[issue.path,issue.message].filter(Boolean).join(' · '));
   detailField(issues,'校验所依据的规则版本',mod.validation?.base_rules_version);
   install.textContent=version?'装载工坊版本':'装载到主机';install.disabled=!canInstall(mod);
   revalidate.hidden=!mod.can_revalidate;revalidate.disabled=['queued','running'].includes(validationStatus(mod));
  }
  function scheduleDetailRefresh(){
   clearTimeout(detailPollTimer);
   if(!['queued','running'].includes(validationStatus(mod)))return;
   detailPollTimer=setTimeout(()=>{
    if(generation!==detailGeneration||!dialog.open)return;
    if(document.hidden){scheduleDetailRefresh();return}
    refreshState().catch(error=>{if(generation===detailGeneration)showError($('#detail-status'),error)});
   },1500);
  }
  async function refreshState(){
   clearTimeout(detailPollTimer);
   const refreshId=++refreshGeneration;
   const result=await api('/api/community/mods/'+encodeURIComponent(id));
   if(generation!==detailGeneration||refreshId!==refreshGeneration)return;
   const next=result.mod??result;
   if(next.sha256!==mod.sha256){await modDetail(id);return}
   mod=next;updateState();scheduleDetailRefresh();
   setStatus($('#detail-status'),'校验结果不代表可玩性保证。装载由主机管理员独立决定。');
  }
  updateState();scheduleDetailRefresh();
  setStatus($('#detail-status'),'校验通过后可由主机管理员装载，社区投票不会执行装载。');
 }catch(error){if(generation===detailGeneration)showError($('#detail-status'),error)}
}
$('#publish-open').onclick=()=>{if(requireAccount())$('#publish-dialog').showModal()};
$('#package-file').onchange=async event=>{
 const file=event.target.files?.[0];if(!file)return;
 const status=$('#publish-form [role=status]');
 try{
  if(file.size>8*1024*1024)throw Error('JSON 文件过大，请检查包内容。');
  $('#publish-form [name=package]').value=await file.text();setStatus(status,'已读取 JSON，请检查后提交。');
 }catch(error){showError(status,error)}
};
$('#publish-form').onsubmit=event=>{
 event.preventDefault();if(!requireAccount())return;
 const form=event.currentTarget;
 run(event.submitter,form.querySelector('[role=status]'),async()=>{
  const values=Object.fromEntries(new FormData(form));let pkg;
  try{pkg=JSON.parse(values.package)}catch{throw Error('JSON 无法解析，请检查包格式。')}
  const receipt=await api('/api/mods/submit',{method:'POST',body:{package:pkg,title:values.title||undefined,description:values.description||undefined}});
  form.reset();$('#publish-dialog').close();scope='all';workshopOffset=0;
  $('#workshop-search').value='';$('#workshop-validation').value='all';clearTimeout(workshopSearchTimer);workshopSearchTimer=null;
  for(const button of document.querySelectorAll('[data-scope]'))button.setAttribute('aria-pressed',String(button.dataset.scope===scope));
  await loadPage();notice(validationStatus(receipt)==='invalid'?'已发布到工坊，校验存在问题，请查看详情。':'已发布到工坊并提交校验。主机可在校验通过后独立选装。');
 });
};
function markdown(parent,content){
 parent.replaceChildren();let code=null,list=null;
 for(const line of String(content??'').split(/\r?\n/)){
  if(/^\s*```/.test(line)){
   if(code){code=null}else{code=node('pre');parent.append(code)}list=null;continue;
  }
  if(code){code.append(document.createTextNode(line+'\n'));continue}
  const heading=line.match(/^(#{1,3})\s+(.+)$/);
  if(heading){parent.append(node('h'+heading[1].length,heading[2]));list=null;continue}
  const item=line.match(/^\s*[-*]\s+(.+)$/);
  if(item){if(!list){list=node('ul');parent.append(list)}list.append(node('li',item[1]));continue}
  list=null;
  if(line.trim())parent.append(node('p',line));
 }
}
async function manualTopic(topic,button){
 const generation=++manualGeneration;
 setStatus($('#manual-status'),'正在读取手册…');
 try{
  const value=await api('/api/manual/'+encodeURIComponent(topic.id),{key:null});if(generation!==manualGeneration)return;
  markdown($('#manual-body'),value.content);
  for(const peer of document.querySelectorAll('#manual-topics button'))peer.setAttribute('aria-current',String(peer===button));
  setStatus($('#manual-status'),'');
 }catch(error){if(generation===manualGeneration)showError($('#manual-status'),error)}
}
async function loadManual(generation){
 const value=await api('/api/manual',{key:null});if(generation!==pageGeneration)return;
 const topics=$('#manual-topics');topics.replaceChildren();
 for(const topic of value.topics??[]){
  const button=action(topic.title,()=>manualTopic(topic,button));topics.append(button);
 }
 if(topics.firstElementChild)topics.firstElementChild.click();
 else $('#manual-body').replaceChildren(node('p','服务尚未提供开发手册。','empty'));
}
function updateProposalView(){
 $('#proposal-views').hidden=!isAdmin;
 $('#proposal-review-banner').hidden=!isAdmin||!proposalReview;
 $('#proposal-reports').hidden=!isAdmin||!proposalReview;
 for(const tab of $('#proposal-views').querySelectorAll('button'))tab.setAttribute('aria-pressed',String((tab.dataset.proposalView==='review')===proposalReview));
}
function proposalPager(busy=false){
 $('#proposal-list').setAttribute('aria-busy',String(busy));
 $('#proposal-prev').disabled=busy||proposalOffset===0;
 $('#proposal-next').disabled=busy||proposalPage?.next_offset==null;
 $('#proposal-refresh').disabled=busy;
 $('#proposal-page-info').textContent=busy?'正在读取…':proposalPage?.total?'第 '+(Math.floor(proposalOffset/proposalLimit)+1)+' / '+Math.ceil(proposalPage.total/proposalLimit)+' 页 · 共 '+proposalPage.total+' 条':'暂无提案';
}
function paintProposalVotes(group,votes,busy){
 group.setAttribute('aria-busy',String(busy));
 for(const control of group.querySelectorAll('button')){
  const value=Number(control.dataset.vote);
  control.textContent=value===1?'赞 '+votes.up:'踩 '+votes.down;
  control.setAttribute('aria-pressed',String(votes.mine===value));control.disabled=busy||group.dataset.voteDisabled==='true';
 }
 group.querySelector('.proposal-vote-score').textContent='净赞 '+votes.score;
}
function proposalVotes(proposal){
 const group=node('div',undefined,'proposal-votes');group.dataset.proposalVote=proposal.id;
 group.dataset.voteDisabled=String(!!account&&proposal.can_vote===false);
 group.setAttribute('role','group');group.setAttribute('aria-label','提案投票');
 for(const value of [1,-1]){
  const control=action('',()=>submitProposalVote(proposal.id,control));control.dataset.vote=value;group.append(control);
 }
 const feedback=node('span',undefined,'proposal-vote-feedback');feedback.setAttribute('role','status');
 group.append(node('span',undefined,'proposal-vote-score'),feedback);
 paintProposalVotes(group,proposal.votes??{up:0,down:0,score:0,mine:0},pendingProposalVotes.has(proposal.id));return group;
}
async function submitProposalVote(id,control){
 if(pendingProposalVotes.has(id)||!requireAccount())return;
 const key=account,epoch=accountEpoch,value=control.getAttribute('aria-pressed')==='true'?0:Number(control.dataset.vote);
 const groups=()=>[...document.querySelectorAll('[data-proposal-vote]')].filter(group=>group.dataset.proposalVote===id);
 pendingProposalVotes.add(id);
 for(const group of groups()){
  group.setAttribute('aria-busy','true');for(const button of group.querySelectorAll('button'))button.disabled=true;
  setStatus(group.querySelector('.proposal-vote-feedback'),'正在提交投票…');
 }
 try{
  const result=await api('/api/proposals/'+encodeURIComponent(id)+'/vote',{method:'POST',key,body:{value}});
  if(epoch!==accountEpoch)return;
  const rank=$('#proposal-sort').value==='top'?'。刷新列表可更新排名。':'';
  for(const group of groups()){
   paintProposalVotes(group,result.votes,true);
   setStatus(group.querySelector('.proposal-vote-feedback'),(value===0?'已取消投票':'投票已更新')+rank);
  }
 }catch(error){
  if(epoch===accountEpoch)for(const group of groups())showError(group.querySelector('.proposal-vote-feedback'),error);
 }finally{
  pendingProposalVotes.delete(id);
  for(const group of groups()){
   group.setAttribute('aria-busy','false');for(const button of group.querySelectorAll('button'))button.disabled=group.dataset.voteDisabled==='true';
  }
 }
}
async function loadProposals(generation){
 updateProposalView();proposalPager(true);
 const status=$('#proposal-filter').value,params=new URLSearchParams({sort:$('#proposal-sort').value,offset:proposalOffset,limit:proposalLimit});
 if(status!=='all')params.set('status',status);
 let value;
 try{value=await api('/api/proposals?'+params)}catch(error){if(generation===pageGeneration)proposalPager();throw error}
 if(generation!==pageGeneration)return;
 if(!value.proposals.length&&value.offset>0&&value.offset>=value.total){
  proposalOffset=Math.max(0,Math.floor((value.total-1)/proposalLimit)*proposalLimit);return loadProposals(generation);
 }
 proposalPage=value;proposalOffset=value.offset;
 const proposals=value.proposals,list=$('#proposal-list');list.replaceChildren();
 for(const proposal of proposals){
  const card=node('article',undefined,'list-card'),top=node('div',undefined,'card-top');
  top.append(node('h3',proposal.title),tag(statusLabels[proposal.status]||proposal.status||'待评审',proposal.status==='accepted'));
  const meta=node('div',undefined,'meta');meta.append(node('span',typeLabels[proposal.type]||proposal.type),node('span',proposal.target_system),node('span','规则版本 '+proposal.rules_version));
  const controls=node('div',undefined,'card-actions');
  controls.append(proposalVotes(proposal),action(proposalReview&&proposal.can_review?'打开审核 →':'阅读提案 →',()=>proposalDetail(proposal.id)));
  card.append(top,meta,node('p',proposal.summary),controls);
  list.append(card);
 }
 if(!proposals.length)list.append(node('p',proposalReview?'当前筛选没有匹配的待审核提案。':'当前筛选没有匹配的系统提案。','empty'));
 setStatus($('#proposal-status'),'共 '+value.total+' 条提案');proposalPager();
}
for(const tab of $('#proposal-views').querySelectorAll('button'))tab.onclick=()=>{
 if(!isAdmin)return;
 proposalReview=tab.dataset.proposalView==='review';proposalOffset=0;
 clearProposalReports();
 $('#proposal-filter').value=proposalReview?'proposed':'all';loadPage();
};
for(const selector of ['#proposal-sort','#proposal-filter'])$(selector).onchange=()=>{proposalOffset=0;loadPage()};
$('#proposal-refresh').onclick=loadPage;
$('#proposal-prev').onclick=()=>{proposalOffset=Math.max(0,proposalOffset-proposalLimit);loadPage()};
$('#proposal-next').onclick=()=>{if(proposalPage?.next_offset!=null){proposalOffset=proposalPage.next_offset;loadPage()}};
function proposalCommentError(feedback,error){
 const retry=Number(error.retry_after_ms);
 if(error.status===429){feedback.textContent=retry>0?'留言操作过于频繁，请 '+Math.ceil(retry/1000)+' 秒后再试。':'留言操作过于频繁，请稍后再试。';feedback.classList.add('error')}
 else if(error.message==='PROPOSAL_COMMENT_DUPLICATE'){feedback.textContent='这条留言最近已发布，请修改内容后再试。';feedback.classList.add('error')}
 else showError(feedback,error);
}
function openProposalCommentAction(row,id,text,kind,moderation,feedback,active,done){
 if((moderation&&!isAdmin)||!requireAccount())return;
 row.querySelector('.proposal-comment-action')?.remove();
 const confirm=node('form',undefined,'proposal-comment-action');
 if(kind!=='delete'){
  const label=node('label','理由'),reason=node('textarea');reason.name='reason';reason.required=true;reason.maxLength=300;reason.rows=2;
  label.append(reason);confirm.append(label);
 }
 const send=node('button','确认'+text,'primary');confirm.append(send,action('取消',()=>confirm.remove()));row.append(confirm);
 confirm.onsubmit=async event=>{
  event.preventDefault();if(send.disabled||!active()||(moderation&&!isAdmin)||!requireAccount())return;
  const body=Object.fromEntries(new FormData(confirm));if(moderation)body.action=moderation;
  const epoch=accountEpoch;send.disabled=true;setStatus(feedback,'正在提交…');
  try{
   await api('/api/proposals/comments/'+encodeURIComponent(id)+'/'+kind,{method:'POST',body});
   if(epoch!==accountEpoch||!active())return;
   confirm.remove();await done();
  }catch(error){if(epoch===accountEpoch&&active())proposalCommentError(feedback,error)}
  finally{send.disabled=false}
 };
}
function clearProposalReports(){
 ++proposalReportEpoch;proposalReportOffset=0;proposalReportPage=null;
 $('#proposal-reports').open=false;$('#proposal-report-filter').value='pending';
 $('#proposal-report-list').replaceChildren();setStatus($('#proposal-report-status'),'');
 $('#proposal-report-page-info').textContent='';$('#proposal-report-prev').disabled=$('#proposal-report-next').disabled=true;
}
async function loadProposalReports(){
 if(!isAdmin||!proposalReview||!$('#proposal-reports').open)return;
 const epoch=++proposalReportEpoch,feedback=$('#proposal-report-status'),list=$('#proposal-report-list');
 const prev=$('#proposal-report-prev'),next=$('#proposal-report-next');prev.disabled=next.disabled=true;
 setStatus(feedback,'正在读取留言举报…');
 try{
  const params=new URLSearchParams({offset:proposalReportOffset,limit:proposalLimit,status:$('#proposal-report-filter').value});
  const result=await api('/api/proposals/comments/reports?'+params);
  if(epoch!==proposalReportEpoch||!isAdmin||!proposalReview)return;
  if(!result.reports.length&&result.offset>0&&result.offset>=result.total){proposalReportOffset=Math.max(0,Math.floor((result.total-1)/proposalLimit)*proposalLimit);return loadProposalReports()}
  proposalReportPage=result;proposalReportOffset=result.offset;list.replaceChildren();
  for(const report of result.reports){
   const row=node('article',undefined,'social-report');
   row.append(node('p',report.reason),node('p',report.reporter+' · '+new Date(report.created_at).toLocaleString('zh-CN')+(report.reviewed_at?' · 已处理':' · 待处理'),'help'));
   const controls=node('div',undefined,'card-actions');controls.append(action('打开目标提案 →',()=>proposalDetail(report.proposal_id)));
   if(['public','hidden'].includes(report.comment_status)){
    const moderation=report.comment_status==='hidden'?'restore':'hide',label=moderation==='hide'?'隐藏留言':'恢复留言';
    controls.append(action(label,()=>openProposalCommentAction(row,report.comment_id,label,'moderate',moderation,feedback,()=>isAdmin&&proposalReview&&epoch===proposalReportEpoch,async()=>{
     await loadProposalReports();notice('留言状态已更新。');
    })));
   }
   row.append(controls);list.append(row);
  }
  if(!result.reports.length)list.append(node('p','当前没有匹配的留言举报。','empty'));
  $('#proposal-report-page-info').textContent='共 '+result.total+' 条举报';setStatus(feedback,'');
  prev.disabled=proposalReportOffset===0;next.disabled=result.next_offset==null;
 }catch(error){if(epoch===proposalReportEpoch&&isAdmin)showError(feedback,error)}
}
$('#proposal-reports').ontoggle=()=>loadProposalReports();
$('#proposal-report-filter').onchange=()=>{proposalReportOffset=0;loadProposalReports()};
$('#proposal-report-refresh').onclick=loadProposalReports;
$('#proposal-report-prev').onclick=()=>{proposalReportOffset=Math.max(0,proposalReportOffset-proposalLimit);loadProposalReports()};
$('#proposal-report-next').onclick=()=>{if(proposalReportPage?.next_offset!=null){proposalReportOffset=proposalReportPage.next_offset;loadProposalReports()}};
function proposalComments(id,generation){
 const section=node('section',undefined,'proposal-comments'),list=node('div',undefined,'proposal-comment-list');
 const feedback=node('p');feedback.setAttribute('role','status');
 const pager=node('nav',undefined,'workshop-pagination');pager.setAttribute('aria-label','提案留言分页');
 const info=node('p'),prev=action('← 上一页',()=>load(Math.max(0,offset-proposalLimit))),next=action('下一页 →',()=>load(page.next_offset));
 pager.append(prev,info,next);prev.disabled=next.disabled=true;
 const form=node('form'),label=node('label','发表留言'),input=node('textarea'),submit=node('button','发布留言','primary');
 input.name='body';input.required=true;input.maxLength=1000;input.rows=4;label.append(input);form.append(label,submit);
 section.append(node('h3','提案留言'),feedback,list,pager,form);
 let page,offset=0,epoch=0;
 function addCommentActions(row,comment){
  const controls=node('div',undefined,'card-actions');
  function offer(text,kind,moderation){
   controls.append(action(text,()=>openProposalCommentAction(row,comment.id,text,kind,moderation,feedback,()=>generation===detailGeneration,async()=>{
    if(kind==='report')setStatus(feedback,'留言举报已提交。');
    else{await load(offset);setStatus(feedback,'留言状态已更新。');void loadProposalReports()}
   })));
  }
  if(comment.can_delete)offer('删除','delete');
  if(comment.can_report||(!account&&comment.status==='public'))offer('举报','report');
  if(isAdmin&&comment.can_moderate)offer(comment.status==='hidden'?'恢复公开':'隐藏', 'moderate',comment.status==='hidden'?'restore':'hide');
  if(controls.childElementCount)row.append(controls);
 }
 async function load(nextOffset){
  const request=++epoch;list.setAttribute('aria-busy','true');prev.disabled=next.disabled=true;
  setStatus(feedback,'正在读取留言…');
  try{
   const params=new URLSearchParams({offset:nextOffset,limit:proposalLimit});
   const result=await api('/api/proposals/'+encodeURIComponent(id)+'/comments?'+params);
   if(request!==epoch||generation!==detailGeneration)return;
   if(!result.comments.length&&result.offset>0&&result.offset>=result.total)return load(Math.max(0,Math.floor((result.total-1)/proposalLimit)*proposalLimit));
   page=result;offset=result.offset;list.replaceChildren();
   for(const comment of result.comments){
    const row=node('article',undefined,'social-comment');
    const meta=node('div',undefined,'meta');meta.append(node('span',comment.author));
    if(comment.created_at)meta.append(node('time',new Date(comment.created_at).toLocaleString('zh-CN')));
    if(comment.status==='hidden')meta.append(tag('已隐藏'));
    row.append(meta,node('p',comment.body,'social-full-text'));addCommentActions(row,comment);list.append(row);
   }
   if(!result.comments.length)list.append(node('p','还没有留言。','empty'));
   info.textContent='共 '+result.total+' 条留言';setStatus(feedback,'');
  }catch(error){if(request===epoch&&generation===detailGeneration)proposalCommentError(feedback,error)}
  finally{if(request===epoch){list.setAttribute('aria-busy','false');prev.disabled=offset===0;next.disabled=page?.next_offset==null}}
 }
 form.onsubmit=async event=>{
  event.preventDefault();if(submit.disabled||!requireAccount())return;
  submit.disabled=true;setStatus(feedback,'正在发布…');
  try{
   await api('/api/proposals/'+encodeURIComponent(id)+'/comments',{method:'POST',body:{body:input.value}});
   if(generation!==detailGeneration)return;
   form.reset();await load(offset);setStatus(feedback,'留言已发布。');
  }catch(error){if(generation===detailGeneration)proposalCommentError(feedback,error)}
  finally{submit.disabled=false}
 };
 void load(0);return section;
}
async function proposalDetail(id){
 clearTimeout(detailPollTimer);
 const generation=++detailGeneration,dialog=$('#detail-dialog'),body=$('#detail-body');
 $('#detail-title').textContent='系统提案';body.replaceChildren();setStatus($('#detail-status'),'正在读取…');
 if(!dialog.open)dialog.showModal();
 $('.proposal-detail-scroll').scrollTop=0;
 try{
  const value=await api('/api/proposals/'+encodeURIComponent(id));if(generation!==detailGeneration)return;
  const proposal=value.proposal??value;$('#detail-title').textContent=proposal.title;
  body.append(tag(statusLabels[proposal.status]||proposal.status||'待评审',proposal.status==='accepted'));
  for(const [key,title] of Object.entries({type:'提案类型',summary:'概要',target_system:'目标系统',rules_version:'规则版本',design:'设计说明',compatibility:'兼容性与迁移',acceptance:'验收条件',state:'状态 state',decisions:'决策 decisions',result:'结果 result',reason:'评审意见'}))detailField(body,title,key==='type'?typeLabels[proposal.type]:proposal[key]);
  body.append(proposalVotes(proposal));
  if(!isAdmin||!proposalReview||!proposal.can_review){body.append(proposalComments(id,generation));setStatus($('#detail-status'),'');return}
  const review=node('form',undefined,'review-form'),heading=node('h3','主机管理员评审');
  const label=node('label','评审结果'),select=node('select');select.name='status';
  for(const [value,text] of [['proposed','待讨论'],['accepted','已采纳'],['rejected','已拒绝'],['implemented','已实现']]){const option=node('option',text);option.value=value;select.append(option)}
  select.value=proposal.status;
  label.append(select);const reasonLabel=node('label','评审理由'),reason=node('textarea');reason.name='reason';reason.required=true;reason.rows=3;reasonLabel.append(reason);
  const submit=node('button','保存评审','primary');submit.type='submit';review.append(heading,label,reasonLabel,submit);
  review.onsubmit=event=>{
   event.preventDefault();if(!isAdmin||!proposalReview)return;
   const key=account,epoch=accountEpoch;
   run(submit,$('#detail-status'),async()=>{
    await api('/api/proposals/'+encodeURIComponent(id)+'/review',{method:'POST',key,body:Object.fromEntries(new FormData(review))});
    if(epoch!==accountEpoch)return;
    await loadPage();if(generation===detailGeneration)await proposalDetail(id);
    notice('评审意见已保存。');
   });
  };
  body.append(review,proposalComments(id,generation));setStatus($('#detail-status'),'“已实现”表示管理员人工记录的验收进度。');
 }catch(error){if(generation===detailGeneration)showError($('#detail-status'),error)}
}
$('#proposal-open').onclick=()=>{if(requireAccount())$('#proposal-dialog').showModal()};
$('#proposal-form [name=type]').onchange=event=>{
 const fresh=event.target.value==='new_system';$('#new-system-fields').hidden=!fresh;
 for(const input of $('#new-system-fields').querySelectorAll('textarea')){input.required=fresh;input.disabled=!fresh}
};
$('#proposal-form').onsubmit=event=>{
 event.preventDefault();if(!requireAccount())return;
 const form=event.currentTarget;
 run(event.submitter,form.querySelector('[role=status]'),async()=>{
  await api('/api/proposals',{method:'POST',body:Object.fromEntries(new FormData(form))});
  form.reset();$('#proposal-form [name=type]').dispatchEvent(new Event('change'));
  $('#proposal-dialog').close();await loadPage();notice('提案已提交，等待主机管理员评审。');
 });
};
authView();loadPage();
