"""Read-only video/subtitle adapter; no comments, likes, tools or model calls."""
import asyncio
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

async def main():
    req = json.loads(sys.stdin.read(2000))
    bvid = str(req.get('bvid', ''))
    if not re.fullmatch(r'BV[a-zA-Z0-9]{10}', bvid):
        raise ValueError('Invalid video id')
    from bilibili_api import video, Credential
    import aiohttp
    root = Path(__file__).resolve().parent
    credential = None
    for directory in ['bili-native-data', 'bilibili-data']:
        try:
            c = json.loads((root / directory / 'bili_credential.json').read_text(encoding='utf-8-sig'))
            sessdata = c.get('sessdata') or c.get('SESSDATA')
            if not sessdata or not c.get('bili_jct'):
                continue
            credential = Credential(sessdata=sessdata, bili_jct=c['bili_jct'], dedeuserid=c.get('dedeuserid') or c.get('DedeUserID'), buvid3=c.get('buvid3'), buvid4=c.get('buvid4'))
            break
        except (OSError, ValueError):
            continue
    if credential is None:
        raise ValueError('Login required')
    v = video.Video(bvid=bvid, credential=credential)
    info = await v.get_info()
    if info.get('bvid') != bvid:
        raise ValueError('Video mismatch')
    cid = info.get('cid') or (info.get('pages') or [{}])[0].get('cid')
    subtitles = (await v.get_subtitle(cid=cid)).get('subtitles', [])
    if not subtitles:
        raise ValueError('No subtitles')
    selected = next((s for s in subtitles if s.get('lan') in ['ai-zh', 'zh-CN', 'zh']), subtitles[0])
    url = selected.get('subtitle_url', '')
    if url.startswith('//'):
        url = 'https:' + url
    u = urlsplit(url)
    if u.scheme != 'https' or u.hostname not in ['aisubtitle.hdslb.com', 'i0.hdslb.com', 'i1.hdslb.com', 'i2.hdslb.com', 'subtitle.bilibili.com'] or u.port or u.username or u.password:
        raise ValueError('Unexpected subtitle host')
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as client:
        async with client.get(url, allow_redirects=False) as response:
            if response.status != 200:
                raise ValueError('Subtitle unavailable')
            body = bytearray()
            async for part in response.content.iter_chunked(32768):
                body.extend(part)
                if len(body) > 2000000:
                    raise ValueError('Subtitle too large')
            data = json.loads(body)
    text = '\n'.join(str(row.get('content', '')) for row in data.get('body', []))
    if not text.strip():
        raise ValueError('Empty subtitles')
    truncated = len(text) > 16000
    note = '视频标题：' + str(info.get('title', bvid))[:120] + '\n字幕：\n' + text[:16000]
    if truncated:
        note += '\n[字幕过长，内容已截断；点评只能依据这部分字幕。]'
    return {'ok': True, 'bvid': bvid, 'title': info.get('title', bvid), 'note': note, 'truncated': truncated}

try:
    print(json.dumps(asyncio.run(main()), ensure_ascii=False))
except Exception:
    # SDK errors can contain cookies or private paths; never pass them onward.
    print(json.dumps({'ok': False, 'error': 'Video content unavailable'}))
    sys.exit(1)
