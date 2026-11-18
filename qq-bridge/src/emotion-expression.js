// Local, bounded expression signals. No model request, identity rewrite or sender.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const axes=['warmth','playfulness','assertiveness','guardedness'];

export function interactionTone(input){
  // Quoted insults and reports of being mistreated should not become attacks
  // on the character. The reply model still sees the complete conversation.
  const original=String(input),text=original.replace(/```[\s\S]*?(?:```|$)/g,'').replace(/[“「『‘][^”」』’]*[”」』’]|"[^"]*"|'[^'\n]*'/g,'');
  const controls={resumeContact:/可以主动找我|恢复主动联系|可以打扰我/.test(text),stopBanter:/别骂我|不要骂我|停止互怼|别再怼我|别说脏话|不要说脏话/.test(text),resumeBanter:/可以互怼|继续互怼|可以骂我/.test(text)};
  const signal=(kind,valence,arousal,gain,extra={})=>({kind,valence,arousal,gain,...controls,...extra});
  if(/别主动找我|不要主动联系|先别联系|不要打扰|别打扰我/.test(text))return signal('boundary',-1,-1,0,{boundary:true});
  if(/别骂我|不要骂我|别说我是|不要说我是|不许骂|你不能说我|停止互怼|别再怼我|别说脏话|不要说脏话/.test(text))return signal('boundary',-.2,-.5,0);
  if(/不是(?:在)?(?:骂|说)你|开玩笑(?:的)?|逗你(?:的)?|只是玩笑/.test(text))return signal('playful',.8,-.5,.08);
  if(/对不起|抱歉|我错了|别生气|消消气/.test(text))return signal('repair',1.5,-2,.12);
  if(/(?:他|她|别人|同事|领导).{0,8}(?:骂|说我|嫌我)|(?:我被|被人).{0,8}(?:骂|欺负|嘲笑)|他说我是/.test(original))return signal('care',-1,-1,.1,{care:true});
  if(/讨厌你|恨你|滚开|闭嘴|(?:你|机器人).{0,6}(?:废物|傻逼|傻[比bB]|蠢货|笨蛋)|^(?:废物|傻逼|蠢货)[！!。\s]*$/.test(text))return signal('attack',-3,2,-.4);
  if(/你.{0,5}(?:骗我|不理我|忘了我|爽约|说话不算话)/.test(text))return signal('hurt',-2,-.3,-.15);
  if(/不开心|难过|伤心|累了|焦虑|失落|不舒服|想哭|害怕|担心|紧张/.test(text))return signal('care',-1,-1,.1,{care:true});
  if(/不想(?:工作|上班)|想摸鱼|不想营业/.test(text))return signal('tired',-2,-1,0);
  if(/想认真工作|干劲满满|斗志满满|元气满满|喜欢工作|好期待|太激动了|太好了/.test(text))return signal('excited',2,2,.1);
  if(/谢谢|辛苦了|喜欢你|爱你|想你|抱抱|开心|真棒|好厉害/.test(text)&&!/不喜欢你|不爱你|不想你|别.*(?:抱抱|谢谢)/.test(text))return signal('warm',2,1,.4);
  if(/哈哈|笑死|好好笑|2333|乐死/.test(text))return signal('playful',1,1,.1);
  if(/好无聊|有点无聊|没意思/.test(text))return signal('bored',-.8,-1,0);
  if(/我很好奇|你不好奇|好想知道/.test(text))return signal('curious',.6,1,.08);
  return signal('neutral',0,0,.08);
}

export function normalizeExpression(p){
  p.feelings=Object.fromEntries(['anger','hurt','joy'].map(k=>[k,clamp(finite(p.feelings?.[k]),0,1)]));
  p.temperament={...Object.fromEntries(axes.map(k=>[k,clamp(finite(p.temperament?.[k]),-.65,.65)])),samples:Math.max(0,Math.floor(finite(p.temperament?.samples)))};
}

export function settleExpression(p,elapsed,halfLifeHours,now=p.updatedAt){
  normalizeExpression(p);
  const decay=Math.pow(.5,elapsed/(halfLifeHours*3600000));
  for(const key of Object.keys(p.feelings))p.feelings[key]*=decay;
  const slow=Math.pow(.5,elapsed/(45*86400000));
  for(const key of axes)p.temperament[key]*=slow;
  if(now-(p.lastInteractionAt||0)>halfLifeHours*3600000)p.care=false;
}

