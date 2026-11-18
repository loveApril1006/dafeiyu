// Run with the bundled Electron-as-Node so Core comes from the actual ASAR.
import assert from 'node:assert/strict';
import QQCompactionEngine from '../plugins/qq-agent-presets/qq-compaction.mjs';
const requests=[];const fake={config:{summarizationProvider:'',summarizationModel:'',maxTokens:2048},ctx:{llm:{resolveModelInfo:async()=>({context:{contextWindow:32768},defaultMaxTokens:256000}),stream:async function*(options){requests.push(options);assert(Buffer.byteLength(JSON.stringify(options.messages))<32000,'summary request must be bounded before provider I/O');assert(!JSON.stringify(options).includes('data:image'));yield {type:'text-delta',index:0,text:'用户QQ123喜欢乌龙茶；最新要求周末去杭州。未完成：确认时间。'};yield {type:'finish',reason:{kind:'stop'}};}}}};
const agent={options:{provider:'fixture',model:'fixture'},session:{id:'s1',requestHeader:()=>({config:{provider:'fixture',model:'fixture'}})}};
const content=Array.from({length:200},(_,i)=>({role:'user',id:'m'+i,content:[{type:'text',text:'周末去杭州，喜欢乌龙茶。'.repeat(100)}]}));content[10].content.push({type:'image',data:'A'.repeat(4000000)});
const before=JSON.stringify(content);const result=await QQCompactionEngine.prototype.summarize.call(fake,{messages:content},agent,new AbortController().signal);
assert.match(result.summary[0].text,/乌龙茶/);assert.equal(JSON.stringify(content),before,'do not mutate archived originals');assert(requests.length>1&&requests.length<=31);assert(requests.every(r=>!r.tools&&r.maxTokens===2048));
fake.ctx.llm.stream=async function*(){yield {type:'text-delta',index:0,text:'不完整'};yield {type:'finish',reason:{kind:'max-tokens'}};};await assert.rejects(QQCompactionEngine.prototype.summarize.call(fake,{messages:content.slice(0,1)},agent,new AbortController().signal),/保留原上下文/);
const signal=AbortSignal.abort();await assert.rejects(QQCompactionEngine.prototype.summarize.call(fake,{messages:content.slice(0,1)},agent,signal));
console.log('PASS actual bundled Core compaction subclass, bounded multi-pass summaries, no tool execution, no binary replay, immutable original events, empty/truncated/cancelled summary fail-closed.');
