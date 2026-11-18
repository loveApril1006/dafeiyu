"""Bounded, transport-independent helpers; no WeChat imports or side effects."""
from pathlib import Path
import hashlib,re,os
class DriverError(Exception):pass
def accounts_at(root):
 path=Path(root)
 if not path.is_dir():return []
 return sorted(row.name for row in path.iterdir() if row.is_dir() and (row/'db_storage').is_dir())
def choose_account(root,account):
 accounts=accounts_at(root)
 if account and account not in accounts:raise DriverError('指定的微信账号目录不存在')
 if not account:
  if len(accounts)!=1:raise DriverError('请在后台明确选择一个本机微信账号目录')
  account=accounts[0]
 return account
def exact_title(actual,target):
 actual=re.sub(r'\s*[（(]\d+[）)]$','',str(actual).strip())
 return actual==str(target).strip()
def resolve_targets(db,targets):
 result={}
 for target in targets:
  if target['name']=='文件传输助手' and target['kind']=='private':matches=[{'username':'filehelper'}]
  else:matches=[r for r in db.search_contact(target['name']) if target['name'] in [r.get('remark'),r.get('nick_name'),r.get('username')] and str(r.get('username','')).endswith('@chatroom')==(target['kind']=='group')]
  unique={r['username'] for r in matches}
  if len(unique)!=1:raise DriverError('监听名单有找不到或重名的会话，请使用唯一备注名或群名')
  result[target['id']]={**target,'username':next(iter(unique))}
 return result
class MessagePump:
 """Replay each batch until the core acknowledges its durable cursor."""
 def __init__(self,db,targets,boot):
  self.db=db;self.targets=targets;self.boot=boot;self.sequence=0;self.pending=None;self.offset=0
  self.watermarks={peer:db.latest_seq(row['username']) for peer,row in targets.items()}
 def poll(self,cursor):
  if self.pending and cursor==self.pending['cursor']:
   self.watermarks=self.pending['watermarks'];self.pending=None
  if self.pending:return {k:v for k,v in self.pending.items() if k!='watermarks'}
  next_marks=dict(self.watermarks);messages=[];peers=list(self.targets)
  ordered=peers[self.offset:]+peers[:self.offset];self.offset=(self.offset+1)%max(1,len(peers))
  for peer in ordered:
   if len(messages)>=16:break
   target=self.targets[peer]
   for item in self.db.get_new_messages(target['username'],since_seq=self.watermarks[peer],limit=16):
    if len(messages)>=16:break
    next_marks[peer]=max(next_marks[peer],int(item.get('sort_seq') or 0))
    if item.get('sender_id')==2 or item.get('type')!='文本':continue
    content=str(item.get('content') or '').strip()
    if not content:continue
    mid=hashlib.sha256((target['username']+'\0'+str(item.get('local_id'))+'\0'+str(item.get('sort_seq'))).encode()).hexdigest()
    messages.append({'id':peer+':'+mid,'peer':peer,'kind':target['kind'],'text':content[:6000],'context':'local-db','mentioned':bool(target.get('nickname') and '@'+target['nickname'] in content)})
  self.sequence+=1;self.pending={'messages':messages,'cursor':self.boot+':'+str(self.sequence),'watermarks':next_marks}
  return {k:v for k,v in self.pending.items() if k!='watermarks'}
def send_once(gui,db,target,text,sleep):
 """Never call an SDK's retrying send helper or fuzzy recipient matcher."""
 if not gui.open_exact(target['name']):raise DriverError('OCR未准确识别收件人，请保持该会话在微信最近列表可见')
 box=gui.strict_input_box()
 if box is None:raise DriverError('OCR未找到可靠输入区域，未发送')
 if gui.has_draft(box):raise DriverError('微信输入框有草稿，未覆盖或发送')
 before=db.latest_seq(target['username'])
 if not gui.paste_once(text,box):raise DriverError('微信文字输入未确认，未执行发送')
 if not gui.confirm_exact(target['name']):raise DriverError('发送前收件人无法确认，未执行发送')
 gui.enter_once()
 for attempt in range(8):
  sleep(.75 if attempt==0 else 1)
  if any(row.get('sender_id')==2 and row.get('content')==text for row in db.get_new_messages(target['username'],since_seq=before,limit=20)):return {'ok':True}
 raise DriverError('微信发送结果未确认，未自动重发，请核对实际聊天记录')

def bounded_reader(Base,value):
 class BoundedDB(Base):
  def _collect_db_files(self):
   rows=[row for row in super()._collect_db_files() if Path(row[0]).name=='contact.db' or re.fullmatch(r'message[\\/]message_\d+\.db',row[0])]
   if len(rows)>64:raise DriverError('微信数据库分片超过64个，请使用数据量较小的机器人账号')
   projected=sum(row[2]+(os.path.getsize(row[1]+'-wal') if os.path.isfile(row[1]+'-wal') else 0) for row in rows)
   if projected>int(value['maxCacheMB'])*1024*1024:raise DriverError('微信消息库超过配置的缓存上限，请调整上限或使用更小的机器人账号')
   return rows
  def _open(self,rel):
   self._collect_db_files()  # Recheck growth before refreshing a decrypted shard.
   connection=super()._open(rel)
   used=sum(row.stat().st_size for row in Path(self.workdir).iterdir() if row.is_file())
   if used>int(value['maxCacheMB'])*1024*1024:connection.close();raise DriverError('微信本机解密缓存已达到上限，读取已停止')
   return connection
  def _msg_conn(self,user):
   # The upstream helper leaves non-selected shard connections open. Close them.
   table='Msg_'+hashlib.md5(user.encode()).hexdigest()
   for rel in self._message_dbs():
    connection=self._open(rel)
    try:
     if connection.execute('SELECT 1 FROM sqlite_master WHERE type=\'table\' AND name=?',(table,)).fetchone():return connection,table
    except Exception:connection.close();raise
    connection.close()
   return None
  def _query_shards(self,user,query,parameters=()):
   table='Msg_'+hashlib.md5(user.encode()).hexdigest();result=[]
   for rel in self._message_dbs():
    connection=self._open(rel)
    try:
     if connection.execute('SELECT 1 FROM sqlite_master WHERE type=\'table\' AND name=?',(table,)).fetchone():result.extend(connection.execute(query.format(table=table),parameters).fetchall())
    finally:connection.close()
   return result
  def latest_seq(self,user):return max([int(row[0] or 0) for row in self._query_shards(user,'SELECT max(sort_seq) FROM {table}')] or [0])
  def get_new_messages(self,user,since_seq=0,limit=16):
   limit=max(1,min(int(limit),20))
   rows=self._query_shards(user,'SELECT local_id,local_type,real_sender_id,substr(message_content,1,24000) AS message_content,sort_seq FROM {table} WHERE sort_seq > ? ORDER BY sort_seq ASC LIMIT ?',(since_seq,limit))
   unique={(row['sort_seq'],row['local_id']):row for row in rows}
   return [self._msg_row_to_dict(unique[key]) for key in sorted(unique)[:limit]]
  def _msg_row_to_dict(self,row):
   kind=self._msg_type_name(row['local_type']);content=row['message_content']
   if isinstance(content,bytes):content=self._friendly_content(content,kind)
   return {'local_id':row['local_id'],'type':kind,'sender_id':row['real_sender_id'],'content':content,'sort_seq':row['sort_seq']}
 return BoundedDB
