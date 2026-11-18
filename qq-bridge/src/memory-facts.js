import {createHash} from 'node:crypto';
import {cleanText} from '../plugins/qq-agent-presets/context-policy.mjs';

// One normalization for the QQ prompt, Mnemon projection and console statistics.
// These are explicit QQ notes; raw conversations are never copied into the profile.
export function memoryFacts(state={}, {now=Date.now(),redact=String}={}){
 if(!state||typeof state!=='object')return [];
 const facts=[],id=(kind,value)=>createHash('sha256').update(kind+'\0'+value).digest('hex').slice(0,20);
 const text=value=>cleanText(redact(String(value||'')),2000).trim();
 for(const topic of (Array.isArray(state.activeTopics)?state.activeTopics:[]).filter(t=>t?.text).slice(-50)){
  if(topic.lastMentionAt&&now-Number(topic.lastMentionAt)>24*3600000)continue;
  const body=text(topic.text),question=text(topic.pendingQuestion),stamp=Number(topic.lastMentionAt)||now;
  const ago=Math.max(0,Math.round((now-stamp)/60000));
  facts.push({id:id('topic',body),target:'memory',kind:'topic',stamp,content:'进行中的话题：'+body+(question?'；待追问：'+question:''),display:body+(now-stamp>2*3600000?'（已搁置）':'')+'（'+(ago?ago+'分钟前':'刚刚')+'）'+(question?'；待追问：'+question:'')});
 }
 for(const thought of (Array.isArray(state.pendingThoughts)?state.pendingThoughts:[]).filter(t=>t?.text&&(!t.expiresAt||now<Number(t.expiresAt))).slice(-50)){
  const body=text(thought.text),motivation=text(thought.motivation);
  facts.push({id:id('thought',body),target:'memory',kind:'thought',stamp:Number(thought.createdAt)||now,content:'待办想法：'+body+(motivation?'（'+motivation+'）':''),display:body+(motivation?'（'+motivation+'）':'')});
 }
 for(const [name,value]of Object.entries(state.memberImpressions||{}).slice(-50)){
  const traits=(Array.isArray(value?.traits)?value.traits:[]).map(text).filter(Boolean),body=text(name)+'：'+(traits.length?traits.join('、'):'暂无记录');
  facts.push({id:id('impression',name),target:'user',kind:'impression',stamp:Number(value?.lastSeenAt)||now,content:'本会话中的人物印象（来自机器人记录，不作为身份核验）：'+body,display:body+'（互动 '+(Number(value?.interactionCount)||0)+' 次）'});
 }
 return facts;
}
export function renderMemoryFacts(facts){
 const labels={topic:'【进行中的话题】',thought:'【你想说但还没说的】',impression:'【对群友的印象】'},lines=[];
 for(const [kind,label]of Object.entries(labels)){const rows=facts.filter(f=>f.kind===kind).slice(-10);if(rows.length)lines.push(label,...rows.map(row=>'- '+row.display));}
 return lines.join('\n');
}
export const formatLightMemory=(state,options)=>renderMemoryFacts(memoryFacts(state,options));
