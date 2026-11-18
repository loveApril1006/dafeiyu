"""Build and fully validate v22 while reusing unchanged compressed model records."""
from pathlib import Path
import copy,hashlib,json,os,re,time,zipfile
from voice_package_policy import is_voice_development_file

ROOT=Path(__file__).resolve().parents[2]
HERE=ROOT/'maintenance/full-installer-v22'
meta=json.loads((HERE/'prepared.json').read_text(encoding='utf-8'))
BASE=Path(meta['base']);OVERLAY=Path(meta['overlay'])
OUT=ROOT/'迁移包'/(meta['name']+'.zip');BUILDING=OUT.with_name(OUT.name+'.building')
assert not OUT.exists() and not BUILDING.exists(),'Never overwrite published packages or another build'
assert OUT.parent.resolve()==(ROOT/'迁移包').resolve()
assert __import__('shutil').disk_usage(OUT.parent).free>BASE.stat().st_size+1024**3
sha=lambda b:hashlib.sha256(b).hexdigest()
started=time.monotonic()
expected=BASE.with_name(BASE.name+'.sha256').read_text(encoding='utf-8-sig').split()[0]
with BASE.open('rb') as stream:assert hashlib.file_digest(stream,'sha256').hexdigest()==expected,'Base package checksum mismatch'

secrets=set()
def collect(value,key=''):
    if isinstance(value,dict):
        for k,v in value.items():collect(v,k)
    elif isinstance(value,list):
        for v in value:collect(v,key)
    elif isinstance(value,str) and len(value)>=16 and re.search(r'token|password|secret|api.?key|sessdata|bili_jct',key,re.I) and not re.search(r'env|path|file|ref',key,re.I) and not value.startswith(('http:','https:')) and not re.fullmatch(r'[A-Z_]+',value):secrets.add(value)
for rel in ['qq-bridge/config.json','model-settings.json','安装信息.json','SnowLuma/config/webui.json','qq-bridge/companion/creative-data/settings.json','qq-bridge/companion/bili-native-data/bili_credential.json']:
    try:collect(json.loads((ROOT/rel).read_text(encoding='utf-8-sig')))
    except (OSError,ValueError):pass
for rel in ['qq-bridge/state/console-token','qq-bridge/companion/companion-token','GPT-SoVITS/service-token']:
    try:
        value=(ROOT/rel).read_text(encoding='utf-8').strip()
        if len(value)>=16:secrets.add(value)
    except OSError:pass
import yaml
collect(yaml.safe_load((ROOT/'engine-home/.credentials.yaml').read_text(encoding='utf-8')))
secretBytes=[s.encode() for s in secrets]+[s.encode('utf-16le') for s in secrets]
rawIndex=(OVERLAY/'工具/payload-index.json').read_bytes();rows=json.loads(rawIndex)
payloadNames={row['file'] for row in rows}
manifest=json.loads((OVERLAY/'payload/bundle-manifest.json').read_text(encoding='utf-8'))
assert sha(rawIndex)==manifest['fileIndexSha256'] and len(rows)==manifest['fileCount']
assert sum(r['size'] for r in rows)==manifest['totalBytes']
for row in rows:
    name=row['file'];parts=Path(name).parts
    assert '..' not in parts and not Path(name).is_absolute()
    assert not set(parts)&{'bili-native-data','bilibili-live-data','companion-data','douyin-data','.credentials.yaml','.env','console-token','companion-token','service-token','bili_credential.json'}
    assert not name.startswith(('SnowLuma/config/','SnowLuma/data/','SnowLuma/logs/','engine-home/sessions/','engine-home/dsh-pet/','runtime-control/','maintenance/','logs/'))
    assert not name.startswith('qq-bridge/state/') or name in ['qq-bridge/state/mode.json','qq-bridge/state/current-role.json']
settings=json.loads((OVERLAY/'payload/qq-bridge/packaging/default-settings.json').read_text(encoding='utf-8'))
sourceConfig=json.loads((ROOT/'qq-bridge/config.json').read_text(encoding='utf-8'))
for account in [sourceConfig.get('ownerQQ'),*sourceConfig.get('allow',{}).get('private',[]),*sourceConfig.get('allow',{}).get('groups',[])]:
    if account:assert str(account) not in json.dumps(settings,ensure_ascii=False),'Account identifier in portable defaults'
cfg=json.loads((OVERLAY/'payload/qq-bridge/config.json').read_text(encoding='utf-8'))
assert not cfg.get('ownerQQ') and not cfg.get('consoleToken') and not cfg['dsh'].get('authToken') and not cfg['snowluma'].get('accessToken')
assert not cfg['allow']['private'] and not cfg['allow']['groups']
assert cfg['socialV2']['proactive']==settings['bridge']['socialV2']['proactive']

