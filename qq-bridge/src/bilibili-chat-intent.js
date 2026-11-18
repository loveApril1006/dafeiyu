// Small deterministic execution cues; video text never enters this classifier.
const SITE = /B\s*站|bilibili|哔哩哔哩|小破站/i;
const ACTION = /刷|逛|看(?:看|会|一会|一眼|视频)?|跑.{0,3}轮/;
const NEGATIVE = /(?:不(?:想|会|去|能|打算|准备|用|要)?|没(?:有|空|去|在)?|别|不要|尚未|还没|假如|如果|比如|假装|扮演|并非|不是|能不能|要不要).{0,9}(?:去|刷|逛|看)|(?:去|刷|逛|看).{0,9}(?:不了|不成)/;
export function biliIncomingIntent(text) {
  const s = String(text || '').trim().slice(0, 1000);
  if (!SITE.test(s) || !ACTION.test(s) || NEGATIVE.test(s)) return false;
  return /(?:你|自己|去|可以|让你|帮我|随便|继续).{0,14}(?:刷|逛|看)|(?:刷|逛|看).{0,14}(?:吧|去|一会|会儿|几轮|一下)/.test(s);
}
export function biliOutgoingIntent(text, { recentRequest = false } = {}) {
  // Quotations/code/questions are not commitments by the assistant.
  const s = String(text || '').replace(/```[\s\S]*?```|[“「『"][^”」』"\n]*[”」』"]/g, '').trim().slice(0, 1000);
  if ((!SITE.test(s) && !recentRequest) || !ACTION.test(s)) return null;
  if (!SITE.test(s) && (!/刷|跑.{0,3}轮/.test(s) || /刷牙|刷题|刷卡|刷碗|刷锅|刷鞋|游戏|副本|抖音|小红书|朋友圈|微博|电影|电视剧/.test(s))) return null;
  if (/还没(?:有)?(?:去)?刷|没(?:有|在|去)?刷|尚未(?:开始)?刷/.test(s)) return { kind: 'denial' };
  if (NEGATIVE.test(s) || /[?？]/.test(s)) return null;
  if (/(?:你|您|他|她).{0,3}(?:去|自己去|刷|看|逛)/.test(s) && !/(?:我|咱).{0,10}(?:去|刷|看|逛|跑)/.test(s)) return null;
  const count = /(?:刷|看|逛|跑)(?:上|个|完)?(?:\s*(?:B\s*站|bilibili)\s*)?\s*([一二两三四五六七八九十\d]{1,2})\s*轮/i.exec(s)?.[1];
  const numbers = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 一两: 2, 两三: 3 };
  const rounds = count ? numbers[count] || Number(count) : undefined;
  if (/(?:正在|已经在|还在|我在)刷/.test(s)) return { kind: 'start', rounds, promisedFeedback: false };
  const going = /(?:我|咱)[^，。！？；\n]{0,14}(?:去|刷|逛|看|跑)|(?:^|[，。；])\s*(?:这就|现在|准备|打算|继续|接着|先去|去)[^，。！？；\n]{0,8}(?:刷|逛|看|跑)/.test(s)
    || recentRequest && /(?:^|[，。；])\s*(?:刷|逛|跑).{0,10}(?:去|走起|再来|回来|会儿|一会|轮)/.test(s);
  const finished = /(?:刚|刚刚|已经|我).{0,10}(?:刷(?:到|完|了)|看(?:到|完|了)|逛(?:完|了))/.test(s);
  if (!going && !finished) return null;
  const future = /(?:去|再|继续|接着|准备|打算).{0,8}(?:刷|看|逛|跑)|(?:刷|看|逛|跑).{0,8}(?:去|会儿|一会)|(?:刷|看)完.{0,8}(?:再来|再告诉|就回来)/.test(s);
  if (finished && !future) return { kind: 'claim', rounds };
  return { kind: 'start', rounds,
    promisedFeedback: /告诉你|跟你说|来烦你|吐槽|分享|回来.*(?:聊|说)/.test(s) };
}

export function compactBiliItem(row) {
  if(row?.picked===false)return null;
  const bvid = String(row?.bvid || '');
  if (!/^BV[a-zA-Z0-9]{10}$/.test(bvid)) return null;
  const clean = (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/(?:sk-[a-zA-Z0-9_-]{12,}|Bearer\s+\S+|(?:SESSDATA|bili_jct|api_key|access_token|password)\s*[=:]\s*[^\s,;]+)/gi, '[已隐去]').trim().slice(0, max);
  const title = clean(row.title, 100), note = clean(row.note || row.summary, 280);
  if (!title || !note) return null; // Titles alone are not evidence of reading.
  return { bvid, title, note, at: Number(row.ts) || Date.parse(row.at || '') || 0,
    url: 'https://www.bilibili.com/video/' + bvid };
}

export function biliJobContext(job) {
  if (!job) return '';
  const labels = { starting: '启动中，尚未确认', running: '实际任务运行中', between: '一轮结束，准备下一轮',
    done: '任务已完成', failed: '任务失败', cancelled: '后续轮次已取消', interrupted: '联动追踪已中断' };
  const videos = (job.videos || []).slice(-3).map(({ title, note, url }) => ({ title, note: note.slice(0, 180), url }));
  const data={ state: labels[job.state] || job.state, plannedRounds: job.plannedRounds,
    finishedRounds: job.finishedRounds, reason: String(job.reason || '').slice(0, 140), videos };
  while(JSON.stringify(data).length>1300&&data.videos.length)data.videos.pop();
  return JSON.stringify(data);
}
