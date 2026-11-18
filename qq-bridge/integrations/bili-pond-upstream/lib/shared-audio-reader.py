"""Bounded local ASR of three audio clips. No video, model downloads or full-match ASR."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import importlib.util

def windows(duration, maximum):
    duration=max(1,int(duration));maximum=min(300,max(30,int(maximum)))
    size=min(duration,maximum//3)
    if duration<=maximum:return [(0,duration)]
    return [(0,size),((duration-size)//2,size),(duration-size,size)]

def main():
    home=Path(os.environ['BILI_DUTY_HOME']);task_id=os.environ['BILI_SHARED_TASK_ID']
    if not re.fullmatch(r'[a-f0-9-]{36}',task_id):raise ValueError('Invalid task')
    base=home/'shared-reads';task=json.loads((base/(task_id+'.task.json')).read_text(encoding='utf-8'))
    file=base/(task_id+'.evidence.json');data=json.loads(file.read_text(encoding='utf-8'))
    if task['id']!=task_id or data['taskId']!=task_id or data['bvid']!=task['bvid'] or data['page']!=task['page'] or not task.get('transcribe'):raise ValueError('Mismatched task')
    if data.get('text'):return
    spec=importlib.util.spec_from_file_location('shared_reader',Path(__file__).with_name('shared-video-reader.py'))
    reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
    url=reader.safe_audio_url(data['audioUrl'])
    # Config/paths are host-owned. A model never supplies a command or filename.
    ffmpeg=Path(task['ffmpeg']);cache=home/'.hf-cache';os.environ['HF_HOME']=str(cache)
    os.environ['HF_HUB_OFFLINE']='1';os.environ['HF_HUB_DISABLE_XET']='1'
    name=task.get('asrModel','small')
    if name not in ('tiny','base','small','medium','large-v3','large-v3-turbo'):raise ValueError('Unsupported local ASR model')
    from faster_whisper import WhisperModel
    model=WhisperModel(name,device='cpu',compute_type='int8',cpu_threads=2,num_workers=1,local_files_only=True)
    ranges=windows(data.get('duration',1),task.get('maxAudioSeconds',180));rows=[]
    temp_home=home/'tmp/shared-asr';temp_home.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=task_id+'-',dir=temp_home) as folder:
        for index,(start,length) in enumerate(ranges):
            clip=Path(folder)/(str(index)+'.wav')
            # ffmpeg seeks the DASH audio stream using HTTP ranges. TLS only,
            # fixed headers and no credential forwarding. Output <= 9.7 MB.
            command=[str(ffmpeg),'-nostdin','-hide_banner','-loglevel','error','-protocol_whitelist','https,tls,tcp,crypto',
                     '-rw_timeout','15000000','-headers','Referer: https://www.bilibili.com/\r\nUser-Agent: Mozilla/5.0\r\n',
                     '-ss',str(start),'-i',url,'-t',str(length),'-vn','-ac','1','-ar','16000','-fs','10000000','-y',str(clip)]
            proc=subprocess.run(command,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=55,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            if proc.returncode or not clip.is_file() or clip.stat().st_size>10000000:raise ValueError('Audio segment unavailable')
            segments,_=model.transcribe(str(clip),language='zh',beam_size=1,vad_filter=True,condition_on_previous_text=False)
            for segment in segments:
                if segment.text.strip():rows.append({'from':start+segment.start,'content':segment.text.strip()})
            clip.unlink(missing_ok=True)
    if not rows:raise ValueError('No speech recognized')
    data.update(reader.sample_captions(rows,task.get('maxChars',12000)))
    data.update(source='audio-sample',sampled=True,audioWindows=[{'fromSeconds':a,'seconds':b} for a,b in ranges],
                warning='仅转写部分音频，非全程观看，语音识别可能有误')
    data.pop('audioUrl',None);reader.atomic(file,data)

if __name__=='__main__':
    try:main();print(json.dumps({'ok':True}))
    except Exception as error:
        print(json.dumps({'ok':False,'error':type(error).__name__}));sys.exit(1)
