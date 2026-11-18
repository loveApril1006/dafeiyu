"""Optional private DB/OCR worker. --probe inspects metadata only, never keys."""
from pathlib import Path
import contextlib,hashlib,json,logging,os,sys,time
from wechat_db_support import DriverError,accounts_at,choose_account,resolve_targets,exact_title,MessagePump,send_once,bounded_reader
ROOT=Path(__file__).resolve().parents[1];HOME=ROOT/'companion/wechat-data';WIRE=sys.stdout
class NullOutput:
 def write(self,value):return len(value)
 def flush(self):pass
 def isatty(self):return False
SINK=NullOutput()
def emit(value):WIRE.write(json.dumps(value,ensure_ascii=False)+'\n');WIRE.flush()
def settings():
 value=json.loads((HOME/'transport.json').read_text(encoding='utf-8'))
 if value.get('mode')!='dbocr':raise DriverError('数据库接法未选中')
 return value
def probe(value):
 root=value.get('resolvedRoot') or value.get('dataRoot','');accounts=accounts_at(root)
 if not accounts:return {'passed':False,'reason':'没有找到微信本地数据库，请检查数据目录和登录状态','metadataOnly':True}
 try:account=choose_account(root,value.get('account',''))
 except DriverError as error:return {'passed':False,'reason':str(error),'metadataOnly':True}
 files=list((Path(root)/account/'db_storage/message').glob('message_*.db'))
 return {'passed':bool(files),'reason':'找到微信本地消息库；开启通道时才读取密钥并验证兼容性' if files else '账号目录内还没有消息库','databaseFiles':len(files),'metadataOnly':True,'sendingVerified':False}
def load_reader(value):
 sys.path.insert(0,str(ROOT/'integrations/wechatapi-upstream'))
 with contextlib.redirect_stdout(SINK),contextlib.redirect_stderr(SINK):
  from wechatauto.db import WeChatDB
  from wechatauto.param import WxParam
  WxParam.ENABLE_FILE_LOGGER=False;logging.disable(logging.CRITICAL)
 BoundedDB=bounded_reader(WeChatDB,value)
 account=choose_account(value['resolvedRoot'],value.get('account',''))
 cache=HOME/'database-cache'/hashlib.sha256((value['resolvedRoot']+'\0'+account).encode()).hexdigest()
 cache.mkdir(parents=True,exist_ok=True,mode=0o700)
 with contextlib.redirect_stdout(SINK),contextlib.redirect_stderr(SINK):
  return BoundedDB(db_dir=value['resolvedRoot'],account=account,workdir=str(cache),keys_file=str(cache/'keys.json'))
def load_sender():
 with contextlib.redirect_stdout(SINK),contextlib.redirect_stderr(SINK):
  import wechatauto.guia as sdk
 sdk.LAYOUT_CONFIG_DIR=str(HOME/'ocr-layout')
 class StrictGUI(sdk.WeChatGUI):
  def _get_uia(self):return None  # Never write Weixin.dll or toggle its UI gate.
  def _minimize_blockers(self):return 0
  def _name_matches(self,actual,target):return exact_title(actual,target)
  def _search_chat(self,name):return False
  def _chat_is_open(self,name):
   try:
    rel=(self.right_pane_left+10,0,self.render_w-60,min(220,int(self.render_h*.22)))
    lines=self.ocr_zoomed(rel,scale=3)
    grouped={}
    for text,x,y,w,h in lines:grouped.setdefault(round(y/20),[]).append((x,text))
    return any(exact_title(''.join(t for x,t in sorted(row)),name) or exact_title(' '.join(t for x,t in sorted(row)),name) for row in grouped.values())
   except Exception:return False
  def open_exact(self,name):
   if not self.desktop_available():return False
   self.bring_to_front(keep_topmost=False);self._update_render_rect()
   if self._chat_is_open(name):return True
   candidates=[row for row in self.get_sessions(zoomed=True) if exact_title(row['name'],name)]
   if len(candidates)!=1:return False
   row=candidates[0];self.wx_click(self.origin_x+row['x']+row['w']//2,self.origin_y+row['y']+row['h']//2);time.sleep(.6)
   return self._chat_is_open(name)
  def strict_input_box(self):return self._probe_input_box()  # No coordinate fallback.
  def has_draft(self,box):return self._input_box_has_text(box)
  def paste_once(self,text,box):
   if not self.focus_input(box):return False
   self.set_clipboard(text);self._input.key(sdk.VK_V,ctrl=True);time.sleep(.5)
   return self._input_box_has_text(box)
  def confirm_exact(self,name):return self._input._user32.GetForegroundWindow()==self.main_hwnd and self._chat_is_open(name)
  def enter_once(self):self._input.key(sdk.VK_RETURN)
 return StrictGUI()
def run():
 value=settings()
 if '--probe' in sys.argv:emit({'ok':True,'diagnostic':probe(value)});return
 if not probe(value)['passed']:raise DriverError('本机微信数据库尚未就绪，请先检查数据目录')
 db=load_reader(value);pump=None;sender=None
 emit({'event':'ready','databaseReady':True})
 for raw in sys.stdin:
  request=json.loads(raw)
  try:
   with contextlib.redirect_stdout(SINK),contextlib.redirect_stderr(SINK):
    operation=request.get('op')
    if operation=='configure':pump=MessagePump(db,resolve_targets(db,request['targets']),os.urandom(8).hex());result={'ok':True}
    elif operation=='poll':
     if pump is None:raise DriverError('请先配置微信名单')
     result={**pump.poll(request.get('cursor')), 'delayMs':int(value['pollSeconds'])*1000}
    elif operation=='send':
     if not pump or request.get('peer') not in pump.targets:raise DriverError('收件人不在允许名单')
     if request['item'].get('type')!='text':raise DriverError('当前接法只支持文字收发')
     if sender is None:sender=load_sender()
     import pyperclip
     try:clipboard=pyperclip.paste()
     except Exception:clipboard=None
     text=request['item']['text']
     try:result=send_once(sender,db,pump.targets[request['peer']],text,time.sleep)
     finally:
      try:
       if clipboard is not None and pyperclip.paste()==text:pyperclip.copy(clipboard)
      except Exception:pass
    elif operation=='stop':break
    else:raise DriverError('未知本机微信操作')
   emit({'id':request.get('id'),'ok':True,'result':result})
  except Exception as error:
   emit({'id':request.get('id'),'ok':False,'error':str(error) if isinstance(error,DriverError) else '本机微信数据读取或OCR操作未完成，请核对目录、登录状态和客户端版本'})
if __name__=='__main__':
 try:run()
 except Exception as error:emit({'event':'blocked','error':str(error) if isinstance(error,DriverError) else '微信本机数据库未能解密，请核对当前账号、登录状态和客户端版本'})
