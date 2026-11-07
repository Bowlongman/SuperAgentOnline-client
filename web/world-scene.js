import * as T from '/three.module.js';
import {GLTFLoader} from '/player-loader.js';
// Rendering consumes inert, validated MOD resources. It never executes MOD code.
export function worldScene(canvas,onReady,onError){
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 const scene=new T.Scene();scene.background=new T.Color('#203135');scene.add(new T.HemisphereLight('#fff0d4','#ac9dbf',1.65));const light=new T.DirectionalLight('#ffddba',1.7);light.position.set(-3,7,-4);scene.add(light);
 const camera=new T.PerspectiveCamera(),loader=new GLTFLoader(),assets=new Map(),items=new Map();let current;
 // Circular perception clipping also clips oversized meshes spanning multiple cells.
 const perception={value:new T.Vector3()},radius={value:300};
 function clip(root){root.traverse(o=>{if(!o.isMesh)return;for(const material of Array.isArray(o.material)?o.material:[o.material]){
 material.onBeforeCompile=shader=>{shader.uniforms.saoCenter=perception;shader.uniforms.saoRadius=radius;shader.vertexShader='varying vec3 saoPosition;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvec4 saoLocal=vec4(transformed,1.0);\n#ifdef USE_BATCHING\nsaoLocal=batchingMatrix*saoLocal;\n#endif\n#ifdef USE_INSTANCING\nsaoLocal=instanceMatrix*saoLocal;\n#endif\nsaoPosition=(modelMatrix*saoLocal).xyz;');shader.fragmentShader='varying vec3 saoPosition;uniform vec3 saoCenter;uniform float saoRadius;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(distance(saoPosition.xz,saoCenter.xz)>saoRadius)discard;')};material.customProgramCacheKey=()=> 'sao-perception-v1';material.needsUpdate=true;
 }})}
 function clone(root){const copy=root.clone(true),map=new Map();const pair=(a,b)=>{map.set(a,b);a.children.forEach((c,i)=>pair(c,b.children[i]))};pair(root,copy);for(const[a,b]of map)if(a.isSkinnedMesh){b.skeleton=a.skeleton.clone();b.skeleton.bones=a.skeleton.bones.map(v=>map.get(v));b.bind(b.skeleton,a.bindMatrix);b.frustumCulled=false}return copy}
 function url(model){return model==='traveler'?'/traveler.glb':model.startsWith('/')?model:'/api/avatars/'+model}
 function load(model){const key=url(model);if(!assets.has(key))assets.set(key,loader.loadAsync(key).then(g=>{clip(g.scene);return g.scene}));return assets.get(key)}
 function remove(key){
  const {object,proxy}=items.get(key);
  scene.remove(object);
  items.delete(key);
  object.traverse(node=>{
   node.skeleton?.dispose();
   if(proxy&&node.isMesh){node.geometry.dispose();node.material.dispose()}
  });
 }
 function populate(key,def,scenery=false){
  const signature=JSON.stringify({model:def.model,presentation:def.presentation,reflect_z:def.reflect_z,proxy:def.proxy});let entry=items.get(key);if(entry?.signature===signature){if(!scenery)entry.object.position.set(def.x,def.presentation?.height??0,def.z);return;}
  if(entry)remove(key);
  const object=new T.Group();entry={signature,object,proxy:def.proxy};items.set(key,entry);scene.add(object);
  if(!scenery)object.position.set(def.x,def.presentation?.height??0,def.z);
  load(def.model).then(template=>{if(items.get(key)!==entry)return;let body;const p=def.presentation??{};if(def.proxy){const box=new T.Box3().setFromObject(template),size=box.getSize(new T.Vector3());body=new T.Group();const mesh=new T.Mesh(new T.BoxGeometry(Math.max(.1,size.x),Math.max(.1,size.y),Math.max(.1,size.z)),new T.MeshLambertMaterial({color:def.kind==='vehicle'?'#8498aa':'#a9a39b'}));mesh.position.copy(box.getCenter(new T.Vector3()));body.add(mesh);clip(body)}else body=clone(template);object.add(body);
   if(!scenery){const box=new T.Box3().setFromObject(body),size=box.getSize(new T.Vector3()),mid=box.getCenter(new T.Vector3());let scale=p.scale??1;
    if(p.normalize==='height'||p.normalize==='length'){scale/=Math.max(.001,p.normalize==='height'?size.y:size.x);body.position.set(-mid.x,-box.min.y,-mid.z)}
    object.scale.setScalar(scale);object.rotation.y=(p.yaw??0)*Math.PI/180;
   }
   if(def.reflect_z||p.reflect_z)object.scale.z*=-1;
   onReady();if(current)render(...current);
  }).catch(e=>{if(items.get(key)===entry)onError('场景资源加载失败：'+e.message)});
 }
 function render(s,view,width,height){current=[s,view,width,height];const p=s.world.perceived,[x,z]=p.position;
  renderer.setSize(width,height,false);camera.fov=2*Math.atan(1/2.24)*180/Math.PI;camera.aspect=width/height;camera.near=.1;camera.far=20000;
  const yaw=view.yaw*Math.PI/180,pitch=view.pitch*Math.PI/180,d=view.distance;
  camera.position.set(x-d*Math.sin(yaw)*Math.cos(pitch),p.height+.45+d*Math.sin(pitch),z-d*Math.cos(yaw)*Math.cos(pitch));camera.lookAt(x,p.height+.45,z);camera.updateProjectionMatrix();camera.projectionMatrix.elements[0]*=-1;camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  perception.value.set(x,0,z);radius.value=s.world.public.sensing?.terrain??300;scene.fog??=new T.Fog(scene.background,0,0);scene.fog.near=radius.value*.65;scene.fog.far=radius.value;
  const desired=new Set();for(const map of s.world.public.scenery??[]){const k='map:'+map.id;desired.add(k);populate(k,map,true)}
  const units=[...(s.world.public.render?.units??s.core?.units??[]),{...s.character,x,z,presentation:{height:p.height,normalize:'height',scale:1.75}}];
  const hysteresis=s.world.public.sensing?.hysteresis??5;
  for(const u of units){if(!u.model)continue;const k='unit:'+u.id;if(u.distance!==undefined&&u.distance>(u.render_distance??80)+(items.has(k)?hysteresis:0))continue;desired.add(k);const previous=items.get(k),threshold=(u.detail_distance??20)+(previous?(previous.distant?-hysteresis:hysteresis):0),far=u.distance>threshold,distant=u.kind==='npc'&&far;populate(k,{...u,proxy:far&&['vehicle','building'].includes(u.kind),model:distant?'traveler':u.model,attributes:undefined,presentation:distant?{height:u.presentation?.height??u.height??0,normalize:'height',scale:1.75}:(u.presentation??{height:u.height??p.surfaces.find(t=>t.x===u.x&&t.z===u.z)?.height??p.height,normalize:'height',scale:1.75})});items.get(k).distant=far}
  for(const key of items.keys())if(!desired.has(key))remove(key);
  renderer.render(scene,camera);
 }
 return {render,clear(){current=null;for(const key of items.keys())remove(key)}};
}
