"""Local desktop-pet adapter around the official GPT-SoVITS inference pipeline."""
import io
import json
import os
from pathlib import Path
import re
import threading
import time
import secrets
import faulthandler

ROOT=Path(__file__).resolve().parents[1]
print('Starting GPT-SoVITS pet adapter...',flush=True)
faulthandler.enable()
if os.environ.get('PETVOICE_DEBUG_DUMP')=='1':faulthandler.dump_traceback_later(45,repeat=True)
os.chdir(ROOT)
from tools.portable_runtime import activate
activate(change_cwd=True)
os.environ['HF_HUB_OFFLINE']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
import numpy as np
import soundfile as sf
import torch
from GPT_SoVITS.TTS_infer_pack.TTS import TTS

torch.set_num_threads(4)
REQUESTED_DEVICE=os.environ.get('PETVOICE_DEVICE','auto').lower()
if REQUESTED_DEVICE not in ('auto','cpu','cuda'):raise ValueError('PETVOICE_DEVICE must be auto/cpu/cuda')
DEVICE='cuda' if REQUESTED_DEVICE!='cpu' and torch.cuda.is_available() else 'cpu'
if REQUESTED_DEVICE=='cuda' and DEVICE!='cuda':raise RuntimeError('Requested CUDA is unavailable')
DEVICE_NAME=torch.cuda.get_device_name() if DEVICE=='cuda' else 'CPU (portable fallback)'
CONFIG=ROOT/'pet-voice.json'
LOCK=threading.Lock()
MODEL_CONFIG={'custom':{
    'version':'v2ProPlus','device':DEVICE,'is_half':DEVICE=='cuda',
    'bert_base_path':'GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large',
    'cnhuhbert_base_path':'GPT_SoVITS/pretrained_models/chinese-hubert-base',
    't2s_weights_path':'GPT_SoVITS/pretrained_models/s1v3.ckpt',
    'vits_weights_path':'GPT_SoVITS/pretrained_models/v2Pro/s2Gv2ProPlus.pth',
}}
print('Loading official GPT-SoVITS v2ProPlus on '+DEVICE_NAME,flush=True)
try:
    tts=TTS(MODEL_CONFIG)
except RuntimeError:
    if REQUESTED_DEVICE!='auto' or DEVICE!='cuda':raise
    print('CUDA initialization failed; retrying with CPU.',flush=True)
    DEVICE='cpu';DEVICE_NAME='CPU (CUDA initialization fallback)'
    MODEL_CONFIG['custom'].update(device='cpu',is_half=False)
    torch.cuda.empty_cache()
    tts=TTS(MODEL_CONFIG)

def settings():return json.loads(CONFIG.read_text(encoding='utf-8-sig'))

def choose_reference(v,text,emotion=None):
    styles=v.get('styles',{})
    if emotion not in styles:
        if re.search(r'哈哈|嘿嘿|笑死|诶嘿|好耶|厉害|开心|咘咘|得意',text):emotion='happy'
        elif re.search(r'累|难过|晚安|想你|抱|没事|慢慢|别急|在呢|睡',text):emotion='gentle'
        else:emotion='playful'
    return {**v,**styles.get(emotion,{})},emotion

def synthesize(text, voice=None,emotion=None):
    cfg=settings()
    key=voice or cfg['voice']
    if key not in cfg['voices']:raise ValueError('Unknown voice')
    v,mood=choose_reference(cfg['voices'][key],text,emotion)
    text=re.sub(r'https?://\S+','',text)
    text=re.sub(r'[*#`_~]','',text).strip()
    if not text:raise ValueError('No speakable text')
    inputs={
        'text':text,'text_lang':'zh','ref_audio_path':v['ref_audio_path'],
        'prompt_text':v['prompt_text'],'prompt_lang':v['prompt_lang'],
        'text_split_method':'cut5','batch_size':1,'speed_factor':cfg.get('speed',1.0),
        'top_k':20,'top_p':0.85,'temperature':0.95,'seed':secrets.randbelow(2**31),
        'parallel_infer':True,'repetition_penalty':1.35,
        'streaming_mode':False,'return_fragment':False,'super_sampling':False,
        'use_flash_attention':False,
        'use_cuda_graph':False,
    }
    with LOCK:
        start=time.monotonic()
        chunks=list(tts.run(inputs))
        if not chunks:raise RuntimeError('No audio generated')
        sr=chunks[0][0]
        samples=np.concatenate([audio for _,audio in chunks])
        out=io.BytesIO();sf.write(out,samples,sr,format='WAV',subtype='PCM_16')
        print(f'VOICE {key}/{mood}, chars={len(text)}, seconds={time.monotonic()-start:.2f}',flush=True)
        return out.getvalue()

