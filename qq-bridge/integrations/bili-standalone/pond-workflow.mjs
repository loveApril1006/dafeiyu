export function pondReadiness(status, config = {}) {
  if (!status) return {ready:false, step:'connection', message:'正在检查连接…'};
  if (status.unavailable) return {ready:false, step:'connection', message:'连接检查失败，请刷新重试。'};
  if (status.installing) return {ready:false, step:'environment', message:'运行环境正在准备中。'};
  if (status.venvReady !== true) return {ready:false, step:'environment', message:'请先准备运行环境。'};
  if (status.loggedIn !== true) return {ready:false, step:'account', message:'请先登录 B站账号。'};
  if (!String(config.dutyProvider || '').trim() || !String(config.dutyModel || '').trim()) {
    return {ready:false, step:'model', message:'请先选择鱼塘使用的模型。'};
  }
  return {ready:true, step:'ready', message:'连接已就绪，可以开始观看。'};
}

export function pondVideoMatches(item, query) {
  const text = [item.title,item.owner,item.note,item.bvid,...pondVideoKeywords(item)].map(value=>String(value || '')).join(' ').toLocaleLowerCase();
  return text.includes(String(query || '').trim().toLocaleLowerCase());
}

export function pondVideoKeywords(item={}) {
  const values=Array.isArray(item.keywords)?item.keywords:typeof item.keywords==='string'?item.keywords.split(/[,，]/):[];
  return values.filter(value=>typeof value==='string').map(value=>value.trim()).filter(Boolean);
}

export function pondVideoUrl(bvid) {
  return /^BV[0-9a-z]+$/i.test(String(bvid || '')) ? 'https://www.bilibili.com/video/' + encodeURIComponent(bvid) : null;
}

export function pondPermissions(config={}) {
  const active=[];
  if(config.autoComment||config.circleMode||config.replyToComments||config.guardOn)active.push('评论');
  if(config.dmOn)active.push('私信');
  if(config.likeOn)active.push('点赞');
  if(config.favOn)active.push('收藏');
  return active.length?active:['仅观看与记笔记'];
}

export function pondBudgetAdvice(config={}) {
  const {autoRun,autoRunsPerDay,perRoundMax,perDayMax}=config;
  if(!autoRun||![autoRunsPerDay,perRoundMax,perDayMax].every(v=>Number.isFinite(v)&&v>0))return '';
  return autoRunsPerDay*perRoundMax>perDayMax?'每日归档上限可能先用完，实际运行轮数会少于计划。':'';
}
