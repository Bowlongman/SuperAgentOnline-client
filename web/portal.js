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
let account=sessionStorage.getItem('sao-account'),hostToken='',scope='all',pageGeneration=0,detailGeneration=0,manualGeneration=0,workshopMods=[];
const workshopLimit=12;
let workshopOffset=0,workshopPage=null,workshopRequest,workshopSearchTimer,workshopPollTimer,detailPollTimer,socialController;
const typeLabels={new_system:'新增系统',change_rules:'修改规则',change_content:'修改内容'};
const statusLabels={pending:'待评审',accepted:'已采纳',approved:'已通过',rejected:'已拒绝',proposed:'待讨论',implemented:'已实现',draft:'草稿'};
function notice(message){$('#notice').textContent=message;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('#notice').textContent='',5000)}
function errorText(error){return error.message||'请求失败，请重试。'}
async function api(path,{method='GET',body,key=account,signal}={}){
 const response=await fetch(path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(key?{Authorization:'Bearer '+key}:{})},body:body?JSON.stringify(body):undefined,signal});
 const value=await response.json();
 if(!response.ok){
  if(response.status===401&&key&&key===account){account=null;sessionStorage.removeItem('sao-account');authView()}
  const error=new Error(value.error||'请求失败');
  error.issues=value.issues;error.status=response.status;throw error;
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
}
function requireAccount(){
 if(account)return true;
 $('#account-dialog').showModal();notice('请先登录玩家账户。');return false;
}
function requireHost(){
 if(hostToken)return true;
 $('#host-dialog').showModal();notice('此操作需要主机管理口令。');return false;
}
async function run(button,status,operation){
 button.disabled=true;setStatus(status,'正在处理…');
 try{await operation()}catch(error){showError(status,error)}
 finally{button.disabled=false}
}
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>$('#'+button.dataset.close).close();
$('#account-open').onclick=()=>$('#account-dialog').showModal();
$('#account-logout').onclick=()=>{
 account=null;sessionStorage.removeItem('sao-account');authView();notice('已退出门户账户。');loadPage();
};
$('#login-form').onsubmit=event=>{
 event.preventDefault();const form=event.currentTarget,button=event.submitter;
 run(button,form.querySelector('[role=status]'),async()=>{
  const fields=Object.fromEntries(new FormData(form)),value=await api('/api/'+button.value,{method:'POST',body:fields,key:null});
  account=value.account_token;sessionStorage.setItem('sao-account',account);
  form.reset();setStatus(form.querySelector('[role=status]'),'');$('#account-dialog').close();authView();notice('登录成功，可进入世界或继续参与社区。');loadPage();
 });
};
$('#host-open').onclick=()=>$('#host-dialog').showModal();
$('#host-form').onsubmit=event=>{
 event.preventDefault();hostToken=new FormData(event.currentTarget).get('token').trim();socialController?.refreshIdentity();
 event.currentTarget.reset();$('#host-dialog').close();notice('管理口令已用于本次页面会话。');
};
$('#host-clear').onclick=()=>{hostToken='';socialController?.refreshIdentity();$('#host-form').reset();$('#host-dialog').close();notice('已清除管理口令。')};
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
  if(current==='downloads')await loadDownloads(generation);
  if(current==='workshop')await loadMods(generation);
  if(current==='manual')await loadManual(generation);
  if(current==='proposals')await loadProposals(generation);
  if(current==='community'){
   if(!socialController){
    const module=await import('/social-ui.js');
    socialController??=module.initSocialUI({api,requireAccount,getAccountToken:()=>account,requireHost,getHostToken:()=>hostToken,notice});
   }
   const postId=location.hash.match(/^#community\/post\/([a-f\d-]{36})$/i)?.[1];
   await socialController.load();
   if(generation===pageGeneration)await socialController.syncRoute(postId);
  }
  if(generation===pageGeneration&&!['workshop','community'].includes(current))setStatus(status,'');
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
 if(!requireHost())return;
 const generation=detailGeneration;
 await run(button,status,async()=>{
  try{
   await api('/api/mods/'+(install?'install':'uninstall'),{method:'POST',body:{id:mod.id},key:hostToken});
  }catch(error){
   if(generation!==detailGeneration){notice(errorText(error));return}
   if(install&&$('#detail-dialog').open)await modDetail(mod.id);
   throw error;
  }
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
  controls.append(install,refresh,revalidate);
  const version=installedVersion(mod);
  if(version){const uninstall=action('从主机卸载',()=>manageMod(mod,false,uninstall,$('#detail-status')));controls.append(uninstall)}
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
async function loadProposals(generation){
 const value=await api('/api/proposals',{key:null});if(generation!==pageGeneration)return;
 const proposals=value.proposals??[];const list=$('#proposal-list');list.replaceChildren();
 for(const proposal of proposals){
  const card=node('article',undefined,'list-card'),top=node('div',undefined,'card-top');
  top.append(node('h3',proposal.title),tag(statusLabels[proposal.status]||proposal.status||'待评审',proposal.status==='accepted'));
  const meta=node('div',undefined,'meta');meta.append(node('span',typeLabels[proposal.type]||proposal.type),node('span',proposal.target_system),node('span','规则版本 '+proposal.rules_version));
  card.append(top,meta,node('p',proposal.summary),action('阅读提案 →',()=>proposalDetail(proposal.id)));
  list.append(card);
 }
 if(!proposals.length)list.append(node('p','还没有系统提案。可以从一个明确的问题开始。','empty'));
}
async function proposalDetail(id){
 clearTimeout(detailPollTimer);
 const generation=++detailGeneration,dialog=$('#detail-dialog'),body=$('#detail-body');
 $('#detail-title').textContent='系统提案';body.replaceChildren();setStatus($('#detail-status'),'正在读取…');
 if(!dialog.open)dialog.showModal();
 try{
  const value=await api('/api/proposals/'+encodeURIComponent(id),{key:null});if(generation!==detailGeneration)return;
  const proposal=value.proposal??value;$('#detail-title').textContent=proposal.title;
  body.append(tag(statusLabels[proposal.status]||proposal.status||'待评审',proposal.status==='accepted'));
  for(const [key,title] of Object.entries({type:'提案类型',summary:'概要',target_system:'目标系统',rules_version:'规则版本',design:'设计说明',compatibility:'兼容性与迁移',acceptance:'验收条件',state:'状态 state',decisions:'决策 decisions',result:'结果 result',reason:'评审意见'}))detailField(body,title,key==='type'?typeLabels[proposal.type]:proposal[key]);
  const review=node('form',undefined,'review-form'),heading=node('h3','主机管理员评审');
  const label=node('label','评审结果'),select=node('select');select.name='status';
  for(const [value,text] of [['proposed','待讨论'],['accepted','已采纳'],['rejected','已拒绝'],['implemented','已实现']]){const option=node('option',text);option.value=value;select.append(option)}
  label.append(select);const reasonLabel=node('label','评审理由'),reason=node('textarea');reason.name='reason';reason.required=true;reason.rows=3;reasonLabel.append(reason);
  const submit=node('button','保存评审','primary');submit.type='submit';review.append(heading,label,reasonLabel,submit);
  review.onsubmit=event=>{
   event.preventDefault();if(!requireHost())return;
   run(submit,$('#detail-status'),async()=>{
    await api('/api/proposals/'+encodeURIComponent(id)+'/review',{method:'POST',key:hostToken,body:Object.fromEntries(new FormData(review))});
    await proposalDetail(id);notice('评审意见已保存。');
   });
  };
  body.append(review);setStatus($('#detail-status'),'评审需要主机管理口令；“已实现”表示主机人工记录的验收进度。');
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
