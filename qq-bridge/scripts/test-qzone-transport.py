import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'companion'))
from qzone_transport import execute
calls=[]
def call(action,params):
    return {'user_id':123456} if action=='get_login_info' else {'cookies':'uin=o123456; skey=fixture; p_skey=fixture-pskey'}
def request(url,body,headers):
    calls.append((url,body,headers));assert 'p_uin=o123456' in headers['Cookie']
    if 'msglist' in url:return '{"code":0,"total":1,"msglist":[{"tid":"one","content":"hi","created_time":123}]}'
    if 'publish' in url:return '{"code":0,"t1_tid":"published"}'
    return '{"code":0}'
read=execute('get_qzone_msg_list',{},call,request)
assert read['msglist'][0]['tid']=='one' and calls[-1][0].startswith('https://user.qzone.qq.com/')
assert execute('send_qzone_msg',{'content':'hello'},call,request)['tid']=='published'
assert calls[-1][1]['ugc_right']=='4'
execute('like_qzone',{'tid':'one','target_uin':654321,'abstime':123},call,request)
assert calls[-1][1]['unikey']=='http://user.qzone.qq.com/654321/mood/one'
count=0
def fail(url,body,headers):
    global count
    count+=1;raise TimeoutError('uncertain write')
try:execute('send_qzone_msg',{'content':'hello'},call,fail)
except TimeoutError:pass
else:raise AssertionError('Write error swallowed')
assert count==1
print('PASS: missing login cookie completion; working space read route; friends-only posts; concrete like target; no automatic write retry. All HTTP calls mocked.')
