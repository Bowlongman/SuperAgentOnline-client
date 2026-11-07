import {buildingCollisionSchema,buildingEntranceSchema} from './building-contract.mjs';
import {rangeSchema} from './perception-contract.mjs';
import {z} from 'zod';
const id=z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const text=z.string().min(1).max(500);
const value=z.union([z.number().finite(),z.boolean(),z.string().max(1000),z.null()]);
const side=z.enum(['self','target']);
export const attributeSchema=z.strictObject({id,type:z.enum(['number','boolean','text','enum']),default:value,min:z.number().optional(),max:z.number().optional(),values:z.array(z.string()).max(64).optional(),description:text,visibility:z.enum(['public','owner']).default('public'),writers:z.array(id).max(100)});
export const conditionSchema=z.discriminatedUnion('op',[
 z.strictObject({op:z.literal('near'),distance:z.number().min(0).max(32)}),
 z.strictObject({op:z.literal('attribute'),unit:side,attribute:id,compare:z.enum(['eq','ne','lt','lte','gt','gte']),value}),
 z.strictObject({op:z.literal('state'),id,absent:z.boolean().default(false)})
]);
export const stateSchema=z.strictObject({id,subject:id,target:id,conditions:z.array(conditionSchema).min(1).max(32),enter:text,exit:text});
export const effectSchema=z.discriminatedUnion('op',[
 z.strictObject({op:z.literal('set'),unit:side,attribute:id,value}),
 z.strictObject({op:z.literal('add'),unit:side,attribute:id,value:z.number().finite()}),
 z.strictObject({op:z.literal('transfer'),from:side,to:side,attribute:id,amount:z.number().positive().finite()}),
 z.strictObject({op:z.literal('move'),unit:side,dx:z.number().int().min(-1).max(1),dz:z.number().int().min(-1).max(1)})
]);
const effects=z.array(effectSchema).max(32);
const choice=z.strictObject({id,description:text,next:id.nullable(),effects,feedback:text});
const phase=z.strictObject({id,description:text,path:z.strictObject({x:z.number().int().min(-10000).max(10000),z:z.number().int().min(-10000).max(10000)}).optional(),choices:z.array(choice).max(16),after_ms:z.number().int().min(1).max(3600000).optional(),next:id.nullable().optional(),effects,feedback:text});
export const abilitySchema=z.strictObject({id,owner:id,target:id,range:z.number().min(0).max(150).optional(),target_scope:z.enum(['self','perceived']).default('perceived'),description:text,trigger:z.enum(['active','state_enter','interval']).default('active'),trigger_state:id.optional(),interval_ms:z.number().int().min(1000).max(86400000).optional(),requires:z.array(id).max(32),forbids:z.array(id).max(32).default([]),effects,feedback:text,phases:z.array(phase).max(32).default([]),cancellable:z.boolean().default(false),cancel_feedback:text.default('执行已取消'),cooldown_ms:z.number().int().min(0).max(3600000).default(0)});
export const typeSchema=z.strictObject({id,kind:z.enum(['generic','npc','vehicle','building']).optional(),perception:rangeSchema.optional(),attributes:z.array(id).max(64),abilities:z.array(id).max(64)});
export const instanceSchema=z.strictObject({id,type:id,name:text,collision:buildingCollisionSchema.optional(),entrances:z.array(buildingEntranceSchema).max(64).optional(),bounds:z.strictObject({min_x:z.number().min(-1000).max(0),max_x:z.number().min(0).max(1000),min_z:z.number().min(-1000).max(0),max_z:z.number().min(0).max(1000)}).optional(),model:z.union([z.literal('traveler'),z.string().regex(/^\/api\/(?:avatars|mod-assets)\/[a-f0-9]{64}$/)]),x:z.number().finite().min(-10000).max(10000),z:z.number().finite().min(-10000).max(10000),presentation:z.strictObject({height:z.number().min(-1000).max(1000).default(0),yaw:z.number().min(-360).max(360).default(0),scale:z.number().positive().max(1000).default(1),normalize:z.enum(['none','height','length']).default('none'),reflect_z:z.boolean().default(false)}).optional(),attributes:z.record(id,value).default({})});
export function coreError(code,path,message){throw Object.assign(new Error(code+': '+message),{status:422,issues:[{code,path,message}]})}
export function checkValue(def,v){
 const ok=def.type==='number'?typeof v==='number'&&Number.isFinite(v)&&(def.min===undefined||v>=def.min)&&(def.max===undefined||v<=def.max):def.type==='boolean'?typeof v==='boolean':def.type==='text'?typeof v==='string'&&v.length<=1000:def.values?.includes(v);
 if(!ok)coreError('CORE_ATTRIBUTE_VALUE',def.id,'属性值类型或范围不合法');
}
export function validateCore(core){
 for(const k of ['attributes','types','instances','states','abilities'])if(core[k].length>500)coreError('CORE_BUDGET',k,'合成世界定义超过预算');
 const maps={};for(const k of ['attributes','types','instances','states','abilities'])maps[k]=new Map(core[k].map(v=>[v.id,v]));
 const need=(kind,key)=>maps[kind].get(key)??coreError('CORE_REFERENCE',kind+'.'+key,'引用不存在');
 const attached=(type,key)=>{const t=need('types',type);if(!t.attributes.includes(key))coreError('CORE_ATTRIBUTE_BINDING',type+'.'+key,'单位类型未声明属性');return need('attributes',key)};
 for(const d of core.attributes){if(d.type!=='number'&&(d.min!==undefined||d.max!==undefined))coreError('CORE_ATTRIBUTE_SCHEMA',d.id,'只有数值允许上下限');if(d.type==='enum'&&(!d.values?.length||new Set(d.values).size!==d.values.length))coreError('CORE_ATTRIBUTE_SCHEMA',d.id,'枚举需要非空且唯一的成员');if(d.type!=='enum'&&d.values)coreError('CORE_ATTRIBUTE_SCHEMA',d.id,'只有枚举允许成员列表');checkValue(d,d.default);if(d.min!==undefined&&d.max!==undefined&&d.min>d.max)coreError('CORE_RANGE',d.id,'上下限冲突');for(const a of d.writers)need('abilities',a)}
 for(const t of core.types){if(t.id==='player'&&t.kind&&t.kind!=='generic')coreError('CORE_CONTROL',t.id,'玩家不能改为非玩家单位类别');for(const a of t.attributes)need('attributes',a);for(const a of t.abilities)if(need('abilities',a).owner!==t.id)coreError('CORE_OWNER',a,'能力归属类型不符')}
 for(const u of core.instances){const kind=need('types',u.type).kind;if(kind!=='building'&&(u.collision||u.entrances))coreError('CORE_BUILDING_FIELDS',u.id,'占地和入口仅适用于建筑类型');if(u.entrances&&new Set(u.entrances.map(e=>e.id)).size!==u.entrances.length)coreError('BUILDING_ENTRANCE_DUPLICATE',u.id,'同栋建筑的入口 ID 须唯一');if((!kind||kind==='generic')&&(!Number.isInteger(u.x)||!Number.isInteger(u.z)))coreError('CORE_POSITION_GRID',u.id,'普通单位必须使用整数网格');if(u.type==='player')coreError('CORE_CONTROL',u.id,'玩家实例只能通过角色服务创建');for(const [k,v]of Object.entries(u.attributes))checkValue(attached(u.type,k),v)}
 for(const s of core.states){need('types',s.subject);need('types',s.target);for(const c of s.conditions){if(c.op==='attribute'){
 const d=attached(c.unit==='self'?s.subject:s.target,c.attribute);checkValue(d,c.value);if(c.unit==='target'&&d.visibility==='owner')coreError('CORE_PRIVATE_CONDITION',s.id,'目标私有属性不能用于公开条件');if(!['eq','ne'].includes(c.compare)&&d.type!=='number')coreError('CORE_CONDITION_TYPE',s.id,'大小比较仅支持数值');
 }if(c.op==='state'){const ref=need('states',c.id);if(ref.subject!==s.subject||ref.target!==s.target)coreError('CORE_STATE_TARGET',s.id,'依赖状态必须绑定相同主体和目标类型')}}}
 const done=new Set(),pending=new Set();const visit=id=>{if(pending.has(id))coreError('CORE_STATE_CYCLE',id,'状态依赖循环');if(done.has(id))return;pending.add(id);for(const c of need('states',id).conditions)if(c.op==='state')visit(c.id);pending.delete(id);done.add(id)};
 for(const s of core.states)visit(s.id);core.state_order=[...done];
 for(const a of core.abilities){need('types',a.owner);need('types',a.target);
 if(a.trigger==='state_enter'){const s=need('states',a.trigger_state);if(s.subject!==a.owner||s.target!==a.target)coreError('CORE_TRIGGER',a.id,'触发状态的绑定不符')}
 if(a.trigger!=='state_enter'&&a.trigger_state!==undefined)coreError('CORE_TRIGGER',a.id,'触发状态只适用于状态进入触发');if(a.trigger!=='interval'&&a.interval_ms!==undefined)coreError('CORE_TRIGGER',a.id,'周期只适用于定时触发');
 if(a.trigger==='interval'&&!a.interval_ms)coreError('CORE_TRIGGER',a.id,'定时能力必须声明周期');
 if(a.trigger!=='active'&&a.phases.length)coreError('CORE_TRIGGER',a.id,'自动触发目前只支持一次原子效果，不允许人工选择阶段');
 for(const id of [...a.requires,...a.forbids]){const s=need('states',id);if(s.subject!==a.owner||s.target!==a.target)coreError('CORE_STATE_TARGET',a.id,'能力状态目标类型不匹配')}
 const phases=new Set(a.phases.map(p=>p.id));if(phases.size!==a.phases.length)coreError('CORE_PHASE',a.id,'阶段 ID 重复');
 for(const p of a.phases){if(!p.path&&p.after_ms===undefined&&p.next!==undefined)coreError('CORE_PHASE',a.id,'手动阶段须由选择指定下一阶段');if(p.path&&(p.after_ms!==undefined||p.choices.length||p.next===undefined||a.owner!=='player'))coreError('CORE_PATH_PHASE',a.id,'路径阶段仅支持玩家执行，须声明 next 且无计时或选择字段');if(!p.path&&p.after_ms===undefined&&p.effects.length)coreError('CORE_PHASE',a.id,'手动阶段的效果须放入选择中');if(p.after_ms!==undefined&&(p.choices.length||p.next===undefined))coreError('CORE_PHASE',a.id,'计时阶段必须指定下一阶段且不能同时提供选择');if(!p.path&&p.after_ms===undefined&&!p.choices.length)coreError('CORE_PHASE',a.id,'阶段没有出口');if(new Set(p.choices.map(c=>c.id)).size!==p.choices.length)coreError('CORE_PHASE',a.id,'选择 ID 重复');for(const next of [p.next,...p.choices.map(c=>c.next)])if(next!=null&&!phases.has(next))coreError('CORE_PHASE',a.id,'下一阶段不存在')}
 const all=[...a.effects,...a.phases.flatMap(p=>[...p.effects,...p.choices.flatMap(c=>c.effects)])];
 for(const e of all){if(e.op==='move'){if(need('types',e.unit==='self'?a.owner:a.target).kind==='building')coreError('CORE_BUILDING_STATIC',a.id,'建筑物不能通过移动效果改变位置');if(Math.abs(e.dx)+Math.abs(e.dz)!==1)coreError('CORE_MOVE',a.id,'移动必须为四邻一步');continue}
 for(const unit of e.op==='transfer'?[e.from,e.to]:[e.unit]){const d=attached(unit==='self'?a.owner:a.target,e.attribute);if(!d.writers.includes(a.id))coreError('CORE_WRITE_DENIED',a.id,'属性未授权该能力写入');if(e.op==='set')checkValue(d,e.value);else if(d.type!=='number')coreError('CORE_EFFECT_TYPE',a.id,'加减和转移仅支持数值')}
 }
 }
 return core;
}
