"""Install the optional Windows WeChat driver in its own E-drive environment.
Does not launch WeChat, read chats, enable accessibility, or send messages.
"""
from pathlib import Path
import json,subprocess,sys
root=Path(__file__).resolve().parents[1]
runtime=root/'integrations/wechat-desktop-runtime'
base=root.parent/'GPT-SoVITS/runtime/python.exe'
upstream=root/'integrations/pywechat-upstream'
if not (upstream/'src/pyweixin').is_dir():raise RuntimeError('Clone the pinned pywechat source first')
if not (runtime/'Scripts/python.exe').is_file():subprocess.run([str(base),'-m','venv','--system-site-packages','--without-pip',str(runtime)],check=True)
subprocess.run(['uv','pip','install','--python',str(runtime/'Scripts/python.exe'),'-r',str(upstream/'src/requirements.txt')],check=True)
record={'source':'https://github.com/Hello-Mr-Crab/pywechat','commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=upstream,text=True).strip(),'module':'pyweixin','licenseFile':'integrations/pywechat-upstream/LICENSE','installed':True,'uiVerified':False}
(runtime/'installed.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
print('Driver dependencies prepared. A user-requested UI diagnostic is still required.')
