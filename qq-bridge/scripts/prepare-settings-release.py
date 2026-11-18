"""Prepare a small public v22 overlay. Reuse the verified v21 ZIP for runtimes."""
from pathlib import Path
import hashlib,json,os,subprocess,zipfile,re,sys
from voice_package_policy import VOICE_CODE,is_voice_development_file

ROOT=Path(__file__).resolve().parents[2]
HERE=ROOT/'maintenance/full-installer-v22'
BASE=ROOT/'迁移包/大肥鱼完整版安装包-v21-安装提示更新-20261027.zip'
NAME='大肥鱼完整版安装包-20261027-v22'
OVERLAY=HERE/'overlay'
assert not (HERE/'prepared.json').exists() or '--refresh' in sys.argv, 'A prepared release must not be overwritten'
assert not (ROOT/'迁移包'/(NAME+'.zip')).exists(), 'Published archives are immutable'
HERE.mkdir(parents=True,exist_ok=True)
digest=lambda data:hashlib.sha256(data).hexdigest()
def put(relative,data):
    target=OVERLAY/relative;target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data.encode('utf-8') if isinstance(data,str) else data)
def merge(a,b):
    result=dict(a)
    for k,v in b.items():result[k]=merge(result.get(k,{}) if isinstance(result.get(k),dict) else {},v) if isinstance(v,dict) else v
    return result

