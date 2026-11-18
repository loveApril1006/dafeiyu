"""Read-only authentication diagnosis; no cookie values or feed content printed."""
import json,re,urllib.request,urllib.parse
from pathlib import Path
cfg=json.loads((Path(__file__).resolve().parents[1]/'config.json').read_text(encoding='utf-8-sig'))
def call(action,body):
    req=urllib.request.Request(cfg['snowluma']['httpUrl']+'/'+action,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+cfg['snowluma'].get('accessToken','')})
    with urllib.request.urlopen(req,timeout=25) as r:return json.load(r)['data']
info=call('get_login_info',{})
cookie=call('get_cookies',{'domain':'qzone.qq.com'})['cookies']
jar=dict(x.strip().split('=',1) for x in cookie.split(';') if '=' in x)
jar.setdefault('p_uin',jar.get('uin','o'+str(info['user_id'])))
key=jar.get('p_skey') or jar.get('skey') or '';bkn=5381
for ch in key:bkn+=(bkn<<5)+ord(ch)
params={'uin':str(info['user_id']),'ftype':'0','sort':'0','pos':'0','num':'1','g_tk':str(bkn&2147483647),'code_version':'1','format':'json'}
for base in ('https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6','https://h5.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_msglist_v6'):
    try:
        req=urllib.request.Request(base+'?'+urllib.parse.urlencode(params),headers={'Cookie':'; '.join(k+'='+v for k,v in jar.items()),'Referer':'https://user.qzone.qq.com/'+str(info['user_id']),'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req,timeout=20) as r:text=r.read().decode('utf-8')
        data=json.loads(text[text.find('{'):text.rfind('}')+1])
        print(json.dumps({'route':urllib.parse.urlsplit(base).hostname,'code':data.get('code'),'message':data.get('message'),'list_count':len(data.get('msglist') or [])},ensure_ascii=False))
    except Exception as exc:print(type(exc).__name__)
