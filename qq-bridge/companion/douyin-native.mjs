// Only the installed upstream UI's API surface is exposed, never an arbitrary URL.
const reads=new Set(['bootstrap','state','watch/state','watch/schedule','watch/options','video/status','chat/state','chat/contacts','share/state','comments/state','interactions/state','mode/state','media/state','persona','task/limits','forward/contacts','memory','usage','reports/state','reports/read']);
const writes=new Set(['browser/open','watch/start','watch/stop','watch/schedule','watch/options','video/policy','video/start','video/end','chat/configure','chat/start','chat/stop','chat/resolve','share/configure','share/resolve','comments/configure','comments/resolve','interactions/configure','mode/configure','media/configure','persona/card','persona/configure','task/limits','task','stop','forward','diagnostics','diagnostics/repair','reports/generate']);
export function nativeRequest(input={}){
  const {method,route,body}=input;
  if(typeof route!=='string'||!route.startsWith('/api/')||/[\\#\r\n]/.test(route))throw Error('抖音接口地址无效');
  const [pathname,query='']=route.split('?');
  if(route.split('?').length>2||!(method==='GET'?reads:method==='POST'?writes:new Set()).has(pathname.slice(5)))throw Error('抖音接口未开放');
  const allowed=pathname==='/api/state'?['since']:pathname==='/api/memory'?['query','limit']:pathname==='/api/reports/read'?['date']:[];
  for(const key of new URLSearchParams(query).keys())if(!allowed.includes(key))throw Error('抖音接口参数无效');
  if(method==='POST'&&(!body||typeof body!=='object'||Array.isArray(body)))throw Error('抖音接口正文无效');
  return {method,route,body,pathname};
}
export function needsVision({method,pathname,body}){
  return method==='POST'&&(['/api/task','/api/watch/start','/api/video/start','/api/chat/start'].includes(pathname)||pathname==='/api/watch/schedule'&&body.enabled===true||['/api/interactions/configure','/api/share/configure'].includes(pathname)&&body.enabled===true);
}
