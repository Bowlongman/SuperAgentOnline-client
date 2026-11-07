import {worldScene} from './world-scene.js';
import {cameraLimits,validAngles} from './camera-contract.mjs';

const rad=Math.PI/180, palette={road:'#718781',water:'#427692',bridge:'#ae9162',boundary:'#415253'};
export function worldCamera(panel){
  const select=panel.querySelector('select'),canvas=panel.querySelector('canvas'),ctx=canvas.getContext('2d');
  const bubbleLayer=panel.querySelector('#speech-bubbles'),speech=new Map();
  const fields=['yaw','pitch','distance'].map(k=>panel.querySelector('[name='+k+']'));
  const status=panel.querySelector('details [role=status]');
  const sceneCanvas=document.createElement('canvas');sceneCanvas.className='world-scene';canvas.before(sceneCanvas);let sceneRenderer;try{sceneRenderer=worldScene(sceneCanvas,()=>{},message=>{status.textContent=message})}catch(e){status.textContent='3D 渲染不可用：'+e.message;sceneCanvas.remove()}

  let presets=[],selected='diagonal',view,snapshot,lastConfig,worldId;
  const num=()=>Object.fromEntries(fields.map(input=>[input.name,input.valueAsNumber]));
  for(const input of fields)[input.min,input.max]=cameraLimits[input.name];
  function choices(){
    select.replaceChildren();
    for(const p of [...presets,{id:'edit',name:'自定义（即时）'}])select.add(new Option(p.name,p.id));
    select.value=selected;
  }
  function use(value){
    view=value;for(const input of fields)input.value=value[input.name];draw();
  }
  select.onchange=()=>{
    selected=select.value;
    const preset=presets.find(p=>p.id===selected);
    if(preset)use(preset);
    status.textContent='';
  };
  for(const input of fields)input.oninput=()=>{
    const candidate=num();
    if(!validAngles(candidate)){status.textContent='请在标注范围内填写三个数值';return}
    selected='edit';select.value=selected;use(candidate);status.textContent='';
  };
  function draw(){
    if(!view||!snapshot)return;
    const p=snapshot.world.perceived,[px,pz]=p.position;
    const yaw=view.yaw*rad,pitch=view.pitch*rad;
    const sy=Math.sin(yaw),cy=Math.cos(yaw),sp=Math.sin(pitch),cp=Math.cos(pitch);
    const width=canvas.width,height=canvas.height,f=height*1.12;
    function project(x,y,z){
      x-=px;z-=pz;y-=p.height+.45;
      const along=x*sy+z*cy, depth=view.distance+along*cp-y*sp;
      if(depth<.15)return null;
      return {x:width/2+f*(x*cy-z*sy)/depth,y:height/2-f*(y*cp+along*sp)/depth,depth};
    }
    const hasScene=sceneRenderer&&(snapshot.world.public.scenery?.length??0)>0;sceneCanvas.hidden=!hasScene;
    if(hasScene){sceneRenderer.render(snapshot,view,width,height);ctx.clearRect(0,0,width,height)}else{sceneRenderer?.clear();ctx.fillStyle='#203135';ctx.fillRect(0,0,width,height)}
    const tiles=p.surfaces.map(t=>({t,center:project(t.x,t.height,t.z)})).filter(v=>v.center).sort((a,b)=>b.center.depth-a.center.depth);
    for(const {t} of hasScene?[]:tiles){
      const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([x,z])=>project(t.x+x,t.height,t.z+z));
      if(corners.some(pt=>!pt))continue;
      ctx.beginPath();corners.forEach((pt,i)=>i?ctx.lineTo(pt.x,pt.y):ctx.moveTo(pt.x,pt.y));ctx.closePath();
      ctx.fillStyle=t.walkable?palette[t.type]??palette.road:palette[t.type]??palette.boundary;ctx.fill();ctx.strokeStyle='#304547';ctx.stroke();
    }
    const markers=[...(snapshot.core?.units??[]).filter(u=>u.type!=='player').map(u=>({...u,color:'#e4b7f7'})),...p.landmarks.map(t=>({...t,color:'#e9c897'})),...p.players.map(t=>({...t,color:'#a0cfff'})),{id:snapshot.character.id,x:px,z:pz,name:snapshot.character.name,color:'#efffe7'}];
    ctx.font='14px system-ui';ctx.textAlign='center';
    for(const m of markers){
      const ground=p.surfaces.find(t=>t.x===m.x&&t.z===m.z);
      const pt=project(m.x,ground?.height??p.height,m.z);if(!pt)continue;
      ctx.fillStyle=m.color;ctx.beginPath();ctx.arc(pt.x,pt.y,4,0,2*Math.PI);ctx.fill();
      ctx.strokeStyle='#1a282b';ctx.lineWidth=3;ctx.strokeText(m.name,pt.x,pt.y-8);ctx.fillText(m.name,pt.x,pt.y-8);ctx.lineWidth=1;
    }    if(bubbleLayer){
      bubbleLayer.replaceChildren();const placed=[];
      for(const [id,message]of speech){
        if(message.expires<=performance.now()){speech.delete(id);continue}
        const actor=id===snapshot.character.id?{x:px,z:pz,name:snapshot.character.name}:(snapshot.world.public.render?.units??p.players).find(a=>a.id===id);
        if(!actor||Math.hypot(actor.x-px,actor.z-pz)>(snapshot.world.public.sensing?.bubble??5))continue;
        const ground=p.surfaces.find(t=>t.x===actor.x&&t.z===actor.z);
        const head=project(actor.x,(ground?.height??p.height)+1.7,actor.z);if(!head)continue;
        const node=document.createElement('div');node.className='speech-bubble';node.dataset.senderId=id;
        const name=document.createElement('strong');name.textContent=actor.name;
        const text=document.createElement('span');text.textContent=message.text;node.title=message.text;node.append(name,text);bubbleLayer.append(node);
        const scaleX=canvas.clientWidth/width,scaleY=canvas.clientHeight/height;
        const x=Math.max(node.offsetWidth/2+4,Math.min(canvas.clientWidth-node.offsetWidth/2-4,head.x*scaleX));
        let y=Math.max(node.offsetHeight+8,Math.min(canvas.clientHeight-8,head.y*scaleY));
        for(const previous of placed)if(Math.abs(x-previous.x)<node.offsetWidth&&Math.abs(y-previous.y)<node.offsetHeight+10)y=previous.y-node.offsetHeight-10;
        y=Math.max(node.offsetHeight+4,y);placed.push({x,y});node.style.left=x+'px';node.style.top=y+'px';
      }
    }
  }
  const render=s=>{
    snapshot=s;
    for(const message of s.world.perceived.speech??[])rememberSpeech(message);
    const config=s.world.public.camera;
    if(!config)return;
    const signature=JSON.stringify(config);
    if(lastConfig!==signature){
      const sameWorld=worldId===config.world_id;
      lastConfig=signature;worldId=config.world_id;presets=config.presets;
      // Named local schemes are retired. Only the current in-memory view is retained.
      try{localStorage.removeItem('sao-camera:'+worldId)}catch{}
      let preset=sameWorld&&selected==='edit'&&validAngles(view)?view:presets.find(p=>p.id===(sameWorld?selected:'diagonal'));
      if(!preset){preset=presets[0];selected=preset.id}
      else if(!sameWorld)selected=preset.id;
      choices();use(preset);return;
    }
    draw();
  };
  function rememberSpeech(message){
    if(!message.remaining_ms||message.remaining_ms<=0)return;
    const old=speech.get(message.sender_id);
    if(old&&old.seq>message.seq)return;
    const expires=performance.now()+Math.min(8000,message.remaining_ms);
    speech.set(message.sender_id,{seq:message.seq,text:message.text,expires:old?.seq===message.seq?Math.min(old.expires,expires):expires});
  }
  render.speak=message=>{rememberSpeech(message);draw();};
  render.clearSpeech=()=>{speech.clear();bubbleLayer?.replaceChildren();};
  setInterval(()=>{if(speech.size&&!document.hidden)draw();},250);
  window.addEventListener('resize',draw);
  return render;
}