overrides={p.relative_to(OVERLAY).as_posix():p for p in OVERLAY.rglob('*') if p.is_file()}
for name,file in overrides.items():
    data=file.read_bytes()
    assert not any(s in data for s in secretBytes),'Known private credential in an override: '+name
    if name.startswith('payload/') and name!='payload/bundle-manifest.json':
        row=next(r for r in rows if r['file']==name[8:]);assert len(data)==row['size'] and sha(data)==row['sha256']
print('PASS public overlay: positive settings schemas, source account/key exclusion and source ZIP checksum',flush=True)

copied=changed=0
try:
    with zipfile.ZipFile(BASE) as original,zipfile.ZipFile(BUILDING,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=5,allowZip64=True) as output:
        entries=original.infolist();oldPrefix=entries[0].filename.split('/')[0]+'/';prefix=meta['name']+'/'
        for index,entry in enumerate(entries):
            rel=entry.filename.removeprefix(oldPrefix)
            assert entry.filename.startswith(oldPrefix)
            if entry.is_dir():continue
            if rel.startswith('payload/') and is_voice_development_file(rel[8:]):
                # Exact positive exclusion: no CUDA DLL, model or voice references.
                assert rel[8:] not in payloadNames
                continue
            if rel in overrides:
                output.write(overrides.pop(rel),prefix+rel);changed+=1;continue
            original.fp.seek(entry.header_offset);header=bytearray(original.fp.read(30));assert header[:4]==b'PK\x03\x04'
            n=int.from_bytes(header[26:28],'little');e=int.from_bytes(header[28:30],'little');original.fp.read(n);extra=original.fp.read(e)
            start=entry.header_offset+30+n+e;end=entries[index+1].header_offset if index+1<len(entries) else original.start_dir
            filename=(prefix+rel).encode();header[6:8]=(int.from_bytes(header[6:8],'little')|0x800).to_bytes(2,'little');header[26:28]=len(filename).to_bytes(2,'little')
            clone=copy.copy(entry);clone.filename=prefix+rel;clone.orig_filename=clone.filename;clone.flag_bits|=0x800;clone.header_offset=output.fp.tell();output._writecheck(clone)
            output.fp.write(header);output.fp.write(filename);output.fp.write(extra);original.fp.seek(start);left=end-start
            while left:
                data=original.fp.read(min(left,8*1024*1024));assert data;output.fp.write(data);left-=len(data)
            output.filelist.append(clone);output.NameToInfo[clone.filename]=clone;output.start_dir=output.fp.tell();output._didModify=True;copied+=1
            if index%15000==0:print(f'Packed {index}/{len(entries)} existing entries',flush=True)
        for rel,file in sorted(overrides.items()):output.write(file,prefix+rel);changed+=1
    # Validate every payload file using a fresh ZIP reader: CRC and SHA-256.
    checked=0;privacyScanned=0
    with zipfile.ZipFile(BUILDING) as package:
        prefix=meta['name']+'/'
        expectedNames={prefix+'payload/'+r['file'] for r in rows}|{prefix+'payload/bundle-manifest.json'}
        assert {n for n in package.namelist() if n.startswith(prefix+'payload/')}==expectedNames
        for row in rows:
            item=package.getinfo(prefix+'payload/'+row['file']);assert item.file_size==row['size'];h=hashlib.sha256();small=bytearray() if item.file_size<=8*1024*1024 else None
            with package.open(item) as stream:
                for data in iter(lambda:stream.read(1024*1024),b''):
                    h.update(data)
                    if small is not None:small.extend(data)
            assert h.hexdigest()==row['sha256'],'Payload checksum mismatch: '+row['file']
            if small is not None:
                assert not any(secret in small for secret in secretBytes),'Known credential found in package: '+row['file'];privacyScanned+=1
            checked+=1
            if checked%15000==0:print(f'Verified CRC/SHA {checked}/{len(rows)} payload files',flush=True)
        for name,expected in manifest['installToolsSha256'].items():assert sha(package.read(prefix+'工具/'+name))==expected
        assert sha(package.read(prefix+'工具/payload-index.json'))==manifest['fileIndexSha256']
        assert package.read(prefix+'payload/qq-bridge/packaging/default-settings.json')==(OVERLAY/'payload/qq-bridge/packaging/default-settings.json').read_bytes()
    with BUILDING.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
    os.replace(BUILDING,OUT)
    OUT.with_name(OUT.name+'.sha256').write_text(digest+'  '+OUT.name+'\n',encoding='utf-8')
    result={**meta,'file':str(OUT),'size':OUT.stat().st_size,'sha256':digest,'allPayloadCrcAndHashesVerified':True,'knownCredentialValuesChecked':len(secrets),'privacyFilesScanned':privacyScanned,'privateDataPaths':0,'unchangedCompressedEntries':copied,'changedOrAddedEntries':changed,'seconds':round(time.monotonic()-started,1),'validated':True}
    (HERE/'package-info.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'file':str(OUT),'size':result['size'],'payloadFiles':checked,'validated':True,'modelCopiesCreated':0,'seconds':result['seconds']},ensure_ascii=True),flush=True)
except BaseException:
    BUILDING.unlink(missing_ok=True)
    raise
