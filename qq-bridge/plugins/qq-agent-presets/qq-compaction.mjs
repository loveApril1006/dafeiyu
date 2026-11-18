import path from 'node:path';import {pathToFileURL}from'node:url';
import {CHAT_OUTPUT_TOKENS,CHECKPOINT_INSTRUCTION,summaryRecords,byteChunks,cleanText}from'./context-policy.mjs';
// Normal installations resolve Core packages directly. Portable Electron keeps
// them inside its ASAR; use that same running engine, never a copied Core version.
async function core(name){try{return await import(name);}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;return import(pathToFileURL(path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules',name,'lib/index.js')).href);}}
const {BasicCompactionEngine}=await core('@deepseek-ai/dsh-compaction-basic');
const {BlockAssembler}=await core('@deepseek-ai/dsh-llm');
export default class QQCompactionEngine extends BasicCompactionEngine{
 constructor(ctx,config={}){
  const settings={thresholdRatio:.55,headroomTokens:2048,retainRatio:.12,maxTokens:2048,compactionRetries:1,maxOverflowRetries:2,...config};
  if(config.retainTokens!==undefined)delete settings.retainRatio;
  super(ctx,settings);
  ctx.on('agent/request',async(payload,next)=>{
   const route=await next();if(!route?.provider||!route?.model)return route;
   const info=await ctx.llm.resolveModelInfo(route.provider,route.model,payload.signal);
   const cap=Math.max(1,Math.min(CHAT_OUTPUT_TOKENS,info.defaultMaxTokens||CHAT_OUTPUT_TOKENS,Math.floor((info.context?.contextWindow||65536)/8)));
   return {...route,maxTokens:Math.min(route.maxTokens||cap,cap)};
  },{prepend:true});
 }
 async summarize(input,agent,signal){
  const latest=agent.session.requestHeader()?.config||{};
  const route={provider:latest.provider||agent.options.provider,model:latest.model||agent.options.model};
  const policy={...this.config,...this.config.modelPolicies?.find(p=>p.provider===route.provider&&p.model===route.model)};
  const target={provider:policy.summarizationProvider||route.provider,model:policy.summarizationModel||route.model};
  const info=await this.ctx.llm.resolveModelInfo(target.provider,target.model,signal);
  const window=info.context?.contextWindow||32768,out=Math.min(policy.maxTokens,2048,info.defaultMaxTokens||2048,Math.max(256,Math.floor(window/8)));
  const budget=Math.max(512,Math.min(32000,Math.floor((window-out-2048)*.6)));
  let chunks=byteChunks(summaryRecords(input.messages),budget);
  if(!chunks.length)throw Error('没有可供压缩的文本材料');
  // Bound emergency work. Originals remain in the durable DSH event log; gaps
  // are disclosed in the checkpoint instead of being fabricated as memories.
  let omitted=0;
  if(chunks.length>16){omitted=chunks.length-16;chunks=[...chunks.slice(0,4),...chunks.slice(-12)];}
  const usage={};
  const call=async(material)=>{
   signal?.throwIfAborted();const assembler=new BlockAssembler();
   const options={...target,maxTokens:out,sessionId:agent.session.id,purpose:'compaction',signal,messages:[{role:'system',content:[{type:'text',text:CHECKPOINT_INSTRUCTION}]},{role:'user',content:[{type:'text',text:material}]}]};
   for await(const chunk of this.ctx.llm.stream(options))assembler.push(chunk);
   const finish=assembler.finish;if(!finish)throw Error('摘要流未正常结束，保留原上下文');if(finish.kind==='error')throw Error(finish.failure?.message||'摘要请求失败');if(finish.kind==='aborted')throw Error('摘要已取消');if(finish.kind==='max-tokens')throw Error('摘要输出达到上限，保留原上下文，交由恢复机制处理');
   for(const [key,value]of Object.entries(assembler.usage||{}))if(typeof value==='number'&&Number.isFinite(value))usage[key]=(usage[key]||0)+value;
   const text=assembler.blocks().filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();if(!text)throw Error('摘要为空，保留原会话');return cleanText(text,Math.min(3000,Math.floor(budget/6)));
  };
  const summaries=[];
  for(let i=0;i<chunks.length;i++)summaries.push(await call('历史片段 '+(i+1)+'/'+chunks.length+'（按先后顺序）\n'+chunks[i]));
  // Consolidate with a bounded rolling note, never resend the overflowing prefix.
  let note=summaries[0];
  for(let i=1;i<summaries.length;i++)note=await call('先前交接笔记：\n'+note+'\n后续片段笔记（新纠正优先）：\n'+summaries[i]);
  if(omitted)note+='\n[本次紧急压缩另有 '+omitted+' 段超长原文未复述；原始记录保留。遇到不确定的旧事用qq_memory_recall检索，不得猜测。]';
  return {summary:[{type:'text',text:note}],rawOutput:[{type:'text',text:note}],llmStreamCall:true,...target,maxTokens:out,...(Object.keys(usage).length?{usage}:{})};
 }
}
