"""Real reader subprocess, fake SDK/CDN only. Never access an account/network."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

home = Path(tempfile.mkdtemp(prefix='xiaoge-video-reader-'))
(home / 'bili-native-data').mkdir()
(home / 'bili-native-data/bili_credential.json').write_text(json.dumps({'sessdata': 'fixture-cookie-never-output', 'bili_jct': 'fixture-csrf-never-output'}), encoding='utf-8')
entry = home / 'bilibili-live-reader.py'
shutil.copy2(Path(__file__).resolve().parent.parent / 'companion/bilibili-live-reader.py', entry)
(home / 'bilibili_api.py').write_text('''
import os
class Credential:
    def __init__(self, **kwargs):
        assert kwargs['sessdata'] == 'fixture-cookie-never-output'
class Video:
    def __init__(self, bvid, credential): self.bvid = bvid
    async def get_info(self):
        return {'bvid': 'BVbadbadbad0' if os.environ.get('CASE') == 'mismatch' else self.bvid, 'title': '真实字幕演练', 'cid': 123}
    async def get_subtitle(self, cid):
        if os.environ.get('CASE') == 'missing': return {'subtitles': []}
        url = 'http://127.0.0.1/private' if os.environ.get('CASE') == 'bad-host' else 'https://aisubtitle.hdslb.com/bfs/fixture.json'
        return {'subtitles': [{'lan': 'ai-zh', 'subtitle_url': url}]}
class video: Video = Video
''', encoding='utf-8')
(home / 'aiohttp.py').write_text('''
import json, os
class Content:
    async def iter_chunked(self, size):
        text = '动画制作的连续帧方法。' * (2000 if os.environ.get('CASE') == 'long' else 1)
        yield json.dumps({'body': [{'content': text}]}).encode()
class Response:
    status = 200
    content = Content()
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass
class ClientTimeout:
    def __init__(self, **kwargs): pass
class ClientSession:
    def __init__(self, **kwargs): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass
    def get(self, url, **kwargs):
        assert url == 'https://aisubtitle.hdslb.com/bfs/fixture.json'
        assert kwargs == {'allow_redirects': False}
        return Response()
''', encoding='utf-8')
for case in ['success', 'long', 'missing', 'bad-host', 'mismatch', 'invalid']:
    env = {**os.environ, 'CASE': case, 'PYTHONPATH': str(home)}
    result = subprocess.run([sys.executable, '-X', 'utf8', str(entry)], input=json.dumps({'bvid': '../../config' if case == 'invalid' else 'BV1234567890'}), text=True, encoding='utf-8', capture_output=True, env=env, timeout=10)
    assert 'fixture-cookie' not in result.stdout and 'fixture-csrf' not in result.stdout
    data = json.loads(result.stdout)
    if case in ['success', 'long']:
        assert result.returncode == 0 and data['ok'] and data['bvid'] == 'BV1234567890'
        assert '连续帧' in data['note'] and data['truncated'] == (case == 'long')
        assert len(data['note']) < 18000
    else:
        assert result.returncode != 0 and data == {'ok': False, 'error': 'Video content unavailable'}
print('PASS real Python reader with isolated SDK/CDN fixtures: exact video ID, preferred subtitles, truncation, fixed CDN/no redirects, missing content and credential-safe failures; no network or model calls')
