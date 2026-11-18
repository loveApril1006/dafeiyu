import * as React from 'react';
const h=React.createElement;
async function api(action,body){const response=await fetch('/api/bili-pond/long-memory/'+action,{...(body!==undefined?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok||result.ok===false)throw Error(result.error||'记忆操作失败');return result;}
export function PondMemoryPanel(){
 const [data,setData]=React.useState(null),[settings,setSettings]=React.useState(null),[message,setMessage]=React.useState(''),[busy,setBusy]=React.useState(false);
 const [query,setQuery]=React.useState(''),[date,setDate]=React.useState(''),[chain,setChain]=React.useState(''),[text,setText]=React.useState(''),[editing,setEditing]=React.useState(null),[from,setFrom]=React.useState(''),[to,setTo]=React.useState('');
 const input=React.useRef();
 async function load(){const result=await api('status?'+new URLSearchParams({query,date,chain}));setData(result);setSettings(result.policy);return result;}
 async function task(fn){if(busy)return;setBusy(true);setMessage('处理中…');try{const result=await fn();await load();setMessage(result?.deferred?'鱼塘正在运行，本轮结束后再整理':result?.message||'操作完成');}catch(error){setMessage(error.message);}finally{setBusy(false);}}
 const field=(label,node)=>h('label',{className:'pond-memory-field'},h('span',null,label),node);
 const number=(key,label)=>field(label,h('input',{type:'number',value:settings?.[key]??'',onChange:e=>setSettings({...settings,[key]:Number(e.target.value)})}));
 return h('details',{className:'pond-memory-panel',onToggle:e=>{if(e.currentTarget.open&&!data)void task(load);}},
  h('summary',null,'长期记忆 · 按日期/主题链 · 备份迁移'),
  h('p',null,'原文 → 短摘要 → 长期线索。采用本地规则裁剪，不是AI语义总结；整理额外模型调用为0。重要内容请置顶，淡化后不能还原丢掉的细节。'),
  h('div',{role:'status','aria-live':'polite'},message),
  data&&h('div',null,
   h('p',null,`记忆 ${data.total}/${data.policy.maxRecords} · 置顶 ${data.pinned} · 原文 ${data.tiers.raw} / 摘要 ${data.tiers.summary} / 线索 ${data.tiers.trace}`),
   h('p',null,'上次整理：'+(data.lastSweep?new Date(data.lastSweep).toLocaleString():'尚未整理')+' · 记忆库约 '+Math.ceil(data.bytes/1024)+' KB'),
   h('div',{className:'pond-memory-grid'},
    field('关键词',h('input',{value:query,onChange:e=>setQuery(e.target.value)})),
    field('日期',h('input',{type:'date',value:date,onChange:e=>setDate(e.target.value)})),
    field('主题链',h('input',{value:chain,onChange:e=>setChain(e.target.value),placeholder:'例如 AI工具、项目进展'})),
    h('button',{disabled:busy,onClick:()=>void task(load)},'查看记忆')),
   h('div',{className:'pond-memory-grid'},number('rawDays','原文保留天数'),number('summaryDays','摘要保留天数'),number('traceDays','长期线索保留天数'),number('intervalHours','整理间隔（小时）'),number('contextChars','每轮记忆注入上限（字符）'),number('maxRecords','记忆容量（条，最多3000）')),
   h('label',null,h('input',{type:'checkbox',checked:settings.enabled,onChange:e=>setSettings({...settings,enabled:e.target.checked})}),'记录和读取长期记忆'),
   h('label',null,h('input',{type:'checkbox',checked:settings.autoClean,onChange:e=>setSettings({...settings,autoClean:e.target.checked})}),'到期清理（置顶除外）'),
   h('div',{className:'pond-memory-actions'},
    h('button',{disabled:busy,onClick:()=>void task(()=>api('policy',settings))},'保存记忆设置'),
    h('button',{disabled:busy,onClick:()=>void task(()=>api('maintain',{}))},'立即整理')),
   h('p',null,'记忆输入有限额；鱼塘原任务仍按所选模型计费。关闭到期清理仍会淡化摘要，但不会删除原文件。'),
   h('textarea',{value:text,maxLength:1000,rows:3,placeholder:editing?'编辑这条记忆':'手动记录一条记忆（最多1000字）',onChange:e=>setText(e.target.value),'aria-label':'记忆正文'}),
   h('div',{className:'pond-memory-actions'},
    h('button',{disabled:busy||!text.trim(),onClick:()=>void task(async()=>{await api(editing?'edit':'append',{...(editing?{id:editing}:{}),text,chain:chain||'日常'});setText('');setEditing(null);})},editing?'保存修改':'记录记忆'),
    editing&&h('button',{onClick:()=>{setEditing(null);setText('');}},'取消编辑')),
   h('div',{className:'pond-memory-records'},data.records.map(record=>h('article',{key:record.id},
    h('small',null,record.day+' · '+record.chain+' · '+({raw:'原文',summary:'摘要',trace:'长期线索'}[record.tier])+(record.kind==='diary'?' · 日记':'')+(record.pinned?' · 已置顶':'')),
    h('p',null,record.text),h('small',null,'ID：'+record.id+(record.relatedId?' · 关联：'+record.relatedId:'')),
    h('div',{className:'pond-memory-actions'},
     h('button',{disabled:busy,onClick:()=>void task(()=>api('edit',{id:record.id,pinned:!record.pinned}))},record.pinned?'取消置顶':'置顶保留'),
     h('button',{disabled:busy,onClick:()=>{setEditing(record.id);setText(record.text);setChain(record.chain);}},'编辑'),
     h('button',{disabled:busy||record.pinned,onClick:()=>{if(confirm('删除这条记忆？删除后不会从旧源文件自动重新读入。'))void task(()=>api('forget',{id:record.id}));}},'删除'))))),
   h('h4',null,'备份与迁移'),
   h('p',null,'导出仅含记忆和日记归档、置顶及关联信息；不带账号或模型配置。导入合并去重，保留本机设置；手动备份文件由你自行保管和清理。'),
   h('div',{className:'pond-memory-grid'},field('导出起始日期（可空）',h('input',{type:'date',value:from,onChange:e=>setFrom(e.target.value)})),field('导出结束日期（可空）',h('input',{type:'date',value:to,onChange:e=>setTo(e.target.value)}))),
   h('div',{className:'pond-memory-actions'},
    h('button',{disabled:busy,onClick:()=>void task(async()=>{const result=await api('backup?'+new URLSearchParams({from,to}));const url=URL.createObjectURL(new Blob([JSON.stringify(result)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=result.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return{message:'已导出 '+result.count+' 条记忆，可在另一台电脑导入'};})},'导出记忆备份'),
    h('button',{disabled:busy,onClick:()=>input.current?.click()},'导入记忆备份'),
    h('input',{type:'file',accept:'.json',ref:input,hidden:true,onChange:e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;void task(async()=>{if(file.size>6_000_000)throw Error('备份文件过大，请分批导入');const archive=JSON.parse(await file.text());if(archive.format!=='pond-memory-v1')throw Error('不是肥鱼记忆备份');const result=await api('import',{data:archive.data,sha256:archive.sha256});return{message:`导入 ${result.added} 条，跳过重复或已清理 ${result.skipped} 条`};});}})),
   h('h4',null,'整理日志'),h('ul',null,data.journal.slice(0,12).map((row,index)=>h('li',{key:index},new Date(row.at).toLocaleString()+' · '+({capture:'同步旧记忆',append:'记录记忆',update:'编辑/置顶',policy:'调整策略',maintenance:'淡化/清理',forget:'删除',import:'导入'}[row.action]||row.action)+' · '+row.count+' 条')))
  ));
}
