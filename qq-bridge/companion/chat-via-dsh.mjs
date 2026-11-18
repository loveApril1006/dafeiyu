// Text-only life-service inference. Temporary sessions are always stopped and archived.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {unwrap} from '../src/dsh-client.js';
import {completeDshText} from '../src/dsh-completion.js';
import {selectLocalModel} from './select-local-model.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const controller=new AbortController();
process.once('SIGTERM',()=>controller.abort(new Error('聊天请求已停止')));
process.once('SIGINT',()=>controller.abort(new Error('聊天请求已停止')));
process.on('message',message=>{if(message?.type==='cancel')controller.abort(new Error('聊天请求已停止'));});
try {
  let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>120000)throw new Error('Input too large');}
  const request=JSON.parse(input);
  const channel=request.channel || 'local';
  if(!/^(local|bilibili|qq-private:\d+)$/.test(channel))throw new Error('无效模型会话范围');
  const cwd=path.join(root,'companion-data/model-workspaces',createHash('sha256').update(channel).digest('hex'));
  fs.mkdirSync(cwd,{recursive:true});
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'..','config.json'),'utf8'));
  const persona=fs.readFileSync(path.join(root,'companion-persona.txt'),'utf8');
  const prompt='【本地生活功能助手】只输出聊天文本，不调用工具，不发送QQ消息，不执行任何外部操作。实际操作由本地程序根据用户明确命令执行；不要假装做完。\n'+persona+'\n现在：'+new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'\n'+request.prompt;
  const text=await completeDshText({baseUrl:cfg.dsh.baseUrl,cwd,timeoutMs:55000,signal:controller.signal,
    selectModel:(api,id,signal)=>selectLocalModel(api,unwrap,id,cfg.dsh,signal),content:[{type:'text',text:prompt}]});
  process.stdout.write(JSON.stringify({ok:true,text})+'\n');
}catch(error){process.stdout.write(JSON.stringify({ok:false,error:error.message})+'\n');process.exitCode=1;}
finally{if(process.connected)process.disconnect();}
