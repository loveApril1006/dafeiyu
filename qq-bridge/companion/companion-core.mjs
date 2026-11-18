import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {SENSITIVE_RE} from '../src/sensitive.js';

export function parseCommand(raw){
  const s=String(raw).trim();let m;
  if((m=/^B站(状态|日报|刷一轮|记忆|日记)$/.exec(s)))return {type:'bilibili',action:({'状态':'status','日报':'report','刷一轮':'run','记忆':'memory','日记':'diary'})[m[1]],args:{}};
  if((m=/^B站(搜索|看视频)[：:\s]+([\s\S]+)$/.exec(s)))return {type:'bilibili',action:m[1]==='搜索'?'search':'watch',args:m[1]==='搜索'?{query:m[2]}:{bvid:m[2]}};
  if((m=/^B站评论\s+(BV[a-zA-Z0-9]{10})\s+([\s\S]+)$/.exec(s)))return {type:'bilibili',action:'reply',args:{bvid:m[1],text:m[2]}};
  if((m=/^(?:帮我)?(?:发(?:一条|条)?说说|发表说说)[：:，,\s]+([\s\S]+)$/.exec(s)))return {type:'post',content:m[1].trim()};
  if((m=/^(?:帮我)?(?:换签名|改签名|签名改为|把签名改成)[：:\s]+([\s\S]+)$/.exec(s)))return {type:'signature',content:m[1].trim()};
  if((m=/^(?:帮我)?(?:逛空间|读空间|看看空间)(?:[：:\s]+(\d{5,12}))?$/.exec(s)))return {type:'feeds',uin:m[1]};
  if((m=/^(?:给)?第\s*(\d+)\s*条(?:说说)?点赞$/.exec(s)))return {type:'like',index:Number(m[1])-1};
  if((m=/^(?:评论|评论说说)第\s*(\d+)\s*条[：:\s]+([\s\S]+)$/.exec(s)))return {type:'comment',index:Number(m[1])-1,content:m[2].trim()};
  if((m=/^(?:帮我)?拍一拍[：:\s]+(\d{5,12})$/.exec(s)))return {type:'poke',uin:m[1]};
  if((m=/^(?:写日记|记日记)(?:[：:\s]+([\s\S]+))?$/.exec(s)))return {type:'diary-write',content:m[1]?.trim()};
  if((m=/^(?:读日记|看日记)(?:[：:\s]+(\d{4}-\d{2}-\d{2}))?$/.exec(s)))return {type:'diary-read',date:m[1]};
  return null;
}
export function chinaDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());}
export function shortMessages(text){return String(text).replace(/\[SILENT\]/g,'').split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,3);}
export function compactChatHistory(history,{maxMessages=16,maxChars=8000,maxMessageChars=2000}={}){
  const rows=[];let remaining=maxChars-2;
  for(const original of (Array.isArray(history)?history:[]).slice(-maxMessages).reverse()){
    if(!original||!['user','assistant'].includes(original.role))continue;
    const row={role:original.role,text:String(original.text||'').slice(0,maxMessageChars)};
    while(row.text&&JSON.stringify(row).length+1>remaining)row.text=row.text.slice(0,Math.max(0,Math.floor(row.text.length*.8)));
    if(!row.text)break;
    remaining-=JSON.stringify(row).length+1;rows.unshift(row);
  }
  return rows;
}
export function makeCompanion({root,brain,onebot,bilibili}){
  const state=path.join(root,'companion-data');fs.mkdirSync(state,{recursive:true});
  const feeds=new Map(),busy=new Set();
  const channelFile=channel=>path.join(state,createHash('sha256').update(channel).digest('hex').slice(0,20)+'.json');
  function read(channel){try{return JSON.parse(fs.readFileSync(channelFile(channel),'utf8'));}catch{return {history:[],diaries:{}};}}
  function save(channel,data){const f=channelFile(channel);fs.writeFileSync(f+'.tmp',JSON.stringify(data,null,2));fs.renameSync(f+'.tmp',f);}
  function audit(type){fs.appendFileSync(path.join(state,'actions.jsonl'),JSON.stringify({at:new Date().toISOString(),type})+'\n');}
  function checkContent(content,max=1000){if(!content||content.length>max)throw new Error('内容为空或太长');if(SENSITIVE_RE.test(content))throw new Error('内容含本机路径或凭据信息，已拦截');return content;}
  async function run(text,channel='local',{signal}={}){
    if(!/^(local|qq-private:\d+)$/.test(channel))throw new Error('无效会话');
    if(busy.has(channel))throw new Error('上一句话还在想，稍等一下');busy.add(channel);
    try{
      signal?.throwIfAborted();
      const ask=async prompt=>{signal?.throwIfAborted();const answer=await brain(prompt,{signal,channel});signal?.throwIfAborted();return answer;};
      const data=read(channel),cmd=parseCommand(text);
      let reply,extra={};
      if(cmd?.type==='bilibili'){
        if(!bilibili)throw new Error('B站模块未启动');
        if(cmd.action==='reply')cmd.args.text=checkContent(cmd.args.text,300);
        const result=await bilibili.request(cmd.action,cmd.args);
        if(cmd.action==='search')reply=(result.videos||[]).map((row,i)=>`${i+1}. ${row.title}（${row.author}）\nhttps://www.bilibili.com/video/${row.bvid}`).join('\n\n')||'没有搜到视频。';
        else if(cmd.action==='watch')reply=result.video.title+'\n'+result.video.summary+'\nhttps://www.bilibili.com/video/'+result.video.bvid;
        else if(cmd.action==='status')reply='B站模块：'+(result.loggedIn?'已保存登录凭证':'尚未登录，请在机器人后台 → B站阅读 扫码')+'；自动阅读：'+(result.config.autoRun?'开启':'关闭')+'；本轮：'+(result.job?.state||'未运行');
        else reply=result.text||result.message;
      }else if(cmd?.type==='diary-write'){
        const diary=cmd.content||await ask('根据下列真实聊天写今天的私人日记，第一人称大肥鱼，80～160字。有感受但不编造实际行动和共同经历。没有聊天就明确今天还没聊什么。不要工具。\n'+JSON.stringify(compactChatHistory(data.history,{maxMessages:24,maxChars:12000})));
        const day=chinaDate();(data.diaries[day]??=[]).push({at:new Date().toISOString(),text:diary});save(channel,data);reply='记好啦。\n'+diary;extra.diary=day;
      }else if(cmd?.type==='diary-read'){
        const day=cmd.date||chinaDate();reply=(data.diaries[day]||[]).map(x=>x.text).join('\n\n')||'这一天还没写日记呢。';extra.diary=day;
      }else if(cmd?.type==='feeds'){
        // Use msglist with concrete tid; the raw HTML feed handles are not reliable write targets.
        const target=cmd.uin?{target_uin:Number(cmd.uin)}:{};
        const result=await onebot('get_qzone_msg_list',{...target,pos:0,num:8});
        const list=(result.msglist||[]).map(x=>({...x,uin:cmd.uin}));feeds.set(channel,{at:Date.now(),list});
        reply=list.length?list.map((x,i)=>`${i+1}. ${String(x.content||'（图片说说）').slice(0,180)}`).join('\n'):'空间里暂时没读到说说。';extra.feeds=list;
      }else if(cmd?.type==='like'||cmd?.type==='comment'){
        const page=feeds.get(channel),item=page?.list[cmd.index];
        if(!item||Date.now()-page.at>600000)throw new Error('先说“逛空间 QQ号”读一下，再指定第几条；列表十分钟后失效');
        const params={tid:item.tid,...(item.uin?{target_uin:Number(item.uin)}:{})};
        if(cmd.type==='like')await onebot('like_qzone',{...params,abstime:Number(item.time)||0});
        else await onebot('comment_qzone',{...params,content:checkContent(cmd.content,300)});
        audit(cmd.type);reply=cmd.type==='like'?'这一条赞好了。':'评论发好了。';
      }else if(cmd?.type==='post'){
        const result=await onebot('send_qzone_msg',{content:checkContent(cmd.content),ugc_right:4});audit('post');reply='说说发好啦，好友可见。';extra.tid=result?.tid;
      }else if(cmd?.type==='signature'){
        await onebot('set_self_longnick',{longNick:checkContent(cmd.content,80)});audit('signature');reply='签名换好啦。';
      }else if(cmd?.type==='poke'){
        await onebot('friend_poke',{user_id:Number(cmd.uin)});audit('poke');reply='拍到啦。';
      }else{
        const history=compactChatHistory(data.history);
        const instruction='用户现在说：'+text;
        const help='实际操作要用明确命令：写日记、读日记、发说说：正文、逛空间 QQ号、给第1条点赞、评论第1条：内容、签名改为：新签名、拍一拍 QQ号。当前这条消息没有匹配到操作命令，因此没有执行任何操作；如果用户想实际操作，简短说明正确写法。';
        reply=await ask('这是独立的'+(channel==='local'?'本地功能':'QQ管理员私人生活功能')+'会话。'+(/日记|说说|空间|签名|点赞|评论|拍一拍/.test(text)?help:'')+'近期聊天材料：'+JSON.stringify(history)+'\n'+instruction);
        data.history.push({role:'user',text,at:new Date().toISOString()},{role:'assistant',text:reply,at:new Date().toISOString()});data.history=data.history.slice(-100);save(channel,data);
      }
      // Preserve full diary text; ordinary replies stay short.
      return {ok:true,text:reply,messages:cmd?.type?.startsWith('diary')?[reply]:shortMessages(reply),...extra};
    }finally{busy.delete(channel);}
  }
  return {run};
}
