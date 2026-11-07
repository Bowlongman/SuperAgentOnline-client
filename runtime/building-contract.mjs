import {z} from 'zod';

const offset=z.number().int().min(-1000).max(1000);
const coordinate=z.number().int().min(-10000).max(10000);
export const buildingCollisionSchema=z.strictObject({cells:z.array(z.tuple([offset,offset])).max(10000)});
export const buildingEntranceSchema=z.strictObject({
  id:z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),x:coordinate,z:coordinate,
  name:z.string().trim().min(1).max(100).optional()
});

// Collision offsets already use the rendered world's axes and scale. Bounds only
// describe the visible footprint and can include windows, doors and overhangs.
export function buildingCollision(core,invalid){
  const tiles=Object.create(null);
  let count=0;
  for(const unit of core.instances){
    if(!unit.collision)continue;
    const x=Math.round(unit.x),z=Math.round(unit.z);
    const declared=new Set();
    for(const [dx,dz] of unit.collision.cells){
      const key=(x+dx)+','+(z+dz);
      if(Math.abs(x+dx)>10000||Math.abs(z+dz)>10000)invalid('BUILDING_COLLISION_POSITION',unit.id,'建筑占地超出世界坐标范围');
      if(declared.has(key))invalid('BUILDING_COLLISION_DUPLICATE',unit.id,'同栋建筑重复声明占地格 '+key);
      declared.add(key);
      if(unit.bounds&&(x+dx+.5<unit.x+unit.bounds.min_x||x+dx-.5>unit.x+unit.bounds.max_x||z+dz+.5<unit.z+unit.bounds.min_z||z+dz-.5>unit.z+unit.bounds.max_z))
        invalid('BUILDING_COLLISION_OUTSIDE_BOUNDS',unit.id,'建筑占地格 '+key+' 位于声明的可见范围之外');
      if(!tiles[key]){
        if(++count>100000)invalid('BUILDING_COLLISION_BUDGET',unit.id,'合成地图建筑占地超过 100000 格');
        tiles[key]=unit.id;
      }
    }
  }
  return tiles;
}
