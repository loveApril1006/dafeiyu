import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

// A 64×64 red RGB PNG. Keep the probe in source so packaging cannot omit it.
export const visionTestImageUrl='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3PAQkAAAyEwO9feoshgnABdLep8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3IPanc8OLDQitxAAAAAElFTkSuQmCC';

const lifetime=7*86400000;
const key=model=>JSON.stringify([model.provider,model.model]);
function checked(record){
  if(!record||typeof record.provider!=='string'||!record.provider||record.provider.length>160||typeof record.model!=='string'||!record.model||record.model.length>160||typeof record.passed!=='boolean'||!Number.isFinite(Date.parse(record.at)))throw Error('视觉测试记录无法读取');
  return{provider:record.provider,model:record.model,passed:record.passed,at:record.at,reply:String(record.reply||'').slice(0,160)};
}
export function createVisionChecks(home,{now=Date.now}={}){
  const file=path.join(home,'vision-check.json');
  function records(){
    let value;
    try{value=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch(error){if(error.code==='ENOENT')return[];throw Error('视觉测试记录无法读取');}
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('视觉测试记录无法读取');
    if(value.version===2){if(!Array.isArray(value.records)||value.records.length>100)throw Error('视觉测试记录无法读取');return value.records.map(checked);}
    return[checked(value)];
  }
  return{
    get(model){
      const record=records().find(record=>key(record)===key(model));
      if(!record)return{valid:false,reason:'untested'};
      const age=now()-Date.parse(record.at),valid=record.passed&&age>=0&&age<lifetime;
      return{...record,valid,reason:valid?'passed':!record.passed?'failed':'expired'};
    },
    save(input){
      const record=checked(input),others=records().filter(previous=>key(previous)!==key(record)).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,99);
      const temporary=file+'.'+randomUUID()+'.tmp';
      try{fs.writeFileSync(temporary,JSON.stringify({version:2,records:[record,...others]}),{flag:'wx',mode:0o600});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
      return record;
    },
    clear(model){
      const temporary=file+'.'+randomUUID()+'.tmp';
      try{fs.writeFileSync(temporary,JSON.stringify({version:2,records:records().filter(record=>key(record)!==key(model))}),{flag:'wx',mode:0o600});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
    }
  };
}
