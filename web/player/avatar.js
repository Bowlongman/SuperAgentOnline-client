import * as T from '/three.module.js';
import {GLTFLoader} from '/player-loader.js';

export async function createAvatar(canvas,character){
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setSize(280,260,false);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(32,280/260,.1,30);
  camera.position.set(1.3,1.15,3.6);camera.lookAt(0,.9,0);
  scene.add(new T.HemisphereLight(0xfff3df,0x9bb9dc,2));
  const key=new T.DirectionalLight(0xffefd1,2);key.position.set(3,4,2);scene.add(key);
  const loader=new GLTFLoader();
  const asset=id=>(/^\/api\/(?:avatars|mod-assets)\//).test(id)?id:'/api/avatars/'+id;
  const {scene:body,animations}=await loader.loadAsync(character.model==='traveler'?'/traveler.glb':asset(character.model));
  const box=new T.Box3().setFromObject(body),scale=1.75/Math.max(.001,box.max.y-box.min.y);
  const center=box.getCenter(new T.Vector3());
  body.position.set(-center.x,-box.min.y,-center.z);
  const rig=new T.Group();rig.add(body);rig.scale.setScalar(scale);scene.add(rig);
  const mixer=new T.AnimationMixer(body);
  const actions={};
  for(const state of ['idle','moving']){
    const choice=character.actions?.[state];
    if(!choice)continue;
    let clip;
    if(choice==='walk'&&character.model==='traveler')clip=animations[0];
    else if(choice!=='breathe'&&choice!=='walk')clip=(await loader.loadAsync(asset(choice))).animations[0];
    if(clip)actions[state]=mixer.clipAction(clip);
  }
  let prior;

  let end=0,previous=performance.now();
  renderer.setAnimationLoop(time=>{
    const dt=Math.min(.1,Math.max(0,(time-previous)/1000));previous=time;
    if(canvas.offsetParent===null)return;
    const state=time<end?'moving':'idle';
    if(state!==prior){
      mixer.stopAllAction();actions[state]?.reset().play();prior=state;
    }
    mixer.update(dt);
    rig.scale.y=scale;
    rig.position.y=0;
    if(!actions[state]){
      if(state==='idle')rig.scale.y*=1+.009*Math.sin(time*.0028);
      else rig.position.y=.045*Math.abs(Math.sin(time*.015));
    }
    renderer.render(scene,camera);
  });
  const play=until=>{end=until;};
  play.dispose=()=>{
    renderer.setAnimationLoop(null);mixer.stopAllAction();mixer.uncacheRoot(body);
    body.traverse(node=>{
      node.geometry?.dispose();
      for(const m of [].concat(node.material??[])){
        for(const v of Object.values(m))if(v?.isTexture)v.dispose();
        m.dispose();
      }
    });
    renderer.dispose();
  };
  return play;
}
