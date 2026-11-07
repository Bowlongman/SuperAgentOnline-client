export function initSocialUI({api,requireAccount,requireHost,getHostToken,notice}){
 const $=selector=>document.querySelector(selector),base='/api/social',limit=12;
 let postOffset=0,commentOffset=0,reportOffset=0,postPage,commentPage,reportPage,activePost;
 let listEpoch=0,detailEpoch=0,commentEpoch=0,reportEpoch=0,listRequest,composeTarget,actionTarget;
 const node=(tag,text,className)=>{
  const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;
 };
 function button(text,callback,className){
  const element=node('button',text,className);element.type='button';element.onclick=callback;return element;
 }
 function status(target,message,error=false){target.textContent=message;target.classList.toggle('error',error)}
 function showError(target,error){
  const messages=(error.issues??[]).map(issue=>[issue.path,issue.rule_id,issue.message].filter(Boolean).join(' · '));
  status(target,[error.message,...messages].join('\n'),true);
 }
 async function run(control,target,operation){
  control.disabled=true;status(target,'正在提交…');
  try{await operation()}catch(error){showError(target,error)}
  finally{control.disabled=false}
 }
 const admin=()=>$('#social-admin-mode').checked;
 const readOptions=()=>admin()?{key:getHostToken()}:{};
 function time(value){return new Date(value).toLocaleString('zh-CN',{dateStyle:'medium',timeStyle:'short'})}
 function metadata(item){
  const meta=node('div',undefined,'meta');
  meta.append(node('span',item.author),node('span',time(item.created_at)));
  if(item.updated_at!==item.created_at)meta.append(node('span','已编辑'));
  if(item.status==='hidden')meta.append(node('span','已隐藏','tag'));
  return meta;
 }
 function pager(prefix,page,offset,busy=false){
  $('#'+prefix+'-prev').disabled=busy||offset===0;
  $('#'+prefix+'-next').disabled=busy||page?.next_offset==null;
  $('#'+prefix+'-page-info').textContent=busy?'正在读取…':page?(page.total?'第 '+(Math.floor(page.offset/page.limit)+1)+' / '+Math.ceil(page.total/page.limit)+' 页 · 共 '+page.total+' 条':'暂无内容'):'未读取分页';
 }
 function revealStatus(target){
  target.tabIndex=-1;target.focus({preventScroll:true});
  target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
 }
 async function load(){
  const epoch=++listEpoch;listRequest?.abort();listRequest=new AbortController();
  const list=$('#social-posts');list.setAttribute('aria-busy','true');$('#social-retry').hidden=true;pager('social',postPage,postOffset,true);
  status($('#social-status'),'正在读取玩家社群…');
  try{
   const result=await api(base+'/posts?'+new URLSearchParams({q:$('#social-search').value.trim(),offset:postOffset,limit}),{...readOptions(),signal:listRequest.signal});
   if(epoch!==listEpoch||$('#community').hidden)return;
   if(!result.posts.length&&result.offset>0&&result.offset>=result.total){postOffset=Math.max(0,Math.floor((result.total-1)/limit)*limit);return load()}
   postPage=result;postOffset=result.offset;list.replaceChildren();
   for(const post of result.posts){
    const card=node('article',undefined,'social-card'),title=button(post.title,()=>openPost(post.id),'social-title-button');
    const heading=node('h3');heading.append(title);card.append(metadata(post),heading,node('p',post.body,'social-post-excerpt'));
    const controls=node('div',undefined,'card-actions');controls.append(button('阅读与留言 · '+post.comment_count,()=>openPost(post.id)));
    appendActions(controls,'post',post);card.append(controls);list.append(card);
   }
   if(!result.posts.length)list.append(node('p','还没有匹配的帖子，可以换个搜索词或分享你的故事。','empty'));
   status($('#social-status'),'共 '+result.total+' 篇公开帖子');pager('social',result,postOffset);
   $('#social-admin-panel').hidden=!admin();
   if(admin())await loadReports();
  }catch(error){
   if(epoch!==listEpoch||error.name==='AbortError')return;
   list.replaceChildren();$('#social-retry').hidden=false;showError($('#social-status'),error);pager('social',null,postOffset);
  }finally{if(epoch===listEpoch)list.setAttribute('aria-busy','false')}
 }
 function appendActions(container,type,item){
  if(item.can_edit)container.append(button('编辑',()=>openCompose(type,item)));
  if(item.can_delete)container.append(button('删除',()=>openAction('delete',type,item)));
  if(item.status==='public')container.append(button('举报',()=>{if(requireAccount())openAction('report',type,item)}));
  if(item.can_moderate)container.append(button(item.status==='hidden'?'恢复公开':'主机隐藏',()=>openAction(item.status==='hidden'?'restore':'hide',type,item)));
 }
 function openCompose(type='post',item=null){
  if(!requireAccount())return;
  composeTarget={type,item};
  const form=$('#social-compose-form');form.reset();
  $('#social-compose-title').textContent=item?'编辑'+(type==='post'?'帖子':'留言'):'发布帖子';
  $('#social-title-label').hidden=type==='comment';form.elements.title.disabled=type==='comment';
  form.elements.title.value=item?.title??'';form.elements.body.value=item?.body??'';form.elements.body.maxLength=type==='post'?4000:1000;
  status($('#social-compose-status'),'');$('#social-compose-dialog').showModal();
 }
 $('#social-new-post').onclick=()=>openCompose();
 $('#social-compose-form').onsubmit=event=>{
  event.preventDefault();if(!requireAccount())return;
  const target=composeTarget,form=event.currentTarget,fields=Object.fromEntries(new FormData(form));
  run(event.submitter,$('#social-compose-status'),async()=>{
   const path=target.item?base+'/'+(target.type==='post'?'posts/':'comments/')+target.item.id:base+'/posts';
   const result=await api(path,{method:'POST',body:fields});
   $('#social-compose-dialog').close();notice('内容已通过当前服务检查并提交。');
   if(!target.item)postOffset=0;
   await load();
   if(activePost){
    if(target.type==='post'&&target.item?.id===activePost.id){const post=result.post??result;renderPost(post)}
    else await refreshDetail();
   }
  });
 };
 async function openPost(id){
  const epoch=++detailEpoch;
  if(activePost?.id!==id){commentOffset=0;$('#social-comment-form').reset()}
  activePost=null;$('#social-detail-title').textContent='读取帖子…';$('#social-detail-body').textContent='';
  $('#social-detail-actions').replaceChildren();$('#social-detail-meta').replaceChildren();$('#social-comments').replaceChildren();
  status($('#social-detail-status'),'正在读取…');status($('#social-comment-status'),'');
  if(!$('#social-detail-dialog').open)$('#social-detail-dialog').showModal();
  try{
   const result=await api(base+'/posts/'+encodeURIComponent(id),readOptions());
   if(epoch!==detailEpoch)return;
   activePost=result.post??result;renderPost(activePost);await loadComments();
   status($('#social-detail-status'),'');
  }catch(error){if(epoch===detailEpoch)showError($('#social-detail-status'),error)}
 }
 function renderPost(post){
  activePost=post;$('#social-detail-title').textContent=post.title;$('#social-detail-body').textContent=post.body;
  const meta=metadata(post);meta.append(node('span',post.comment_count+' 条公开留言'));
  $('#social-detail-meta').replaceChildren(...meta.childNodes);
  const actions=$('#social-detail-actions');actions.replaceChildren();appendActions(actions,'post',post);
  actions.append(button('刷新',refreshDetail));
  $('#social-comment-form button').disabled=post.status!=='public';
  if(post.status!=='public')status($('#social-comment-status'),'此帖当前已隐藏，留言提交由服务端限制。');
 }
 async function refreshDetail(){
  if(!activePost)return;
  const id=activePost.id,epoch=detailEpoch;
  try{
   const result=await api(base+'/posts/'+id,readOptions());
   if(epoch!==detailEpoch)return;
   renderPost(result.post??result);await loadComments();
  }catch(error){
   if(epoch!==detailEpoch)return;
   if(error.status===404){
    activePost=null;$('#social-detail-body').textContent='';$('#social-detail-meta').replaceChildren();$('#social-detail-actions').replaceChildren();$('#social-comments').replaceChildren();$('#social-comment-form button').disabled=true;
   }
   showError($('#social-detail-status'),error);
  }
 }
 async function loadComments(){
  if(!activePost)return;
  const id=activePost.id,epoch=++commentEpoch;
  pager('social-comments',commentPage,commentOffset,true);status($('#social-comments-status'),'正在读取留言…');
  try{
   const result=await api(base+'/posts/'+id+'/comments?'+new URLSearchParams({offset:commentOffset,limit}),readOptions());
   if(epoch!==commentEpoch||activePost?.id!==id)return;
   if(!result.comments.length&&result.offset>0&&result.offset>=result.total){commentOffset=Math.max(0,Math.floor((result.total-1)/limit)*limit);return loadComments()}
   commentPage=result;commentOffset=result.offset;const list=$('#social-comments');list.replaceChildren();
   for(const comment of result.comments){
    const item=node('article',undefined,'social-comment'+(comment.status==='hidden'?' is-hidden':''));
    item.append(metadata(comment),node('p',comment.body,'social-full-text'));
    const controls=node('div',undefined,'social-comment-actions');appendActions(controls,'comment',comment);item.append(controls);list.append(item);
   }
   if(!result.comments.length)list.append(node('p','还没有留言。','empty'));
   status($('#social-comments-status'),'共 '+result.total+' 条可见留言');pager('social-comments',result,commentOffset);
  }catch(error){if(epoch===commentEpoch){showError($('#social-comments-status'),error);pager('social-comments',null,commentOffset)}}
 }
 $('#social-comment-form').onsubmit=event=>{
  event.preventDefault();if(!requireAccount()||activePost?.status!=='public')return;
  const id=activePost.id,epoch=detailEpoch,form=event.currentTarget;
  run(event.submitter,$('#social-comment-status'),async()=>{
   await api(base+'/posts/'+id+'/comments',{method:'POST',body:Object.fromEntries(new FormData(form))});
   if(epoch!==detailEpoch)return;
   form.reset();const result=await api(base+'/posts/'+id+'/comments?'+new URLSearchParams({offset:0,limit}),readOptions());
   commentOffset=Math.max(0,Math.floor((result.total-1)/limit)*limit);
   await refreshDetail();status($('#social-comment-status'),'留言已发布。');await load();
  });
 };
 $('#social-detail-dialog').addEventListener('close',()=>{++detailEpoch;++commentEpoch;activePost=null;$('#social-comment-form').reset()});
 $('#social-comments-prev').onclick=async()=>{commentOffset=Math.max(0,commentOffset-limit);await loadComments();revealStatus($('#social-comments-status'))};
 $('#social-comments-next').onclick=async()=>{if(commentPage?.next_offset==null)return;commentOffset=commentPage.next_offset;await loadComments();revealStatus($('#social-comments-status'))};
 function openAction(action,type,item){
  actionTarget={action,type,item};const form=$('#social-action-form');form.reset();
  $('#social-action-title').textContent=({report:'举报内容',delete:'确认删除',hide:'主机隐藏内容',restore:'恢复公开内容'})[action];
  $('#social-action-target').textContent=(type==='post'?'帖子':'留言')+' · '+(item.title??item.body??item.id);
  $('#social-reason-label').hidden=action==='delete';form.elements.reason.disabled=action==='delete';
  $('#social-action-submit').textContent=({report:'提交举报',delete:'确认删除',hide:'隐藏内容',restore:'恢复公开'})[action];
  status($('#social-action-status'),'');$('#social-action-dialog').showModal();
 }
 $('#social-action-form').onsubmit=event=>{
  event.preventDefault();const target=actionTarget;
  if(['hide','restore'].includes(target.action)){if(!requireHost())return}
  else if(!requireAccount())return;
  const fields=Object.fromEntries(new FormData(event.currentTarget));
  run(event.submitter,$('#social-action-status'),async()=>{
   if(target.action==='delete')await api(base+'/'+(target.type==='post'?'posts/':'comments/')+target.item.id+'/delete',{method:'POST',body:{}});
   else await api(base+(target.action==='report'?'/reports':'/moderate'),{method:'POST',body:{target_type:target.type,target_id:target.item.id,reason:fields.reason,...(target.action==='report'?{}:{action:target.action})},...(target.action==='report'?{}:{key:getHostToken()})});
   $('#social-action-dialog').close();notice(target.action==='report'?'举报已提交到主机管理端。':'内容状态已更新。');
   if(target.type==='post'&&target.action==='delete'&&activePost?.id===target.item.id)$('#social-detail-dialog').close();
   else if(activePost&&target.action!=='report')await refreshDetail();
   await load();
  });
 };
 $('#social-search-form').onsubmit=event=>{event.preventDefault();postOffset=0;load()};
 $('#social-retry').onclick=()=>load();
 $('#social-prev').onclick=async()=>{postOffset=Math.max(0,postOffset-limit);await load();revealStatus($('#social-status'))};
 $('#social-next').onclick=async()=>{if(postPage?.next_offset==null)return;postOffset=postPage.next_offset;await load();revealStatus($('#social-status'))};
 async function loadReports(){
  if(!admin())return;
  const epoch=++reportEpoch;pager('social-reports',reportPage,reportOffset,true);
  status($('#social-reports-status'),'正在读取举报记录…');
  try{
   const result=await api(base+'/reports?'+new URLSearchParams({offset:reportOffset,limit}),{key:getHostToken()});
   if(epoch!==reportEpoch||!admin())return;
   reportPage=result;reportOffset=result.offset;const list=$('#social-reports');list.replaceChildren();
   for(const report of result.reports){
    const item=node('article',undefined,'social-report');
    item.append(node('h3',(report.target_type==='post'?'帖子':'留言')+' · '+report.target_id),node('p',report.reason),node('p','举报账户 '+report.reporter+' · '+time(report.created_at)+(report.reviewed_at?' · 已处理':''),'help'));
    const target={id:report.target_id};
    const controls=node('div',undefined,'social-comment-actions');
    if(report.target_type==='post')controls.append(button('查看帖子',()=>openPost(report.target_id)));
    controls.append(button('隐藏',()=>openAction('hide',report.target_type,target)),button('恢复公开',()=>openAction('restore',report.target_type,target)));item.append(controls);list.append(item);
   }
   if(!result.reports.length)list.append(node('p','还没有举报记录。','empty'));
   status($('#social-reports-status'),'共 '+result.total+' 条举报记录');pager('social-reports',result,reportOffset);
  }catch(error){if(epoch===reportEpoch&&admin()){showError($('#social-reports-status'),error);pager('social-reports',null,reportOffset)}}
 }
 $('#social-reports-refresh').onclick=loadReports;
 $('#social-reports-prev').onclick=()=>{reportOffset=Math.max(0,reportOffset-limit);loadReports()};
 $('#social-reports-next').onclick=()=>{if(reportPage?.next_offset!=null){reportOffset=reportPage.next_offset;loadReports()}};
 $('#social-find-post').onsubmit=event=>{event.preventDefault();openPost(new FormData(event.currentTarget).get('id').trim())};
 $('#social-host-token').onclick=()=>$('#host-dialog').showModal();
 $('#social-admin-mode').onchange=()=>{
  ++reportEpoch;$('#social-reports').replaceChildren();$('#social-audit-list').replaceChildren();status($('#social-audit-status'),'');
  if(admin()&&!requireHost())$('#social-admin-mode').checked=false;
  $('#social-admin-panel').hidden=!admin();reportOffset=0;load();
 };
 function refreshIdentity(){
  ++reportEpoch;$('#social-admin-mode').checked=false;$('#social-admin-panel').hidden=true;$('#social-reports').replaceChildren();$('#social-audit-list').replaceChildren();status($('#social-audit-status'),'');
  if($('#social-detail-dialog').open)$('#social-detail-dialog').close();
  if(!$('#community').hidden)load();
 }
 $('#social-audit-refresh').onclick=async()=>{
  if(!admin()||!requireHost())return;
  const key=getHostToken(),epoch=reportEpoch;
  await run($('#social-audit-refresh'),$('#social-audit-status'),async()=>{
   const result=await api(base+'/audit?limit=12',{key});
   if(!admin()||key!==getHostToken()||epoch!==reportEpoch)return;
   const list=$('#social-audit-list');list.replaceChildren();
   for(const event of result.events){
    const item=node('article',undefined,'social-report');
    item.append(node('h3',event.event+' · '+event.target_type),node('p',[event.field,event.rule_id,event.reason].filter(Boolean).join(' · ')),node('p',event.actor+' · '+time(event.created_at),'help'));
    list.append(item);
   }
   status($('#social-audit-status'),'显示最近 '+result.events.length+' 条记录 · 共 '+result.total+' 条');
  });
 };
 api(base+'/policy',{key:null}).then(policy=>{
  status($('#social-policy-status'),'规则版本 '+policy.version+' · 发帖 '+policy.limits.post+' 字 / 留言 '+policy.limits.comment+' 字。提交内容由服务端按当前规则检查。');
  const list=$('#social-policy-rules');list.replaceChildren();
  for(const rule of policy.rules)list.append(node('p',rule.id+' · '+rule.reason));
 }).catch(error=>showError($('#social-policy-status'),error));
 return {load,refreshIdentity};
}
