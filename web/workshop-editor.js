import {editorScene} from '/editor-scene.js';

const $=selector=>document.querySelector(selector),base='/api/mod-workspaces';
let account=sessionStorage.getItem('sao-account'),workspace=null,selectedBuilding=null,buildings=[],buildingOffset=0,buildingPage=null,draftNext=null;
let busy=false,loadEpoch=0,validationTimer,validationRevision=null,diff={buildings:[],terrain:[]};
const checkedBuildings=new Set(),batches=new Map();
const labels={queued:'等待校验',running:'校验中',valid:'校验通过',invalid:'校验未通过',stale:'校验已过期'};
function element(tag,text,className){
 const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;
}
function status(message,error=false,target=$('#editor-status')){
 target.textContent=message;target.classList.toggle('error',error);
}
function problem(error,target=$('#editor-status')){
 const issues=(error.issues??[]).map(issue=>[issue.path,issue.message].filter(Boolean).join(' · '));
 status([error.message,...issues].join('\n'),true,target);
}
async function request(path,{method='GET',body,key=account}={}){
 const response=await fetch(path,{method,headers:{...(key?{Authorization:'Bearer '+key}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const value=await response.json();
 if(!response.ok){
  if(response.status===401&&key===account)signOut();
  throw Object.assign(Error(value.error||'请求失败'),{issues:value.issues,status:response.status});
 }
 return value;
}
function authView(){
 $('#editor-auth').hidden=!!account;$('#editor-content').hidden=!account;$('#editor-logout').hidden=!account;
 $('#editor-account-state').textContent=account?'账户已登录':'请登录账户';
}
function signOut(){
 account=null;sessionStorage.removeItem('sao-account');workspace=null;selectedBuilding=null;batches.clear();checkedBuildings.clear();clearTimeout(validationTimer);++loadEpoch;
 buildings=[];buildingPage=null;buildingOffset=0;diff={buildings:[],terrain:[]};
 for(const id of ['building-list','workspace-diff','workspace-conflicts','operations-list','validation-issues','history-select','asset-select'])$('#'+id).replaceChildren();
 $('#workspace-select').replaceChildren(new Option('选择草稿',''));
 for(const id of ['workspace-meta','diff-summary','workspace-validation','building-selection-count'])$('#'+id).textContent='';
 for(const form of document.querySelectorAll('#editor-content form'))form.reset();
 for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
 const url=new URL(location.href);url.searchParams.delete('draft');historyReplace(url);
 scene?.show(null,[],null);authView();
}
async function run(button,operation){
 if(busy){status('正在处理上一项操作，请稍候。');return}
 busy=true;if(button)button.disabled=true;$('#editor-content').setAttribute('aria-busy','true');
 try{await operation()}catch(error){problem(error)}
 finally{busy=false;if(button)button.disabled=false;$('#editor-content').setAttribute('aria-busy','false');updateControls()}
}
function ready(){
 if(busy){status('正在处理上一项操作，请稍候。');return false}
 if(!workspace){status('请先选择或创建草稿。',true);return false}
 return true;
}
function operations(){return workspace?(batches.get(workspace.id)??[]):[]}
function addOperations(items){
 if(!ready())return;
 batches.set(workspace.id,[...operations(),...items]);renderOperations();status('操作已加入本页批次，尚未应用到草稿。');
}
function parseJSON(value,label){
 try{return JSON.parse(value)}catch{throw Error(label+' JSON 无法解析')}
}
function optionalJSON(value,label){return value.trim()?parseJSON(value,label):undefined}
function updateControls(){
 const missing=!workspace,selected=!selectedBuilding;
 for(const id of ['operations-apply','workspace-validate','workspace-export','workspace-publish','workspace-restore','workspace-preview'])$('#'+id).disabled=busy||missing;
 $('#operations-apply').disabled=busy||missing||!operations().length;
 $('#operations-clear').disabled=busy||missing||!operations().length;
 $('#workspace-restore').disabled=busy||missing||!$('#history-select').value||Number($('#history-select').value)===workspace?.revision;
 $('#replace-model-form button').disabled=busy||missing||(selected&&!checkedBuildings.size);
 $('#update-building-form button').disabled=busy||missing||selected;
 $('#remove-building').disabled=busy||missing||selected;
 $('#building-prev').disabled=busy||!buildingOffset;$('#building-next').disabled=busy||buildingPage?.next_offset==null;
}
let scene;
try{
 scene=editorScene($('#editor-canvas'),message=>status(message,false,$('#scene-status')),(x,z)=>{
  $('#terrain-form [name=x]').value=x;$('#terrain-form [name=z]').value=z;status('已填入地形坐标 ('+x+', '+z+')。');
 });
}catch(error){status('三维预览不可用，仍可编辑草稿。'+error.message,true,$('#scene-status'))}
function showScene(){
 if(!scene)return;
 let building=selectedBuilding;
 if($('#preview-mode').value==='before'&&selectedBuilding){
  const change=diff.buildings.find(item=>item.id===selectedBuilding.id);if(change)building=change.before;
 }
 const terrain=$('#preview-mode').value==='before'?diff.terrain.map(change=>({...change,after:change.before})):diff.terrain;
 scene.show(building,workspace?.assets??[],account,{collision:$('#show-collision').checked,bounds:$('#show-bounds').checked},terrain);
}
$('#scene-reset').onclick=()=>scene?.reset();$('#scene-zoom-in').onclick=()=>scene?.zoom(.8);$('#scene-zoom-out').onclick=()=>scene?.zoom(1.25);
for(const selector of ['#preview-mode','#show-collision','#show-bounds'])$(selector).onchange=showScene;
$('#editor-auth-form').onsubmit=event=>{
 event.preventDefault();const form=event.currentTarget,button=event.submitter;
 run(button,async()=>{
  const result=await request('/api/'+button.value,{method:'POST',body:Object.fromEntries(new FormData(form)),key:null});
  account=result.account_token;sessionStorage.setItem('sao-account',account);form.reset();authView();await initialize();
 });
};
$('#editor-logout').onclick=()=>{if(busy)return;signOut();status('已退出账户。')};
async function loadDrafts(offset=0){
 const result=await request(base+'?'+new URLSearchParams({offset,limit:50}));
 const select=$('#workspace-select');
 if(!offset)select.replaceChildren(new Option('选择草稿',''));
 for(const item of result.workspaces){
  if(![...select.options].some(option=>option.value===item.id))select.add(new Option(item.title||item.id,item.id));
 }
 draftNext=result.next_offset;$('#workspace-more').hidden=draftNext==null;
 if(workspace){
  if(![...select.options].some(option=>option.value===workspace.id))select.add(new Option(workspace.title,workspace.id));
  select.value=workspace.id;
 }
 return result.workspaces;
}
$('#workspace-more').onclick=()=>run($('#workspace-more'),()=>loadDrafts(draftNext));
function acceptWorkspace(value){
 workspace=value;clearTimeout(validationTimer);
 if(validationRevision!==workspace.revision){$('#workspace-validation').textContent='';$('#validation-issues').replaceChildren();validationRevision=null}
 $('#workspace-meta').textContent='修订 '+value.revision+' · 基准规则 '+value.base_rules_version;
 $('#workspace-version-form [name=version]').value=value.package.version;
 $('#workspace-select').value=value.id;
 const assets=$('#asset-select');assets.replaceChildren(new Option('选择资源',''));
 for(const asset of value.assets??[])assets.add(new Option(asset.sha256.slice(0,12)+' · '+asset.bytes+' B',asset.model));
 const history=$('#history-select');history.replaceChildren();
 for(const entry of value.history??[])if(Number.isInteger(entry.revision))history.add(new Option('修订 '+entry.revision,entry.revision));
 if([...history.options].some(option=>Number(option.value)===value.revision))history.value=String(value.revision);
 const url=new URL(location.href);url.searchParams.set('draft',value.id);historyReplace(url);
 renderOperations();updateControls();
}
function historyReplace(url){window.history.replaceState(null,'',url)}
async function loadWorkspace(id){
 const epoch=++loadEpoch;
 const result=await request(base+'/'+encodeURIComponent(id));
 if(epoch!==loadEpoch)return;
 acceptWorkspace(result.workspace);checkedBuildings.clear();selectedBuilding=null;buildingOffset=0;
 await refreshPreview();await loadBuildings();status('草稿已读取。');
}
$('#workspace-select').onchange=event=>{
 if(busy){event.target.value=workspace?.id??'';return}
 if(event.target.value)run(event.target,()=>loadWorkspace(event.target.value));
};
$('#workspace-reload').onclick=()=>{if(workspace)run($('#workspace-reload'),()=>loadWorkspace(workspace.id));else run($('#workspace-reload'),()=>loadDrafts())};
async function loadBuildings(){
 if(!workspace)return;
 const result=await request(base+'/'+workspace.id+'/buildings?'+new URLSearchParams({q:$('#building-search [name=q]').value.trim(),offset:buildingOffset,limit:12}));
 if(result.offset>0&&!result.buildings.length&&result.offset>=result.total){buildingOffset=Math.max(0,Math.floor((result.total-1)/12)*12);return loadBuildings()}
 buildings=result.buildings;buildingPage=result;buildingOffset=result.offset;
 const list=$('#building-list');list.replaceChildren();
 for(const building of buildings){
  const row=element('div',undefined,'building-row'),check=element('input');check.type='checkbox';check.checked=checkedBuildings.has(building.id);check.setAttribute('aria-label','批量选择 '+building.name);
  check.onchange=()=>{if(check.checked)checkedBuildings.add(building.id);else checkedBuildings.delete(building.id);renderSelection()};
  const button=element('button',building.name);button.type='button';button.dataset.id=building.id;button.append(element('span',building.id+' · ('+building.x+', '+building.z+')'));
  button.onclick=()=>selectBuilding(building);row.append(check,button);list.append(row);
 }
 if(!buildings.length)list.append(element('p','没有匹配的建筑。','editor-help'));
 status('共 '+result.total+' 栋建筑',false,$('#building-status'));
 $('#building-page').textContent=result.total?'第 '+(Math.floor(buildingOffset/result.limit)+1)+' / '+Math.ceil(result.total/result.limit)+' 页':'无结果';
 selectBuilding(buildings.find(item=>item.id===selectedBuilding?.id)??buildings[0]??null);renderSelection();updateControls();
}
function selectBuilding(building){
 selectedBuilding=building;
 $('#selected-building-title').textContent=building?building.name:'编辑操作';
 $('#selected-building-meta').textContent=building?building.id+' · '+building.type+' · ('+building.x+', '+building.z+')':'选择建筑后可替换模型或调整占地。';
 for(const button of $('#building-list').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.id===building?.id));
 $('#replace-model-form [name=model]').value=building?.model??'';
 for(const name of ['collision','entrances','bounds','presentation'])$('#update-building-form [name='+name+']').value=building?.[name]?JSON.stringify(building[name],null,2):'';
 showScene();updateControls();
}
function renderSelection(){$('#building-selection-count').textContent='已勾选 '+checkedBuildings.size;updateControls()}
$('#building-search').onsubmit=event=>{event.preventDefault();buildingOffset=0;run(event.submitter,loadBuildings)};
$('#building-prev').onclick=()=>{buildingOffset=Math.max(0,buildingOffset-12);run($('#building-prev'),loadBuildings)};
$('#building-next').onclick=()=>{if(buildingPage?.next_offset!=null){buildingOffset=buildingPage.next_offset;run($('#building-next'),loadBuildings)}};
$('#building-select-page').onclick=()=>{for(const item of buildings)checkedBuildings.add(item.id);for(const check of $('#building-list').querySelectorAll('input'))check.checked=true;renderSelection()};
$('#building-clear-selection').onclick=()=>{checkedBuildings.clear();for(const check of $('#building-list').querySelectorAll('input'))check.checked=false;renderSelection()};
$('#replace-model-form').onsubmit=event=>{
 event.preventDefault();const model=new FormData(event.currentTarget).get('model').trim(),targets=checkedBuildings.size?[...checkedBuildings]:selectedBuilding?[selectedBuilding.id]:[];
 if(!targets.length){status('请先选择建筑。',true);return}
 addOperations(targets.map(target_id=>({op:'set_model',target_id,model})));
};
$('#asset-select').onchange=event=>{
 if(!event.target.value)return;
 $('#replace-model-form [name=model]').value=event.target.value;$('#add-building-form [name=model]').value=event.target.value;
};
$('#update-building-form').onsubmit=event=>{
 event.preventDefault();if(!selectedBuilding)return;
 try{
  const changes={};
  for(const [name,value] of new FormData(event.currentTarget))changes[name]=value.trim()?parseJSON(value,name):null;
  addOperations([{op:'update_building',target_id:selectedBuilding.id,changes}]);
 }catch(error){problem(error)}
};
$('#remove-building').onclick=()=>{if(selectedBuilding)addOperations([{op:'remove_building',target_id:selectedBuilding.id}])};
$('#add-building-form').onsubmit=event=>{
 event.preventDefault();
 try{
  const values=Object.fromEntries(new FormData(event.currentTarget));
  const instance={id:values.id,name:values.name,type:values.type,model:values.model,x:Number(values.x),z:Number(values.z)};
  for(const name of ['collision','entrances','presentation'])if(values[name].trim())instance[name]=parseJSON(values[name],name);
  const operation={op:'add_building',instance};
  const declared=workspace?.package.registrations.units?.types?.some(type=>type.id===values.type)||operations().some(item=>item.type?.id===values.type);
  if(values.declare_type&&!declared)operation.type={id:values.type,kind:'building',attributes:[],abilities:[]};
  addOperations([operation]);
 }catch(error){problem(error)}
};
$('#terrain-form').onsubmit=event=>{
 event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget)),x=Number(values.x),z=Number(values.z);
 addOperations([event.submitter.value==='remove'?{op:'remove_terrain',x,z}:{op:'set_terrain',x,z,terrain:{type:values.type,height:Number(values.height)}}]);
};
$('#operations-import').onclick=()=>{
 try{const items=parseJSON($('#operations-json').value,'operations');if(!Array.isArray(items)||!items.length)throw Error('请提供非空操作数组。');addOperations(items)}
 catch(error){problem(error)}
};
function renderOperations(){
 const list=$('#operations-list');list.replaceChildren();
 operations().forEach((operation,index)=>{
  const item=element('li'),remove=element('button','移除');remove.type='button';remove.onclick=()=>{if(busy)return;const items=[...operations()];items.splice(index,1);batches.set(workspace.id,items);renderOperations()};
  item.append(remove,element('strong',operation.op+' · '+(operation.target_id??operation.instance?.id??operation.version??(operation.x+', '+operation.z))));
  const details=element('details');details.append(element('summary','查看操作'),element('pre',JSON.stringify(operation,null,2)));item.append(details);list.append(item);
 });
 $('#operation-count').textContent=operations().length;updateControls();
}
$('#operations-clear').onclick=()=>{if(busy||!workspace)return;batches.set(workspace.id,[]);renderOperations();status('已丢弃本页待应用操作。')};
async function updateWorkspace(result){
 acceptWorkspace(result.workspace);await loadDrafts();await refreshPreview();await loadBuildings();
}
$('#operations-apply').onclick=()=>run($('#operations-apply'),async()=>{
 if(!workspace||!operations().length)return;
 const items=[...operations()],result=await request(base+'/'+workspace.id+'/apply',{method:'POST',body:{revision:workspace.revision,operations:items}});
 batches.set(workspace.id,[]);await updateWorkspace(result);status('批次已应用，当前修订 '+workspace.revision+'。');
});
async function refreshPreview(){
 if(!workspace)return;
 const result=await request(base+'/'+workspace.id+'/preview');
 if(result.revision!==workspace.revision)throw Error('草稿已在别处更新，请重新读取。');
 diff=result.diff??{buildings:[],terrain:[]};
 $('#diff-summary').textContent='建筑变更 '+diff.buildings.length+' 项 · 地形变更 '+diff.terrain.length+' 格'+(result.stale?' · 基准已变化':'');
 const conflicts=$('#workspace-conflicts');conflicts.replaceChildren();
 for(const issue of result.conflicts??[])conflicts.append(element('p',[issue.code,issue.path,issue.message].filter(Boolean).join(' · ')));
 const list=$('#workspace-diff');list.replaceChildren();
 for(const [kind,changes] of [['建筑',diff.buildings],['地形',diff.terrain]])for(const change of changes){
  const details=element('details');details.append(element('summary',kind+' '+(change.id??'('+change.x+', '+change.z+')')),element('pre',JSON.stringify({before:change.before,after:change.after},null,2)));list.append(details);
 }
}
$('#workspace-preview').onclick=()=>run($('#workspace-preview'),async()=>{await refreshPreview();showScene();status('差异已刷新。')});
$('#history-select').onchange=updateControls;
$('#workspace-restore').onclick=()=>run($('#workspace-restore'),async()=>{
 const target_revision=Number($('#history-select').value);
 const result=await request(base+'/'+workspace.id+'/restore',{method:'POST',body:{revision:workspace.revision,target_revision}});
 await updateWorkspace(result);status('历史已恢复为新修订 '+workspace.revision+'，请检查待应用批次。');
});
$('#workspace-new').onclick=()=>{if(!busy)$('#workspace-create-dialog').showModal()};
$('#workspace-create-close').onclick=()=>$('#workspace-create-dialog').close();
$('#workspace-create-form [name=package]').oninput=event=>{
 const imported=!!event.target.value.trim();
 for(const name of ['id','version','author','license'])$('#workspace-create-form [name='+name+']').required=!imported;
};
$('#workspace-create-form').onsubmit=event=>{
 event.preventDefault();const form=event.currentTarget;
 run(event.submitter,async()=>{
  const values=Object.fromEntries(new FormData(form));
  const pkg=values.package.trim()?parseJSON(values.package,'package'):{format:4,contract_version:'2.0',id:values.id,version:values.version,author:values.author,license:values.license,registrations:{}};
  const body={title:values.title,package:pkg};
  if(values.base_mod_id)body.base_mod_id=values.base_mod_id;
  try{
   const result=await request(base,{method:'POST',body});
   checkedBuildings.clear();selectedBuilding=null;buildingOffset=0;
   acceptWorkspace(result.workspace);await loadDrafts();await refreshPreview();await loadBuildings();$('#workspace-create-dialog').close();form.reset();form.querySelector('[name=package]').dispatchEvent(new Event('input'));status('草稿已创建。');
  }catch(error){problem(error,$('#workspace-create-status'));throw error}
 });
};
$('#upload-asset-form').onsubmit=event=>{
 event.preventDefault();const form=event.currentTarget;
 run(event.submitter,async()=>{
  if(!workspace)throw Error('请先创建或选择草稿。');
  const file=form.querySelector('input').files[0];
  if(file.size>64*1024*1024)throw Error('GLB 单文件上限为 64 MiB。');
  const buffer=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',buffer);
  const sha256=[...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('文件读取失败'));reader.readAsDataURL(file)});
  const result=await request(base+'/'+workspace.id+'/assets',{method:'POST',body:{revision:workspace.revision,sha256,bytes:file.size,data}});
  await updateWorkspace(result);const asset=result.asset??workspace.assets.find(item=>item.sha256===sha256);
  if(asset){$('#replace-model-form [name=model]').value=asset.model;$('#add-building-form [name=model]').value=asset.model;$('#asset-select').value=asset.model}
  form.reset();status('GLB 已上传到草稿，尚未应用到建筑。');
 });
};
function showValidation(job){
 const state=job.status??job.validation?.status,issues=job.issues??job.result?.issues??[];
 status((labels[state]??state??'正在读取校验')+' · 修订 '+validationRevision,false,$('#workspace-validation'));
 const target=$('#validation-issues');target.replaceChildren();
 for(const issue of issues)target.append(element('p',[issue.code,issue.path,issue.message].filter(Boolean).join(' · '),'error'));
}
async function followValidation(job,workspaceId,revision){
 if(workspace?.id!==workspaceId||workspace.revision!==revision)return;
 showValidation(job);
 if(!['queued','running'].includes(job.status))return;
 validationTimer=setTimeout(async()=>{
  try{
   const result=await request('/api/mods/validations/'+encodeURIComponent(job.job_id));
   await followValidation(result,workspaceId,revision);
  }catch(error){problem(error,$('#workspace-validation'))}
 },1500);
}
$('#workspace-version-form').onsubmit=event=>{
 event.preventDefault();addOperations([{op:'set_version',version:new FormData(event.currentTarget).get('version')}]);
};
$('#workspace-validate').onclick=()=>run($('#workspace-validate'),async()=>{
 if(operations().length)throw Error('请先应用或丢弃待应用批次，再校验当前草稿。');
 clearTimeout(validationTimer);validationRevision=workspace.revision;
 const result=await request(base+'/'+workspace.id+'/validate',{method:'POST',body:{revision:workspace.revision}});
 await followValidation(result.validation??result,workspace.id,workspace.revision);status('校验已提交，结果会在下方更新。');
});
$('#workspace-export').onclick=()=>run($('#workspace-export'),async()=>{
 if(operations().length)throw Error('请先应用或丢弃待应用批次，再导出当前草稿。');
 const response=await fetch(base+'/'+workspace.id+'/export',{headers:{Authorization:'Bearer '+account}});
 if(!response.ok){const error=await response.json();throw Error(error.error||'导出失败')}
 const blob=await response.blob(),url=URL.createObjectURL(blob),link=element('a');link.href=url;link.download=workspace.package.id+'-workspace.zip';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('当前草稿 ZIP 已导出。');
});
$('#workspace-publish').onclick=()=>run($('#workspace-publish'),async()=>{
 if(operations().length)throw Error('请先应用或丢弃待应用批次，再发布当前草稿。');
 const result=await request(base+'/'+workspace.id+'/publish',{method:'POST',body:{revision:workspace.revision,title:workspace.title}});
 status('已发布到工坊'+(result.validation?'，校验状态为 '+(labels[result.validation.status]??result.validation.status):'')+'。主机管理员可另行选择装载。');
});
async function initialize(){
 const drafts=await loadDrafts(),id=new URL(location.href).searchParams.get('draft')??drafts[0]?.id;
 if(id)await loadWorkspace(id);else status('还没有草稿，点击“新建草稿”开始。');
}
window.addEventListener('pagehide',()=>{clearTimeout(validationTimer);scene?.dispose()});
authView();updateControls();
if(account)run(null,initialize);
