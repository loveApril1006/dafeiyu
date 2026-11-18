import React,{useEffect,useState} from 'react';
import {Button} from '@dsh/primitives';
import {robotAction} from './browser-entry.jsx';
import {douyinModelProfile} from '../../src/douyin-model-contract.js';

export function RobotModelSettings({onSaved,onClose,operationActive}){
  const [profile,setProfile]=useState(null),[vision,setVision]=useState(null),[apiKey,setApiKey]=useState('');
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[note,setNote]=useState('');
  async function refresh(){
    const current=await robotAction('settings');setProfile(current.profile||null);setVision(current.vision);setReady(current.features?.fixedModel===true);
    if(!current.features?.fixedModel)setNote('运行中的抖音后台尚未加载固定配置，请刷新连接后重试。');
    return current;
  }
  useEffect(()=>{void refresh().catch(error=>setNote(error.message));},[]);
  const visionLabel=vision?.valid?'测试通过':vision?.reason==='expired'?'测试已过期':vision?.reason==='failed'?'测试未通过':'尚未测试';
  async function action(name){
    if(!ready){setNote('请先加载固定模型配置，再保存或测试。');return;}
    if(operationActive){setNote('请先停止观看或等待任务完成，再保存密钥或测试连接。');return;}
    if(name==='vision-check'&&apiKey.trim()){setNote('请先保存新密钥，再测试视觉连接。');return;}
    setBusy(true);setNote('正在处理…');
    try{
      const result=await robotAction(name,name==='select-model'?{apiKey}:{});
      if(name==='select-model')setApiKey('');
      const current=await refresh();await onSaved?.(current.settings);setNote(result.message||'已完成');
    }catch(error){setNote(error.message);if(name==='vision-check')try{await refresh();}catch{}}
    finally{setBusy(false);}
  }
  return <div className="settings-scrim"><section className="api-dialog" role="dialog" aria-modal="true" aria-label="抖音模型设置">
    <h1>抖音固定模型与 API</h1>
    <p className="muted">刷抖音使用以下独立视觉模型；硅基流动密钥在任一页面保存一次即可复用。</p>
    <label className="field"><span>服务商</span><input aria-label="服务商" readOnly value={douyinModelProfile.providerName}/></label>
    <label className="field"><span>固定模型 ID</span><input aria-label="固定模型 ID" readOnly value={douyinModelProfile.model}/></label>
    <label className="field"><span>固定 API 根地址</span><input aria-label="固定 API 根地址" readOnly value={douyinModelProfile.baseUrl}/></label>
    <p className="notice">支持图片输入 · 视觉连接：{visionLabel}</p>
    <label className="field"><span>硅基流动 API 密钥</span><input aria-label="硅基流动 API 密钥" type="password" autoComplete="off" value={apiKey} disabled={busy||operationActive} placeholder={profile?.hasKey?'已配置，留空保持原密钥':'粘贴你的硅基流动 API 密钥'} onChange={event=>setApiKey(event.target.value)}/></label>
    <p className="muted">{profile?.hasKey?'已复用硅基流动统一密钥，页面不会回显。':'尚未配置密钥，请在任一设置页填写一次。'} 保存新密钥会统一更新各功能；模型选择保持独立，需重新测试视觉连接。</p>
    <p><a className="douyin-register-link" href={douyinModelProfile.registerUrl} target="_blank" rel="noopener noreferrer sponsored" referrerPolicy="no-referrer">注册硅基流动（推荐链接） ↗</a></p>
    {profile&&!profile.configurationValid&&<p className="notice" role="status">固定 API 配置尚未就绪，保存密钥后会恢复为上方配置。</p>}
    {operationActive&&<p className="notice">任务正在运行，请等待完成后再保存密钥或测试。</p>}
    <div className="actions">
      <Button disabled={busy||operationActive||!apiKey.trim()||!ready} onClick={()=>action('select-model')}>保存 API 密钥</Button>
      <Button disabled={busy||operationActive||!ready||!profile?.configured||!!apiKey.trim()} onClick={()=>action('vision-check')}>测试视觉连接</Button>
      <Button variant="outline" disabled={busy} onClick={()=>{setBusy(true);void refresh().then(()=>setNote('已刷新固定配置')).catch(error=>setNote(error.message)).finally(()=>setBusy(false));}}>刷新配置</Button>
      <Button disabled={busy} onClick={onClose}>返回</Button>
    </div>
    <p role="status">{note}</p>
  </section></div>;
}

