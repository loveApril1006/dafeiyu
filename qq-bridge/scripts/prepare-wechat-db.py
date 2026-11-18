"""Prepare an isolated DB/OCR runtime. This script never opens WeChat data."""
from pathlib import Path
import json,subprocess,tomllib
root=Path(__file__).resolve().parents[1];runtime=root/'integrations/wechat-db-runtime';source=root/'integrations/wechatapi-upstream'
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
if commit!='04ef8cbde3862cff90b5f6b42c9ebfcea44ef48d':raise RuntimeError('Unexpected WeChat reader source revision')
if not (runtime/'Scripts/python.exe').exists():subprocess.run([str(root.parent/'GPT-SoVITS/runtime/python.exe'),'-m','venv','--system-site-packages','--without-pip',str(runtime)],check=True)
metadata=tomllib.loads((source/'pyproject.toml').read_text(encoding='utf-8'))
subprocess.run(['uv','pip','install','--python',str(runtime/'Scripts/python.exe'),*metadata['project']['dependencies']],check=True)
(runtime/'installed.json').write_text(json.dumps({'source':'https://github.com/jiatj/wechatapi','commit':commit,'installed':True,'databaseReadVerified':False,'sendingVerified':False},indent=2),encoding='utf-8')
print('DB/OCR runtime prepared. No memory scan, database read or WeChat send was performed.')
