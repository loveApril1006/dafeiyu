"""Single-owner UI worker; JSON-lines over private stdin/stdout, no network listener.
The backend starts it only when the desktop channel is explicitly enabled.
"""
from pathlib import Path
import contextlib,json,sys,time,hashlib,os
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'integrations/pywechat-upstream/src'))
WIRE=sys.stdout
def emit(value):
 WIRE.write(json.dumps(value,ensure_ascii=False)+'\n');WIRE.flush()
def load_sdk():
 with contextlib.redirect_stdout(sys.stderr):
  from pyweixin import Navigator,Tools,GlobalConfig
  from pyweixin.Uielements import Main_window,Lists,Texts,Edits
  from pywinauto import Desktop
 GlobalConfig.close_weixin=False;GlobalConfig.is_maximize=False;GlobalConfig.load_delay=1
 return Navigator,Tools,Desktop,Main_window,Lists,Texts,Edits
def probe(sdk):
 Navigator,Tools,Desktop,Main,Lists,Texts,Edits=sdk
 main=Desktop(backend='uia').window(**Main.MainWindow)
 if not main.exists(timeout=2):return {'passed':False,'reason':'未找到已登录的微信主窗口，请打开电脑版微信主界面'}
 if not main.child_window(**Main.SessionList).exists(timeout=2):return {'passed':False,'reason':'当前微信未暴露聊天控件；此账号或客户端暂不能使用UI通道，未启动自动回复'}
 return {'passed':True,'reason':'微信聊天控件可见，仍需用指定测试会话验证收发'}
def title_of(window,Texts):
 title=window.child_window(**Texts.CurrentChatNameText)
 if not title.exists(timeout=1):raise RuntimeError('无法核对当前微信聊天对象，已停止操作')
 return title.window_text().strip()
def title_matches(actual,target):
 # WeChat appends a member count to group titles; no fuzzy name matching.
 import re
 return actual==target or re.sub(r'\s*[（(]\d+[）)]$','',actual)==target
def snapshot(window,sdk,known=None,bootstrap=False,limit=25):
 Navigator,Tools,Desktop,Main,Lists,Texts,Edits=sdk
 container=window.child_window(**Lists.FriendChatList)
 if not container.exists(timeout=1):raise RuntimeError('微信消息列表不可读')
 rows=[]
 for item in container.children(control_type='ListItem')[-limit:]:
  if item.class_name()!='mmui::ChatTextItemView':continue
  text=item.window_text().strip()
  if not text:continue
  runtime=':'.join(str(v) for v in (item.element_info.runtime_id or []))
  mid=hashlib.sha256((runtime+'\0'+text).encode()).hexdigest()
  mine=None if bootstrap or mid in (known or set()) else bool(Tools.is_my_bubble(item))
  rows.append({'id':mid,'text':text[:6000],'mine':mine})
 return rows
def run():
 sdk=load_sdk();diagnostic=probe(sdk)
 if '--probe' in sys.argv:emit({'ok':True,'diagnostic':diagnostic});return
 if not diagnostic['passed']:emit({'event':'blocked','error':diagnostic['reason']});return
 Navigator,Tools,Desktop,Main,Lists,Texts,Edits=sdk
 emit({'event':'ready'});targets={};seen={};windows={};primed=set();pending=None;sequence=0;boot=os.urandom(8).hex()
 for raw in sys.stdin:
  request=json.loads(raw);operation=request.get('op');result=None
  try:
   with contextlib.redirect_stdout(sys.stderr):
    if operation=='configure':
     targets={r['id']:r for r in request['targets']};windows.clear();seen.clear();primed.clear();pending=None;result={'ok':True}
    elif operation=='poll':
     if pending and request.get('cursor')==pending['cursor']:
      seen=pending['seen'];pending=None
     if pending:
      result={'messages':pending['messages'],'cursor':pending['cursor'],'delayMs':5000}
     else:
      messages=[];next_seen={peer:set(ids) for peer,ids in seen.items()}
      for peer,row in targets.items():
       if len(messages)>=16:break
       window=windows.get(peer)
       if window is None or not window.exists(timeout=.2):
        window=Navigator.open_seperate_dialog_window(friend=row['name']);windows[peer]=window;primed.discard(peer)
       if not title_matches(title_of(window,Texts),row['name']):raise RuntimeError('微信窗口名称与允许名单不一致，未读取消息')
       is_group=window.child_window(**Texts.GroupLabelText).exists(timeout=.2)
       if is_group!=(row['kind']=='group'):raise RuntimeError('微信聊天类型与允许名单不一致，请使用唯一备注名或群名')
       known=seen.get(peer,set());rows=snapshot(window,sdk,known=known,bootstrap=peer not in primed)
       if peer not in primed:
        next_seen[peer]={m['id'] for m in rows};primed.add(peer);continue
       accepted=set()
       for msg in rows:
        if msg['id'] in known:continue
        if msg['mine']:accepted.add(msg['id']);continue
        if len(messages)>=16:break
        mentioned=bool(row.get('nickname') and '@'+row['nickname'] in msg['text'])
        messages.append({'id':peer+':'+msg['id'],'peer':peer,'kind':row['kind'],'text':msg['text'],'mentioned':mentioned,'context':'desktop-window'});accepted.add(msg['id'])
       next_seen[peer]=set(list(known)[-75:])|accepted
      sequence+=1;pending={'messages':messages,'cursor':boot+':'+str(sequence),'seen':next_seen};result={'messages':messages,'cursor':pending['cursor'],'delayMs':5000}
    elif operation=='send':
     peer=request['peer'];row=targets.get(peer)
     if row is None:raise RuntimeError('微信收件人不在当前允许名单')
     window=windows.get(peer)
     if window is None or not window.exists(timeout=.2):raise RuntimeError('微信会话窗口已关闭，请等待重新监听后再发送')
     if not title_matches(title_of(window,Texts),row['name']):raise RuntimeError('微信收件人校验失败，未发送')
     if window.child_window(**Texts.GroupLabelText).exists(timeout=.2)!=(row['kind']=='group'):raise RuntimeError('发送前微信聊天类型发生变化，未发送')
     item=request['item']
     if item['type']!='text':raise RuntimeError('电脑版通道当前仅实现文字收发')
     text=item['text'];edit=window.child_window(**Edits.InputEdit)
     if not edit.exists(timeout=1):raise RuntimeError('未找到微信输入框')
     # Refuse to replace a human's unsent draft.
     if edit.window_text().strip():raise RuntimeError('微信输入框有未发送草稿，已暂停本次发送')
     edit.set_text(text)
     if not title_matches(title_of(window,Texts),row['name']):raise RuntimeError('发送前微信收件人发生变化')
     edit.type_keys('%s',set_foreground=True)
     time.sleep(.8)
     rows=snapshot(window,sdk,limit=5)
     if not any(r['mine'] and r['text']==text for r in rows):raise RuntimeError('微信发送结果未确认，请检查实际聊天记录；不会自动重发')
     result={'ok':True}
    elif operation=='stop':break
    else:raise RuntimeError('未知微信桌面指令')
   emit({'id':request.get('id'),'ok':True,'result':result})
  except Exception as error:
   emit({'id':request.get('id'),'ok':False,'error':str(error)[:200]})
if __name__=='__main__':
 try:run()
 except Exception:emit({'event':'blocked','error':'微信UI驱动未就绪，请查看兼容性诊断；未启动自动回复'})
