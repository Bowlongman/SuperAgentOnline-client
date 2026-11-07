import {createHash} from 'node:crypto';
import {coreError} from './core-contract.mjs';
export function validateModResource(read,asset){
 const bad=message=>coreError('MOD_RESOURCE_INVALID',asset.sha256,message);
 let bytes;try{bytes=Buffer.from(read('mods/assets/'+asset.sha256+'.glb'))}catch{bad('资源文件不存在')}
 if(bytes.length!==asset.bytes||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)bad('资源长度或摘要不符');
 if(bytes.length<20||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)bad('需要 GLB 2.0');
 let json;try{const n=bytes.readUInt32LE(12);if(bytes.readUInt32LE(16)!==0x4e4f534a||n+20>bytes.length)bad('GLB JSON 损坏');json=JSON.parse(bytes.subarray(20,20+n).toString('utf8'))}catch{bad('GLB JSON 无效')}
 if(json.asset?.version!=='2.0'||[...(json.buffers??[]),...(json.images??[])].some(v=>v.uri!==undefined))bad('资源必须自包含，不允许外部 URI');
 const supported=new Set(['EXT_mesh_gpu_instancing','KHR_materials_unlit','KHR_texture_transform','KHR_mesh_quantization','KHR_materials_emissive_strength']);
 if((json.extensionsRequired??[]).some(e=>!supported.has(e)))bad('需要尚未支持的 GLTF 扩展');
 if((json.nodes?.length??0)>50000||(json.meshes?.length??0)>10000)bad('资源节点超过预算');
 for(const n of json.nodes??[]){const inst=n.extensions?.EXT_mesh_gpu_instancing;if(inst&&(!Object.keys(inst.attributes??{}).length||Object.values(inst.attributes).some(i=>!Number.isInteger(i)||i<0||!json.accessors?.[i])))bad('实例化网格缺少合法 accessor')}
 return bytes;
}
