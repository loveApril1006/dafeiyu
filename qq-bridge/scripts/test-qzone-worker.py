"""Exercise real SDK request encoding against fake HTTP, never QQ or QZone."""
from pathlib import Path
import importlib.util,json,tempfile,urllib.parse
spec=importlib.util.spec_from_file_location('qzone_worker',Path(__file__).resolve().parents[1]/'companion/qzone-autopost.py');worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
calls=[];mode='normal'
def call(action,body):
 calls.append(action)
 if action=='get_login_info':return {'user_id':12345678}
 return {'cookies':'uin=o12345678; skey=fixture; p_skey=fixture-private'}
class Response:
 def __init__(self,value):self.value=value
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,_size):return json.dumps(self.value).encode()
class Opener:
 def open(self,request,timeout):
  calls.append(request.full_url.split('?')[0]);data=urllib.parse.parse_qs(request.data.decode())
  if 'upload_image' in request.full_url:
   if mode=='image-fail':raise TimeoutError('secret must never be echoed')
   assert data['picfile'];return Response({'data':{'lloc':'fixture-image','bo':'fixture-bo'}})
  assert 'publish' in request.full_url;assert data['ugc_right']==['4'];assert data['con']==['测试稿件'];assert data['richtype']==['1']
  if mode=='unknown':raise TimeoutError('secret must never be echoed')
  return Response({'code':0,'tid':'fixture-tid'})
original=worker.urllib.request.build_opener;worker.urllib.request.build_opener=lambda *args:Opener()
try:
 with tempfile.TemporaryDirectory(prefix='qzone-sdk-fixture-') as directory:
  worker.ROOT=Path(directory);image=worker.ROOT/'companion/qzone-data/images/fixture.png';image.parent.mkdir(parents=True);image.write_bytes(b'\x89PNG\r\n\x1a\n'+b'fixture-image-data')
  assert worker.publish_once({'probe':True},call)=={'ready':True};assert len(calls)==2;calls.clear()
  payload={'text':'测试稿件','visibility':4,'imageFile':str(image)};assert worker.publish_once(payload,call)['tid']=='fixture-tid';assert len([url for url in calls if 'publish' in url])==1
  mode='unknown'
  try:worker.publish_once(payload,call);raise AssertionError('Must report uncertain')
  except worker.PublicError as error:assert error.uncertain and 'secret' not in str(error)
  mode='image-fail';before=len([url for url in calls if 'publish' in url])
  try:worker.publish_once(payload,call);raise AssertionError('Must stop after upload failure')
  except worker.PublicError as error:assert not error.uncertain
  assert len([url for url in calls if 'publish' in url])==before
  try:worker.publish_once({**payload,'imageFile':str(image.parent.parent/'outside.png')},call);raise AssertionError('Unauthorized file')
  except worker.PublicError:pass
 print('PASS real Qzone SDK with fake HTTP: cookie in RAM, friends-only permission, one image upload then one publication, no retry after uncertain result, no post after image failure, private file boundary')
finally:worker.urllib.request.build_opener=original
