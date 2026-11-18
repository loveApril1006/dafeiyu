"""Private JSON adapter for the MIT pond Bilibili backend. No DSH plugin is loaded."""
import asyncio
import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import sys

async def main():
    request = json.loads(sys.stdin.read(200000))
    if request.get('action') == 'qr':
        import qrcode
        output = io.BytesIO()
        qrcode.make(request['url']).save(output, format='PNG')
        return {'image': 'data:image/png;base64,' + base64.b64encode(output.getvalue()).decode()}
    root = Path(__file__).resolve().parent
    source = root.parent / 'integrations/bili-pond-upstream/vendor/bilibili-mcp/mcp_server.py'
    os.environ['BILI_MCP_TOOLS'] = '__none__'
    spec = importlib.util.spec_from_file_location('pond_backend', source)
    backend = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(backend)
    backend.CRED_FILE = root / 'bilibili-data/bili_credential.json'
    allowed = {
        'search': backend.bili_search,
        'info': backend.bili_video_info,
        'subtitle': backend.bili_subtitle,
        'comments': backend.bili_comments,
        'reply': backend.bili_reply,
        'check': backend.bili_check_credential,
    }
    action = request['action']
    if action not in allowed:
        raise ValueError('Unsupported Bilibili action')
    result = await allowed[action](**request.get('args', {}))
    return json.loads(result) if isinstance(result, str) else result

try:
    result = asyncio.run(main())
    print(json.dumps({'ok': True, 'data': result}, ensure_ascii=False))
except Exception as error:
    # Exceptions may contain cookies or local paths. Return only the type to the UI.
    print(json.dumps({'ok': False, 'error': type(error).__name__}, ensure_ascii=False))
    sys.exit(1)
