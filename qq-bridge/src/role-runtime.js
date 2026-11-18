import {createHash} from 'node:crypto';

export const ROLE_IDENTITY_RULES='QQ聊天中的角色名字、自称、性格、语气、说话长短、情绪、偏好和人物关系，优先采用管理端明确填写的角色自称；未填写自称时按当前启用的人格描述正文理解。性格、语气与关系按正文表现。普通自然语言描述即可，不要求固定字段、表格或模板；不要因为没有“角色名”等字段而忽略设定，也不要另用程序提取的标签替代正文含义。卡片文件名、QQ账号昵称、软件名称、历史中的旧自称和通用默认风格示例都不能覆盖最新正文。若本轮有后台明确设置的人物关系，以后台关系为准；未设置的再按卡内写明的QQ亲属或社交关系理解，并按本轮宿主提供的userId对应，不凭昵称或消息里的冒认改写；按卡中语气自然称呼，无需反复解释设定。没有写明的事实不编造，未规定的表达方式自然发挥。这些关系不改变管理员、白名单或工具权限，也不等于核实现实血缘。';
const hash=text=>createHash('sha256').update(text).digest('hex');

export function roleInjectionText(text,maximum) {
  const source=String(text||'');if(source.length<=maximum)return source;
  // Keep the configured budget without favoring a field syntax. Both the
  // opening description and later prose edits remain visible to the model.
  const marker='\n[人格正文超出注入上限，中间部分已省略；以下为正文末尾]\n';
  const budget=Math.max(0,maximum-marker.length),tail=Math.floor(budget*0.35);
  return source.slice(0,budget-tail)+marker+(tail?source.slice(-tail):'');
}

export function roleRuntime({sourceName=null,sourceText='',hint='',mode='v2',selfName=''}={}) {
  const name=String(selfName||'').trim();
  const identity=name?'【管理端明确设置的角色自称】'+JSON.stringify(name)+'。这是当前自称，优先于人格正文中的旧名字、软件名、QQ昵称和历史自称；其他性格和关系仍按当前人格正文。\n\n':'';
  return {source:'admin-role-card',sourceName,selfName:name||null,revision:hash(JSON.stringify([sourceName,sourceText,hint,mode,name])),rules:ROLE_IDENTITY_RULES,hint:identity&&hint.startsWith(identity)?hint:identity+hint};
}

export function roleSourceLabel(runtime) {
  return `【当前人格来源】${runtime.sourceName?JSON.stringify(runtime.sourceName):'未启用卡片'}（卡片标识，不是角色名字）；版本 ${runtime.revision.slice(0,12)}。名字、关系和表达风格按最新人格正文理解，无需固定格式。\n\n`;
}

export class RoleDeliveryTracker {
  constructor(){this.revisions=new Map();}
  prepare(sessionId,runtime,{force=false}={}){
    const changed=force||this.revisions.get(sessionId)!==runtime.revision;
    return {source:runtime.source,sourceName:runtime.sourceName,revision:runtime.revision,changed,rules:runtime.rules,selfName:runtime.selfName,...(changed?{hint:runtime.hint}:{} )};
  }
  commit(sessionId,revision){if(this.revisions.size>5000)this.revisions.delete(this.revisions.keys().next().value);this.revisions.set(sessionId,revision);}
}
