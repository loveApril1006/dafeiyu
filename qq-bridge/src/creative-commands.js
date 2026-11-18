// Only original, explicit user commands reach these optional features.
export function parseCreativeCommand(value){
 const text=String(value||'').trim().replace(/^#/,''),match=/^(跑团|掷骰|检定|画图|改图|表情)(?:[：:\s]+([\s\S]*))?$/.exec(text);if(!match)return null;
 const name=match[1],arg=(match[2]||'').trim();
 if(name==='画图'||name==='改图')return {feature:'images',action:'generate',args:{prompt:arg,edit:name==='改图'}};
 if(name==='表情')return {feature:'memes',action:'pick',args:{query:arg}};
 if(name==='掷骰')return {feature:'rpg',action:'roll',args:{expression:arg||'d20'}};
 if(name==='检定'){const m=/^(\S+)\s+(\S+)\s+(-?\d+)$/.exec(arg);if(!m)throw Error('用法：#检定 侦察 d20 12');return {feature:'rpg',action:'check',args:{action:m[1],expression:m[2],difficulty:Number(m[3])}};}
 if(name==='跑团')return {feature:'rpg',action:arg==='状态'?'state':arg==='重置'?'reset':'turn',args:{text:arg||'开场'}};
 return null;
}