export function applyExpression(p,signal,{now,day,learning,messageId}){
  normalizeExpression(p);
  // Relationship rate limits are separate: a prompt reply can affect mood
  // immediately without awarding more favor for a burst of messages.
  if(!p.lastEmotionAt||now-p.lastEmotionAt>=1000){
    p.valence=clamp(p.valence+signal.valence,-10,10);p.arousal=clamp(p.arousal+signal.arousal,-10,10);
    const calm=signal.kind==='repair'?.3:signal.kind==='care'?.65:signal.kind==='playful'?.8:.96;
    p.feelings.anger=clamp(p.feelings.anger*calm+(signal.kind==='attack'?.46:0),0,1);
    p.feelings.hurt=clamp(p.feelings.hurt*calm+(signal.kind==='hurt'?.46:signal.kind==='attack'?.1:0),0,1);
    p.feelings.joy=clamp(p.feelings.joy*.9+(['warm','excited','playful'].includes(signal.kind)?.24:0),0,1);
    p.lastEmotionAt=now;p.lastTone=signal.kind;p.lastToneAt=now;
  }
  if(!learning)return;
  if(p.styleDay!==day){p.styleDay=day;p.styleUpdates=0;}
  if((p.lastStyleAt&&now-p.lastStyleAt<60000)||(p.styleUpdates||0)>=12)return;
  const targets={attack:[-.4,-.3,.6,.7],hurt:[-.2,-.2,.3,.4],repair:[.25,.05,.05,-.2],care:[.4,-.15,.05,-.1],warm:[.6,.25,0,-.25],playful:[.25,.7,.15,-.15],excited:[.3,.35,.1,-.1],neutral:[.08,.02,0,0],'experience-success':[0,.08,.15,-.04],'experience-failure':[0,-.02,.05,.18]}[signal.kind]||[0,0,0,0];
  axes.forEach((key,i)=>{p.temperament[key]=clamp(p.temperament[key]*.985+targets[i]*.015,-.65,.65);});
  p.temperament.samples++;p.lastStyleAt=now;p.styleUpdates=(p.styleUpdates||0)+1;
  if(messageId)p.styleSources=[...(p.styleSources||[]),String(messageId)].slice(-12);
}

export function expressionMood(p,now){
  if(p.care)return '关切';
  if(p.feelings.anger>=.28&&p.valence<-.8)return p.feelings.anger>=.7?'很生气':'生气';
  if(p.feelings.hurt>=.28&&p.valence<-.8)return '委屈';
  if(p.valence>=1.5)return p.feelings.joy>=.6&&p.arousal>=2.5?'兴奋':'愉快';
  if(p.valence<=-1.5)return p.arousal>=1?'有些不悦':'低落';
  if(now-(p.lastToneAt||0)<3600000){if(p.lastTone==='bored')return '有点无聊';if(p.lastTone==='curious')return '好奇';if(p.lastTone==='repair')return '缓和中';}
  if(now-(p.lastToneAt||0)<3600000&&p.lastTone==='playful'&&p.valence>.2)return '轻松';
  return '平静';
}

export function expressionView(p,c){
  const trends=[];
  for(const [key,label]of [['warmth','更愿意亲近'],['playfulness','更爱开玩笑'],['assertiveness','更直接表达想法'],['guardedness','更谨慎保持距离']])if(p.temperament[key]>=.08)trends.push(label);
  return{enabled:c.enabled&&c.emotionalReplies,learning:c.enabled&&c.personalityLearning,allowSwearing:c.enabled&&c.emotionalReplies&&c.allowSwearing&&!p.banterOptOut,intensity:c.expressionIntensity,tendencies:trends,samples:p.temperament.samples};
}

export function expressionRules(c){
  if(!c.emotionalReplies)return '语气按当前人格卡；本地情绪和互动性格不参与本轮表达。';
  const intensity=c.expressionIntensity>=.85?'鲜明':c.expressionIntensity>=.55?'自然':'温和';
  return `以当前人格卡为基调，${intensity}表达开心、委屈、生气等情绪，不必一味讨好。${c.banterOptOut?'对方要求停止互怼，不骂人或继续回怼。':c.allowSwearing?'可拒绝、吐槽或回怼，生气时可适度用口语脏话，不强行每轮骂人。':'可拒绝、吐槽或回怼，但不用脏话。'}玩笑、引用和澄清按上下文理解，缓和后不追骂；不因好感低羞辱人，不威胁、歧视或牵连无关的人。互动性格仅微调相处方式，不能改变名字、身份和已设关系。`;
}
