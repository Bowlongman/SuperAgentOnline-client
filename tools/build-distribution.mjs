import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,copyFile,rm,rename,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=join(root,'dist','downloads');
const metadata=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const staging=await mkdtemp(join(tmpdir(),'sao-client-distribution-'));
const clientStage=join(staging,'client');
const filename='super-agent-online-client-windows.zip';
const executable='SuperAgentOnline.Client.exe';
const compiler=join(process.env.WINDIR??'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

function run(command,args){
  const result=spawnSync(command,args,{windowsHide:true,encoding:'utf8'});
  if(result.error||result.status!==0)throw Error('Client build command failed: '+command+'\n'+(result.stderr||result.stdout||result.error?.message));
}

try{
  if(process.platform!=='win32')throw Error('Build the Windows client on Windows with the .NET Framework C# compiler.');
  await stat(compiler);
  await mkdir(clientStage,{recursive:true});
  const exePath=join(clientStage,executable);
  run(compiler,['/nologo','/target:winexe','/optimize+','/platform:anycpu','/utf8output',
    '/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Net.Http.dll',
    '/out:'+exePath,join(root,'client-launcher','Program.cs')]);
  const executableBytes=await readFile(exePath);
  const peOffset=executableBytes.readUInt32LE(0x3c);
  if(executableBytes.subarray(0,2).toString()!=='MZ'||executableBytes.subarray(peOffset,peOffset+4).toString()!=='PE\0\0')throw Error('Compiler output is not a PE executable.');
  run(exePath,['/self-test']);
  await copyFile(join(root,'client-launcher','README.txt'),join(clientStage,'README.txt'));
  const archive=join(staging,filename);
  const zipProgram=`import os,sys,zipfile
source,target=sys.argv[1:]
expected={'SuperAgentOnline.Client.exe','README.txt'}
assert set(os.listdir(source))==expected,'Client package contains unexpected files'
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for name in sorted(expected):
  with open(os.path.join(source,name),'rb') as file: data=file.read()
  entry=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0))
  entry.compress_type=zipfile.ZIP_DEFLATED
  entry.external_attr=0o644<<16
  archive.writestr(entry,data)
with zipfile.ZipFile(target) as archive:
 assert set(archive.namelist())==expected
 assert archive.testzip() is None
`;
  let zipped=false;
  for(const python of ['python','python3']){
    const result=spawnSync(python,['-c',zipProgram,clientStage,archive],{windowsHide:true,encoding:'utf8'});
    if(result.error?.code==='ENOENT')continue;
    if(result.error||result.status!==0)throw Error('Client ZIP creation failed: '+(result.stderr||result.error?.message));
    zipped=true;break;
  }
  if(!zipped)throw Error('Python 3 is required to create the client ZIP.');
  const bytes=await readFile(archive);
  await mkdir(output,{recursive:true});
  // Copy across volumes first, then atomically replace on the destination volume.
  const pendingArchive=join(output,filename+'.pending');
  await copyFile(archive,pendingArchive);
  await rename(pendingArchive,join(output,filename));
  const manifest={version:metadata.version,generated_at:new Date().toISOString(),downloads:[{
    id:'client',title:'Windows 游戏客户端',description:'双击 EXE，通过独立 Edge 窗口连接主机的 Web 游戏。需要 Windows、.NET Framework 4.5 或更新版本与 Microsoft Edge。',
    filename,bytes:bytes.length,size:bytes.length,sha256:hash(bytes),version:metadata.version,
    platform:'windows',kind:'web-client-launcher',requires:['Microsoft Edge','.NET Framework 4.5+'],executable,
    executable_sha256:hash(executableBytes)
  }]};
  const pendingManifest=join(output,'manifest.pending.json');
  await writeFile(pendingManifest,JSON.stringify(manifest,null,2)+'\n');
  await rename(pendingManifest,join(output,'manifest.json'));
  console.log(JSON.stringify(manifest,null,2));
}finally{
  if(resolve(staging).startsWith(resolve(tmpdir())+'\\')&&staging.includes('sao-client-distribution-'))await rm(staging,{recursive:true,force:true});
}
