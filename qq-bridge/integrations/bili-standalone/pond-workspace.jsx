import * as React from 'react';
import {pondReadiness,pondVideoMatches,pondVideoUrl,pondVideoKeywords,pondPermissions,pondBudgetAdvice} from './pond-workflow.mjs';

const TABS=[['history','视频'],['memory','笔记'],['diary','日记'],['settings','设置']];
const flat = children => children.flat(Infinity).filter(React.isValidElement);
const DEFAULT_AVATAR='/console-assets/assistant-avatar.webp';
const FALLBACK_COVER='/console-assets/video-cover.webp';
function ActionIcon({name}) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name==='play'?<path d="m9 5 11 7-11 7Z"/>:name==='refresh'?<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 18 17"/></>:<path d="M5 12h14m-5-5 5 5-5 5"/>}</svg>;
}

function VideoLibrary({items,likedMap,undoArm,undoBusy,onUndoLike,ready,onSetup,onRun,locked}) {
  const [query,setQuery]=React.useState('');
  const [filter,setFilter]=React.useState('all');
  const [failedCovers,setFailedCovers]=React.useState({});
  const visible=items.filter(item=>pondVideoMatches(item,query)&&(filter==='all'||(filter==='saved'?item.picked:!item.picked)));
  return <section className="pond-library" aria-label="视频记录">
    <div className="pond-library-toolbar"><div><h2>视频记录</h2><span>{visible.length} 条记录</span></div><label className="pond-search"><span className="sr-only">搜索视频</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索视频、UP主或笔记" /></label></div>
    <div className="pond-filters" role="group" aria-label="筛选视频">{[['all','全部'],['saved','已归档'],['skipped','已跳过']].map(([value,label])=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div>
    {visible.length?<div className="pond-video-grid">{visible.map((item,index)=>{
      const url=pondVideoUrl(item.bvid),liked=likedMap?.[item.bvid],armed=undoArm===item.bvid;
      const cover=!failedCovers[item.pic]&&typeof item.pic==='string'&&/^https:\/\//.test(item.pic)?item.pic:null;
      return <article className="pond-v pond-video" key={String(item.date)+'|'+item.bvid+'|'+index}>
        <a href={url||undefined} target="_blank" rel="noopener noreferrer" aria-label={'打开视频：'+item.title} className="pond-cover" aria-disabled={!url}>
          {cover?<img src={cover} alt="" referrerPolicy="no-referrer" loading="lazy" onError={()=>setFailedCovers(previous=>({...previous,[cover]:true}))}/>:<img className="pond-cover-fallback" src={FALLBACK_COVER} alt="" loading="lazy"/>}
          <span className={'pond-video-state'+(item.picked?' saved':'')}>{item.picked?'已归档':'已跳过'}</span>
        </a>
        <div className="pond-video-body"><h3><a href={url||undefined} target="_blank" rel="noopener noreferrer">{item.title||item.bvid}</a></h3><p className="pond-video-meta">{[item.owner,item.date].filter(Boolean).join(' · ')}</p>{item.note&&<p className="pond-video-note">{String(item.note)}</p>}
          {String(item.note||'').length>160&&<details className="pond-full-note"><summary>完整笔记</summary><p>{String(item.note)}</p></details>}
          <div className="pond-video-bottom"><span>{pondVideoKeywords(item).slice(0,2).join(' / ')||'视频记录'}</span>{liked&&<button type="button" disabled={undoBusy===item.bvid} onClick={()=>onUndoLike(item.bvid)} aria-label={(armed?'确认撤销点赞：':'撤销点赞：')+item.title}>{undoBusy===item.bvid?'处理中…':armed?'再次点击撤销':'已点赞 · 撤销'}</button>}</div>
        </div>
      </article>;
    })}</div>:<div className="pond-library-empty"><img className="pond-empty-art" src={FALLBACK_COVER} alt=""/><strong>{query||filter!=='all'?'没有匹配的视频':'还没有观看记录'}</strong><p>{query||filter!=='all'?'换个关键词或筛选条件试试。':'连接就绪后，开始第一轮观看。'}</p>{!query&&filter==='all'&&<button className="pond-primary" type="button" disabled={locked} onClick={ready?onRun:onSetup}>{ready?'开始观看':'完成连接设置'}</button>}</div>}
  </section>;
}

export function PondWorkspace({data,status,tab,setTab,busy,running,finalizing,runElapsed,quickBusy,quickMsg,run,load,syncRun,likedMap,undoArm,undoBusy,onUndoLike,error,originalChildren}) {
  const [checkingStart,setCheckingStart]=React.useState(false);
  const [refreshing,setRefreshing]=React.useState(false);
  const [actionNote,setActionNote]=React.useState('');
  const [avatarFailed,setAvatarFailed]=React.useState(false);
  const accountFace=data?.account?.face;
  React.useEffect(()=>setAvatarFailed(false),[accountFace]);
  const avatar=!avatarFailed&&typeof accountFace==='string'&&/^https:\/\//.test(accountFace)?accountFace:DEFAULT_AVATAR;
  const startFlight=React.useRef(false);
  const nodes=flat(originalChildren),config=data?.config||{},stats=data?.stats||{};
  const readiness=pondReadiness(status,config),locked=checkingStart||busy||running||finalizing;
  const permissions=pondPermissions(config),budgetAdvice=pondBudgetAdvice(config);
  const styles=nodes.find(node=>node.type==='style');
  const quick=nodes.find(node=>node.props.className==='pond-quick');
  const policy=quick?flat([quick.props.children]).slice(0,2):[];
  const oldContent=nodes.find(node=>node.props.className==='pond-cols'||node.props.className==='pond-card'||node.props.className==='pond-card pond-settings');
  const historyExtras=oldContent?.props.className==='pond-cols'?flat([oldContent.props.children])[1]:null;
  const onRefresh=async()=>{setRefreshing(true);setActionNote('');try{await Promise.all([load(),syncRun()]);}finally{setRefreshing(false);}};
  const start=async()=>{
    if(!readiness.ready||locked||startFlight.current)return;
    startFlight.current=true;setCheckingStart(true);setActionNote('');
    try{
      const latest=await syncRun();
      if(!latest){setActionNote('无法确认当前状态，请刷新后重试。');return;}
      if(latest.running||latest.finalizing){setActionNote('已有任务正在处理，请等待完成。');return;}
      const current=pondReadiness(latest,latest.config||config);
      if(!current.ready){setActionNote(current.message);return;}
      await run();
    }finally{startFlight.current=false;setCheckingStart(false);}
  };
  const onSetup=()=>setTab('settings');
  const runLabel=busy?'正在启动…':running?'观看中'+(runElapsed?' · '+Math.floor(runElapsed/60)+':'+String(runElapsed%60).padStart(2,'0'):''):finalizing?'正在整理记录…':checkingStart?'正在检查…':'开始观看';
  return <div className="pond pond-workspace">
    {styles}
    <header className="pond-workspace-bar"><div className="pond-identity"><span className="pond-account-icon"><img src={avatar} alt="账号头像" onError={()=>setAvatarFailed(true)}/></span><div><h1 className="pond-standalone-title">B站鱼塘</h1><strong>{data?.account?.uname||(status?.loggedIn?'B站账号已登录':'B站账号未登录')}</strong><p>{running?'正在读取视频内容':config.autoRun?'自动运行已开启':'当前为手动观看'}</p></div></div><div className="pond-main-actions"><button type="button" onClick={onRefresh} disabled={refreshing}><ActionIcon name="refresh"/>{refreshing?'刷新中…':'刷新'}</button><button className="pond-primary" type="button" disabled={!readiness.ready||locked} onClick={start} aria-busy={locked}><ActionIcon name="play"/>{runLabel}</button></div></header>
    <section className={'pond-connection'+(readiness.ready?' ready':'')} aria-label="连接准备"><div><span className="pond-connection-dot" aria-hidden="true"/><strong>{readiness.message}</strong></div><div className="pond-readiness"><span data-ready={status?.venvReady===true}>运行环境</span><span data-ready={status?.loggedIn===true}>B站登录</span><span data-ready={!!config.dutyProvider&&!!config.dutyModel}>模型选择</span></div>{!readiness.ready&&<button type="button" onClick={onSetup}>去设置<ActionIcon name="arrow"/></button>}</section>
    <div className="pond-workspace-metrics"><div><span>历史视频</span><strong>{stats.items??'—'}</strong></div><div><span>今日归档</span><strong>{status?String(status.pickedToday||0)+' / '+String(config.perDayMax??'—'):'—'}</strong></div><div><span>今日轮次</span><strong>{status?.roundsToday??status?.ranToday??'—'}</strong></div><div><span>自动运行</span><strong className="pond-metric-label">{config.autoRun?'已开启':'未开启'}</strong></div></div>
    {error&&<p className="pond-workspace-error" role="alert">{error}</p>}
    {actionNote&&<p className="pond-workspace-message" role="status">{actionNote}</p>}
    <div className="pond-permission-summary"><span>本轮已允许</span>{permissions.map(label=><strong key={label}>{label}</strong>)}</div>
    {budgetAdvice&&<p className="pond-budget-advice" role="status">{budgetAdvice}</p>}
    {quickMsg&&<p className="pond-workspace-message" role="status">{quickMsg.text}</p>}
    <nav className="pond-tabs pond-workspace-tabs" aria-label="鱼塘分区">{TABS.map(([key,label])=><button type="button" key={key} className={'pond-tab'+(tab===key?' on':'')} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}</nav>
    {tab==='history'?<><VideoLibrary items={data?.items||[]} likedMap={likedMap} undoArm={undoArm} undoBusy={undoBusy} onUndoLike={onUndoLike} ready={readiness.ready} onSetup={onSetup} onRun={start} locked={locked}/>{historyExtras&&<details className="pond-run-records"><summary>任务与互动记录</summary>{historyExtras}</details>}</>:oldContent}
    <details className="pond-interaction-policy"><summary><strong>互动权限</strong><span>评论与私信会实际发送内容，按需开启</span></summary><div className="pond-policy-controls">{policy}</div><p>每次观看按已保存的权限执行；私信仅发给指定 UID。</p>{quickBusy&&<p role="status">正在保存{quickBusy}…</p>}</details>
    <details className="pond-about"><summary>关于与开源说明</summary><p>基于 dsh-bili-pond 的数据接口与运行流程调整界面。</p><a href="https://github.com/YOYOLnFu/dsh-bili-pond" target="_blank" rel="noopener noreferrer">原项目与许可证 ↗</a></details>
  </div>;
}
