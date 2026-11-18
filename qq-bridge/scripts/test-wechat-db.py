"""DB/OCR tests use fake databases and GUI objects, never the user's WeChat."""
from pathlib import Path
from types import SimpleNamespace
import importlib.util,sys,tempfile,sqlite3,hashlib
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'companion'))
from wechat_db_support import DriverError,choose_account,resolve_targets,MessagePump,send_once,bounded_reader
spec=importlib.util.spec_from_file_location('db_worker',Path(__file__).resolve().parents[1]/'companion/wechat-db-worker.py');worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
class DB:
 def __init__(self):self.rows=[]
 def search_contact(self,name):return [{'username':'friend-wxid','remark':'测试好友','nick_name':'昵称'}]
 def latest_seq(self,user):return max([r['sort_seq'] for r in self.rows] or [10])
 def get_new_messages(self,user,since_seq,limit):return [r for r in self.rows if r['sort_seq']>since_seq][:limit]
db=DB();targets=resolve_targets(db,[{'id':'friend','name':'测试好友','kind':'private','nickname':''}]);pump=MessagePump(db,targets,'boot')
db.rows=[{'local_id':1,'sort_seq':11,'sender_id':3,'type':'文本','content':'新的消息'}]
one=pump.poll('');assert len(one['messages'])==1;assert pump.poll('not-saved')==one
assert pump.poll(one['cursor'])['messages']==[]
db.rows.append({'local_id':2,'sort_seq':12,'sender_id':2,'type':'文本','content':'机器人回复'})
echo=pump.poll(pump.pending['cursor']);assert echo['messages']==[]
class GUI:
 def __init__(self):self.enters=0;self.pastes=0;self.draft=False;self.correct=True;self.confirmed=True
 def open_exact(self,name):return self.correct
 def strict_input_box(self):return (1,2,3,4)
 def has_draft(self,box):return self.draft
 def paste_once(self,text,box):self.pastes+=1;self.text=text;return True
 def confirm_exact(self,name):return self.correct
 def enter_once(self):
  self.enters+=1
  if self.confirmed:db.rows.append({'local_id':3,'sort_seq':db.latest_seq('friend-wxid')+1,'sender_id':2,'type':'文本','content':self.text})
gui=GUI();assert send_once(gui,db,targets['friend'],'回复',lambda _:None)['ok'];assert gui.enters==1
gui=GUI();gui.confirmed=False
try:send_once(gui,db,targets['friend'],'不确定结果',lambda _:None);raise AssertionError('Must fail')
except DriverError:pass
assert gui.enters==1 and gui.pastes==1
gui=GUI();gui.draft=True
try:send_once(gui,db,targets['friend'],'不能覆盖',lambda _:None);raise AssertionError('Must fail')
except DriverError:pass
assert gui.enters==0 and gui.pastes==0
gui=GUI();gui.correct=False
try:send_once(gui,db,targets['friend'],'不能误发',lambda _:None);raise AssertionError('Must fail')
except DriverError:pass
assert gui.enters==0
with tempfile.TemporaryDirectory(prefix='wechat-db-metadata-') as directory:
 root=Path(directory);(root/'account/db_storage/message').mkdir(parents=True);(root/'account/db_storage/message/message_0.db').write_bytes(b'not an actual database')
 result=worker.probe({'dataRoot':directory,'account':''});assert result['passed'] and result['metadataOnly'];assert not list(root.rglob('keys.json'));assert choose_account(directory,'')=='account'
 (root/'second/db_storage').mkdir(parents=True)
 try:choose_account(directory,'');raise AssertionError('Ambiguous accounts')
 except DriverError:pass
 assert choose_account(directory,'account')=='account'
with tempfile.TemporaryDirectory(prefix='wechat-shard-fixtures-') as directory:
 table='Msg_'+hashlib.md5(b'friend').hexdigest();files=[];opened=[];closed=[]
 for index in range(2):
  file=Path(directory)/('shard'+str(index)+'.db');files.append(file);connection=sqlite3.connect(file)
  connection.execute('CREATE TABLE '+table+' (local_id INTEGER,local_type INTEGER,real_sender_id INTEGER,message_content TEXT,sort_seq INTEGER)')
  connection.execute('INSERT INTO '+table+' VALUES (?,?,?,?,?)',(1,1,3,'跨分片消息',20))
  connection.execute('INSERT INTO '+table+' VALUES (?,?,?,?,?)',(2+index,1,3,'x'*50000,30+index));connection.commit();connection.close()
 class TrackedConnection(sqlite3.Connection):
  def close(self):closed.append(True);super().close()
 class Base:
  def __init__(self):self.workdir=directory
  def _collect_db_files(self):return []
  def _message_dbs(self):return files
  def _open(self,rel):
   opened.append(True);connection=sqlite3.connect(rel,factory=TrackedConnection);connection.row_factory=sqlite3.Row;return connection
  def _msg_type_name(self,kind):return '文本'
 Reader=bounded_reader(Base,{'maxCacheMB':64});reader=Reader();assert reader.latest_seq('friend')==31
 messages=reader.get_new_messages('friend',10,16);assert [row['sort_seq'] for row in messages]==[20,30,31];assert len(messages[-1]['content'])==24000;assert len(opened)==len(closed)
print('PASS DB/OCR fixtures: metadata-only discovery, account ambiguity, exact contacts, baseline/ACK/echo rules, draft/recipient guards, single send and no retry after uncertain result; no key extraction or real UI')
print('PASS real SQLite fixtures: aggregate across shards, deduplicate overlapping rows, bound message content and close every connection')
