// A disposable model turn with one deadline across connection, snapshot and inference.
// No detached Promise.race work may submit a prompt after cancellation or cleanup.
import {randomUUID} from 'node:crypto';
import {NodeApiClient,unwrap,createTurnCollector} from './dsh-client.js';

export function modelTurnFailure(reason) {
  if (reason?.kind === 'cancelled' || reason?.kind === 'canceled') return new Error('模型请求已取消');
  if (reason !== 'error' && reason?.kind !== 'error') return null;
  // Never echo the upstream body: provider errors can contain credentials or
  // request content. Translate known failures to fixed actionable messages.
  const failure = reason?.error ?? reason?.failure;
  const raw = typeof failure?.message === 'string' ? failure.message : '';
  // DSH carries structured provider facts, while older adapters only supply a
  // message. Its DeepSeek fallback places the status at the end, not the start.
  // A bare 400 never proves context overflow and must not trigger a new turn.
  const structuredStatus = failure?.status ?? failure?.failure?.status;
  const status = Number.isInteger(structuredStatus) && structuredStatus >= 100 && structuredStatus <= 599
    ? String(structuredStatus)
    : /^\s*(?:HTTP\s+)?(\d{3})(?=\s|:|$)/i.exec(raw)?.[1]
      ?? /^\s*DeepSeek\s*Messages request failed\s*\((\d{3})\)\s*$/i.exec(raw)?.[1];
  const code = failure?.code;
  const suffix = status ? '（HTTP '+status+'）' : '';
  let message = '模型服务调用失败'+suffix+'，请检查服务商配置与可用状态。';
  if (status === '402' || ['QUOTA','ACCOUNT_QUOTA'].includes(code) || /insufficient[_ -]?(?:quota|balance|credit)|(?:balance|credit).*insufficient|余额不足|欠费/i.test(raw)) message = '模型服务余额或额度不足'+suffix+'，请到对应服务商补充余额，或切换有额度的模型服务。';
  else if (status === '401' || status === '403' || code === 'AUTH') message = '模型服务密钥无效或没有访问权限'+suffix+'，请检查对应服务的密钥和模型权限。';
  else if (status === '429' || code === 'RATE_LIMIT') message = '模型服务请求受限'+suffix+'，请稍后重试，并检查服务商的请求限额。';
  else if (code === 'CONTEXT_WINDOW_EXCEEDED') message = '模型服务的上下文容量已超限'+suffix+'，请缩短输入或检查该模型的上下文容量设置。';
  else if (/does not support image|image.*not supported|unsupported.*image/i.test(raw)) message = '当前模型服务不支持图片输入，请选择支持图片的模型并配置图片输入。';
  else if (status === '404') message = '模型或接口不存在'+suffix+'，请检查模型 ID、API 根地址和接口协议。';
  else if (status === '400') message = '模型服务拒绝请求'+suffix+'，请检查模型 ID、接口协议及该模型支持的功能。';
  else if (status?.startsWith('5')) message = '模型服务暂时不可用'+suffix+'，请稍后重试或切换模型服务。';
  return new Error(message);
}

export async function completeDshText({baseUrl,cwd,content,preset='qq-chat',selectModel,signal,timeoutMs=65000,onEvent,
  api=new NodeApiClient(baseUrl,15000,{}),createSocket=url=>new WebSocket(url.url,{headers:{cookie:url.cookie}})}={}) {
  const controller=new AbortController();
  const cancel=()=>controller.abort(signal?.reason || new Error('模型请求已取消'));
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('模型请求超时')),timeoutMs);
  const deadline=controller.signal;
  let socket,sessionId;
  const listeners=[];
  const listen=(name,fn)=>{socket.addEventListener(name,fn);listeners.push([name,fn]);};
  const check=()=>deadline.throwIfAborted();
  // Some Host operations cannot cancel a committed create. Await their result so
  // its id is known for cleanup, then check before proceeding to another phase.
  const rpc=async(method,args)=>{check();const value=unwrap(await api.callUnary(method,args),method);return value;};
  try {
    check();
    const workspace=await rpc('workspace.create',{path:cwd});check();
    const created=await rpc('session.create',{workspaceId:workspace.workspace.workspaceId,agentPreset:preset});
    sessionId=created.sessionId;check();
    if(selectModel)await selectModel(api,sessionId,deadline);check();
    const cookie=await api.ensureAuth(deadline);check();
    const url=new URL('/api/remote.mux',baseUrl);url.protocol=url.protocol==='https:'?'wss:':'ws:';
    socket=createSocket({url,cookie});
    const streamId=randomUUID(),collector=createTurnCollector();let completed=false;
    let openedResolve,readyResolve,doneResolve,rejectAll;
    const opened=new Promise(resolve=>openedResolve=resolve),ready=new Promise(resolve=>readyResolve=resolve);
    const done=new Promise(resolve=>doneResolve=resolve);
    const failure=new Promise((_,reject)=>rejectAll=reject);failure.catch(()=>{});
    const fail=error=>{const reason=error instanceof Error?error:new Error('模型连接已中断');if(!deadline.aborted)controller.abort(reason);rejectAll(reason);};
    const abort=()=>fail(deadline.reason);
    deadline.addEventListener('abort',abort,{once:true});
    const wait=promise=>Promise.race([promise,failure]);
    listen('open',()=>openedResolve());
    listen('error',()=>{if(!completed)fail(new Error('模型连接失败'));});
    listen('close',()=>{if(!completed)fail(new Error('模型连接已关闭'));});
    listen('message',event=>{
      if(deadline.aborted)return;
      try {
        const message=JSON.parse(event.data);if(message.streamId!==streamId)return;
        if(message.type==='error')fail(new Error('模型流返回错误'));
        if(message.type==='item'&&message.value?.type==='snapshot')readyResolve();
        if(message.type==='item'&&message.value?.type==='event'){
          onEvent?.(message.value.event);
          const answer=collector.push(message.value.event);if(answer){completed=true;doneResolve(answer);}
        }
      } catch { fail(new Error('模型流返回无效数据')); }
    });
    try {
      check();await wait(opened);check();
      socket.send(JSON.stringify({type:'open',streamId,endpoint:'session/follow',payload:{args:{request:{address:{kind:'session',sessionId}}}}}));
      await wait(ready);check();
      // The request is abortable; a slow POST cannot hold a cancelled model turn.
      unwrap(await api.callUnary('session.prompt',{sessionId,mode:'queue',content},deadline),'session/prompt');check();
      const answer=await wait(done);check();
      const modelError=modelTurnFailure(answer.reason);if(modelError)throw modelError;
      if(!answer.text?.trim())throw new Error(answer.hasReasoning ? '模型接口只返回了推理内容，没有返回正式答案。请检查该服务的返回格式或改用其他视觉模型后重试。' : '模型没有返回文本');
      return answer.text.trim();
    } finally {deadline.removeEventListener('abort',abort);}
  } finally {
    clearTimeout(timer);signal?.removeEventListener('abort',cancel);
    for(const [name,fn] of listeners)socket?.removeEventListener(name,fn);
    try{socket?.close();}catch{}
    if(sessionId){
      // Failure to stop must not skip archival. Cleanup has its own small budget,
      // independent of the already-aborted foreground request.
      try{await api.stopSessionWork(sessionId,{timeoutMs:5000});}catch{}
      try{await api.callUnary('workspace.archiveSession',{sessionId},AbortSignal.timeout(5000));}catch{}
    }
  }
}
