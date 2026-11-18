"""Exercise the real worker using fake windows. Never imports or controls WeChat."""
from pathlib import Path
import importlib.util,io,json,sys
from types import SimpleNamespace as NS
spec=importlib.util.spec_from_file_location('wechat_worker',Path(__file__).resolve().parents[1]/'companion/wechat-desktop-worker.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
assert worker.title_matches('测试群 (3)','测试群')
assert not worker.title_matches('测试群二','测试群')
rows=[{'id':1,'text':'旧消息','mine':False}];sent=[];draft=''
class Item:
 def __init__(self,row):self.row=row;self.element_info=NS(runtime_id=[1,row['id']])
 def class_name(self):return 'mmui::ChatTextItemView'
 def window_text(self):return self.row['text']
class Control:
 def __init__(self,key):self.key=key
 def exists(self,timeout=0):return self.key!='group'
 def window_text(self):return '测试好友' if self.key=='title' else draft if self.key=='edit' else ''
 def children(self,**kwargs):return [Item(row) for row in rows]
 def set_text(self,text):
  global draft;draft=text
 def type_keys(self,keys,**kwargs):
  global draft;assert keys=='%s';sent.append(draft);rows.append({'id':len(rows)+1,'text':draft,'mine':True});draft=''
class Window:
 def exists(self,timeout=0):return True
 def child_window(self,**kwargs):return Control(kwargs['key'])
window=Window()
sdk=(NS(open_seperate_dialog_window=lambda **kw:window),NS(is_my_bubble=lambda item:item.row['mine']),lambda **kw:NS(window=lambda **query:window),NS(MainWindow={'key':'main'},SessionList={'key':'session'}),NS(FriendChatList={'key':'list'}),NS(CurrentChatNameText={'key':'title'},GroupLabelText={'key':'group'}),NS(InputEdit={'key':'edit'}))
worker.load_sdk=lambda:sdk;worker.time.sleep=lambda _:None
def commands():
 yield json.dumps({'id':'config','op':'configure','targets':[{'id':'friend','name':'测试好友','kind':'private','nickname':''}]})+'\n'
 yield json.dumps({'id':'first','op':'poll'})+'\n'
 first=json.loads(output.getvalue().strip().splitlines()[-1])['result'];assert first['messages']==[]
 rows.append({'id':2,'text':'新的提问','mine':False})
 yield json.dumps({'id':'second','op':'poll','cursor':first['cursor']})+'\n'
 second=json.loads(output.getvalue().strip().splitlines()[-1])['result'];assert len(second['messages'])==1
 yield json.dumps({'id':'repeat','op':'poll','cursor':'not-committed'})+'\n'
 repeated=json.loads(output.getvalue().strip().splitlines()[-1])['result'];assert repeated['messages']==second['messages']
 yield json.dumps({'id':'ack','op':'poll','cursor':second['cursor']})+'\n'
 ack=json.loads(output.getvalue().strip().splitlines()[-1])['result'];assert ack['messages']==[]
 yield json.dumps({'id':'send','op':'send','peer':'friend','item':{'type':'text','text':'程序回复'}})+'\n'
 assert sent==['程序回复']
 global draft;draft='人类尚未发送的草稿'
 yield json.dumps({'id':'draft','op':'send','peer':'friend','item':{'type':'text','text':'不能覆盖'}})+'\n'
 rejected=json.loads(output.getvalue().strip().splitlines()[-1]);assert rejected['ok'] is False;assert len(sent)==1
 yield json.dumps({'op':'stop'})+'\n'
output=io.StringIO();worker.WIRE=output;old_input=sys.stdin;sys.stdin=commands()
try:worker.run()
finally:sys.stdin=old_input
print('PASS real desktop worker with fake windows: baseline suppression, cursor acknowledgement/replay, target identity, verified send and human-draft protection; no Windows UI touched')
