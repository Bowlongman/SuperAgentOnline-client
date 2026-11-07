import {distanceTo,kindOf,ranges,sensingDefaults} from './perception-contract.mjs';
const bearing=(p,u)=>{const x=u.x-p.x,z=u.z-p.z;return ['北','东北','东','东南','南','西南','西','西北'][(Math.round(Math.atan2(x,z)*4/Math.PI)+8)%8]};
const invalid=message=>{throw Object.assign(new Error(message),{status:400})};
export function agentSnapshot(s){
 if(!s?.world?.perceived||!s.world.perceived.surfaces)return s;
 const p=s.world.perceived,{surfaces,tiles,...perceived}=p;
 const {render,scenery,...pub}=s.world.public;
 const states=Object.fromEntries(Object.entries(s.character.states??{}).map(([key,value])=>{if(!Array.isArray(value?.steps))return [key,value];const {steps,...state}=value;return [key,{...state,remaining_steps:steps.length}]}));
 return {...s,character:{...s.character,states},world:{public:pub,perceived:{...perceived,terrain_summary:{radius:s.world.public.sensing.terrain_detail,cells:surfaces.length,walkable:surfaces.filter(t=>t.walkable).length,adjacent:surfaces.filter(t=>Math.abs(t.x-p.position[0])+Math.abs(t.z-p.position[1])===1)}}}};
}
export function present(world,p,s,{view,query}={}){
 const config=world.rules.sensing??sensingDefaults,raw=s.world.perceived;
 const byId=new Map();
 const all=[...raw.players.map(u=>({...u,type:'player',kind:'player'})),...(s.core?.units??[]),...raw.npcs,...raw.interactables];
 for(const u of all){const type=world.core.definition('types',u.type),kind=kindOf(u,type),range=ranges(world.rules,u,type),distance=distanceTo(p,u);if(distance>Math.min(500,range.render+config.hysteresis))continue;
  byId.set(u.id,{...byId.get(u.id),...u,kind,distance,direction:bearing(p,u),ranges:range});}
 const units=[...byId.values()],priority=new Set(s.options.flatMap(o=>[o.target_id,o.target]).filter(Boolean));
 for(const run of s.core?.executions??[])if(run.status==='running')priority.add(run.target);
 const session=world.actors.actor(p.id).session;if(session?.target)priority.add(session.target);
 const order=s.character.delivery,goal=order&&(order.phase==='pickup'?order.pickup:order.dropoff);
 const sorted=units.toSorted((a,b)=>Number(priority.has(b.id))-Number(priority.has(a.id))||(goal?Math.hypot(a.x-goal.x,a.z-goal.z)-Math.hypot(b.x-goal.x,b.z-goal.z):0)||a.distance-b.distance||a.id.localeCompare(b.id));
 if(query){
  const allowed=new Set(['id','kind','type','name','radius','offset','limit']);for(const k of Object.keys(query))if(!allowed.has(k))invalid('未知查询参数：'+k);
  const radius=query.radius===undefined?500:Number(query.radius),offset=query.offset===undefined?0:Number(query.offset),limit=query.limit===undefined?20:Number(query.limit);
  if(!Number.isFinite(radius)||radius<0||radius>500||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)invalid('查询范围或分页参数无效');
  if(query.kind&&!Object.hasOwn(config.kinds,query.kind))invalid('未知单位类别');if(query.name?.length>100)invalid('名称查询过长');
  const matches=units.filter(u=>(!query.id||u.id===query.id)&&(!query.kind||u.kind===query.kind)&&(!query.type||u.type===query.type)&&(!query.name||u.name.includes(query.name))&&u.distance<=radius).sort((a,b)=>a.id.localeCompare(b.id));
  return {rules_version:s.rules_version,origin:raw.position,total:matches.length,offset,limit,next_offset:offset+limit<matches.length?offset+limit:null,units:matches.slice(offset,offset+limit).map(u=>({...u,distance:Number(u.distance.toFixed(3))}))};
 }
 const details=sorted.filter(u=>u.distance<=u.ranges.detail||priority.has(u.id)).slice(0,config.detail_budget),ids=new Set(details.map(u=>u.id));
 const count={};for(const u of units){count[u.kind]??={total:0,detailed:0};count[u.kind].total++;if(ids.has(u.id))count[u.kind].detailed++;}
 const visual=sorted.filter(u=>u.model).slice(0,config.render_budget).map(u=>({id:u.id,type:u.type,kind:u.kind,name:u.name,model:u.model,x:u.x,z:u.z,height:u.height,presentation:u.presentation,bounds:u.bounds,distance:u.distance,render_distance:u.ranges.render,detail_distance:u.ranges.detail}));
 s.world.public.sensing=config;s.world.public.render={units:visual,total:units.filter(u=>u.model).length,truncated:units.filter(u=>u.model).length>visual.length};
 s.world.perceived={...raw,players:raw.players.filter(u=>ids.has(u.id)),npcs:raw.npcs.filter(u=>ids.has(u.id)),interactables:raw.interactables.filter(u=>ids.has(u.id)),unit_summary:{by_kind:count,total:units.length,detailed:details.length,limit:config.detail_budget,query:'/api/units'},landmarks:raw.landmarks.filter(u=>Math.hypot(u.x-p.x,u.z-p.z)<=30).slice(0,20),distant_landmarks:raw.landmarks.filter(u=>Math.hypot(u.x-p.x,u.z-p.z)>30).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)).slice(0,8).map(u=>({name:u.name,direction:bearing(p,u),distance:Math.round(Math.hypot(u.x-p.x,u.z-p.z))}))};
 s.core.units=details.filter(u=>(s.core?.units??[]).some(v=>v.id===u.id));
 return view==='agent'?agentSnapshot(s):s;
}
