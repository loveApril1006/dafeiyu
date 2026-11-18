import path from 'node:path';
import {readJson,writeJson} from './creative-store.js';
const defaults={revision:0,text:true,images:false,voice:true,stickers:true,replyLength:'natural'};
const lengths=new Set(['natural','expanded','detailed']);
export function replyLengthPrompt(length){
 const target=length==='natural'?'自然长短：普通聊天约10～300字，按这次来话的信息量、情绪和对话进展决定。简单接话可以短，解释、安慰或认真讨论有内容才展开，不默认写满300字。':length==='detailed'?'详细：普通有内容的对话优先写约300～600字，解释和故事可以进一步展开。':'充实：普通有内容的对话优先写约180～300字，有内容再展开。';
 return '【本轮回复篇幅】后台最新偏好：'+target+'按同一问题一次完整回复的总篇幅理解，不是每个气泡的字数指标。当前人格决定身份、性格、关系和口吻，篇幅按本轮偏好。先接住对方眼前这句话，不先复述问题或概括对方情绪。普通闲聊用自然口语，不默认列点、讲道理或写总结；需要步骤、分析或对方要求正式回答时再使用结构。少用“我理解你的感受”“首先其次”“总的来说”等模板开头，不每轮都安慰、给建议或追问“你呢／需要我帮忙吗”。不靠堆语气词、动作描写、重复句子或同义改写制造人味，不编造经历。说完有用的话就停，可以一条完整发送或按完整意群分条，不硬拆句子。仅确认、结束语确实一句说完时可更短；明确要求长文时按要求展开。多条待回复按内容处理，不为篇幅跳过消息，也不额外请求模型补写或重复发送。\n\n';
}
const flags={sendGroup:'text',sendPrivate:'text',reply:'text',sendBurst:'text',sendMessage:'text',sendVoice:'voice',sendSticker:'stickers',generateImage:'images'};
export function createReplyOptions(root){
 const file=path.join(root,'companion/reply-options.json');
 const get=()=>{const result={...defaults,...readJson(file,{})};for(const key of ['text','images','voice','stickers'])if(typeof result[key]!=='boolean')throw Error('聊天发送设置格式无效，未放行发送');if(!lengths.has(result.replyLength))throw Error('回复篇幅设置无效');return result;};
 return {get,lengthPrompt:()=>replyLengthPrompt(get().replyLength),allows:flag=>!flags[flag]||get()[flags[flag]],configure(patch){const current=get();if(patch.revision!==current.revision)throw Object.assign(Error('发送设置已更新，请刷新'),{status:409});const next={...current};for(const key of ['text','images','voice','stickers'])if(Object.hasOwn(patch,key)){if(typeof patch[key]!=='boolean')throw Error('聊天发送开关格式无效');next[key]=patch[key];}if(Object.hasOwn(patch,'replyLength')){if(!lengths.has(patch.replyLength))throw Error('请选择有效的回复篇幅');next.replyLength=patch.replyLength;}next.revision++;writeJson(file,next);return next;},prompt({imageToolEnabled=true}={}){const c=get(),allowed={...c,images:c.images&&imageToolEnabled};return '【聊天发送方式】本轮实时状态：生成图片开关'+(allowed.images?'已开启':'已关闭')+'。可按语境选择：'+Object.entries({text:'文字',images:'生成图片（qq_generate_image，按生图额度计费）',voice:'语音条',stickers:'表情包'}).filter(([k])=>allowed[k]).map(([,v])=>v).join('、')+'。本轮状态优先于历史中的旧开关、旧报错和过去的自我总结，不要把以前的“发送已关闭”当作现在仍关闭。没有本轮真实工具调用时，不能声称刚试过或本次提示关闭。开启仅表示聊天发送和工具开关允许，仍需画图服务、QQ入口、模型、密钥和额度就绪；失败时按本轮具体错误说明，不能都说成开关关闭。对方只询问发图能力时，不为验证开关发起收费生图。不必每次都发图片、语音或表情；未开启的方式不可使用。生图未就绪或失败时，改用仍允许的文字，不要声称图片已发出。\n\n'+replyLengthPrompt(c.replyLength);}};
}
export function createVideoMemoryPolicy(root){
 const file=path.join(root,'companion/douyin-data/memory-policy.json');
 const get=()=>{const v=readJson(file,{revision:0,enabled:true});if(typeof v.enabled!=='boolean')throw Error('抖音记忆设置无效');return v;};
 return {get,configure(patch){const current=get();if(patch.revision!==current.revision)throw Object.assign(Error('抖音记忆设置已更新，请刷新'),{status:409});if(typeof patch.enabled!=='boolean')throw Error('抖音记忆开关无效');const next={revision:current.revision+1,enabled:patch.enabled};writeJson(file,next);return next;}};
}
