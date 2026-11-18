import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    source=Path(__file__).resolve().parents[1]/'integrations/bili-pond-upstream/lib/shared-save-mcp.py'
    with tempfile.TemporaryDirectory(prefix='shared-mcp-') as folder:
        home=Path(folder);records=home/'shared-reads';records.mkdir();task_id='12345678-1234-1234-1234-123456789012'
        (records/(task_id+'.task.json')).write_text(json.dumps({'id':task_id,'bvid':'BV1234567890','page':1,'remember':False}),encoding='utf-8')
        (records/(task_id+'.evidence.json')).write_text(json.dumps({'taskId':task_id,'bvid':'BV1234567890','page':1,'title':'离线测试','text':'实际字幕','sampled':False}),encoding='utf-8')
        params=StdioServerParameters(command=sys.executable,args=['-X','utf8',str(source)],env={**os.environ,'BILI_DUTY_HOME':str(home),'BILI_SHARED_TASK_ID':task_id})
        async with stdio_client(params) as (read,write):
            async with ClientSession(read,write) as session:
                await session.initialize()
                tools=await session.list_tools()
                assert [t.name for t in tools.tools]==['bili_shared_save'],[t.name for t in tools.tools]
                result=await session.call_tool('bili_shared_save',{'summary':'这是真实字幕的离线摘要。'})
                assert not result.isError
                result=await session.call_tool('bili_shared_save',{'summary':'不能重复覆盖保存'})
                data=json.loads((records/(task_id+'.result.json')).read_text(encoding='utf-8'))
                assert data['summary']=='这是真实字幕的离线摘要。' and not data['memorySaved']
                forbidden=await session.call_tool('bili_reply',{'text':'禁止的写操作'})
                assert forbidden.isError
    print('PASS real stdio MCP only exposes bili_shared_save, idempotent on repeated calls, platform interaction tools unavailable; no model/network/QQ calls')
asyncio.run(main())
