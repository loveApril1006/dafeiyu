"""最简用法：零配置自动识别认证。

运行前先完成任一登录准备（二选一）：
  A. qzone login --save   （推荐，扫码一次即可）
  B. 设置环境变量 QZONE_COOKIE / QZONE_UIN
  否则会回退到本地 NapCat（ws://localhost:3001）。

用法：python examples/quickstart.py
"""
import asyncio

from qzone_sdk import QZoneClient


async def main():
    # QZoneClient() 自动解析认证：环境变量 Cookie → 凭证文件 → NapCat
    client = QZoneClient()

    result = await client.publish("Hello from qzone-sdk!")
    print("发布结果:", result)

    feeds = await client.get_feed_list(count=5)
    for f in feeds:
        name = f.get("nickname") or f.get("remark")
        print(f"[{f.get('appid_name')}] {name}: {f.get('content', '')[:40]}")


if __name__ == "__main__":
    asyncio.run(main())
