"""The shared-video model gets exactly one local-save tool, no platform writes."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone


def paths(home, task_id):
    if not re.fullmatch(r'[a-f0-9-]{36}', task_id):
        raise ValueError('Invalid task ID')
    base = Path(home) / 'shared-reads'
    return [base / (task_id + '.' + suffix + '.json') for suffix in ('task', 'evidence', 'result')]


def write(file, value):
    temporary = file.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    os.replace(temporary, file)


def memory_request(home, body):
    source = Path(home) / 'mcp_server.py'
    os.environ['BILI_MCP_TOOLS'] = '__none__'
    spec = importlib.util.spec_from_file_location('shared_memory_bridge', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not module._xiaoge_memory_enabled():
        return {'ok': False, 'disabled': True}
    raw = module._xiaoge_memory_request('append', body)
    return json.loads(raw) if isinstance(raw, str) else raw


def save_result(home, task_id, summary, memory_write=memory_request):
    task_file, evidence_file, result_file = paths(home, task_id)
    task = json.loads(task_file.read_text(encoding='utf-8'))
    evidence = json.loads(evidence_file.read_text(encoding='utf-8'))
    if task.get('id') != task_id or evidence.get('taskId') != task_id or task.get('bvid') != evidence.get('bvid') or task.get('page', 1) != evidence.get('page'):
        raise ValueError('Shared read evidence mismatch')
    if result_file.exists():
        previous = json.loads(result_file.read_text(encoding='utf-8'))
        if previous.get('taskId') == task_id and previous.get('bvid') == task['bvid']:
            return previous
        raise ValueError('Unexpected existing result')
    has_transcript = bool(evidence.get('text', '').strip())
    summary = str(summary).strip()[:1600]
    if has_transcript and not summary:
        raise ValueError('Summary is empty')
    if not has_transcript:
        summary = '只读取到视频标题、简介等信息，没有可用字幕，不能判断视频过程。' + str(evidence.get('warning', ''))
    for pattern in (r'sk-[a-zA-Z0-9_-]{12,}', r'(?:SESSDATA|bili_jct|api_key|access_token|password)\s*[=:]\s*[^\s,;]+'):
        summary = re.sub(pattern, '[已隐去]', summary, flags=re.I)
    scope = ('部分音频转写，非全程观看，识别可能有误' if evidence.get('source') == 'audio-sample' else '字幕采样，非全程观看') if evidence.get('sampled') else '已读取可用字幕' if has_transcript else '仅视频信息，未读到内容'
    result = {key: evidence.get(key) for key in ('bvid', 'page', 'url', 'title', 'part', 'author', 'duration', 'pic', 'sampled', 'totalChars')}
    result.update(taskId=task_id, at=datetime.now(timezone.utc).isoformat(), summary=summary, scope=scope,
                  hasTranscript=has_transcript, charsRead=len(evidence.get('text', '')), memorySaved=False, historySaved=False,
                  memorySkipped=not task.get('remember', True))
    if evidence.get('source') == 'audio-sample':
        result['audioWindows'] = evidence.get('audioWindows', [])
        result['source'] = 'audio-sample'
    if task.get('remember', True):
        try:
            reply = memory_write(home, {'id': 'shared-' + task_id, 'text': (str(evidence.get('title', '')) + '。' + scope + '。' + summary)[:950],
                                      'bvid': task['bvid'], 'chain': 'QQ分享视频', 'reason': '用户分享的指定视频，' + scope})
            result['memorySaved'] = bool(reply.get('ok') and reply.get('record', {}).get('id'))
            result['memorySkipped'] = bool(reply.get('disabled'))
        except Exception:
            result['memoryWarning'] = '记忆暂未保存，保留阅读结果；没有自动重复调用模型'
    write(result_file, result)
    return result


if __name__ == '__main__':
    home, task_id = Path(os.environ['BILI_DUTY_HOME']), os.environ['BILI_SHARED_TASK_ID']
    if '--metadata-only' in sys.argv:
        try:
            result = save_result(home, task_id, '')
            print(json.dumps({'ok': True, 'memorySaved': result['memorySaved']}))
        except Exception as error:
            print(json.dumps({'ok': False, 'error': type(error).__name__}))
            sys.exit(1)
    else:
        from mcp.server.fastmcp import FastMCP
        mcp = FastMCP('bilibili-shared-save')

        @mcp.tool()
        async def bili_shared_save(summary: str) -> str:
            """保存本次指定视频的真实字幕总结、历史与长期记忆；不能更换视频或进行平台互动。"""
            try:
                result = await asyncio.to_thread(save_result, home, task_id, summary)
                return json.dumps({'ok': True, 'bvid': result['bvid'], 'scope': result['scope'], 'memorySaved': result['memorySaved']}, ensure_ascii=False)
            except Exception as error:
                return json.dumps({'ok': False, 'error': type(error).__name__})

        mcp.run(transport='stdio')
