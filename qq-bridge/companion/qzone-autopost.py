"""One-shot QQ-space publisher. Cookie stays in memory; no retries or QR login."""
from pathlib import Path
import asyncio,json,logging,sys,urllib.request,urllib.parse

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'integrations/qzone-sdk-upstream/src'))
logging.disable(logging.CRITICAL)

class PublicError(Exception):pass

def publish_once(payload,call,client_factory=None):
 text=payload.get('text','');visibility=payload.get('visibility',4)
 if not payload.get('probe') and (not isinstance(text,str) or not 0<len(text)<=1000 or visibility not in (1,4,64)):raise PublicError('说说内容或可见范围无效')
 media=[]
 if payload.get('imageFile'):
  base=(ROOT/'companion/qzone-data/images').resolve();image=Path(payload['imageFile']).resolve()
  if image.parent!=base or image.suffix not in ('.png','.jpg','.webp') or not image.is_file() or not 12<=image.stat().st_size<=8*1024*1024:raise PublicError('配图不在空间授权目录或大小无效')
  media=[str(image)]
 info=call('get_login_info',{});uin=str(info['user_id'])
 cookie=call('get_cookies',{'domain':'qzone.qq.com'})['cookies'];jar=dict(part.strip().split('=',1) for part in cookie.split(';') if '=' in part)
 if not (jar.get('p_skey') or jar.get('skey')):raise PublicError('QQ空间登录态不可用，请在QQ客户端打开自己的空间后再试')
 jar.setdefault('p_uin',jar.get('uin','o'+uin));cookie='; '.join(k+'='+v for k,v in jar.items())
 if payload.get('probe'):return {'ready':True}
 if client_factory is None:
  from qzone_sdk import QZoneClient,ManualCookieProvider
  client=QZoneClient(auth_provider=ManualCookieProvider(cookie,uin),timeout=20)
  class NoRedirect(urllib.request.HTTPRedirectHandler):
   def redirect_request(self,*args,**kwargs):raise PublicError('空间请求出现重定向，操作已停止')
  class BoundedHttp:
   publishing=False
   def post(self,url,data,headers,timeout):
    from qzone_sdk.utils.jsonp import parse_jsonp
    target=urllib.parse.urlsplit(url)
    if target.scheme!='https' or (target.netloc,target.path) not in [('up.qzone.qq.com','/cgi-bin/upload/cgi_upload_image'),('user.qzone.qq.com','/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_publish_v6')]:raise PublicError('空间请求地址不在允许范围')
    if 'emotion_cgi_publish' in target.path:self.publishing=True
    request=urllib.request.Request(url,data=urllib.parse.urlencode(data).encode(),headers=headers,method='POST')
    with urllib.request.build_opener(NoRedirect()).open(request,timeout=timeout) as response:raw=response.read(1024*1024+1)
    if len(raw)>1024*1024:raise PublicError('空间返回的数据过大')
    return parse_jsonp(raw.decode('utf-8',errors='replace'))
  transport=BoundedHttp();client._http=transport
 else:client,transport=client_factory(cookie,uin)
 try:
  result=asyncio.run(client.publish(text,visible=visibility,image_paths=media or None))
  if not result.get('success') or not result.get('tid'):raise PublicError('空间未确认发布成功，请检查实际空间记录')
  return {'tid':str(result['tid'])}
 except Exception as error:
  public=PublicError(str(error) if isinstance(error,PublicError) else '空间发布未完成，请检查实际记录后再操作');public.uncertain=transport.publishing;raise public from None

def main():
 cfg=json.loads((ROOT/'config.json').read_text(encoding='utf-8-sig'));base=cfg['snowluma']['httpUrl'];url=urllib.parse.urlsplit(base)
 if url.scheme not in ('http','https') or url.hostname not in ('localhost','127.0.0.1','::1'):raise PublicError('空间只允许复用本机QQ服务')
 def call(action,body):
  req=urllib.request.Request(base.rstrip('/')+'/'+action,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+cfg['snowluma'].get('accessToken','')})
  with urllib.request.urlopen(req,timeout=10) as response:raw=response.read(100000)
  value=json.loads(raw)
  if value.get('status')=='failed' or value.get('retcode',0)!=0:raise PublicError('QQ服务尚未登录或没有空间权限')
  return value['data']
 payload=json.loads(sys.stdin.read(16000));return publish_once(payload,call)

if __name__=='__main__':
 sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
 try:print(json.dumps({'ok':True,**main()},ensure_ascii=False))
 except Exception as error:print(json.dumps({'ok':False,'uncertain':getattr(error,'uncertain',False),'error':str(error) if isinstance(error,PublicError) else '空间登录或发布未完成，请检查QQ状态'},ensure_ascii=False));sys.exit(1)
