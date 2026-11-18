"""QQ space transport based on SnowLuma's local Qzone implementation.
Add missing p_uin and use the working user.qzone read route. Cookies stay in RAM.
Writes are single-shot: an uncertain network result is never automatically retried.
"""
import json
import sys
import urllib.request
import urllib.parse
from pathlib import Path

ROOT=Path(__file__).resolve().parent

def parse_json(text):
    start=text.find('{');end=text.rfind('}')
    if start<0 or end<start:raise ValueError('空间返回了无法识别的内容')
    data=json.loads(text[start:end+1])
    for key in ('code','subcode'):
        if key in data and int(data[key] or 0)!=0:
            if int(data[key]) in (-3000,-10001):raise ValueError('空间登录态失效，请在QQ客户端打开一次自己的空间后再试')
            raise ValueError('空间接口返回 '+str(data[key])+'：'+str(data.get('message') or data.get('msg') or '操作失败')[:120])
    return data

def execute(action,params,call,request):
    allowed={'get_qzone_msg_list','send_qzone_msg','like_qzone','comment_qzone'}
    if action not in allowed:raise ValueError('Unsupported space action')
    info=call('get_login_info',{})
    self_uin=str(info['user_id'])
    cookie=call('get_cookies',{'domain':'qzone.qq.com'})['cookies']
    jar=dict(x.strip().split('=',1) for x in cookie.split(';') if '=' in x)
    jar.setdefault('p_uin',jar.get('uin','o'+self_uin))
    key=jar.get('p_skey') or jar.get('skey') or ''
    if not key:raise ValueError('没有取到空间登录态，请先在QQ客户端打开空间')
    bkn=5381
    for ch in key:bkn+=(bkn<<5)+ord(ch)
    token=str(bkn&2147483647)
    owner=str(params.get('target_uin') or self_uin)
    headers={'Cookie':'; '.join(k+'='+v for k,v in jar.items()),'Referer':'https://user.qzone.qq.com/'+self_uin,'User-Agent':'Mozilla/5.0','Content-Type':'application/x-www-form-urlencoded'}
    body=None
    if action=='get_qzone_msg_list':
        url='https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6?'+urllib.parse.urlencode({'uin':owner,'ftype':'0','sort':'0','pos':str(params.get('pos',0)),'num':str(min(20,int(params.get('num',8)))),'g_tk':token,'code_version':'1','format':'json'})
    elif action=='send_qzone_msg':
        url='https://h5.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_publish_v6?g_tk='+token
        body={'syn_tweet_verson':'1','paramstr':'1','pic_template':'','richtype':'','richval':'','special_url':'','subrichtype':'','con':params['content'],'feedversion':'1','ver':'1','ugc_right':'4','to_sign':'0','who':'1','hostuin':self_uin,'code_version':'1','format':'json','qzreferrer':'https://user.qzone.qq.com/'+self_uin}
    elif action=='like_qzone':
        url='https://h5.qzone.qq.com/proxy/domain/w.qzone.qq.com/cgi-bin/likes/internal_dolike_app?g_tk='+token
        link='http://user.qzone.qq.com/'+owner+'/mood/'+params['tid']
        body={'qzreferrer':'https://user.qzone.qq.com/'+self_uin,'opuin':self_uin,'unikey':link,'curkey':link,'appid':'311','typeid':'0','abstime':str(params.get('abstime',0)),'fid':params['tid'],'from':'1','active':'0','fupdate':'1','format':'json'}
    else:
        url='https://h5.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_re_feeds?g_tk='+token
        body={'qzreferrer':'https://user.qzone.qq.com/'+self_uin,'inCharset':'utf-8','outCharset':'utf-8','hostUin':owner,'format':'json','ref':'feeds','topicId':owner+'_'+params['tid']+'__1','feedsType':'100','private':'0','paramstr':'1','richtype':'','richval':'','isSignIn':'','uin':self_uin,'content':params['content'],'plat':'qzone','source':'ic','platformid':'52'}
    data=parse_json(request(url,body,headers))
    if action=='get_qzone_msg_list':
        if not isinstance(data.get('msglist'),list):raise ValueError('空间列表结构异常，未将失败当作空列表')
        return {'total':data.get('total',0),'msglist':[{'tid':str(x.get('tid','')),'content':x.get('content',''),'time':int(x.get('created_time',0)),'images':[p.get('url3') or p.get('url2') or p.get('url1') for p in x.get('pic',[])]} for x in data['msglist']]}
    if action=='send_qzone_msg':
        tid=data.get('t1_tid') or data.get('tid')
        if not tid:raise ValueError('空间未返回说说ID，无法确认发布成功，请先检查空间，不要重复发送')
        return {'tid':str(tid)}
    return {'comment_id':str(data.get('commentid') or data.get('commentId') or '')} if action=='comment_qzone' else {}

def main():
    cfg=json.loads((ROOT.parent/'config.json').read_text(encoding='utf-8-sig'))
    def call(action,body):
        req=urllib.request.Request(cfg['snowluma']['httpUrl']+'/'+action,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+cfg['snowluma'].get('accessToken','')})
        with urllib.request.urlopen(req,timeout=20) as response:data=json.load(response)
        if data.get('status')=='failed' or data.get('retcode',0)!=0:raise ValueError('QQ登录接口暂不可用')
        return data['data']
    def request(url,body,headers):
        req=urllib.request.Request(url,data=urllib.parse.urlencode(body).encode() if body is not None else None,headers=headers)
        with urllib.request.urlopen(req,timeout=20) as response:return response.read(2_000_000).decode('utf-8')
    payload=json.loads(sys.stdin.read(20000))
    result=execute(payload['action'],payload.get('params',{}),call,request)
    print(json.dumps({'ok':True,'data':result},ensure_ascii=False))

if __name__=='__main__':
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    try:main()
    except Exception as exc:
        # Never echo raw URLs/cookies or network exception objects.
        message=str(exc) if isinstance(exc,ValueError) else '空间请求未完成；请检查空间实际结果后再决定是否重试'
        print(json.dumps({'ok':False,'error':message},ensure_ascii=False));sys.exit(1)
