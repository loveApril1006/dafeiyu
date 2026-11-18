from pathlib import Path
import importlib.util
import json
import tempfile
root = Path(__file__).resolve().parents[1]
def load(name, file):
    spec=importlib.util.spec_from_file_location(name,root/'integrations/bili-pond-upstream/lib'/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
reader=load('shared_reader','shared-video-reader.py')
saver=load('shared_saver','shared-save-mcp.py')
audio=load('shared_audio','shared-audio-reader.py')
assert audio.windows(3082,180)==[(0,60),(1511,60),(3022,60)]
assert sum(length for start,length in audio.windows(9000,9999))<=300
assert audio.windows(15,180)==[(0,15)]
assert reader.safe_audio_url('https://upos.example.bilivideo.com/audio')
for url in ['http://upos.example.bilivideo.com/audio','https://evil.invalid/audio','file:///C:/secret','https://bilibili.com@evil.invalid/audio','https://upos.example.bilivideo.com:8082/audio']:
    try:reader.safe_audio_url(url);raise AssertionError('unsafe audio URL accepted')
    except ValueError:pass
small=reader.sample_captions([{'from':1,'content':'真实字幕'}])
assert small['sampled'] is False and '真实字幕' in small['text']
large=reader.sample_captions([{'from':i*10,'content':f'第{i}段字幕'+('材料'*30)} for i in range(4000)],12000)
assert large['sampled'] and len(large['text'])<=12000 and '第0段' in large['text'] and '第39' in large['text']
assert len(reader.sample_captions([{'content':'x'*50000}],2000)['text'])<=2000
assert reader.sample_captions([])['text']==''
with tempfile.TemporaryDirectory(prefix='shared-reader-') as directory:
    home=Path(directory);task_id='12345678-1234-1234-1234-123456789012';task_file,evidence_file,result_file=saver.paths(home,task_id)
    task_file.parent.mkdir()
    task={'id':task_id,'bvid':'BV1234567890','page':1,'remember':True}
    evidence={'taskId':task_id,'bvid':task['bvid'],'page':1,'text':'真实字幕','title':'真实标题','sampled':True}
    task_file.write_text(json.dumps(task),encoding='utf-8');evidence_file.write_text(json.dumps(evidence),encoding='utf-8')
    calls=[]
    def memory(home,body):
        calls.append(body);return {'ok':True,'record':{'id':body['id']}}
    result=saver.save_result(home,task_id,'真实结论 SESSDATA=fixture-secret',memory)
    assert result['hasTranscript'] and result['memorySaved'] and '[已隐去]' in result['summary']
    saver.save_result(home,task_id,'重复模型结果',memory);assert len(calls)==1
    result_file.unlink();evidence['text']='';evidence['sampled']=False
    evidence_file.write_text(json.dumps(evidence),encoding='utf-8');task['remember']=False;task_file.write_text(json.dumps(task),encoding='utf-8')
    result=saver.save_result(home,task_id,'编造我看完了整场比赛',memory)
    assert '编造' not in result['summary'] and not result['hasTranscript'] and not result['memorySaved'] and result['memorySkipped']
    result_file.unlink();evidence['page']=2;evidence_file.write_text(json.dumps(evidence),encoding='utf-8')
    try:saver.save_result(home,task_id,'错误分P',memory);raise AssertionError('mismatch accepted')
    except ValueError:pass
    try:saver.paths(home,'../../credentials');raise AssertionError('escape accepted')
    except ValueError:pass
print('PASS bounded captions sampling, beginning/middle/end coverage, no-subtitle truthfulness, secret redaction, idempotent memory, memory switch and exact-video/part evidence guards; no network/model calls')
