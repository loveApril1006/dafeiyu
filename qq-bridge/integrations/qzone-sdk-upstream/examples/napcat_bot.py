"""NapCat 集成示例：复用已有 NapCat 的登录态，无需手动管理 Cookie。

前提：本机 NapCat 已登录运行（默认 ws://localhost:3001），
且已安装 websockets：pip install "qzone-sdk[napcat]"

用法：python examples/napcat_bot.py
"""
import asyncio

from qzone_sdk import NapCatAuthProvider, QZoneClient, QZoneConfig


async def main():
    client = QZoneClient(
        QZoneConfig(auth_provider=NapCatAuthProvider(ws_url="ws://localhost:3001"))
    )

    # 每次操作自动从 NapCat 获取最新 Cookie，无需手动刷新
    result = await client.publish("来自 QQ 机器人的自动发布")
    print("发布结果:", result)

    moods = await client.get_friend_moods("123456789", num=3)
    for m in moods:
        print(f"[{m.get('createTime')}] {m.get('content', '')[:40]}")


if __name__ == "__main__":
    asyncio.run(main())
