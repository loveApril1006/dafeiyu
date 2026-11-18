// Deliberate owner commands only. QQ response never enters desktop event queues.
import fs from 'node:fs';
import path from 'node:path';
import {callDouyinCommand} from './douyin-console.js';
export const COMPANION_COMMAND_RE=/^#(抖音状态|打开抖音|刷抖音|停止抖音|抖音日报|发抖音|B站状态|B站日报|B站记忆|B站日记|刷B站|搜B站|看B站|B站评论|写日记|读日记|日记|逛空间|说说|签名|点赞|评论|拍一拍)(?:\s+([\s\S]*))?$/;
export function companionCommandText(name,arg=''){
  const value=String(arg).trim();
  switch(name){
    case 'B站状态':case 'B站日报':case 'B站记忆':case 'B站日记':return name;
    case '刷B站':return 'B站刷一轮';
    case '搜B站':if(value)return 'B站搜索 '+value;break;
    case '看B站':if(value)return 'B站看视频 '+value;break;
    case 'B站评论':if(/^BV[a-zA-Z0-9]{10}\s+\S/.test(value))return 'B站评论 '+value;break;
    case '日记':case '读日记':return '读日记'+(value?' '+value:'');
    case '写日记':return '写日记'+(value?'：'+value:'');
    case '逛空间':return '逛空间'+(value?' '+value:'');
    case '说说':if(value)return '发说说：'+value;break;
    case '签名':if(value)return '签名改为：'+value;break;
    case '点赞':if(/^\d+$/.test(value))return '给第'+value+'条点赞';break;
    case '评论':{const m=/^(\d+)\s+([\s\S]+)$/.exec(value);if(m)return '评论第'+m[1]+'条：'+m[2];break;}
    case '拍一拍':if(/^\d{5,12}$/.test(value))return '拍一拍 '+value;break;
  }
  throw new Error('命令格式：#搜B站 关键词 / #看B站 BV号 / #刷B站 / #B站日报 / #B站评论 BV号 正文；生活命令：#说说 正文 / #签名 新签名 / #逛空间 QQ号 / #点赞 序号 / #评论 序号 内容 / #拍一拍 QQ号');
}
export async function callCompanionCommand(root,owner,name,arg){
  if(['抖音状态','打开抖音','刷抖音','停止抖音','抖音日报','发抖音'].includes(name))return callDouyinCommand(root,name,arg);
  const text=companionCommandText(name,arg);let token;
  try{token=fs.readFileSync(path.join(root,'companion','companion-token'),'utf8').trim();}catch{throw new Error('生活服务还没启动，请先启动后台服务');}
  const response=await fetch('http://127.0.0.1:17867/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Companion-Token':token},body:JSON.stringify({text,channel:'qq-private:'+owner}),signal:AbortSignal.timeout(85000)});
  const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'生活服务暂未连接');
  return result.text;
}