with zipfile.ZipFile(BASE) as archive:
    prefix=archive.namelist()[0].split('/')[0]+'/'
    oldrows=json.loads(archive.read(prefix+'工具/payload-index.json'))
    old={r['file']:r for r in oldrows}
    manifest=json.loads(archive.read(prefix+'payload/bundle-manifest.json'))
    def original(relative):return archive.read(prefix+relative)
    def overlay_payload(relative,data):
        raw=data.encode('utf-8') if isinstance(data,str) else data
        if relative not in old or old[relative]['sha256']!=digest(raw):put('payload/'+relative,raw)
    # Required together: the small host must never ship without its worker modules.
    for relative in VOICE_CODE:
        overlay_payload('GPT-SoVITS/'+relative,(ROOT/'GPT-SoVITS'/relative).read_bytes())
    allowed={'.js','.mjs','.cjs','.py','.ps1','.cs','.bat','.html','.css','.json','.yaml','.yml','.md','.svg','.png','.jpg','.webp','.ico','.woff','.woff2','.ttf','.wasm'}
    # Live state, roles, presets, accounts, dependencies and models are not mirrored.
    for directory in ['src','public','scripts']:
        for file in (ROOT/'qq-bridge'/directory).rglob('*'):
            if file.is_symlink() or not file.is_file() or file.suffix.lower() not in allowed:continue
            overlay_payload('qq-bridge/'+file.relative_to(ROOT/'qq-bridge').as_posix(),file.read_bytes())
    for file in (ROOT/'qq-bridge/companion').iterdir():
        if file.is_file() and file.suffix in {'.mjs','.js','.cjs','.py'}:overlay_payload('qq-bridge/companion/'+file.name,file.read_bytes())
    for relative in ['package.json','harness-isolated.mjs','presets/qq-harness-isolated.patch.yml','presets/qq-chat-v2.patch.yml']:
        file=ROOT/'qq-bridge/plugins/qq-agent-presets'/relative
        overlay_payload('qq-bridge/plugins/qq-agent-presets/'+relative,file.read_bytes())
    relative='dsh/agent-presets/qq-chat-v2/agent.cordis.yml'
    overlay_payload('qq-bridge/'+relative,(ROOT/'qq-bridge'/relative).read_bytes())
    # Exact source allowlist: never mirror native account data, environments or reports.
    for relative in ['robot-host.js','lib/history.mjs','lib/shared-video.mjs','lib/shared-video-reader.py','lib/shared-save-mcp.py','lib/shared-audio-reader.py']:
        file=ROOT/'qq-bridge/integrations/bili-pond-upstream'/relative
        overlay_payload('qq-bridge/integrations/bili-pond-upstream/'+relative,file.read_bytes())
    for directory in ['bili-standalone','douyin-standalone','creative-standalone']:
        source=ROOT/'qq-bridge/integrations'/directory/'dist'
        for file in source.rglob('*'):
            if file.is_file() and file.suffix.lower() in allowed:overlay_payload('qq-bridge/'+file.relative_to(ROOT/'qq-bridge').as_posix(),file.read_bytes())
    for name in ['package.json','release-profile.mjs','packaging/default-settings.json']:
        overlay_payload('qq-bridge/'+name,(ROOT/'qq-bridge'/name).read_bytes())
    helper='desktop-pet/dsh-pet/dsh-pet/runtime/electron-helper/companion-settings.js'
    overlay_payload(helper,(ROOT/helper).read_bytes())
    settings=json.loads((ROOT/'qq-bridge/packaging/default-settings.json').read_text(encoding='utf-8'))
    config=json.loads(original('payload/qq-bridge/config.json').decode('utf-8-sig'))
    config=merge(config,settings['bridge']);config['ownerQQ']=None;config['consoleToken']='';config['allow']={'private':[],'groups':[]};config['deny']={'private':[],'groups':[]};config['allowAllWhenEmpty']=False
    config['dsh']['authToken']='';config['snowluma']['accessToken']=''
    config['releaseProfile']={'version':22,'name':'用户选择的公开行为默认值'}
    overlay_payload('qq-bridge/config.json',json.dumps(config,ensure_ascii=False,indent=2)+'\n')
    for name,value in [('mode.json',settings['mode']),('current-role.json',{'role':settings['role']['name'],'mode':settings['role']['mode']})]:overlay_payload('qq-bridge/state/'+name,json.dumps(value,ensure_ascii=False,indent=2)+'\n')
    if settings['role']['name']:
        for relative in ['qq-bridge/default-role.md','qq-bridge/roles/'+settings['role']['name']+'.md']:overlay_payload(relative,settings['role']['text'])
    release=json.loads(original('payload/full-release.json'));release.update(version=22,createdAt='2026-10-27',privateDataIncluded=False,defaultsProfile='qq-bridge/packaging/default-settings.json')
    overlay_payload('full-release.json',json.dumps(release,ensure_ascii=False,indent=2)+'\n')
    for name in manifest['installToolsSha256']:
        text=original('工具/'+name).decode('utf-8-sig')
        text=text.replace('v21','v22').replace('version=21','version=22').replace('version:21','version:22')
        if name=='install-engine.mjs':text=text.replace('18|19|20|21)','18|19|20|21|22)')
        if name=='configure-update.mjs':
            previous="bundles:[...new Set([...(previousProfile.dsh?.profile?.bundles||[]),...(generated.dsh?.profile?.bundles||[])])]"
            assert previous in text
            text=text.replace(previous,"bundles:previousProfile.dsh?.profile?.bundles??generated.dsh?.profile?.bundles??[]")
            text=text.replace('已应用大肥鱼新版聊天与主动联系设置，原有自定义人格继续使用。','原有功能开关、二代仿真与自定义人格设置保持不变。')
        put('工具/'+name, ('\ufeff' if name.endswith('.ps1') else '')+text)
    installer=original('工具/Installer.cs').decode('utf-8-sig').replace('v21','v22')
    installer=installer.replace('含全部功能；应用活跃回复、语音表情和随机10～30分钟主动联系。','含全部功能；采用配置基线，新用户填写自己的账号与密钥。')
    installer=installer.replace('新版聊天设置首次升级时应用；已有账号、人格与记录保留。','新安装采用本包默认设置；覆盖更新保留原设置、账号与记录。')
    put('工具/Installer.cs','\ufeff'+installer)
    put('工具/InstallationDiscovery.cs',original('工具/InstallationDiscovery.cs'))
    # Compile a new standalone installer; the original package remains intact.
    build=HERE/'build';build.mkdir(exist_ok=True)
    csc=Path(os.environ['WINDIR'])/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    executable=build/'大肥鱼完整版安装.exe'
    subprocess.run([str(csc),'/nologo','/utf8output','/target:winexe','/platform:x64','/main:App','/out:'+str(executable),'/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll',str(OVERLAY/'工具/Installer.cs'),str(OVERLAY/'工具/InstallationDiscovery.cs')],check=True)
    data=executable.read_bytes();put('大肥鱼完整版安装.exe',data)
    for name in ['大肥鱼.exe','大肥鱼完整版.exe','小鸽子.exe','小鸽子完整版.exe']:overlay_payload(name,data)
    readme='''大肥鱼完整版 v22 · 当前设置基线版（2026-10-27）

完整解压 ZIP，运行“大肥鱼完整版安装.exe”；不要只复制 EXE。
新安装：以本包公开配置模板为默认值，填写使用者自己的管理员QQ与模型服务，再登录自己的QQ及其他平台账号。
覆盖更新：选择原安装目录，保留原账号、密钥、聊天记录、记忆、角色、功能开关及二代仿真参数，不强制覆盖用户后续修改。

默认基线涵盖二代仿真、工具权限、主动联系、语音与表情、上下文预算、角色与工作陪伴、音乐/跑团/画图、微信额度、QQ空间、B站、抖音、桌宠和可选插件。
具体公开默认值见 payload/qq-bridge/packaging/default-settings.json。
管理员QQ、群号/好友名单、API密钥、登录态、浏览器缓存、账号目录、聊天/记忆内容、运行计数和个人声音参考文件不包含在模板内。微信须自行配置账号和名单后开启；模型服务线路与密钥使用安装时输入的配置。

保留安装授权、新安装/保留数据更新、差异更新、停止和失败回滚流程。第三方许可证随组件保留。
打包复用旧包的完整运行环境和模型压缩记录，本次构建目录仅保存变更，不再复制一整套模型。
'''
    put('先看这里.txt','\ufeff'+readme)
    put('默认设置说明.txt','\ufeff'+readme)
    changed={}
    for file in (OVERLAY/'payload').rglob('*'):
        if file.is_file() and file.name!='bundle-manifest.json':
            rel=file.relative_to(OVERLAY/'payload').as_posix();changed[rel]={'file':rel,'size':file.stat().st_size,'sha256':digest(file.read_bytes())}
    rows=sorted((r for r in {**old,**changed}.values() if not is_voice_development_file(r['file'])),key=lambda r:r['file'])
    raw=json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode();put('工具/payload-index.json',raw)
    tools={name:digest((OVERLAY/'工具'/name).read_bytes()) for name in manifest['installToolsSha256']}
    defaults=manifest.get('replaceUnmodifiedDefaults',{})
    for name in defaults:
        if name in old:defaults[name]=list(set(defaults[name]+[old[name]['sha256']]))
    critical={name:value for name,value in manifest['sha256'].items() if not is_voice_development_file(name)};critical.update({name:r['sha256'] for name,r in changed.items()})
    manifest.update(version=22,createdAt='2026-10-27',fileCount=len(rows),totalBytes=sum(r['size'] for r in rows),sha256=critical,fileIndexSha256=digest(raw),installToolsSha256=tools,installerEngineSha256=tools['install-engine.mjs'],replaceUnmodifiedDefaults=defaults)
    put('payload/bundle-manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    result={'version':22,'name':NAME,'base':str(BASE),'basePrefix':prefix,'overlay':str(OVERLAY),'payloadFiles':len(rows),'installedBytes':manifest['totalBytes'],'changedPayloadFiles':len(changed),'defaultsFileSha256':digest((ROOT/'qq-bridge/packaging/default-settings.json').read_bytes()),'modelCopiesCreated':0}
    (HERE/'prepared.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:result[k] for k in ['version','payloadFiles','changedPayloadFiles','installedBytes','modelCopiesCreated']},ensure_ascii=True),flush=True)
