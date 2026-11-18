import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';

export function publishQzone(root,payload,signal,{spawnImpl=spawn}={}){
 signal?.throwIfAborted();const python=[path.resolve(root,'../local-tts/runtime/python.exe'),path.resolve(root,'../GPT-SoVITS/runtime/python.exe')].find(fs.existsSync);
 if(!python)throw Object.assign(Error('缺少本机空间发布运行环境'),{uncertain:false});
 return new Promise((resolve,reject)=>{const child=spawnImpl(python,['-u',path.join(root,'companion/qzone-autopost.py')],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});let output='',settled=false;
  const fail=error=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);child.kill();reject(error);};
  const cancel=()=>fail(Object.assign(Error('空间发布已停止，结果需核对'),{uncertain:true}));
  const timer=setTimeout(()=>fail(Object.assign(Error('空间发布超时，结果未确认'),{uncertain:true})),65000);
  child.stdout.on('data',data=>{output+=data;if(output.length>100000)fail(Object.assign(Error('空间返回异常，结果未确认'),{uncertain:true}));});child.stderr.resume();
  child.once('error',()=>fail(Object.assign(Error('空间发布进程无法启动'),{uncertain:false})));
  child.once('close',()=>{if(settled)return;let value;try{value=JSON.parse(output.trim());}catch{return fail(Object.assign(Error('空间结果无法确认，不会自动重发'),{uncertain:true}));}
   if(value.ok!==true||(payload.probe?value.ready!==true:!value.tid))return fail(Object.assign(Error(String(value.error||'空间结果未确认').slice(0,200)),{uncertain:value.uncertain!==false}));
   settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);resolve(payload.probe?{ready:true}:{tid:value.tid});
  });
  child.stdin.on('error',()=>{});signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();else child.stdin.end(JSON.stringify(payload));
 });
}
