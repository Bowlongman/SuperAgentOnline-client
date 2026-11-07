import * as T from '/three.module.js';
import {GLTFLoader} from '/player-loader.js';

export function editorScene(canvas,onStatus,onGround){
 const renderer=new T.WebGLRenderer({canvas,antialias:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 const scene=new T.Scene();scene.background=new T.Color('#151321');
 scene.add(new T.HemisphereLight('#fff0dd','#647493',2));
 const light=new T.DirectionalLight('#fff1df',2);light.position.set(8,14,9);scene.add(light);
 const camera=new T.PerspectiveCamera(42,1,.05,10000),loader=new GLTFLoader();
 const raycaster=new T.Raycaster(),ground=new T.Plane(new T.Vector3(0,1,0),0);
 let root=new T.Group();scene.add(root);
 let epoch=0,request,yaw=.65,pitch=.55,distance=12,fitDistance=12,target=new T.Vector3(0,1,0),origin={x:0,z:0},drag;
 function dispose(object){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  object.traverse(child=>{
   if(child.geometry)geometries.add(child.geometry);
   child.skeleton?.dispose();
   for(const material of [].concat(child.material??[])){
    materials.add(material);
    for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
   }
  });
  for(const value of geometries)value.dispose();
  for(const value of textures)value.dispose();
  for(const value of materials)value.dispose();
 }
 function draw(){
  const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  camera.position.set(target.x+distance*Math.sin(yaw)*Math.cos(pitch),target.y+distance*Math.sin(pitch),target.z+distance*Math.cos(yaw)*Math.cos(pitch));
  camera.lookAt(target);renderer.render(scene,camera);
 }
 function fit(){
  const box=new T.Box3();for(const child of root.children)if(!child.userData.skipFit)box.expandByObject(child);
  const size=box.getSize(new T.Vector3());
  if(box.isEmpty()){target.set(0,1,0);fitDistance=12}
  else{box.getCenter(target);fitDistance=Math.max(5,Math.max(size.x,size.y,size.z)*1.8)}
  distance=fitDistance;draw();
 }
 function addOverlays(building,options,terrain){
  const height=building?.presentation?.height??0;
  if(options.collision&&building?.collision?.cells?.length){
   const cells=building.collision.cells;
   const mesh=new T.InstancedMesh(new T.BoxGeometry(1,.06,1),new T.MeshBasicMaterial({color:'#ff7979',transparent:true,opacity:.48}),cells.length);
   const matrix=new T.Matrix4();
   cells.forEach(([x,z],index)=>mesh.setMatrixAt(index,matrix.makeTranslation(Math.round(building.x)+x-origin.x,height+.04,Math.round(building.z)+z-origin.z)));
   mesh.computeBoundingBox();mesh.computeBoundingSphere();root.add(mesh);
  }
  if(options.collision)for(const entrance of building?.entrances??[]){
   const marker=new T.Mesh(new T.SphereGeometry(.18,12,8),new T.MeshBasicMaterial({color:'#8df3ad'}));
   marker.position.set(entrance.x-origin.x,height+.2,entrance.z-origin.z);root.add(marker);
  }
  if(options.bounds&&building?.bounds){
   const b=building.bounds,points=[[b.min_x,b.min_z],[b.max_x,b.min_z],[b.max_x,b.max_z],[b.min_x,b.max_z]].map(([x,z])=>new T.Vector3(x,height+.08,z));
   root.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#9ad2ff'})));
  }
  const colors={road:'#7c8490',bridge:'#c1a276',water:'#548db6',boundary:'#493e60'};
  for(const change of terrain??[]){
   const tile=change.after;
   if(!tile||Math.hypot(change.x-origin.x,change.z-origin.z)>50)continue;
   const mesh=new T.Mesh(new T.BoxGeometry(1,.04,1),new T.MeshLambertMaterial({color:colors[tile.type]??'#7c8490'}));
   mesh.position.set(change.x-origin.x,tile.height+.01,change.z-origin.z);root.add(mesh);
  }
 }
 async function show(building,assets,key,options={},terrain=[]){
  const ticket=++epoch;request?.abort();request=new AbortController();
  scene.remove(root);dispose(root);root=new T.Group();scene.add(root);
  origin={x:building?.x??terrain[0]?.x??0,z:building?.z??terrain[0]?.z??0};
  addOverlays(building,options,terrain);
  const grid=new T.GridHelper(30,30,'#565069','#30293e');grid.userData.skipFit=true;root.add(grid);
  fit();
  if(!building?.model){onStatus('选择建筑以预览模型；当前显示附近已应用的地形修改。');return}
  onStatus('正在读取模型…');
  try{
   const asset=assets.find(item=>item.model===building.model);
   const path=asset?.preview_url??(building.model==='traveler'?'/traveler.glb':building.model);
   const url=new URL(path,location.origin);if(url.origin!==location.origin)throw Error('预览资源须由当前服务提供');
   const response=await fetch(url,{headers:key?{Authorization:'Bearer '+key}:{},signal:request.signal});
   if(!response.ok)throw Error('模型读取失败（'+response.status+'）');
   const blob=await response.blob(),buffer=await blob.arrayBuffer();
   const gltf=await new Promise((resolve,reject)=>loader.parse(buffer,'',resolve,reject));
   if(ticket!==epoch){dispose(gltf.scene);return}
   const body=gltf.scene,p=building.presentation??{},box=new T.Box3().setFromObject(body),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
   let scale=p.scale??1;
   if(p.normalize==='height'||p.normalize==='length'){
    scale/=Math.max(.001,p.normalize==='height'?size.y:size.x);body.position.set(-center.x,-box.min.y,-center.z);
   }
   const group=new T.Group();group.add(body);group.scale.setScalar(scale);if(p.reflect_z)group.scale.z*=-1;
   group.rotation.y=(p.yaw??0)*Math.PI/180;group.position.y=p.height??0;root.add(group);fit();
   onStatus('拖动旋转；聚焦画布后滚轮缩放。红格与入口使用声明坐标，不从外观自动推断碰撞。');
  }catch(error){if(ticket===epoch&&error.name!=='AbortError')onStatus(error.message)}
 }
 canvas.onpointerdown=event=>{
  canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);
  drag={x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY};
 };
 canvas.onpointermove=event=>{
  if(!drag)return;
  yaw-=(event.clientX-drag.x)*.008;pitch=Math.max(.08,Math.min(1.45,pitch+(event.clientY-drag.y)*.008));
  drag.x=event.clientX;drag.y=event.clientY;draw();
 };
 canvas.onpointerup=event=>{
  if(!drag)return;
  const moved=Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY);drag=null;
  if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  if(moved>4)return;
  const box=canvas.getBoundingClientRect(),point=new T.Vector3();
  raycaster.setFromCamera(new T.Vector2((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1),camera);
  if(raycaster.ray.intersectPlane(ground,point))onGround(Math.round(point.x+origin.x),Math.round(point.z+origin.z));
 };
 canvas.onpointercancel=()=>{drag=null};
 canvas.addEventListener('wheel',event=>{
  if(document.activeElement!==canvas)return;
  event.preventDefault();distance=Math.max(.5,Math.min(5000,distance*Math.exp(event.deltaY*.001)));draw();
 },{passive:false});
 canvas.onkeydown=event=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(event.key))return;
  event.preventDefault();
  if(event.key==='ArrowLeft')yaw-=.12;
  if(event.key==='ArrowRight')yaw+=.12;
  if(event.key==='ArrowUp')pitch=Math.min(1.45,pitch+.1);
  if(event.key==='ArrowDown')pitch=Math.max(.08,pitch-.1);
  if(event.key==='+')distance=Math.max(.5,distance*.8);
  if(event.key==='-')distance=Math.min(5000,distance*1.25);
  if(event.key==='Home'){yaw=.65;pitch=.55;distance=fitDistance}
  draw();
 };
 const resize=new ResizeObserver(draw);resize.observe(canvas);draw();
 return {show,reset(){yaw=.65;pitch=.55;distance=fitDistance;draw()},zoom(factor){distance=Math.max(.5,Math.min(5000,distance*factor));draw()},dispose(){epoch++;request?.abort();resize.disconnect();dispose(root);renderer.dispose()}};
}