const defaults={platform:'douyin',videoPath:'',title:'',description:'',topics:'',visibility:'private',coverTime:1,bgmPath:'',bgmVolume:0.35,pickMusic:false,musicSearch:'',timeoutSec:60,maxInjectBytes:536870912};
export function PublishPanel(){
  const [draft,setDraft]=useState(defaults),[topic,setTopic]=useState(''),[history,setHistory]=useState([]),[library,setLibrary]=useState(null),[busy,setBusy]=useState(false),[note,setNote]=useState('');
  const edit=patch=>setDraft(old=>({...old,...patch}));
  const refresh=async()=>setHistory((await robotAction('status')).publishing||[]);
  useEffect(()=>{void refresh().catch(e=>setNote(e.message));},[]);
  async function run(action,args){if(busy)return;setBusy(true);setNote('正在处理…');try{const result=await robotAction(action,args);if(action==='caption')edit({...result.data,topics:result.data.topics.join(', ')});if(action==='publish-library')setLibrary(result);setNote(result.message||(action==='publish-prepare'?'预检完成，请核对下方作品信息':'已完成'));await refresh();}catch(e){setNote(e.message);}finally{setBusy(false);}}
  function field(key,label,type='text',extra={}){return <label className="field"><span>{label}</span><input aria-label={label} type={type} value={draft[key]} onChange={e=>edit({[key]:type==='number'?e.target.value===''?'':Number(e.target.value):e.target.value})} {...extra}/></label>;}
  return <div className="settings-page publish-page"><h1>作品发布</h1><p className="notice">先预检，核对后上传到创作者中心。上传草稿停在发布前，正式发布后请在作品管理核对最终结果。</p><fieldset disabled={busy}><label className="field"><span>投稿平台</span><select aria-label="投稿平台" value={draft.platform} onChange={e=>edit({platform:e.target.value,visibility:'private'})}><option value="douyin">抖音</option><option value="bilibili">B站</option></select></label>{field('videoPath','视频文件绝对路径','text',{placeholder:'E:\\视频\\我的作品.mp4'})}<label className="field"><span>作品内容说明</span><textarea aria-label="作品内容说明" rows={2} maxLength={1200} value={topic} onChange={e=>setTopic(e.target.value)}/></label><Button onClick={()=>run('caption',{topic})} disabled={!topic.trim()||busy}>按人格拟标题与文案</Button>{field('title','作品标题','text',{maxLength:30})}<label className="field"><span>作品文案</span><textarea aria-label="作品文案" rows={3} maxLength={1000} value={draft.description} onChange={e=>edit({description:e.target.value})}/></label>{field('topics','话题（逗号分隔）')}<label className="field"><span>可见范围</span><select aria-label="可见范围" value={draft.visibility} onChange={e=>edit({visibility:e.target.value})}><option value="private">仅自己可见</option>{draft.platform==='douyin'&&<option value="friends">好友可见</option>}<option value="public">公开</option></select></label><details className="publish-advanced"><summary>封面与配乐</summary>{draft.platform==='douyin'&&field('coverTime','封面时间（秒，0 为保留默认）','number',{min:0,step:0.1})}{field('bgmPath','本地配乐文件绝对路径')}{field('bgmVolume','配乐音量（0–2）','number',{min:0,max:2,step:0.05})}<Button variant="outline" onClick={()=>run('publish-library',{})}>读取本地配乐库</Button>{library&&<div><p className="notice">将自己的音频放入：{library.dir}</p>{library.tracks.length?<label className="field"><span>选择配乐</span><select aria-label="选择配乐" value={draft.bgmPath} onChange={e=>edit({bgmPath:e.target.value})}><option value="">保留原声</option>{library.tracks.map(t=><option key={t.path} value={t.path}>{t.name}</option>)}</select></label>:<p className="notice">配乐库为空，也可直接填写音频路径。</p>}</div>}{draft.platform==='douyin'&&<><label className="switch-row"><span>上传后打开平台曲库，手动挑选</span><input aria-label="打开平台曲库" type="checkbox" checked={draft.pickMusic} onChange={e=>edit({pickMusic:e.target.checked})}/></label>{field('musicSearch','平台音乐搜索词')}<p className="notice">平台曲库由你在浏览器里选曲。正式发布按钮会重新加载素材；选曲完成后请直接在当前创作者页面发布，以保留选择。</p></>}</details><details className="publish-advanced"><summary>上传高级选项</summary>{field('timeoutSec','等待上传时间（秒）','number',{min:1,max:240})}{field('maxInjectBytes','文件注入上限（字节）','number',{min:1})}<p className="notice">超过上限时上游会尝试系统文件对话框，必要时请手动选取文件。</p></details><div className="actions"><Button variant="primary" disabled={busy} onClick={()=>run('publish-prepare',draft)}>预检并准备作品</Button><Button variant="outline" disabled={busy} onClick={()=>refresh().catch(e=>setNote(e.message))}>刷新发布记录</Button></div></fieldset><p role="status">{note}</p><h2>发布记录</h2>{!history.length&&<p className="muted">还没有准备过作品。</p>}{history.map(row=><section className="publish-record" key={row.id}><h3>{row.options.title}</h3><p>{row.options.platform==='bilibili'?'B站':'抖音'} · {{private:'仅自己可见',friends:'好友可见',public:'公开'}[row.options.visibility]} · {{prepared:'已预检',uploaded:'已上传，停在发布前',submitted:'已点击发布，待平台核对',sending:'正在处理',uncertain:'结果需人工核对'}[row.state]}</p><small>{new Date(row.at).toLocaleString('zh-CN')}</small><details><summary>查看预检与回执</summary><pre>{JSON.stringify({options:row.options,check:row.check,result:row.result,error:row.error},null,2)}</pre></details>{['prepared','uploaded'].includes(row.state)&&<div className="actions"><Button disabled={busy} onClick={()=>run('publish-upload',{id:row.id})}>上传并停在发布前</Button><Button disabled={busy||row.options.pickMusic} onClick={()=>{if(confirm(`确认发布“${row.options.title}”？\n平台：${row.options.platform}\n可见范围：${{private:'仅自己可见',friends:'好友可见',public:'公开'}[row.options.visibility]}`))void run('publish-submit',{id:row.id,confirm:true});}}>确认发布</Button></div>}{row.options.pickMusic&&<p className="notice">使用平台曲库的作品，请选曲后在当前浏览器页面核对并发布。</p>}{row.state==='uncertain'&&<p className="notice error">请在创作者中心核对实际结果，不会自动重试。</p>}</section>)}</div>;
}
