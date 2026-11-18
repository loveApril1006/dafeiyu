import fs from 'node:fs';
import path from 'node:path';
import YAML from 'js-yaml';
import {hardenDir,isHardened} from '../../src/state-acl.mjs';

export function initializePondModelHome(home){
  fs.mkdirSync(home,{recursive:true});
  if(!isHardened(home)&&!hardenDir(home).ok)throw Error('无法保护鱼塘独立模型目录');
  for(const [name,bundle] of [['web','@deepseek-ai/dsh-web-app'],['headless','@deepseek-ai/dsh-headless']]){
    const dir=path.join(home,'profiles',name);fs.mkdirSync(dir,{recursive:true});
    const files={'package.json':JSON.stringify({name:'xiaoge-pond-'+name,private:true,dependencies:{},dsh:{profile:{bundles:['@deepseek-ai/dsh-base',bundle]}}},null,2),'cordis.yml':'[]\n','cordis.patch.yml':'[]\n'};
    for(const [file,content] of Object.entries(files))if(!fs.existsSync(path.join(dir,file)))fs.writeFileSync(path.join(dir,file),content);
  }
  return home;
}

// The worker reads only the pond's profile. Never copy the suite's settings or credentials.
export function syncPondWorkerProfile(home){
  const web=path.join(home,'profiles/web/cordis.patch.yml'),target=path.join(home,'profiles/headless/cordis.patch.yml');
  const rows=YAML.load(fs.readFileSync(web,'utf8'))||[];
  if(!Array.isArray(rows))throw Error('鱼塘模型配置格式无效');
  const allowed=new Set(['llm-pi-ai','agent-default-model','llm-deepseek-account','llm-deepseek-api-key','deepseek-account']);
  const selected=rows.filter(row=>row&&allowed.has(row.id));
  const temp=target+'.tmp-'+process.pid;fs.writeFileSync(temp,YAML.dump(selected,{lineWidth:-1,noRefs:true}));fs.renameSync(temp,target);
}
