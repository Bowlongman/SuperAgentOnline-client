import {z} from 'zod';
export const rangeSchema=z.strictObject({render:z.number().min(1).max(500),detail:z.number().min(0).max(150)}).refine(v=>v.detail<=v.render,{message:'detail 不能超过 render'});
export const sensingDefaults={terrain:300,terrain_detail:15,detail_budget:20,render_budget:256,hysteresis:5,bubble:5,kinds:{player:{render:80,detail:20},npc:{render:80,detail:20},vehicle:{render:150,detail:40},building:{render:300,detail:30},generic:{render:40,detail:10}}};
export const sensingSchema=z.strictObject({terrain:z.number().min(30).max(500),terrain_detail:z.number().int().min(1).max(32),detail_budget:z.number().int().min(1).max(100),render_budget:z.number().int().min(1).max(500),hysteresis:z.number().min(0).max(20),bubble:z.number().min(0).max(30),kinds:z.strictObject(Object.fromEntries(Object.keys(sensingDefaults.kinds).map(k=>[k,rangeSchema])))});
export function kindOf(unit,type){return unit.type==='player'?'player':type?.kind??(['npc','vehicle','building'].includes(unit.kind)?unit.kind:'generic')}
export function ranges(rules,unit,type){const config=rules.sensing??sensingDefaults;return type?.perception??config.kinds[kindOf(unit,type)]}
// Axis-aligned physical footprint, relative to authoritative unit position. Visual yaw does not change this footprint.
export function distanceTo(actor,target,metric='euclidean'){
 const b=target.bounds,dx=Math.max(0,(target.x+(b?.min_x??0))-actor.x,actor.x-(target.x+(b?.max_x??0))),dz=Math.max(0,(target.z+(b?.min_z??0))-actor.z,actor.z-(target.z+(b?.max_z??0)));
 return metric==='manhattan'?dx+dz:Math.hypot(dx,dz);
}
