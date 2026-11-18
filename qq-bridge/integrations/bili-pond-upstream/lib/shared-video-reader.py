"""Read the exact shared video. No comments, likes, messages or video downloads."""
import asyncio
import bisect
import json
import os
from pathlib import Path
import re
import sys

def safe_audio_url(value):
    from urllib.parse import urlparse
    parsed=urlparse(str(value))
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port or not (parsed.hostname or '').endswith(('.bilivideo.com','.bilivideo.cn')):
        raise ValueError('Unsupported audio host')
    return value


def task_files(home, task_id):
    if not re.fullmatch(r'[a-f0-9-]{36}', task_id):
        raise ValueError('Invalid task ID')
    base = Path(home) / 'shared-reads'
    return base / (task_id + '.task.json'), base / (task_id + '.evidence.json')


def sample_captions(body, maximum=12000):
    maximum = min(20000, max(2000, int(maximum)))
    rows = []
    for item in body[:50000]:
        text = str(item.get('content', '')).replace('\x00', '').strip()
        if text:
            stamp = max(0, int(float(item.get('from', 0))))
            rows.append((stamp, text))
    total = sum(len(text) for _, text in rows)
    def line(row):
        stamp, text = row
        return f'[{stamp//3600:02d}:{stamp//60%60:02d}:{stamp%60:02d}] {text}'
    full = '\n'.join(map(line, rows))
    if len(full) <= maximum:
        return {'text': full, 'sampled': False, 'totalChars': total, 'segments': len(rows)}
    cumulative = [0]
    for _, text in rows:
        cumulative.append(cumulative[-1] + len(text))
    chosen = {}
    windows = 12
    budget = max(80, (maximum - 300) // windows)
    for n in range(windows):
        position = (max(0, total - budget) * n) // (windows - 1)
        index = max(0, min(len(rows) - 1, bisect.bisect_right(cumulative, position) - 1))
        used = 0
        while index < len(rows) and used < budget:
            value = line(rows[index])[:max(0, budget - used)]
            chosen[index] = value
            used += len(value) + 1
            index += 1
    text = '\n'.join(chosen[index] for index in sorted(chosen))[:maximum]
    return {'text': text, 'sampled': True, 'totalChars': total, 'segments': len(rows)}


async def read_video(home, task):
    from bilibili_api import Credential, video
    import aiohttp
    credential_file = Path(home) / 'bili_credential.json'
    if not credential_file.is_file() or credential_file.stat().st_size > 16384:
        raise ValueError('B站尚未登录')
    data = json.loads(credential_file.read_text(encoding='utf-8-sig'))
    credential = Credential(**{key: data.get(key) for key in ('sessdata', 'bili_jct', 'buvid3', 'dedeuserid', 'ac_time_value') if data.get(key)})
    if not await asyncio.wait_for(credential.check_valid(), 25):
        raise ValueError('B站登录已失效')
    target = video.Video(bvid=task['bvid'], credential=credential)
    info = await asyncio.wait_for(target.get_info(), 30)
    pages = info.get('pages') or []
    page = int(task.get('page', 1))
    if page < 1 or page > len(pages):
        raise ValueError('没有这个视频分P')
    current = pages[page - 1]
    result = {'taskId': task['id'], 'bvid': task['bvid'], 'page': page,
              'url': 'https://www.bilibili.com/video/' + task['bvid'] + (f'?p={page}' if page > 1 else ''),
              'title': str(info.get('title') or task['bvid'])[:200],
              'part': str(current.get('part') or '')[:120], 'author': str(info.get('owner', {}).get('name') or '')[:80],
              'description': str(info.get('desc') or '')[:700], 'duration': max(0, int(current.get('duration') or info.get('duration') or 0)),
              'pic': str(info.get('pic') or '')[:500], 'text': '', 'sampled': False, 'totalChars': 0, 'segments': 0,
              'warning': '没有可用字幕，仅记录视频信息；没有下载或假装看完视频'}
    async def audio_fallback():
        if task.get('transcribe') and not result['text']:
            try:
                data=await asyncio.wait_for(target.get_download_url(cid=current['cid']),25)
                candidates=(data.get('dash') or {}).get('audio') or []
                for audio in sorted(candidates,key=lambda a:int(a.get('bandwidth') or 99999999)):
                    urls=list(audio.get('backupUrl') or audio.get('backup_url') or [])+[audio.get('baseUrl') or audio.get('base_url')]
                    for url in urls:
                        try:result['audioUrl']=safe_audio_url(url);break
                        except (ValueError,TypeError):pass
                    if result.get('audioUrl'):break
                if not result.get('audioUrl'):raise ValueError('No supported audio CDN')
            except Exception:
                result['warning']='没有字幕，音频暂不可读，仅记录视频信息'
        return result
    try:
        subtitles = (await asyncio.wait_for(target.get_subtitle(cid=current['cid']), 25)).get('subtitles') or []
        if not subtitles:
            return await audio_fallback()
        selected = next((s for s in subtitles if s.get('lan') in ('ai-zh', 'zh-CN', 'zh')), subtitles[0])
        url = str(selected.get('subtitle_url') or '')
        if url.startswith('//'):
            url = 'https:' + url
        # Subtitle URLs are supplied by the official video API, never by the user.
        from urllib.parse import urlparse
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port or not (parsed.hostname or '').endswith(('.hdslb.com', '.biliimg.com')):
            raise ValueError('Unsupported subtitle host')
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
            async with session.get(url, allow_redirects=False) as response:
                if response.status != 200:
                    raise ValueError('Subtitle unavailable')
                chunks, size = [], 0
                async for chunk in response.content.iter_chunked(65536):
                    size += len(chunk)
                    if size > 4 * 1024 * 1024:
                        raise ValueError('Subtitle too large')
                    chunks.append(chunk)
                body = json.loads(b''.join(chunks)).get('body') or []
        result.update(sample_captions(body, task.get('maxChars', 12000)))
        result['warning'] = '仅阅读均匀采样的字幕片段，不代表全程观看' if result['sampled'] else ''
        if not result['text']:
            result['warning'] = '字幕为空，仅记录视频信息，不能判断视频具体过程'
    except Exception:
        result['warning'] = '字幕暂时无法读取，仅记录视频信息；未生成视频内容总结'
    return await audio_fallback()


def atomic(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    temp = file.with_suffix(file.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    os.replace(temp, file)


if __name__ == '__main__':
    try:
        home = Path(os.environ['BILI_DUTY_HOME'])
        task_id = os.environ['BILI_SHARED_TASK_ID']
        task_file, evidence_file = task_files(home, task_id)
        task = json.loads(task_file.read_text(encoding='utf-8'))
        if task.get('id') != task_id or not re.fullmatch(r'BV[a-zA-Z0-9]{10}', task.get('bvid', '')):
            raise ValueError('Invalid video task')
        result = asyncio.run(read_video(home, task))
        atomic(evidence_file, result)
        print(json.dumps({'ok': True, 'hasTranscript': bool(result['text']), 'sampled': result['sampled'], 'chars': len(result['text'])}))
    except Exception as error:
        # Never serialize upstream exception messages: they can contain cookies.
        print(json.dumps({'ok': False, 'error': type(error).__name__}))
        sys.exit(1)
